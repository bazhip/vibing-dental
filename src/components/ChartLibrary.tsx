import React from 'react';
import { CloudChartMeta } from '../hooks/useCloudSync';

interface ChartLibraryProps {
  listCharts: () => Promise<CloudChartMeta[]>;
  onOpen: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** Back to the active chart. */
  onClose: () => void;
}

const SPECIES_LABELS: Record<string, string> = {
  feline: 'Feline',
  canine: 'Canine',
  'feline-deciduous': 'Feline · Deciduous',
  'canine-deciduous': 'Canine · Deciduous',
};

/**
 * Full-screen chart browser — the practice's patient records. Scales past
 * the menu-dropdown stage: search-as-you-type across name / number, most
 * recently touched first, open or delete per row.
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

  const filtered = React.useMemo(() => {
    if (!charts) return null;
    const q = query.trim().toLowerCase();
    if (!q) return charts;
    return charts.filter((c) =>
      `${c.patient_name} ${c.patient_number}`.toLowerCase().includes(q)
    );
  }, [charts, query]);

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

  return (
    <div className="chart-library">
      <div className="chart-library__head">
        <div>
          <h2 className="chart-library__title">My charts</h2>
          <p className="chart-library__sub">
            Every chart autosaves here as you work.
          </p>
        </div>
        <div className="chart-library__head-actions">
          <button type="button" className="diagram-view__action" onClick={onClose}>
            Back to chart
          </button>
        </div>
      </div>

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
        // The fetch caps at the 500 most recent rows — say so instead of
        // letting search silently miss older records.
        <p className="chart-library__sub">
          Showing the 500 most recently updated charts — older charts
          don't appear here or in search.
        </p>
      )}

      {filtered === null && !error && (
        <div className="chart-library__empty">Loading…</div>
      )}

      {filtered !== null && filtered.length === 0 && (
        <div className="chart-library__empty">
          {query
            ? 'No charts match that search.'
            : 'No saved charts yet — they save automatically as you chart.'}
        </div>
      )}

      {filtered !== null && filtered.length > 0 && (
        <ul className="chart-library__list">
          {filtered.map((c) => (
            <li key={c.id} className="chart-library__row">
              <button
                type="button"
                className="chart-library__row-main"
                onClick={() => handleOpen(c.id)}
                disabled={busyId === c.id}
              >
                <span className="chart-library__patient">
                  {c.patient_name.trim() || 'Unnamed patient'}
                </span>
                <span className="chart-library__meta">
                  {[
                    c.patient_number,
                    SPECIES_LABELS[c.species] ?? c.species,
                    c.chart_date,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                <span className="chart-library__updated">
                  Updated {new Date(c.updated_at).toLocaleString()}
                </span>
              </button>
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
