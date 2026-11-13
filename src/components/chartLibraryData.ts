import React from 'react';
import i18n from '../i18n';
import { localDateISO } from '../utils/localDate';
import type { CloudChartMeta, ChartListQuery, ChartListPage } from '../hooks/useCloudSync';

/**
 * Saved-chart listing shared by the website's "My charts" dialog
 * (ChartLibrary) and the iOS app's Patients tab: patient grouping and
 * ordering, the server query (search, species, doctor, Due, sort),
 * paging, the Due count, and the delete / clear-recheck actions.
 *
 * No user-facing text lives here; callers word errors and confirmations.
 */

/** One animal's charts across visits. */
export interface PatientGroup {
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

export type SortKey = 'patient' | 'updated' | 'recall';
export type SortDir = 'asc' | 'desc';

/** Visits fetched per page — grouping happens on the loaded set, so a
 *  page comfortably covers a screenful of patients. */
export const PAGE_SIZE = 200;

/** Today's calendar date (YYYY-MM-DD) in the user's timezone. */
export function todayIso(): string {
  return localDateISO();
}

/** Group charts by patient: patient number if present, else name.
 *  `unnamed` names patients with no name (the caller's language). */
export function groupByPatient(charts: CloudChartMeta[], unnamed = i18n.t('unnamedPatient', { ns: 'library' })): PatientGroup[] {
  const groups = new Map<string, PatientGroup>();
  for (const c of charts) {
    const num = c.patient_number.trim().toLowerCase();
    const name = c.patient_name.trim().toLowerCase();
    const key = num ? `n:${num}` : name ? `p:${name}` : `id:${c.id}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        name: c.patient_name.trim() || unnamed,
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

/** Orders patient groups in place (and returns them). */
export function sortGroups(groups: PatientGroup[], sortKey: SortKey, sortDir: SortDir): PatientGroup[] {
  const cmp: Record<SortKey, (a: PatientGroup, b: PatientGroup) => number> = {
    patient: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    updated: (a, b) => a.latestUpdated.localeCompare(b.latestUpdated),
    // Empty recall sorts last regardless of direction.
    recall: (a, b) => (a.recall || '9999').localeCompare(b.recall || '9999'),
  };
  groups.sort(cmp[sortKey]);
  if (sortDir === 'desc') groups.reverse();
  return groups;
}

/** The direction a column starts in when first chosen. */
export function defaultSortDir(key: SortKey): SortDir {
  return key === 'patient' || key === 'recall' ? 'asc' : 'desc';
}

/** Patients whose recheck is due today or earlier. */
export function duePatients(charts: CloudChartMeta[], today: string, unnamed?: string): PatientGroup[] {
  return groupByPatient(charts, unnamed).filter((g) => g.recall && g.recall <= today);
}

/** Recheck status of a date relative to today. */
export function recallStatus(recall: string, today: string): 'none' | 'overdue' | 'due' | 'upcoming' {
  if (!recall) return 'none';
  return recall < today ? 'overdue' : recall === today ? 'due' : 'upcoming';
}

/** What failed (callers word the message; `cause` goes to friendlyError). */
export interface LibraryError {
  kind: 'load' | 'more' | 'open' | 'delete' | 'clear';
  cause: unknown;
}

export interface ChartLibraryListOptions {
  listCharts: (query?: ChartListQuery) => Promise<ChartListPage>;
  onDelete: (id: string) => Promise<void>;
  onClearRecalls: (chartIds: string[]) => Promise<void>;
  /** Fetch only while true (the app's tab hasn't been shown yet). Default true. */
  enabled?: boolean;
  /** Changing it refetches in place, keeping the rows that are showing
   *  (the app: library changed, or the tab became active). */
  reloadToken?: unknown;
  /** Name for patients without one. */
  unnamedLabel?: string;
}

/**
 * The library's state: search (debounced), filters and sort, the loaded
 * visits grouped into patients, paging, the Due count, and the delete /
 * clear-recheck actions (each takes the caller's confirmation).
 */
export function useChartLibraryList({
  listCharts,
  onDelete,
  onClearRecalls,
  enabled = true,
  reloadToken,
  unnamedLabel,
}: ChartLibraryListOptions) {
  const [charts, setCharts] = React.useState<CloudChartMeta[] | null>(null);
  const [hasMore, setHasMore] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [query, setQuery] = React.useState('');
  // Search runs server-side — debounce so we query per pause, not per key.
  const [debouncedQuery, setDebouncedQuery] = React.useState('');
  React.useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query), 250);
    return () => window.clearTimeout(t);
  }, [query]);
  const [error, setError] = React.useState<LibraryError | null>(null);
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
  const chartsRef = React.useRef(charts);
  chartsRef.current = charts;

  const refresh = React.useCallback(async (keepCount?: number) => {
    const seq = ++requestSeqRef.current;
    setError(null);
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
      setError({ kind: 'load', cause: e });
    }
  }, [listCharts, listQuery]);

  React.useEffect(() => {
    if (!enabled) return;
    setCharts(null);
    refresh();
  }, [refresh, enabled]);

  const loadMore = async () => {
    if (!charts || loadingMore) return;
    const seq = ++requestSeqRef.current;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await listCharts({ ...listQuery, offset: charts.length, limit: PAGE_SIZE });
      if (seq === requestSeqRef.current) {
        setCharts((prev) => [...(prev ?? []), ...page.rows]);
        setHasMore(page.hasMore);
      }
    } catch (e) {
      if (seq === requestSeqRef.current) {
        setError({ kind: 'more', cause: e });
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
        setDueCount(duePatients(page.rows, todayIso()).length);
      })
      .catch(() => { /* badge only — never block the library on it */ });
  }, [listCharts]);

  React.useEffect(() => {
    if (enabled) refreshDueCount();
  }, [refreshDueCount, enabled]);

  // The app's in-place refetch (library changed / tab shown again). The
  // first token is the initial load above, so only later changes count.
  const lastToken = React.useRef(reloadToken);
  React.useEffect(() => {
    if (Object.is(lastToken.current, reloadToken)) return;
    lastToken.current = reloadToken;
    if (!enabled) return;
    void refresh(chartsRef.current?.length ?? 0);
    refreshDueCount();
  }, [reloadToken, enabled, refresh, refreshDueCount]);

  // Search, filters, and Due all happened server-side — this is purely
  // grouping the returned visits into patients and ordering the groups.
  const groups = React.useMemo(
    () => (charts ? sortGroups(groupByPatient(charts, unnamedLabel), sortKey, sortDir) : null),
    [charts, sortKey, sortDir, unnamedLabel]
  );

  /** Column-header behaviour: same key flips direction, a new key starts
   *  in its default direction. */
  const setSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(defaultSortDir(key));
    }
  };
  /** Menu behaviour: set both explicitly. */
  const setSortOrder = (key: SortKey, dir: SortDir) => {
    setSortKey(key);
    setSortDir(dir);
  };

  /** Deletes one visit once `confirm` resolves true; refetches. */
  const deleteVisit = async (c: CloudChartMeta, confirm: () => Promise<boolean>) => {
    if (!(await confirm())) return;
    setBusyId(c.id);
    try {
      await onDelete(c.id);
      await refresh(chartsRef.current?.length ?? 0);
      refreshDueCount();
    } catch (e) {
      setError({ kind: 'delete', cause: e });
    } finally {
      setBusyId(null);
    }
  };

  /** Clears the patient's recheck (every visit that has one) once
   *  `confirm` resolves true; refetches. */
  const clearRecheck = async (group: PatientGroup, confirm: () => Promise<boolean>) => {
    const withRecall = group.visits.filter((v) => (v.recall_date ?? '').trim() !== '');
    if (withRecall.length === 0) return;
    if (!(await confirm())) return;
    setBusyId(withRecall[0].id);
    try {
      await onClearRecalls(withRecall.map((v) => v.id));
      await refresh(chartsRef.current?.length ?? 0);
      refreshDueCount();
    } catch (e) {
      setError({ kind: 'clear', cause: e });
    } finally {
      setBusyId(null);
    }
  };

  const filtered = !!(query || dueOnly || doctorFilter || speciesFilter);

  return {
    query, setQuery,
    speciesFilter, setSpeciesFilter,
    doctorFilter, setDoctorFilter,
    dueOnly, setDueOnly,
    sortKey, sortDir, setSort, setSortOrder,
    charts, groups, hasMore, loadingMore, loadMore, refresh,
    dueCount,
    error, setError,
    busyId, setBusyId,
    deleteVisit, clearRecheck,
    /** Search or any filter is on. */
    filtered,
  };
}
