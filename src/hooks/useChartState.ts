import React from 'react';
import {
  PatientInfo,
  Species,
  Logo,
  NerveBlocks,
  EMPTY_NERVE_BLOCKS,
  DEFAULT_VCA_DOCTOR,
  ExamFindings,
  ExamFinding,
  EMPTY_EXAM_FINDINGS,
  ToothData,
  ToothMarks,
  DiagramComment,
  DiagramStroke,
} from '../types';
import { usePersistedState } from './usePersistedState';
import { readJson, writeJson } from '../utils/storage';
import { useDentalData } from './useDentalData';
import { parseDentalChartPDF } from '../utils/pdfGenerator';

/**
 * Single source of truth for everything that lives on a chart: patient
 * info, tooth grid, diagrams (pre + post), plus the derived "what
 * actually shows in the post diagram" state and the upload-PDF rehydrate
 * handler. EntryGrid uses this hook so the component itself only deals
 * with layout + capture-for-preview, not state plumbing.
 */
export interface UseChartStateReturn {
  // ----- Patient + species + logo --------------------------------------
  patientInfo: PatientInfo;
  setPatientInfo: React.Dispatch<React.SetStateAction<PatientInfo>>;
  species: Species;
  setSpecies: React.Dispatch<React.SetStateAction<Species>>;
  logo: Logo;
  setLogo: React.Dispatch<React.SetStateAction<Logo>>;

  // ----- Tooth grid ----------------------------------------------------
  toothData: ToothData[];
  setToothDataDirectly: (rows: ToothData[]) => void;

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
  handleNerveBlockChange: (key: keyof NerveBlocks, value: string) => void;
  handleExamStatusChange: (key: keyof ExamFindings, value: ExamFinding) => void;
  handleExamCommentChange: (key: keyof ExamFindings, value: string) => void;
  handleSpeciesChange: (newSpecies: Species) => void;

  // ----- Whole-chart actions ------------------------------------------
  /** Read a previously-downloaded chart PDF and overwrite local state. */
  loadFromPdf: (file: File) => Promise<void>;
  /** Wipe all chart-related localStorage and reload — preserves auth +
   *  board selection (different key prefix). */
  resetChart: () => void;
}

const STORAGE_PREFIX = 'vibing-dental.chart.';

export function useChartState(): UseChartStateReturn {
  const [patientInfo, setPatientInfo] = usePersistedState<PatientInfo>(
    'chart.patientInfo', 1,
    () => ({
      patientName: '',
      patientNumber: '',
      doctor: DEFAULT_VCA_DOCTOR,
      tech: '',
      date: new Date().toISOString().split('T')[0],
      complaint: '',
      treatmentReport: '',
      nerveBlocks: { ...EMPTY_NERVE_BLOCKS },
      exam: { ...EMPTY_EXAM_FINDINGS },
    })
  );

  const [species, setSpecies] = usePersistedState<Species>('chart.species', 1, 'feline');
  const [logo, setLogo]       = usePersistedState<Logo>('chart.logo', 1, 'socal');

  // Tooth grid lives inside `useDentalData` (it owns the update helpers),
  // so persistence is a small mount-time restore + write-on-change effect.
  const { toothData, setToothDataDirectly, switchSpecies } = useDentalData(species);
  React.useEffect(() => {
    const stored = readJson<ToothData[] | null>('chart.toothData', 1, null);
    if (stored) setToothDataDirectly(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  React.useEffect(() => {
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

  const handleNerveBlockChange = (key: keyof NerveBlocks, value: string) =>
    setPatientInfo((prev) => ({
      ...prev,
      nerveBlocks: { ...prev.nerveBlocks, [key]: value },
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
    setSpecies(newSpecies);
    switchSpecies(newSpecies);
  };

  // ----- Whole-chart actions -------------------------------------------

  const loadFromPdf = async (file: File): Promise<void> => {
    try {
      const parsed = await parseDentalChartPDF(file);
      setPatientInfo(parsed.patientInfo);
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
    } catch (error) {
      alert('Could not read that PDF. Make sure it was generated by this tool.');
      console.error(error);
    }
  };

  const resetChart = () => {
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(STORAGE_PREFIX)) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch {
      // ignore — reload still resets in-memory state
    }
    window.location.reload();
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
    handleExamStatusChange,
    handleExamCommentChange,
    handleSpeciesChange,

    loadFromPdf,
    resetChart,
  };
}
