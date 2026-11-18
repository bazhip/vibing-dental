import { act, renderHook, waitFor } from '@testing-library/react';
import type { PimsTransport } from '../utils/pims/extensionBridge';
import type { InspectResult } from '../extension/protocol';
import { usePimsSend } from './usePimsSend';
import '../i18n';
const preferences = vi.hoisted(() => ({ load: vi.fn(), authError: false }));
vi.mock('../utils/supabaseClient', () => ({ cloudEnabled: true, supabase: {
  auth: { getSession: async () => preferences.authError ? { data: { session: null }, error: { message: 'auth failed' } } : { data: { session: { user: { id: 'vet' } } }, error: null }, onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => preferences.load() }) }) }),
} }));
vi.mock('../components/ui/dialogs', () => ({ confirmDialog: async () => true, toast: vi.fn() }));
const info: InspectResult = { tab: { id: 7, title: 'Current visit' }, candidates: 1,
  status: { provider: 'ezyvet', state: 'writable', patientName: 'Bella', patientNumber: 'P-1', consult: { recordId: 'visit', viewId: 'visit' } },
  fields: [{ title: 'Physical Exam', kind: 'note', acceptsImage: false }, { title: 'Plan', kind: 'note', acceptsImage: false }],
};
function setup(stored: import('../types').StoredRecordNote | null = null, complaint = false) {
  const inspect = vi.fn(async () => info), send = vi.fn(async () => ({ ok: true, results: [] }));
  const transport = { ping: async () => ({ version: '1', protocol: 1, capabilities: ['inspect', 'send'] }), inspect, send } as unknown as PimsTransport;
  const hook = renderHook(() => usePimsSend({ transport, note: { sections: [...(complaint ? [{ key: 'complaint' as const, heading: 'Chief complaint', lines: ['Recorded complaint'] }] : []), { key: 'ctReport', heading: 'CT report', lines: ['Recorded CT findings'] }] }, stored,
    chartSnapshotPicture: async () => null, hasChartPicture: false, chartId: null, patientName: 'Bella', patientNumber: 'P-1', sentAt: null, onSent() {} }));
  return { hook, inspect, send };
}
beforeEach(() => { preferences.authError = false; preferences.load.mockReset(); preferences.load.mockResolvedValue({ data: { pims_field_map: {} }, error: null }); });
it('blocks sending while saved preferences load, then honors a delayed saved CT skip', async () => {
  let resolve!: (value: unknown) => void;
  preferences.load.mockImplementation(() => new Promise(r => { resolve = r; }));
  const { hook, send } = setup(); await waitFor(() => expect(hook.result.current.phase.kind).toBe('ready'));
  expect(hook.result.current.mappingStatus).toBe('loading'); expect(hook.result.current.nothingToSend).toBe(true);
  await act(async () => hook.result.current.doSend()); expect(send).not.toHaveBeenCalled();
  await act(async () => resolve({ data: { pims_field_map: { ctReport: null } }, error: null }));
  await waitFor(() => expect(hook.result.current.mappingStatus).toBe('ready'));
  expect(hook.result.current.rows.find(row => row.key === 'ctReport')?.wanted).toBeNull();
});
it('keeps automatic sends blocked when saved preferences cannot be read', async () => {
  preferences.load.mockResolvedValue({ data: null, error: { message: 'unavailable' } });
  const { hook, send } = setup(); await waitFor(() => expect(hook.result.current.mappingStatus).toBe('error'));
  await act(async () => hook.result.current.doSend()); expect(send).not.toHaveBeenCalled();
});
it('invalidates an in-flight send if a destination choice changes while inspecting', async () => {
  const { hook, inspect, send } = setup(); await waitFor(() => expect(hook.result.current.mappingStatus).toBe('ready'));
  await waitFor(() => expect(hook.result.current.phase.kind).toBe('ready'));
  let resolve!: (value: InspectResult) => void; inspect.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  let attempt!: Promise<void>; act(() => { attempt = hook.result.current.doSend(); });
  await waitFor(() => expect(inspect).toHaveBeenCalledTimes(2));
  act(() => hook.result.current.choose('ctReport', 'Plan'));
  await act(async () => { resolve(info); await attempt; }); expect(send).not.toHaveBeenCalled();
});
it('requires review again when fresh destination fields change on the same visit', async () => {
  const { hook, inspect, send } = setup(); await waitFor(() => expect(hook.result.current.mappingStatus).toBe('ready'));
  await waitFor(() => expect(hook.result.current.phase.kind).toBe('ready'));
  inspect.mockResolvedValueOnce({ ...info, fields: [{ title: 'Objective > Physical Exam', kind: 'note', acceptsImage: false }, { title: 'Other > Physical Exam', kind: 'note', acceptsImage: false }] });
  await act(async () => hook.result.current.doSend()); expect(send).not.toHaveBeenCalled(); expect(hook.result.current.changedTarget).toBe(true);
  expect(hook.result.current.rows.find(row => row.key === 'ctReport')?.wanted).toBeNull();
});

it('keeps automatic sends blocked when the account lookup fails', async () => {
  preferences.authError = true;
  const { hook, send } = setup(); await waitFor(() => expect(hook.result.current.mappingStatus).toBe('error'));
  await act(async () => hook.result.current.doSend()); expect(send).not.toHaveBeenCalled(); expect(preferences.load).not.toHaveBeenCalled();
});

it('requires an explicit whole-note destination when a complaint note cannot be split safely', async () => {
  const { hook, send } = setup({ text: 'Patient demographics and retained clinical complaint', lng: 'en', basedOn: 'old', source: 'edited' }, true);
  await waitFor(() => expect(hook.result.current.phase.kind).toBe('ready'));
  await waitFor(() => expect(hook.result.current.mappingStatus).toBe('ready'));
  expect(hook.result.current.split).toBeNull();
  expect(hook.result.current.rows.find(row => row.key === 'edited')?.wanted).toBeNull();
  expect(hook.result.current.nothingToSend).toBe(true);
  expect(send).not.toHaveBeenCalled();
});
