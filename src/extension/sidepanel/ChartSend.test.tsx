import { vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS } from '../../types';
import type { InspectResult } from '../protocol';
import type { CloudChartMeta } from '../../utils/chartQueries';
import { effectiveMap } from '../../utils/pims/mapping';

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  confirm: vi.fn(async (_o: unknown) => true),
  transport: { ping: vi.fn(), inspect: vi.fn(), send: vi.fn(), diagnose: vi.fn(), appointments: vi.fn(), startChart: vi.fn(), takePendingPatient: vi.fn() },
  tab: { activated: null as null | (() => void) },
}));
vi.mock('../../utils/chartQueries', () => ({ loadChartSnapshot: mocks.load }));
vi.mock('./internalTransport', () => ({ internalTransport: mocks.transport }));
vi.mock('./OffscreenChartPicture', () => ({
  useOffscreenChartPicture: () => ({ element: null, render: async () => null, hasDiagrams: false }),
}));
vi.mock('../../hooks/usePimsFieldMap', () => ({
  usePimsFieldMap: () => ({ map: effectiveMap(null), save: async () => {}, reset: async () => {} }),
}));
vi.mock('../../utils/supabaseClient', () => ({ supabase: null, cloudEnabled: false }));
vi.mock('../../utils/edgeFunctions', () => ({ markPimsSent: vi.fn(async () => ({ sentAt: '2026-11-15T10:00:00Z' })) }));
vi.mock('../../components/ui/dialogs', async (orig) => ({
  ...(await orig<typeof import('../../components/ui/dialogs')>()),
  confirmDialog: mocks.confirm,
  toast: vi.fn(),
}));
vi.mock('../../utils/clipboard', () => ({ copyRichText: vi.fn(async () => 'rich') }));
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
} & Partial<React.ComponentProps<typeof ChartSend>>;

function open({ stored, fresh, ezyvet, ezyvetNumber = null, chartName, ownerName, sentAt, ...props }: OpenOpts = {}) {
  const opts = { stored, ezyvet, chartName, sentAt };
  const snapshot = normalizeSnapshot(rawData(chartName ?? 'Bella') as never);
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
  mocks.confirm.mockResolvedValue(true);
});
afterEach(cleanup);

const send = async () => {
  const btn = await screen.findByRole('button', { name: 'Send' });
  await waitFor(() => expect(btn).toBeEnabled());
  await act(async () => { fireEvent.click(btn); });
};

describe('ChartSend', () => {
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

  it('shows the generated note read-only when none is stored', async () => {
    open();
    const note = await screen.findByLabelText('Record note');
    expect(note).toHaveAttribute('readonly');
    expect((note as HTMLTextAreaElement).value).toContain('Bella');
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
