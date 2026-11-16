import { renderHook, act, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import type { InspectResult } from '../extension/protocol';
import type { RecordNote } from '../utils/recordNote';
import type { PimsTransport } from '../utils/pims/extensionBridge';
import { effectiveMap } from '../utils/pims/mapping';

vi.mock('./usePimsFieldMap', () => ({
  usePimsFieldMap: () => ({ map: effectiveMap(null), save: async () => {}, reset: async () => {} }),
}));
vi.mock('../utils/supabaseClient', () => ({ supabase: null, cloudEnabled: false }));
vi.mock('../utils/edgeFunctions', () => ({ markPimsSent: vi.fn(async () => ({ sentAt: '2026-11-15T10:00:00Z' })) }));
const dialogs = vi.hoisted(() => ({ confirm: vi.fn(async (_o: unknown) => true) }));
vi.mock('../components/ui/dialogs', () => ({ confirmDialog: dialogs.confirm, toast: vi.fn() }));
vi.mock('../utils/clipboard', () => ({ copyRichText: vi.fn(async () => 'rich') }));

import { usePimsSend } from './usePimsSend';

const info: InspectResult = {
  tab: { id: 7, title: 'Consult' },
  candidates: 1,
  status: { state: 'writable', patientName: 'Bella Smith', patientNumber: null, consult: { viewId: '3', recordId: '4521' } },
  fields: [
    { title: 'Plan', kind: 'note', acceptsImage: false },
    { title: 'Discharge Summary', kind: 'dischargeSummary', acceptsImage: true },
  ],
};

const note: RecordNote = { sections: [{ key: 'treatment', heading: 'Treatment report', lines: ['Done'] }] };

function setup(opts: { patientMatcher?: (c: string, e: string | null) => boolean } = {}) {
  const calls: string[] = [];
  const transport: PimsTransport = {
    ping: vi.fn(async () => { calls.push('ping'); return { version: '1.0.0' }; }),
    inspect: vi.fn(async () => { calls.push('inspect'); return info; }),
    send: vi.fn(async () => {
      calls.push('send');
      return { ok: true as const, results: [{ fieldTitle: 'Plan', result: { ok: true as const } }] };
    }),
    diagnose: vi.fn(async () => null),
    appointments: vi.fn(),
    startChart: vi.fn(),
    takePendingPatient: vi.fn(),
  };
  const picture = vi.fn(async () => 'data:image/png;base64,AAAA');
  const onSent = vi.fn();
  const hook = renderHook(() => usePimsSend({
    transport, note, stored: null, chartSnapshotPicture: picture, hasChartPicture: true,
    chartId: null, patientName: 'Bella', sentAt: null, onSent, ...opts,
  }));
  return { transport, calls, picture, onSent, hook };
}

describe('usePimsSend', () => {
  it('calls the injected transport for ping, then inspect, then send', async () => {
    const { calls, picture, onSent, hook } = setup();
    await waitFor(() => expect(hook.result.current.phase.kind).toBe('ready'));
    await act(async () => { await hook.result.current.doSend(); });
    // Send looks again before anything else, so a consult switch is caught.
    expect(calls).toEqual(['ping', 'inspect', 'inspect', 'send']);
    expect(hook.result.current.phase.kind).toBe('results');
    expect(onSent).toHaveBeenCalledTimes(1);
    // The default map sends the chart picture to Discharge Summary, which accepts images.
    expect(picture).toHaveBeenCalledTimes(1);
  });

  it('renders the chart picture only when the chart row targets a field', async () => {
    const { transport, picture, hook } = setup();
    await waitFor(() => expect(hook.result.current.phase.kind).toBe('ready'));
    act(() => hook.result.current.choose('chart', ''));
    await act(async () => { await hook.result.current.doSend(); });
    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(picture).not.toHaveBeenCalled();
  });

  it('a picture callback that returns null for a targeted chart row is reported as picture_failed', async () => {
    const { transport, picture, hook } = setup();
    picture.mockResolvedValue(null as never);
    await waitFor(() => expect(hook.result.current.phase.kind).toBe('ready'));
    await act(async () => { await hook.result.current.doSend(); });
    const phase = hook.result.current.phase;
    expect(phase.kind).toBe('results');
    if (phase.kind !== 'results') return;
    expect(phase.rows).toContainEqual({ fieldTitle: 'Chart picture', code: 'picture_failed' });
    // The rest still went.
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it('uses the patient matcher it is given for the mismatch confirmation', async () => {
    dialogs.confirm.mockClear();
    const strict = vi.fn(() => false);
    const { hook } = setup({ patientMatcher: strict });
    await waitFor(() => expect(hook.result.current.phase.kind).toBe('ready'));
    await act(async () => { await hook.result.current.doSend(); });
    expect(strict).toHaveBeenCalledWith('Bella', 'Bella Smith');
    expect(dialogs.confirm).toHaveBeenCalledTimes(1);
    expect((dialogs.confirm.mock.calls[0][0] as { title: string }).title).toBe('Different patient?');
  });

  it('a quiet refresh: an older inspect landing last is ignored', async () => {
    const { transport, hook } = setup();
    await waitFor(() => expect(hook.result.current.phase.kind).toBe('ready'));
    const max: InspectResult = { ...info, status: { ...info.status!, patientName: 'Max' } };
    let resolveSlow!: (r: InspectResult) => void;
    vi.mocked(transport.inspect)
      .mockImplementationOnce(() => new Promise<InspectResult>((r) => { resolveSlow = r; }))
      .mockImplementationOnce(async () => info);
    let slow!: Promise<void>;
    act(() => { slow = hook.result.current.refreshTarget(); });
    await act(async () => { await hook.result.current.refreshTarget(); });
    await act(async () => { resolveSlow(max); await slow; });
    const phase = hook.result.current.phase;
    expect(phase.kind === 'ready' && phase.info.status?.patientName).toBe('Bella Smith');
    expect(hook.result.current.changedTarget).toBe(false);
  });

  it('a quiet refresh back to the consult seen at load clears the notice', async () => {
    const { transport, hook } = setup();
    await waitFor(() => expect(hook.result.current.phase.kind).toBe('ready'));
    const max: InspectResult = { ...info, status: { ...info.status!, patientName: 'Max' } };
    vi.mocked(transport.inspect).mockResolvedValueOnce(max);
    await act(async () => { await hook.result.current.refreshTarget(); });
    expect(hook.result.current.changedTarget).toBe(true);
    vi.mocked(transport.inspect).mockResolvedValueOnce(info);
    await act(async () => { await hook.result.current.refreshTarget(); });
    expect(hook.result.current.changedTarget).toBe(false);
  });
});
