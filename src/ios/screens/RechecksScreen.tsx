import React from 'react';
import { useTranslation } from 'react-i18next';
import { NavBar } from '../NavBar';
import { List, ListRow, ListSection } from '../List';
import { type SwipeAction } from '../SwipeRow';
import { useAppLibrary } from '../appData';
import { friendlyError } from '../../components/ui/dialogs';
import { duePatients, type PatientGroup } from '../../components/chartLibraryData';
import type { CloudChartMeta } from '../../hooks/useCloudSync';
import { PatientRow, formatChartDate, patientActions, todayIso, usePushPatient, useTabReload } from './patientShared';

/**
 * Rechecks tab: patients whose recheck is due, from the same data as the
 * website's Due filter (listCharts({ dueOnly: true }), recheck date today
 * or earlier), in two sections: Overdue (before today) and Due today. No
 * "later" section (that would need a new query). Tap a patient for their
 * visits; swipe for Send reminder (today's composer) / Clear recheck;
 * long-press for Open plus those and History (as on Patients).
 */

const CHEVRON = 'chevron' as const;
const TAB = 'rechecks' as const;

/** Due patients split by date (soonest first within each section). */
export function groupRechecks(rows: CloudChartMeta[], today: string, unnamed: string) {
  const due = duePatients(rows, today, unnamed).sort(
    (a, b) => a.recall.localeCompare(b.recall) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );
  return {
    overdue: due.filter((g) => g.recall < today),
    today: due.filter((g) => g.recall === today),
  };
}

export function RechecksScreen() {
  const { t } = useTranslation('patients');
  const library = useAppLibrary();
  const { shown, token } = useTabReload(TAB);
  const pushPatient = usePushPatient(TAB);
  const [rows, setRows] = React.useState<CloudChartMeta[] | { error: unknown } | null>(null);
  const [retry, setRetry] = React.useState(0);
  const listCharts = library?.listCharts;

  React.useEffect(() => {
    if (!listCharts || !shown) return undefined;
    let cancelled = false;
    listCharts({ dueOnly: true, sortKey: 'recall', sortDir: 'asc', limit: 500 })
      .then((page) => { if (!cancelled) setRows(page.rows); })
      .catch((error: unknown) => { if (!cancelled) setRows({ error }); });
    return () => { cancelled = true; };
  }, [listCharts, shown, token, retry]);

  const today = todayIso();
  const unnamed = t('unnamed');
  const sections = React.useMemo(
    () => (Array.isArray(rows) ? groupRechecks(rows, today, unnamed) : null),
    [rows, today, unnamed]
  );

  const [busyKey, setBusyKey] = React.useState<string | null>(null);
  const row = (g: PatientGroup, overdue: boolean) => {
    if (!library) return null;
    const actions = patientActions(t, library, g, (busy) => setBusyKey(busy ? g.key : null));
    // Swipe: Send reminder / Clear recheck; History is in the long-press menu.
    const swipe: SwipeAction[] = actions
      .filter((a) => a.key !== 'history')
      .map((a) => ({ label: a.label, icon: a.icon, tone: a.key === 'reminder' ? 'tint' : 'default', onAction: a.run }));
    return (
      <PatientRow
        key={g.key}
        group={g}
        actions={actions}
        swipe={swipe}
        busy={busyKey === g.key}
        row={{
          title: g.name,
          subtitle: [g.owner, g.number ? t('row.number', { number: g.number }) : ''].filter(Boolean).join(' · ') || undefined,
          value: overdue ? <span className="ios-recall ios-recall--overdue">{formatChartDate(g.recall)}</span> : undefined,
          accessory: CHEVRON,
          onClick: () => pushPatient(g),
        }}
      />
    );
  };

  let body: React.ReactNode;
  if (!library) {
    body = <p className="ios-empty">{t('signIn')}</p>;
  } else if (rows && !Array.isArray(rows)) {
    body = (
      <>
        <p className="ios-empty" role="alert">{t('errors.load', { error: friendlyError(rows.error) })}</p>
        <ListSection>
          <ListRow title={t('retry')} onClick={() => setRetry((n) => n + 1)} />
        </ListSection>
      </>
    );
  } else if (!sections) {
    body = <p className="ios-empty">{t('loading')}</p>;
  } else if (sections.overdue.length === 0 && sections.today.length === 0) {
    body = (
      <div className="ios-empty ios-rechecks__empty">
        <p className="ios-rechecks__empty-title">{t('rechecks.empty')}</p>
        <p>{t('rechecks.emptyHint')}</p>
      </div>
    );
  } else {
    body = (
      <>
        {sections.overdue.length > 0 && (
          <ListSection header={t('rechecks.overdue')}>{sections.overdue.map((g) => row(g, true))}</ListSection>
        )}
        {sections.today.length > 0 && (
          <ListSection header={t('rechecks.today')}>{sections.today.map((g) => row(g, false))}</ListSection>
        )}
      </>
    );
  }

  return (
    <>
      <NavBar title={t('rechecks.title')} largeTitle />
      <List className="ios-rechecks">{body}</List>
    </>
  );
}
