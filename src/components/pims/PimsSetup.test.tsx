import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PimsSetup } from './PimsSetup';
import type { SetupBackend, SetupContext } from '../../utils/pims/setup';

const auth = vi.hoisted(() => ({ event: (_event: string) => {}, unsubscribe: vi.fn() }));
const sync = vi.hoisted(() => vi.fn());
const inspect = vi.hoisted(() => vi.fn());
vi.mock('../../utils/pims/extensionBridge', () => ({ externalTransport: { inspect } }));
vi.mock('../../utils/pims/browserSync', () => ({ runBrowserSync: sync }));
vi.mock('../../utils/supabaseClient', () => ({ supabase: { auth: { onAuthStateChange: (callback: (event: string) => void) => {
  auth.event = callback;
  return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
} } } }));

const connection = { id: 'connection', provider: 'ezyvet' as const, origin: 'https://clinic.ezyvet.com', tenant_id: 'clinic', state: 'unverified' as const, revision: 1 };
const chart = { chart_id: 'chart', patient_name: 'Milo', patient_number: 'P1', chart_date: '2026-11-16', source_hash: 'a'.repeat(64), patient_id: 'old-patient', version: 2 };
function backend(): SetupBackend {
  return {
    context: vi.fn(async () => ({ connections: [connection], members: [{ user_id: 'member' }] })),
    page: vi.fn(async ({ collection }) => ({ rows: collection === 'charts' ? [chart] : [], next_cursor: null })),
    configure: vi.fn(async () => connection),
    patient: vi.fn(async (input) => ({ ...input, version: 1 })),
    clinician: vi.fn(async (input) => ({ ...input, version: 1 })),
    linkChart: vi.fn(async (input) => ({ ...input, version: input.expected_version + 1 })),
  };
}
beforeEach(() => { vi.stubEnv('VITE_PIMS_ROLLOUT_ENABLED', 'true'); sync.mockReset(); inspect.mockReset(); inspect.mockResolvedValue({ tab: { id: 7, title: 'Reviewed clinic tab' }, candidates: 1, status: { provider: 'ezyvet', state: 'not_on_calendar' }, fields: [] }); });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
async function open(api: SetupBackend) {
  render(<PimsSetup practiceId="practice" owner backend={api} members={[{ userId: 'member', label: 'Dr Test' }]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Set up PIMS connections' }));
  await screen.findByLabelText('External patient ID');
}
it('does not mount or read while rollout is off or the caller is not the primary owner', () => {
  const api = backend();
  const view = render(<PimsSetup practiceId="practice" owner={false} backend={api} />);
  expect(view.container).toBeEmptyDOMElement();
  vi.stubEnv('VITE_PIMS_ROLLOUT_ENABLED', 'false');
  view.rerender(<PimsSetup practiceId="practice" owner backend={api} />);
  expect(view.container).toBeEmptyDOMElement();
  expect(api.context).not.toHaveBeenCalled();
});
it('offers explicit verification and bounded date sync only for implemented providers', async () => {
  const api = backend();
  const current = { ...connection, provider: 'rhapsody' as const, origin: 'https://clinic.rhapsody.vet', state: 'active' as const };
  vi.mocked(api.context).mockResolvedValue({ connections: [current], members: [] });
  sync.mockResolvedValue({ state: 'completed', outcomes: [], failures: [], reconciled: [], completeness: 'unknown' });
  await open(api);
  expect(screen.getByRole('button', { name: 'Sync appointments' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Appointment date (this device’s timezone)'), { target: { value: '2026-11-16' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sync appointments' }));
  await screen.findByText(/Visits saved: 0/);
  expect(sync).toHaveBeenCalledWith(expect.objectContaining({ connection: current, scope: expect.objectContaining({ requested_date: '2026-11-16' }) }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Verify open PIMS tab' })).toBeEnabled());
  sync.mockResolvedValue(null);
  fireEvent.click(screen.getByRole('button', { name: 'Verify open PIMS tab' }));
  await screen.findByText(/Browser connection verified/);
  expect(sync.mock.lastCall?.[0]).not.toHaveProperty('scope');
});
it('invalidates in-flight browser sync when authentication changes', async () => {
  const api = backend();
  vi.mocked(api.context).mockResolvedValue({ connections: [{ ...connection, provider: 'vetspire', origin: 'https://app.vetspire.com' }], members: [] });
  let finish: (result: null) => void = () => {};
  sync.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  await open(api);
  fireEvent.click(screen.getByRole('button', { name: 'Verify open PIMS tab' }));
  const alive = sync.mock.lastCall![0].alive;
  expect(alive()).toBe(true);
  act(() => auth.event('SIGNED_OUT'));
  expect(alive()).toBe(false);
  await act(async () => finish(null));
  expect(screen.queryByText(/Browser connection verified/)).not.toBeInTheDocument();
});
it('clears the previous connection verification notice when selecting another connection', async () => {
  const api = backend();
  const current = { ...connection, provider: 'rhapsody' as const, origin: 'https://clinic.rhapsody.vet' };
  vi.mocked(api.context).mockResolvedValue({ connections: [current, { ...current, id: 'second', tenant_id: 'other' }], members: [] });
  sync.mockResolvedValue(null);
  await open(api);
  fireEvent.click(screen.getByRole('button', { name: 'Verify open PIMS tab' }));
  await screen.findByText(/Browser connection verified/);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Verify open PIMS tab' })).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Configured connection'), { target: { value: 'second' } });
  await waitFor(() => expect(screen.getByLabelText('Configured connection')).toHaveValue('second'));
  expect(screen.queryByText(/Browser connection verified/)).not.toBeInTheDocument();
});
it('preserves partial counts but blocks more actions after interrupted sync', async () => {
  const api = backend();
  vi.mocked(api.context).mockResolvedValue({ connections: [{ ...connection, provider: 'rhapsody', origin: 'https://clinic.rhapsody.vet', state: 'active' }], members: [] });
  sync.mockResolvedValue({ state: 'interrupted', outcomes: [{ outcome: 'applied' }], failures: [{}] });
  await open(api);
  fireEvent.change(screen.getByLabelText('Appointment date (this device’s timezone)'), { target: { value: '2026-11-16' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sync appointments' }));
  await screen.findByRole('alert');
  expect(screen.getByText(/Visits saved: 1/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sync appointments' })).toBeDisabled();
});
it('loads only on open and requires confirmation before configuring an unverified connection', async () => {
  const api = backend();
  render(<PimsSetup practiceId="practice" owner backend={api} />);
  expect(api.context).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Set up PIMS connections' }));
  await screen.findByLabelText('External patient ID');
  fireEvent.click(screen.getByRole('button', { name: 'Add connection' }));
  fireEvent.change(screen.getByLabelText('PIMS origin'), { target: { value: connection.origin } });
  fireEvent.change(screen.getByLabelText('Configured clinic label'), { target: { value: 'new-clinic' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review connection' }));
  expect(api.configure).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm setup change' }));
  await waitFor(() => expect(api.configure).toHaveBeenCalledWith({ practice_id: 'practice', provider: 'ezyvet', origin: connection.origin, tenant_id: 'new-clinic' }));
  expect(screen.getByText(/Configuration does not verify/)).toBeInTheDocument();
});
it('requires explicit patient confirmation and assigns a stable integration grouping', async () => {
  const api = backend(); await open(api);
  fireEvent.change(screen.getByLabelText('External patient ID'), { target: { value: 'patient-123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review patient link' }));
  expect(api.patient).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm setup change' }));
  await waitFor(() => expect(api.patient).toHaveBeenCalledWith({ connection_id: 'connection', patient_id: 'patient-123', patient_key: expect.any(String) }));
});
it('maps a clinician only to a returned current member', async () => {
  const api = backend(); await open(api);
  fireEvent.click(screen.getByRole('button', { name: 'Clinician links' }));
  await screen.findByLabelText('External clinician ID');
  fireEvent.change(screen.getByLabelText('External clinician ID'), { target: { value: 'vet-123' } });
  fireEvent.change(screen.getByLabelText('Practice member'), { target: { value: 'member' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review clinician link' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm setup change' }));
  await waitFor(() => expect(api.clinician).toHaveBeenCalledWith({ connection_id: 'connection', clinician_id: 'vet-123', user_id: 'member' }));
});
it('binds historical relinking to the displayed chart hash and current link version', async () => {
  const api = backend(); await open(api);
  fireEvent.click(screen.getByRole('button', { name: 'Chart links' }));
  await screen.findByText('Milo');
  fireEvent.click(screen.getByRole('button', { name: 'Link or relink chart' }));
  fireEvent.change(screen.getByLabelText('External patient ID'), { target: { value: 'new-patient' } });
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Patient records checked' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review chart link' }));
  expect(api.linkChart).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm setup change' }));
  await waitFor(() => expect(api.linkChart).toHaveBeenCalledWith(expect.objectContaining({ chart_id: 'chart', patient_id: 'new-patient', expected_version: 2, source_hash: chart.source_hash, reason: 'Patient records checked' })));
});
it('locks uncertain writes until a successful saved-state reload', async () => {
  const api = backend(); api.patient = vi.fn().mockRejectedValue({ code: 'unknown' });
  await open(api);
  fireEvent.change(screen.getByLabelText('External patient ID'), { target: { value: 'patient' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review patient link' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm setup change' }));
  await screen.findByRole('alert');
  expect(screen.getByRole('button', { name: 'Review patient link' })).toBeDisabled();
  expect(api.patient).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Reload saved setup' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Review patient link' })).not.toBeDisabled());
});
it('drops pending owner confirmations when authentication changes', async () => {
  const api = backend(); await open(api);
  fireEvent.change(screen.getByLabelText('External patient ID'), { target: { value: 'patient' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review patient link' }));
  expect(screen.getByRole('button', { name: 'Confirm setup change' })).toBeInTheDocument();
  act(() => auth.event('SIGNED_OUT'));
  expect(screen.queryByRole('button', { name: 'Confirm setup change' })).not.toBeInTheDocument();
  expect(api.patient).not.toHaveBeenCalled();
});
it('discards previous-practice reads and does not carry a pending confirmation across practices', async () => {
  const api = backend(); let resolve!: (value: SetupContext) => void;
  api.context = vi.fn(() => new Promise<SetupContext>((done) => { resolve = done; }));
  const view = render(<PimsSetup practiceId="old" owner backend={api} />);
  fireEvent.click(screen.getByRole('button', { name: 'Set up PIMS connections' }));
  view.rerender(<PimsSetup practiceId="new" owner backend={api} />);
  resolve({ connections: [connection], members: [] });
  await waitFor(() => expect(screen.queryByLabelText('External patient ID')).not.toBeInTheDocument());
});

it.each(['ezyvet', 'daysmart', 'pulse', 'shepherd'] as const)('requires explicit configured-practice confirmation to activate %s', async provider => {
  const api = backend();
  const domains = { ezyvet: 'ezyvet.com', daysmart: 'vettersoftware.com', pulse: 'evetpractice.com', shepherd: 'shepherd.vet' };
  const current = { ...connection, provider, origin: `https://clinic.${domains[provider]}` };
  vi.mocked(api.context).mockResolvedValue({ connections: [current], members: [] });
  sync.mockResolvedValue(null);
  await open(api);
  inspect.mockResolvedValue({ tab: { id: 7, title: 'Reviewed clinic tab' }, status: { provider: current.provider } });
  fireEvent.click(screen.getByRole('button', { name: 'Review PIMS tab' }));
  await screen.findByText('Reviewed PIMS tab: Reviewed clinic tab');
  expect(screen.queryByRole('button', { name: 'Verify open PIMS tab' })).not.toBeInTheDocument();
  const confirm = screen.getByRole('button', { name: 'Confirm configured connection' });
  expect(confirm).toBeDisabled();
  fireEvent.click(screen.getByLabelText('I checked that the selected PIMS tab belongs to this practice.'));
  expect(confirm).toBeEnabled();
  fireEvent.click(confirm);
  await screen.findByText('Configured connection confirmed. The active clinic is not detected automatically.');
  expect(sync).toHaveBeenCalledWith(expect.objectContaining({ connection: current, userConfirmed: true }));
  expect(sync.mock.lastCall?.[0]).not.toHaveProperty('scope');
  expect(screen.getByLabelText('I checked that the selected PIMS tab belongs to this practice.')).not.toBeChecked();
});

it('requires a fresh practice confirmation for each configured sync and date', async () => {
  const api = backend();
  const current = { ...connection, state: 'active' as const, binding_mode: 'user_confirmed' as const };
  vi.mocked(api.context).mockResolvedValue({ connections: [current], members: [] });
  sync.mockResolvedValue({ state: 'completed', outcomes: [], failures: [], reconciled: [], completeness: 'unknown' });
  await open(api);
  expect(screen.queryByRole('button', { name: 'Confirm configured connection' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Appointment date (this device’s timezone)'), { target: { value: '2026-11-16' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review PIMS tab' }));
  await screen.findByText('Reviewed PIMS tab: Reviewed clinic tab');
  const checked = screen.getByLabelText('I checked that the selected PIMS tab belongs to this practice.');
  expect(screen.getByRole('button', { name: 'Sync appointments' })).toBeDisabled();
  fireEvent.click(checked);
  fireEvent.change(screen.getByLabelText('Appointment date (this device’s timezone)'), { target: { value: '2026-11-17' } });
  expect(checked).not.toBeChecked();
  expect(checked).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Review PIMS tab' }));
  await screen.findByText('Reviewed PIMS tab: Reviewed clinic tab');
  fireEvent.click(checked);
  fireEvent.click(screen.getByRole('button', { name: 'Sync appointments' }));
  await screen.findByText(/Visits saved: 0/);
  expect(sync).toHaveBeenCalledWith(expect.objectContaining({ userConfirmed: true, scope: expect.objectContaining({ requested_date: '2026-11-17' }) }));
  expect(checked).not.toBeChecked();
  expect(screen.getByRole('button', { name: 'Sync appointments' })).toBeDisabled();
});

it('clears configured practice confirmation after switching connections or authentication', async () => {
  const api = backend();
  vi.mocked(api.context).mockResolvedValue({ connections: [connection, { ...connection, id: 'second', tenant_id: 'other' }], members: [] });
  await open(api);
  fireEvent.click(screen.getByRole('button', { name: 'Review PIMS tab' }));
  await screen.findByText('Reviewed PIMS tab: Reviewed clinic tab');
  fireEvent.click(screen.getByLabelText('I checked that the selected PIMS tab belongs to this practice.'));
  fireEvent.change(screen.getByLabelText('Configured connection'), { target: { value: 'second' } });
  await waitFor(() => expect(screen.getByLabelText('Configured connection')).toHaveValue('second'));
  expect(screen.getByLabelText('I checked that the selected PIMS tab belongs to this practice.')).not.toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Review PIMS tab' }));
  await screen.findByText('Reviewed PIMS tab: Reviewed clinic tab');
  fireEvent.click(screen.getByLabelText('I checked that the selected PIMS tab belongs to this practice.'));
  act(() => auth.event('SIGNED_OUT'));
  expect(screen.queryByLabelText('I checked that the selected PIMS tab belongs to this practice.')).not.toBeInTheDocument();
});


it('pins the actually reviewed tab even if the most recent same-provider tab changes before sync', async () => {
  const api = backend();
  const current = { ...connection, state: 'active' as const, binding_mode: 'user_confirmed' as const };
  vi.mocked(api.context).mockResolvedValue({ connections: [current], members: [] });
  sync.mockResolvedValue({ state: 'completed', outcomes: [], failures: [] });
  await open(api);
  fireEvent.change(screen.getByLabelText('Appointment date (this device’s timezone)'), { target: { value: '2026-11-16' } });
  expect(screen.getByLabelText('I checked that the selected PIMS tab belongs to this practice.')).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Review PIMS tab' }));
  await screen.findByText('Reviewed PIMS tab: Reviewed clinic tab');
  fireEvent.click(screen.getByLabelText('I checked that the selected PIMS tab belongs to this practice.'));
  inspect.mockResolvedValue({ tab: { id: 8, title: 'Other clinic on same origin' }, candidates: 2, status: { provider: 'ezyvet' }, fields: [] });
  fireEvent.click(screen.getByRole('button', { name: 'Sync appointments' }));
  await screen.findByText(/Visits saved: 0/);
  expect(inspect).toHaveBeenCalledOnce();
  expect(sync).toHaveBeenCalledWith(expect.objectContaining({ reviewedTabId: 7, userConfirmed: true }));
  expect(screen.queryByText('Reviewed PIMS tab: Reviewed clinic tab')).not.toBeInTheDocument();
  expect(screen.getByLabelText('I checked that the selected PIMS tab belongs to this practice.')).toBeDisabled();
});

it.each([null, { tab: { id: -1, title: 'Bad' }, status: { provider: 'ezyvet' } }, { tab: { id: 7, title: 'Different provider' }, status: { provider: 'shepherd' } }])('does not permit confirmation after an invalid reviewed destination: %j', async response => {
  const api = backend();
  inspect.mockResolvedValue(response);
  await open(api);
  fireEvent.click(screen.getByRole('button', { name: 'Review PIMS tab' }));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('I checked that the selected PIMS tab belongs to this practice.')).toBeDisabled();
  expect(sync).not.toHaveBeenCalled();
});
