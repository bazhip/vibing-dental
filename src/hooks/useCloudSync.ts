import React from 'react';
import { ChartSnapshot } from '../types';
import { supabase, cloudEnabled } from '../utils/supabaseClient';
import { usePersistedState } from './usePersistedState';
import { UseChartStateReturn } from './useChartState';

/**
 * Cloud persistence on top of `useChartState`.
 *
 * localStorage stays the working copy (chairside offline resilience);
 * this hook mirrors the active chart to the practice's Supabase project:
 *
 *   - autosave: debounced upsert of the full snapshot whenever the chart
 *     changes (and has any content — pristine empty charts don't create
 *     rows),
 *   - listCharts / openChart: the "My charts" menu,
 *   - deleteChart, signOut.
 *
 * Sync is last-write-wins per chart row — fine for a small practice
 * where a chart has one author at a time.
 */

export interface CloudChartMeta {
  id: string;
  patient_name: string;
  patient_number: string;
  species: string;
  chart_date: string;
  updated_at: string;
}

export interface UseCloudSyncReturn {
  enabled: boolean;
  /** 'idle' | 'saving' | 'saved' | 'error' — for a small status hint. */
  status: 'idle' | 'saving' | 'saved' | 'error';
  /** Immediate save of the current chart (autosave also runs debounced). */
  saveNow: () => Promise<void>;
  /** Debounced background saving — default on; manual Save always works. */
  autosaveEnabled: boolean;
  setAutosaveEnabled: (on: boolean) => void;
  listCharts: () => Promise<CloudChartMeta[]>;
  openChart: (id: string) => Promise<void>;
  deleteChart: (id: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AUTOSAVE_DEBOUNCE_MS = 1500;

/** A chart worth a cloud row: anything typed, marked, or drawn. */
function hasContent(s: ChartSnapshot): boolean {
  const p = s.patientInfo;
  if (p.patientName.trim() || p.patientNumber.trim() || p.complaint.trim() || p.treatmentReport.trim()) return true;
  if (Object.values(p.nerveBlocks).some((v) => (v ?? '').trim())) return true;
  if (Object.values(p.exam).some((e) => e.status || e.comment.trim())) return true;
  if (s.toothData.some((t) =>
    [t.mobility, t.recession, t.pocket, t.furcation, t.hyperplasia, t.calculus, t.gingivitis, t.pdstate]
      .some((v) => (v ?? '').trim())
  )) return true;
  if (Object.keys(s.preMarks).length || Object.keys(s.postMarks).length) return true;
  if (s.preComments.length || s.postComments.length) return true;
  if (s.preStrokes.length || s.postStrokes.length) return true;
  return false;
}

export function useCloudSync(chart: UseChartStateReturn): UseCloudSyncReturn {
  const [status, setStatus] = React.useState<UseCloudSyncReturn['status']>('idle');
  const [autosaveEnabled, setAutosaveEnabled] = usePersistedState<boolean>('chart.autosave', 1, true);

  // "Saved" is a moment, not a state — show it briefly, then clear.
  // Errors stay visible until a save succeeds.
  React.useEffect(() => {
    if (status !== 'saved') return;
    const t = window.setTimeout(() => setStatus('idle'), 2500);
    return () => window.clearTimeout(t);
  }, [status]);

  const snapshot = chart.getSnapshot();
  const serialized = JSON.stringify(snapshot);
  const chartId = chart.cloudChartId;

  // Latest values for the imperative saveNow (stable identity).
  const latest = React.useRef({ serialized, chartId });
  latest.current = { serialized, chartId };
  const resetIdRef = React.useRef(chart.resetCloudChartId);
  resetIdRef.current = chart.resetCloudChartId;

  const upsertChart = React.useCallback(async (json: string, id: string): Promise<void> => {
    if (!supabase) return;
    const client = supabase;
    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData.session) return;
    const snap: ChartSnapshot = JSON.parse(json);
    const row = (rowId: string) => ({
      id: rowId,
      patient_name: snap.patientInfo.patientName,
      patient_number: snap.patientInfo.patientNumber,
      species: snap.species,
      chart_date: snap.patientInfo.date,
      data: snap,
    });
    setStatus('saving');
    const { error } = await client.from('charts').upsert(row(id));
    if (!error) {
      setStatus('saved');
      return;
    }
    // A refused save usually means the row id belongs to another account
    // (stale localStorage after switching users) — RLS correctly blocks
    // the update. Fork: mint a fresh id owned by this account and retry.
    const refused =
      error.code === '42501' ||
      /row-level security|permission denied|duplicate key/i.test(error.message);
    if (refused) {
      const freshId = resetIdRef.current();
      const { error: retryError } = await client.from('charts').upsert(row(freshId));
      setStatus(retryError ? 'error' : 'saved');
      if (retryError) throw new Error(retryError.message);
      return;
    }
    setStatus('error');
    throw new Error(error.message);
  }, []);

  const saveNow = React.useCallback(async (): Promise<void> => {
    const { serialized: json, chartId: id } = latest.current;
    if (!hasContent(JSON.parse(json))) return;
    await upsertChart(json, id);
  }, [upsertChart]);

  // Debounced autosave. Keyed on the serialized snapshot so only actual
  // edits schedule a save.
  const skippedFirst = React.useRef(false);
  const suppressNext = React.useRef(false);
  React.useEffect(() => {
    if (!supabase) return;
    // Don't upsert the state we just restored at mount — only real edits.
    if (!skippedFirst.current) {
      skippedFirst.current = true;
      return;
    }
    // Opening a cloud chart replays its own content into state — that
    // change isn't an edit either.
    if (suppressNext.current) {
      suppressNext.current = false;
      return;
    }
    if (!autosaveEnabled) return;
    const snap: ChartSnapshot = JSON.parse(serialized);
    if (!hasContent(snap)) return;

    const timer = window.setTimeout(() => {
      upsertChart(serialized, chartId).catch((e) => {
        // eslint-disable-next-line no-console
        console.warn('[cloud] chart save failed:', e instanceof Error ? e.message : e);
      });
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [serialized, chartId, upsertChart, autosaveEnabled]);

  const listCharts = React.useCallback(async (): Promise<CloudChartMeta[]> => {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('charts')
      .select('id, patient_name, patient_number, species, chart_date, updated_at')
      .order('updated_at', { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []) as CloudChartMeta[];
  }, []);

  // applySnapshot comes from useChartState, which returns a fresh object
  // every render — hold the latest via ref so openChart stays stable.
  const applyRef = React.useRef(chart.applySnapshot);
  applyRef.current = chart.applySnapshot;

  const openChart = React.useCallback(async (id: string): Promise<void> => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('charts')
      .select('id, data')
      .eq('id', id)
      .single();
    if (error) throw new Error(error.message);
    suppressNext.current = true;
    applyRef.current(data.data as ChartSnapshot, data.id);
  }, []);

  const deleteChart = React.useCallback(async (id: string): Promise<void> => {
    if (!supabase) return;
    const { error } = await supabase.from('charts').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }, []);

  const signOut = React.useCallback(async (): Promise<void> => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  return {
    enabled: cloudEnabled,
    status,
    saveNow,
    autosaveEnabled,
    setAutosaveEnabled,
    listCharts,
    openChart,
    deleteChart,
    signOut,
  };
}
