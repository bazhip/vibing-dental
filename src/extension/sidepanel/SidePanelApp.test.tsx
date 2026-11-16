import { vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const fake = vi.hoisted(() => {
  const state = {
    listener: null as ((event: string, session: unknown) => void) | null,
    practiceFlag: true as boolean,
    practiceError: false,
  };
  const row = (table: string) => {
    if (table === 'profiles') return { data: { practice_id: 'p1', chart_prefs: null }, error: null };
    if (table === 'practices') {
      return state.practiceError
        ? { data: null, error: { message: 'boom' } }
        : { data: { pims_send_enabled: state.practiceFlag }, error: null };
    }
    return { data: null, error: null };
  };
  const client = {
    auth: {
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        state.listener = cb;
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
      signOut: vi.fn(async () => ({ error: null })),
    },
    from: (table: string) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => row(table) }) }) }),
  };
  return { state, client };
});
vi.mock('../../utils/supabaseClient', () => ({ supabase: fake.client, cloudEnabled: true }));
// Outside the free beta, so the practice flag decides.
vi.mock('../../constants/plans', async (orig) => ({
  ...(await orig<typeof import('../../constants/plans')>()),
  FREE_BETA: false,
}));

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(async (_o: unknown) => true),
  transport: { ping: vi.fn(), inspect: vi.fn(), send: vi.fn(), diagnose: vi.fn() },
}));
vi.mock('./internalTransport', () => ({ internalTransport: mocks.transport }));
vi.mock('./OffscreenChartPicture', () => ({
  useOffscreenChartPicture: () => ({ element: null, render: async () => null, hasDiagrams: false }),
}));
vi.mock('./useActiveTabChange', () => ({ useActiveTabChange: () => undefined }));
vi.mock('../../hooks/usePimsFieldMap', async () => {
  const { effectiveMap } = await import('../../utils/pims/mapping');
  return { usePimsFieldMap: () => ({ map: effectiveMap(null), save: async () => {}, reset: async () => {} }) };
});
vi.mock('../../utils/edgeFunctions', () => ({ markPimsSent: vi.fn(async () => ({ sentAt: '2026-11-15T10:00:00Z' })) }));
vi.mock('../../components/ui/dialogs', async (orig) => ({
  ...(await orig<typeof import('../../components/ui/dialogs')>()),
  confirmDialog: mocks.confirm,
  toast: vi.fn(),
}));
vi.mock('../../i18n/applyLanguage', () => ({ applyLanguage: async () => 'applied' }));
vi.mock('../../utils/chartQueries', async () => {
  const { EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS } = await import('../../types');
  const { normalizeSnapshot } = await import('../../hooks/useChartState');
  const chart = {
    id: 'c1', patient_name: 'Bella', patient_number: '', owner_name: 'Jane Smith', owner_phone: '', owner_email: '',
    species: 'canine', dentition: '', chart_date: '2026-11-01', recall_date: '', updated_at: '2026-11-10', created_by: 'u1',
  };
  return {
    listChartsPage: async () => ({ rows: [chart], hasMore: false }),
    loadChartSnapshot: async () => ({
      snapshot: normalizeSnapshot({
        patientInfo: {
          patientName: 'Bella', patientNumber: '1', ownerName: 'Jane Smith', doctor: '', tech: '', date: '2026-11-11',
          treatmentReport: 'Scaled.', nerveBlocks: { ...EMPTY_NERVE_BLOCKS }, exam: { ...EMPTY_EXAM_FINDINGS },
        },
        toothData: [], species: 'canine', logo: 'socal',
      } as never),
      pimsSentAt: null,
    }),
  };
});

import { SENT_DATES_KEY, SidePanelApp } from './SidePanelApp';

const info = {
  tab: { id: 7, title: 'Consult' },
  candidates: 1,
  status: { state: 'writable', patientName: 'Bella', consult: { viewId: '3', recordId: '4521' } },
  fields: [{ title: 'Plan', kind: 'note', acceptsImage: false }],
};

const emit = (event: string, session: unknown) => act(() => fake.state.listener!(event, session));
const user = (id: string) => ({ user: { id, email: `${id}@clinic.test` } });

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  fake.state.practiceFlag = true;
  fake.state.practiceError = false;
  mocks.confirm.mockResolvedValue(true);
  mocks.transport.ping.mockResolvedValue({ version: '1' });
  mocks.transport.inspect.mockResolvedValue(info);
  mocks.transport.send.mockResolvedValue({ ok: true, results: [{ fieldTitle: 'Plan', result: { ok: true } }] });
});
afterEach(cleanup);

async function signInAndPick(id = 'u1') {
  render(<SidePanelApp />);
  await emit('INITIAL_SESSION', user(id));
  fireEvent.click((await screen.findAllByRole('button', { name: /Bella/ }))[0]);
}

async function pressSend() {
  const btn = await screen.findByRole('button', { name: 'Send' });
  await waitFor(() => expect(btn).toBeEnabled());
  await act(async () => { fireEvent.click(btn); });
}

describe('SidePanelApp', () => {
  it('a maybe-sent send is remembered: Back, re-pick, and Send asks first', async () => {
    await signInAndPick();
    mocks.transport.send.mockRejectedValueOnce(new Error('timeout'));
    await pressSend();
    expect(await screen.findByText(/may already have been written/)).toBeInTheDocument();
    expect(mocks.confirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Back to charts/ }));
    fireEvent.click((await screen.findAllByRole('button', { name: /Bella/ }))[0]);
    mocks.confirm.mockResolvedValue(false);
    await pressSend();
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
    expect((mocks.confirm.mock.calls[0][0] as { title: string }).title).toContain('Already sent on');
    expect(mocks.transport.send).toHaveBeenCalledTimes(1);
    // Kept for a panel reload.
    expect(Object.keys(JSON.parse(window.sessionStorage.getItem(SENT_DATES_KEY)!))).toEqual(['u1:c1']);
  });

  it('sign-out drops the open chart and the sent dates', async () => {
    await signInAndPick();
    mocks.transport.send.mockRejectedValueOnce(new Error('timeout'));
    await pressSend();
    await screen.findByText(/may already have been written/);
    expect(window.sessionStorage.getItem(SENT_DATES_KEY)).not.toBeNull();

    await emit('SIGNED_OUT', null);
    expect(document.querySelector('form')).not.toBeNull();
    expect(window.sessionStorage.getItem(SENT_DATES_KEY)).toBeNull();
    await emit('SIGNED_IN', user('u1'));
    expect(await screen.findByRole('searchbox')).toBeInTheDocument();
    expect(screen.queryByLabelText('Record note')).toBeNull();
  });

  it('another account never sees the previous account’s open chart', async () => {
    await signInAndPick('u1');
    await screen.findByLabelText('Record note');
    await emit('SIGNED_IN', user('u2'));
    expect(screen.queryByLabelText('Record note')).toBeNull();
    expect(await screen.findByRole('searchbox')).toBeInTheDocument();
  });

  it('Sign out is disabled while a send is running', async () => {
    await signInAndPick();
    let finish!: (v: unknown) => void;
    mocks.transport.send.mockImplementationOnce(() => new Promise((r) => { finish = r; }));
    const signOut = screen.getByRole('button', { name: 'Sign out' });
    expect(signOut).toBeEnabled();
    await pressSend();
    await waitFor(() => expect(signOut).toBeDisabled());
    await act(async () => { finish({ ok: true, results: [{ fieldTitle: 'Plan', result: { ok: true } }] }); });
    await waitFor(() => expect(signOut).toBeEnabled());
  });

  it('the practice flag off hides Send in the chart view', async () => {
    fake.state.practiceFlag = false;
    await signInAndPick();
    expect(await screen.findByText('Sending to ezyVet isn’t turned on for your practice.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    // The chart view does not look for ezyVet (only the list's pin did).
    expect(mocks.transport.ping).not.toHaveBeenCalled();
  });

  it('a failed flag lookup counts as off until a retry succeeds', async () => {
    fake.state.practiceError = true;
    await signInAndPick();
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t check');
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    fake.state.practiceError = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: 'Send' })).toBeInTheDocument();
  });
});
