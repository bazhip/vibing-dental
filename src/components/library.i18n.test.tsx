import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';
import i18n, { loadLanguage } from '../i18n';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../i18n/testing/pseudo';
import { localDateISO } from '../utils/localDate';
import type { CloudChartMeta } from '../hooks/useCloudSync';
import type { ChartRevision } from '../hooks/useChartHistory';
import { ChartLibrary } from './ChartLibrary';
import { ChartHistoryModal, revisionWhen } from './ChartHistoryModal';
import { RemindersModal } from './RemindersModal';
import { ReminderModal } from './ReminderModal';
import { defaultReminder, fillTemplate } from '../hooks/useReminderTemplate';
import { ReportTemplatesModal } from './ReportTemplatesModal';
import type { UseReportTemplatesReturn } from '../hooks/useReportTemplates';

const team = vi.hoisted(() => ({
  value: { loaded: true, role: 'owner', members: [] as unknown[], practice: { id: 'p1' } as unknown },
}));
vi.mock('../hooks/useTeam', () => ({ useTeam: () => team.value }));

const history = vi.hoisted(() => ({
  revisions: null as unknown[] | null,
  error: '',
  loadData: vi.fn(async () => ({})),
}));
vi.mock('../hooks/useChartHistory', () => ({
  useChartHistory: () => ({ revisions: history.revisions, error: history.error, loadData: history.loadData, reload: vi.fn() }),
}));
// The read-only chart preview is an operator surface (stays English): stub it so only the modal's own text is checked.
vi.mock('./AdminChartViewer', () => ({ ChartReadOnlyView: () => <div data-testid="chart-preview" /> }));
vi.mock('../hooks/useChartState', async (orig) => ({
  ...(await orig<typeof import('../hooks/useChartState')>()),
  isChartSnapshot: () => true,
  normalizeSnapshot: (d: unknown) => d,
}));
vi.mock('./ui/dialogs', async (orig) => ({
  ...(await orig<typeof import('./ui/dialogs')>()),
  confirmDialog: vi.fn(async () => true),
  toast: vi.fn(),
}));
vi.mock('../utils/supabaseClient', async (orig) => ({ ...(await orig<typeof import('../utils/supabaseClient')>()), supabase: null }));

beforeAll(() => {
  window.ResizeObserver = window.ResizeObserver ?? class { observe() {} unobserve() {} disconnect() {} };
});
beforeEach(async () => {
  team.value = { loaded: true, role: 'owner', members: [], practice: { id: 'p1' } };
  history.revisions = null;
  history.error = '';
  await installPseudoLocale();
});
afterEach(async () => {
  cleanup();
  await restoreLocale();
});

// Pet, owner and doctor names the test types in, plus chart dates, which the app shows as ISO.
const ALLOW: (string | RegExp)[] = [
  'Bella', 'Max', 'Dr Kaser', 'Tim', 'Ann Lee', 'a@b.co', 'Routine cleaning', 'Quarterly note',
  /^\d{4}-\d{2}-\d{2}$/,
  /^(Bella|Max|Ann Lee|Dr Kaser) · (Dr Kaser|Tim)$/,
];
const today = localDateISO();
const meta = (id: string, name: string, number: string, date: string, over: Partial<CloudChartMeta> = {}): CloudChartMeta => ({
  id, patient_name: name, patient_number: number, owner_name: '', owner_phone: '', owner_email: '',
  species: 'canine', dentition: 'permanent', chart_date: date, recall_date: '', updated_at: `${date}T12:00:00Z`, created_by: 'u1', ...over,
});

const noopProps = {
  onOpen: vi.fn(), onDelete: vi.fn(async () => {}), onNewVisit: vi.fn(), onOpenHistory: vi.fn(), onSendReminder: vi.fn(),
  onClearRecalls: vi.fn(async () => {}), onNewPatient: vi.fn(), onLoadPdf: vi.fn(), onClose: vi.fn(),
};
function library(rows: CloudChartMeta[], hasMore = false) {
  return render(<ChartLibrary {...noopProps} listCharts={async () => ({ rows, hasMore })} />);
}

describe('ChartLibrary', () => {
  it('empty library, loading and a load error', async () => {
    const { container, unmount } = library([]);
    expect(findUntranslated(container, ALLOW)).toEqual([]);
    await screen.findByText('⟦No saved charts yet — they save automatically as you chart.⟧');
    expect(findUntranslated(container, ALLOW)).toEqual([]);
    unmount();
    const failing = render(<ChartLibrary {...noopProps} listCharts={async () => { throw new Error('offline'); }} />);
    await screen.findByRole('alert');
    expect(screen.getByRole('alert').textContent).toContain('⟦Couldn’t load your charts.');
    expect(findUntranslated(failing.container, ALLOW)).toEqual([]);
  });

  it('one chart: singular visit count, recheck due today, owner and a reminder', async () => {
    const { container } = library([
      meta('a1', 'Bella', '11', '2026-11-12', { owner_name: 'Ann Lee', owner_email: 'a@b.co', recall_date: today }),
    ]);
    await screen.findByText('Bella');
    expect(screen.getByText('⟦1 visit⟧')).toBeInTheDocument();
    expect(screen.getByText(/· today⟧$/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '⟦Due (1)⟧' })).toBeInTheDocument();
    expect(findUntranslated(container, ALLOW)).toEqual([]);
  });

  it('three charts: plural count, sort headers, expanded visits, overdue recheck and the due filter', async () => {
    team.value = { ...team.value, members: [{ userId: 'u1', doctorName: 'Tim', email: 't@x.co' }, { userId: 'u2', doctorName: 'Dr Kaser', email: 'k@x.co' }] };
    const { container } = library([
      meta('a1', 'Bella', '11', '2026-11-12', { recall_date: '2020-01-01', created_by: 'u2' }),
      meta('b1', 'Max', '22', '2026-11-12'),
      meta('b2', 'Max', '22', '2026-10-01', { created_by: 'u2' }),
      meta('c1', '', '', '', { created_by: 'u1', updated_at: '2026-09-01T12:00:00Z' }),
    ], true);
    await screen.findByText('Bella');
    expect(screen.getByText('⟦2 visits⟧')).toBeInTheDocument();
    expect(screen.getByTitle('⟦2 visits — expand⟧')).toBeInTheDocument();
    expect(screen.getByText(/· overdue⟧$/)).toBeInTheDocument();
    expect(screen.getByText('⟦Unnamed patient⟧')).toBeInTheDocument();
    // sort headers, with aria-sort
    const heads = () => Array.from(container.querySelectorAll('[role=columnheader]'));
    expect(heads().map((h) => h.getAttribute('aria-sort'))).toEqual(['none', null, null, null, 'descending', 'none']);
    fireEvent.click(within(heads()[0] as HTMLElement).getByRole('button'));
    await waitFor(() => expect(heads()[0]?.getAttribute('aria-sort')).toBe('ascending'));
    expect(findUntranslated(container, ALLOW)).toEqual([]);
    // expand the two-visit patient
    fireEvent.click(screen.getByTitle('⟦2 visits — expand⟧'));
    expect(screen.getAllByText(/⟦Updated ⟦.*⟧⟧$/).length).toBe(2);
    expect(screen.getAllByTitle('⟦Open the 2026-10-01 visit⟧')).toHaveLength(1);
    expect(findUntranslated(container, ALLOW)).toEqual([]);
    // the Due toggle shows a count; a filter that matches nothing explains itself
    fireEvent.change(screen.getByLabelText('⟦Search charts⟧'), { target: { value: 'zzz' } });
    expect(findUntranslated(container, ALLOW)).toEqual([]);
  });

  it('the delete and clear-recheck confirmations are translated', async () => {
    const { confirmDialog } = await import('./ui/dialogs');
    library([meta('a1', 'Bella', '11', '2026-11-12', { recall_date: today })]);
    await screen.findByText('Bella');
    fireEvent.click(screen.getByRole('button', { name: '⟦Delete chart for Bella⟧' }));
    await waitFor(() => expect(confirmDialog).toHaveBeenCalledWith(expect.objectContaining({
      title: expect.stringMatching(/^⟦Delete Bella \(⟦.+⟧\)\?⟧$/),
      confirmLabel: '⟦Delete visit⟧',
    })));
    fireEvent.click(screen.getByRole('button', { name: "⟦Clear Bella's recheck reminder⟧" }));
    await waitFor(() => expect(confirmDialog).toHaveBeenCalledWith(expect.objectContaining({ confirmLabel: '⟦Clear recheck⟧' })));
  });

  it('shows the Updated date in French', async () => {
    await loadLanguage('fr');
    await i18n.changeLanguage('fr');
    library([meta('a1', 'Bella', '11', '2026-11-12', { recall_date: '2026-12-01' })]);
    await screen.findByText('Bella');
    expect(screen.getByText('12 nov. 2026')).toBeInTheDocument();
    expect(screen.getByText('1 déc. 2026')).toBeInTheDocument();
    expect(screen.getByText('1 visite')).toBeInTheDocument();
  });
});

const revisions: ChartRevision[] = [
  { id: 3, savedBy: 'u2', savedByName: 'Dr Kaser', startedAt: '2026-11-12T15:02:00Z', savedAt: '2026-11-12T15:40:00Z', note: '' },
  { id: 2, savedBy: 'u1', savedByName: '', startedAt: '2026-11-11T10:00:00Z', savedAt: '2026-11-11T10:00:20Z', note: '' },
  { id: 1, savedBy: null, savedByName: '', startedAt: '2026-11-10T09:00:00Z', savedAt: '2026-11-10T09:00:00Z', note: 'baseline' },
];

describe('ChartHistoryModal', () => {
  it('loading, error, empty and a list of versions with a version picked', async () => {
    const { container, rerender } = render(<ChartHistoryModal chartId="c1" onClose={() => {}} />);
    expect(findUntranslated(document.body, ALLOW)).toEqual([]);
    history.error = 'Network down';
    history.revisions = [];
    rerender(<ChartHistoryModal chartId="c1" onClose={() => {}} />);
    history.error = '';
    rerender(<ChartHistoryModal chartId="c1" onClose={() => {}} label="Bella · 2026-11-12" onOpenChart={() => {}} restoreHint="" />);
    expect(findUntranslated(document.body, ALLOW)).toEqual([]);
    history.revisions = revisions;
    rerender(<ChartHistoryModal chartId="c1" onClose={() => {}} label="Bella · 2026-11-12" onOpenChart={() => {}} onRestore={vi.fn(async () => true)} />);
    expect(findUntranslated(document.body, ALLOW)).toEqual([]);
    fireEvent.click(screen.getByText('⟦Someone outside your practice⟧').closest('button')!);
    await screen.findByTestId('chart-preview');
    expect(findUntranslated(document.body, ALLOW)).toEqual([]);
    expect(screen.getByRole('button', { name: '⟦Restore this version⟧' })).toBeInTheDocument();
    expect(container).toBeTruthy();
  });

  it('view-only shows the hint, and restoring confirms and toasts in the active language', async () => {
    const { confirmDialog, toast } = await import('./ui/dialogs');
    history.revisions = revisions;
    const onRestore = vi.fn(async () => true);
    const { rerender } = render(<ChartHistoryModal chartId="c1" onClose={() => {}} />);
    fireEvent.click(screen.getByText('⟦Someone outside your practice⟧').closest('button')!);
    await screen.findByTestId('chart-preview');
    expect(screen.getByText('⟦Choose Edit chart to restore an earlier version.⟧')).toBeInTheDocument();
    rerender(<ChartHistoryModal chartId="c1" onClose={() => {}} onRestore={onRestore} />);
    fireEvent.click(screen.getByRole('button', { name: '⟦Restore this version⟧' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('⟦Version restored.⟧', { kind: 'success' }));
    expect(confirmDialog).toHaveBeenCalledWith(expect.objectContaining({ title: '⟦Restore this version?⟧', confirmLabel: '⟦Restore⟧' }));
  });

  it('formats the version times in French', async () => {
    await loadLanguage('fr');
    await i18n.changeLanguage('fr');
    expect(revisionWhen(revisions[1])).toMatch(/^11 nov\. 2026/);
    expect(revisionWhen(revisions[0])).toMatch(/^12 nov\. 2026.* – /);
  });
});

describe('RemindersModal', () => {
  it('owner view, with unsaved edits, as a member and while the practice is set up', async () => {
    const { container, rerender } = render(<RemindersModal open onClose={() => {}} />);
    await waitFor(() => expect(screen.getByLabelText('⟦Subject⟧')).toBeInTheDocument());
    expect(findUntranslated(container, [...ALLOW, '{{patient}}', '{{owner}}', '{{practice}}', '{{recheck_date}}', /^Hi \{\{owner\}\}/, /^Time for \{\{patient\}\}/])).toEqual([]);
    fireEvent.change(screen.getByLabelText('⟦Subject⟧'), { target: { value: 'Quarterly note' } });
    expect(screen.getByRole('button', { name: '⟦Save⟧' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '⟦Cancel⟧' })).toBeInTheDocument();
    // The four placeholder tokens in the blurb are literal code, not prose.
    const allow = [...ALLOW, '{{patient}}', '{{owner}}', '{{practice}}', '{{recheck_date}}'];
    team.value = { ...team.value, role: 'member' };
    rerender(<RemindersModal open onClose={() => {}} />);
    expect(screen.getByText('⟦Only a practice owner can change the reminder template.⟧')).toBeInTheDocument();
    expect(findUntranslated(container, allow)).toEqual([]);
    team.value = { ...team.value, practice: null };
    rerender(<RemindersModal open onClose={() => {}} />);
    expect(findUntranslated(container, allow)).toEqual([]);
    team.value = { ...team.value, loaded: false };
    rerender(<RemindersModal open onClose={() => {}} />);
    expect(findUntranslated(container, allow)).toEqual([]);
  });

  it('closing with unsaved edits asks in the active language', async () => {
    const { confirmDialog } = await import('./ui/dialogs');
    render(<RemindersModal open onClose={() => {}} />);
    await waitFor(() => expect(screen.getByLabelText('⟦Subject⟧')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('⟦Subject⟧'), { target: { value: 'Quarterly note' } });
    fireEvent.click(screen.getByRole('button', { name: '⟦Cancel⟧' }));
    await waitFor(() => expect(confirmDialog).toHaveBeenCalledWith(expect.objectContaining({
      title: '⟦Discard reminder changes?⟧', confirmLabel: '⟦Discard⟧', cancelLabel: '⟦Keep editing⟧',
    })));
  });
});

describe('ReminderModal', () => {
  it('composer prefilled from the default template', async () => {
    const props = { open: true, onClose: () => {}, practiceId: '', practiceName: 'Elm Vet', chartId: 'c1', toEmail: 'a@b.co', patientName: 'Bella', ownerName: 'Ann Lee', recheckDate: '2026-12-01' };
    const { container, rerender } = render(<ReminderModal {...props} />);
    await screen.findByText('⟦Send reminder⟧');
    await waitFor(() => expect(screen.getByLabelText('⟦Subject⟧')).toBeInTheDocument());
    // The composer's text is owner-facing (practice language, here the standard English reminder from the
    // `client` catalog), so the pseudo-locale doesn't wrap it.
    const vars = { patient: 'Bella', owner: 'Ann Lee', practice: 'Elm Vet', recheckDate: '2026-12-01' };
    const standard = [defaultReminder('en').subject, defaultReminder('en').body].map((x) => fillTemplate(x, vars, 'en'));
    expect(findUntranslated(container, [...ALLOW, ...standard])).toEqual([]);
    rerender(<ReminderModal {...props} open={false} />);
    expect(container.textContent).toBe('');
  });
});

describe('ReportTemplatesModal', () => {
  const store = (templates: UseReportTemplatesReturn['templates']): UseReportTemplatesReturn => ({
    enabled: true, loaded: true, templates,
    create: vi.fn(async (name: string, body: string) => ({ id: 'n1', name, body })),
    update: vi.fn(async () => {}), remove: vi.fn(async () => {}),
  });

  it('empty list, a name error, then templates with one picked', async () => {
    const { container, rerender } = render(<ReportTemplatesModal open onClose={() => {}} store={store([])} />);
    expect(findUntranslated(container, ALLOW)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: '⟦Save template⟧' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('⟦Give the template a name — it labels it in the insert menu.⟧');
    expect(findUntranslated(container, ALLOW)).toEqual([]);
    rerender(<ReportTemplatesModal open onClose={() => {}} store={store([{ id: 't1', name: 'Routine cleaning', body: 'x' }, { id: 't2', name: ' ', body: 'Quarterly note' }])} />);
    fireEvent.click(screen.getByText('⟦Untitled⟧'));
    expect(screen.getByRole('button', { name: '⟦Save changes⟧' })).toBeInTheDocument();
    expect(findUntranslated(container, ALLOW)).toEqual([]);
  });

  it('deleting asks in the active language', async () => {
    const { confirmDialog } = await import('./ui/dialogs');
    const s = store([{ id: 't1', name: 'Routine cleaning', body: 'x' }]);
    render(<ReportTemplatesModal open onClose={() => {}} store={s} />);
    fireEvent.click(screen.getByText('Routine cleaning'));
    fireEvent.click(screen.getByRole('button', { name: '⟦Delete⟧' }));
    await waitFor(() => expect(confirmDialog).toHaveBeenCalledWith(expect.objectContaining({
      title: '⟦Delete “Routine cleaning”?⟧', confirmLabel: '⟦Delete template⟧',
    })));
    await waitFor(() => expect(s.remove).toHaveBeenCalledWith('t1'));
  });
});
