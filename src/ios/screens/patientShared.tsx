import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../../i18n/format';
import type { TFunction } from 'i18next';
import { List, ListRow, ListSection, type ListRowProps } from '../List';
import { SwipeRow, type SwipeAction } from '../SwipeRow';
import { ContextMenu, type MenuItem } from '../ContextMenu';
import { Icon, type IconName } from '../icons';
import { useStack, useStackScreenOptions } from '../Stack';
import { useAppShell, type AppTab } from '../AppShell';
import { useAppLibrary, type AppLibrary } from '../appData';
import { confirmDialog, friendlyDetail, toast } from '../../components/ui/dialogs';
import { groupByPatient, recallStatus, todayIso, type PatientGroup } from '../../components/chartLibraryData';
import type { CloudChartMeta, ChartListQuery } from '../../hooks/useCloudSync';
import { parseLocalDate } from '../../utils/localDate';
import { useTeam } from '../../hooks/useTeam';
import './patients.css';

/** Shared by the Patients and Rechecks tabs. */

type PT = TFunction<'patients'>;

const CHEVRON = 'chevron' as const;
const PLUS_ICON: IconName = 'plus';
const TRASH_ICON: IconName = 'trash';
const OPEN_ICON: IconName = 'doc-text';
const HISTORY_ICON: IconName = 'clock-arrow-circlepath';
const DESTRUCTIVE = 'destructive' as const;
const TINT = 'tint' as const;

/**
 * When a list screen loads: `shown` turns true the first time its tab is
 * active (nothing loads before that), and `token` changes when the library
 * changes (libraryVersion) while the tab is active, or when the tab is
 * shown again. A change while hidden waits for the next activation.
 */
export function useTabReload(tab: AppTab): { shown: boolean; token: string } {
  const { activeTab } = useAppShell();
  const library = useAppLibrary();
  const active = activeTab === tab;
  const version = library?.libraryVersion ?? 0;
  const [shown, setShown] = React.useState(active);
  const [activations, setActivations] = React.useState(0);
  const wasActive = React.useRef(active);
  React.useEffect(() => {
    if (active && !wasActive.current) {
      if (shown) setActivations((n) => n + 1);
      else setShown(true);
    }
    wasActive.current = active;
  }, [active, shown]);
  const token = React.useRef(`${version}:${activations}`);
  if (active) token.current = `${version}:${activations}`;
  return { shown, token: token.current };
}

/** "Nov 11, 2026" for a YYYY-MM-DD date, in the active language. */
export function formatChartDate(iso: string): string {
  return parseLocalDate(iso) ? formatDate(iso, 'medium') : iso;
}

/** "Nov 11, 2026" for a timestamp, in the active language. */
export function formatUpdated(ts: string): string {
  return formatDate(new Date(ts), 'medium');
}

/** The small coloured recheck label on a patient row. */
export function RecallLabel({ recall, today }: { recall: string; today: string }) {
  const { t } = useTranslation('patients');
  const status = recallStatus(recall, today);
  if (status === 'none') return null;
  const date = formatChartDate(recall);
  const text =
    status === 'overdue' ? t('recall.overdue', { date }) : status === 'due' ? t('recall.today') : t('recall.upcoming', { date });
  return <span className={`ios-recall ios-recall--${status}`}>{text}</span>;
}

export function confirmClearRecheck(t: PT, name: string): Promise<boolean> {
  return confirmDialog({
    title: t('clearDialog.title', { ns: 'library', name }),
    message: t('clearDialog.message', { ns: 'library' }),
    confirmLabel: t('clearDialog.confirm', { ns: 'library' }),
  });
}

export function confirmDeleteVisit(t: PT, v: CloudChartMeta, unnamedFallback: string): Promise<boolean> {
  const name = v.patient_name.trim() || unnamedFallback;
  return confirmDialog({
    title: v.chart_date
      ? t('confirmDelete.titleDated', { name, date: formatChartDate(v.chart_date) })
      : t('confirmDelete.title', { name }),
    message: t('deleteDialog.message', { ns: 'library' }),
    confirmLabel: t('confirmDelete.confirm'),
    danger: true,
  });
}

export function visitDateLabel(t: PT, v: CloudChartMeta): string {
  return v.chart_date ? formatChartDate(v.chart_date) : t('visits.undated');
}

/** Clears the recheck on every visit of the patient that has one, after
 *  confirming. Resolves true when cleared. Toasts failures. */
export async function clearPatientRecheck(
  t: PT,
  group: PatientGroup,
  clearRecalls: (ids: string[]) => Promise<void>,
  onBusy?: (busy: boolean) => void
): Promise<boolean> {
  const ids = group.visits.filter((v) => (v.recall_date ?? '').trim() !== '').map((v) => v.id);
  if (ids.length === 0 || !(await confirmClearRecheck(t, group.name))) return false;
  onBusy?.(true);
  try {
    // The library bumps libraryVersion, which refetches the lists.
    await clearRecalls(ids);
    return true;
  } catch (e) {
    toast(t('errors.clearRecall', { ns: 'library', error: friendlyDetail(e) }), { kind: 'error' });
    return false;
  } finally {
    onBusy?.(false);
  }
}

/** A patient's actions (swipe and long-press): Send reminder (with an
 *  owner email), Clear recheck (with a recheck), History (latest visit). */
export interface PatientAction {
  key: 'reminder' | 'clear' | 'history';
  label: string;
  icon: IconName;
  run(): void;
}

export function patientActions(t: PT, library: AppLibrary, g: PatientGroup, onBusy: (busy: boolean) => void): PatientAction[] {
  const reminder = g.ownerEmail && g.reminderChart ? g.reminderChart : null;
  const latest = g.visits[0];
  const out: PatientAction[] = [];
  if (reminder) out.push({ key: 'reminder', label: t('composer.send', { ns: 'reminders' }), icon: 'bell', run: () => library.sendReminder(reminder) });
  if (g.recall) {
    out.push({
      key: 'clear',
      label: t('clearDialog.confirm', { ns: 'library' }),
      icon: 'checkmark-circle',
      run: () => void clearPatientRecheck(t, g, library.clearRecalls, onBusy),
    });
  }
  out.push({ key: 'history', label: t('actions.history', { ns: 'library' }), icon: HISTORY_ICON, run: () => library.openHistory(latest.id, historyLabel(t, g.name, latest)) });
  return out;
}

/**
 * A patient row: swipe actions plus the long-press menu (Open, then the
 * actions). While one of its actions runs (`busy`) it is a dimmed,
 * disabled row with neither.
 */
export function PatientRow({ group, actions, swipe, busy, row }: {
  group: PatientGroup;
  actions: PatientAction[];
  swipe: SwipeAction[];
  busy: boolean;
  row: Omit<ListRowProps, 'disabled'>;
}) {
  const { t } = useTranslation('patients');
  const shell = useAppShell();
  if (busy) return <ListRow {...row} disabled />;
  const menu: MenuItem[] = [
    { label: t('actions.open'), icon: OPEN_ICON, onSelect: () => void shell.openChart(group.visits[0].id) },
    ...actions.map((a) => ({ label: a.label, icon: a.icon, onSelect: a.run })),
  ];
  return (
    <SwipeRow actions={swipe} label={group.name}>
      <ContextMenu items={menu}>
        <ListRow {...row} />
      </ContextMenu>
    </SwipeRow>
  );
}

/** The label ChartHistoryModal shows for a visit. */
export function historyLabel(t: PT, name: string, v: CloudChartMeta): string {
  return t('visits.historyLabel', { name, date: visitDateLabel(t, v) });
}

/** Visit filters that carry into the pushed visit list (doctor, species). */
export type VisitFilters = Pick<ChartListQuery, 'species' | 'createdBy'>;

/** Pushes a patient's visits onto the current tab's stack. */
export function usePushPatient(tab: AppTab) {
  const { push } = useStack();
  return React.useCallback(
    (group: PatientGroup, filters: VisitFilters = {}) =>
      push({
        id: `patient-${group.key}`,
        title: group.name,
        render: () => <PatientVisitsScreen initial={group} filters={filters} tab={tab} />,
      }),
    [push, tab]
  );
}

/**
 * A patient's visits (pushed). Starts from the group that was tapped and
 * refetches it when the library changes or the tab is shown again. Tap a
 * visit to open it in the Chart tab; swipe or long-press for Open /
 * History / Delete (the only delete, per visit, confirmed).
 */
export function PatientVisitsScreen({ initial, filters, tab }: { initial: PatientGroup; filters: VisitFilters; tab: AppTab }) {
  const { t } = useTranslation('patients');
  const library = useAppLibrary();
  const shell = useAppShell();
  const [group, setGroup] = React.useState<PatientGroup | null>(initial);
  const { token } = useTabReload(tab);
  const { doctors } = useDoctors(true);
  const unnamed = t('unnamed');
  const listCharts = library?.listCharts;

  const firstToken = React.useRef(token);
  React.useEffect(() => {
    if (token === firstToken.current || !listCharts) return undefined;
    let cancelled = false;
    const search = initial.number || (initial.key.startsWith('p:') ? initial.name : undefined);
    listCharts({ search, ...filters, sortKey: 'updated', sortDir: 'desc', limit: 500 })
      .then((page) => {
        if (!cancelled) setGroup(groupByPatient(page.rows, unnamed).find((g) => g.key === initial.key) ?? null);
      })
      .catch(() => { /* keep what's showing */ });
    return () => { cancelled = true; };
    // initial / filters are fixed for this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, listCharts]);

  const name = group?.name ?? initial.name;
  const latest = group?.visits[0];
  const newVisit = library && latest
    ? (
      <button
        type="button"
        className="ios-glass-button ios-glass-button--icon"
        aria-label={t('actions.newVisit')}
        onClick={() => void library.newVisit(latest.id)}
      >
        <Icon name={PLUS_ICON} />
      </button>
    )
    : null;
  useStackScreenOptions({ title: name, trailing: newVisit });

  if (!library) return null;

  const open = (v: CloudChartMeta) => void shell.openChart(v.id);
  const remove = async (v: CloudChartMeta) => {
    if (!(await confirmDeleteVisit(t, v, name))) return;
    try {
      await library.deleteChart(v.id);
    } catch (e) {
      toast(t('errors.delete', { ns: 'library', error: friendlyDetail(e) }), { kind: 'error' });
    }
  };

  if (!group || group.visits.length === 0) {
    return <List><p className="ios-empty">{t('visits.empty')}</p></List>;
  }

  return (
    <List className="ios-visits">
      <ListSection>
        {group.visits.map((v) => {
          const date = visitDateLabel(t, v);
          const swipe: SwipeAction[] = [
            { label: t('actions.delete'), icon: TRASH_ICON, tone: DESTRUCTIVE, onAction: () => void remove(v) },
            { label: t('actions.open'), icon: OPEN_ICON, tone: TINT, onAction: () => open(v) },
          ];
          const menu: MenuItem[] = [
            { label: t('actions.open'), icon: OPEN_ICON, onSelect: () => open(v) },
            { label: t('actions.history', { ns: 'library' }), icon: HISTORY_ICON, onSelect: () => library.openHistory(v.id, historyLabel(t, name, v)) },
            { label: t('actions.delete'), icon: TRASH_ICON, destructive: true, onSelect: () => void remove(v) },
          ];
          return (
            <SwipeRow key={v.id} actions={swipe} label={date}>
              <ContextMenu items={menu}>
                <ListRow
                  title={date}
                  subtitle={<VisitSubtitle visit={v} doctors={doctors} />}
                  accessory={CHEVRON}
                  onClick={() => open(v)}
                />
              </ContextMenu>
            </SwipeRow>
          );
        })}
      </ListSection>
    </List>
  );
}

/** "Dr Ames · Updated Nov 12, 2026" (doctor only on shared accounts). */
function VisitSubtitle({ visit, doctors }: { visit: CloudChartMeta; doctors: Map<string, string> }) {
  const { t } = useTranslation('patients');
  const doctor = doctors.get(visit.created_by);
  const date = formatUpdated(visit.updated_at);
  return <>{doctor ? t('visits.byDoctor', { doctor, date }) : t('visits.updated', { date })}</>;
}

/** The practice roster for the doctor filter and visit authors: members
 *  and user id → doctor name (or email). `doctors` is empty on a solo
 *  account, which has no doctor filter or labels (as on the website). */
export function useDoctors(enabled: boolean) {
  const team = useTeam(enabled);
  const byId = React.useMemo(
    () => new Map(team.members.map((m) => [m.userId, m.doctorName.trim() || m.email])),
    [team.members]
  );
  const doctors = React.useMemo(() => (byId.size > 1 ? byId : new Map<string, string>()), [byId]);
  return { members: team.members, doctors };
}

export { todayIso };
