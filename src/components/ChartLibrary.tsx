import React from 'react';
import './PatientsWorkspace.css';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { formatDate, formatDateTime } from '../i18n/format';

/** "Nov 11, 2026" — the same style as the Updated column. */
function formatChartDate(iso: string): string {
  return formatDate(iso, 'medium');
}
import { confirmDialog, friendlyDetail } from './ui/dialogs';
import { CloudChartMeta, ChartListQuery, ChartListPage } from '../hooks/useCloudSync';
import { useModalFocus } from '../hooks/useModalFocus';
import { useTeam } from '../hooks/useTeam';
import { todayIso, useChartLibraryList, type LibraryError, type PatientGroup, type SortKey, type ChartLibraryViewState } from './chartLibraryData';

/** Native disclosure keeps secondary actions in the tab order when open. */
function RowActions({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation('library');
  const ref = React.useRef<HTMLDetailsElement>(null);
  const position = () => {
    const details = ref.current;
    if (!details?.open) return;
    const anchor = details.querySelector('summary')!.getBoundingClientRect();
    const panel = details.querySelector<HTMLElement>('.chart-library__actions-panel')!;
    const width = Math.min(224, window.innerWidth - 24);
    panel.style.width = `${width}px`;
    panel.style.left = `${Math.max(12, Math.min(anchor.right - width, window.innerWidth - width - 12))}px`;
    const height = panel.scrollHeight;
    panel.style.top = `${anchor.bottom + height + 8 <= window.innerHeight ? anchor.bottom + 6 : Math.max(12, anchor.top - height - 6)}px`;
  };
  React.useEffect(() => {
    const dismiss = (event: Event) => {
      if (ref.current?.open && !ref.current.contains(event.target as Node)) ref.current.open = false;
    };
    const reposition = () => position();
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('focusin', dismiss);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('focusin', dismiss);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, []);
  const close = (el: HTMLDetailsElement) => {
    el.open = false;
    el.querySelector('summary')?.focus();
  };
  return (
    <details ref={ref} onToggle={position} className="chart-library__actions-menu" onKeyDown={(event) => {
      if (event.key === 'Escape' && event.currentTarget.open) {
        event.stopPropagation();
        close(event.currentTarget);
      }
    }}>
      <summary>{t('actions.menu')}<svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg></summary>
      <div className="chart-library__actions-panel" onMouseDown={(event) => {
        // Safari can blur the disclosure on a button press. The dialog then
        // reclaims focus and dismisses the panel before the click arrives.
        if (event.button === 0 && (event.target as HTMLElement).closest('button')) {
          event.preventDefault();
        }
      }} onClick={(event) => {
        if ((event.target as HTMLElement).closest('button')) {
          close(event.currentTarget.parentElement as HTMLDetailsElement);
        }
      }}>{children}</div>
    </details>
  );
}

interface ChartLibraryProps {
  rechecksOnly?: boolean;
  presentation?: 'modal' | 'page';
  viewState?: React.RefObject<ChartLibraryViewState | undefined>;
  listCharts: (query?: ChartListQuery) => Promise<ChartListPage>;
  reloadToken?: number;
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
  onLoadPdf: (file: File) => boolean | void | Promise<boolean | void>;
  /** Close the dialog (also called after opening a chart). */
  onClose: () => void;
}

const SPECIES_KEYS = {
  feline: 'species.feline',
  canine: 'species.canine',
  'feline-deciduous': 'species.felineDeciduous',
  'canine-deciduous': 'species.canineDeciduous',
  equine: 'species.equine',
  rabbit: 'species.rabbit',
} as const;

/** The species name in the active language (an unknown species is shown as stored). */
function speciesLabel(species: string): string {
  const key = SPECIES_KEYS[species as keyof typeof SPECIES_KEYS];
  return key ? i18n.t(key, { ns: 'app' }) : species ?? '—';
}

/** Catalog key for each failure (the cause follows in the message). */
const ERROR_KEYS = {
  load: 'errors.load',
  more: 'errors.loadMore',
  open: 'errors.open',
  delete: 'errors.delete',
  clear: 'errors.clearRecall',
} as const satisfies Record<LibraryError['kind'], string>;

/** Species offered in the filter (the stored species values). */
const FILTER_SPECIES = ['canine', 'feline', 'equine', 'rabbit'] as const;

const SORT_LABELS = { patient: 'table.patient', updated: 'table.updated', recall: 'table.recheck' } as const;

export const ChartLibrary: React.FC<ChartLibraryProps> = ({
  listCharts,
  reloadToken,
  onOpen,
  onDelete,
  onNewVisit,
  onOpenHistory,
  onSendReminder,
  onClearRecalls,
  onNewPatient,
  onLoadPdf,
  onClose,
  presentation = 'modal',
  rechecksOnly = false,
  viewState,
}) => {
  const asPage = presentation === 'page';
  const { t } = useTranslation('library');
  const lng = i18n.language;
  const pdfInputRef = React.useRef<HTMLInputElement>(null);
  const {
    query, setQuery,
    speciesFilter, setSpeciesFilter,
    doctorFilter, setDoctorFilter,
    dueOnly, setDueOnly,
    sortKey, sortDir, setSort,
    groups, hasMore, loadingMore, loadMore,
    dueCount,
    error: libraryError, setError: setLibraryError,
    busyId, setBusyId,
    deleteVisit, clearRecheck,
  } = useChartLibraryList({ listCharts, onDelete, onClearRecalls, unnamedLabel: t('unnamedPatient'), viewState, lockedDueOnly: rechecksOnly, reloadToken });
  const error = libraryError ? t(ERROR_KEYS[libraryError.kind], { error: friendlyDetail(libraryError.cause) }) : '';
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  // Only the modal presentation traps focus; pages keep normal document navigation.
  const modalRef = useModalFocus(!asPage);

  // Team roster → author labels for shared charts. Solo accounts (or a
  // team of one) skip the doctor column and filter entirely.
  const team = useTeam(true);
  const doctorById = React.useMemo(
    () => new Map(team.members.map((m) => [m.userId, m.doctorName.trim() || m.email])),
    [team.members]
  );
  const showDoctors = doctorById.size > 1;

  React.useEffect(() => {
    if (asPage) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, asPage]);

  const today = todayIso();

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
      setLibraryError({ kind: 'open', cause: e });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = (c: CloudChartMeta) => {
    const name = c.patient_name.trim();
    const when = c.chart_date ? ` (${formatChartDate(c.chart_date)})` : '';
    return deleteVisit(c, () => confirmDialog({
      title: name ? t('deleteDialog.title', { name, when }) : t('deleteDialog.titleUnnamed', { when }),
      message: t('deleteDialog.message'),
      confirmLabel: t('deleteDialog.confirm'),
      danger: true,
    }));
  };

  const handleClearRecalls = (group: PatientGroup) =>
    clearRecheck(group, () => confirmDialog({
      title: t('clearDialog.title', { name: group.name }),
      message: t('clearDialog.message'),
      confirmLabel: t('clearDialog.confirm'),
    }));

  const recallCell = (group: PatientGroup) => {
    const recall = group.recall;
    if (!recall) return <span className="chart-library__cell chart-library__cell--recall chart-library__cell--empty">—</span>;
    const overdue = recall < today;
    const due = recall <= today;
    return (
      <span
        data-label={t('table.recheck')}
        className={
          due
            ? `chart-library__cell chart-library__cell--recall chart-library__recall--${overdue ? 'overdue' : 'due'}`
            : 'chart-library__cell chart-library__cell--recall'
        }
      >
        <span className="chart-library__recall-date">{overdue
          ? t('recall.overdue', { date: formatChartDate(recall) })
          : due
          ? t('recall.today', { date: formatChartDate(recall) })
          : formatChartDate(recall)}</span>
        <button type="button" className="chart-library__remove-recheck"
          onClick={() => handleClearRecalls(group)} disabled={busyId !== null}
          aria-label={t('actions.clearRecall', { name: group.name })}
          title={t('actions.clearRecallTitle', { name: group.name })}>
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </button>
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
    <div className={asPage ? 'patients-workspace' : 'ai-settings-overlay'} onClick={asPage ? undefined : onClose} role={asPage ? 'region' : 'dialog'} aria-modal={asPage ? undefined : true} aria-label={t(rechecksOnly ? 'rechecks.title' : 'title')}>
      <div className={asPage ? "patients-workspace__content chart-library-modal" : "ai-settings-modal chart-library-modal"} ref={modalRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <header className={asPage ? 'patients-workspace__header' : 'ai-settings-header'}>
          <div>
            <h2>{t(rechecksOnly ? 'rechecks.title' : 'title')}</h2>
            {asPage && <p>{t(rechecksOnly ? 'rechecks.description' : 'workspace.description')}</p>}
          </div>
          <button type="button" className={asPage ? 'chart-library__filter' : 'pdf-preview-close'} onClick={onClose} aria-label={asPage ? t('workspace.backToVisit') : t('actions.close', { ns: 'common' })}>
            {asPage ? t('workspace.backToVisit') : '×'}
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
            {rechecksOnly ? (
              <span className="chart-library__due-toggle chart-library__due-toggle--on">
                {dueCount > 0 ? t('dueCount', { n: dueCount }) : t('due')}
              </span>
            ) : (
            <button
              type="button"
              className={dueOnly ? 'chart-library__due-toggle chart-library__due-toggle--on' : 'chart-library__due-toggle'}
              onClick={() => setDueOnly((v) => !v)}
              aria-pressed={dueOnly}
              title={t('dueTitle')}
            >
              {dueCount > 0 ? t('dueCount', { n: dueCount }) : t('due')}
            </button>
            )}
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
              className="chart-library__filter chart-library__filter--primary"
              onClick={onNewPatient}
              title={t('newPatientTitle')}
            >
              {t('newPatient')}
            </button>

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
                  <span role="columnheader">{t('table.finalized')}</span>
                  {heads.updated}
                  {heads.recall}
                </div>
                <span className="chart-library__row-actions">

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
                        <div className="chart-library__row-main chart-library__group-main" onClick={(event) => {
                          if (busyId !== null || (event.target as HTMLElement).closest('button, a, input, select, textarea, summary')) return;
                          void handleOpen(only.id);
                        }}>
                          <span role="cell" className="chart-library__patient">
                            <button type="button" className="chart-library__patient-main chart-library__open-patient"
                              onClick={() => handleOpen(only.id)} disabled={busyId === only.id}
                              title={t('openLatest', { name: g.name })}>
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
                            </button>
                          </span>
                          <span role="cell" className={`chart-library__cell chart-library__cell--number${g.number ? '' : ' chart-library__cell--empty'}`}>{g.number || '—'}</span>
                          <span role="cell" className="chart-library__cell chart-library__cell--species">
                            {g.dentition === 'deciduous'
                              ? t('deciduousSuffix', { species: speciesLabel(g.species) })
                              : speciesLabel(g.species)}
                          </span>
                          <span role="cell" className="chart-library__cell chart-library__cell--visits">
                            {t('visits', { count: g.visits.length })}
                          </span>
                          <span role="cell" data-label={t('table.finalized')} className="chart-library__cell chart-library__cell--finalized">
                            {multi ? t('finalized.count', { n: g.visits.filter(v => !!v.finalized_at).length, total: g.visits.length }) : t(only.finalized_at ? 'finalized.yes' : 'finalized.no')}
                          </span>
                          <span role="cell" data-label={t('table.updated')} className="chart-library__cell chart-library__cell--date">
                            {formatDate(g.latestUpdated)}
                          </span>
                          {recallCell(g)}
                        </div>
                        <span className="chart-library__row-actions">

                          <button
                            type="button"
                            className="chart-library__act chart-library__new-visit"
                            onClick={() => onNewVisit(g.visits[0].id)}
                            title={t('actions.newVisitTitle', { name: g.name })}
                          >
                            {t('actions.newVisit')}
                          </button>
                          {multi && (
                            <button type="button" className="chart-library__act" aria-expanded={isOpen}
                              title={t('visitsExpand', { count: g.visits.length })}
                              onClick={() => toggle(g.key)}>
                              {t('visits', { count: g.visits.length })} <span aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                            </button>
                          )}
                          {(!multi || (g.ownerEmail && g.reminderChart)) && <RowActions>
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
                          {!multi && onOpenHistory && (
                            <button
                              type="button"
                              className="chart-library__act chart-library__history"
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
                          </RowActions>}
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
                              <span role="cell" data-label={t('table.finalized')} className="chart-library__cell chart-library__cell--finalized">
                                {t(v.finalized_at ? 'finalized.yes' : 'finalized.no')}
                              </span>
                              <span role="cell" className="chart-library__cell">
                                {showDoctors && doctorById.get(v.created_by) && (
                                  <>{doctorById.get(v.created_by)} · </>
                                )}
                                {t('visit.updated', { when: formatDateTime(v.updated_at, lng, { dateStyle: 'medium', timeStyle: 'short' }) })}
                              </span>
                            </button>
                            <span className="chart-library__row-actions">
                              <RowActions>
                              {onOpenHistory && (
                                <button
                                  type="button"
                                  className="chart-library__act chart-library__history"
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
                              </RowActions>
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
        <footer className="chart-library-modal__footer">
            <button
              type="button"
              className="chart-library__filter"
              onClick={() => pdfInputRef.current?.click()}
              title={t('importPdfTitle')}
            >
              {t('importPdf')}
            </button>
            <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                try {
                  if ((await onLoadPdf(file)) !== false) onClose();
                } catch (cause) {
                  setLibraryError({ kind: 'open', cause });
                }
              }}
            />
        </footer>
      </div>
    </div>
  );
};
