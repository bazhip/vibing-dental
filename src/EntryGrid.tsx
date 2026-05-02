import React, { useState } from 'react';
import { usePersistedState } from './hooks/usePersistedState';
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
  ToothMarks,
  DiagramComment,
  DiagramStroke,
} from './types';
import {
  PatientForm,
  DentalGrid,
  AnesthesiaForm,
  ExamForm,
  SurgeryReportForm,
  DiagramView,
  CodeReferencePanel,
} from './components';
import { SectionLayout, ChartSection } from './components/Layouts';
import { useBoard } from './components/BoardSwitcher';
import { DiagramViewHandle } from './components/DiagramView';
import { useDentalData } from './hooks/useDentalData';
import { parseDentalChartPDF } from './utils/pdfGenerator';
import { PdfPreviewModal, ChartSnapshot } from './components/PdfPreviewModal';
import './components/EntryGrid.css';

/**
 * Main container component for dental chart entry
 * Manages patient information, dental data, and PDF generation
 */
const EntryGrid: React.FC = () => {
  // Persisted state — restored on refresh from localStorage. A "v1" suffix
  // is included on each key so we can rev the schema later without
  // reading stale shapes.
  const [patientInfo, setPatientInfo] = usePersistedState<PatientInfo>(
    'chart.patientInfo.v1',
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

  const [species, setSpecies] = usePersistedState<Species>('chart.species.v1', 'feline');
  const [logo, setLogo]       = usePersistedState<Logo>('chart.logo.v1', 'socal');

  // Dental data management via custom hook (toothData is persisted via the
  // wrapper effect below).
  const { toothData, setToothDataDirectly, switchSpecies } = useDentalData(species);

  // Persist + restore the tooth grid. We restore once on mount; thereafter
  // every change is written.
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem('chart.toothData.v1');
      if (raw) setToothDataDirectly(JSON.parse(raw));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  React.useEffect(() => {
    try { localStorage.setItem('chart.toothData.v1', JSON.stringify(toothData)); } catch {}
  }, [toothData]);

  // Diagram state — pre/post are independent; pre-missing is force-applied
  // to post via `effectivePostMarks`.
  const [preToothMarks, setPreToothMarks]           = usePersistedState<ToothMarks>('chart.preMarks.v1', {});
  const [preDiagramComments, setPreDiagramComments] = usePersistedState<DiagramComment[]>('chart.preComments.v1', []);
  const [preDiagramStrokes, setPreDiagramStrokes]   = usePersistedState<DiagramStroke[]>('chart.preStrokes.v1', []);

  const [postToothMarks, setPostToothMarks]           = usePersistedState<ToothMarks>('chart.postMarks.v1', {});
  const [postDiagramComments, setPostDiagramComments] = usePersistedState<DiagramComment[]>('chart.postComments.v1', []);
  const [postDiagramStrokes, setPostDiagramStrokes]   = usePersistedState<DiagramStroke[]>('chart.postStrokes.v1', []);

  const preDiagramRef = React.useRef<DiagramViewHandle>(null);
  const postDiagramRef = React.useRef<DiagramViewHandle>(null);

  // Triadans force-locked to "missing" in the post-surgery diagram (because
  // they were already missing pre-surgery).
  const lockedPostTriadans = React.useMemo(() => {
    const set = new Set<number>();
    for (const [k, mark] of Object.entries(preToothMarks)) {
      if (mark === 'missing') set.add(Number(k));
    }
    return set;
  }, [preToothMarks]);

  // Effective post-surgery marks shown in the post diagram = post user marks
  // overlaid with pre-surgery missing teeth.
  const effectivePostMarks = React.useMemo(() => {
    const merged: ToothMarks = { ...postToothMarks };
    for (const [k, mark] of Object.entries(preToothMarks)) {
      if (mark === 'missing') merged[Number(k)] = 'missing';
    }
    return merged;
  }, [preToothMarks, postToothMarks]);

  const handlePostMarksChange = (newMarks: ToothMarks) => {
    // Strip out anything that's only there because pre-surgery is forcing
    // it — those entries belong to pre, not post.
    const cleaned: ToothMarks = {};
    for (const [k, mark] of Object.entries(newMarks)) {
      const t = Number(k);
      if (preToothMarks[t] === 'missing') continue;
      cleaned[t] = mark;
    }
    setPostToothMarks(cleaned);
  };

  /**
   * Updates a specific scalar field in patient information.
   * (NerveBlocks uses its own handler since it's a nested object.)
   */
  const handlePatientInfoChange = (
    field: keyof PatientInfo,
    value: string
  ) => {
    setPatientInfo((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleNerveBlockChange = (key: keyof NerveBlocks, value: string) => {
    setPatientInfo((prev) => ({
      ...prev,
      nerveBlocks: { ...prev.nerveBlocks, [key]: value },
    }));
  };

  const handleExamStatusChange = (key: keyof ExamFindings, value: ExamFinding) => {
    setPatientInfo((prev) => ({
      ...prev,
      exam: {
        ...prev.exam,
        [key]: { ...prev.exam[key], status: value },
      },
    }));
  };

  const handleExamCommentChange = (key: keyof ExamFindings, value: string) => {
    setPatientInfo((prev) => ({
      ...prev,
      exam: {
        ...prev.exam,
        [key]: { ...prev.exam[key], comment: value },
      },
    }));
  };

  /**
   * Handles species selection change
   * Switches the grid to show only relevant teeth
   */
  const handleSpeciesChange = (newSpecies: Species) => {
    setSpecies(newSpecies);
    switchSpecies(newSpecies);
  };

  /**
   * Reads a previously-downloaded chart PDF and rehydrates form state.
   */
  const handleUploadPDF = async (file: File) => {
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
        // Re-strip pre-missing entries from the saved post state, just in case
        // they crept in (export logic should already keep them out).
        const cleaned: ToothMarks = {};
        const preMissing = parsed.preDiagram?.marks ?? {};
        for (const [k, mark] of Object.entries(parsed.postDiagram.marks)) {
          if (preMissing[Number(k)] === 'missing') continue;
          cleaned[Number(k)] = mark;
        }
        setPostToothMarks(cleaned);
        setPostDiagramComments(parsed.postDiagram.comments);
        setPostDiagramStrokes(parsed.postDiagram.strokes);
      }
    } catch (error) {
      alert('Could not read that PDF. Make sure it was generated by this tool.');
      console.error(error);
    }
  };

  /**
   * Captures everything the PDF generator needs (live SVG refs + state) so
   * the preview modal can build the PDF in any style without us having to
   * re-collect the snapshot every time the user picks a different look.
   */
  const [previewSnapshot, setPreviewSnapshot] = React.useState<ChartSnapshot | null>(null);
  const [previewOpen, setPreviewOpen] = React.useState(false);

  const handleOpenPreview = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const preHandle = preDiagramRef.current;
      const postHandle = postDiagramRef.current;
      const preSvg = preHandle?.getSvgElement();
      const postSvg = postHandle?.getSvgElement();
      if (!preHandle || !postHandle || !preSvg || !postSvg) {
        throw new Error('Diagram SVGs not yet mounted');
      }
      setPreviewSnapshot({
        patientInfo,
        toothData,
        species,
        logo,
        preSvg,
        preComments: preHandle.getCommentExports(),
        preState: { marks: preToothMarks, comments: preDiagramComments, strokes: preDiagramStrokes },
        postSvg,
        postComments: postHandle.getCommentExports(),
        postState: { marks: postToothMarks, comments: postDiagramComments, strokes: postDiagramStrokes },
      });
      setPreviewOpen(true);
    } catch (error) {
      alert('Couldn\'t open preview. Please try again.');
      console.error(error);
    }
  };

  const { board } = useBoard();

  const sections: ChartSection[] = [
    {
      id: 'patient',
      label: 'Patient',
      content: (
        <PatientForm
          patientInfo={patientInfo}
          species={species}
          logo={logo}
          onPatientInfoChange={handlePatientInfoChange}
          onSpeciesChange={handleSpeciesChange}
          onLogoChange={setLogo}
          onUploadPDF={handleUploadPDF}
        />
      ),
    },
    {
      id: 'exam',
      label: 'Exam',
      content: (
        <ExamForm
          exam={patientInfo.exam}
          onStatusChange={handleExamStatusChange}
          onCommentChange={handleExamCommentChange}
        />
      ),
    },
    {
      id: 'anesthesia',
      label: 'Anesthesia',
      content: (
        <AnesthesiaForm
          nerveBlocks={patientInfo.nerveBlocks}
          onNerveBlockChange={handleNerveBlockChange}
        />
      ),
    },
    {
      id: 'charting',
      label: 'Charting',
      content: (
        <DentalGrid
          toothData={toothData}
          onToothDataChange={setToothDataDirectly}
        />
      ),
    },
    {
      id: 'diagnosis',
      label: 'Diagnosis',
      content: (
        <div className="diagram-with-codes">
          <div className="diagram-with-codes__diagram">
            <DiagramView
              ref={preDiagramRef}
              title="Diagnosis Diagram"
              species={species}
              toothMarks={preToothMarks}
              onToothMarksChange={setPreToothMarks}
              comments={preDiagramComments}
              onCommentsChange={setPreDiagramComments}
              strokes={preDiagramStrokes}
              onStrokesChange={setPreDiagramStrokes}
              markMode="missing-only"
            />
          </div>
          <aside className="diagram-with-codes__codes">
            <CodeReferencePanel />
          </aside>
        </div>
      ),
    },
    {
      id: 'procedure',
      label: 'Procedure',
      content: (
        <div className="diagram-with-codes">
          <div className="diagram-with-codes__diagram">
            <DiagramView
              ref={postDiagramRef}
              title="Procedure Diagram"
              species={species}
              toothMarks={effectivePostMarks}
              onToothMarksChange={handlePostMarksChange}
              comments={postDiagramComments}
              onCommentsChange={setPostDiagramComments}
              strokes={postDiagramStrokes}
              onStrokesChange={setPostDiagramStrokes}
              lockedTriadans={lockedPostTriadans}
              markMode="extracted-only"
            />
          </div>
          <aside className="diagram-with-codes__codes">
            <CodeReferencePanel />
          </aside>
        </div>
      ),
    },
    {
      id: 'treatment',
      label: 'Treatment Report',
      content: (
        <SurgeryReportForm
          value={patientInfo.treatmentReport}
          onChange={(value) => handlePatientInfoChange('treatmentReport', value)}
        />
      ),
    },
  ];

  return (
    <div className="entry-grid-container">
      <form className="entry-grid-form" onSubmit={handleOpenPreview}>
        <SectionLayout layout={board.layout} sections={sections} />

        <div className="entry-grid__submit">
          <button type="submit" className="entry-grid__button">
            📄 Preview &amp; Download
          </button>
        </div>
      </form>

      <PdfPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        snapshot={previewSnapshot}
      />
    </div>
  );
};

export default EntryGrid;
