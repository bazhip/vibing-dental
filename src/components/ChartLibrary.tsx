import React from 'react';
import { parseLocalDate } from '../utils/localDate';

/** "Nov 11, 2026" — the same style as the Updated column. */
function formatChartDate(iso: string): string {
  const d = parseLocalDate(iso);
  return d ? d.toLocaleDateString(undefined, { dateStyle: 'medium' }) : iso;
}
import { confirmDialog, friendlyError } from './ui/dialogs';
import { CloudChartMeta, ChartListQuery, ChartListPage } from '../hooks/useCloudSync';
import { useModalFocus } from '../hooks/useModalFocus';
import { useTeam } from '../hooks/useTeam';
import { todayIso, useChartLibraryList, type LibraryError, type PatientGroup, type SortKey } from './chartLibraryData';

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

const SPECIES_LABELS: Record<string, string> = {
  feline: 'Feline',
  canine: 'Canine',
  'feline-deciduous': 'Feline · Deciduous',
  'canine-deciduous': 'Canine · Deciduous',
};

/** "Couldn’t …" prefixes for each failure (the cause follows). */
const ERROR_PREFIX: Record<LibraryError['kind'], string> = {
  load: 'Couldn’t load your charts.',
  more: 'Couldn’t load more charts.',
  open: 'Couldn’t open that chart.',
  delete: 'Couldn’t delete that visit.',
  clear: 'Couldn’t clear that recheck.',
};

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
  } = useChartLibraryList({ listCharts, onDelete, onClearRecalls });
  const error = libraryError ? `${ERROR_PREFIX[libraryError.kind]} ${friendlyError(libraryError.cause)}` : '';
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

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

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
    const name = c.patient_name.trim() || 'this chart';
    const dateLabel = c.chart_date ? ` (${formatChartDate(c.chart_date)})` : '';
    return deleteVisit(c, () => confirmDialog({
      title: `Delete ${name}${dateLabel}?`,
      message: 'This visit is removed from the cloud for everyone in your practice. This can’t be undone.',
      confirmLabel: 'Delete visit',
      danger: true,
    }));
  };

  const handleClearRecalls = (group: PatientGroup) =>
    clearRecheck(group, () => confirmDialog({
      title: `Clear ${group.name}’s recheck?`,
      message: 'Use this when the recheck happened without a new chart, or isn’t needed. They’ll drop off the Due list.',
      confirmLabel: 'Clear recheck',
    }));

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
        {formatChartDate(recall)}
        {overdue ? ' · overdue' : due ? ' · today' : ''}
      </span>
    );
  };

  const sortHeader = (key: SortKey, label: string) => (
    <span
      role="columnheader"
      aria-sort={sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button type="button" className="chart-library__sort" onClick={() => setSort(key)}>
        {label}
        <span className="chart-library__sort-arrow" aria-hidden="true">
          {sortKey === key ? (sortDir === 'asc' ? '▲' : '▼') : ''}
        </span>
      </button>
    </span>
  );

  return (
    <div className="ai-settings-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="My charts">
      <div className="ai-settings-modal chart-library-modal" ref={modalRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <header className="ai-settings-header">
          <h2>My charts</h2>
          <button type="button" className="pdf-preview-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="chart-library-modal__body">
          <div className="chart-library__controls">
            <input
              type="search"
              className="chart-library__search"
              placeholder="Search by patient name or number…"
              aria-label="Search charts"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <select
              className="chart-library__filter-select"
              value={speciesFilter}
              onChange={(e) => setSpeciesFilter(e.target.value)}
              aria-label="Filter by species"
            >
              <option value="">All species</option>
              <option value="canine">Canine</option>
              <option value="feline">Feline</option>
            </select>
            {showDoctors && (
              <select
                className="chart-library__filter-select"
                value={doctorFilter}
                onChange={(e) => setDoctorFilter(e.target.value)}
                aria-label="Filter by doctor"
              >
                <option value="">All doctors</option>
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
              title="Open a chart PDF made with this app to continue editing it"
            >
              Import chart PDF
            </button>
            <button
              type="button"
              className="chart-library__filter chart-library__filter--primary"
              onClick={onNewPatient}
              title="Clear the working chart and start a brand-new patient"
            >
              + New patient
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

          {groups === null && !error && <div className="chart-library__empty">Loading…</div>}

          {/* Only a truly empty library hides the table. A filter (search,
              Due, doctor, species) that matches nothing keeps the header
              row visible so its controls stay reachable. */}
          {groups !== null && groups.length === 0 && !query && !dueOnly && !doctorFilter && !speciesFilter && (
            <div className="chart-library__empty">
              No saved charts yet — they save automatically as you chart.
            </div>
          )}

          {groups !== null && (groups.length > 0 || query || dueOnly || doctorFilter || speciesFilter) && (
            <div className="chart-library__table" role="table" aria-label="Patients">
              {/* Header uses the exact same row/row-main structure as the
                  data rows so the six columns line up pixel-for-pixel. */}
              <div className="chart-library__row chart-library__head-row" role="row">
                <div className="chart-library__row-main chart-library__head-main">
                  {sortHeader('patient', 'Patient')}
                  <span role="columnheader">Patient #</span>
                  <span role="columnheader">Species</span>
                  <span role="columnheader">Visits</span>
                  {sortHeader('updated', 'Updated')}
                  {sortHeader('recall', 'Recheck')}
                </div>
                <span className="chart-library__row-actions">
                  <button
                    type="button"
                    className={dueOnly ? 'chart-library__due-toggle chart-library__due-toggle--on' : 'chart-library__due-toggle'}
                    onClick={() => setDueOnly((v) => !v)}
                    aria-pressed={dueOnly}
                    title="Show only patients due or overdue for a recheck"
                  >
                    Due{dueCount > 0 ? ` (${dueCount})` : ''}
                  </button>
                </span>
              </div>
              <div className="chart-library__scroll">
                {groups.length === 0 && (
                  <div className="chart-library__empty">
                    {query
                      ? 'No patients match that search.'
                      : dueOnly
                      ? 'No patients are due for a recheck.'
                      : 'No charts match those filters.'}
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
                          title={multi ? `${g.visits.length} visits — expand` : `Open ${g.name}`}
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
                            {(SPECIES_LABELS[g.species] ?? g.species ?? '—')}
                            {g.dentition === 'deciduous' ? ' · Deciduous' : ''}
                          </span>
                          <span role="cell" className="chart-library__cell">
                            {multi ? `${g.visits.length} visits` : '1 visit'}
                          </span>
                          <span role="cell" className="chart-library__cell chart-library__cell--date">
                            {new Date(g.latestUpdated).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                          </span>
                          {recallCell(g.recall)}
                        </button>
                        <span className="chart-library__row-actions">
                          {g.ownerEmail && g.reminderChart && (
                            <button
                              type="button"
                              className="chart-library__act"
                              onClick={() => onSendReminder(g.reminderChart!)}
                              title={`Send a recheck reminder to ${g.owner || g.ownerEmail}`}
                            >
                              Reminder
                            </button>
                          )}
                          {g.recall && (
                            <button
                              type="button"
                              className="chart-library__act chart-library__clear-recall"
                              onClick={() => handleClearRecalls(g)}
                              disabled={busyId !== null}
                              aria-label={`Clear ${g.name}'s recheck reminder`}
                              title={`Clear ${g.name}'s recheck reminder — e.g. after a recheck that didn't produce a new chart`}
                            >
                              ×
                            </button>
                          )}
                          <button
                            type="button"
                            className="chart-library__act"
                            onClick={() => onNewVisit(g.visits[0].id)}
                            title={`Start a new visit for ${g.name}`}
                          >
                            + Visit
                          </button>
                          {!multi && onOpenHistory && (
                            <button
                              type="button"
                              className="chart-library__delete chart-library__history"
                              onClick={() => onOpenHistory(only.id, `${g.name}${only.chart_date ? ` · ${formatChartDate(only.chart_date)}` : ''}`)}
                              title={`Who saved ${g.name}'s chart, and when`}
                            >
                              History
                            </button>
                          )}
                          {!multi && (
                            <button
                              type="button"
                              className="chart-library__delete"
                              onClick={() => handleDelete(only)}
                              disabled={busyId === only.id}
                              aria-label={`Delete chart for ${g.name}`}
                            >
                              Delete
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
                              title={`Open the ${v.chart_date || 'undated'} visit`}
                            >
                              <span role="cell" className="chart-library__visit-date">
                                {v.chart_date ? formatChartDate(v.chart_date) : 'Undated visit'}
                              </span>
                              <span role="cell" className="chart-library__cell">
                                {showDoctors && doctorById.get(v.created_by) && (
                                  <>{doctorById.get(v.created_by)} · </>
                                )}
                                Updated {new Date(v.updated_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                              </span>
                            </button>
                            <span className="chart-library__row-actions">
                              {onOpenHistory && (
                                <button
                                  type="button"
                                  className="chart-library__delete chart-library__history"
                                  onClick={() => onOpenHistory(v.id, `${g.name} · ${v.chart_date ? formatChartDate(v.chart_date) : 'Undated visit'}`)}
                                  title="Who saved this visit, and when"
                                >
                                  History
                                </button>
                              )}
                              <button
                                type="button"
                                className="chart-library__delete"
                                onClick={() => handleDelete(v)}
                                disabled={busyId === v.id}
                                aria-label={`Delete the ${v.chart_date || 'undated'} visit for ${g.name}`}
                              >
                                Delete
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
                      {loadingMore ? 'Loading…' : 'Load more charts'}
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
