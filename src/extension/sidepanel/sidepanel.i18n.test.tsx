vi.mock('../../hooks/useProfile', () => ({ useProfile: () => ({ loaded: true, aiEnabled: false }) }));
import { vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const fake = vi.hoisted(() => {
  const state: { listener: ((event: string, session: unknown) => void) | null } = { listener: null };
  const client = {
    auth: {
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        state.listener = cb;
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  };
  return { state, client, current: client as unknown };
});
vi.mock('../../utils/supabaseClient', () => ({
  get supabase() { return fake.current; },
  get cloudEnabled() { return fake.current !== null; },
}));
const pims = vi.hoisted(() => {
  const chart = {
    id: 'c1', patient_name: 'Bella', patient_number: '', owner_name: 'Jane Smith', owner_phone: '', owner_email: '',
    species: 'canine', dentition: '', chart_date: '2026-11-01', recall_date: '', updated_at: '2026-11-10', created_by: 'u1',
  };
  const info = {
    tab: { id: 7, title: 'Consult' },
    candidates: 1,
    status: { state: 'writable', patientName: 'Bella Smith', consult: { viewId: '3', recordId: '4521' } },
    fields: [{ title: 'Plan', kind: 'note', acceptsImage: false }],
  };
  return {
    chart,
    info,
    transport: {
      ping: async () => ({ version: '1' }),
      inspect: async () => info,
      send: async () => ({ ok: true, results: [{ fieldTitle: 'Plan', result: { ok: true } }] }),
      diagnose: async () => null,
      appointments: async (): Promise<unknown> => ({ tab: null, result: null }),
      startChart: async () => ({ ok: false }),
      takePendingPatient: async () => null,
    },
  };
});
vi.mock('./internalTransport', () => ({ internalTransport: pims.transport }));
vi.mock('./OffscreenChartPicture', () => ({
  useOffscreenChartPicture: () => ({ element: null, render: async () => null, hasDiagrams: false }),
}));
vi.mock('../../hooks/usePimsFieldMap', () => ({
  usePimsFieldMap: () => ({ map: { header: null, anesthesia: 'Plan', exam: 'Plan', findings: 'Plan', procedures: 'Plan', radiographs: 'Plan', treatment: 'Plan', recheck: 'Plan', chart: null }, save: async () => {}, reset: async () => {} }),
}));
vi.mock('../../utils/edgeFunctions', () => ({ markPimsSent: async () => ({ sentAt: '2026-11-15T10:00:00Z' }) }));
vi.mock('../../utils/chartQueries', async () => {
  const { localDateISO } = await import('../../utils/localDate');
  const { EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS } = await import('../../types');
  const { normalizeSnapshot } = await import('../../hooks/useChartState');
  return {
    listChartsPage: async () => ({ rows: [pims.chart], hasMore: true }),
    chartsForPatients: async () => [
      { ...pims.chart, id: 'today', patient_number: '1', chart_date: localDateISO() },
      { ...pims.chart, id: 'old', patient_number: '2', chart_date: '2026-01-01' },
    ],
    loadChartSnapshot: async () => ({
      snapshot: normalizeSnapshot({
        patientInfo: {
          patientName: 'Bella', patientNumber: '1', doctor: '', tech: '', date: '2026-11-11', treatmentReport: 'Scaled.',
          nerveBlocks: { ...EMPTY_NERVE_BLOCKS }, exam: { ...EMPTY_EXAM_FINDINGS },
        },
        toothData: [], species: 'canine', logo: 'socal',
      } as never),
      pimsSentAt: null,
    }),
  };
});
// The panel applies the browser language; keep the pseudo-locale in place.
vi.mock('../../i18n/applyLanguage', () => ({ applyLanguage: async () => 'applied' }));

import { installPseudoLocale, restoreLocale, findUntranslated } from '../../i18n/testing/pseudo';
import { SidePanelApp } from './SidePanelApp';
import { SignIn } from './SignIn';
import { ChartList } from './ChartList';
import { ChartSend } from './ChartSend';
import { TodaysPatients } from './TodaysPatients';

beforeEach(async () => {
  fake.current = fake.client;
  await installPseudoLocale();
});
afterEach(async () => {
  cleanup();
  await restoreLocale();
});

const emit = (event: string, session: unknown) => act(() => fake.state.listener!(event, session));

describe('side panel (pseudo-locale)', () => {
  it('loading', () => {
    render(<SidePanelApp />);
    expect(findUntranslated(document.body)).toEqual([]);
  });

  it('signed out', async () => {
    render(<SidePanelApp />);
    await emit('INITIAL_SESSION', null);
    expect(document.querySelector('form')).not.toBeNull();
    expect(findUntranslated(document.body)).toEqual([]);
  });

  it('sign-in form on its own', () => {
    render(<SignIn />);
    expect(findUntranslated(document.body)).toEqual([]);
  });

  it('signed in', async () => {
    render(<SidePanelApp />);
    await emit('INITIAL_SESSION', { user: { id: 'u1', email: 'vet@clinic.test' } });
    expect(document.querySelector('.sp-header')).not.toBeNull();
    expect(findUntranslated(document.body, [/vet@clinic\.test/, /Bella/, /Jane Smith/, /2026/])).toEqual([]);
  });

  it('not connected', () => {
    fake.current = null;
    render(<SidePanelApp />);
    expect(findUntranslated(document.body)).toEqual([]);
  });

  it('chart list with a pinned match', async () => {
    render(<ChartList inspect={pims.info as never} onPick={() => undefined} />);
    await screen.findByTestId('pinned-match');
    expect(screen.getByRole('button', { name: /Load more/ })).toBeInTheDocument();
    expect(findUntranslated(document.body, [/Bella/, /Jane Smith/, /2026/])).toEqual([]);
  });

  it('chart list, nothing pinned', async () => {
    render(<ChartList inspect={null} onPick={() => undefined} />);
    await screen.findByRole('searchbox');
    await waitFor(() => expect(document.querySelector('.sp-chart')).not.toBeNull());
    expect(screen.queryByTestId('pinned-match')).toBeNull();
    expect(findUntranslated(document.body, [/Bella/, /Jane Smith/, /2026/])).toEqual([]);
  });

  it('chart view and results', async () => {
    render(<ChartSend chart={pims.chart as never} onBack={() => undefined} sendFlag="on" />);
    await waitFor(() => expect(document.querySelector('.sp-primary')).not.toBeNull());
    const send = document.querySelector('.sp-primary') as HTMLButtonElement;
    expect(document.querySelector('textarea')).not.toBeNull();
    expect(findUntranslated(document.body, [/Bella/, /Scaled/, /Consult/, /Plan/, /Smith/])).toEqual([]);
    await waitFor(() => expect(send).toBeEnabled());
    // The mismatch-free path goes straight to the results.
    await act(async () => { fireEvent.click(send); });
    await waitFor(() => expect(document.querySelector('.pims-dialog__results')).not.toBeNull());
    expect(findUntranslated(document.body, [/Bella/, /Plan/, /Smith/])).toEqual([]);
  });

  it('chart list with a possible (not exact) match', async () => {
    const loose = { ...pims.info, status: { ...pims.info.status, patientName: 'Bella Jones' } };
    render(<ChartList inspect={loose as never} onPick={() => undefined} />);
    await screen.findByTestId('possible-match');
    expect(findUntranslated(document.body, [/Bella/, /Jones/, /Jane Smith/, /2026/])).toEqual([]);
  });

  describe('today\'s patients', () => {
    const tab = { id: 3, title: 'ezyVet' };
    const appt = (n: string, name: string, start: string) => ({ appointmentId: n, start, patientName: name, patientNumber: n, ownerName: 'Smith, Jane', vet: 'Dr Lee' });
    const allow = [/Bella/, /Max/, /Rex/, /Smith, Jane/, /Dr Lee/, /\d{1,2}[:.h]\d{2}/, /AM|PM/];
    afterEach(() => { pims.transport.appointments = async () => ({ tab: null, result: null }); });

    it.each([
      ['no ezyVet tab', { tab: null, result: null }],
      ['not on the calendar', { tab, result: { ok: false, code: 'not_on_calendar' } }],
      ['an error', { tab, result: { ok: false, code: 'no_calendar_refresh' } }],
      ['an empty day', { tab, result: { ok: true, appointments: [], failures: [] } }],
    ])('%s', async (_label, answer) => {
      pims.transport.appointments = async () => answer;
      render(<TodaysPatients userId="u1" />);
      await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
      expect(findUntranslated(document.body, allow)).toEqual([]);
    });

    it('rows with every action, unread appointments and a failed hand-over', async () => {
      pims.transport.appointments = async () => ({
        tab,
        result: {
          ok: true,
          appointments: [appt('1', 'Bella', '2026-11-16T09:00:00'), appt('2', 'Max', '2026-11-16T09:30:00'), appt('3', 'Rex', '2026-11-16T10:00:00')],
          failures: [{ code: 'tooltip_empty', startsAt: null }, { code: 'tooltip_empty', startsAt: null }],
        },
      });
      render(<TodaysPatients userId="u1" />);
      await waitFor(() => expect(document.querySelectorAll('.sp-appt')).toHaveLength(3));
      expect(document.querySelectorAll('.sp-appt__actions button')).toHaveLength(4);
      fireEvent.click(document.querySelector('.sp-appt__actions .sp-link') as HTMLButtonElement);
      await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
      expect(findUntranslated(document.body, allow)).toEqual([]);
    });
  });

  it.each(['off', 'error', 'loading'] as const)('chart view with the practice flag %s', async (flag) => {
    render(<ChartSend chart={pims.chart as never} onBack={() => undefined} sendFlag={flag} />);
    await waitFor(() => expect(document.querySelector('textarea')).not.toBeNull());
    expect(document.querySelector('.sp-primary')).toBeNull();
    expect(findUntranslated(document.body, [/Bella/, /Scaled/])).toEqual([]);
  });
});
