import React from 'react';
import { ChartSnapshot, ChartAuditEntry } from '../types';
import { supabase, cloudEnabled } from '../utils/supabaseClient';
import { usePersistedState } from './usePersistedState';
import { UseChartStateReturn, clearChartStorage } from './useChartState';
import { markExplicitSignOut } from '../utils/signOutIntent';

/**
 * Cloud persistence on top of `useChartState`.
 *
 * localStorage is always the working copy (survives reloads, offline
 * resilient). Saving to the practice's Supabase project is MANUAL: the
 * topbar shows a Save button whenever the chart has unsaved changes, and
 * that's the only thing that writes to the cloud — no autosave, so a
 * saved chart is never overwritten without an explicit action.
 *
 * Sync is last-write-wins per chart row — fine for a small practice
 * where a chart has one author at a time.
 */

export interface CloudChartMeta {
  id: string;
  patient_name: string;
  patient_number: string;
  owner_name: string;
  owner_phone: string;
  owner_email: string;
  species: string;
  dentition: string;
  chart_date: string;
  recall_date: string;
  updated_at: string;
  /** The visit's author — a patient can be seen by different doctors
   *  across visits, so this is per-chart, not per-patient. */
  created_by: string;
}

/** Server-side chart listing — filters, search, and pagination all run
 *  in Postgres so chart #501+ is exactly as findable as chart #1. */
export interface ChartListQuery {
  /** Case-insensitive substring match over patient name/number and
   *  owner name/phone. */
  search?: string;
  /** 'canine' | 'feline'. */
  species?: string;
  /** Visit author (user id). */
  createdBy?: string;
  /** Only charts whose recheck date is today or past. */
  dueOnly?: boolean;
  sortKey?: 'patient' | 'updated' | 'recall';
  sortDir?: 'asc' | 'desc';
  offset?: number;
  limit?: number;
}

export interface ChartListPage {
  rows: CloudChartMeta[];
  /** True when another `offset += limit` page exists. */
  hasMore: boolean;
}

export interface UseCloudSyncReturn {
  enabled: boolean;
  /** 'idle' | 'saving' | 'saved' | 'error'. */
  status: 'idle' | 'saving' | 'saved' | 'error';
  /** Plain-language reason the last save failed ('' when none). */
  saveError: string;
  /** True when the working chart has content the cloud hasn't stored. */
  dirty: boolean;
  /** Save the current chart to the cloud now. */
  saveNow: () => Promise<void>;
  listCharts: (query?: ChartListQuery) => Promise<ChartListPage>;
  /** All visits for one patient (matched by number when present, else
   *  by name) — powers the topbar visit switcher. */
  listPatientVisits: (patientNumber: string, patientName: string) => Promise<CloudChartMeta[]>;
  openChart: (id: string) => Promise<void>;
  /** Fetch a chart's full snapshot (for "new visit from this patient"). */
  fetchChart: (id: string) => Promise<ChartSnapshot>;
  deleteChart: (id: string) => Promise<void>;
  /** Clear recheck reminders on these charts — for rechecks that happened
   *  without producing a new chart (the patient would otherwise sit in
   *  the Due list forever). Clears the row column AND the snapshot copy
   *  so a later re-save can't resurrect the date; logs to the audit
   *  trail. */
  clearRecalls: (chartIds: string[]) => Promise<void>;
  signOut: () => Promise<void>;
}

/** A chart worth a cloud row: anything typed, marked, or drawn. */
function hasContent(s: ChartSnapshot): boolean {
  const p = s?.patientInfo;
  if (!p || typeof p !== 'object' || !Array.isArray(s.toothData)) return false;
  if ((p.patientName ?? '').trim() || (p.patientNumber ?? '').trim() || (p.ownerName ?? '').trim() || (p.ownerPhone ?? '').trim() || (p.ownerEmail ?? '').trim() || (p.complaint ?? '').trim() || (p.treatmentReport ?? '').trim()) return true;
  if (Object.values(p.nerveBlocks ?? {}).some((v) => (v ?? '').trim())) return true;
  if (Object.values(p.exam ?? {}).some((e) => e?.status || (e?.comment ?? '').trim())) return true;
  if (s.toothData.some((t) =>
    [t.mobility, t.recession, t.pocket, t.furcation, t.hyperplasia, t.calculus, t.gingivitis, t.pdstate]
      .some((v) => (v ?? '').trim())
  )) return true;
  if (Object.keys(s.preMarks ?? {}).length || Object.keys(s.postMarks ?? {}).length) return true;
  if ((s.preComments ?? []).length || (s.postComments ?? []).length) return true;
  if ((s.preStrokes ?? []).length || (s.postStrokes ?? []).length) return true;
  return false;
}

/** Turn a raw Supabase/network failure into something a vet can act on.
 *  The categories map to the real recovery step, not the internal cause. */
function describeSaveError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  const code = (err as { code?: string } | null)?.code ?? '';
  if (/signed out|session|jwt|token|not authenticated|401/i.test(msg)) {
    return 'Your session expired. Sign in again, then save — your chart is still here on this device.';
  }
  if (code === '42501' || /row-level security|permission denied|not authorized|403/i.test(msg)) {
    return "This chart couldn't be saved to your account. Contact your practice owner if this keeps happening.";
  }
  if (code === '54000' || /quota|payload|too large|entity too large|413/i.test(msg)) {
    return 'This chart is too large to save (usually too many or too big images). Remove an attachment and retry.';
  }
  if (/failed to fetch|network|timeout|timed out|connection|offline|econn/i.test(msg)) {
    return "Couldn't reach the server. Check your connection and retry — your chart is safe on this device.";
  }
  return `Save failed: ${msg || 'unknown error'}. Your chart is safe on this device — retry in a moment.`;
}

const CHART_META_COLUMNS =
  'id, patient_name, patient_number, owner_name, owner_phone, owner_email, species, dentition, chart_date, recall_date, updated_at, created_by';

const DEFAULT_PAGE_SIZE = 200;

/** Escape LIKE wildcards so user input matches literally. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

/** Cheap stable hash (djb2) — identifies the last-cloud-saved snapshot so
 *  "unsaved changes" survives a reload without storing a second full copy. */
function hashStr(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

export function useCloudSync(
  chart: UseChartStateReturn,
  active = true,
  practiceId = ''
): UseCloudSyncReturn {
  // Trial/standalone: no account to save to — the hook is inert.
  const on = cloudEnabled && active;
  const practiceIdRef = React.useRef(practiceId);
  practiceIdRef.current = practiceId;

  const [status, setStatus] = React.useState<UseCloudSyncReturn['status']>('idle');
  const [saveError, setSaveError] = React.useState('');
  // Hash of the snapshot last written to the cloud (persisted so unsaved
  // changes are still flagged after a reload).
  const [savedHash, setSavedHash] = usePersistedState<string>('chart.savedHash', 1, '');

  // "Saved" is a moment — show briefly, then clear.
  React.useEffect(() => {
    if (status !== 'saved') return;
    const t = window.setTimeout(() => setStatus('idle'), 2500);
    return () => window.clearTimeout(t);
  }, [status]);

  // getSnapshot is memoized upstream, so serialization/hashing runs once
  // per actual chart change instead of once per render.
  const snapshot = chart.getSnapshot();
  const serialized = React.useMemo(() => JSON.stringify(snapshot), [snapshot]);
  const chartId = chart.cloudChartId;
  // Dirty-tracking hashes the snapshot WITHOUT its save history — every
  // successful save appends an audit entry, and hashing that would flag
  // the chart dirty the moment it finished saving.
  const contentSerialized = React.useMemo(() => {
    const { auditLog: _auditLog, ...content } = snapshot;
    return JSON.stringify(content);
  }, [snapshot]);
  const currentHash = React.useMemo(() => hashStr(contentSerialized), [contentSerialized]);
  const contentful = React.useMemo(() => hasContent(snapshot), [snapshot]);
  const dirty = on && contentful && currentHash !== savedHash;

  const latest = React.useRef({ serialized, chartId });
  latest.current = { serialized, chartId };
  const dirtyRef = React.useRef(dirty);
  dirtyRef.current = dirty;
  const resetIdRef = React.useRef(chart.resetCloudChartId);
  resetIdRef.current = chart.resetCloudChartId;
  // Local state mirrors the audit entry each save wrote to the cloud row,
  // so per-save history accumulates across a session (upsertChart's
  // useCallback([]) can't see fresh chart state directly).
  const appendAuditRef = React.useRef(chart.appendAuditEntry);
  appendAuditRef.current = chart.appendAuditEntry;

  // Opening a cloud chart replays its content into state — treat that
  // applied state as the saved baseline (not a dirty edit).
  const baselineNext = React.useRef(false);
  React.useEffect(() => {
    if (baselineNext.current) {
      baselineNext.current = false;
      setSavedHash(currentHash);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentSerialized]);

  const upsertChart = React.useCallback(async (json: string, id: string): Promise<void> => {
    if (!supabase) return;
    const client = supabase;
    const fail = (err: unknown): never => {
      setSaveError(describeSaveError(err));
      setStatus('error');
      throw err instanceof Error ? err : new Error(String(err));
    };
    try {
      const { data: sessionData } = await client.auth.getSession();
      if (!sessionData.session) fail(new Error('Signed out — sign in again to save.'));
      const snap: ChartSnapshot = JSON.parse(json);
      // The saved-baseline hash must match the live dirty hash, which
      // excludes the save history (see above).
      const contentHash = (() => {
        const { auditLog: _auditLog, ...content } = snap;
        return hashStr(JSON.stringify(content));
      })();
      // This write becomes a line in the chart's history.
      const auditEntry: ChartAuditEntry = {
        at: new Date().toISOString(),
        by: sessionData.session?.user.email ?? '',
        action: (snap.auditLog?.length ?? 0) === 0 ? 'created' : 'saved',
      };
      snap.auditLog = [...(snap.auditLog ?? []).slice(-99), auditEntry];
      // The snapshot's `species` is the combined layout key (e.g.
      // 'canine-deciduous'); the row stores species + dentition split out.
      const speciesBase = snap.species.startsWith('canine') ? 'canine' : 'feline';
      const dentition = snap.species.endsWith('deciduous') ? 'deciduous' : 'permanent';
      const row = (rowId: string) => ({
        id: rowId,
        patient_name: snap.patientInfo.patientName,
        patient_number: snap.patientInfo.patientNumber,
        owner_name: snap.patientInfo.ownerName ?? '',
        owner_phone: snap.patientInfo.ownerPhone ?? '',
        owner_email: snap.patientInfo.ownerEmail ?? '',
        species: speciesBase,
        dentition,
        chart_date: snap.patientInfo.date,
        recall_date: snap.patientInfo.recallDate ?? '',
        practice_id: practiceIdRef.current || null,
        data: snap,
      });
      setStatus('saving');
      setSaveError('');
      const { error } = await client.from('charts').upsert(row(id));
      if (!error) {
        setSavedHash(contentHash);
        appendAuditRef.current(auditEntry);
        setStatus('saved');
        return;
      }
      // A refused save usually means the row id belongs to another account
      // (stale localStorage after switching users) — RLS blocks the update.
      // Fork: mint a fresh id owned by this account and retry.
      const refused =
        error.code === '42501' ||
        /row-level security|permission denied|duplicate key/i.test(error.message);
      if (refused) {
        const freshId = resetIdRef.current();
        const { error: retryError } = await client.from('charts').upsert(row(freshId));
        if (retryError) fail(retryError);
        setSavedHash(contentHash);
        appendAuditRef.current(auditEntry);
        setStatus('saved');
        return;
      }
      fail(error);
    } catch (err) {
      // Network/parse rejections land here (supabase-js throws these
      // rather than returning {error}); categorize the same way. fail()
      // rethrows through here too — describeSaveError is deterministic,
      // so re-setting the same message is harmless.
      setSaveError(describeSaveError(err));
      setStatus('error');
      throw err;
    }
    // setSavedHash identity is stable (usePersistedState) — safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveNow = React.useCallback(async (): Promise<void> => {
    const { serialized: json, chartId: id } = latest.current;
    if (!hasContent(JSON.parse(json))) return;
    await upsertChart(json, id);
  }, [upsertChart]);

  // Autosave — for NEW charts only. Charts opened from a saved one
  // (openedExisting) never autosave: they're read-only until the user
  // unlocks and saves deliberately, so history isn't overwritten. A
  // patient name is required first (that's how charts are found again).
  const saveNowRef = React.useRef(saveNow);
  saveNowRef.current = saveNow;
  React.useEffect(() => {
    if (!on || chart.openedExisting) return;
    if (!dirty) return;
    if (!snapshot.patientInfo.patientName.trim()) return;
    const t = window.setTimeout(() => { saveNowRef.current().catch(() => {}); }, 1200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, chart.openedExisting, dirty, contentSerialized]);

  // Guard leaving a chart with unsaved changes (no autosave to catch it).
  const confirmDiscardIfDirty = (verb: string): boolean => {
    if (!dirtyRef.current) return true;
    return window.confirm(
      `This chart has unsaved changes. ${verb} anyway? ` +
      'Save first (top of the screen) if you want them in the cloud.'
    );
  };

  const listCharts = React.useCallback(async (q: ChartListQuery = {}): Promise<ChartListPage> => {
    if (!supabase) return { rows: [], hasMore: false };
    const limit = q.limit ?? DEFAULT_PAGE_SIZE;
    const offset = q.offset ?? 0;
    let query = supabase.from('charts').select(CHART_META_COLUMNS);
    // PostgREST's or= syntax splits on commas/parens, so those can't
    // appear in the pattern; spaces stand in for them (names never need
    // them to match). %/_ are LIKE wildcards — escape so they're literal.
    const term = (q.search ?? '').replace(/[(),]/g, ' ').trim();
    if (term) {
      const pattern = `%${escapeLike(term)}%`;
      query = query.or(
        ['patient_name', 'patient_number', 'owner_name', 'owner_phone']
          .map((col) => `${col}.ilike.${pattern}`)
          .join(',')
      );
    }
    if (q.species) query = query.eq('species', q.species);
    if (q.createdBy) query = query.eq('created_by', q.createdBy);
    // recall_date is text, '' when unset — gt('') keeps only real dates.
    if (q.dueOnly) query = query.gt('recall_date', '').lte('recall_date', todayIso());
    const sortCol =
      q.sortKey === 'patient' ? 'patient_name'
      : q.sortKey === 'recall' ? 'recall_date'
      : 'updated_at';
    const ascending = (q.sortDir ?? (sortCol === 'updated_at' ? 'desc' : 'asc')) === 'asc';
    query = query.order(sortCol, { ascending });
    if (sortCol !== 'updated_at') query = query.order('updated_at', { ascending: false });
    // One row past the page tells us whether more exist without a
    // second count query.
    const { data, error } = await query.range(offset, offset + limit);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as CloudChartMeta[];
    return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
  }, []);

  const listPatientVisits = React.useCallback(async (
    patientNumber: string,
    patientName: string
  ): Promise<CloudChartMeta[]> => {
    if (!supabase) return [];
    const num = patientNumber.trim();
    const name = patientName.trim();
    if (!num && !name) return [];
    let query = supabase
      .from('charts')
      .select(CHART_META_COLUMNS)
      .order('updated_at', { ascending: false })
      .limit(200);
    // Same identity rule the library's grouping uses: the patient number
    // is the key when present; name-keyed only for number-less charts.
    // ilike without wildcards = case-insensitive equality.
    if (num) query = query.ilike('patient_number', escapeLike(num));
    else query = query.ilike('patient_name', escapeLike(name)).eq('patient_number', '');
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as CloudChartMeta[];
  }, []);

  const applyRef = React.useRef(chart.applySnapshot);
  applyRef.current = chart.applySnapshot;

  const openChart = React.useCallback(async (id: string): Promise<void> => {
    if (!supabase) return;
    if (!confirmDiscardIfDirty('Open the other chart')) return;
    const { data, error } = await supabase
      .from('charts')
      .select('id, data')
      .eq('id', id)
      .single();
    if (error) throw new Error(error.message);
    baselineNext.current = true; // applied content is the saved baseline
    applyRef.current(data.data as ChartSnapshot, data.id);
    setStatus('idle');
    setSaveError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchChart = React.useCallback(async (id: string): Promise<ChartSnapshot> => {
    if (!supabase) throw new Error('Cloud is not configured.');
    const { data, error } = await supabase.from('charts').select('data').eq('id', id).single();
    if (error) throw new Error(error.message);
    return data.data as ChartSnapshot;
  }, []);

  const deleteChart = React.useCallback(async (id: string): Promise<void> => {
    if (!supabase) return;
    const { error } = await supabase.from('charts').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }, []);

  const clearRecalls = React.useCallback(async (chartIds: string[]): Promise<void> => {
    if (!supabase || chartIds.length === 0) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const clearedBy = sessionData.session?.user.email ?? '';
    for (const id of chartIds) {
      const { data, error } = await supabase.from('charts').select('data').eq('id', id).single();
      if (error) throw new Error(error.message);
      const snap = data.data as ChartSnapshot;
      if (snap?.patientInfo) snap.patientInfo.recallDate = '';
      snap.auditLog = [
        ...(snap.auditLog ?? []).slice(-99),
        { at: new Date().toISOString(), by: clearedBy, action: 'recall-cleared' as const },
      ];
      const { error: updateError } = await supabase
        .from('charts')
        .update({ recall_date: '', data: snap })
        .eq('id', id);
      if (updateError) throw new Error(updateError.message);
    }
  }, []);

  const signOut = React.useCallback(async (): Promise<void> => {
    if (!supabase) return;
    if (!confirmDiscardIfDirty('Sign out')) return;
    // Deliberate sign-out — App must NOT treat the coming SIGNED_OUT
    // event as a session expiry (which keeps the chart mounted).
    markExplicitSignOut();
    await supabase.auth.signOut();
    // Shared clinic machines: the next account must not inherit this
    // patient's chart from localStorage.
    clearChartStorage();
    // Legacy BYOK era left API keys in localStorage; the app no longer
    // collects keys client-side, so sweep any stragglers with the session.
    for (const k of [
      'vibing-dental.anthropic-api-key.v1',
      'vibing-dental.deepgram-api-key.v1',
      'vibing-dental.anthropic-model.v1',
    ]) {
      try { localStorage.removeItem(k); } catch { /* storage unavailable */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    enabled: on,
    status,
    saveError,
    dirty,
    saveNow,
    listCharts,
    listPatientVisits,
    openChart,
    fetchChart,
    deleteChart,
    clearRecalls,
    signOut,
  };
}
