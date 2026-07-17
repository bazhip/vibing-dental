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
import { SidebarLayout, ChartSection } from './components/Layouts';
import { ChartMenu } from './components/ChartMenu';
import type { ChartSnapshot } from './components/PdfPreviewModal';
import { AiSettingsModal } from './components/AiSettingsModal';
import { VoiceInputButton } from './components/VoiceInputButton';
import { useChartState } from './hooks/useChartState';
import { useCloudSync } from './hooks/useCloudSync';
import { useProfile } from './hooks/useProfile';
import { PracticeSettingsModal } from './components/PracticeSettingsModal';
import { ChartLibrary } from './components/ChartLibrary';
import { AdminPanel, useIsAdmin } from './components/AdminPanel';
import type { ChartContext, ChartHandlers } from './utils/aiAutofill';
import { DiagramComment, PatientInfo, NerveBlocks, ExamFinding, DentalField, ToothData, ToothMarks } from './types';
import './components/EntryGrid.css';

// The PDF engine (pdf-lib + the whole draw pipeline) loads the first
// time a preview is requested, not with the charting screen.
const PdfPreviewModal = React.lazy(() =>
  import('./components/PdfPreviewModal').then((m) => ({ default: m.PdfPreviewModal }))
);

/**
 * Pre-filled feedback email. The body seeds the prompts that make a bug
 * report actionable (repro steps, expected vs. actual, the tooth/section
 * involved, browser) so reports come back with enough detail to act on.
 */
const FEEDBACK_MAILTO = `mailto:bazhip@gmail.com?subject=${encodeURIComponent(
  'ToothOps Charting — feedback / bug report'
)}&body=${encodeURIComponent(
  [
    'What I was doing:',
    '',
    'What I expected to happen:',
    '',
    'What actually happened:',
    '',
    'Species / tooth / section involved (if any):',
    '',
    'Browser & device:',
    '',
    '(If you can, attach a screenshot — it helps a ton.)',
    '',
  ].join('\n')
)}`;

/** Display names for the species toggle values, used in the patient banner. */
const SPECIES_LABELS: Record<string, string> = {
  feline: 'Feline',
  canine: 'Canine',
  'feline-deciduous': 'Feline · Deciduous',
  'canine-deciduous': 'Canine · Deciduous',
};

/**
 * Top-level chart entry. Reads chart state (with all the persistence,
 * derivation, and PDF-load handlers) from `useChartState`; this component
 * is purely about layout: the topbar with the menu, the section list
 * driven by the active design board, and the preview modal.
 */
interface EntryGridProps {
  /** No-account trial: cloud sync off, PDFs stamped TRIAL in the
   *  doctor/practice/logo slots, topbar offers account creation. */
  trial?: boolean;
  /** Trial-mode CTA — leave the trial for the signup or sign-in flow. */
  onRequestAccount?: (mode: 'signup' | 'signin') => void;
  /** Show the landing page without ending the session/trial. */
  onGoHome?: () => void;
}

const EntryGrid: React.FC<EntryGridProps> = ({
  trial = false,
  onRequestAccount,
  onGoHome,
}) => {
  const chart = useChartState();
  const cloud = useCloudSync(chart, !trial);
  const profile = useProfile();
  const [practiceSettingsOpen, setPracticeSettingsOpen] = React.useState(false);
  // "My charts" dialog — overlays the working chart like the other popups.
  const [libraryOpen, setLibraryOpen] = React.useState(false);
  const isAdmin = useIsAdmin();
  const [adminOpen, setAdminOpen] = React.useState(false);

  // Publish the sticky topbar's live height as --topbar-height on the
  // container, so other sticky elements (the charting grid's frozen
  // header row) can stack directly beneath it while the page scrolls.
  const containerRef = React.useRef<HTMLDivElement>(null);
  const topbarRef = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    const topbar = topbarRef.current;
    const container = containerRef.current;
    if (!topbar || !container) return;
    const publish = () =>
      container.style.setProperty('--topbar-height', `${topbar.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(topbar);
    return () => ro.disconnect();
  }, []);

  // Don't let a tab close/refresh slip away while a cloud save is in
  // flight or failing — the chart would exist only in this machine's
  // localStorage without the user ever deciding that.
  React.useEffect(() => {
    if (cloud.status !== 'saving' && cloud.status !== 'error') return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [cloud.status]);

  // Refs into the diagram views — we need their live SVG elements at
  // preview time so we can rasterize them with the active style's
  // comment colors.
  const preDiagramRef  = React.useRef<DiagramViewHandle>(null);
  const postDiagramRef = React.useRef<DiagramViewHandle>(null);

  // PDF preview modal state.
  const [previewSnapshot, setPreviewSnapshot] = React.useState<ChartSnapshot | null>(null);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = React.useState(false);

  // ----- AI autofill plumbing -------------------------------------------
  // Snapshot of state Claude sees alongside the transcript.
  const aiContext: ChartContext = {
    patientInfo: chart.patientInfo,
    species:     chart.species,
    logo:        chart.logo,
    toothData:   chart.toothData,
    preMarks:    chart.preToothMarks,
    preComments: chart.preDiagramComments,
    postMarks:   chart.postToothMarks,
    postComments: chart.postDiagramComments,
  };

  // Handlers the autofill module calls to apply tool_use results. Each
  // routes through the same setters the manual UI uses, so the existing
  // diagram-history hook automatically captures AI edits for undo.
  // Not memoized — useChartState returns a fresh object each render
  // anyway, and VoiceInputButton holds these via a ref so a re-creation
  // doesn't cause spurious work.
  const aiHandlers: ChartHandlers = {
    setPreMark: (triadan, mark) => chart.setPreToothMarks((m: ToothMarks) => {
      const next = { ...m };
      if (mark === null) delete next[triadan];
      else next[triadan] = mark;
      return next;
    }),
    setPostMark: (triadan, mark) => {
      // Route through handlePostMarksChange so the pre-missing-strip
      // invariant the manual UI enforces is preserved for AI edits too.
      const next = { ...chart.postToothMarks };
      if (mark === null) delete next[triadan];
      else next[triadan] = mark;
      chart.handlePostMarksChange(next);
    },
    setToothField: (triadan: number, field: DentalField, value: string) => {
      const next = chart.toothData.map((t: ToothData) =>
        t.triadan === triadan ? { ...t, [field]: value } : t
      );
      chart.setToothDataDirectly(next);
    },
    addComment: (diagram, triadan, text) => {
      const id = `ai${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const newComment: DiagramComment = { id, text, anchorTriadan: triadan };
      const setter = diagram === 'pre' ? chart.setPreDiagramComments : chart.setPostDiagramComments;
      setter((prev: DiagramComment[]) => [...prev, newComment]);
    },
    setExamFinding: (area, status, comment) => {
      chart.handleExamStatusChange(area, status as ExamFinding);
      if (comment !== undefined) chart.handleExamCommentChange(area, comment);
    },
    setNerveBlock: (site, mL) => {
      chart.handleNerveBlockChange(site as keyof NerveBlocks, mL);
    },
    setAnestheticDrug: (drug) => {
      chart.handleNerveBlockChange('drug', drug);
    },
    setPatientField: (field, value) => {
      chart.handlePatientInfoChange(field as keyof PatientInfo, value);
    },
    appendTreatmentReport: (text) => {
      const existing = chart.patientInfo.treatmentReport ?? '';
      const joined = existing ? `${existing}\n${text}` : text;
      chart.handlePatientInfoChange('treatmentReport', joined);
    },
  };

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
        branding: trial
          ? // Trial charts carry no practice identity — stamp the slots
            // so the output is obviously not a finished clinical record.
            { doctorName: 'TRIAL', logoUrl: '', practiceName: 'TRIAL' }
          : {
              doctorName: profile.doctorName,
              logoUrl: profile.logoUrl,
              practiceName: profile.practiceName,
            },
      });
      setPreviewOpen(true);
    } catch (error) {
      alert(
        "Couldn't build the preview — open the Diagnosis and Procedure sections once so the diagrams render, then try again."
      );
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
          onPatientInfoChange={chart.handlePatientInfoChange}
          onSpeciesChange={chart.handleSpeciesChange}
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
          logo={chart.logo}
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
          // The grid's "Missing" toggle writes the same pre-surgery marks
          // the Diagnosis diagram edits, so marking a tooth missing in
          // either place crosses out the grid row AND fills the tooth on
          // the diagram (and locks it in the Procedure diagram).
          toothMarks={chart.preToothMarks}
          onToggleMissing={(triadan) =>
            chart.setPreToothMarks((marks: ToothMarks) => {
              const next = { ...marks };
              if (next[triadan] === 'missing') delete next[triadan];
              else next[triadan] = 'missing';
              return next;
            })
          }
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
            <CodeReferencePanel kind="diagnosis" />
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
            <CodeReferencePanel kind="procedure" />
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
          cloudActive={cloud.enabled}
        />
      ),
    },
  ];

  return (
    <div className="entry-grid-container" ref={containerRef}>
      <header className="entry-grid__topbar" ref={topbarRef}>
        <div className="entry-grid__topbar-lead">
          {profile.doctorName.trim() ? (
            <>
              <h1 className="entry-grid__doctor">{profile.doctorName}</h1>
              <span className="entry-grid__title">
                {profile.practiceName.trim() || 'ToothOps Charting'}
              </span>
            </>
          ) : (
            <h1 className="entry-grid__title">
              {trial
                ? 'ToothOps Charting · Trial'
                : profile.practiceName.trim() || 'ToothOps Charting'}
            </h1>
          )}
          {/* Live patient banner — EMR-style encounter context that stays
              visible while scrolling deep into the chart. */}
          <div className="entry-grid__patient" aria-live="off">
            {chart.patientInfo.patientName ? (
              <>
                <span className="entry-grid__patient-name">
                  {chart.patientInfo.patientName}
                </span>
                <span className="entry-grid__patient-sep" aria-hidden="true" />
                <span className="entry-grid__patient-meta">
                  {SPECIES_LABELS[chart.species]}
                </span>
                {chart.patientInfo.date && (
                  <>
                    <span className="entry-grid__patient-sep" aria-hidden="true" />
                    <span className="entry-grid__patient-meta entry-grid__patient-date">
                      {chart.patientInfo.date}
                    </span>
                  </>
                )}
              </>
            ) : (
              <span className="entry-grid__patient-empty">
                No patient — add one in section 01
              </span>
            )}
          </div>
        </div>
        <div className="entry-grid__topbar-actions">
          {trial && (
            <>
              <button
                type="button"
                className="chart-menu__trigger topbar-library-btn"
                onClick={() => onRequestAccount?.('signin')}
                title="Already have a practice account? Sign in"
              >
                Sign in
              </button>
              <button
                type="button"
                className="chart-menu__trigger topbar-library-btn"
                onClick={() => onRequestAccount?.('signup')}
                title="Create a practice account — your charts save to the cloud and PDFs carry your practice name and logo"
              >
                Create free account
              </button>
            </>
          )}
          {cloud.enabled && (
            // The live region stays mounted permanently (several screen
            // reader/browser pairs drop announcements from regions that
            // appear together with their first message); the visible chip
            // is presentation only. A failed save renders as a retry
            // button — the one state the user must be able to act on.
            <span className="visually-hidden" role="status" aria-live="polite">
              {cloud.status === 'saving'
                ? 'Saving chart'
                : cloud.status === 'saved'
                ? 'Chart saved'
                : cloud.status === 'error'
                ? 'Chart not saved'
                : ''}
            </span>
          )}
          {cloud.enabled && cloud.status === 'error' && (
            <button
              type="button"
              className="save-status save-status--error"
              onClick={() => {
                cloud.saveNow().catch(() => {
                  // still failing — the chip stays; local copy is intact
                });
              }}
            >
              Not saved — retry
            </button>
          )}
          {cloud.enabled && (cloud.status === 'saving' || cloud.status === 'saved') && (
            <span
              className={`save-status save-status--${cloud.status}`}
              aria-hidden="true"
            >
              {cloud.status === 'saving' ? 'Saving…' : 'Saved'}
            </span>
          )}
          {cloud.enabled && (
            <button
              type="button"
              className="chart-menu__trigger topbar-library-btn"
              onClick={() => setLibraryOpen(true)}
              aria-haspopup="dialog"
            >
              My charts
            </button>
          )}
          <VoiceInputButton
            context={aiContext}
            handlers={aiHandlers}
            onNeedsApiKey={() => setAiSettingsOpen(true)}
          />
          <ChartMenu
            onNewChart={chart.resetChart}
            onLoadPdf={chart.loadFromPdf}
            onOpenAiSettings={() => setAiSettingsOpen(true)}
            onGoHome={onGoHome}
            onOpenAdmin={isAdmin && !trial ? () => setAdminOpen(true) : undefined}
            cloud={
              cloud.enabled
                ? {
                    autosaveEnabled: cloud.autosaveEnabled,
                    onToggleAutosave: () => cloud.setAutosaveEnabled(!cloud.autosaveEnabled),
                    onSaveChart: () => {
                      cloud.saveNow().catch(() => {
                        alert(
                          'Could not save the chart to the cloud — check your connection. ' +
                            'Your work is kept on this device and you can retry from the topbar.'
                        );
                      });
                    },
                    onOpenLibrary: () => setLibraryOpen(true),
                    onPracticeSettings: () => setPracticeSettingsOpen(true),
                    onSignOut: () => {
                      cloud.signOut().catch(() => {
                        alert('Could not sign out — check your connection.');
                      });
                    },
                  }
                : undefined
            }
          />
        </div>
      </header>
      {libraryOpen && (
        <ChartLibrary
          listCharts={cloud.listCharts}
          onOpen={cloud.openChart}
          onDelete={cloud.deleteChart}
          onClose={() => setLibraryOpen(false)}
        />
      )}

      <form
        id="chart-form"
        className="entry-grid-form"
        onSubmit={handleOpenPreview}
        // Stop browser-default form submit on Enter from any single-line
        // input. Textareas, the actual submit button, and inputs that
        // explicitly opt-in (data-allow-form-submit) still submit. This
        // makes the chart behave like a spreadsheet — Enter advances the
        // active grid cell rather than opening the preview modal.
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          const target = e.target as HTMLElement | null;
          if (!target) return;
          const tag = target.tagName;
          const allow =
            tag === 'TEXTAREA' ||
            (target instanceof HTMLButtonElement && target.type === 'submit') ||
            target.dataset.allowFormSubmit === 'true';
          if (!allow) e.preventDefault();
        }}
      >
        <SidebarLayout sections={sections} />
      </form>

      <button
        type="submit"
        form="chart-form"
        className="fab-download"
        aria-label="Preview and download the chart PDF"
      >
        <span aria-hidden="true">⤓</span> Preview PDF
      </button>

      {previewSnapshot && (
        <React.Suspense fallback={null}>
          <PdfPreviewModal
            open={previewOpen}
            onClose={() => setPreviewOpen(false)}
            snapshot={previewSnapshot}
          />
        </React.Suspense>
      )}

      <AiSettingsModal
        open={aiSettingsOpen}
        onClose={() => setAiSettingsOpen(false)}
      />

      <PracticeSettingsModal
        open={practiceSettingsOpen}
        onClose={() => setPracticeSettingsOpen(false)}
        profile={profile}
      />

      {isAdmin && (
        <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} />
      )}

      <footer className="entry-grid__footnote">
        <span className="entry-grid__footnote-lead">
          Found a bug or have an idea? Email{' '}
          <a href={FEEDBACK_MAILTO}>bazhip@gmail.com</a>
        </span>
        <span className="entry-grid__footnote-hint">
          Please include what you were doing, what you expected, what actually
          happened, the species/tooth or section involved, and your browser —
          a screenshot helps a lot. The email link pre-fills these prompts.
        </span>
      </footer>
    </div>
  );
};

export default EntryGrid;
