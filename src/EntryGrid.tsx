import React from 'react';
import {
  PatientForm,
  DentalGrid,
  AnesthesiaForm,
  ExamForm,
  SurgeryReportForm,
  DiagramView,
  CodeReferencePanel,
} from './components';
import { DiagramViewHandle } from './components/DiagramView';
import { SectionLayout, ChartSection } from './components/Layouts';
import { useBoard } from './components/BoardSwitcher';
import { ChartMenu } from './components/ChartMenu';
import { PdfPreviewModal, ChartSnapshot } from './components/PdfPreviewModal';
import { useChartState } from './hooks/useChartState';
import './components/EntryGrid.css';

/**
 * Top-level chart entry. Reads chart state (with all the persistence,
 * derivation, and PDF-load handlers) from `useChartState`; this component
 * is purely about layout: the topbar with the menu, the section list
 * driven by the active design board, and the preview modal.
 */
const EntryGrid: React.FC = () => {
  const chart = useChartState();
  const { board } = useBoard();

  // Refs into the diagram views — we need their live SVG elements at
  // preview time so we can rasterize them with the active style's
  // comment colors.
  const preDiagramRef  = React.useRef<DiagramViewHandle>(null);
  const postDiagramRef = React.useRef<DiagramViewHandle>(null);

  // PDF preview modal state.
  const [previewSnapshot, setPreviewSnapshot] = React.useState<ChartSnapshot | null>(null);
  const [previewOpen, setPreviewOpen] = React.useState(false);

  const handleOpenPreview = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const preHandle  = preDiagramRef.current;
      const postHandle = postDiagramRef.current;
      const preSvg  = preHandle?.getSvgElement();
      const postSvg = postHandle?.getSvgElement();
      if (!preHandle || !postHandle || !preSvg || !postSvg) {
        throw new Error('Diagram SVGs not yet mounted');
      }
      setPreviewSnapshot({
        patientInfo: chart.patientInfo,
        toothData:   chart.toothData,
        species:     chart.species,
        logo:        chart.logo,
        preSvg,
        preComments: preHandle.getCommentExports(),
        preState: {
          marks:    chart.preToothMarks,
          comments: chart.preDiagramComments,
          strokes:  chart.preDiagramStrokes,
        },
        postSvg,
        postComments: postHandle.getCommentExports(),
        postState: {
          marks:    chart.postToothMarks,
          comments: chart.postDiagramComments,
          strokes:  chart.postDiagramStrokes,
        },
      });
      setPreviewOpen(true);
    } catch (error) {
      alert("Couldn't open preview. Please try again.");
      console.error(error);
    }
  };

  // Section list — rendered by whichever layout the active board picks.
  const sections: ChartSection[] = [
    {
      id: 'patient',
      label: 'Patient',
      content: (
        <PatientForm
          patientInfo={chart.patientInfo}
          species={chart.species}
          logo={chart.logo}
          onPatientInfoChange={chart.handlePatientInfoChange}
          onSpeciesChange={chart.handleSpeciesChange}
          onLogoChange={chart.setLogo}
        />
      ),
    },
    {
      id: 'exam',
      label: 'Exam',
      content: (
        <ExamForm
          exam={chart.patientInfo.exam}
          onStatusChange={chart.handleExamStatusChange}
          onCommentChange={chart.handleExamCommentChange}
        />
      ),
    },
    {
      id: 'anesthesia',
      label: 'Anesthesia',
      content: (
        <AnesthesiaForm
          nerveBlocks={chart.patientInfo.nerveBlocks}
          onNerveBlockChange={chart.handleNerveBlockChange}
        />
      ),
    },
    {
      id: 'charting',
      label: 'Charting',
      content: (
        <DentalGrid
          toothData={chart.toothData}
          onToothDataChange={chart.setToothDataDirectly}
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
              species={chart.species}
              toothMarks={chart.preToothMarks}
              onToothMarksChange={chart.setPreToothMarks}
              comments={chart.preDiagramComments}
              onCommentsChange={chart.setPreDiagramComments}
              strokes={chart.preDiagramStrokes}
              onStrokesChange={chart.setPreDiagramStrokes}
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
              species={chart.species}
              toothMarks={chart.effectivePostMarks}
              onToothMarksChange={chart.handlePostMarksChange}
              comments={chart.postDiagramComments}
              onCommentsChange={chart.setPostDiagramComments}
              strokes={chart.postDiagramStrokes}
              onStrokesChange={chart.setPostDiagramStrokes}
              lockedTriadans={chart.lockedPostTriadans}
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
          value={chart.patientInfo.treatmentReport}
          onChange={(value) => chart.handlePatientInfoChange('treatmentReport', value)}
        />
      ),
    },
  ];

  return (
    <div className="entry-grid-container">
      <header className="entry-grid__topbar">
        <h1 className="entry-grid__title">🦷 Veterinary Dental Charting</h1>
        <ChartMenu onNewChart={chart.resetChart} onLoadPdf={chart.loadFromPdf} />
      </header>
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
