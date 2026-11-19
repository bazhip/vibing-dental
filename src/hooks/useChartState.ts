import { isAppLanguage } from '../i18n/config';
import React from 'react';
import type { ClinicalDictationSource } from '../types';
import { normalizeClinicalDictations, appendClinicalDictationSource } from '../utils/clinicalDictationSources';
import { createPatientIdentity, patientNumberOf } from '../utils/patientIds';
import { normalizeVisitDocumentation } from '../utils/visitDocumentation';
import { normalizeCustomAnesthesia } from '../utils/customAnesthesia';
import { normalizeCustomExam } from '../utils/customExam';
import { localDateISO } from '../utils/localDate';
import { toast, confirmDialog } from '../components/ui/dialogs';
import i18n from '../i18n';
import { TOOTH_DIAGRAMS } from '../constants/toothShapes';
import {
  PatientInfo,
  Species,
  Logo,
  NerveBlockSite,
  AnestheticDrug,
  EMPTY_NERVE_BLOCKS,
  normalizeNerveBlocks,
  DEFAULT_VCA_DOCTOR,
  ExamFindings,
  ExamFinding,
  EMPTY_EXAM_FINDINGS,
  ToothData,
  ToothMarks,
  DiagramComment,
  DiagramStroke,
  ChartSnapshot,
  ImageRole,
  OwnerReportOverrides,
  StoredRecordNote,
} from '../types';
import { usePersistedState } from './usePersistedState';
import { readJson, writeJson } from '../utils/storage';
import { useDentalData } from './useDentalData';
import { getInitialToothData } from '../constants';
import { LocalizedError } from '../utils/apiErrors';

/**
 * Single source of truth for everything that lives on a chart: patient
 * info, tooth grid, diagrams (pre + post), plus the derived "what
 * actually shows in the post diagram" state and the upload-PDF rehydrate
 * handler. EntryGrid uses this hook so the component itself only deals
 * with layout + capture-for-preview, not state plumbing.
 */
export interface UseChartStateReturn {
  finalizedAt: string | null;
  setFinalizedAt: React.Dispatch<React.SetStateAction<string | null>>;
  // ----- Patient + species + logo --------------------------------------
  patientInfo: PatientInfo;
  setPatientInfo: React.Dispatch<React.SetStateAction<PatientInfo>>;
  species: Species;
  setSpecies: React.Dispatch<React.SetStateAction<Species>>;
  logo: Logo;
  setLogo: React.Dispatch<React.SetStateAction<Logo>>;

  // ----- Tooth grid ----------------------------------------------------
  toothData: ToothData[];
  setToothDataDirectly: (rows: ToothData[] | ((prev: ToothData[]) => ToothData[])) => void;

  // ----- Pre-surgery diagram ------------------------------------------
  preToothMarks: ToothMarks;
  setPreToothMarks: React.Dispatch<React.SetStateAction<ToothMarks>>;
  preDiagramComments: DiagramComment[];
  setPreDiagramComments: React.Dispatch<React.SetStateAction<DiagramComment[]>>;
  preDiagramStrokes: DiagramStroke[];
  setPreDiagramStrokes: React.Dispatch<React.SetStateAction<DiagramStroke[]>>;

  // ----- Post-surgery diagram (with derived overrides) ----------------
  postToothMarks: ToothMarks;
  setPostToothMarksDirect: React.Dispatch<React.SetStateAction<ToothMarks>>;
  /** Effective post marks: pre-missing teeth force-applied to post. */
  effectivePostMarks: ToothMarks;
  /** Triadans pre-missing — locked in the post diagram. */
  lockedPostTriadans: Set<number>;
  /** Wraps setPostToothMarks to strip out pre-missing entries the user
   *  may try to add (those belong to pre, not post). */
  handlePostMarksChange: (newMarks: ToothMarks) => void;
  postDiagramComments: DiagramComment[];
  setPostDiagramComments: React.Dispatch<React.SetStateAction<DiagramComment[]>>;
  postDiagramStrokes: DiagramStroke[];
  setPostDiagramStrokes: React.Dispatch<React.SetStateAction<DiagramStroke[]>>;

  // ----- Field-level dispatchers --------------------------------------
  handlePatientInfoChange: (field: keyof PatientInfo, value: string) => void;
  handleNerveBlockChange: (key: NerveBlockSite, value: string) => void;
  /** Replace the anesthetic list (functional updates see the latest list). */
  setNerveBlockDrugs: (update: (prev: AnestheticDrug[]) => AnestheticDrug[]) => void;
  handleExamStatusChange: (key: keyof ExamFindings, value: ExamFinding) => void;
  handleExamCommentChange: (key: keyof ExamFindings, value: string) => void;
  handleSpeciesChange: (newSpecies: Species) => void;

  // ----- Whole-chart actions ------------------------------------------
  /** Read a previously-downloaded chart PDF and overwrite local state. */
  /** Restore a chart from a ToothOps PDF. False when it couldn't (already
   *  toasted): nothing changed. */
  loadFromPdf: (file: File) => Promise<boolean>;
  /** Wipe all chart-related localStorage and reload — preserves auth +
   *  board selection (different key prefix). New patient. */
  resetChart: () => void;
  /** Start a fresh dated visit for a patient: keeps identity, blanks all
   *  clinical data EXCEPT that teeth which were missing or extracted last
   *  time carry over as "missing" (they're already gone), and mints a new
   *  cloud row. With no args, derives from the currently-open chart; the
   *  library passes an explicit prior snapshot's identity + gone teeth. */
  startNewVisit: (opts?: {
    identity?: { patientId?: string; generatedPatientNumber?: string; patientName: string; patientNumber: string; ownerName: string; ownerPhone: string; ownerEmail: string; species: Species };
    goneTeeth?: number[];
  }) => string; // the new visit's cloud id

  // ----- Cloud sync ------------------------------------------------------
  /** Stable id for the active chart's cloud row. New chart → new id. */
  cloudChartId: string;
  /** Mint (and adopt) a fresh cloud id — used when a save is refused
   *  because the current row belongs to another account. */
  resetCloudChartId: () => string;
  /** Changes whenever a different chart is opened (see openChartId). */
  chartSession: number;
  /** Everything needed to restore this chart (same shape the PDF embeds). */
  getSnapshot: () => ChartSnapshot;
  /** Overwrite local state with a snapshot (e.g. a chart opened from the
   *  cloud) and adopt its cloud id. */
  applySnapshot: (snapshot: ChartSnapshot, id: string) => void;

  /** True when the working chart was opened from a saved chart.
   *  Read-only status is controlled separately by finalizedAt. */
  openedExisting: boolean;
  setOpenedExisting: React.Dispatch<React.SetStateAction<boolean>>;

  /** Owner-report before/after tags for attached images. */
  imageRoles: Record<string, ImageRole>;
  /** Tag (or untag, with null) an image for the owner report. */
  setImageRole: (attachmentId: string, role: ImageRole | null) => void;
  ownerReportImageInclusion: Record<string, boolean>;
  setImageInOwnerReport: (attachmentId: string, include: boolean | null) => void;

  /** Attachment ids left out of the chart PDF (everything else is in). */
  pdfExcludedImages: string[];
  /** Include or leave out one image from the chart PDF. */
  setImageInPdf: (attachmentId: string, include: boolean) => void;

  /** Teeth flagged "plan to extract" (By-tooth charting checklist). */
  plannedExtractions: number[];
  /** Flag or unflag one tooth as a planned extraction. */
  setPlannedExtraction: (triadan: number, planned: boolean) => void;

  /** Hand-edited owner-report text blocks (absent = auto-generated). */
  ownerReport: OwnerReportOverrides;
  /** Set an owner-report block; null restores the generated text. */
  setOwnerReportOverride: (field: keyof OwnerReportOverrides, value: string | null) => void;

  /** Raw dictation provenance, stored separately from generated reports. */
  clinicalDictations: ClinicalDictationSource[];
  appendClinicalDictation: (source: ClinicalDictationSource) => void;
  /** Hand-edited record note (null = generated from the chart). */
  recordNote: StoredRecordNote | null;
  setRecordNote: (note: StoredRecordNote | null) => void;
}

const STORAGE_PREFIX = 'vibing-dental.chart.';
const CLOUD_ID_STORAGE_KEY = `${STORAGE_PREFIX}cloudId.v1`;
/** In-tab event: this tab just rewrote the whole working chart in storage
 *  (other hooks that persist chart keys write theirs too). */
export const CHART_STORAGE_REWRITE_EVENT = 'vibing-dental:chart-storage-rewrite';

/** Written into every snapshot so future schema changes have a version
 *  to migrate from. Snapshots without the field predate it (= 1). */
export const CHART_SNAPSHOT_VERSION = 1;

/** Remove every persisted chart key — used by New Chart and by sign-out
 *  (so the next account on a shared clinic machine never sees the
 *  previous account's patient data). */
export function clearChartStorage(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore — callers reload or unmount, which resets in-memory state
  }
}

/** Minimal shape check before a snapshot (from a cloud row or an
 *  uploaded PDF — both outside our control) is committed to persisted
 *  state. Without this, a malformed snapshot crashes on first render
 *  AND survives the reload, because it was persisted before it threw. */
export function isChartSnapshot(s: unknown): s is ChartSnapshot {
  if (!s || typeof s !== 'object') return false;
  const c = s as Partial<ChartSnapshot>;
  return (
    !!c.patientInfo &&
    typeof c.patientInfo === 'object' &&
    typeof c.patientInfo.patientName === 'string' &&
    Array.isArray(c.toothData) &&
    typeof c.species === 'string'
  );
}

/** Fill any holes a snapshot from an older schema might have, so
 *  downstream code can dereference nested fields without guards. */
function normalizeRadiologyInfo(info: PatientInfo): PatientInfo {
  const result = { ...info };
  const limits = { radiologyHistory: 20000, radiologyTechnique: 20000, radiologyQuestion: 20000,
    radiologyReport: 60000, radiologyReportBasis: 1000000, radiologyReviewedBasis: 1000000, radiologyReportGeneratedAt: 100,
    ctReport: 60000, ctReportBasis: 1000000, ctReviewedBasis: 1000000, ctReportGeneratedAt: 100 } as const;
  for (const [field, limit] of Object.entries(limits)) {
    const key = field as keyof typeof limits;
    const value: unknown = result[key];
    if (value !== undefined && (typeof value !== 'string' || value.length > limit)) delete result[key];
  }
  if (!isAppLanguage(result.radiologyReportLanguage ?? '')) delete result.radiologyReportLanguage;
  if (!result.radiologyReport?.trim() || !result.radiologyReportLanguage) {
    delete result.radiologyReportBasis; delete result.radiologyReviewedBasis; delete result.radiologyReportGeneratedAt;
  }
  if (!isAppLanguage(result.ctReportLanguage ?? '')) delete result.ctReportLanguage;
  if (!result.ctReport?.trim() || !result.ctReportLanguage) {
    delete result.ctReportBasis; delete result.ctReviewedBasis; delete result.ctReportGeneratedAt;
  }
  return result;
}

export function normalizeSnapshot(s: ChartSnapshot): ChartSnapshot {
  const { clinicalDictations: rawDictations, ...chart } = s;
  const clinicalDictations = normalizeClinicalDictations(rawDictations);
  const patient = normalizeVisitDocumentation(normalizeRadiologyInfo(s.patientInfo));
  return {
    ...chart,
    ...(clinicalDictations.length ? { clinicalDictations } : {}),
    patientInfo: {
      ...patient,
      complaint: s.patientInfo.complaint ?? '',
      treatmentReport: s.patientInfo.treatmentReport ?? '',
      radiographicFindings: patient.radiographicFindings ?? patient.radiologyReport ?? '',
      ctReport: patient.ctReport ?? '',
      ...(s.patientInfo.customAnesthesia ? { customAnesthesia: normalizeCustomAnesthesia(s.patientInfo.customAnesthesia) } : {}),
      ...(s.patientInfo.customExam ? { customExam: normalizeCustomExam(s.patientInfo.customExam) } : {}),
      recallDate: s.patientInfo.recallDate ?? '',
      ownerName: s.patientInfo.ownerName ?? '',
      ownerPhone: s.patientInfo.ownerPhone ?? '',
      ownerEmail: s.patientInfo.ownerEmail ?? '',
      nerveBlocks: normalizeNerveBlocks(s.patientInfo.nerveBlocks),
      ...(s.patientInfo.secondNerveBlocks ? { secondNerveBlocks: normalizeNerveBlocks(s.patientInfo.secondNerveBlocks) } : {}),
      exam: { ...EMPTY_EXAM_FINDINGS, ...(s.patientInfo.exam ?? {}) },
    },
    preMarks: s.preMarks ?? {},
    preComments: s.preComments ?? [],
    preStrokes: s.preStrokes ?? [],
    postMarks: s.postMarks ?? {},
    postComments: s.postComments ?? [],
    postStrokes: s.postStrokes ?? [],
  };
}

/** uuid for the chart's cloud row; crypto.randomUUID with a fallback for
 *  older WebViews. */
function generateChartId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
  }
}

/**
 * Reload onto the fresh chart's Patient page. The address has to change
 * first: reloading as-is keeps whatever was showing — "+ New patient" is
 * pressed from My charts (#/library), so the reload landed back there.
 * (A bare address won't do either: a blank chart there opens My charts.)
 */
export function reloadIntoNewChart(reload: () => void = () => window.location.reload()): void {
  window.history.replaceState(window.history.state, '', '#/chart/patient');
  reload();
}

export function useChartState(): UseChartStateReturn {
  const [finalizedAt, setFinalizedAt] = usePersistedState<string | null>('chart.finalizedAt', 1, null);
  const [patientInfo, setPatientInfo] = usePersistedState<PatientInfo>(
    'chart.patientInfo', 1,
    () => ({
      patientName: '',
      ...createPatientIdentity(),
      ownerName: '',
      ownerPhone: '',
      ownerEmail: '',
      doctor: DEFAULT_VCA_DOCTOR,
      tech: '',
      date: localDateISO(),
      complaint: '',
      treatmentReport: '',
      recallDate: '',
      nerveBlocks: { ...EMPTY_NERVE_BLOCKS },
      exam: { ...EMPTY_EXAM_FINDINGS },
    }),
    // Pre-multi-drug builds stored a single `drug` string.
    (stored) => ({
      ...normalizeVisitDocumentation(stored),
      nerveBlocks: normalizeNerveBlocks(stored.nerveBlocks),
      ...(stored.secondNerveBlocks ? { secondNerveBlocks: normalizeNerveBlocks(stored.secondNerveBlocks) } : {}),
    })
  );

  const [species, setSpecies] = usePersistedState<Species>('chart.species', 1, 'canine');
  const [logo, setLogo]       = usePersistedState<Logo>('chart.logo', 1, 'socal');

  // Tooth grid lives inside `useDentalData` (it owns the update helpers),
  // so persistence is a small mount-time restore + write-on-change effect.
  const { toothData, setToothDataDirectly, switchSpecies } = useDentalData(species);
  const pristineToothData = React.useRef(toothData);
  React.useEffect(() => {
    const stored = readJson<ToothData[] | null>('chart.toothData', 1, null);
    if (stored) setToothDataDirectly(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  React.useEffect(() => {
    // Never persist the pristine default: at mount this effect fires
    // before the restore effect's state update lands, so it would stomp
    // the saved chart with an empty grid — and under StrictMode's
    // double-mount the second restore then read back that stomped
    // default, silently wiping charted data on refresh.
    if (toothData === pristineToothData.current) return;
    writeJson('chart.toothData', 1, toothData);
  }, [toothData]);

  // Diagram state.
  const [preToothMarks,       setPreToothMarks]       = usePersistedState<ToothMarks>('chart.preMarks', 1, {});
  const [preDiagramComments,  setPreDiagramComments]  = usePersistedState<DiagramComment[]>('chart.preComments', 1, []);
  const [preDiagramStrokes,   setPreDiagramStrokes]   = usePersistedState<DiagramStroke[]>('chart.preStrokes', 1, []);
  const [postToothMarks,      setPostToothMarksDirect] = usePersistedState<ToothMarks>('chart.postMarks', 1, {});
  const [postDiagramComments, setPostDiagramComments] = usePersistedState<DiagramComment[]>('chart.postComments', 1, []);
  const [postDiagramStrokes,  setPostDiagramStrokes]  = usePersistedState<DiagramStroke[]>('chart.postStrokes', 1, []);

  // Pre-missing teeth force-applied to post. The user can't grow a tooth
  // back during the same visit, so any tooth marked missing pre-surgery
  // is locked as missing post-surgery.
  const lockedPostTriadans = React.useMemo(() => {
    const set = new Set<number>();
    for (const [k, mark] of Object.entries(preToothMarks)) {
      if (mark === 'missing') set.add(Number(k));
    }
    return set;
  }, [preToothMarks]);

  const effectivePostMarks = React.useMemo(() => {
    const merged: ToothMarks = { ...postToothMarks };
    for (const [k, mark] of Object.entries(preToothMarks)) {
      if (mark === 'missing') merged[Number(k)] = 'missing';
    }
    return merged;
  }, [preToothMarks, postToothMarks]);

  const handlePostMarksChange = (newMarks: ToothMarks) => {
    // Strip pre-missing entries — those belong to pre, not post.
    const cleaned: ToothMarks = {};
    for (const [k, mark] of Object.entries(newMarks)) {
      const t = Number(k);
      if (preToothMarks[t] === 'missing') continue;
      cleaned[t] = mark;
    }
    setPostToothMarksDirect(cleaned);
  };

  // Field-level dispatchers — keep the EntryGrid JSX clean.
  const handlePatientInfoChange = (field: keyof PatientInfo, value: string) =>
    setPatientInfo((prev) => ({ ...prev, [field]: value }));

  const handleNerveBlockChange = (key: NerveBlockSite, value: string) =>
    setPatientInfo((prev) => ({
      ...prev,
      nerveBlocks: { ...prev.nerveBlocks, [key]: value },
    }));

  const setNerveBlockDrugs = (update: (prev: AnestheticDrug[]) => AnestheticDrug[]) =>
    setPatientInfo((prev) => ({
      ...prev,
      nerveBlocks: { ...prev.nerveBlocks, drugs: update(prev.nerveBlocks.drugs ?? []) },
    }));

  const handleExamStatusChange = (key: keyof ExamFindings, value: ExamFinding) =>
    setPatientInfo((prev) => ({
      ...prev,
      exam: { ...prev.exam, [key]: { ...prev.exam[key], status: value } },
    }));

  const handleExamCommentChange = (key: keyof ExamFindings, value: string) =>
    setPatientInfo((prev) => ({
      ...prev,
      exam: { ...prev.exam, [key]: { ...prev.exam[key], comment: value } },
    }));

  const handleSpeciesChange = (newSpecies: Species) => {
    if (newSpecies === species) return;
    // Switching species resets the tooth grid (cat and dog have different
    // tooth numbering), so confirm first if the grid has any entered data
    // — otherwise a stray toggle silently wipes the chart.
    const TOOTH_FIELDS: (keyof ToothData)[] = [
      'mobility', 'recession', 'pocket', 'furcation',
      'hyperplasia', 'calculus', 'gingivitis', 'pdstate',
    ];
    const hasGridData = toothData.some((t) =>
      TOOTH_FIELDS.some((f) => ((t[f] as string | undefined) ?? '') !== '')
    );
    // Diagram marks, notes and drawings are tied to tooth numbers and
    // positions that don't exist on another species' chart either.
    const hasDiagramData =
      Object.keys(preToothMarks).length > 0 || Object.keys(postToothMarks).length > 0 ||
      plannedExtractions.length > 0 ||
      preDiagramComments.length > 0 || postDiagramComments.length > 0 ||
      preDiagramStrokes.length > 0 || postDiagramStrokes.length > 0;
    const apply = () => {
      setSpecies(newSpecies);
      switchSpecies(newSpecies);
      if (hasDiagramData) {
        setPreToothMarks({}); setPostToothMarksDirect({});
        setPreDiagramComments([]); setPostDiagramComments([]);
        setPreDiagramStrokes([]); setPostDiagramStrokes([]);
        setPlannedExtractions([]);
      }
    };
    if (!hasGridData && !hasDiagramData) { apply(); return; }
    void confirmDialog({
      title: i18n.t('speciesChange.title', { ns: 'app' }),
      message: i18n.t(
        hasGridData && hasDiagramData ? 'speciesChange.messageBoth' : hasGridData ? 'speciesChange.messageGrid' : 'speciesChange.messageDiagram',
        { ns: 'app' },
      ),
      confirmLabel: i18n.t('speciesChange.confirm', { ns: 'app' }),
      danger: true,
    }).then((ok) => { if (ok) apply(); });
  };

  // ----- Cloud sync -------------------------------------------------------

  // With no stored id, the chart on screen started on an empty store (first
  // use, "+ New patient", sign-in), so any save recorded since then was
  // this chart's: keep that id. Otherwise mint one.
  const [cloudChartId, setCloudChartId] = usePersistedState<string>(
    'chart.cloudId', 1,
    () => readJson<{ chartId?: string }>('chart.lastSaved', 1, {}).chartId || generateChartId()
  );
  // Persist the id at once. usePersistedState doesn't write its initial
  // value, so a new chart's id lived only in memory while its content was
  // stored: every page load (Google sign-in redirect, a phone reloading a
  // background tab) minted another id, and the next save copied the chart
  // into a duplicate record instead of updating it.
  React.useEffect(() => {
    writeJson('chart.cloudId', 1, cloudChartId);
    // Mount only; later changes are written by usePersistedState.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Bumps when a DIFFERENT chart is put on screen (new visit, opened
  // from the library, loaded from a PDF) — not when the sync re-ids the
  // same chart after a refused save. Per-chart UI state (the AI
  // dictation) keys off this rather than the id.
  const [chartSession, setChartSession] = React.useState(0);
  const openChartId = (id: string) => {
    setCloudChartId(id);
    setChartSession((n) => n + 1);
  };

  const [imageRoles, setImageRoles] = usePersistedState<Record<string, ImageRole>>('chart.imageRoles', 1, {});
  const [ownerReportImageInclusion, setOwnerReportImageInclusion] = usePersistedState<Record<string, boolean>>(
    'chart.ownerReportImageInclusion', 1, {}
  );
  const setImageRole = (attachmentId: string, role: ImageRole | null) => {
    // A label edit never changes inclusion, even on a chart saved before
    // the independent checkbox existed.
    setOwnerReportImageInclusion(previous => Object.hasOwn(previous, attachmentId)
      ? previous
      : { ...previous, [attachmentId]: Boolean(imageRoles[attachmentId]) });
    setImageRoles(previous => {
      const next = { ...previous };
      if (role === null) delete next[attachmentId];
      else next[attachmentId] = role;
      return next;
    });
  };
  const setImageInOwnerReport = (attachmentId: string, include: boolean | null) => {
    setOwnerReportImageInclusion(previous => {
      const next = { ...previous };
      if (include === null) delete next[attachmentId];
      else next[attachmentId] = include;
      return next;
    });
  };

  // Images the user unticked for the chart PDF. Exclusions (not
  // inclusions) so a new upload lands in the PDF without extra clicks.
  const [pdfExcludedImages, setPdfExcludedImages] = usePersistedState<string[]>(
    'chart.pdfExcludedImages', 1, []
  );
  const setImageInPdf = React.useCallback((attachmentId: string, include: boolean) => {
    setPdfExcludedImages((prev) => {
      const rest = prev.filter((id) => id !== attachmentId);
      return include ? rest : [...rest, attachmentId];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Teeth flagged "plan to extract" from the By-tooth charting view.
  // Part of the chart (saves, restores, clears with it), but not drawn
  // on the PDF — the Procedure marks are the record of what was done.
  const [plannedExtractions, setPlannedExtractions] = usePersistedState<number[]>(
    'chart.plannedExtractions', 1, []
  );
  const setPlannedExtraction = React.useCallback((triadan: number, planned: boolean) => {
    setPlannedExtractions((prev) => {
      const rest = prev.filter((t) => t !== triadan);
      return planned ? [...rest, triadan].sort((a, b) => a - b) : rest;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hand-edited owner-report blocks. A field exists only when customized
  // — the report generator falls back to generated text otherwise.
  const [ownerReport, setOwnerReport] = usePersistedState<OwnerReportOverrides>('chart.ownerReport', 1, {});
  const [clinicalDictations, persistClinicalDictations] = usePersistedState<ClinicalDictationSource[]>('chart.clinicalDictations', 1, [], normalizeClinicalDictations);
  const clinicalDictationsRef = React.useRef(clinicalDictations);
  clinicalDictationsRef.current = clinicalDictations;
  const setClinicalDictations = (sources: ClinicalDictationSource[]) => {
    clinicalDictationsRef.current = sources;
    persistClinicalDictations(sources);
  };
  const appendClinicalDictation = (source: ClinicalDictationSource) => {
    const next = appendClinicalDictationSource(clinicalDictationsRef.current, source);
    setClinicalDictations(next);
  };
  const [recordNote, setRecordNote] = usePersistedState<StoredRecordNote | null>('chart.recordNote', 1, null);
  const setOwnerReportOverride = React.useCallback(
    (field: keyof OwnerReportOverrides, value: string | null) => {
      setOwnerReport((prev) => {
        const next = { ...prev };
        if (value === null) delete next[field];
        else next[field] = value;
        return next;
      });
      // setOwnerReport identity is stable (usePersistedState).
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    []
  );

  // Distinguishes an existing cloud record from its first save. Finalized
  // status controls editing; this flag preserves save/conflict bookkeeping.
  const [openedExisting, setOpenedExisting] = usePersistedState<boolean>(
    'chart.openedExisting', 1, false
  );

  /** Blank patient info for a fresh chart (optionally keeping identity). */
  const blankPatientInfo = (keep?: Partial<PatientInfo>): PatientInfo => ({
    patientName: '',
    ...createPatientIdentity(),
    ownerName: '',
    ownerPhone: '',
    ownerEmail: '',
    doctor: DEFAULT_VCA_DOCTOR,
    tech: '',
    date: localDateISO(),
    complaint: '',
    treatmentReport: '',
    recallDate: '',
    nerveBlocks: { ...EMPTY_NERVE_BLOCKS },
    exam: { ...EMPTY_EXAM_FINDINGS },
    ...keep,
  });

  const startNewVisit = (opts?: {
    identity?: { patientId?: string; generatedPatientNumber?: string; patientName: string; patientNumber: string; ownerName: string; ownerPhone: string; ownerEmail: string; species: Species };
    goneTeeth?: number[];
  }) => {
    const identity = opts?.identity;
    // Teeth that are already gone at the start of this visit: anything
    // missing OR extracted last time. Derive from the current chart when
    // not supplied (menu "New visit" on the open patient).
    const gone =
      opts?.goneTeeth ??
      (() => {
        const set = new Set<number>();
        for (const [k, v] of Object.entries(preToothMarks)) if (v === 'missing') set.add(Number(k));
        for (const [k, v] of Object.entries(postToothMarks)) if (v === 'extracted') set.add(Number(k));
        return Array.from(set);
      })();

    const keep = {
      patientName: identity ? identity.patientName : patientInfo.patientName,
      patientNumber: identity ? identity.patientNumber : patientNumberOf(patientInfo),
      patientId: identity ? identity.patientId : patientInfo.patientId,
      generatedPatientNumber: identity ? identity.generatedPatientNumber : patientInfo.generatedPatientNumber,
      ownerName: identity ? identity.ownerName : patientInfo.ownerName,
      ownerPhone: identity ? identity.ownerPhone : patientInfo.ownerPhone,
      ownerEmail: identity ? identity.ownerEmail : patientInfo.ownerEmail,
    };
    const sp = identity ? identity.species : species;
    const newId = generateChartId();
    openChartId(newId);
    setOpenedExisting(false); // a new visit is a fresh chart → autosaves
    setFinalizedAt(null);
    setImageRoles({}); // image tags belong to the prior visit's images
    setOwnerReportImageInclusion({});
    setPdfExcludedImages([]);
    setOwnerReport({}); // report edits are visit-specific
    setRecordNote(null);
    setClinicalDictations([]);
    setPlannedExtractions([]);
    setPatientInfo(blankPatientInfo(keep.patientName.trim() || keep.patientNumber.trim() || keep.patientId ? keep : undefined));
    if (identity) {
      setSpecies(sp);
      switchSpecies(sp);
    }
    setToothDataDirectly(getInitialToothData(sp));
    // Gone teeth start the new visit already marked missing; nothing else
    // carries over (no comments, strokes, or measurements).
    const missing: ToothMarks = {};
    for (const t of gone) missing[t] = 'missing';
    setPreToothMarks(missing);
    setPreDiagramComments([]);
    setPreDiagramStrokes([]);
    setPostToothMarksDirect({});
    setPostDiagramComments([]);
    setPostDiagramStrokes([]);
    return newId;
  };

  const resetCloudChartId = (): string => {
    const id = generateChartId();
    setCloudChartId(id);
    return id;
  };

  // Memoized so consumers (useCloudSync's dirty tracking) can hang
  // referential-equality caches off it — without this, every render
  // built a fresh object and the full chart re-serialized per keystroke.
  const snapshot = React.useMemo<ChartSnapshot>(() => ({
    version: CHART_SNAPSHOT_VERSION,
    imageRoles,
    ...(Object.keys(ownerReportImageInclusion).length ? { ownerReportImageInclusion } : {}),
    pdfExcludedImages,
    ownerReport,
    // Omitted when empty so charts that never use the plan keep the exact
    // serialized shape (and saved hash) they had before the field existed.
    ...(plannedExtractions.length ? { plannedExtractions } : {}),
    // Same: absent unless the note was edited, so existing hashes hold.
    ...(recordNote ? { recordNote } : {}),
    ...(clinicalDictations.length ? { clinicalDictations } : {}),
    patientInfo: patientInfo.generatedPatientNumber && !patientInfo.patientNumber.trim() ? { ...patientInfo, patientNumber: patientNumberOf(patientInfo) } : patientInfo,
    toothData,
    species,
    logo,
    preMarks: preToothMarks,
    preComments: preDiagramComments,
    preStrokes: preDiagramStrokes,
    postMarks: postToothMarks,
    postComments: postDiagramComments,
    postStrokes: postDiagramStrokes,
    ...(finalizedAt ? { finalizedAt } : {}),
  }), [
    clinicalDictations, finalizedAt, imageRoles, ownerReportImageInclusion, pdfExcludedImages, ownerReport, recordNote, plannedExtractions, patientInfo, toothData, species, logo,
    preToothMarks, preDiagramComments, preDiagramStrokes,
    postToothMarks, postDiagramComments, postDiagramStrokes,
  ]);
  const getSnapshot = (): ChartSnapshot => snapshot;

  // Two tabs share one working copy in localStorage, one key per field.
  // When another tab puts a different chart there, this tab's next edit
  // rewrites every key from its own chart, so storage holds one whole
  // chart (last writer wins) instead of one tab's id and patient with the
  // other tab's findings, which a reload then saved into the wrong record.
  const cloudIdRef = React.useRef(cloudChartId);
  cloudIdRef.current = cloudChartId;
  const storageForeignRef = React.useRef(false);
  React.useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      // newValue null = the other tab wiped the working chart (sign-out,
      // another account): never write this patient back for the next user.
      if (e.key === CLOUD_ID_STORAGE_KEY && e.newValue !== null && e.newValue !== JSON.stringify(cloudIdRef.current)) {
        storageForeignRef.current = true;
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  React.useEffect(() => {
    if (!storageForeignRef.current) return;
    storageForeignRef.current = false;
    writeJson('chart.cloudId', 1, cloudChartId);
    writeJson('chart.openedExisting', 1, openedExisting);
    writeJson('chart.finalizedAt', 1, finalizedAt);
    writeJson('chart.patientInfo', 1, patientInfo);
    writeJson('chart.species', 1, species);
    writeJson('chart.logo', 1, logo);
    writeJson('chart.toothData', 1, toothData);
    writeJson('chart.preMarks', 1, preToothMarks);
    writeJson('chart.preComments', 1, preDiagramComments);
    writeJson('chart.preStrokes', 1, preDiagramStrokes);
    writeJson('chart.postMarks', 1, postToothMarks);
    writeJson('chart.postComments', 1, postDiagramComments);
    writeJson('chart.postStrokes', 1, postDiagramStrokes);
    writeJson('chart.imageRoles', 1, imageRoles);
    writeJson('chart.ownerReportImageInclusion', 1, ownerReportImageInclusion);
    writeJson('chart.pdfExcludedImages', 1, pdfExcludedImages);
    writeJson('chart.plannedExtractions', 1, plannedExtractions);
    writeJson('chart.ownerReport', 1, ownerReport);
    writeJson('chart.recordNote', 1, recordNote);
    writeJson('chart.clinicalDictations', 1, clinicalDictations);
    window.dispatchEvent(new Event(CHART_STORAGE_REWRITE_EVENT));
    // Runs after this tab changes anything; the values are read fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, cloudChartId, openedExisting]);

  const applySnapshot = (raw: ChartSnapshot, id: string): void => {
    if (!isChartSnapshot(raw)) {
      throw new LocalizedError(i18n.t('errors.damagedChart', { ns: 'app' }));
    }
    const snapshot = normalizeSnapshot(raw);
    setOpenedExisting(true);
    setFinalizedAt(snapshot.finalizedAt || null);
    setImageRoles(snapshot.imageRoles ?? {});
    setOwnerReportImageInclusion(snapshot.ownerReportImageInclusion ?? {});
    setPdfExcludedImages(Array.isArray(snapshot.pdfExcludedImages) ? snapshot.pdfExcludedImages : []);
    setOwnerReport(snapshot.ownerReport ?? {});
    setRecordNote(snapshot.recordNote ?? null);
    setClinicalDictations(snapshot.clinicalDictations ?? []);
    setPlannedExtractions(
      Array.isArray(snapshot.plannedExtractions)
        ? snapshot.plannedExtractions.filter((t): t is number => typeof t === 'number')
        : []
    );
    setPatientInfo(snapshot.patientInfo);
    setSpecies(snapshot.species);
    setLogo(snapshot.logo);
    switchSpecies(snapshot.species);
    setToothDataDirectly(snapshot.toothData);
    setPreToothMarks(snapshot.preMarks ?? {});
    setPreDiagramComments(snapshot.preComments ?? []);
    setPreDiagramStrokes(snapshot.preStrokes ?? []);
    setPostToothMarksDirect(snapshot.postMarks ?? {});
    setPostDiagramComments(snapshot.postComments ?? []);
    setPostDiagramStrokes(snapshot.postStrokes ?? []);
    openChartId(id);
  };

  // ----- Whole-chart actions -------------------------------------------

  const loadFromPdf = async (file: File): Promise<boolean> => {
    try {
      // Loaded on demand — the PDF engine (pdf-lib) stays out of the
      // main bundle until someone actually opens a chart PDF.
      const { parseDentalChartPDF } = await import('../utils/pdfGenerator');
      const parsed = await parseDentalChartPDF(file);
      // The stash comes from an arbitrary file — check its shape before
      // any of it reaches persisted state (a bad write here would crash
      // every reload until localStorage is cleared by hand).
      if (
        !parsed.patientInfo ||
        typeof parsed.patientInfo !== 'object' ||
        typeof parsed.patientInfo.patientName !== 'string' ||
        !Array.isArray(parsed.toothData)
      ) {
        // eslint-disable-next-line no-restricted-syntax -- dev-only: caught below; the user sees errors.pdfImport
        throw new Error('Stashed chart state has an unexpected shape');
      }
      if (!(parsed.species in TOOTH_DIAGRAMS)) {
        // eslint-disable-next-line no-restricted-syntax -- dev-only: caught below; the user sees errors.pdfImport
        throw new Error(`Unknown species in PDF: ${String(parsed.species)}`);
      }
      // A restored PDF is a NEW chart: a fresh cloud row (so saving can't
      // overwrite whichever chart was open before) that saves like any
      // new chart — not a "saved chart" it never was.
      openChartId(generateChartId());
      setOpenedExisting(false);
      setFinalizedAt(null);
      // Always start from blank diagrams, so nothing of the previous
      // patient survives a PDF without diagram data.
      setPreToothMarks({}); setPreDiagramComments([]); setPreDiagramStrokes([]);
      setPostToothMarksDirect({}); setPostDiagramComments([]); setPostDiagramStrokes([]);
      setImageRoles({}); // attachments (and their tags) don't travel in the PDF stash
      setOwnerReportImageInclusion({});
      setPdfExcludedImages([]);
      setOwnerReport({}); // report edits don't either
      setRecordNote(null);
      setClinicalDictations([]);
      setPlannedExtractions([]); // nor the extraction plan
      setPatientInfo(normalizeSnapshot({ patientInfo: parsed.patientInfo } as ChartSnapshot).patientInfo);
      setSpecies(parsed.species);
      setLogo(parsed.logo);
      setToothDataDirectly(parsed.toothData);
      if (parsed.preDiagram) {
        setPreToothMarks(parsed.preDiagram.marks);
        setPreDiagramComments(parsed.preDiagram.comments);
        setPreDiagramStrokes(parsed.preDiagram.strokes);
      }
      if (parsed.postDiagram) {
        // Re-strip pre-missing entries from the saved post state, just in
        // case they crept in.
        const cleaned: ToothMarks = {};
        const preMissing = parsed.preDiagram?.marks ?? {};
        for (const [k, mark] of Object.entries(parsed.postDiagram.marks)) {
          if (preMissing[Number(k)] === 'missing') continue;
          cleaned[Number(k)] = mark;
        }
        setPostToothMarksDirect(cleaned);
        setPostDiagramComments(parsed.postDiagram.comments);
        setPostDiagramStrokes(parsed.postDiagram.strokes);
      }
      const name = parsed.patientInfo.patientName.trim();
      toast(name ? i18n.t('toasts.pdfImportedNamed', { ns: 'app', name }) : i18n.t('toasts.pdfImported', { ns: 'app' }), { kind: 'success' });
      return true;
    } catch (error) {
      toast(i18n.t('errors.pdfImport', { ns: 'app' }), { kind: 'error' });
      console.error(error);
      return false;
    }
  };

  const resetChart = () => {
    clearChartStorage();
    reloadIntoNewChart();
  };

  return {
    patientInfo, setPatientInfo,
    species, setSpecies,
    logo, setLogo,

    toothData, setToothDataDirectly,

    preToothMarks, setPreToothMarks,
    preDiagramComments, setPreDiagramComments,
    preDiagramStrokes, setPreDiagramStrokes,

    postToothMarks, setPostToothMarksDirect,
    effectivePostMarks, lockedPostTriadans, handlePostMarksChange,
    postDiagramComments, setPostDiagramComments,
    postDiagramStrokes, setPostDiagramStrokes,

    handlePatientInfoChange,
    handleNerveBlockChange,
    setNerveBlockDrugs,
    handleExamStatusChange,
    handleExamCommentChange,
    handleSpeciesChange,

    loadFromPdf,
    resetChart,
    startNewVisit,

    cloudChartId,
    resetCloudChartId,
    chartSession,
    getSnapshot,
    applySnapshot,

    openedExisting,
    setOpenedExisting,
    finalizedAt, setFinalizedAt,

    imageRoles,
    setImageRole,
    ownerReportImageInclusion,
    setImageInOwnerReport,

    pdfExcludedImages,
    setImageInPdf,

    plannedExtractions,
    setPlannedExtraction,

    ownerReport,
    setOwnerReportOverride,

    clinicalDictations,
    appendClinicalDictation,
    recordNote,
    setRecordNote,
  };
}
