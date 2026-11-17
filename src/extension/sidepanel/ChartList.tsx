import React from 'react';
import { useTranslation } from 'react-i18next';
import type { InspectResult } from '../protocol';
import { listChartsPage, type CloudChartMeta } from '../../utils/chartQueries';
import { patientsMatch, patientsMatchStrict, samePatientNumber } from '../../utils/pims/patientMatch';
import { friendlyError } from '../../components/ui/dialogs';

export const PAGE_SIZE = 20;
export const SEARCH_DEBOUNCE_MS = 300;

export interface ConsultMatches {
  /** Charts whose patient is the consult's (the same patient number, or with no number to compare,
   *  `patientsMatchStrict`): pinned as "Matches this consult". */
  exact: CloudChartMeta[];
  /** Charts with no number to compare that only share whole words with it (`patientsMatch`): offered
   *  as a possible match. */
  possible: CloudChartMeta[];
}

/** The charts that match the writable consult's patient, most recent first. When the chart and the
 *  consult both have a patient number, the number decides: equal is exact whatever the names, and a
 *  different number is in neither list. Otherwise the names decide, so nothing matches without a
 *  patient name. No match is possible without a writable consult. */
export function consultMatches(charts: CloudChartMeta[], info: InspectResult | null): ConsultMatches {
  const exact: CloudChartMeta[] = [];
  const possible: CloudChartMeta[] = [];
  if (!info?.tab || info.status?.state !== 'writable') return { exact, possible };
  const { patientName: name, patientNumber: number } = info.status;
  const sorted = [...charts].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  for (const c of sorted) {
    const byNumber = samePatientNumber(c.patient_number, number);
    if (byNumber === true && (!info.status.provider || info.status.provider === 'ezyvet')) exact.push(c);
    else if (byNumber === false || !name) continue;
    else if (patientsMatchStrict(c.patient_name, c.owner_name, name)) exact.push(c);
    else if (patientsMatch(c.patient_name, name)) possible.push(c);
  }
  return { exact, possible };
}

interface ChartListProps {
  /** The latest inspect of the ezyVet tab (null = unknown). */
  inspect: InspectResult | null;
  onPick: (chart: CloudChartMeta) => void;
}

/** The practice's charts, newest first: search, 20 per page, and the chart that matches the open
 *  ezyVet consult pinned at the top (or, failing an exact match, a possible match beside the ezyVet name). */
export const ChartList: React.FC<ChartListProps> = ({ inspect, onPick }) => {
  const { t } = useTranslation(['pims', 'common']);
  const [query, setQuery] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [rows, setRows] = React.useState<CloudChartMeta[]>([]);
  const [hasMore, setHasMore] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  // Only the latest request may write state (a slow earlier page must not overwrite a newer search).
  const requestId = React.useRef(0);

  React.useEffect(() => {
    if (query === search) return;
    const timer = window.setTimeout(() => setSearch(query), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query, search]);

  const fetchPage = React.useCallback(async (term: string, offset: number) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const page = await listChartsPage({ search: term, offset, limit: PAGE_SIZE, sortKey: 'updated', sortDir: 'desc' });
      if (id !== requestId.current) return;
      setRows((prev) => (offset === 0 ? page.rows : [...prev, ...page.rows]));
      setHasMore(page.hasMore);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(friendlyError(err));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchPage(search, 0);
  }, [search, fetchPage]);

  const { exact, possible } = consultMatches(rows, inspect);
  const pinned = exact[0] ?? null;
  // Only when nothing matches exactly; picking it still asks before sending (the panel's strict check).
  const maybe = pinned ? null : possible[0] ?? null;
  const ezyvetName = inspect?.status?.patientName ?? '';

  const row = (c: CloudChartMeta) => (
    <li key={c.id}>
      <button type="button" className="sp-chart" onClick={() => onPick(c)}>
        <span className="sp-chart__name">{c.patient_name || t('pims:panel.list.unnamed')}</span>
        <span className="sp-chart__meta">{[c.owner_name, c.chart_date].filter(Boolean).join(' · ')}</span>
      </button>
    </li>
  );

  return (
    <section className="sp-list">
      {pinned && (
        <div className="sp-pinned" data-testid="pinned-match">
          <h2 className="sp-section">{t('pims:panel.list.matches')}</h2>
          <ul className="sp-charts">{row(pinned)}</ul>
          {exact.length > 1 && <p className="sp-hint">{t('pims:panel.list.matchCount', { matches: exact.length })}</p>}
        </div>
      )}
      {maybe && (
        <div className="sp-possible" data-testid="possible-match">
          <p className="sp-hint">{t('pims:panel.list.possible', { patient: ezyvetName })}</p>
          <ul className="sp-charts">{row(maybe)}</ul>
        </div>
      )}
      <input
        type="search"
        className="sp-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label={t('pims:panel.list.searchLabel')}
        placeholder={t('pims:panel.list.searchPlaceholder')}
      />
      {error && <p className="sp-error" role="alert">{error}</p>}
      {rows.length > 0 && <ul className="sp-charts">{rows.map(row)}</ul>}
      {!loading && !error && rows.length === 0 && <p className="sp-hint" role="status">{t('pims:panel.list.empty')}</p>}
      {loading && <p className="sp-hint" role="status">{t('pims:panel.list.loading')}</p>}
      {!loading && hasMore && (
        <button type="button" className="sp-secondary" onClick={() => void fetchPage(search, rows.length)}>
          {t('pims:panel.list.loadMore')}
        </button>
      )}
    </section>
  );
};
