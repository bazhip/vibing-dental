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
vi.mock('../components/ui/dialogs', () => ({ confirmDialog: vi.fn(async () => true), toast: vi.fn() }));
vi.mock('../utils/clipboard', () => ({ copyRichText: vi.fn(async () => 'rich') }));

import { usePimsSend } from './usePimsSend';

const info: InspectResult = {
  tab: { id: 7, title: 'Consult' },
  candidates: 1,
  status: { state: 'writable', patientName: 'Bella Smith', consult: { viewId: '3', recordId: '4521' } },
  fields: [
    { title: 'Plan', kind: 'note', acceptsImage: false },
    { title: 'Discharge Summary', kind: 'dischargeSummary', acceptsImage: true },
  ],
};

const note: RecordNote = { sections: [{ key: 'treatment', heading: 'Treatment report', lines: ['Done'] }] };

function setup() {
  const calls: string[] = [];
  const transport: PimsTransport = {
    ping: vi.fn(async () => { calls.push('ping'); return { version: '1.0.0' }; }),
    inspect: vi.fn(async () => { calls.push('inspect'); return info; }),
    send: vi.fn(async () => {
      calls.push('send');
      return { ok: true as const, results: [{ fieldTitle: 'Plan', result: { ok: true as const } }] };
    }),
    diagnose: vi.fn(async () => null),
  };
  const picture = vi.fn(async () => 'data:image/png;base64,AAAA');
  const onSent = vi.fn();
  const hook = renderHook(() => usePimsSend({
    transport, note, stored: null, chartSnapshotPicture: picture, hasChartPicture: true,
    chartId: null, patientName: 'Bella', sentAt: null, onSent,
  }));
  return { transport, calls, picture, onSent, hook };
}

describe('usePimsSend', () => {
  it('calls the injected transport for ping, then inspect, then send', async () => {
    const { calls, picture, onSent, hook } = setup();
    await waitFor(() => expect(hook.result.current.phase.kind).toBe('ready'));
    await act(async () => { await hook.result.current.doSend(); });
    expect(calls).toEqual(['ping', 'inspect', 'send']);
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
});
