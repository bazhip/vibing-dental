import React from 'react';
import { hasChartImages, hasPendingImageUpload, findImageDrafts, discardImageDraft } from '../utils/imageDrafts';
import { localDateISO } from '../utils/localDate';
import { ChartSnapshot } from '../types';
import { chooseDialog, confirmDialog } from '../components/ui/dialogs';
import i18n from '../i18n';
import { formatDate, formatTime } from '../i18n/format';
import { supabase, cloudEnabled } from '../utils/supabaseClient';
import { usePersistedState } from './usePersistedState';
import { writeJson } from '../utils/storage';
import { CHART_STORAGE_REWRITE_EVENT, UseChartStateReturn, clearChartStorage } from './useChartState';
import { signOutAndSweep } from '../utils/signOutAndSweep';
import { removeChartAttachments } from '../utils/chartAttachments';
import { LocalizedError } from '../utils/apiErrors';
import {
  CHART_META_COLUMNS,
  escapeLike,
  listChartsPage,
  type ChartListPage,
  type ChartListQuery,
  type CloudChartMeta,
} from '../utils/chartQueries';
import { speciesBase, speciesDentition } from '../utils/species';
import { changesPatientIdentity, identityKey, patientIdentityQuestion, type PatientIdentity } from '../utils/patientIdentity';

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

export type { CloudChartMeta, ChartListQuery, ChartListPage };

export interface ChartWorkspace {
  id: string;
  snapshot: ChartSnapshot;
  openedExisting: boolean;
  savedHash: string;
  lastSaved: { chartId: string; at: string };
  conflict: { chartId: string; mode: 'none' | 'force' | 'blocked' };
  saveError: string;
  dirty: boolean;
  duplicateAnswered: string;
  skipDuplicate: string;
}

export interface UseCloudSyncReturn {
  enabled: boolean;
  /** Preserve a working chart without requiring a cloud save. */
  captureWorkspace?: () => Promise<ChartWorkspace>;
  restoreWorkspace?: (workspace: ChartWorkspace) => void;
  resumeWorkspace?: () => void;
  pauseWorkspace?: () => void;
  discardImageDraft?: (id: string) => Promise<void>;
  hasImages?: (id: string) => Promise<boolean>;
  hasPendingImageUpload?: (id: string) => boolean;
  findImageDrafts?: () => Promise<Array<{ id: string; date: string }>>;
  /** 'idle' | 'saving' | 'saved' | 'error'. */
  status: 'idle' | 'saving' | 'saved' | 'error';
  /** Plain-language reason the last save failed ('' when none). */
  saveError: string;
  /** True when the working chart has content the cloud hasn't stored. */
  dirty: boolean;
  /** Save the current chart to the cloud now. */
  saveNow: () => Promise<void>;
  /** A chart that has never reached the cloud and holds only patient/owner
   *  details: autosave waits for clinical content, so the UI offers a
   *  manual Save. False once the chart has been saved (by either route). */
  awaitingClinical: boolean;
  /** Skip the same-day duplicate question for the next new chart's first
   *  save (the user already answered it, e.g. when starting a new visit). */
  /** The same-day question was already answered for this new chart (it was
   *  asked when starting the visit): don't ask again on its first save. */
  skipDuplicateCheckFor: (chartId: string) => void;
  listCharts: (query?: ChartListQuery) => Promise<ChartListPage>;
  /** All visits for one patient (matched by number when present, else
   *  by name) — powers the topbar visit switcher. */
  listPatientVisits: (patientNumber: string, patientName: string) => Promise<CloudChartMeta[]>;
  /** Ask before replacing a chart that has unsaved changes; true = go ahead. */
  confirmDiscardIfDirty: (action: DiscardAction) => Promise<boolean>;
  /** `ifClean`: skip (no prompt) when the working chart has unsaved edits. */
  /** Resolves true when the chart was opened, false when the user cancelled. */
  openChart: (id: string, opts?: { ifClean?: boolean; action?: DiscardAction; force?: boolean; skipConfirm?: boolean }) => Promise<boolean>;
  /** ISO time this chart last reached the cloud ('' = never). */
  lastSavedAt: string;
  /** Browser connectivity. */
  online: boolean;
  /** Fetch a chart's full snapshot (for "new visit from this patient"). */
  fetchChart: (id: string) => Promise<ChartSnapshot>;
  /** Chart history: save an earlier version as the current one (recorded
   *  as a new revision by you), then reload it. False if cancelled. */
  restoreRevision: (id: string, snapshot: ChartSnapshot) => Promise<boolean>;
  deleteChart: (id: string) => Promise<void>;
  /** Clear recheck reminders on these charts — for rechecks that happened
   *  without producing a new chart (the patient would otherwise sit in
   *  the Due list forever). Clears the row column AND the snapshot copy
   *  so a later re-save can't resurrect the date. */
  clearRecalls: (chartIds: string[]) => Promise<void>;
  signOut: () => Promise<void>;
}

/** A chart worth a cloud row: anything typed, marked, or drawn. */
function hasContent(s: ChartSnapshot): boolean {
  const p = s?.patientInfo;
  if (!p || typeof p !== 'object' || !Array.isArray(s.toothData)) return false;
  if ((p.patientName ?? '').trim() || (p.patientNumber ?? '').trim() || (p.ownerName ?? '').trim() || (p.ownerPhone ?? '').trim() || (p.ownerEmail ?? '').trim() || (p.complaint ?? '').trim() || (p.treatmentReport ?? '').trim()) return true;
  // Values are strings, except the drug list (and legacy `drug`); only a
  // named drug counts as content.
  if (Object.values(p.nerveBlocks ?? {}).some((v) =>
    Array.isArray(v) ? v.some((d) => (d?.name ?? '').trim()) : typeof v === 'string' && v.trim()
  )) return true;
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

/** Clinical content: anything charted beyond who the patient is. Patient
 *  and owner details (and the presenting complaint) are what gets filled
 *  in ahead of a visit, so they don't start autosave on their own — a
 *  chart reaches the cloud by itself once charting begins, or when the
 *  user presses Save.
 *
 *  Pre-op "missing" marks don't count either: "+ New visit" pre-marks the
 *  teeth already gone at the last visit, and counting those autosaved an
 *  untouched visit the moment it was started. Started by mistake, that
 *  left an empty same-day duplicate beside the real chart, listed as the
 *  patient's latest visit. */
export function hasClinicalContent(s: ChartSnapshot): boolean {
  if (!hasContent(s)) return false;
  const p = s.patientInfo;
  const preMarks = Object.fromEntries(Object.entries(s.preMarks ?? {}).filter(([, mark]) => mark !== 'missing'));
  const identityOnly = { ...s, preMarks, patientInfo: { ...p, patientName: '', patientNumber: '', ownerName: '', ownerPhone: '', ownerEmail: '', complaint: '' } };
  return hasContent(identityOnly as ChartSnapshot);
}

/** What the user is asking to leave the unsaved chart for. */
export type DiscardAction = 'openOther' | 'restore' | 'signOut' | 'newVisit' | 'newPatient' | 'importPdf';

/** A save failure whose user-facing wording we already know. The Error
 *  message stays English (internal); `userMessage` is what the user reads. */
class SaveFailure extends Error {
  constructor(message: string, readonly userMessage: string) {
    super(message);
  }
}

/** Turn a raw Supabase/network failure into something a vet can act on.
 *  The categories map to the real recovery step, not the internal cause. */
function describeSaveError(err: unknown): string {
  const t = i18n.getFixedT(null, 'app');
  if (err instanceof SaveFailure) return err.userMessage;
  const msg = err instanceof Error ? err.message : String(err ?? '');
  const code = (err as { code?: string } | null)?.code ?? '';
  if (/signed out|session|jwt|token|not authenticated|401/i.test(msg)) {
    return t('sync.sessionExpired');
  }
  if (code === '42501' || /row-level security|permission denied|not authorized|403/i.test(msg)) {
    return t('sync.notAllowed');
  }
  if (code === '54000' || /quota|payload|too large|entity too large|413/i.test(msg)) {
    return t('sync.tooLarge');
  }
  if (/failed to fetch|network|timeout|timed out|connection|offline|econn/i.test(msg)) {
    return t('sync.offline');
  }
  return t('sync.saveFailed', { message: msg || t('sync.unknownError') });
}

/** A SaveFailure whose wording is one of the `app:sync.*` messages. */
function saveFailure(key: 'sync.changedByOther' | 'sync.notSavedConflict' | 'sync.noPermission' | 'sync.practiceUnknown', english: string): SaveFailure {
  const t = i18n.getFixedT(null, 'app');
  return new SaveFailure(english, t('sync.saveFailed', { message: t(key) }));
}

function todayIso(): string {
  return localDateISO();
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
  practiceId = '',
  /** A saved chart the user has unlocked for editing autosaves too. */
  editingUnlocked = false,
  /** The profile (and so practiceId) has loaded. Autosave waits for it, so
   *  a new chart's first save can't record "no practice" by racing it. */
  practiceReady = true
): UseCloudSyncReturn {
  // Trial/standalone: no account to save to — the hook is inert.
  const on = cloudEnabled && active;
  const practiceIdRef = React.useRef(practiceId);
  practiceIdRef.current = practiceId;
  const practiceReadyRef = React.useRef(practiceReady);
  practiceReadyRef.current = practiceReady;

  const [status, setStatus] = React.useState<UseCloudSyncReturn['status']>('idle');
  const [saveError, setSaveError] = React.useState('');
  // Hash of the snapshot last written to the cloud (persisted so unsaved
  // changes are still flagged after a reload).
  const [savedHash, setSavedHash] = usePersistedState<string>('chart.savedHash', 1, '');
  // When this chart last reached the cloud (for "Saved · 2:41 pm").
  const [lastSaved, setLastSaved] = usePersistedState<{ chartId: string; at: string }>('chart.lastSaved', 1, { chartId: '', at: '' });
  const lastSavedAt = lastSaved.chartId === chart.cloudChartId ? lastSaved.at : '';
  const lastSavedRef = React.useRef(lastSaved);
  lastSavedRef.current = lastSaved;
  // The chart state rewrote the whole working copy (another tab had put a
  // different chart there): these two describe this tab's chart too.
  const savedHashRef = React.useRef(savedHash);
  savedHashRef.current = savedHash;
  React.useEffect(() => {
    const rewrite = () => {
      writeJson('chart.savedHash', 1, savedHashRef.current);
      writeJson('chart.lastSaved', 1, lastSavedRef.current);
    };
    window.addEventListener(CHART_STORAGE_REWRITE_EVENT, rewrite);
    return () => window.removeEventListener(CHART_STORAGE_REWRITE_EVENT, rewrite);
  }, []);
  // Per-chart answer to an edit conflict: force = user chose "Replace with
  // mine"; blocked = "Keep theirs" (no more saves until reopened).
  const conflictRef = React.useRef<{ chartId: string; mode: 'none' | 'force' | 'blocked' }>({ chartId: '', mode: 'none' });
  const [online, setOnline] = React.useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  // Bumped on every 'online' event, even when we never saw 'offline' (a
  // save can fail on a flaky connection while navigator.onLine stays
  // true) — it re-runs autosave so a failed save is retried.
  const [reconnects, setReconnects] = React.useState(0);
  React.useEffect(() => {
    const up = () => { setOnline(true); setReconnects((n) => n + 1); };
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

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
  const currentHash = React.useMemo(() => hashStr(serialized), [serialized]);
  const contentful = React.useMemo(() => hasContent(snapshot), [snapshot]);
  const dirty = on && contentful && currentHash !== savedHash;
  const clinical = React.useMemo(() => hasClinicalContent(snapshot), [snapshot]);
  // Reached the cloud before (or is a saved chart opened from My charts).
  const everSaved = chart.openedExisting || lastSaved.chartId === chartId;
  const awaitingClinical = dirty && !everSaved && !clinical;

  const latest = React.useRef({ serialized, chartId });
  latest.current = { serialized, chartId };
  const dirtyRef = React.useRef(dirty);
  dirtyRef.current = dirty;
  const resetIdRef = React.useRef(chart.resetCloudChartId);
  resetIdRef.current = chart.resetCloudChartId;
  const openedExistingRef = React.useRef(chart.openedExisting);
  openedExistingRef.current = chart.openedExisting;
  const setOpenedExistingRef = React.useRef(chart.setOpenedExisting);
  setOpenedExistingRef.current = chart.setOpenedExisting;

  // Opening a cloud chart replays its content into state — treat that
  // applied state as the saved baseline (not a dirty edit).
  const baselineNext = React.useRef(false);
  // Bumped together with applying the chart, so the effect below runs in
  // that render even when the applied content serializes exactly like
  // what was on screen. Keyed on `serialized` alone, the flag then stayed
  // armed and the user's NEXT edit was recorded as already saved.
  const [baselineTick, setBaselineTick] = React.useState(0);
  const armBaseline = () => {
    baselineNext.current = true;
    setBaselineTick((n) => n + 1);
  };
  React.useEffect(() => {
    if (baselineNext.current) {
      baselineNext.current = false;
      setSavedHash(currentHash);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized, baselineTick]);

  // A dismissal suppresses automatic questions for this exact change only.
  const declinedIdentityRef = React.useRef('');
  const identityCheckingRef = React.useRef(false);
  const snapshotIdentity = (snap: ChartSnapshot): PatientIdentity => ({
    patient_name: snap.patientInfo.patientName ?? '',
    patient_number: snap.patientInfo.patientNumber ?? '',
  });

  const upsertChart = React.useCallback(async (
    json: string,
    id: string,
    /** Restoring an earlier version: stamped so history starts a new
     *  revision instead of merging the restore into the latest one. */
    opts: { restore?: boolean; automatic?: boolean } = {}
  ): Promise<void> => {
    if (!supabase) return;
    const client = supabase;
    const fail = (err: unknown): never => {
      setSaveError(describeSaveError(err));
      setStatus('error');
      throw err instanceof Error ? err : new Error(String(err));
    };
    try {
      const { data: sessionData } = await client.auth.getSession();
      // eslint-disable-next-line no-restricted-syntax -- dev-only: describeSaveError matches this English text and shows app:sync.sessionExpired
      if (!sessionData.session) fail(new Error('Signed out — sign in again to save.'));
      let snap: ChartSnapshot = JSON.parse(json);
      // The snapshot's `species` is the combined layout key (e.g.
      // 'canine-deciduous'); the row stores species + dentition split out.
      // Bookkeeping for a save that landed. Only for the chart it saved:
      // if another chart was opened meanwhile, crediting the save to it
      // marked a never-saved new visit "saved" (skipping the duplicate
      // check and the wait for charting) and gave an opened chart the
      // wrong baseline for conflict checks.
      const recordSaved = (savedJson: string, savedId: string, at: string) => {
        // (A forked save re-ids the chart on screen to savedId mid-save.)
        if (latest.current.chartId !== id && latest.current.chartId !== savedId) return;
        setSavedHash(hashStr(savedJson));
        setLastSaved({ chartId: savedId, at });
      };
      // New to the cloud: never saved from here, and not opened from a
      // saved chart (a forked retry id is new too).
      const isFirstSave = (rowId: string) =>
        rowId !== id || (!openedExistingRef.current && lastSavedRef.current.chartId !== id);
      // A new chart's first save records its practice for good (later saves
      // never send it). With the practice unknown (profile read failed),
      // don't record "no practice" by accident.
      if (isFirstSave(id) && !practiceReadyRef.current) {
        fail(saveFailure('sync.practiceUnknown', 'Practice not loaded yet; a new chart can\'t be saved to it.'));
      }
      const row = (rowId: string) => ({
        id: rowId,
        patient_name: snap.patientInfo.patientName,
        patient_number: snap.patientInfo.patientNumber,
        owner_name: snap.patientInfo.ownerName ?? '',
        owner_phone: snap.patientInfo.ownerPhone ?? '',
        owner_email: snap.patientInfo.ownerEmail ?? '',
        species: speciesBase(snap.species),
        dentition: speciesDentition(snap.species),
        chart_date: snap.patientInfo.date,
        recall_date: snap.patientInfo.recallDate ?? '',
        data: snap,
        // Only a chart's first save sets its practice. Rewriting it on every
        // save made a chart private when it saved before the profile
        // loaded, and moved old charts into whatever practice the user is
        // in now (sharing them against their choice). Practice moves are
        // done deliberately on the server.
        ...(isFirstSave(rowId) ? { practice_id: practiceIdRef.current || null } : {}),
      });
      // Edit conflict: a shared chart opened here may have been saved by
      // someone else since. Compare server timestamps (never the local
      // clock) and ask rather than silently overwrite their work.
      if (openedExistingRef.current && conflictRef.current.chartId !== id) {
        conflictRef.current = { chartId: '', mode: 'none' };
      }
      if (conflictRef.current.chartId === id && conflictRef.current.mode === 'blocked') {
        fail(saveFailure('sync.changedByOther', 'This chart was changed by someone else — reopen it from My charts to see their version.'));
      }
      const known = lastSavedRef.current;
      if (openedExistingRef.current && known.chartId === id && known.at && conflictRef.current.mode !== 'force') {
        const { data: remote } = await client.from('charts').select('updated_at').eq('id', id).maybeSingle();
        const remoteAt = Date.parse((remote as { updated_at?: string } | null)?.updated_at ?? '');
        if (Number.isFinite(remoteAt) && remoteAt - Date.parse(known.at) > 1000) {
          const t = i18n.getFixedT(null, 'app');
          const replace = await confirmDialog({
            title: t('sync.conflict.title'),
            message: t('sync.conflict.message', { when: formatTime(new Date(remoteAt)) }),
            confirmLabel: t('sync.conflict.confirm'),
            cancelLabel: t('sync.conflict.cancel'),
            danger: true,
          });
          conflictRef.current = { chartId: id, mode: replace ? 'force' : 'blocked' };
          if (!replace) fail(saveFailure('sync.notSavedConflict', 'Not saved — this chart was changed by someone else. Reopen it from My charts to see their version.'));
        }
      }
      // Always read the server identity, including a working chart restored
      // from localStorage: openedExisting/lastSaved are not proof it is new.
      // Explicit history restores already have their own deliberate flow.
      if (!opts.restore) {
        if (identityCheckingRef.current) return;
        identityCheckingRef.current = true;
        try {
          const proposed = snapshotIdentity(snap);
          const stillCurrent = () => latest.current.chartId === id &&
            identityKey(snapshotIdentity(JSON.parse(latest.current.serialized) as ChartSnapshot)) === identityKey(proposed);
          const { data: saved, error: identityError } = await client.from('charts')
            .select('patient_name, patient_number').eq('id', id).maybeSingle();
          if (identityError) fail(identityError);
          if (!stillCurrent()) fail(new LocalizedError(i18n.t('sync.identity.changed', { ns: 'app' })));
          if (saved && changesPatientIdentity(saved as PatientIdentity, proposed)) {
            const changeKey = JSON.stringify([id, identityKey(saved as PatientIdentity), identityKey(proposed)]);
            if (opts.automatic && declinedIdentityRef.current === changeKey) {
              fail(new SaveFailure('', i18n.t('sync.identity.paused', { ns: 'app' })));
            }
            const answer = await chooseDialog(patientIdentityQuestion(saved as PatientIdentity, proposed));
            if (!stillCurrent()) fail(new LocalizedError(i18n.t('sync.identity.changed', { ns: 'app' })));
            if (answer !== 'correct') {
              declinedIdentityRef.current = changeKey;
              fail(new SaveFailure('', i18n.t('sync.identity.paused', { ns: 'app' })));
            }
            // A teammate may have changed the saved patient while this
            // dialog was open. Approval only covers the displayed pair.
            const { data: current, error: recheckError } = await client.from('charts')
              .select('patient_name, patient_number').eq('id', id).maybeSingle();
            if (recheckError) fail(recheckError);
            if (!current || identityKey(current as PatientIdentity) !== identityKey(saved as PatientIdentity)) {
              fail(new LocalizedError(i18n.t('sync.identity.changed', { ns: 'app' })));
            }
          }
          if (!stillCurrent()) fail(new LocalizedError(i18n.t('sync.identity.changed', { ns: 'app' })));
          // Include clinical edits made during the question; their autosave
          // tick may already have been suppressed by the pending guard.
          json = latest.current.serialized;
          snap = JSON.parse(json) as ChartSnapshot;
          declinedIdentityRef.current = '';
        } finally {
          identityCheckingRef.current = false;
        }
      }
      setStatus('saving');
      setSaveError('');
      const restoreStamp = opts.restore ? { restored_at: new Date().toISOString() } : {};
      let { data: savedRow, error } = await client.from('charts').upsert({ ...row(id), ...restoreStamp }).select('updated_at').maybeSingle();
      if (error && opts.restore && /restored_at/.test(error.message)) {
        // Database without the column yet (migration 20261126): restore anyway.
        ({ data: savedRow, error } = await client.from('charts').upsert(row(id)).select('updated_at').maybeSingle());
      }
      if (!error) {
        // Server time, so later conflict checks compare like with like.
        recordSaved(json, id, (savedRow as { updated_at?: string } | null)?.updated_at ?? new Date().toISOString());
        setStatus('saved');
        return;
      }
      // A refused save usually means the row id belongs to another account
      // (stale localStorage after switching users) — RLS blocks the update.
      // Fork: mint a fresh id owned by this account and retry.
      const refused =
        error.code === '42501' ||
        /row-level security|permission denied|duplicate key/i.test(error.message);
      // Only a chart created on this device may fork: its id collided
      // with a row owned by someone else (stale storage after switching
      // users). A chart opened from My charts must never be silently
      // copied — that would leave the shared record unchanged while the
      // user believes it saved.
      if (refused && openedExistingRef.current) {
        fail(saveFailure('sync.noPermission', 'You don’t have permission to save changes to this chart. Ask the practice owner, or start a new visit.'));
      }
      if (refused) {
        // Only fork when the row really belongs to another account — RLS
        // then hides it entirely. If we can still read it, it's ours (or
        // our practice's): the save failed for some other reason, and
        // forking would silently copy the chart into a duplicate record
        // every time it happened (production showed chains of same-day
        // copies, each created the moment the previous one stopped saving).
        // Surface the real error instead.
        const { data: existing } = await client.from('charts').select('id').eq('id', id).maybeSingle();
        if (existing) {
          console.error('Chart save refused for a chart this account can read', { code: error.code, message: error.message });
          fail(error);
        }
        const freshId = resetIdRef.current();
        const { error: retryError } = await client.from('charts').upsert(row(freshId));
        if (retryError) fail(retryError);
        recordSaved(json, freshId, new Date().toISOString());
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

  // Same-day duplicate guard. Before a brand-new chart's FIRST save, look
  // for another visit of the same patient on the same visit date (people
  // re-starting a patient instead of reopening this morning's chart left
  // many same-day duplicates). Asked once per chart.
  const listPatientVisitsRef = React.useRef<(n: string, name: string) => Promise<CloudChartMeta[]>>(async () => []);
  const dupAnsweredRef = React.useRef('');
  // Tied to one chart: a bare "skip the next one" flag outlived a visit
  // that was never saved and let an unrelated chart skip the question.
  const skipDupForRef = React.useRef('');
  const dupCheckingRef = React.useRef(false);
  const skipDuplicateCheckFor = React.useCallback((chartId: string) => { skipDupForRef.current = chartId; }, []);
  const openChartRef = React.useRef<(id: string, opts?: { force?: boolean; skipConfirm?: boolean }) => Promise<boolean>>(async () => false);
  /** True = go ahead and save; false = don't (the user opened the other visit, or dismissed the question). */
  const passDuplicateCheck = async (snap: ChartSnapshot, id: string): Promise<boolean> => {
    if (!supabase || openedExistingRef.current || lastSavedRef.current.chartId === id || dupAnsweredRef.current === id) return true;
    if (skipDupForRef.current === id) {
      skipDupForRef.current = '';
      dupAnsweredRef.current = id;
      return true;
    }
    const p = snap.patientInfo;
    let visits: CloudChartMeta[] = [];
    try {
      visits = await listPatientVisitsRef.current(p.patientNumber ?? '', p.patientName ?? '');
    } catch {
      return true; // can't check (offline etc.) — never block a save on it
    }
    const base = speciesBase(snap.species);
    const same = visits.find((v) => v.id !== id && v.chart_date === p.date && v.species === base);
    dupAnsweredRef.current = id;
    if (!same) return true;
    const t = i18n.getFixedT(null, 'app');
    const name = (p.patientName ?? '').trim() || t('sync.duplicate.patient');
    // Three answers, not yes/no: as a confirm, dismissing (Escape, a click
    // outside) meant "Keep both" and saved the duplicate. Dismissed now =
    // not saved, and the next save asks again.
    const choice = await chooseDialog({
      title: same.chart_date === todayIso()
        ? t('sync.duplicate.titleToday', { name })
        : t('sync.duplicate.titleOn', { name, date: formatDate(same.chart_date) }),
      message: t('sync.duplicate.message'),
      choices: [
        { value: 'keep', label: t('sync.duplicate.cancel') },
        // Opening it discards this chart's entries: red.
        { value: 'open', label: t('sync.duplicate.confirm'), destructive: true },
      ],
    });
    if (choice === null) {
      dupAnsweredRef.current = '';
      return false;
    }
    if (choice !== 'open') return true;
    await openChartRef.current(same.id, { force: true, skipConfirm: true });
    return false;
  };

  const performSave = React.useCallback(async (automatic = false): Promise<void> => {
    const { serialized: json, chartId: id } = latest.current;
    const snap = JSON.parse(json) as ChartSnapshot;
    if (!hasContent(snap)) return;
    // One question at a time: an autosave tick while the dialog is open
    // must not stack a second one (or save before it's answered).
    if (dupCheckingRef.current || identityCheckingRef.current) return;
    dupCheckingRef.current = true;
    let proceed: boolean;
    try {
      proceed = await passDuplicateCheck(snap, id);
    } finally {
      dupCheckingRef.current = false;
    }
    if (!proceed || latest.current.chartId !== id) return;
    // The chart may have changed while the question was open — save the
    // latest content.
    await upsertChart(latest.current.serialized, id, { automatic });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upsertChart]);

  const pendingSaves = React.useRef(new Set<Promise<void>>());
  const workspacePaused = React.useRef(false);
  const [workspaceResume, setWorkspaceResume] = React.useState(0);
  React.useEffect(() => { workspacePaused.current = false; }, [chartId]);
  const resumeWorkspace = () => {
    workspacePaused.current = false;
    setWorkspaceResume(value => value + 1);
  };
  const saveNow = React.useCallback((automatic = false) => {
    if (workspacePaused.current) return Promise.resolve();
    const pending = performSave(automatic);
    pendingSaves.current.add(pending);
    void pending.finally(() => pendingSaves.current.delete(pending)).catch(() => {});
    return pending;
  }, [performSave]);
  const workspaceState = React.useRef({ saveError, dirty });
  workspaceState.current = { saveError, dirty };
  const captureWorkspace = async (): Promise<ChartWorkspace> => {
    workspacePaused.current = true;
    // An already-running save must settle before its baseline is captured.
    // Failure is still a valid local draft, never a reason to lose edits.
    await Promise.allSettled([...pendingSaves.current]);
    await new Promise(resolve => setTimeout(resolve, 0));
    return {
      id: latest.current.chartId, snapshot: JSON.parse(latest.current.serialized) as ChartSnapshot,
      openedExisting: openedExistingRef.current, savedHash: savedHashRef.current,
      lastSaved: lastSavedRef.current, conflict: { ...conflictRef.current },
      ...workspaceState.current, duplicateAnswered: dupAnsweredRef.current, skipDuplicate: skipDupForRef.current,
    };
  };
  const restoreWorkspace = (workspace: ChartWorkspace) => {
    baselineNext.current = false;
    savedHashRef.current = workspace.savedHash;
    lastSavedRef.current = workspace.lastSaved;
    setSavedHash(workspace.savedHash);
    setLastSaved(workspace.lastSaved);
    conflictRef.current = { ...workspace.conflict };
    dupAnsweredRef.current = workspace.duplicateAnswered;
    skipDupForRef.current = workspace.skipDuplicate;
    applyRef.current(workspace.snapshot, workspace.id);
    setOpenedExistingRef.current(workspace.openedExisting);
    if (!workspace.dirty) armBaseline();
    resumeWorkspace();
    setSaveError(workspace.saveError);
    setStatus(workspace.saveError ? 'error' : 'idle');
  };

  // Autosave — for NEW charts only. Charts opened from a saved one
  // (openedExisting) never autosave: they're read-only until the user
  // unlocks and saves deliberately, so history isn't overwritten. A
  // patient name is required first (that's how charts are found again).
  const saveNowRef = React.useRef(saveNow);
  saveNowRef.current = saveNow;
  // Saved charts autosave once the user has unlocked them (unlocking is
  // the deliberate step); while locked nothing can change anyway.
  // Offline, or a save failed: wait, and retry as soon as the connection
  // is back ('online' event).
  React.useEffect(() => {
    if (!on || (chart.openedExisting && !editingUnlocked)) return;
    if (!dirty || !online) return;
    // A new chart's first save waits until the practice is known.
    if (!practiceReady && !everSaved) return;
    if (!snapshot.patientInfo.patientName.trim()) return;
    // Filled in ahead of time (patient/owner details only): wait for
    // charting to start, or for an explicit Save.
    if (awaitingClinical) return;
    const t = window.setTimeout(() => { saveNowRef.current(true).catch(() => {}); }, 1200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceResume, on, chart.openedExisting, editingUnlocked, dirty, serialized, online, reconnects, awaitingClinical, practiceReady, everSaved]);

  // Guard leaving a chart with unsaved changes.
  const confirmDiscardIfDirty = async (action: DiscardAction): Promise<boolean> => {
    if (!dirtyRef.current) return true;
    const t = i18n.getFixedT(null, 'app');
    return confirmDialog({
      title: t('sync.discard.title'),
      message: t(`sync.discard.${action}.message`),
      confirmLabel: t(`sync.discard.${action}.confirm`),
      danger: true,
    });
  };

  const listCharts = React.useCallback((q: ChartListQuery = {}): Promise<ChartListPage> => listChartsPage(q), []);

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

  listPatientVisitsRef.current = listPatientVisits;

  const applyRef = React.useRef(chart.applySnapshot);
  applyRef.current = chart.applySnapshot;

  const openChart = React.useCallback(async (id: string, opts: { ifClean?: boolean; action?: DiscardAction; force?: boolean; skipConfirm?: boolean } = {}): Promise<boolean> => {
    if (!supabase) return false;
    // Deep links on page load never prompt: a working chart with edits
    // simply stays put (the user just reloaded their own work).
    if (opts.skipConfirm) {
      // The caller already asked (e.g. the same-day duplicate question).
    } else if (opts.ifClean) {
      if (dirtyRef.current) return false;
    } else if (!(await confirmDiscardIfDirty(opts.action ?? 'openOther'))) return false;
    // Already on screen with nothing unsaved: nothing to do. (Re-applying
    // identical content would leave the "saved baseline" armed and the
    // next edit wrongly treated as saved.)
    if (id === latest.current.chartId && !dirtyRef.current && !opts.force) return true;
    const { data, error } = await supabase
      .from('charts')
      .select('id, data, updated_at')
      .eq('id', id)
      .single();
    if (error) throw new Error(error.message);
    armBaseline(); // applied content is the saved baseline
    applyRef.current(data.data as ChartSnapshot, data.id);
    setLastSaved({ chartId: data.id, at: (data as { updated_at?: string }).updated_at ?? '' });
    conflictRef.current = { chartId: '', mode: 'none' };
    setStatus('idle');
    setSaveError('');
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  openChartRef.current = openChart;

  const restoreRevision = React.useCallback(async (id: string, snapshot: ChartSnapshot): Promise<boolean> => {
    if (!supabase) return false;
    // Unsaved edits here would be replaced — ask, as opening a chart does.
    if (!(await confirmDiscardIfDirty('restore'))) return false;
    // A deliberate restore: don't stop at the "changed elsewhere" check.
    // Only for this save: if it fails, later saves must still be checked,
    // or they'd silently overwrite a teammate's newer version.
    conflictRef.current = { chartId: id, mode: 'force' };
    try {
      await upsertChart(JSON.stringify(snapshot), id, { restore: true });
      const { data, error } = await supabase.from('charts').select('id, data, updated_at').eq('id', id).single();
      if (error) throw new Error(error.message);
      armBaseline(); // the restored content is the saved baseline
      applyRef.current(data.data as ChartSnapshot, data.id);
      setLastSaved({ chartId: data.id, at: (data as { updated_at?: string }).updated_at ?? '' });
    } finally {
      conflictRef.current = { chartId: '', mode: 'none' };
    }
    setStatus('saved');
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upsertChart]);

  const fetchChart = React.useCallback(async (id: string): Promise<ChartSnapshot> => {
    if (!supabase) throw new LocalizedError(i18n.t('sync.cloudNotConfigured', { ns: 'app' }));
    const { data, error } = await supabase.from('charts').select('data').eq('id', id).single();
    if (error) throw new Error(error.message);
    return data.data as ChartSnapshot;
  }, []);

  const deleteChart = React.useCallback(async (id: string): Promise<void> => {
    if (!supabase) return;
    const { data: deleted, error } = await supabase.from('charts').delete().eq('id', id).select('id');
    if (error) throw new Error(error.message);
    // Row security makes a forbidden delete a silent no-op: say so, and
    // never clean up the images of a chart that still exists.
    if (!deleted?.length) throw new LocalizedError(i18n.t('sync.noDeletePermission', { ns: 'app' }));
    // Its images too (they reference the chart by id only). The chart is
    // already gone, so a failure here only leaves files behind, as before.
    await removeChartAttachments(supabase, id).catch((err) => {
      console.error('Chart deleted, but its images could not all be removed', err);
    });
    // Deleted the chart that's open: it now exists only on this screen.
    // Give it a fresh identity and mark it unsaved, so it neither looks
    // saved nor silently re-creates the deleted record.
    if (id === latest.current.chartId) {
      resetIdRef.current();
      setOpenedExistingRef.current(false);
      // Not "unsaved": that made autosave put it straight back as a new
      // record (and again after any reload). Its content is the baseline;
      // an edit, or Save, is the user choosing to keep it as a new chart.
      setSavedHash(hashStr(latest.current.serialized));
    }
  }, [setSavedHash]);

  const clearRecalls = React.useCallback(async (chartIds: string[]): Promise<void> => {
    if (!supabase || chartIds.length === 0) return;
    for (const id of chartIds) {
      const { data, error } = await supabase.from('charts').select('data, updated_at').eq('id', id).single();
      if (error) throw new Error(error.message);
      const snap = data.data as ChartSnapshot;
      if (snap?.patientInfo) snap.patientInfo.recallDate = '';
      // Was the server copy still the version this screen knows? Only then
      // is the clear's new server time "ours" (below); if a teammate saved
      // meanwhile, the next save must still catch that conflict.
      const known = lastSavedRef.current;
      const readAt = Date.parse((data as { updated_at?: string }).updated_at ?? '');
      const wasKnown = known.chartId === id && Number.isFinite(readAt) && Math.abs(readAt - Date.parse(known.at)) <= 1000;
      const { data: updated, error: updateError } = await supabase
        .from('charts')
        .update({ recall_date: '', data: snap })
        .eq('id', id)
        .select('updated_at')
        .maybeSingle();
      if (updateError) throw new Error(updateError.message);
      // Our own change to the chart that's open: its new server time is the
      // one we know, or the next save calls it "changed by someone else".
      const at = (updated as { updated_at?: string } | null)?.updated_at;
      if (at && wasKnown) setLastSaved({ chartId: id, at });
    }
  }, [setLastSaved]);

  const signOut = React.useCallback(async (): Promise<void> => {
    if (!supabase) return;
    if (!(await confirmDiscardIfDirty('signOut'))) return;
    await signOutAndSweep();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    enabled: on,
    captureWorkspace,
    restoreWorkspace,
    resumeWorkspace,
    pauseWorkspace: () => { workspacePaused.current = true; },
    discardImageDraft,
    hasImages: hasChartImages,
    hasPendingImageUpload,
    findImageDrafts,
    status,
    saveError,
    dirty,
    confirmDiscardIfDirty,
    lastSavedAt,
    online,
    saveNow,
    awaitingClinical,
    skipDuplicateCheckFor,
    listCharts,
    listPatientVisits,
    openChart,
    fetchChart,
    restoreRevision,
    deleteChart,
    clearRecalls,
    signOut,
  };
}
