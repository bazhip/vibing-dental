import React from 'react';
import { CloudChartMeta } from '../hooks/useCloudSync';

interface ChartLibraryProps {
  listCharts: () => Promise<CloudChartMeta[]>;
  onOpen: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** Close the dialog (also called after opening a chart). */
  onClose: () => void;
}

const SPECIES_LABELS: Record<string, string> = {
  feline: 'Feline',
  canine: 'Canine',
  'feline-deciduous': 'Feline · Deciduous',
  'canine-deciduous': 'Canine · Deciduous',
};

type SortKey = 'patient' | 'date' | 'updated';
type SortDir = 'asc' | 'desc';

const COMPARATORS: Record<SortKey, (a: CloudChartMeta, b: CloudChartMeta) => number> = {
  patient: (a, b) =>
    a.patient_name.localeCompare(b.patient_name, undefined, { sensitivity: 'base' }),
  // chart_date is yyyy-mm-dd, so string compare sorts chronologically.
  date: (a, b) => a.chart_date.localeCompare(b.chart_date),
  updated: (a, b) => a.updated_at.localeCompare(b.updated_at),
};

/**
 * "My charts" — the practice's saved-chart browser, presented as a
 * dialog over the working chart like the app's other popups. Search
 * filters client-side; column headers sort; rows open, the trailing
 * button deletes.
 */
export const ChartLibrary: React.FC<ChartLibraryProps> = ({
  listCharts,
  onOpen,
  onDelete,
  onClose,
}) => {
  const [charts, setCharts] = React.useState<CloudChartMeta[] | null>(null);
  const [query, setQuery] = React.useState('');
  const [error, setError] = React.useState('');
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [sortKey, setSortKey] = React.useState<SortKey>('updated');
  const [sortDir, setSortDir] = React.useState<SortDir>('desc');

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

  const rows = React.useMemo(() => {
    if (!charts) return null;
    const q = query.trim().toLowerCase();
    const filtered = q
      ? charts.filter((c) =>
          `${c.patient_name} ${c.patient_number}`.toLowerCase().includes(q)
        )
      : charts;
    const sorted = [...filtered].sort(COMPARATORS[sortKey]);
    if (sortDir === 'desc') sorted.reverse();
    return sorted;
  }, [charts, query, sortKey, sortDir]);

  const setSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Names read naturally A→Z; dates newest-first.
      setSortDir(key === 'patient' ? 'asc' : 'desc');
    }
  };

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
    if (!window.confirm(`Delete ${name}? This removes the cloud copy permanently.`)) return;
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
          <input
            type="search"
            className="chart-library__search"
            placeholder="Search by patient name or number…"
            aria-label="Search charts"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />

          {error && <div className="login-error" role="alert">{error}</div>}

          {charts !== null && charts.length >= 500 && (
            <p className="chart-library__sub">
              Showing the 500 most recently updated charts — older charts
              don't appear here or in search.
            </p>
          )}

          {rows === null && !error && (
            <div className="chart-library__empty">Loading…</div>
          )}

          {rows !== null && rows.length === 0 && (
            <div className="chart-library__empty">
              {query
                ? 'No charts match that search.'
                : 'No saved charts yet — they save automatically as you chart.'}
            </div>
          )}

          {rows !== null && rows.length > 0 && (
            <div className="chart-library__table" role="table" aria-label="Saved charts">
              <div className="chart-library__head-row" role="row">
                {sortHeader('patient', 'Patient')}
                <span role="columnheader">Patient #</span>
                <span role="columnheader">Species</span>
                {sortHeader('date', 'Chart date')}
                {sortHeader('updated', 'Updated')}
                <span role="columnheader">
                  <span className="visually-hidden">Actions</span>
                </span>
              </div>
              <div className="chart-library__scroll">
                {rows.map((c) => (
                  <div key={c.id} className="chart-library__row" role="row">
                    <button
                      type="button"
                      className="chart-library__row-main"
                      onClick={() => handleOpen(c.id)}
                      disabled={busyId === c.id}
                      title={`Open the chart for ${c.patient_name.trim() || 'unnamed patient'}`}
                    >
                      <span role="cell" className="chart-library__patient">
                        {c.patient_name.trim() || 'Unnamed patient'}
                      </span>
                      <span role="cell" className="chart-library__cell">
                        {c.patient_number || '—'}
                      </span>
                      <span role="cell" className="chart-library__cell chart-library__cell--species">
                        {SPECIES_LABELS[c.species] ?? c.species ?? '—'}
                      </span>
                      <span role="cell" className="chart-library__cell chart-library__cell--date">
                        {c.chart_date || '—'}
                      </span>
                      <span role="cell" className="chart-library__cell">
                        {new Date(c.updated_at).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </span>
                    </button>
                    <span role="cell" className="chart-library__row-actions">
                      <button
                        type="button"
                        className="chart-library__delete"
                        onClick={() => handleDelete(c)}
                        disabled={busyId === c.id}
                        aria-label={`Delete chart for ${c.patient_name.trim() || 'unnamed patient'}`}
                        title="Delete chart"
                      >
                        Delete
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
