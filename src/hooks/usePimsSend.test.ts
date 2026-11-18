import { renderHook, act, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import type { InspectResult } from '../extension/protocol';
import type { RecordNote } from '../utils/recordNote';
import type { PimsTransport } from '../utils/pims/extensionBridge';
import type { SelectedImageTransfer } from '../utils/pims/images';
import type { ImageTransferResult } from '../utils/pims/imageTransfer';
import { effectiveMap } from '../utils/pims/mapping';
import { DONT_SEND } from '../utils/pims/rowChoice';

vi.mock('./usePimsFieldMap', () => ({
  usePimsFieldMap: (provider?: import('../extension/pims/types').PimsId, fields?: import('../utils/pims/mapping').FieldInfo[]) => ({ map: effectiveMap(null, provider, fields), save: async () => {}, reset: async () => {} }),
}));
vi.mock('../utils/supabaseClient', () => ({ supabase: null, cloudEnabled: false }));
vi.mock('../utils/edgeFunctions', () => ({ markPimsSent: vi.fn(async () => ({ sentAt: '2026-11-15T10:00:00Z' })) }));
const dialogs = vi.hoisted(() => ({ confirm: vi.fn(async (_o: unknown) => true) }));
vi.mock('../components/ui/dialogs', () => ({ confirmDialog: dialogs.confirm, toast: vi.fn() }));
vi.mock('../utils/clipboard', () => ({ copyRichText: vi.fn(async () => 'rich') }));

import { usePimsSend } from './usePimsSend';
import { markPimsSent } from '../utils/edgeFunctions';

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

function setup(
  opts: { patientMatcher?: (c: string, e: string | null) => boolean; patientNumber?: string; inspected?: InspectResult; savedImage?: SelectedImageTransfer | null; chartId?: string | null } = {},
) {
  const { inspected = info, ...hookOpts } = opts;
  const calls: string[] = [];
  const transport: PimsTransport = {
    ping: vi.fn(async () => { calls.push('ping'); return { version: '1.0.0', protocol: 1, capabilities: ['inspect', 'send', 'diagnose'] }; }),
    inspect: vi.fn(async () => { calls.push('inspect'); return inspected; }),
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
  const hook = renderHook(({ activeChartId }: { activeChartId: string | null }) => usePimsSend({
    transport, note, stored: null, chartSnapshotPicture: picture, hasChartPicture: true,
    patientName: 'Bella', patientNumber: '', sentAt: null, onSent, ...hookOpts, chartId: activeChartId,
  }), { initialProps: { activeChartId: hookOpts.chartId ?? null } });
  return { transport, calls, picture, onSent, hook };
}

describe('usePimsSend', () => {
  it('does not apply a lost-send result to a different chart', async () => {
    const { hook, transport, onSent } = setup({ chartId: 'chart' });
    await waitFor(() => expect(hook.result.current.phase.kind).toBe('ready'));
    let rejectSend!: (error: unknown) => void;
    vi.mocked(transport.send).mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectSend = reject; }));
    let sending!: Promise<void>;
    act(() => { sending = hook.result.current.doSend(); });
    await waitFor(() => expect(transport.send).toHaveBeenCalledOnce());
    hook.rerender({ activeChartId: 'other' });
    await act(async () => { rejectSend({ code: 'extension_error' }); await sending; });
    expect(onSent).not.toHaveBeenCalled();
    expect(hook.result.current.lastSentAt).toBeNull();
    expect(hook.result.current.phase.kind).toBe('ready');
  });
  it('does not apply a delayed send stamp after unmount', async () => {
    const { hook, onSent } = setup({ chartId: 'chart' });
    await waitFor(() => expect(hook.result.current.phase.kind).toBe('ready'));
    let resolveStamp!: (value: { sentAt: string }) => void;
    vi.mocked(markPimsSent).mockImplementationOnce(() => new Promise(resolve => { resolveStamp = resolve; }));
    let sending!: Promise<void>;
    act(() => { sending = hook.result.current.doSend(); });
    await waitFor(() => expect(resolveStamp).toBeTypeOf('function'));
    hook.unmount();
    await act(async () => { resolveStamp({ sentAt: '2026-11-17T10:00:00Z' }); await sending; });
    expect(onSent).not.toHaveBeenCalled();
  });
  it('does not offer saved-image transfer for non-ezyVet providers', async () => {
    const savedImage = { chartId: 'chart', render: vi.fn() };
    const { hook } = setup({ savedImage, chartId: 'chart', inspected: { ...info, status: { ...info.status!, provider: 'shepherd' } } });
    await waitFor(() => expect(hook.result.current.phase.kind).toBe('ready'));
    expect(hook.result.current.rows.some(row => row.key === 'attachment')).toBe(false);
  });
  it('sends a reviewed saved image separately from the chart picture with an explicit destination', async () => {
    const savedImage = { chartId: 'chart', render: vi.fn(), dispatch: vi.fn(async (): Promise<ImageTransferResult> => ({ state: 'confirmed', attempt_id: 'attempt', resource_id: 'file' })) };
    const { hook, transport } = setup({ savedImage, chartId: 'chart' });
    await waitFor(() => expect(hook.result.current.phase.kind).toBe('ready'));
    expect(hook.result.current.rows.find(row => row.key === 'attachment')?.wanted).toBeNull();
    act(() => hook.result.current.choose('attachment', 'Discharge Summary'));
    await act(async () => { await hook.result.current.doSend(); });
    expect(savedImage.dispatch).toHaveBeenCalledWith('Discharge Summary', expect.any(Function));
    expect(savedImage.render).not.toHaveBeenCalled();
    const request = vi.mocked(transport.send).mock.calls[0][0];
    expect(request.items.filter(item => item.pngDataUrl)).toHaveLength(1);
  });
  it('does not send any fields when a selected saved image cannot be reauthorized', async () => {
    const savedImage = { chartId: 'chart', render: vi.fn(), dispatch: vi.fn(async (): Promise<ImageTransferResult> => ({ state: 'blocked' })) };
    const { hook, transport } = setup({ savedImage, chartId: 'chart' });
    await waitFor(() => expect(hook.result.current.phase.kind).toBe('ready'));
    act(() => hook.result.current.choose('attachment', 'Discharge Summary'));
    await act(async () => { await hook.result.current.doSend(); });
    expect(transport.send).not.toHaveBeenCalled();
    expect(hook.result.current.phase.kind).toBe('error');
  });
  describe.each(['patient_changed', 'not_writable', 'no_tab', 'extension_error', 'lost_response'] as const)('confirmed image followed by note %s', outcome => {
    it.each([false, true])('preserves confirmed success and finalizes bookkeeping with stamp failure=%s', async stampFailed => {
      const savedImage = { chartId: 'chart', render: vi.fn(), dispatch: vi.fn(async (): Promise<ImageTransferResult> => ({ state: 'confirmed', attempt_id: 'attempt', resource_id: 'file' })) };
      const { hook, transport, onSent, picture } = setup({ savedImage, chartId: 'chart' });
      await waitFor(() => expect(hook.result.current.phase.kind).toBe('ready'));
      act(() => {
        hook.result.current.choose('chart', DONT_SEND);
        hook.result.current.choose('attachment', 'Discharge Summary');
      });
      const stamp = vi.mocked(markPimsSent);
      stamp.mockClear();
      if (stampFailed) stamp.mockRejectedValueOnce({ code: 'stamp_failed' });
      if (outcome === 'lost_response') vi.mocked(transport.send).mockRejectedValueOnce({ code: 'extension_error' });
      else vi.mocked(transport.send).mockResolvedValueOnce({ ok: false, code: outcome });
      await act(async () => { await hook.result.current.doSend(); });
      expect(hook.result.current.phase).toMatchObject({ kind: 'results', stampFailed, rows: [
        { fieldTitle: 'Discharge Summary', code: null },
        { fieldTitle: 'Plan', code: outcome === 'lost_response' || outcome === 'no_tab' ? 'extension_error' : outcome },
      ] });
      expect(stamp).toHaveBeenCalledExactlyOnceWith('chart');
      expect(onSent).toHaveBeenCalledOnce();
      expect(hook.result.current.lastSentAt).toBe(onSent.mock.calls[0][0]);
      if (!stampFailed) expect(onSent).toHaveBeenCalledWith('2026-11-15T10:00:00Z');
      expect(savedImage.dispatch).toHaveBeenCalledOnce();
      expect(savedImage.render).not.toHaveBeenCalled();
      expect(picture).not.toHaveBeenCalled();
      expect(transport.send).toHaveBeenCalledOnce();
      expect(vi.mocked(transport.send).mock.calls[0][0].items).toEqual([
        expect.objectContaining({ fieldTitle: 'Plan', text: expect.any(String) }),
      ]);
      expect(vi.mocked(transport.send).mock.calls[0][0].items.some(item => item.pngDataUrl)).toBe(false);
    });
  });
  it.each(['patient_changed', 'lost_response'] as const)('keeps ordinary note-only %s behavior without stamping', async outcome => {
    const { hook, transport, onSent } = setup({ chartId: 'chart' });
    await waitFor(() => expect(hook.result.current.phase.kind).toBe('ready'));
    act(() => hook.result.current.choose('chart', DONT_SEND));
    vi.mocked(markPimsSent).mockClear();
    if (outcome === 'lost_response') vi.mocked(transport.send).mockRejectedValueOnce({ code: 'extension_error' });
    else vi.mocked(transport.send).mockResolvedValueOnce({ ok: false, code: outcome });
    await act(async () => { await hook.result.current.doSend(); });
    expect(hook.result.current.phase.kind).toBe('error');
    expect(markPimsSent).not.toHaveBeenCalled();
    expect(onSent).toHaveBeenCalledTimes(outcome === 'lost_response' ? 1 : 0);
  });
  it('prevents duplicate clicks and abandons an image when its chart changes during rendering', async () => {
    let resolveImage!: (value: ImageTransferResult) => void;
    const savedImage = { chartId: 'chart', render: vi.fn(), dispatch: vi.fn(() => new Promise<ImageTransferResult>(resolve => { resolveImage = resolve; })) };
    const { hook, transport } = setup({ savedImage, chartId: 'chart' });
    await waitFor(() => expect(hook.result.current.phase.kind).toBe('ready'));
    act(() => hook.result.current.choose('attachment', 'Discharge Summary'));
    let sending!: Promise<void>;
    act(() => { sending = hook.result.current.doSend(); void hook.result.current.doSend(); });
    await waitFor(() => expect(savedImage.dispatch).toHaveBeenCalledOnce());
    hook.rerender({ activeChartId: 'other' });
    await act(async () => { resolveImage({ state: 'unknown', attempt_id: 'attempt' }); await sending; });
    expect(transport.send).not.toHaveBeenCalled();
  });
  it('never treats an uncertain image as sent or bypasses its durable duplicate refusal', async () => {
    const savedImage = { chartId: 'chart', render: vi.fn(), dispatch: vi.fn(async (): Promise<ImageTransferResult> => ({ state: 'unknown', attempt_id: 'attempt' })) };
    const { hook, transport, onSent } = setup({ savedImage, chartId: 'chart' });
    await waitFor(() => expect(hook.result.current.phase.kind).toBe('ready'));
    act(() => hook.result.current.choose('attachment', 'Discharge Summary'));
    await act(async () => { await hook.result.current.doSend(); });
    expect(onSent).not.toHaveBeenCalled();
    expect(transport.send).not.toHaveBeenCalled();
    await act(async () => { await hook.result.current.load(); });
    savedImage.dispatch.mockResolvedValueOnce({ state: 'duplicate', attempt_id: 'attempt' });
    await act(async () => { await hook.result.current.doSend(); });
    expect(transport.send).not.toHaveBeenCalled();
    expect(onSent).not.toHaveBeenCalled();
    expect(savedImage.dispatch).toHaveBeenCalledTimes(2);
  });
  it('does not offer the legacy raw image path without a durable dispatcher', async () => {
    const { hook } = setup({ chartId: 'chart', savedImage: { chartId: 'chart', render: vi.fn() } });
    await waitFor(() => expect(hook.result.current.phase.kind).toBe('ready'));
    expect(hook.result.current.rows.some(row => row.key === 'attachment')).toBe(false);
  });
  it('never offers a saved image for another chart or a provider without image support', async () => {
    const savedImage = { chartId: 'other', render: vi.fn(async () => 'data:image/png;base64,AAAA') };
    const { hook } = setup({ savedImage, chartId: 'chart' });
    await waitFor(() => expect(hook.result.current.phase.kind).toBe('ready'));
    expect(hook.result.current.rows.some(row => row.key === 'attachment')).toBe(false);
    expect(savedImage.render).not.toHaveBeenCalled();
  });
  it('does not bypass patient confirmation using an unscoped number from another PIMS', async () => {
    dialogs.confirm.mockClear();
    dialogs.confirm.mockResolvedValueOnce(false);
    const max: InspectResult = { ...info, status: { ...info.status!, provider: 'daysmart', patientName: 'Max', patientNumber: '123' } };
    const { transport, hook } = setup({ patientNumber: '123', inspected: max });
    await waitFor(() => expect(hook.result.current.phase.kind).toBe('ready'));
    act(() => { hook.result.current.choose('treatment', 'Plan'); });
    await act(async () => { await hook.result.current.doSend(); });
    expect(dialogs.confirm).toHaveBeenCalledOnce();
    expect(transport.send).not.toHaveBeenCalled();
  });
  it('blocks a provider switch even when encounter and patient identifiers coincide', async () => {
    const { transport, hook } = setup();
    await waitFor(() => expect(hook.result.current.phase.kind).toBe('ready'));
    vi.mocked(transport.inspect).mockResolvedValue({ ...info, status: { ...info.status!, provider: 'daysmart' } });
    await act(async () => { await hook.result.current.doSend(); });
    expect(transport.send).not.toHaveBeenCalled();
    expect(hook.result.current.changedTarget).toBe(true);
  });

  it('clears unsaved destination choices when refreshing into a different provider', async () => {
    const { transport, hook } = setup();
    await waitFor(() => expect(hook.result.current.phase.kind).toBe('ready'));
    act(() => { hook.result.current.choose('treatment', 'Plan'); });
    vi.mocked(transport.inspect).mockResolvedValue({ ...info, status: { ...info.status!, provider: 'daysmart' } });
    await act(async () => { await hook.result.current.refreshTarget(); });
    expect(hook.result.current.rows.find((row) => row.key === 'treatment')?.wanted).toBeNull();
  });
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

  it.each([undefined, 'ezyvet', 'daysmart'] as const)('equal unscoped numbers require confirmation for mismatched names in %s', async (provider) => {
    dialogs.confirm.mockClear();
    dialogs.confirm.mockResolvedValueOnce(false);
    const max: InspectResult = { ...info, status: { ...info.status!, provider, patientName: 'Max Jones', patientNumber: '123' } };
    const { transport, hook } = setup({ patientNumber: '00123', inspected: max });
    await waitFor(() => expect(hook.result.current.phase.kind).toBe('ready'));
    act(() => hook.result.current.choose('treatment', 'Plan'));
    await act(async () => { await hook.result.current.doSend(); });
    expect(dialogs.confirm).toHaveBeenCalledOnce();
    expect(transport.send).not.toHaveBeenCalled();
  });

  it('different patient numbers ask with both numbers, even when the names match', async () => {
    dialogs.confirm.mockClear();
    dialogs.confirm.mockResolvedValueOnce(false);
    const other: InspectResult = { ...info, status: { ...info.status!, patientName: 'Bella', patientNumber: '124' } };
    const { transport, hook } = setup({ patientNumber: '123', inspected: other });
    await waitFor(() => expect(hook.result.current.phase.kind).toBe('ready'));
    await act(async () => { await hook.result.current.doSend(); });
    expect(dialogs.confirm).toHaveBeenCalledTimes(1);
    const opts = dialogs.confirm.mock.calls[0][0] as { title: string; message: string };
    expect(opts.title).toBe('Different patient?');
    expect(opts.message).toBe('The chart is for Bella (number 123), but PIMS shows Bella (number 124).');
    expect(transport.send).not.toHaveBeenCalled();
  });

  it('a chart without a number falls back to the name check and its message', async () => {
    dialogs.confirm.mockClear();
    const max: InspectResult = { ...info, status: { ...info.status!, patientName: 'Max', patientNumber: '123' } };
    const { hook } = setup({ patientNumber: '  ', inspected: max });
    await waitFor(() => expect(hook.result.current.phase.kind).toBe('ready'));
    await act(async () => { await hook.result.current.doSend(); });
    expect(dialogs.confirm).toHaveBeenCalledTimes(1);
    expect((dialogs.confirm.mock.calls[0][0] as { message: string }).message).not.toContain('number');
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

it('sends explicitly selected editor-compatibility images through the existing ezyVet writer', async () => {
  const savedImage = { chartId: 'chart', editorTransfer: true as const, render: vi.fn(async () => 'data:image/png;base64,AAAA') };
  const { hook, transport } = setup({ savedImage, chartId: 'chart' });
  await waitFor(() => expect(hook.result.current.phase.kind).toBe('ready'));
  expect(hook.result.current.rows.find(row => row.key === 'attachment')?.wanted).toBeNull();
  act(() => { hook.result.current.choose('attachment', 'Discharge Summary'); hook.result.current.choose('chart', DONT_SEND); });
  await act(async () => { await hook.result.current.doSend(); });
  expect(savedImage.render).toHaveBeenCalledOnce();
  expect(transport.send).toHaveBeenCalledWith(expect.objectContaining({ expectedPims: 'ezyvet',
    expectedConsult: info.status!.consult, items: expect.arrayContaining([{ fieldTitle: 'Discharge Summary', pngDataUrl: 'data:image/png;base64,AAAA' }]) }));
});
it('abandons editor compatibility writes when reviewed image validation fails', async () => {
  const savedImage = { chartId: 'chart', editorTransfer: true as const, render: vi.fn(async () => { throw { code: 'stale' }; }) };
  const { hook, transport } = setup({ savedImage, chartId: 'chart' });
  await waitFor(() => expect(hook.result.current.phase.kind).toBe('ready'));
  act(() => hook.result.current.choose('attachment', 'Discharge Summary'));
  await act(async () => { await hook.result.current.doSend(); });
  expect(savedImage.render).toHaveBeenCalledOnce();
  expect(transport.send).not.toHaveBeenCalled();
});

it('does not persist a saved stamp for an editor-only image acknowledgment', async () => {
  const savedImage = { chartId: 'chart', editorTransfer: true as const, render: vi.fn(async () => 'data:image/png;base64,AAAA') };
  const { hook, transport } = setup({ savedImage, chartId: 'chart' });
  await waitFor(() => expect(hook.result.current.phase.kind).toBe('ready'));
  act(() => {
    for (const row of hook.result.current.rows) hook.result.current.choose(row.key, DONT_SEND);
    hook.result.current.choose('attachment', 'Discharge Summary');
  });
  vi.mocked(transport.send).mockImplementationOnce(async request => ({ ok: true, results: request.items.map(item => ({fieldTitle: item.fieldTitle, result: {ok: true}})) }));
  vi.mocked(markPimsSent).mockClear();
  await act(async () => { await hook.result.current.doSend(); });
  expect(markPimsSent).not.toHaveBeenCalled();
  expect(hook.result.current.phase).toMatchObject({ kind: 'results', rows: [{ editorSubmitted: true }] });
});
