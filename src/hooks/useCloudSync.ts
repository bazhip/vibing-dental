import { errorCode, logEventThrottled } from '../utils/appEvents';
import { ctRecordedText } from '../utils/ctReportState';
import { radiologyRecordedText } from '../utils/radiologyReportState';
import { NOTE_DROPDOWN_SNAPSHOT_VERSION } from '../utils/consultationTemplates';
import { hasVisitDocumentation } from '../utils/visitDocumentation';
import { readPracticeChartFieldAnswers } from '../utils/practiceChartFieldAnswers';
import { visitTypeOf } from '../utils/visitTypes';
import React from 'react';
import { reservePatientNumber } from '../utils/patientNumberAllocation';
import { isGeneratedPatientNumber } from '../utils/patientIds';
import { fieldLines, filledBlocks } from '../utils/customAnesthesia';
import { answeredCustomExam } from '../utils/customExam';
import { mergeChartSnapshots, sameChartSnapshot } from '../utils/chartSnapshotMerge';
import { ownsChartStorage } from '../utils/chartOwner';
import { hasChartImages, hasPendingImageUpload, findImageDrafts, discardImageDraft } from '../utils/imageDrafts';
import { localDateISO } from '../utils/localDate';
import { ChartSnapshot, hasNerveBlockEntries } from '../types';
import { chooseDialog, confirmDialog } from '../components/ui/dialogs';
import i18n from '../i18n';
import { formatDate, formatTime } from '../i18n/format';
import { supabase, cloudEnabled } from '../utils/supabaseClient';
import { usePersistedState } from './usePersistedState';
import { writeJson } from '../utils/storage';
import { CHART_STORAGE_REWRITE_EVENT, UseChartStateReturn, clearChartStorage, isChartSnapshot } from './useChartState';
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
 * Cloud persistence on top of useChartState.
 *
 * The device keeps the working copy. Named drafts and editable visits
 * autosave when enabled. Each successful cloud write records its version
 * so other devices can refresh clean charts and preserve concurrent edits.
 */

export type { CloudChartMeta, ChartListQuery, ChartListPage };

interface ChartBaseline { chartId: string; at: string; snapshot?: ChartSnapshot }

export interface ChartWorkspace {
  id: string;
  snapshot: ChartSnapshot;
  openedExisting: boolean;
  savedHash: string;
  lastSaved: ChartBaseline;
  saveError: string;
  dirty: boolean;
  duplicateAnswered: string;
  skipDuplicate: string;
}

export interface UseCloudSyncReturn {
  enabled: boolean;
  /** Preserve a working chart without requiring a cloud save. */
  captureWorkspace?: (options?: { flush?: boolean }) => Promise<ChartWorkspace>;
  restoreWorkspace?: (workspace: ChartWorkspace) => void;
  syncWorkspace?: (workspace: ChartWorkspace) => Promise<ChartWorkspace | null>;
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
  /** Save the explicit lifecycle change; false when saving was cancelled. */
  setFinalized: (finalized: boolean) => Promise<boolean>;
  autosaveEnabled?: boolean;
  /** A new chart before clinical charting starts. */
  preclinical: boolean;
  /** Skip the same-day duplicate question for the next new chart's first
   *  save (the user already answered it, e.g. when starting a new visit). */
  /** The same-day question was already answered for this new chart (it was
   *  asked when starting the visit): don't ask again on its first save. */
  skipDuplicateCheckFor: (chartId: string) => void;
  listCharts: (query?: ChartListQuery) => Promise<ChartListPage>;
  /** All visits for one patient (matched by number when present, else
   *  by name) — powers the topbar visit switcher. */
  listPatientVisits: (patientNumber: string, patientName: string, patientId?: string, allPages?: boolean) => Promise<CloudChartMeta[]>;
  /** Ask before replacing a chart that has unsaved changes; true = go ahead. */
  confirmDiscardIfDirty: (action: DiscardAction) => Promise<boolean>;
  /** `ifClean`: skip (no prompt) when the working chart has unsaved edits. */
  /** Resolves true when the chart was opened, false when the user cancelled. */
  openChart: (id: string, opts?: { ifClean?: boolean; action?: DiscardAction; force?: boolean; skipConfirm?: boolean }) => Promise<boolean>;
  /** Bring a clean working copy up to date without disrupting its session. */
  refreshOpenChart: () => Promise<void>;
  /** ISO time this chart last reached the cloud ('' = never). */
  lastSavedAt: string;
  /** Browser connectivity. */
  online: boolean;
  /** Fetch a chart's full snapshot (for "new visit from this patient"). */
  fetchChart: (id: string, practiceId?: string) => Promise<ChartSnapshot>;
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
  if ((p.patientName ?? '').trim() || ((p.patientNumber ?? '').trim() && !isGeneratedPatientNumber(p)) || (p.ownerName ?? '').trim() || (p.ownerPhone ?? '').trim() || (p.ownerEmail ?? '').trim() || (p.complaint ?? '').trim() || (p.treatmentReport ?? '').trim()) return true;
  if (s.clinicalDictations?.length || s.voiceReviews?.length) return true;
  if (hasVisitDocumentation(p) || radiologyRecordedText(p).trim() || ctRecordedText(p).trim()) return true;
  if (readPracticeChartFieldAnswers(p.practiceChartFields).length) return true;
  if (p.secondNerveBlocks && hasNerveBlockEntries(p.secondNerveBlocks)) return true;
  if (s.plannedExtractions?.length) return true;
  // Values are strings, except the drug list (and legacy `drug`); only a
  // named drug counts as content.
  if (Object.values(p.nerveBlocks ?? {}).some((v) =>
    Array.isArray(v) ? v.some((d) => (d?.name ?? '').trim()) : typeof v === 'string' && v.trim()
  )) return true;
  if (Object.values(p.exam ?? {}).some((e) => e?.status || (e?.comment ?? '').trim())) return true;
  if (answeredCustomExam(p.customExam).length || filledBlocks(p.customAnesthesia).length || fieldLines(p.customAnesthesia).length) return true;
  if (s.toothData.some((t) =>
    [t.mobility, t.recession, t.pocket, t.furcation, t.hyperplasia, t.calculus, t.gingivitis, t.pdstate]
      .some((v) => (v ?? '').trim())
  )) return true;
  if (Object.keys(s.preMarks ?? {}).length || Object.keys(s.postMarks ?? {}).length) return true;
  if ((s.preComments ?? []).length || (s.postComments ?? []).length) return true;
  if ((s.preStrokes ?? []).length || (s.postStrokes ?? []).length) return true;
  return false;
}

/** Selects Save for an identity-only draft and Finalize once clinical
 * charting begins. Previously missing teeth carried into a new visit
 * are part of the starting snapshot, not observations from this visit. */
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

function isSameVisit(visit: CloudChartMeta, snapshot: ChartSnapshot, excludedId: string): boolean {
  return visit.id !== excludedId && visit.chart_date === snapshot.patientInfo.date
    && visit.species === speciesBase(snapshot.species)
    && visitTypeOf(visit.visit_type) === visitTypeOf(snapshot.patientInfo.visitType);
}

function todayIso(): string {
  return localDateISO();
}

// Existing rows keep their original practice, even if the current profile changed.
function chartRow(snapshot: ChartSnapshot, id: string, practiceId?: string | null) {
  const patient = snapshot.patientInfo;
  return {
    id,
    patient_name: patient.patientName,
    patient_number: patient.patientNumber,
    owner_name: patient.ownerName ?? '',
    owner_phone: patient.ownerPhone ?? '',
    owner_email: patient.ownerEmail ?? '',
    species: speciesBase(snapshot.species),
    dentition: speciesDentition(snapshot.species),
    chart_date: patient.date,
    recall_date: patient.recallDate ?? '',
    data: snapshot,
    ...(practiceId !== undefined ? { practice_id: practiceId } : {}),
  };
}

// When one insert committed but its response was lost, an idempotent retry
// returns no row. Only accept a cloud copy with the same saved content.
async function recoverInsertVersion(client: NonNullable<typeof supabase>, id: string, snapshot: ChartSnapshot): Promise<string> {
  const { data } = await client.from('charts').select('data, updated_at').eq('id', id).maybeSingle();
  return isChartSnapshot(data?.data) && sameChartSnapshot(snapshot, data.data) ? data.updated_at ?? '' : '';
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
  practiceReady = true,
  autosaveEnabled = true
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
  const [lastSaved, setLastSaved] = usePersistedState<ChartBaseline>('chart.lastSaved', 1, { chartId: '', at: '' });
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

  const latest = React.useRef({ serialized, chartId, session: chart.chartSession, on });
  latest.current = { serialized, chartId, session: chart.chartSession, on };
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
    opts: { restore?: boolean; automatic?: boolean; finalized?: boolean } = {}
  ): Promise<boolean> => {
    if (!supabase) return false;
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
      // check) and gave an opened chart the
      // wrong baseline for conflict checks.
      const recordSaved = (savedJson: string, savedId: string, at: string) => {
        // (A forked save re-ids the chart on screen to savedId mid-save.)
        if (latest.current.chartId !== id && latest.current.chartId !== savedId) return;
        const saved = { chartId: savedId, at, snapshot: JSON.parse(savedJson) as ChartSnapshot };
        const hash = hashStr(savedJson);
        savedHashRef.current = hash;
        lastSavedRef.current = saved;
        setSavedHash(hash);
        setLastSaved(saved);
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
      const row = (rowId: string, includePractice = isFirstSave(rowId)) =>
        chartRow(snap, rowId, includePractice ? practiceIdRef.current || null : undefined);
      // The server version we read here is also a predicate on the write.
      // A second device can save even while a confirmation is open.
      const known = lastSavedRef.current;
      let expectedAt = '';
      if (!isFirstSave(id) || opts.restore) {
        const { data: remote, error: versionError } = await client.from('charts')
          .select('updated_at').eq('id', id).maybeSingle();
        if (versionError) fail(versionError);
        if (!remote?.updated_at) fail(saveFailure('sync.noPermission', 'The chart is no longer available.'));
        expectedAt = remote!.updated_at;
      }
      // Always read the server identity, including a working chart restored
      // from localStorage: openedExisting/lastSaved are not proof it is new.
      // Explicit history restores already have their own deliberate flow.
      if (!opts.restore) {
        if (identityCheckingRef.current) return false;
        identityCheckingRef.current = true;
        try {
          const proposed = snapshotIdentity(snap);
          const stillCurrent = () => latest.current.chartId === id &&
            identityKey(snapshotIdentity(JSON.parse(latest.current.serialized) as ChartSnapshot)) === identityKey(proposed);
          const { data: saved, error: identityError } = await client.from('charts')
            .select('patient_name, patient_number').eq('id', id).maybeSingle();
          if (identityError) fail(identityError);
          if (!stillCurrent()) fail(new LocalizedError(i18n.t('sync.identity.changed', { ns: 'app' })));
          if (saved && changesPatientIdentity(saved as PatientIdentity, proposed, snap.patientInfo.generatedPatientNumber)) {
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
      const submittedLocal = snap;
      const submittedLocalJson = json;
      let includedRemoteEdits = false;
      let startsNewRevision = !!opts.restore;
      if (!opts.restore && known.chartId === id && known.at && expectedAt && expectedAt !== known.at) {
        let merged: ChartSnapshot | null = null;
        if (isChartSnapshot(known.snapshot) && opts.finalized === undefined) {
          const { data: remote, error: latestError } = await client.from('charts')
            .select('data, updated_at').eq('id', id).eq('updated_at', expectedAt).maybeSingle();
          if (latestError) fail(latestError);
          if (isChartSnapshot(remote?.data)) merged = mergeChartSnapshots(known.snapshot, snap, remote.data);
        }
        if (merged) {
          includedRemoteEdits = true;
          snap = merged;
          json = JSON.stringify(merged);
        } else {
          const conflictError = () => saveFailure('sync.notSavedConflict', 'Another device saved changes; this device still has your edits.');
          if (opts.automatic) fail(conflictError());
          const t = i18n.getFixedT(null, 'app');
          const replace = await confirmDialog({
            title: t('sync.conflict.title'),
            message: t('sync.conflict.message', { when: formatTime(new Date(expectedAt)) }),
            confirmLabel: t('sync.conflict.confirm'),
            cancelLabel: t('sync.conflict.cancel'),
            danger: true,
          });
          if (!replace || latest.current.chartId !== id || latest.current.serialized !== submittedLocalJson) fail(conflictError());
          startsNewRevision = true;
        }
      }
      setStatus('saving');
      setSaveError('');
      if (opts.finalized !== undefined) {
        if (opts.finalized) snap.finalizedAt = new Date().toISOString();
        else delete snap.finalizedAt;
        json = JSON.stringify(snap);
      }
      const chartTable = () => client.from('charts');
      const write = (restoreStamp: { restored_at?: string }) => {
        const data = { ...row(id, !expectedAt && isFirstSave(id)), ...restoreStamp };
        return (expectedAt
          ? chartTable().update(data).eq('id', id).eq('updated_at', expectedAt)
          : chartTable().upsert(data, { onConflict: 'id', ignoreDuplicates: true })
        ).select('updated_at').maybeSingle();
      };
      let { data: savedRow, error } = await write(startsNewRevision ? { restored_at: new Date().toISOString() } : {});
      if (error && opts.restore && /restored_at/.test(error.message)) {
        ({ data: savedRow, error } = await write({}));
      }
      if (!error) {
        const savedAt = savedRow?.updated_at || (!expectedAt ? await recoverInsertVersion(client, id, snap) : '');
        if (!savedAt) fail(saveFailure('sync.notSavedConflict', 'The chart changed before this save could finish.'));
        if (includedRemoteEdits && latest.current.chartId === id) {
          // More dictation may have landed while the write was in flight.
          // Reapply it over the merged revision before advancing the baseline.
          const sameLocal = latest.current.serialized === submittedLocalJson;
          const working = sameLocal ? snap
            : mergeChartSnapshots(submittedLocal, JSON.parse(latest.current.serialized) as ChartSnapshot, snap);
          if (!working) fail(saveFailure('sync.notSavedConflict', 'New local edits overlap an edit from another device.'));
          applyRef.current(working!, id, { preserveSession: true });
          if (sameLocal) armBaseline();
        }
        recordSaved(json, id, savedAt);
        setStatus('saved');
        if (opts.finalized !== undefined && latest.current.chartId === id) {
          finalizedSetter.current(snap.finalizedAt ?? null);
        }
        return true;
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
        const { data: retryRow, error: retryError } = await client.from('charts')
          .upsert(row(freshId), { onConflict: 'id', ignoreDuplicates: true }).select('updated_at').maybeSingle();
        if (retryError) fail(retryError);
        if (!retryRow?.updated_at) fail(saveFailure('sync.notSavedConflict', 'The new chart could not be confirmed saved.'));
        recordSaved(json, freshId, retryRow!.updated_at);
        setStatus('saved');
        if (opts.finalized !== undefined && (latest.current.chartId === id || latest.current.chartId === freshId)) {
          finalizedSetter.current(snap.finalizedAt ?? null);
        }
        return true;
      }
      return fail(error);
    } catch (err) {
      // Network/parse rejections land here (supabase-js throws these
      // rather than returning {error}); categorize the same way. fail()
      // rethrows through here too — describeSaveError is deterministic,
      // so re-setting the same message is harmless.
      setSaveError(describeSaveError(err));
      setStatus('error');
      logEventThrottled('save', 'save_failed', 'fail', { code: errorCode(err), automatic: !!opts.automatic, restore: !!opts.restore });
      throw err;
    }
    // setSavedHash identity is stable (usePersistedState) — safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Same-day duplicate guard. Before a brand-new chart's FIRST save, look
  // for another visit of the same type, patient, and date (people
  // re-starting a patient instead of reopening this morning's chart left
  // many same-day duplicates). Asked once per chart.
  const listPatientVisitsRef = React.useRef<(n: string, name: string, patientId?: string) => Promise<CloudChartMeta[]>>(async () => []);
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
      visits = await listPatientVisitsRef.current(p.patientNumber ?? '', p.patientName ?? '', p.patientId);
    } catch {
      return true; // can't check (offline etc.) — never block a save on it
    }
    const same = visits.find(visit => isSameVisit(visit, snap, id));
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

  const allocationFailed = React.useRef(false);
  const patientSetter = React.useRef(chart.setPatientInfo);
  patientSetter.current = chart.setPatientInfo;
  const assignPatientNumber = async () => {
    const { chartId: id, serialized: json } = latest.current;
    const info = (JSON.parse(json) as ChartSnapshot).patientInfo;
    if (!on || !info.patientId || info.patientNumber.trim() || info.generatedPatientNumber) return;
    if (!practiceReadyRef.current) throw new LocalizedError(i18n.t('sync.practiceUnknown', { ns: 'app' }));
    const practice = practiceIdRef.current;
    const number = await reservePatientNumber(info.patientId, practice);
    if (latest.current.chartId !== id || practiceIdRef.current !== practice) return;
    const current = JSON.parse(latest.current.serialized) as ChartSnapshot;
    if (current.patientInfo.patientId !== info.patientId || current.patientInfo.patientNumber.trim() || current.patientInfo.generatedPatientNumber) return;
    if (allocationFailed.current) { allocationFailed.current = false; setSaveError(''); setStatus('idle'); }
    const assigned = { ...current.patientInfo, patientNumber: number, generatedPatientNumber: number };
    // Explicit Save can be awaiting this promise while React batches the setter.
    // Its snapshot and saved baseline must already contain the reserved number.
    latest.current = { ...latest.current, serialized: JSON.stringify({ ...current, patientInfo: assigned }) };
    patientSetter.current(previous => previous.patientId === info.patientId && !previous.patientNumber.trim() && !previous.generatedPatientNumber
      ? { ...previous, patientNumber: number, generatedPatientNumber: number } : previous);
  };
  const assignPatientNumberRef = React.useRef(assignPatientNumber);
  assignPatientNumberRef.current = assignPatientNumber;
  React.useEffect(() => {
    if (!on || !practiceReady || !online || !snapshot.patientInfo.patientId || snapshot.patientInfo.patientNumber.trim() || snapshot.patientInfo.generatedPatientNumber) return;
    let cancelled = false;
    void assignPatientNumberRef.current().catch(error => {
      if (!cancelled) { allocationFailed.current = true; setSaveError(describeSaveError(error)); setStatus('error'); }
    });
    return () => { cancelled = true; };
  }, [on, practiceReady, practiceId, online, reconnects, chartId, snapshot.patientInfo.patientId, snapshot.patientInfo.patientNumber, snapshot.patientInfo.generatedPatientNumber]);

  const finalizedSetter = React.useRef(chart.setFinalizedAt);
  finalizedSetter.current = chart.setFinalizedAt;
  const performSave = React.useCallback(async (automatic = false, finalized?: boolean): Promise<boolean> => {
    const targetId = latest.current.chartId;
    try { await assignPatientNumberRef.current(); }
    catch (error) { allocationFailed.current = true; setSaveError(describeSaveError(error)); setStatus('error'); throw error; }
    if (latest.current.chartId !== targetId) return false;
    const { serialized: json, chartId: id } = latest.current;
    const snap = JSON.parse(json) as ChartSnapshot;
    if (!hasContent(snap) || (finalized !== undefined && !snap.patientInfo.patientName.trim())) return false;
    // One question at a time: an autosave tick while the dialog is open
    // must not stack a second one (or save before it's answered).
    if (dupCheckingRef.current || identityCheckingRef.current) return false;
    dupCheckingRef.current = true;
    let proceed: boolean;
    try {
      proceed = await passDuplicateCheck(snap, id);
    } finally {
      dupCheckingRef.current = false;
    }
    if (!proceed || latest.current.chartId !== id) return false;
    // The chart may have changed while the question was open — save the
    // latest content.
    return upsertChart(latest.current.serialized, id, { automatic, finalized });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upsertChart]);

  const pendingSaves = React.useRef(new Set<Promise<void>>());
  const lifecyclePending = React.useRef(false);
  const workspacePaused = React.useRef(false);
  const [workspaceResume, setWorkspaceResume] = React.useState(0);
  React.useEffect(() => { workspacePaused.current = false; }, [chartId]);
  const resumeWorkspace = () => {
    workspacePaused.current = false;
    setWorkspaceResume(value => value + 1);
  };
  const autosaveRequested = React.useRef(false);
  const saveNow = React.useCallback((automatic = false) => {
    if (lifecyclePending.current || (automatic && workspacePaused.current)) return Promise.resolve();
    if (pendingSaves.current.size) {
      autosaveRequested.current ||= automatic;
      return Promise.resolve();
    }
    const target = latest.current.chartId;
    let saved = false;
    const pending = performSave(automatic).then(ok => { saved = ok; });
    pendingSaves.current.add(pending);
    void pending.finally(() => {
      pendingSaves.current.delete(pending);
      const missed = autosaveRequested.current;
      autosaveRequested.current = false;
      if (missed && saved && !workspacePaused.current && target === latest.current.chartId) {
        setWorkspaceResume(value => value + 1);
      }
    }).catch(() => {});
    return pending;
  }, [performSave]);
  const setFinalized = (finalized: boolean): Promise<boolean> => {
    if (!on || !online || lifecyclePending.current) return Promise.resolve(false);
    lifecyclePending.current = true;
    const id = latest.current.chartId;
    const previousSaves = [...pendingSaves.current];
    const pending = (async () => {
      try {
        await Promise.all(previousSaves);
        if (latest.current.chartId !== id) return false;
        return await performSave(false, finalized);
      } finally {
        lifecyclePending.current = false;
      }
    })();
    const tracked = pending.then(() => {});
    pendingSaves.current.add(tracked);
    void tracked.finally(() => pendingSaves.current.delete(tracked)).catch(() => {});
    return pending;
  };
  const workspaceState = React.useRef({ saveError, dirty });
  workspaceState.current = { saveError, dirty };
  const canAutosave = on && autosaveEnabled && !snapshot.finalizedAt &&
    (!chart.openedExisting || editingUnlocked) && dirty && online &&
    (practiceReady || everSaved) && !!snapshot.patientInfo.patientName.trim();
  const captureWorkspace = async (options?: { flush?: boolean }): Promise<ChartWorkspace> => {
    // A quick switch can beat the debounce. Start that save while this
    // chart still owns the save context; a failed upload remains a draft.
    if (options?.flush && canAutosave && pendingSaves.current.size === 0) {
      void saveNow(true).catch(() => undefined);
    }
    workspacePaused.current = true;
    // An already-running save must settle before its baseline is captured.
    // Failure is still a valid local draft, never a reason to lose edits.
    await Promise.allSettled([...pendingSaves.current]);
    await new Promise(resolve => setTimeout(resolve, 0));
    return {
      id: latest.current.chartId, snapshot: JSON.parse(latest.current.serialized) as ChartSnapshot,
      openedExisting: openedExistingRef.current, savedHash: savedHashRef.current,
      lastSaved: lastSavedRef.current,
      ...workspaceState.current,
      dirty: workspaceState.current.dirty && hashStr(latest.current.serialized) !== savedHashRef.current,
      duplicateAnswered: dupAnsweredRef.current, skipDuplicate: skipDupForRef.current,
    };
  };
  const restoreWorkspace = (workspace: ChartWorkspace) => {
    baselineNext.current = false;
    savedHashRef.current = workspace.savedHash;
    lastSavedRef.current = workspace.lastSaved;
    setSavedHash(workspace.savedHash);
    setLastSaved(workspace.lastSaved);
    dupAnsweredRef.current = workspace.duplicateAnswered;
    skipDupForRef.current = workspace.skipDuplicate;
    applyRef.current(workspace.snapshot, workspace.id);
    setOpenedExistingRef.current(workspace.openedExisting);
    if (!workspace.dirty) armBaseline();
    resumeWorkspace();
    setSaveError(workspace.saveError);
    setStatus(workspace.saveError ? 'error' : 'idle');
  };

  // Named drafts are eligible before charting. Finalized visits require
  // an explicit reopen. Retry a failed save when the connection returns.
  const saveNowRef = React.useRef(saveNow);
  saveNowRef.current = saveNow;
  React.useEffect(() => {
    if (!canAutosave) return;
    const t = window.setTimeout(() => { saveNowRef.current(true).catch(() => {}); }, 1200);
    return () => window.clearTimeout(t);
  }, [workspaceResume, canAutosave, serialized, reconnects]);

  const flushBeforeLeave = React.useRef(async () => false);
  flushBeforeLeave.current = async () => {
    if (!canAutosave && pendingSaves.current.size === 0) return false;
    if (canAutosave && pendingSaves.current.size === 0) void saveNow(true).catch(() => undefined);
    await Promise.allSettled([...pendingSaves.current]);
    return hashStr(latest.current.serialized) === savedHashRef.current;
  };

  // Guard leaving a chart with unsaved changes.
  const confirmDiscardIfDirty = async (action: DiscardAction): Promise<boolean> => {
    if (!dirtyRef.current) return true;
    if (action !== 'restore' && action !== 'signOut') {
      const id = latest.current.chartId;
      const saved = await flushBeforeLeave.current();
      if (latest.current.chartId !== id) return false;
      if (saved) return true;
    }
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
    patientName: string,
    patientId?: string,
    allPages = false,
  ): Promise<CloudChartMeta[]> => {
    if (!supabase) return [];
    const num = patientNumber.trim();
    const name = patientName.trim();
    if (!num && !name && !patientId) return [];
    let query = supabase
      .from('charts')
      .select(CHART_META_COLUMNS);
    // Same identity rule the library's grouping uses: the patient number
    // is the key when present; name-keyed only for number-less charts.
    // ilike without wildcards = case-insensitive equality.
    if (patientId) query = query.eq('data->patientInfo->>patientId', patientId);
    else if (num) query = query.ilike('patient_number', escapeLike(num));
    else query = query.ilike('patient_name', escapeLike(name)).eq('patient_number', '');
    const pageSize = 200;
    if (!allPages) {
      const { data, error } = await query.order('updated_at', { ascending: false }).limit(pageSize);
      if (error) throw new Error(error.message);
      return (data ?? []) as CloudChartMeta[];
    }

    const visits: CloudChartMeta[] = [];
    query = query.order('id');
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await query.range(offset, offset + pageSize - 1);
      if (error) throw new Error(error.message);
      const page = (data ?? []) as CloudChartMeta[];
      visits.push(...page);
      if (page.length < pageSize) return visits;
    }
  }, []);

  listPatientVisitsRef.current = listPatientVisits;

  // Inactive browser workspaces survive reconnect and restart. They can
  // save in the background when they need no identity or duplicate review.
  const syncWorkspace = React.useCallback(async (workspace: ChartWorkspace): Promise<ChartWorkspace | null> => {
    if (!supabase || !on || !online || !autosaveEnabled || !practiceReady || !workspace.dirty) return null;
    const id = workspace.id;
    const saved = workspace.lastSaved.chartId === id ? workspace.lastSaved : undefined;
    if (workspace.snapshot.finalizedAt || (workspace.openedExisting && !saved?.at)) return null;
    const client = supabase;
    const { data } = await client.auth.getSession();
    const userId = data.session?.user.id;
    const stillOwned = () => !!userId && ownsChartStorage(userId) && practiceReadyRef.current && practiceIdRef.current === practiceId;
    if (!stillOwned()) return null;
    let snapshot = workspace.snapshot;
    let patient = snapshot.patientInfo;
    if (!patient.patientName.trim()) return null;
    if (saved?.at) {
      const basePatient = saved.snapshot?.patientInfo;
      if (!basePatient || changesPatientIdentity(
        { patient_name: basePatient.patientName, patient_number: basePatient.patientNumber },
        { patient_name: patient.patientName, patient_number: patient.patientNumber },
        patient.generatedPatientNumber,
      )) return null;
    } else {
      if (patient.patientId && !patient.patientNumber.trim() && !patient.generatedPatientNumber) {
        const number = await reservePatientNumber(patient.patientId, practiceId);
        patient = { ...patient, patientNumber: number, generatedPatientNumber: number };
        snapshot = { ...snapshot, patientInfo: patient };
      }
      if (workspace.duplicateAnswered !== id && workspace.skipDuplicate !== id) {
        const visits = await listPatientVisitsRef.current(patient.patientNumber, patient.patientName, patient.patientId);
        if (visits.some(visit => isSameVisit(visit, snapshot, id))) return null;
      }
    }
    if (!stillOwned()) return null;
    const table = client.from('charts');
    const { data: row, error } = await (saved?.at
      ? table.update(chartRow(snapshot, id)).eq('id', id).eq('updated_at', saved.at)
      : table.upsert(chartRow(snapshot, id, practiceId || null), { onConflict: 'id', ignoreDuplicates: true })
    ).select('updated_at').maybeSingle();
    if (error) return null;
    const savedAt = row?.updated_at || (!saved?.at ? await recoverInsertVersion(client, id, snapshot) : '');
    if (!savedAt || !stillOwned()) return null;
    return {
      ...workspace, snapshot, dirty: false, saveError: '', savedHash: hashStr(JSON.stringify(snapshot)),
      lastSaved: { chartId: id, at: savedAt, snapshot },
    };
  }, [on, online, autosaveEnabled, practiceReady, practiceId]);

  const applyRef = React.useRef(chart.applySnapshot);
  applyRef.current = chart.applySnapshot;

  const chartReads = React.useRef(0);
  const refreshOpenChart = React.useCallback(async () => {
    const start = latest.current;
    const saved = lastSavedRef.current;
    const canRefresh = () => latest.current.on && !dirtyRef.current && !workspacePaused.current &&
      pendingSaves.current.size === 0 && !hasPendingImageUpload(start.chartId);
    if (!supabase || !canRefresh() || saved.chartId !== start.chartId || !saved.at) return;
    const request = ++chartReads.current;
    const { data, error } = await supabase.from('charts').select('id, data, updated_at')
      .eq('id', start.chartId).gt('updated_at', saved.at).maybeSingle();
    if (error || !data) return;
    const current = latest.current;
    if (!canRefresh() || request !== chartReads.current || current.chartId !== start.chartId ||
        current.session !== start.session || current.serialized !== start.serialized ||
        lastSavedRef.current !== saved) return;
    applyRef.current(data.data as ChartSnapshot, data.id, { preserveSession: true });
    armBaseline();
    setLastSaved({ chartId: data.id, at: data.updated_at, snapshot: data.data as ChartSnapshot });
    setStatus('idle');
    setSaveError('');
    // armBaseline only closes over refs and a state setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openChart = React.useCallback(async (id: string, opts: { ifClean?: boolean; action?: DiscardAction; force?: boolean; skipConfirm?: boolean } = {}): Promise<boolean> => {
    if (!supabase) return false;
    // Deep links on page load never prompt: a working chart with edits
    // simply stays put (the user just reloaded their own work).
    if (opts.skipConfirm) {
      // The caller already asked (e.g. the same-day duplicate question).
    } else if (opts.ifClean) {
      if (dirtyRef.current) return false;
    } else if (!(await confirmDiscardIfDirty(opts.action ?? 'openOther'))) return false;
    if (id === latest.current.chartId && !dirtyRef.current && !opts.force) {
      await refreshOpenChart();
      return true;
    }
    ++chartReads.current;
    const { data, error } = await supabase
      .from('charts')
      .select('id, data, updated_at')
      .eq('id', id)
      .single();
    if (error) throw new Error(error.message);
    armBaseline(); // applied content is the saved baseline
    applyRef.current(data.data as ChartSnapshot, data.id);
    setLastSaved({ chartId: data.id, at: data.updated_at ?? '', snapshot: data.data as ChartSnapshot });
    setStatus('idle');
    setSaveError('');
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshOpenChart]);

  openChartRef.current = openChart;

  const restoreRevision = React.useCallback(async (id: string, snapshot: ChartSnapshot): Promise<boolean> => {
    if (!supabase) return false;
    // Unsaved edits here would be replaced — ask, as opening a chart does.
    if (!(await confirmDiscardIfDirty('restore'))) return false;
    // An explicit restore can replace a chart that received dropdown metadata
    // on another device after our last read.
    const restored = { ...snapshot, version: Math.max(snapshot.version ?? 1, NOTE_DROPDOWN_SNAPSHOT_VERSION) };
    await upsertChart(JSON.stringify(restored), id, { restore: true });
    const { data, error } = await supabase.from('charts').select('id, data, updated_at').eq('id', id).single();
    if (error) throw new Error(error.message);
    armBaseline();
    applyRef.current(data.data as ChartSnapshot, data.id);
    setLastSaved({ chartId: data.id, at: data.updated_at ?? '', snapshot: data.data as ChartSnapshot });
    setStatus('saved');
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upsertChart]);

  const fetchChart = React.useCallback(async (id: string, practiceId?: string): Promise<ChartSnapshot> => {
    if (!supabase) throw new LocalizedError(i18n.t('sync.cloudNotConfigured', { ns: 'app' }));
    let query = supabase.from('charts').select('data').eq('id', id);
    if (practiceId) query = query.eq('practice_id', practiceId);
    const { data, error } = await query.single();
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
      const readAt = data.updated_at;
      const wasKnown = known.chartId === id && !!readAt && readAt === known.at;
      const { data: updated, error: updateError } = await supabase
        .from('charts')
        .update({ recall_date: '', data: snap })
        .eq('id', id).eq('updated_at', readAt)
        .select('updated_at')
        .maybeSingle();
      if (updateError) throw new Error(updateError.message);
      // Our own change to the chart that's open: its new server time is the
      // one we know, or the next save calls it "changed by someone else".
      const at = (updated as { updated_at?: string } | null)?.updated_at;
      if (!at) throw saveFailure('sync.notSavedConflict', 'The chart changed before clearing the reminder.');
      if (wasKnown) setLastSaved({ chartId: id, at, snapshot: snap });
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
    autosaveEnabled,
    captureWorkspace,
    restoreWorkspace,
    syncWorkspace,
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
    setFinalized,
    preclinical: !chart.openedExisting && !clinical,
    skipDuplicateCheckFor,
    listCharts,
    listPatientVisits,
    openChart,
    refreshOpenChart,
    fetchChart,
    restoreRevision,
    deleteChart,
    clearRecalls,
    signOut,
  };
}
