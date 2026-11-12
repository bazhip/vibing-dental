import React from 'react';
import { SortButton, dateValue, sortRows, useTableSort } from '../utils/tableSort';

export interface AdminChartMeta {
  id: string;
  patient_name: string;
  patient_number: string;
  species: string;
  chart_date: string;
  updated_at: string;
}

type ChartSortKey = 'patient' | 'number' | 'species' | 'date' | 'updated';

const COLUMNS: { key: ChartSortKey; label: string }[] = [
  { key: 'patient', label: 'Patient' },
  { key: 'number', label: 'Patient #' },
  { key: 'species', label: 'Species' },
  { key: 'date', label: 'Visit date' },
  { key: 'updated', label: 'Updated' },
];

const chartValue = (c: AdminChartMeta, key: ChartSortKey) => {
  switch (key) {
    case 'patient': return c.patient_name?.trim().toLowerCase() || null;
    case 'number': return c.patient_number?.trim() || null;
    case 'species': return c.species?.trim().toLowerCase() || null;
    case 'date': return dateValue(c.chart_date);
    case 'updated': return dateValue(c.updated_at);
  }
};

const fmtDate = (iso: string | null | undefined, withTime = false) => {
  const t = dateValue(iso);
  if (t === null) return '—';
  // chart_date is a bare YYYY-MM-DD — show it as written, not shifted
  // a day by the local timezone.
  if (!withTime && iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { dateStyle: 'medium' });
  }
  return new Date(t).toLocaleString(undefined, withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' });
};

/**
 * "Charts" block in the admin panel — used for a practice's charts and for
 * one account's charts. Loads on demand (`onLoad`), lists the rows in a
 * sortable table, and hands a picked chart to `onOpen` (view_chart, which
 * logs the view server-side).
 */
export const AdminChartList: React.FC<{
  /** Rows once loaded for this subject; null before "Show charts". */
  rows: AdminChartMeta[] | null;
  loading: boolean;
  onLoad: () => void;
  onOpen: (chartId: string) => void;
  emptyText: string;
  label: string;
}> = ({ rows, loading, onLoad, onOpen, emptyText, label }) => {
  const { sort, toggle, ariaSort } = useTableSort<ChartSortKey>({ key: 'date', dir: 'desc' }, ['date', 'updated']);
  const sorted = React.useMemo(
    () => (rows ? sortRows(rows, sort, chartValue, (a, b) => (dateValue(b.updated_at) ?? 0) - (dateValue(a.updated_at) ?? 0)) : null),
    [rows, sort],
  );
  return (
    <div className="admin-panel__charts">
      <div className="admin-panel__charts-head">
        <h3 className="ai-settings-subhead">Charts{rows ? ` (${rows.length})` : ''}</h3>
        {rows === null && (
          <button type="button" className="diagram-view__action" onClick={onLoad} disabled={loading}>
            {loading ? 'Loading…' : 'Show charts'}
          </button>
        )}
      </div>
      {sorted && (
        sorted.length === 0 ? (
          <p className="admin-panel__plan-note">{emptyText}</p>
        ) : (
          <div className="admin-panel__chart-wrap">
            <table className="admin-panel__usage-table admin-panel__chart-table" aria-label={label}>
              <thead>
                <tr>
                  {COLUMNS.map((c) => (
                    <th key={c.key} aria-sort={ariaSort(c.key)}>
                      <SortButton
                        className="admin-panel__th-sort"
                        label={c.label}
                        active={sort.key === c.key}
                        dir={sort.dir}
                        onClick={() => toggle(c.key)}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <button
                        type="button"
                        className="admin-panel__chart-open"
                        onClick={() => onOpen(c.id)}
                        aria-label={`Open chart: ${c.patient_name || 'Unnamed patient'}${c.chart_date ? `, ${c.chart_date}` : ''}`}
                      >
                        {c.patient_name || 'Unnamed patient'}
                      </button>
                    </td>
                    <td>{c.patient_number || '—'}</td>
                    <td>{c.species || '—'}</td>
                    <td>{fmtDate(c.chart_date)}</td>
                    <td>{fmtDate(c.updated_at, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
      <p className="admin-panel__plan-note">Read-only. Every chart you open is logged.</p>
    </div>
  );
};
