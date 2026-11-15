import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';
import i18n from '../i18n';
import type { InspectResult, SendResult } from '../extension/protocol';
import type { RecordNote } from '../utils/recordNote';
import { DEFAULT_EZYVET_MAP, effectiveMap, type PimsFieldMap } from '../utils/pims/mapping';
import type { ChartSnapshot as PreviewSnapshot } from './PdfPreviewModal';
import { EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS, type ChartSnapshot, type StoredRecordNote } from '../types';

const mocks = vi.hoisted(() => ({
  ping: vi.fn(),
  inspect: vi.fn(),
  send: vi.fn(),
  diagnose: vi.fn(),
  available: vi.fn(() => true),
  save: vi.fn(async () => {}),
  reset: vi.fn(async () => {}),
  saved: null as PimsFieldMap | null,
  markPimsSent: vi.fn(),
  render: vi.fn(async () => 'data:image/png;base64,AAAA'),
  confirm: vi.fn(async (_opts: { title: string; message?: unknown; confirmLabel?: string }) => true),
  toast: vi.fn(),
  copy: vi.fn(async () => 'rich' as const),
  supabase: null as unknown,
}));

vi.mock('../utils/pims/extensionBridge', () => ({
  ping: mocks.ping,
  inspect: mocks.inspect,
  send: mocks.send,
  diagnose: mocks.diagnose,
  extensionAvailable: mocks.available,
}));
vi.mock('../hooks/usePimsFieldMap', () => ({
  usePimsFieldMap: () => ({ map: effectiveMap(mocks.saved), save: mocks.save, reset: mocks.reset }),
}));
vi.mock('../utils/edgeFunctions', () => ({ markPimsSent: mocks.markPimsSent }));
vi.mock('../utils/pims/chartPicture', () => ({ renderChartPicture: mocks.render }));
vi.mock('./ui/dialogs', () => ({ confirmDialog: mocks.confirm, toast: mocks.toast }));
vi.mock('../utils/clipboard', () => ({ copyRichText: mocks.copy }));
vi.mock('../utils/supabaseClient', () => ({
  get supabase() { return mocks.supabase; },
  cloudEnabled: false,
}));

import { SendToEzyvetDialog } from './SendToEzyvetDialog';
import { RecordNotePanel } from './RecordNotePanel';

const t = i18n.t.bind(i18n);

const FIELDS = [
  { title: 'History', kind: 'note' as const, acceptsImage: false },
  { title: 'Physical Exam', kind: 'note' as const, acceptsImage: false },
  { title: 'Plan', kind: 'note' as const, acceptsImage: false },
  { title: 'Client Communication > Email', kind: 'email' as const, acceptsImage: true },
  { title: 'Discharge Summary', kind: 'dischargeSummary' as const, acceptsImage: true },
];

function writableWith(over: { state?: 'writable' | 'locked' | 'notConsult'; patientName?: string | null; candidates?: number } = {}): InspectResult {
  return {
    tab: { id: 7, title: 'Consult — ezyVet' },
    candidates: over.candidates ?? 1,
    status: {
      state: over.state ?? 'writable',
      patientName: over.patientName === undefined ? 'Bella Smith' : over.patientName,
      consult: { viewId: '3', recordId: '4521' },
    },
    fields: FIELDS,
  };
}

const note: RecordNote = {
  sections: [
    { key: 'header', heading: 'Dental procedure', lines: ['Bella — Dog'] },
    { key: 'findings', heading: 'Findings by tooth', lines: ['104: fractured'] },
    { key: 'treatment', heading: 'Treatment report', lines: ['Done'] },
  ],
};

const snap = { species: 'canine' } as unknown as PreviewSnapshot;

function dlg(over: Partial<React.ComponentProps<typeof SendToEzyvetDialog>> = {}) {
  const props: React.ComponentProps<typeof SendToEzyvetDialog> = {
    open: true,
    onClose: vi.fn(),
    note,
    stored: null,
    chartSnapshot: null,
    chartId: 'chart-1',
    patientName: 'Bella',
    sentAt: null,
    onSent: vi.fn(),
    ...over,
  };
  return { el: <SendToEzyvetDialog {...props} />, props };
}

const sendButton = () => screen.getByRole('button', { name: t('pims:actions.send') });
const select = (label: string) => screen.getByLabelText(label) as HTMLSelectElement;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.saved = null;
  mocks.supabase = null;
  mocks.available.mockReturnValue(true);
  mocks.ping.mockResolvedValue({ version: '1.0.0' });
  mocks.inspect.mockResolvedValue(writableWith());
  mocks.send.mockResolvedValue({ ok: true, results: [{ fieldTitle: 'Plan', result: { ok: true } }] } satisfies SendResult);
  mocks.markPimsSent.mockResolvedValue({ sentAt: '2026-11-15T10:00:00Z' });
  mocks.confirm.mockResolvedValue(true);
  mocks.diagnose.mockResolvedValue({
    diagnostics: { version: 'dev', state: 'writable', selectorHits: {}, fields: [], hasJaxmanager: true, hasHugerte: false, hasLexical: true },
    lastCodes: ['save_not_confirmed'],
  });
});
afterEach(cleanup);

describe('SendToEzyvetDialog', () => {
  it('not installed shows the explainer without an install link', async () => {
    mocks.ping.mockResolvedValue(null);
    render(dlg().el);
    expect(await screen.findByText(t('pims:install.title'))).toBeInTheDocument();
    expect(screen.getByText(t('pims:install.body'))).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
    expect(mocks.inspect).not.toHaveBeenCalled();
    // A cold or disabled extension can answer on a retry.
    mocks.ping.mockResolvedValue({ version: '1.0.0' });
    fireEvent.click(screen.getByRole('button', { name: t('pims:dialog.retry') }));
    await screen.findByText(t('pims:rows.heading'));
  });

  it('no tab offers retry', async () => {
    mocks.inspect.mockResolvedValue({ tab: null, candidates: 0, status: null, fields: [] });
    render(dlg().el);
    expect(await screen.findByText(t('pims:noTab'))).toBeInTheDocument();
    mocks.inspect.mockResolvedValue(writableWith());
    fireEvent.click(screen.getByRole('button', { name: t('pims:dialog.retry') }));
    await screen.findByText(t('pims:rows.heading'));
    expect(mocks.inspect).toHaveBeenCalledTimes(2);
  });

  it('locked consult explains', async () => {
    mocks.inspect.mockResolvedValue({ ...writableWith({ state: 'locked' }), fields: [] });
    render(dlg().el);
    expect(await screen.findByText(t('pims:state.locked'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('pims:actions.send') })).toBeNull();
    expect(screen.getByRole('button', { name: t('pims:actions.copyDiagnostic') })).toBeInTheDocument();
  });

  it('shows the target and which tab is used when there are several', async () => {
    mocks.inspect.mockResolvedValue(writableWith({ candidates: 2 }));
    render(dlg().el);
    expect(await screen.findByText(t('pims:target', { patient: 'Bella Smith', title: 'Consult — ezyVet' }))).toBeInTheDocument();
    expect(screen.getByText(t('pims:severalTabs', { title: 'Consult — ezyVet' }))).toBeInTheDocument();
  });

  it('rows default to the mapping and omit email', async () => {
    render(dlg({ chartSnapshot: snap }).el);
    await screen.findByText(t('pims:rows.heading'));
    expect(select('Findings by tooth').value).toBe('Physical Exam');
    expect(select('Treatment report').value).toBe('Plan');
    expect(select('Dental procedure').value).toBe('');
    const options = within(select('Findings by tooth')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual([t('pims:rows.dontSend'), 'History', 'Physical Exam', 'Plan', 'Discharge Summary']);
    // The picture row only offers fields that take images.
    const chart = select(t('pims:rows.chart'));
    expect(chart.value).toBe('Discharge Summary');
    expect(within(chart).getAllByRole('option').map((o) => o.textContent)).toEqual([t('pims:rows.dontSend'), 'Discharge Summary']);
  });

  it('a saved title not on the page shows as not on this page', async () => {
    mocks.saved = { findings: 'Assessment' };
    render(dlg().el);
    await screen.findByText(t('pims:rows.heading'));
    const s = select('Findings by tooth');
    expect(s.selectedOptions[0].textContent).toBe(t('pims:rows.notOnPage', { title: 'Assessment' }));
  });

  it('Send saves changed rows and Reset to defaults resets', async () => {
    render(dlg().el);
    await screen.findByText(t('pims:rows.heading'));
    fireEvent.change(select('Findings by tooth'), { target: { value: 'History' } });
    fireEvent.click(sendButton());
    await waitFor(() => expect(mocks.send).toHaveBeenCalled());
    expect(mocks.save).toHaveBeenCalledWith({ findings: 'History' });
    const items = mocks.send.mock.calls[0][0].items as { fieldTitle: string }[];
    expect(items.map((i) => i.fieldTitle)).toEqual(['History', 'Plan']);
  });

  it('Reset to defaults clears the choices', async () => {
    render(dlg().el);
    await screen.findByText(t('pims:rows.heading'));
    fireEvent.change(select('Findings by tooth'), { target: { value: 'History' } });
    fireEvent.click(screen.getByRole('button', { name: t('pims:rows.reset') }));
    await waitFor(() => expect(mocks.reset).toHaveBeenCalled());
    expect(select('Findings by tooth').value).toBe(DEFAULT_EZYVET_MAP.findings);
  });

  it('a name that only shares letters with the chart name asks (whole words only)', async () => {
    mocks.inspect.mockResolvedValue(writableWith({ patientName: 'Bellatrix Smith' }));
    mocks.confirm.mockResolvedValueOnce(false);
    render(dlg().el);
    await screen.findByText(t('pims:rows.heading'));
    fireEvent.click(sendButton());
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(1));
    expect(mocks.confirm.mock.calls[0][0]).toMatchObject({ confirmLabel: t('pims:mismatch.sendAnyway') });
  });

  it('mismatch needs Send anyway', async () => {
    mocks.inspect.mockResolvedValue(writableWith({ patientName: 'Max' }));
    mocks.confirm.mockResolvedValueOnce(false);
    render(dlg().el);
    await screen.findByText(t('pims:rows.heading'));
    fireEvent.click(sendButton());
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(1));
    expect(mocks.confirm.mock.calls[0][0]).toMatchObject({
      message: t('pims:mismatch.message', { chart: 'Bella', ezyvet: 'Max' }),
      confirmLabel: t('pims:mismatch.sendAnyway'),
    });
    await waitFor(() => expect(sendButton()).not.toBeDisabled());
    expect(mocks.send).not.toHaveBeenCalled();

    fireEvent.click(sendButton());
    await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(1));
    expect(mocks.send.mock.calls[0][0]).toMatchObject({
      tabId: 7,
      expectedPatient: 'Bella',
      confirmedEzyvetPatient: 'Max',
      expectedConsult: { viewId: '3', recordId: '4521' },
    });
  });

  it('an unreadable ezyVet name also asks', async () => {
    mocks.inspect.mockResolvedValue(writableWith({ patientName: null }));
    render(dlg().el);
    await screen.findByText(t('pims:targetNoPatient', { title: 'Consult — ezyVet' }));
    fireEvent.click(sendButton());
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
    expect(mocks.confirm.mock.calls[0][0].message).toBe(t('pims:mismatch.message', { chart: 'Bella', ezyvet: t('pims:mismatch.unknown') }));
  });

  it('Send is disabled while sending', async () => {
    let finish!: (r: SendResult) => void;
    mocks.send.mockReturnValue(new Promise<SendResult>((r) => { finish = r; }));
    render(dlg().el);
    await screen.findByText(t('pims:rows.heading'));
    fireEvent.click(sendButton());
    const busy = await screen.findByRole('button', { name: t('pims:actions.sending') });
    expect(busy).toBeDisabled();
    fireEvent.click(busy);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    finish({ ok: true, results: [] });
    await screen.findByText(t('pims:results.title'));
  });

  it('the close button is disabled during a pending send', async () => {
    let finish!: (r: SendResult) => void;
    mocks.send.mockReturnValue(new Promise<SendResult>((r) => { finish = r; }));
    const { el, props } = dlg();
    render(el);
    await screen.findByText(t('pims:rows.heading'));
    fireEvent.click(sendButton());
    await screen.findByRole('button', { name: t('pims:actions.sending') });
    const close = screen.getByRole('button', { name: t('common:actions.close') });
    expect(close).toBeDisabled();
    fireEvent.click(close);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(props.onClose).not.toHaveBeenCalled();
    finish({ ok: true, results: [] });
    await screen.findByText(t('pims:results.title'));
    for (const b of screen.getAllByRole('button', { name: t('common:actions.close') })) expect(b).not.toBeDisabled();
  });

  it('a second click before the re-render does not send twice', async () => {
    render(dlg().el);
    await screen.findByText(t('pims:rows.heading'));
    const b = sendButton();
    await act(async () => { b.click(); b.click(); });
    await screen.findByText(t('pims:results.title'));
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it('a send that fails mid-way says fields may be written and the next Send asks first', async () => {
    mocks.send.mockRejectedValueOnce(new Error('timeout'));
    const { el, props } = dlg();
    render(el);
    await screen.findByText(t('pims:rows.heading'));
    fireEvent.click(sendButton());
    expect(await screen.findByText(t('pims:errors.maybe_sent'))).toBeInTheDocument();
    expect(props.onSent).toHaveBeenCalledTimes(1);
    expect(mocks.markPimsSent).not.toHaveBeenCalled();
    mocks.confirm.mockResolvedValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: t('pims:dialog.retry') }));
    await screen.findByText(t('pims:rows.heading'));
    fireEvent.click(sendButton());
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(1));
    expect(mocks.confirm.mock.calls[0][0]).toMatchObject({ confirmLabel: t('pims:alreadySent.confirm') });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it('Send waits for the send-date lookup', async () => {
    let settle!: (v: { data: unknown; error: null }) => void;
    const maybeSingle = vi.fn(() => new Promise((r) => { settle = r; }));
    mocks.supabase = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) };
    render(dlg().el);
    await screen.findByText(t('pims:rows.heading'));
    expect(sendButton()).toBeDisabled();
    await act(async () => { settle({ data: { pims_sent_at: null }, error: null }); });
    expect(sendButton()).not.toBeDisabled();
  });

  it('a chart target not on this page is reported and not rendered', async () => {
    mocks.saved = { chart: 'Attachments' };
    render(dlg({ chartSnapshot: snap }).el);
    await screen.findByText(t('pims:rows.heading'));
    fireEvent.click(sendButton());
    await screen.findByText(t('pims:results.title'));
    expect(mocks.render).not.toHaveBeenCalled();
    expect(screen.getByText('Attachments').closest('li')).toHaveTextContent(t('pims:errors.field_not_found'));
  });

  it('results list and stamp', async () => {
    mocks.send.mockResolvedValue({
      ok: true,
      results: [
        { fieldTitle: 'Plan', result: { ok: true } },
        { fieldTitle: 'Physical Exam', result: { ok: false, code: 'editor_not_found' } },
      ],
    });
    const { el, props } = dlg();
    render(el);
    await screen.findByText(t('pims:rows.heading'));
    fireEvent.click(sendButton());
    await screen.findByText(t('pims:results.title'));
    const list = screen.getByRole('list');
    expect(within(list).getByText('Plan').closest('li')).toHaveTextContent(t('pims:results.sent'));
    expect(within(list).getByText('Physical Exam').closest('li')).toHaveTextContent(t('pims:errors.editor_not_found'));
    expect(mocks.markPimsSent).toHaveBeenCalledTimes(1);
    expect(mocks.markPimsSent).toHaveBeenCalledWith('chart-1');
    expect(props.onSent).toHaveBeenCalledWith('2026-11-15T10:00:00Z');
    expect(screen.getByRole('button', { name: t('pims:actions.copyDiagnostic') })).toBeInTheDocument();
  });

  it.each(['popup_not_closed', 'save_not_confirmed', 'save_button_not_found', 'extension_error'] as const)(
    'a %s failure may have saved: the next Send asks first, nothing is stamped',
    async (code) => {
      mocks.send.mockResolvedValue({ ok: true, results: [{ fieldTitle: 'Plan', result: { ok: false, code } }] });
      const { el, props } = dlg();
      render(el);
      await screen.findByText(t('pims:rows.heading'));
      fireEvent.click(sendButton());
      await screen.findByText(t('pims:results.title'));
      expect(props.onSent).toHaveBeenCalledTimes(1);
      expect(mocks.markPimsSent).not.toHaveBeenCalled();
      // The results page shows the remembered send date.
      expect(screen.getByText((_, el) => el?.tagName === 'P' && /ezyVet/.test(el.textContent ?? '') && el.className === 'patient-form__hint')).toBeInTheDocument();
    },
  );

  it('a per-field failure says to check ezyVet, not to try again', async () => {
    mocks.send.mockResolvedValue({
      ok: true,
      results: [
        { fieldTitle: 'Plan', result: { ok: false, code: 'extension_error' } },
        { fieldTitle: 'History', result: { ok: false, code: 'patient_changed' } },
        { fieldTitle: 'Physical Exam', result: { ok: false, code: 'not_writable' } },
      ],
    });
    render(dlg().el);
    await screen.findByText(t('pims:rows.heading'));
    fireEvent.click(sendButton());
    const list = await screen.findByRole('list');
    expect(within(list).getByText('Plan').closest('li')).toHaveTextContent(t('pims:errors.item_extension_error'));
    expect(within(list).getByText('History').closest('li')).toHaveTextContent(t('pims:errors.item_patient_changed'));
    expect(within(list).getByText('Physical Exam').closest('li')).toHaveTextContent(t('pims:errors.item_not_writable'));
  });

  it('a field that surely failed (e.g. field_not_found) does not count as sent', async () => {
    mocks.send.mockResolvedValue({ ok: true, results: [{ fieldTitle: 'Plan', result: { ok: false, code: 'field_not_found' } }] });
    const { el, props } = dlg();
    render(el);
    await screen.findByText(t('pims:rows.heading'));
    fireEvent.click(sendButton());
    await screen.findByText(t('pims:results.title'));
    expect(props.onSent).not.toHaveBeenCalled();
  });

  it('unresolved titles are reported as field_not_found and nothing is stamped when all fail', async () => {
    mocks.saved = { findings: 'Assessment', treatment: null };
    mocks.send.mockResolvedValue({ ok: true, results: [] });
    render(dlg().el);
    await screen.findByText(t('pims:rows.heading'));
    fireEvent.click(sendButton());
    await screen.findByText(t('pims:results.title'));
    expect(screen.getByText('Assessment').closest('li')).toHaveTextContent(t('pims:errors.field_not_found'));
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.markPimsSent).not.toHaveBeenCalled();
  });

  it('a refused send shows the reason and offers retry', async () => {
    mocks.send.mockResolvedValue({ ok: false, code: 'patient_changed' });
    render(dlg().el);
    await screen.findByText(t('pims:rows.heading'));
    fireEvent.click(sendButton());
    expect(await screen.findByText(t('pims:errors.patient_changed'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('pims:dialog.retry') })).toBeInTheDocument();
    expect(mocks.markPimsSent).not.toHaveBeenCalled();
  });

  it('picture is rendered and sent with the chart row', async () => {
    render(dlg({ chartSnapshot: snap }).el);
    await screen.findByText(t('pims:rows.heading'));
    fireEvent.click(sendButton());
    await waitFor(() => expect(mocks.send).toHaveBeenCalled());
    expect(mocks.render).toHaveBeenCalledWith(snap, { pre: t('pims:picture.pre'), post: t('pims:picture.post') });
    const items = mocks.send.mock.calls[0][0].items as { fieldTitle: string; pngDataUrl?: string }[];
    expect(items.find((i) => i.fieldTitle === 'Discharge Summary')?.pngDataUrl).toBe('data:image/png;base64,AAAA');
  });

  it("picture skipped when chart row is Don't send", async () => {
    render(dlg({ chartSnapshot: snap }).el);
    await screen.findByText(t('pims:rows.heading'));
    fireEvent.change(select(t('pims:rows.chart')), { target: { value: '' } });
    fireEvent.click(sendButton());
    await waitFor(() => expect(mocks.send).toHaveBeenCalled());
    expect(mocks.render).not.toHaveBeenCalled();
    expect(mocks.save).toHaveBeenCalledWith({ chart: null });
  });

  it('an edited note that splits keeps the section rows', async () => {
    const stored: StoredRecordNote = {
      text: 'DENTAL PROCEDURE\nBella — Dog\n\nFINDINGS BY TOOTH\n104: fractured, edited\n\nTREATMENT REPORT\nDone',
      source: 'edited', lng: 'en', basedOn: 'x',
    };
    render(dlg({ stored }).el);
    await screen.findByText(t('pims:rows.heading'));
    expect(select('Findings by tooth').value).toBe('Physical Exam');
    expect(screen.queryByText(t('pims:editedNotice'))).toBeNull();
    fireEvent.click(sendButton());
    await waitFor(() => expect(mocks.send).toHaveBeenCalled());
    const items = mocks.send.mock.calls[0][0].items as { fieldTitle: string; text?: string }[];
    expect(items.find((i) => i.fieldTitle === 'Physical Exam')?.text).toContain('104: fractured, edited');
  });

  it('edited note that cannot be split sends one block', async () => {
    const stored: StoredRecordNote = {
      text: 'DENTAL PROCEDURE\nBella\n\nMY FINDINGS\n104: fractured\n\nTREATMENT REPORT\nDone',
      source: 'edited', lng: 'en', basedOn: 'x',
    };
    render(dlg({ stored }).el);
    expect(await screen.findByText(t('pims:editedNotice'))).toBeInTheDocument();
    expect(screen.queryByLabelText('Findings by tooth')).toBeNull();
    expect(select(t('pims:rows.edited')).value).toBe('Plan');
    fireEvent.click(sendButton());
    await waitFor(() => expect(mocks.send).toHaveBeenCalled());
    expect(mocks.send.mock.calls[0][0].items).toEqual([
      expect.objectContaining({ fieldTitle: 'Plan', text: stored.text }),
    ]);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('the edited-note destination is saved and used next time', async () => {
    const stored: StoredRecordNote = {
      text: 'Typed from scratch',
      source: 'edited', lng: 'en', basedOn: 'x',
    };
    const first = render(dlg({ stored }).el);
    await screen.findByText(t('pims:editedNotice'));
    fireEvent.change(select(t('pims:rows.edited')), { target: { value: 'History' } });
    fireEvent.click(sendButton());
    await waitFor(() => expect(mocks.send).toHaveBeenCalled());
    expect(mocks.save).toHaveBeenCalledWith({ editedNote: 'History' });
    expect(mocks.send.mock.calls[0][0].items).toEqual([expect.objectContaining({ fieldTitle: 'History' })]);
    first.unmount();

    mocks.saved = { editedNote: 'History' };
    render(dlg({ stored }).el);
    await screen.findByText(t('pims:editedNotice'));
    expect(select(t('pims:rows.edited')).value).toBe('History');
  });

  it('already sent asks first', async () => {
    mocks.confirm.mockResolvedValueOnce(false);
    render(dlg({ sentAt: '2026-11-01T09:00:00Z' }).el);
    await screen.findByText(t('pims:rows.heading'));
    fireEvent.click(sendButton());
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(1));
    expect(mocks.confirm.mock.calls[0][0]).toMatchObject({ confirmLabel: t('pims:alreadySent.confirm') });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('reads the last send date for the chart when it is not passed', async () => {
    const maybeSingle = vi.fn(async () => ({ data: { pims_sent_at: '2026-11-02T09:00:00Z' }, error: null }));
    const eq = vi.fn(() => ({ maybeSingle }));
    const from = vi.fn(() => ({ select: () => ({ eq }) }));
    mocks.supabase = { from };
    mocks.confirm.mockResolvedValueOnce(false);
    render(dlg().el);
    await screen.findByText(t('pims:rows.heading'));
    await waitFor(() => expect(maybeSingle).toHaveBeenCalled());
    expect(from).toHaveBeenCalledWith('charts');
    expect(eq).toHaveBeenCalledWith('id', 'chart-1');
    fireEvent.click(sendButton());
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(1));
    expect(mocks.confirm.mock.calls[0][0]).toMatchObject({ confirmLabel: t('pims:alreadySent.confirm') });
  });

  it('a failed send-date read counts as never sent', async () => {
    mocks.supabase = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'denied' } }) }) }) }) };
    render(dlg().el);
    await screen.findByText(t('pims:rows.heading'));
    fireEvent.click(sendButton());
    await waitFor(() => expect(mocks.send).toHaveBeenCalled());
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it('copies the diagnostic report as JSON', async () => {
    mocks.inspect.mockResolvedValue({ ...writableWith({ state: 'locked' }), fields: [] });
    render(dlg().el);
    fireEvent.click(await screen.findByRole('button', { name: t('pims:actions.copyDiagnostic') }));
    await waitFor(() => expect(mocks.copy).toHaveBeenCalled());
    expect(mocks.diagnose).toHaveBeenCalledWith(7);
    const [, text] = mocks.copy.mock.calls[0] as unknown as [string, string];
    expect(JSON.parse(text)).toEqual({
      diagnostics: { version: 'dev', state: 'writable', selectorHits: {}, fields: [], hasJaxmanager: true, hasHugerte: false, hasLexical: true },
      lastCodes: ['save_not_confirmed'],
    });
  });
});

describe('RecordNotePanel Send to ezyVet button', () => {
  const snapshot: ChartSnapshot = {
    patientInfo: {
      patientName: 'Rex', patientNumber: '', ownerName: '', ownerPhone: '', ownerEmail: '',
      doctor: '', tech: '', date: '', complaint: '', treatmentReport: 'Done', recallDate: '',
      nerveBlocks: { ...EMPTY_NERVE_BLOCKS }, exam: { ...EMPTY_EXAM_FINDINGS },
    },
    toothData: [], species: 'canine', logo: 'socal',
    preMarks: {}, preComments: [], preStrokes: [],
    postMarks: {}, postComments: [], postStrokes: [],
  };
  const pims = { enabled: true, chartId: 'c1', patientName: 'Rex', sentAt: null };
  const panel = (over: Partial<React.ComponentProps<typeof RecordNotePanel>> = {}) => (
    <RecordNotePanel snapshot={snapshot} stored={null} onChange={() => {}} readOnly={false} {...over} />
  );
  const button = () => screen.queryByRole('button', { name: t('pims:dialog.open') });

  it('opens the dialog when the practice has it on and the extension can be reached', async () => {
    render(panel({ pims }));
    fireEvent.click(button()!);
    expect(await screen.findByRole('dialog', { name: t('pims:dialog.title') })).toBeInTheDocument();
  });

  it('remembers a send without a cloud chart, so reopening asks first', async () => {
    mocks.inspect.mockResolvedValue(writableWith({ patientName: 'Rex' }));
    render(panel({ pims: { ...pims, chartId: null } }));
    fireEvent.click(button()!);
    fireEvent.click(await screen.findByRole('button', { name: t('pims:actions.send') }));
    await screen.findByText(t('pims:results.title'));
    expect(mocks.markPimsSent).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button', { name: t('common:actions.close') })[0]);
    expect(screen.queryByRole('dialog')).toBeNull();

    mocks.confirm.mockResolvedValueOnce(false);
    fireEvent.click(button()!);
    fireEvent.click(await screen.findByRole('button', { name: t('pims:actions.send') }));
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(1));
    expect(mocks.confirm.mock.calls[0][0]).toMatchObject({ confirmLabel: t('pims:alreadySent.confirm') });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it('button hidden when practice flag is off or in native app', () => {
    const { unmount } = render(panel());
    expect(button()).toBeNull();
    unmount();
    const off = render(panel({ pims: { ...pims, enabled: false } }));
    expect(button()).toBeNull();
    off.unmount();
    // extensionAvailable() is false in the iOS app and without the extension bridge.
    mocks.available.mockReturnValue(false);
    render(panel({ pims }));
    expect(button()).toBeNull();
  });
});
