import React from 'react';
import { CloudChartMeta } from '../hooks/useCloudSync';

interface ChartLibraryProps {
  listCharts: () => Promise<CloudChartMeta[]>;
  onOpen: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** Start a fresh visit for a patient, carrying identity + gone teeth
   *  from their most recent visit (by chart id). */
  onNewVisit: (latestChartId: string) => void;
  /** Open the recheck-reminder composer prefilled from a saved chart. */
  onSendReminder: (chart: CloudChartMeta) => void;
  /** Clear everything and start a brand-new patient (confirms first). */
  onNewPatient: () => void;
  /** Close the dialog (also called after opening a chart). */
  onClose: () => void;
}

const SPECIES_LABELS: Record<string, string> = {
  feline: 'Feline',
  canine: 'Canine',
  'feline-deciduous': 'Feline · Deciduous',
  'canine-deciduous': 'Canine · Deciduous',
};

/** One animal's charts across visits. */
interface PatientGroup {
  key: string;
  name: string;
  number: string;
  owner: string;
  ownerPhone: string;
  ownerEmail: string;
  species: string;
  visits: CloudChartMeta[];
  /** The chart a reminder should be sent from (latest visit that carries
   *  an owner email, else the latest visit). */
  reminderChart: CloudChartMeta | null;
  latestUpdated: string;
  /** Soonest upcoming (or most overdue) recall across the patient's visits. */
  recall: string;
}

type SortKey = 'patient' | 'updated' | 'recall';
type SortDir = 'asc' | 'desc';

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
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
        name: c.patient_name.trim() || 'Unnamed patient',
        number: c.patient_number.trim(),
        owner: c.owner_name?.trim() || '',
        ownerPhone: c.owner_phone?.trim() || '',
        ownerEmail: c.owner_email?.trim() || '',
        species: c.species,
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
  onSendReminder,
  onNewPatient,
  onClose,
}) => {
  const [charts, setCharts] = React.useState<CloudChartMeta[] | null>(null);
  const [query, setQuery] = React.useState('');
  const [error, setError] = React.useState('');
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [sortKey, setSortKey] = React.useState<SortKey>('updated');
  const [sortDir, setSortDir] = React.useState<SortDir>('desc');
  const [dueOnly, setDueOnly] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const refresh = React.useCallback(async () => {
    setError('');
    try {
      setCharts(await listCharts());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load charts.');
    }
  }, [listCharts]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const today = todayIso();

  const groups = React.useMemo(() => {
    if (!charts) return null;
    const q = query.trim().toLowerCase();
    let g = groupByPatient(charts);
    if (q) g = g.filter((x) => `${x.name} ${x.number} ${x.owner} ${x.ownerPhone}`.toLowerCase().includes(q));
    if (dueOnly) g = g.filter((x) => x.recall && x.recall <= today);
    const cmp: Record<SortKey, (a: PatientGroup, b: PatientGroup) => number> = {
      patient: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      updated: (a, b) => a.latestUpdated.localeCompare(b.latestUpdated),
      // Empty recall sorts last regardless of direction.
      recall: (a, b) => (a.recall || '9999').localeCompare(b.recall || '9999'),
    };
    g.sort(cmp[sortKey]);
    if (sortDir === 'desc') g.reverse();
    return g;
  }, [charts, query, dueOnly, sortKey, sortDir, today]);

  const dueCount = React.useMemo(() => {
    if (!charts) return 0;
    return groupByPatient(charts).filter((g) => g.recall && g.recall <= today).length;
  }, [charts, today]);

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
      await onOpen(id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open that chart.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (c: CloudChartMeta) => {
    const name = c.patient_name.trim() || 'this chart';
    const dateLabel = c.chart_date ? ` (${c.chart_date})` : '';
    if (!window.confirm(`Delete the ${name}${dateLabel} chart? This removes the cloud copy permanently.`)) return;
    setBusyId(c.id);
    try {
      await onDelete(c.id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete that chart.');
    } finally {
      setBusyId(null);
    }
  };

  const recallCell = (recall: string) => {
    if (!recall) return <span className="chart-library__cell chart-library__cell--recall">—</span>;
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
        {recall}
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
      <div className="ai-settings-modal chart-library-modal" onClick={(e) => e.stopPropagation()}>
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
            <button
              type="button"
              className={dueOnly ? 'chart-library__filter chart-library__filter--on' : 'chart-library__filter'}
              onClick={() => setDueOnly((v) => !v)}
              aria-pressed={dueOnly}
            >
              Due for recheck{dueCount > 0 ? ` (${dueCount})` : ''}
            </button>
            <button
              type="button"
              className="chart-library__filter"
              onClick={onNewPatient}
              title="Clear the working chart and start a brand-new patient"
            >
              + New patient
            </button>
          </div>

          {error && <div className="login-error" role="alert">{error}</div>}

          {charts !== null && charts.length >= 500 && (
            <p className="chart-library__sub">
              Showing the 500 most recently updated charts — older charts
              don't appear here or in search.
            </p>
          )}

          {groups === null && !error && <div className="chart-library__empty">Loading…</div>}

          {groups !== null && groups.length === 0 && (
            <div className="chart-library__empty">
              {query
                ? 'No patients match that search.'
                : dueOnly
                ? 'No patients are due for a recheck.'
                : 'No saved charts yet — they save automatically as you chart.'}
            </div>
          )}

          {groups !== null && groups.length > 0 && (
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
                <span className="chart-library__row-actions" aria-hidden="true" />
              </div>
              <div className="chart-library__scroll">
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
                              {g.owner && <span className="chart-library__owner">{g.owner}</span>}
                            </span>
                          </span>
                          <span role="cell" className="chart-library__cell">{g.number || '—'}</span>
                          <span role="cell" className="chart-library__cell chart-library__cell--species">
                            {SPECIES_LABELS[g.species] ?? g.species ?? '—'}
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
                          <button
                            type="button"
                            className="chart-library__act"
                            onClick={() => onNewVisit(g.visits[0].id)}
                            title={`Start a new visit for ${g.name}`}
                          >
                            + Visit
                          </button>
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
                                {v.chart_date || 'Undated visit'}
                              </span>
                              <span role="cell" className="chart-library__cell">
                                Updated {new Date(v.updated_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                              </span>
                            </button>
                            <span className="chart-library__row-actions">
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
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
