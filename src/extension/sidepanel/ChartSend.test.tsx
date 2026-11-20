vi.mock('../../hooks/useProfile', () => ({ useProfile: () => ({ loaded: true, aiEnabled: false, consultationEnabled: mocks.consultationEnabled }) }));
import { vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS } from '../../types';
import { WEB_APP_ORIGIN, type InspectResult } from '../protocol';
import type { CloudChartMeta } from '../../utils/chartQueries';
import { effectiveMap } from '../../utils/pims/mapping';

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  consultationEnabled: false,
  independentPanel: vi.fn(),
  offscreen: vi.fn(),
  confirm: vi.fn(async (_o: unknown) => true),
  transport: { ping: vi.fn(), inspect: vi.fn(), send: vi.fn(), diagnose: vi.fn(), appointments: vi.fn(), startChart: vi.fn(), takePendingPatient: vi.fn(), noteAutofill: vi.fn(), physicalExam: vi.fn() },
  supabase: null as unknown,
  tab: { activated: null as null | (() => void) },
}));
vi.mock('../../utils/chartQueries', () => ({ loadChartSnapshot: mocks.load }));
vi.mock('./internalTransport', () => ({ internalTransport: mocks.transport }));
vi.mock('./OffscreenChartPicture', () => ({
  useOffscreenChartPicture: (snapshot: unknown) => {
    mocks.offscreen(snapshot);
    return { element: null, render: async () => null, hasDiagrams: false };
  },
}));
vi.mock('../../hooks/usePimsFieldMap', () => ({
  usePimsFieldMap: () => ({ map: effectiveMap(null), save: async () => {}, reset: async () => {} }),
}));
vi.mock('../../utils/supabaseClient', () => ({ get supabase() { return mocks.supabase; }, cloudEnabled: false }));
vi.mock('../../utils/edgeFunctions', () => ({ markPimsSent: vi.fn(async () => ({ sentAt: '2026-11-15T10:00:00Z' })) }));
vi.mock('../../components/ui/dialogs', async (orig) => ({
  ...(await orig<typeof import('../../components/ui/dialogs')>()),
  confirmDialog: mocks.confirm,
  toast: vi.fn(),
}));
vi.mock('../../utils/clipboard', () => ({ copyRichText: vi.fn(async () => 'rich') }));
vi.mock('../../components/pims/PimsDrafts', async (original) => {
  const { PimsDrafts } = await original<typeof import('../../components/pims/PimsDrafts')>();
  return { PimsDrafts: (props: Parameters<typeof PimsDrafts>[0]) => {
    mocks.independentPanel('drafts', props.disabled);
    return <PimsDrafts {...props} />;
  } };
});
vi.mock('../../components/pims/PimsImages', async (original) => {
  const { PimsImages } = await original<typeof import('../../components/pims/PimsImages')>();
  return { PimsImages: (props: Parameters<typeof PimsImages>[0]) => {
    mocks.independentPanel('images', props.disabled);
    return <PimsImages {...props} />;
  } };
});
vi.mock('../../components/pims/PimsUploadReview', async (original) => {
  const { PimsUploadReview } = await original<typeof import('../../components/pims/PimsUploadReview')>();
  return { PimsUploadReview: (props: Parameters<typeof PimsUploadReview>[0]) => {
    mocks.independentPanel('uploads', props.disabled);
    return <PimsUploadReview {...props} />;
  } };
});
vi.mock('../../components/pims/PimsExam', async (original) => {
  const { PimsExam } = await original<typeof import('../../components/pims/PimsExam')>();
  return { PimsExam: (props: Parameters<typeof PimsExam>[0]) => {
    mocks.independentPanel('exam', props.disabled);
    return <PimsExam {...props} />;
  } };
});
vi.mock('./useActiveTabChange', () => ({
  useActiveTabChange: (cb: () => void) => { mocks.tab.activated = cb; },
}));

import { normalizeSnapshot } from '../../hooks/useChartState';
import { ChartSend } from './ChartSend';
import { recordNoteBasis } from '../../utils/recordNote';
import { copyRichText } from '../../utils/clipboard';

const chart: CloudChartMeta = {
  id: 'c1', patient_name: 'Bella', patient_number: '', owner_name: 'O', owner_phone: '', owner_email: '',
  species: 'canine', dentition: '', chart_date: '2026-11-01', recall_date: '', updated_at: '2026-11-10', created_by: 'u1',
};

const rawData = (patientName: string) => ({
  patientInfo: {
    patientName, patientNumber: '1', doctor: '', tech: '', date: '2026-11-11', treatmentReport: 'Scaled and polished.',
    nerveBlocks: { ...EMPTY_NERVE_BLOCKS }, exam: { ...EMPTY_EXAM_FINDINGS },
  },
  toothData: [], species: 'canine', logo: 'socal',
});

const info = (patientName: string | null, patientNumber: string | null = null): InspectResult => ({
  tab: { id: 7, title: 'Consult' },
  candidates: 1,
  status: { state: 'writable', patientName, patientNumber, consult: { viewId: '3', recordId: '4521' } },
  fields: [{ title: 'Plan', kind: 'note', acceptsImage: false }],
});

type OpenOpts = {
  stored?: boolean; fresh?: boolean; ezyvet?: string | null; ezyvetNumber?: string | null; chartName?: string; ownerName?: string; sentAt?: string | null;
  visitType?: 'dental' | 'consultation';
} & Partial<React.ComponentProps<typeof ChartSend>>;

function open({ stored, fresh, ezyvet, ezyvetNumber = null, chartName, ownerName, sentAt, visitType, ...props }: OpenOpts = {}) {
  const opts = { stored, ezyvet, chartName, sentAt };
  const snapshot = normalizeSnapshot(rawData(chartName ?? 'Bella') as never);
  if (visitType) snapshot.patientInfo.visitType = visitType;
  if (ownerName !== undefined) snapshot.patientInfo.ownerName = ownerName;
  if (opts.stored) {
    snapshot.recordNote = { text: 'My edited note', source: 'edited', lng: 'en', basedOn: fresh ? recordNoteBasis(snapshot) : 'x' };
  }
  mocks.load.mockResolvedValue({ snapshot, pimsSentAt: opts.sentAt ?? null });
  mocks.transport.ping.mockResolvedValue({ version: '1' });
  mocks.transport.inspect.mockResolvedValue(info(opts.ezyvet === undefined ? 'Bella' : opts.ezyvet, ezyvetNumber));
  mocks.transport.send.mockResolvedValue({ ok: true, results: [{ fieldTitle: 'Plan', result: { ok: true } }] });
  return render(<ChartSend chart={chart} onBack={vi.fn()} sendFlag="on" {...props} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.supabase = null;
  mocks.consultationEnabled = false;
  mocks.confirm.mockResolvedValue(true);
});
afterEach(cleanup);

const send = async () => {
  const btn = await screen.findByRole('button', { name: 'Send' });
  await waitFor(() => expect(btn).toBeEnabled());
  await act(async () => { fireEvent.click(btn); });
};

describe('ChartSend', () => {
  it('exposes explicit Shepherd setup and keeps navigation locked until opening finishes', async () => {
    mocks.supabase = { auth: { onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
      callback('INITIAL_SESSION', { user: { id: 'user' } });
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    } } };
    const onBusyChange = vi.fn(), onSent = vi.fn();
    open({ onBusyChange, onSent });
    const recordId = '12345678-1234-1234-1234-123456789abc';
    mocks.transport.ping.mockResolvedValue({ version: '1', protocol: 1, capabilities: ['inspect', 'send', 'diagnose', 'physicalExam'] });
    mocks.transport.inspect.mockResolvedValue({ tab: { id: 7, title: 'Shepherd' }, candidates: 1, fields: [], status: {
      provider: 'shepherd', state: 'locked', patientName: 'Bella', patientNumber: null,
      consult: { recordId, viewId: `https://app.shepherd.vet/soap/${recordId}/objective|` },
    } });
    let resolveOpen!: (value: unknown) => void;
    mocks.transport.physicalExam.mockImplementation(async (_tabId, request) => request.operation === 'inspect'
      ? { ok: true, state: 'available', pageId: 'page' }
      : request.operation === 'prepare'
        ? { ok: true, state: 'prepared', pageId: 'page', ticket: 'ticket', doctor: 'Dr Rivera', templates: [{ id: 'dental', label: 'Dental' }] }
        : new Promise(resolve => { resolveOpen = resolve; }));
    fireEvent.click(await screen.findByRole('button', { name: 'Set up physical exam' }));
    fireEvent.change(await screen.findByLabelText('Physical exam template'), { target: { value: 'dental' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open physical exam' }));
    await waitFor(() => expect(resolveOpen).toBeDefined());
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole('button', { name: '← Back to charts' })).toBeDisabled();
    await act(async () => resolveOpen({ ok: true, state: 'opened', recordId, examId: 'aaaaaaaa-1234-1234-1234-123456789abc' }));
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    expect(mocks.transport.send).not.toHaveBeenCalled();
    expect(onSent).not.toHaveBeenCalled();
  });
  it('allows manual copy when automatic writes cannot verify an encounter', async () => {
    const onSent = vi.fn();
    open({ stored: true, onSent });
    mocks.transport.inspect.mockResolvedValue({ ...info(null), status: { state: 'notConsult', patientName: null, patientNumber: null, consult: null } });
    await screen.findByText(/ToothOps can’t verify the active encounter/);
    fireEvent.click(screen.getByRole('button', { name: 'Copy all' }));
    await waitFor(() => expect(copyRichText).toHaveBeenCalledWith('<p>My edited note</p>', 'My edited note', expect.any(String)));
    expect(mocks.transport.send).not.toHaveBeenCalled();
    expect(onSent).not.toHaveBeenCalled();
  });

  it('does not expose manual transfer while the practice send flag is off', async () => {
    open({ sendFlag: 'off' });
    await screen.findByLabelText('Record note');
    expect(screen.queryByRole('button', { name: 'Copy all' })).not.toBeInTheDocument();
  });

  it('leads with destination and choices, keeps note preview secondary, and retains destination in results', async () => {
    open({ stored: true });
    const button = await screen.findByRole('button', { name: 'Send' });
    const destination = screen.getByRole('complementary', { name: 'Destination' });
    const mapping = screen.getByRole('combobox');
    const preview = screen.getByText('Record note', { selector: 'summary' });
    expect(destination.compareDocumentPosition(mapping) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(mapping.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(preview.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(preview.closest('details')).not.toHaveAttribute('open');
    await send();
    expect(screen.getByRole('complementary', { name: 'Destination' })).toHaveTextContent('PIMS: Bella');
    expect(screen.getByRole('heading', { name: 'Results' })).toHaveFocus();
  });

  it('shows the generated note read-only when none is stored', async () => {
    open();
    const note = await screen.findByLabelText('Record note');
    expect(note).toHaveAttribute('readonly');
    expect((note as HTMLTextAreaElement).value).toContain('Bella');
  });

  it('names the generated consultation heading in the field mappings', async () => {
    open({ visitType: 'consultation' });
    expect(await screen.findByRole('combobox', { name: 'Consultation' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Dental procedure' })).not.toBeInTheDocument();
  });

  it('uses the legacy consultation layout for the record note, copy, mapped paste, and grouped transfer', async () => {
    const { loadChartSnapshot } = await vi.importActual<typeof import('../../utils/chartQueries')>('../../utils/chartQueries');
    const patient = rawData('Bella');
    const readChart = vi.fn(async () => ({ data: {
      data: {
        ...patient,
        patientInfo: {
          ...patient.patientInfo,
          consultationLayout: {
            id: '11111111-1111-4111-8111-111111111111', name: 'Previous SOAP layout',
            fields: ['complaint', 'consultationHistory', 'gpPhysicalExam', 'gpVitals', 'gpDiagnostics', 'consultationAssessment', 'consultationPlan'],
          },
          consultationHistory: 'History from the visit.', gpPhysicalExam: 'Exam findings.', gpVitals: 'Vitals recorded.',
          consultationAssessment: 'Clinical assessment.', consultationPlan: 'Follow-up plan.',
        },
      },
      pims_sent_at: null,
    }, error: null }));
    const matchChart = vi.fn(() => ({ single: readChart, maybeSingle: async () => ({ data: null, error: null }) }));
    const destination = { tabId: 8, provider: 'pulse', origin: 'https://clinic.evetpractice.com', title: 'Open notes' };
    const rpc = vi.fn(async () => ({ data: {
      provider: destination.provider, origin: destination.origin, template_id: 'record-note-v1', version: 1,
      mapping: { gpPhysicalExam: 'Visit notes', gpVitals: 'Visit notes' },
    }, error: null }));
    mocks.supabase = {
      from: () => ({ select: () => ({ eq: matchChart }) }), rpc,
      auth: { onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
        callback('INITIAL_SESSION', { user: { id: 'user' } });
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      } },
    };
    mocks.load.mockImplementationOnce(loadChartSnapshot);
    mocks.transport.ping.mockResolvedValue({ version: '1' });
    const target = info('Bella');
    target.fields = ['History', 'Physical Exam', 'Assessment', 'Plan'].map(title => ({ title, kind: 'note', acceptsImage: false }));
    mocks.transport.inspect.mockResolvedValue(target);
    mocks.transport.send.mockResolvedValue({ ok: true, results: [{ fieldTitle: 'Plan', result: { ok: true } }] });
    mocks.transport.noteAutofill.mockImplementation(async (request: { operation: string; field?: string }) => request.operation === 'list'
      ? { state: 'targets', targets: [destination] }
      : request.operation === 'inspect'
        ? { state: 'fields', ...destination, fields: ['History', 'Visit notes', 'Assessment', 'Plan'] }
        : request.operation === 'prepare'
          ? { state: 'prepared', ...destination, field: request.field, ticket: `ticket-${request.field}`, existing_characters: 0, expires_at: new Date(Date.now() + 60_000).toISOString() }
          : { state: 'filled' });
    render(<ChartSend chart={chart} onBack={vi.fn()} sendFlag="on" />);
    const note = await screen.findByLabelText<HTMLTextAreaElement>('Record note');
    expect(matchChart).toHaveBeenCalledWith('id', chart.id);
    expect(note.value).toMatch(/History from the visit\.[\s\S]+Exam findings\.[\s\S]+Vitals recorded\.[\s\S]+Clinical assessment\.[\s\S]+Follow-up plan\./);
    fireEvent.click(screen.getByRole('button', { name: 'Copy all' }));
    await waitFor(() => expect(copyRichText).toHaveBeenCalledWith(expect.any(String), note.value, expect.any(String)));

    fireEvent.click(screen.getByRole('button', { name: 'Fill an open PIMS note' }));
    fireEvent.change(await screen.findByLabelText('Destination tab'), { target: { value: '8' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Map sections to fields' }));
    const prepare = screen.getByRole('button', { name: 'Prepare autofill' });
    await waitFor(() => expect(prepare).toBeEnabled());
    expect(rpc).toHaveBeenCalledWith('pims_note_mapping_get', { payload: { provider: 'pulse', origin: destination.origin, template_id: 'record-note-v1' } });
    fireEvent.click(prepare);
    fireEvent.click(await screen.findByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Paste all' }));
    await screen.findByText('Filled. Verify the notes and save them in PIMS.');
    const fills = mocks.transport.noteAutofill.mock.calls.map(([item]) => item).filter(item => item.operation === 'fill');
    expect(fills.map(item => item.ticket)).toEqual(['ticket-History', 'ticket-Visit notes', 'ticket-Assessment', 'ticket-Plan']);
    expect(fills[1].text).toMatch(/Exam findings\.[\s\S]+Vitals recorded\./);

    await send();
    const request = mocks.transport.send.mock.calls[0][0];
    expect(request.items.map((item: { fieldTitle: string }) => item.fieldTitle)).toEqual(['History', 'Physical Exam', 'Assessment', 'Plan']);
    expect(request.items[1].text).toMatch(/Exam findings\.[\s\S]+Vitals recorded\./);
  });

  it('opens the exact consultation and reloads the saved visit after a web edit', async () => {
    mocks.consultationEnabled = true;
    const createTab = vi.fn(async () => undefined);
    vi.stubGlobal('chrome', { tabs: { create: createTab } });
    try {
      open({ sendFlag: 'off', visitType: 'consultation' });
      fireEvent.click(await screen.findByRole('button', { name: 'Open consultation' }));
      expect(createTab).toHaveBeenCalledWith({ url: `${WEB_APP_ORIGIN}/#/chart/${chart.id}/consultation` });
      expect(mocks.transport.inspect).not.toHaveBeenCalled();

      const changed = rawData('Bella');
      const updated = normalizeSnapshot(changed as never);
      Object.assign(updated.patientInfo, { visitType: 'consultation', consultationPlan: 'Updated in the web visit.' });
      mocks.load.mockResolvedValueOnce({ snapshot: updated, pimsSentAt: null });
      fireEvent.click(screen.getByText('Record note', { selector: 'summary' }));
      const reload = screen.getByRole('button', { name: 'Reload saved note' });
      reload.focus();
      fireEvent.click(reload);
      await waitFor(() => expect(screen.getByLabelText<HTMLTextAreaElement>('Record note').value).toContain('Updated in the web visit.'));
      expect(reload).toHaveFocus();
      expect(screen.getByRole('button', { name: 'Reload saved note' })).toBe(reload);
      expect(mocks.load.mock.calls).toEqual([[chart.id], [chart.id]]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps the dental note reload available without opening a consultation from a legacy dental visit', async () => {
    mocks.consultationEnabled = true;
    open({ sendFlag: 'off' });
    await screen.findByLabelText('Record note');
    expect(screen.queryByRole('button', { name: 'Open consultation' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Record note', { selector: 'summary' }));
    expect(screen.getByRole('button', { name: 'Reload saved note' })).toBeInTheDocument();
  });

  it('keeps a saved consultation available for note transfer without dental-only tools', async () => {
    mocks.supabase = { auth: { onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
      callback('INITIAL_SESSION', { user: { id: 'user' } });
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    } } };
    open({ visitType: 'consultation', stored: true, fresh: true });
    const note = await screen.findByLabelText<HTMLTextAreaElement>('Record note');
    expect(note.value).toBe('My edited note');
    expect(screen.getByRole('button', { name: 'Open consultation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy all' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Fill an open PIMS note' })).toBeInTheDocument();
    expect(mocks.offscreen).toHaveBeenLastCalledWith(null);
    expect(mocks.independentPanel).not.toHaveBeenCalled();
    await send();
    expect(mocks.transport.send.mock.calls[0][0].items).toEqual([expect.objectContaining({ text: 'My edited note' })]);
  });

  it('blocks note transfer during a failed reload without disabling unrelated review panels', async () => {
    mocks.consultationEnabled = true;
    open();
    const send = await screen.findByRole('button', { name: 'Send' });
    await waitFor(() => expect(send).toBeEnabled());
    fireEvent.click(screen.getByText('Record note', { selector: 'summary' }));
    const reload = screen.getByRole('button', { name: 'Reload saved note' });
    let fail!: (error: Error) => void;
    mocks.load.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    mocks.independentPanel.mockClear();
    reload.focus();
    fireEvent.click(reload);
    expect(send).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Copy all' })).toBeDisabled();
    const otherControl = screen.getByRole('button', { name: /Back to charts/ });
    otherControl.focus();
    await act(async () => fail(new Error('Failed to fetch')));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(otherControl).toHaveFocus();
    expect(send).toBeDisabled();
    expect(reload).toBeEnabled();
    for (const panel of ['drafts', 'images', 'uploads', 'exam']) {
      expect(mocks.independentPanel).toHaveBeenCalledWith(panel, false);
      expect(mocks.independentPanel).not.toHaveBeenCalledWith(panel, true);
    }
    fireEvent.click(reload);
    await waitFor(() => expect(send).toBeEnabled());
  });

  it('sends the stored note when present', async () => {
    open({ stored: true });
    expect(((await screen.findByLabelText('Record note')) as HTMLTextAreaElement).value).toBe('My edited note');
    await send();
    expect(mocks.transport.send).toHaveBeenCalledTimes(1);
    const req = mocks.transport.send.mock.calls[0][0];
    expect(req.items).toEqual([expect.objectContaining({ fieldTitle: 'Plan', text: 'My edited note' })]);
    expect(req.expectedConsult).toEqual({ viewId: '3', recordId: '4521' });
    expect(await screen.findByText('Results')).toBeInTheDocument();
  });

  it('a mismatch confirmation names both patients and declining sends nothing', async () => {
    mocks.confirm.mockResolvedValue(false);
    open({ ezyvet: 'Max' });
    await send();
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
    expect(mocks.confirm.mock.calls[0][0]).toMatchObject({ message: 'ToothOps chart: Bella · PIMS consult: Max' });
    expect(mocks.transport.send).not.toHaveBeenCalled();
  });

  it('the already-sent confirmation uses pims_sent_at', async () => {
    open({ sentAt: '2026-11-02T09:00:00Z' });
    await send();
    const first = mocks.confirm.mock.calls[0][0] as { title: string };
    expect(first.title).toContain('Already sent on');
    expect(first.title).toContain(new Date('2026-11-02T09:00:00Z').toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' }));
  });

  it('re-inspects on tab change, and the send carries the inspected consult', async () => {
    open();
    await screen.findByRole('button', { name: 'Send' });
    expect(mocks.transport.inspect).toHaveBeenCalledTimes(1);
    await act(async () => { mocks.tab.activated!(); });
    await waitFor(() => expect(mocks.transport.inspect).toHaveBeenCalledTimes(2));
    await send();
    expect(mocks.transport.send.mock.calls[0][0].expectedConsult).toEqual({ viewId: '3', recordId: '4521' });
  });

  it('a load failure says so, not "damaged", and offers retry', async () => {
    mocks.load.mockRejectedValue(new Error('Failed to fetch'));
    render(<ChartSend chart={chart} onBack={vi.fn()} sendFlag="on" />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('a different patient at send time sends nothing, shows the new target and the notice', async () => {
    open();
    const btn = await screen.findByRole('button', { name: 'Send' });
    await waitFor(() => expect(btn).toBeEnabled());
    mocks.transport.inspect.mockResolvedValue(info('Max'));
    await act(async () => { fireEvent.click(btn); });
    expect(mocks.transport.send).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(await screen.findByText(/The PIMS consult changed/)).toBeInTheDocument();
    expect(screen.getByText(/PIMS: Max/)).toBeInTheDocument();
    // Pressing Send again, now that the target is on screen, goes ahead (after the mismatch check).
    await send();
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
  });

  it('a consult switch inside ezyVet at send time is caught even for the same patient name', async () => {
    open();
    const btn = await screen.findByRole('button', { name: 'Send' });
    await waitFor(() => expect(btn).toBeEnabled());
    const other = info('Bella');
    other.status!.consult = { viewId: '3', recordId: '9999' };
    mocks.transport.inspect.mockResolvedValue(other);
    await act(async () => { fireEvent.click(btn); });
    expect(mocks.transport.send).not.toHaveBeenCalled();
    expect(await screen.findByText(/The PIMS consult changed/)).toBeInTheDocument();
  });

  it('a focus re-inspect is quiet: no loading, no ping, mapping choices kept', async () => {
    open();
    await screen.findByRole('button', { name: 'Send' });
    const select = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '' } });
    const chosen = select.value;
    mocks.transport.ping.mockClear();
    let seenLoading = false;
    const obs = new MutationObserver(() => { if (screen.queryByText('Looking for PIMS…')) seenLoading = true; });
    obs.observe(document.body, { childList: true, subtree: true });
    await act(async () => { mocks.tab.activated!(); });
    obs.disconnect();
    await waitFor(() => expect(mocks.transport.inspect).toHaveBeenCalledTimes(2));
    expect(seenLoading).toBe(false);
    expect(mocks.transport.ping).not.toHaveBeenCalled();
    expect((screen.getAllByRole('combobox')[0] as HTMLSelectElement).value).toBe(chosen);
    expect(screen.queryByText(/The PIMS consult changed/)).toBeNull();
  });

  it('a focus re-inspect with a changed patient updates the target and shows the notice', async () => {
    open();
    await screen.findByRole('button', { name: 'Send' });
    mocks.transport.inspect.mockResolvedValue(info('Max'));
    await act(async () => { mocks.tab.activated!(); });
    expect(await screen.findByText(/The PIMS consult changed/)).toBeInTheDocument();
    expect(screen.getByText(/PIMS: Max/)).toBeInTheDocument();
  });

  it('a stored note edited before the chart changed shows the stale notice', async () => {
    open({ stored: true });
    expect(await screen.findByText(/The chart changed since this note was edited/)).toBeInTheDocument();
  });

  it('no stale notice for an up-to-date stored note or a generated one', async () => {
    const { unmount } = open({ stored: true, fresh: true });
    await screen.findByRole('button', { name: 'Send' });
    expect(screen.queryByText(/The chart changed since this note was edited/)).toBeNull();
    unmount();
    open();
    await screen.findByRole('button', { name: 'Send' });
    expect(screen.queryByText(/The chart changed since this note was edited/)).toBeNull();
  });

  it('a one-word chart name that only subset-matches the ezyVet name asks first (strict panel check)', async () => {
    mocks.confirm.mockResolvedValue(false);
    open({ ezyvet: 'Bella Smith', ownerName: 'Jane Jones' });
    await send();
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
    expect(mocks.confirm.mock.calls[0][0]).toMatchObject({ message: 'ToothOps chart: Bella · PIMS consult: Bella Smith' });
    expect(mocks.transport.send).not.toHaveBeenCalled();
  });

  it('chart name plus owner surname equal to the ezyVet name sends without asking', async () => {
    open({ ezyvet: 'Bella Smith', ownerName: 'Jane Smith' });
    await send();
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.transport.send).toHaveBeenCalledTimes(1);
  });

  it('equal unscoped patient numbers still ask when the names differ', async () => {
    mocks.confirm.mockResolvedValue(false);
    open({ ezyvet: 'Max', ezyvetNumber: '001' });
    await send();
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
    expect(mocks.transport.send).not.toHaveBeenCalled();
  });

  it('a different patient number asks first, even with the same name', async () => {
    mocks.confirm.mockResolvedValue(false);
    open({ ezyvet: 'Bella', ezyvetNumber: '2' });
    await send();
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
    expect(mocks.confirm.mock.calls[0][0]).toMatchObject({
      message: 'The chart is for Bella (number 1), but PIMS shows Bella (number 2).',
    });
    expect(mocks.transport.send).not.toHaveBeenCalled();
  });

  it('practice flag off: a notice and no Send, and ezyVet is not touched', async () => {
    open({ sendFlag: 'off' });
    expect(await screen.findByText('Sending to PIMS isn’t turned on for your practice.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    expect(mocks.transport.ping).not.toHaveBeenCalled();
    expect(mocks.transport.inspect).not.toHaveBeenCalled();
  });

  it('practice flag lookup failed: treated as off, with a retry', async () => {
    const onRetrySendFlag = vi.fn();
    open({ sendFlag: 'error', onRetrySendFlag });
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t check whether sending to PIMS is turned on');
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetrySendFlag).toHaveBeenCalledTimes(1);
  });

  it('a sent date remembered by the panel (later than pims_sent_at) makes Send ask first', async () => {
    open({ sentAt: null, knownSentAt: '2026-11-15T09:30:00Z' });
    await send();
    expect((mocks.confirm.mock.calls[0][0] as { title: string }).title).toContain('Already sent on');
  });

  it('reports a maybe-sent send to the panel and says when it is busy', async () => {
    const onSent = vi.fn();
    const onBusyChange = vi.fn();
    open({ onSent, onBusyChange });
    mocks.transport.send.mockRejectedValue(new Error('timeout'));
    await send();
    expect(onSent).toHaveBeenCalledTimes(1);
    expect(onBusyChange).toHaveBeenCalledWith(true);
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });
});


it.each(['filled', 'unknown'])('handles a %s note autofill outcome and keeps navigation locked during dispatch', async (outcome) => {
  mocks.consultationEnabled = true;
  mocks.supabase = { auth: { onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
    callback('INITIAL_SESSION', { user: { id: 'user' } });
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  } } };
  const destination = { provider: 'pulse', origin: 'https://pulse.example', title: 'Open encounter' };
  let finish: (value: { state: string }) => void = () => {};
  mocks.transport.noteAutofill.mockImplementation(async (request: { operation: string }) => request.operation === 'list'
    ? { state: 'targets', targets: [{ ...destination, tabId: 7 }] } : request.operation === 'inspect'
      ? { state: 'fields', ...destination, fields: ['Notes'] } : request.operation === 'prepare'
        ? { state: 'prepared', ...destination, field: 'Notes', ticket: 'ticket', existing_characters: 0, expires_at: new Date(Date.now() + 60_000).toISOString() }
        : new Promise(resolve => { finish = resolve; }));
  const onBusyChange = vi.fn(), onSent = vi.fn(); open({ onBusyChange, onSent, visitType: 'consultation' });
  mocks.transport.inspect.mockResolvedValue({ tab: { id: 7, title: 'Open encounter' }, candidates: 1, fields: [], status: { state: 'notConsult', provider: 'pulse', patientName: null, patientNumber: null, consult: null } });
  fireEvent.click(await screen.findByRole('button', { name: 'Fill an open PIMS note' }));
  await screen.findByRole('option', { name: /Open encounter/ });
  fireEvent.change(screen.getByLabelText('Destination tab'), { target: { value: '7' } });
  await screen.findByRole('option', { name: 'Notes' });
  fireEvent.change(screen.getByLabelText('Open field'), { target: { value: 'Notes' } });
  fireEvent.click(screen.getByRole('button', { name: 'Prepare autofill' }));
  fireEvent.click(await screen.findByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Fill selected field' }));
  expect(screen.getByRole('button', { name: /Back to charts/ })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Open consultation' })).toBeDisabled();
  fireEvent.click(screen.getByText('Record note', { selector: 'summary' }));
  expect(screen.getByRole('button', { name: 'Reload saved note' })).toBeDisabled();
  expect(onBusyChange).toHaveBeenLastCalledWith(true);
  await act(async () => finish({ state: outcome }));
  if (outcome === 'filled') await screen.findByText('Filled. Verify the notes and save them in PIMS.');
  else {
    const warning = 'The outcome is unknown. Check PIMS before preparing another attempt.';
    await screen.findByText(warning);
    const changed = rawData('Bella');
    const updated = normalizeSnapshot(changed as never);
    Object.assign(updated.patientInfo, { visitType: 'consultation', consultationPlan: 'Web edits after an uncertain transfer.' });
    mocks.load.mockResolvedValueOnce({ snapshot: updated, pimsSentAt: null });
    fireEvent.click(screen.getByRole('button', { name: 'Reload saved note' }));
    await waitFor(() => expect(screen.getByLabelText<HTMLTextAreaElement>('Record note').value).toContain('Web edits'));
    expect(screen.getByText(warning)).toBeInTheDocument();
  }
  expect(onSent).not.toHaveBeenCalled();
  expect(onBusyChange).toHaveBeenLastCalledWith(false);
});
