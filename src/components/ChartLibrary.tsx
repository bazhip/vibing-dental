import React from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { formatDate, formatDateTime } from '../i18n/format';
import { localDateISO } from '../utils/localDate';

/** "Nov 11, 2026" — the same style as the Updated column. */
function formatChartDate(iso: string): string {
  return formatDate(iso, 'medium');
}
import { confirmDialog, friendlyDetail } from './ui/dialogs';
import { CloudChartMeta, ChartListQuery, ChartListPage } from '../hooks/useCloudSync';
import { useModalFocus } from '../hooks/useModalFocus';
import { useTeam } from '../hooks/useTeam';

interface ChartLibraryProps {
  listCharts: (query?: ChartListQuery) => Promise<ChartListPage>;
  onOpen: (id: string) => Promise<boolean | void>;
  onDelete: (id: string) => Promise<void>;
  /** Start a fresh visit for a patient, carrying identity + gone teeth
   *  from their most recent visit (by chart id). */
  onNewVisit: (latestChartId: string) => void;
  /** Open a visit's history (who saved each version, and when). */
  onOpenHistory?: (chartId: string, label: string) => void;
  /** Open the recheck-reminder composer prefilled from a saved chart. */
  onSendReminder: (chart: CloudChartMeta) => void;
  /** Clear the recheck reminders on these charts (recheck happened, or
   *  it's no longer wanted) so the patient leaves the Due list. */
  onClearRecalls: (chartIds: string[]) => Promise<void>;
  /** Clear everything and start a brand-new patient (confirms first). */
  onNewPatient: () => void | Promise<void>;
  /** Load a chart PDF made by this app back in for editing. */
  onLoadPdf: (file: File) => void | Promise<void>;
  /** Close the dialog (also called after opening a chart). */
  onClose: () => void;
}

const SPECIES_KEYS = {
  feline: 'species.feline',
  canine: 'species.canine',
  'feline-deciduous': 'species.felineDeciduous',
  'canine-deciduous': 'species.canineDeciduous',
} as const;

/** The species name in the active language (an unknown species is shown as stored). */
function speciesLabel(species: string): string {
  const key = SPECIES_KEYS[species as keyof typeof SPECIES_KEYS];
  return key ? i18n.t(key, { ns: 'app' }) : species ?? '—';
}

/** One animal's charts across visits. */
interface PatientGroup {
  key: string;
  name: string;
  number: string;
  owner: string;
  ownerPhone: string;
  ownerEmail: string;
  species: string;
  dentition: string;
  visits: CloudChartMeta[];
  /** The chart a reminder should be sent from (latest visit that carries
   *  an owner email, else the latest visit). */
  reminderChart: CloudChartMeta | null;
  latestUpdated: string;
  /** Soonest upcoming (or most overdue) recall across the patient's visits. */
  recall: string;
}

/** Species offered in the filter (the stored species values). */
const FILTER_SPECIES = ['canine', 'feline'] as const;

type SortKey = 'patient' | 'updated' | 'recall';
type SortDir = 'asc' | 'desc';

const SORT_LABELS = { patient: 'table.patient', updated: 'table.updated', recall: 'table.recheck' } as const;

/** Visits fetched per page — grouping happens on the loaded set, so a
 *  page comfortably covers a screenful of patients. */
const PAGE_SIZE = 200;

function todayIso(): string {
  return localDateISO();
}

/** Group charts by patient: patient number if present, else name. */
function groupByPatient(charts: CloudChartMeta[]): PatientGroup[] {
  const groups = new Map<string, PatientGroup>();
  for (const c of charts) {
    const num = c.patient_number.trim().toLowerCase();
    const name = c.patient_name.trim().toLowerCase();
    const key = num ? `n:${num}` : name ? `p:${name}` : `id:${c.id}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        name: c.patient_name.trim() || i18n.t('unnamedPatient', { ns: 'library' }),
        number: c.patient_number.trim(),
        owner: c.owner_name?.trim() || '',
        ownerPhone: c.owner_phone?.trim() || '',
        ownerEmail: c.owner_email?.trim() || '',
        species: c.species,
        dentition: c.dentition || 'permanent',
        visits: [],
        reminderChart: null,
        latestUpdated: c.updated_at,
        recall: c.recall_date || '',
      };
      groups.set(key, g);
    }
    g.visits.push(c);
    // Rows arrive newest-first, so the first-seen values are the latest.
    if (c.updated_at > g.latestUpdated) g.latestUpdated = c.updated_at;
    // Prefer a non-empty owner from any visit.
    if (!g.owner && c.owner_name?.trim()) g.owner = c.owner_name.trim();
    if (!g.ownerPhone && c.owner_phone?.trim()) g.ownerPhone = c.owner_phone.trim();
    if (!g.ownerEmail && c.owner_email?.trim()) g.ownerEmail = c.owner_email.trim();
    // Keep the soonest non-empty recall date across visits.
    if (c.recall_date && (!g.recall || c.recall_date < g.recall)) g.recall = c.recall_date;
    // The visit we'd remind from: prefer one that has an owner email.
    if (!g.reminderChart || (c.owner_email?.trim() && !g.reminderChart.owner_email?.trim())) {
      g.reminderChart = c;
    }
  }
  // Visits within a group: newest chart date first, then updated.
  const list = Array.from(groups.values());
  for (const g of list) {
    g.visits.sort((a, b) =>
      (b.chart_date || '').localeCompare(a.chart_date || '') ||
      b.updated_at.localeCompare(a.updated_at)
    );
  }
  return list;
}

export const ChartLibrary: React.FC<ChartLibraryProps> = ({
  listCharts,
  onOpen,
  onDelete,
  onNewVisit,
  onOpenHistory,
  onSendReminder,
  onClearRecalls,
  onNewPatient,
  onLoadPdf,
  onClose,
}) => {
  const { t } = useTranslation('library');
  const lng = i18n.language;
  const pdfInputRef = React.useRef<HTMLInputElement>(null);
  const [charts, setCharts] = React.useState<CloudChartMeta[] | null>(null);
  const [hasMore, setHasMore] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [query, setQuery] = React.useState('');
  // Search runs server-side — debounce so we query per pause, not per key.
  const [debouncedQuery, setDebouncedQuery] = React.useState('');
  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  const [error, setError] = React.useState('');
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [sortKey, setSortKey] = React.useState<SortKey>('updated');
  const [sortDir, setSortDir] = React.useState<SortDir>('desc');
  const [dueOnly, setDueOnly] = React.useState(false);
  const [dueCount, setDueCount] = React.useState(0);
  // Visit-level filters. Doctor filters by each chart's author — the
  // same patient can be seen by different doctors across visits, so
  // filtering happens before grouping and a patient's row shows only
  // the matching visits.
  const [doctorFilter, setDoctorFilter] = React.useState('');
  const [speciesFilter, setSpeciesFilter] = React.useState('');
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  // Mounted only while open, so the trap is always on.
  const modalRef = useModalFocus(true);

  // Team roster → author labels for shared charts. Solo accounts (or a
  // team of one) skip the doctor column and filter entirely.
  const team = useTeam(true);
  const doctorById = React.useMemo(
    () => new Map(team.members.map((m) => [m.userId, m.doctorName.trim() || m.email])),
    [team.members]
  );
  const showDoctors = doctorById.size > 1;

  // Everything the server needs to produce the visible set. Filters and
  // search happen in Postgres — the full library is searchable no matter
  // how many charts exist; pagination only decides how much is SHOWN.
  const listQuery = React.useMemo<ChartListQuery>(() => ({
    search: debouncedQuery.trim() || undefined,
    species: speciesFilter || undefined,
    createdBy: doctorFilter || undefined,
    dueOnly: dueOnly || undefined,
    sortKey,
    sortDir,
  }), [debouncedQuery, speciesFilter, doctorFilter, dueOnly, sortKey, sortDir]);

  // Monotonic request sequence: filters/search can change while a fetch
  // is in flight, and a slow page-0 response must not overwrite a newer
  // one (nor a stale Load-more append onto a re-filtered list).
  const requestSeqRef = React.useRef(0);

  const refresh = React.useCallback(async (keepCount?: number) => {
    const seq = ++requestSeqRef.current;
    setError('');
    try {
      // After a delete, re-fetch at least as many rows as were showing so
      // the user's scroll position doesn't collapse back to one page.
      const limit = Math.max(PAGE_SIZE, keepCount ?? 0);
      const page = await listCharts({ ...listQuery, offset: 0, limit });
      if (seq !== requestSeqRef.current) return; // superseded by a newer query
      setCharts(page.rows);
      setHasMore(page.hasMore);
    } catch (e) {
      if (seq !== requestSeqRef.current) return;
      setError(t('errors.load', { error: friendlyDetail(e) }));
    }
  }, [listCharts, listQuery, t]);

  React.useEffect(() => {
    setCharts(null);
    refresh();
  }, [refresh]);

  const loadMore = async () => {
    if (!charts || loadingMore) return;
    const seq = ++requestSeqRef.current;
    setLoadingMore(true);
    setError('');
    try {
      const page = await listCharts({ ...listQuery, offset: charts.length, limit: PAGE_SIZE });
      if (seq === requestSeqRef.current) {
        setCharts((prev) => [...(prev ?? []), ...page.rows]);
        setHasMore(page.hasMore);
      }
    } catch (e) {
      if (seq === requestSeqRef.current) {
        setError(t('errors.loadMore', { error: friendlyDetail(e) }));
      }
    } finally {
      // Always release the flag — if a newer refresh superseded this
      // fetch, its results were discarded and nothing is loading now.
      setLoadingMore(false);
    }
  };

  // The Due badge counts due PATIENTS across the whole library, not just
  // the loaded page — its own (small) query, grouped the same way.
  // Refreshable so clearing a recheck updates the badge immediately.
  const refreshDueCount = React.useCallback(() => {
    listCharts({ dueOnly: true, limit: 500 })
      .then((page) => {
        const today = todayIso();
        setDueCount(groupByPatient(page.rows).filter((g) => g.recall && g.recall <= today).length);
      })
      .catch(() => { /* badge only — never block the library on it */ });
  }, [listCharts]);

  React.useEffect(() => {
    refreshDueCount();
  }, [refreshDueCount]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const today = todayIso();

  // Search, filters, and Due all happened server-side — this is purely
  // grouping the returned visits into patients and ordering the groups.
  const groups = React.useMemo(() => {
    if (!charts) return null;
    const g = groupByPatient(charts);
    const cmp: Record<SortKey, (a: PatientGroup, b: PatientGroup) => number> = {
      patient: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      updated: (a, b) => a.latestUpdated.localeCompare(b.latestUpdated),
      // Empty recall sorts last regardless of direction.
      recall: (a, b) => (a.recall || '9999').localeCompare(b.recall || '9999'),
    };
    g.sort(cmp[sortKey]);
    if (sortDir === 'desc') g.reverse();
    return g;
    // The unnamed-patient label is part of each group, so a language change regroups.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charts, sortKey, sortDir, lng]);

  const setSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'patient' || key === 'recall' ? 'asc' : 'desc');
    }
  };

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const handleOpen = async (id: string) => {
    setBusyId(id);
    try {
      // false = cancelled at the unsaved-changes prompt: stay here.
      if ((await onOpen(id)) !== false) onClose();
    } catch (e) {
      setError(t('errors.open', { error: friendlyDetail(e) }));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (c: CloudChartMeta) => {
    const name = c.patient_name.trim();
    const when = c.chart_date ? ` (${formatChartDate(c.chart_date)})` : '';
    if (!(await confirmDialog({
      title: name ? t('deleteDialog.title', { name, when }) : t('deleteDialog.titleUnnamed', { when }),
      message: t('deleteDialog.message'),
      confirmLabel: t('deleteDialog.confirm'),
      danger: true,
    }))) return;
    setBusyId(c.id);
    try {
      await onDelete(c.id);
      await refresh(charts?.length ?? 0);
      refreshDueCount();
    } catch (e) {
      setError(t('errors.delete', { error: friendlyDetail(e) }));
    } finally {
      setBusyId(null);
    }
  };

  const handleClearRecalls = async (group: PatientGroup) => {
    const withRecall = group.visits.filter((v) => (v.recall_date ?? '').trim() !== '');
    if (withRecall.length === 0) return;
    if (!(await confirmDialog({
      title: t('clearDialog.title', { name: group.name }),
      message: t('clearDialog.message'),
      confirmLabel: t('clearDialog.confirm'),
    }))) return;
    setBusyId(withRecall[0].id);
    try {
      await onClearRecalls(withRecall.map((v) => v.id));
      await refresh(charts?.length ?? 0);
      refreshDueCount();
    } catch (e) {
      setError(t('errors.clearRecall', { error: friendlyDetail(e) }));
    } finally {
      setBusyId(null);
    }
  };

  const recallCell = (recall: string) => {
    if (!recall) return <span className="chart-library__cell chart-library__cell--recall chart-library__cell--empty">—</span>;
    const overdue = recall < today;
    const due = recall <= today;
    return (
      <span
        className={
          due
            ? `chart-library__cell chart-library__cell--recall chart-library__recall--${overdue ? 'overdue' : 'due'}`
            : 'chart-library__cell chart-library__cell--recall'
        }
      >
        {overdue
          ? t('recall.overdue', { date: formatChartDate(recall) })
          : due
          ? t('recall.today', { date: formatChartDate(recall) })
          : formatChartDate(recall)}
      </span>
    );
  };

  const sortHeader = (key: SortKey) => (
    <span
      role="columnheader"
      aria-sort={sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button type="button" className="chart-library__sort" onClick={() => setSort(key)}>
        {t(SORT_LABELS[key])}
        <span className="chart-library__sort-arrow" aria-hidden="true">
          {sortKey === key ? (sortDir === 'asc' ? '▲' : '▼') : ''}
        </span>
      </button>
    </span>
  );

  const heads = { patient: sortHeader('patient'), updated: sortHeader('updated'), recall: sortHeader('recall') };

  return (
    <div className="ai-settings-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={t('title')}>
      <div className="ai-settings-modal chart-library-modal" ref={modalRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <header className="ai-settings-header">
          <h2>{t('title')}</h2>
          <button type="button" className="pdf-preview-close" onClick={onClose} aria-label={t('actions.close', { ns: 'common' })}>
            ×
          </button>
        </header>

        <div className="chart-library-modal__body">
          <div className="chart-library__controls">
            <input
              type="search"
              className="chart-library__search"
              placeholder={t('search.placeholder')}
              aria-label={t('search.aria')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <select
              className="chart-library__filter-select"
              value={speciesFilter}
              onChange={(e) => setSpeciesFilter(e.target.value)}
              aria-label={t('filters.speciesAria')}
            >
              <option value="">{t('filters.allSpecies')}</option>
              {FILTER_SPECIES.map((sp) => (
                <option key={sp} value={sp}>{t(SPECIES_KEYS[sp], { ns: 'app' })}</option>
              ))}
            </select>
            {showDoctors && (
              <select
                className="chart-library__filter-select"
                value={doctorFilter}
                onChange={(e) => setDoctorFilter(e.target.value)}
                aria-label={t('filters.doctorAria')}
              >
                <option value="">{t('filters.allDoctors')}</option>
                {team.members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.doctorName.trim() || m.email}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              className="chart-library__filter"
              onClick={() => pdfInputRef.current?.click()}
              title={t('importPdfTitle')}
            >
              {t('importPdf')}
            </button>
            <button
              type="button"
              className="chart-library__filter chart-library__filter--primary"
              onClick={onNewPatient}
              title={t('newPatientTitle')}
            >
              {t('newPatient')}
            </button>
            <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) { void onLoadPdf(file); onClose(); }
                e.target.value = '';
              }}
            />
          </div>

          {error && <div className="login-error" role="alert">{error}</div>}

          {groups === null && !error && <div className="chart-library__empty">{t('loading')}</div>}

          {/* Only a truly empty library hides the table. A filter (search,
              Due, doctor, species) that matches nothing keeps the header
              row visible so its controls stay reachable. */}
          {groups !== null && groups.length === 0 && !query && !dueOnly && !doctorFilter && !speciesFilter && (
            <div className="chart-library__empty">
              {t('empty')}
            </div>
          )}

          {groups !== null && (groups.length > 0 || query || dueOnly || doctorFilter || speciesFilter) && (
            <div className="chart-library__table" role="table" aria-label={t('table.aria')}>
              {/* Header uses the exact same row/row-main structure as the
                  data rows so the six columns line up pixel-for-pixel. */}
              <div className="chart-library__row chart-library__head-row" role="row">
                <div className="chart-library__row-main chart-library__head-main">
                  {heads.patient}
                  <span role="columnheader">{t('table.number')}</span>
                  <span role="columnheader">{t('table.species')}</span>
                  <span role="columnheader">{t('table.visits')}</span>
                  {heads.updated}
                  {heads.recall}
                </div>
                <span className="chart-library__row-actions">
                  <button
                    type="button"
                    className={dueOnly ? 'chart-library__due-toggle chart-library__due-toggle--on' : 'chart-library__due-toggle'}
                    onClick={() => setDueOnly((v) => !v)}
                    aria-pressed={dueOnly}
                    title={t('dueTitle')}
                  >
                    {dueCount > 0 ? t('dueCount', { n: dueCount }) : t('due')}
                  </button>
                </span>
              </div>
              <div className="chart-library__scroll">
                {groups.length === 0 && (
                  <div className="chart-library__empty">
                    {query
                      ? t('noMatch.search')
                      : dueOnly
                      ? t('noMatch.due')
                      : t('noMatch.filters')}
                  </div>
                )}
                {groups.map((g) => {
                  const multi = g.visits.length > 1;
                  const isOpen = expanded.has(g.key);
                  const only = g.visits[0];
                  return (
                    <React.Fragment key={g.key}>
                      <div className="chart-library__row" role="row">
                        <button
                          type="button"
                          className="chart-library__row-main chart-library__group-main"
                          onClick={() => (multi ? toggle(g.key) : handleOpen(only.id))}
                          disabled={busyId === only.id}
                          aria-expanded={multi ? isOpen : undefined}
                          title={multi ? t('visitsExpand', { count: g.visits.length }) : t('openPatient', { name: g.name })}
                        >
                          <span role="cell" className="chart-library__patient">
                            {multi && <span className="chart-library__disclosure" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>}
                            <span className="chart-library__patient-main">
                              {g.name}
                              {(() => {
                                // Owner, plus the doctor for single-visit
                                // rows (multi-visit patients can have a
                                // different doctor per visit — those are
                                // labeled on the expanded visit rows).
                                const dr = showDoctors && !multi ? doctorById.get(only.created_by) : '';
                                const sub = [g.owner, dr].filter(Boolean).join(' · ');
                                return sub ? <span className="chart-library__owner">{sub}</span> : null;
                              })()}
                            </span>
                          </span>
                          <span role="cell" className={`chart-library__cell chart-library__cell--number${g.number ? '' : ' chart-library__cell--empty'}`}>{g.number || '—'}</span>
                          <span role="cell" className="chart-library__cell chart-library__cell--species">
                            {g.dentition === 'deciduous'
                              ? t('deciduousSuffix', { species: speciesLabel(g.species) })
                              : speciesLabel(g.species)}
                          </span>
                          <span role="cell" className="chart-library__cell">
                            {t('visits', { count: g.visits.length })}
                          </span>
                          <span role="cell" className="chart-library__cell chart-library__cell--date">
                            {formatDate(g.latestUpdated)}
                          </span>
                          {recallCell(g.recall)}
                        </button>
                        <span className="chart-library__row-actions">
                          {g.ownerEmail && g.reminderChart && (
                            <button
                              type="button"
                              className="chart-library__act"
                              onClick={() => onSendReminder(g.reminderChart!)}
                              title={t('actions.reminderTitle', { who: g.owner || g.ownerEmail })}
                            >
                              {t('actions.reminder')}
                            </button>
                          )}
                          {g.recall && (
                            <button
                              type="button"
                              className="chart-library__act chart-library__clear-recall"
                              onClick={() => handleClearRecalls(g)}
                              disabled={busyId !== null}
                              aria-label={t('actions.clearRecall', { name: g.name })}
                              title={t('actions.clearRecallTitle', { name: g.name })}
                            >
                              ×
                            </button>
                          )}
                          <button
                            type="button"
                            className="chart-library__act"
                            onClick={() => onNewVisit(g.visits[0].id)}
                            title={t('actions.newVisitTitle', { name: g.name })}
                          >
                            {t('actions.newVisit')}
                          </button>
                          {!multi && onOpenHistory && (
                            <button
                              type="button"
                              className="chart-library__delete chart-library__history"
                              onClick={() => onOpenHistory(only.id, `${g.name}${only.chart_date ? ` · ${formatChartDate(only.chart_date)}` : ''}`)}
                              title={t('actions.historyChartTitle', { name: g.name })}
                            >
                              {t('actions.history')}
                            </button>
                          )}
                          {!multi && (
                            <button
                              type="button"
                              className="chart-library__delete"
                              onClick={() => handleDelete(only)}
                              disabled={busyId === only.id}
                              aria-label={t('actions.deleteChart', { name: g.name })}
                            >
                              {t('actions.delete', { ns: 'common' })}
                            </button>
                          )}
                        </span>
                      </div>

                      {multi && isOpen &&
                        g.visits.map((v) => (
                          <div className="chart-library__row chart-library__visit" role="row" key={v.id}>
                            <button
                              type="button"
                              className="chart-library__row-main chart-library__visit-main"
                              onClick={() => handleOpen(v.id)}
                              disabled={busyId === v.id}
                              title={v.chart_date ? t('visit.openDated', { date: v.chart_date }) : t('visit.openUndated')}
                            >
                              <span role="cell" className="chart-library__visit-date">
                                {v.chart_date ? formatChartDate(v.chart_date) : t('visit.undated')}
                              </span>
                              <span role="cell" className="chart-library__cell">
                                {showDoctors && doctorById.get(v.created_by) && (
                                  <>{doctorById.get(v.created_by)} · </>
                                )}
                                {t('visit.updated', { when: formatDateTime(v.updated_at, lng, { dateStyle: 'medium', timeStyle: 'short' }) })}
                              </span>
                            </button>
                            <span className="chart-library__row-actions">
                              {onOpenHistory && (
                                <button
                                  type="button"
                                  className="chart-library__delete chart-library__history"
                                  onClick={() => onOpenHistory(v.id, `${g.name} · ${v.chart_date ? formatChartDate(v.chart_date) : t('visit.undated')}`)}
                                  title={t('actions.historyVisitTitle')}
                                >
                                  {t('actions.history')}
                                </button>
                              )}
                              <button
                                type="button"
                                className="chart-library__delete"
                                onClick={() => handleDelete(v)}
                                disabled={busyId === v.id}
                                aria-label={v.chart_date ? t('visit.deleteDated', { date: v.chart_date, name: g.name }) : t('visit.deleteUndated', { name: g.name })}
                              >
                                {t('actions.delete', { ns: 'common' })}
                              </button>
                            </span>
                          </div>
                        ))}
                    </React.Fragment>
                  );
                })}
                {hasMore && (
                  <div className="chart-library__more">
                    <button
                      type="button"
                      className="chart-library__filter"
                      onClick={loadMore}
                      disabled={loadingMore}
                    >
                      {loadingMore ? t('loading') : t('actions.loadMore')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
