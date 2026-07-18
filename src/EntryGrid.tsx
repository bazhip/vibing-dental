import React from 'react';
import {
  PatientForm,
  DentalGrid,
  AnesthesiaForm,
  ExamForm,
  SurgeryReportForm,
  ImagingSection,
  DiagramView,
  CodeReferencePanel,
} from './components';
import { DiagramViewHandle } from './components/DiagramView';
import { SidebarLayout, ChartSection } from './components/Layouts';
import { ChartMenu } from './components/ChartMenu';
import type { ChartSnapshot } from './components/PdfPreviewModal';
import { VoiceInputButton } from './components/VoiceInputButton';
import { useChartState } from './hooks/useChartState';
import { useCloudSync } from './hooks/useCloudSync';
import { useProfile } from './hooks/useProfile';
import { PracticeSettingsModal } from './components/PracticeSettingsModal';
import { RemindersModal } from './components/RemindersModal';
import { AccountModal } from './components/AccountModal';
import { WalkthroughModal } from './components/WalkthroughModal';
import { readString, writeString } from './utils/storage';
import { ChartLibrary } from './components/ChartLibrary';
import { AdminPanel, useIsAdmin } from './components/AdminPanel';
import { ReminderModal } from './components/ReminderModal';
import type { CloudChartMeta } from './hooks/useCloudSync';
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
  const profile = useProfile();
  const cloud = useCloudSync(chart, !trial, profile.practiceId);
  const [practiceSettingsOpen, setPracticeSettingsOpen] = React.useState(false);
  const [remindersOpen, setRemindersOpen] = React.useState(false);
  const [accountOpen, setAccountOpen] = React.useState(false);
  // Which chart section is showing (controlled so a blocked save can jump
  // the user to Patient).
  const [activeSection, setActiveSection] = React.useState('patient');
  // Inline reason a save was blocked (e.g. missing patient name).
  const [saveHint, setSaveHint] = React.useState('');
  // Saved charts open read-only; the user unlocks to edit them, and each
  // save then overwrites the original deliberately. Reset whenever the
  // active chart changes.
  const [editUnlocked, setEditUnlocked] = React.useState(false);
  React.useEffect(() => { setEditUnlocked(false); }, [chart.cloudChartId]);
  const readOnly = cloud.enabled && chart.openedExisting && !editUnlocked;

  // First-run walkthrough — auto-shown once per browser for real accounts,
  // and relaunchable from Settings.
  const [walkthroughOpen, setWalkthroughOpen] = React.useState(false);
  React.useEffect(() => {
    if (trial || !profile.loaded) return;
    if (readString('onboarding.seen', 1, '') === '1') return;
    writeString('onboarding.seen', 1, '1');
    setWalkthroughOpen(true);
  }, [trial, profile.loaded]);
  // "My charts" dialog — overlays the working chart like the other popups.
  const [libraryOpen, setLibraryOpen] = React.useState(false);
  const isAdmin = useIsAdmin();
  const [adminOpen, setAdminOpen] = React.useState(false);
  // Recheck reminders are composed from a saved chart in My charts; this
  // holds the target chart while the composer is open.
  const [reminderTarget, setReminderTarget] = React.useState<CloudChartMeta | null>(null);

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

  // Single save gate for the button, ⌘S, and retry: a chart with no
  // patient name can't be found again in My charts (the library groups by
  // number-else-name), so require one before it reaches the cloud.
  const attemptSave = () => {
    if (!cloud.enabled || readOnly) return;
    if (!chart.patientInfo.patientName.trim()) {
      setSaveHint('Add a patient name before saving — it’s how you’ll find this chart again.');
      setActiveSection('patient');
      return;
    }
    setSaveHint('');
    cloud.saveNow().catch(() => {});
  };
  // Clear the hint the moment a name exists.
  React.useEffect(() => {
    if (chart.patientInfo.patientName.trim()) setSaveHint('');
  }, [chart.patientInfo.patientName]);

  // The open patient's other visits, for the topbar date switcher. Loaded
  // when the active chart changes (open / new visit / new patient) rather
  // than on every keystroke.
  const [visits, setVisits] = React.useState<CloudChartMeta[]>([]);
  React.useEffect(() => {
    if (!cloud.enabled) { setVisits([]); return; }
    const num = chart.patientInfo.patientNumber.trim().toLowerCase();
    const name = chart.patientInfo.patientName.trim().toLowerCase();
    if (!num && !name) { setVisits([]); return; }
    const key = num ? `n:${num}` : `p:${name}`;
    let cancelled = false;
    cloud.listCharts()
      .then((all) => {
        if (cancelled) return;
        const mine = all
          .filter((c) => {
            const n = c.patient_number.trim().toLowerCase();
            const nm = c.patient_name.trim().toLowerCase();
            return (n ? `n:${n}` : `p:${nm}`) === key;
          })
          .sort((a, b) =>
            (b.chart_date || '').localeCompare(a.chart_date || '') ||
            b.updated_at.localeCompare(a.updated_at)
          );
        setVisits(mine);
      })
      .catch(() => { if (!cancelled) setVisits([]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud.enabled, chart.cloudChartId]);

  const switchVisit = (id: string) => {
    if (id === chart.cloudChartId) return;
    cloud.openChart(id).catch(() => {
      alert('Could not open that visit — check your connection.');
    });
  };

  // ⌘S / Ctrl+S saves the chart — matches the mental model everyone
  // brings from every other document editor. Swallows the browser's
  // save-page dialog either way.
  const saveShortcutRef = React.useRef<() => void>(() => {});
  saveShortcutRef.current = () => {
    if (cloud.enabled && cloud.dirty && cloud.status !== 'saving') {
      attemptSave();
    }
  };
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveShortcutRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
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
              defaultTool="comment"
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
      id: 'imaging',
      label: 'Images',
      content: (
        <ImagingSection chartId={chart.cloudChartId} cloudActive={cloud.enabled} practiceId={profile.practiceId} maxImages={profile.maxImages} />
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
          practiceId={profile.practiceId}
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
                {chart.patientInfo.date && (() => {
                  const hasCurrent = visits.some((v) => v.id === chart.cloudChartId);
                  const opts = hasCurrent
                    ? visits
                    : [{ id: chart.cloudChartId, chart_date: chart.patientInfo.date } as CloudChartMeta, ...visits];
                  const canSwitch = cloud.enabled && opts.length >= 2;
                  return (
                    <>
                      <span className="entry-grid__patient-sep" aria-hidden="true" />
                      {canSwitch ? (
                        <select
                          className="entry-grid__visit-select"
                          value={chart.cloudChartId}
                          onChange={(e) => switchVisit(e.target.value)}
                          aria-label="Switch between this patient's visits"
                          title="Switch between this patient's visits"
                        >
                          {opts.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.chart_date || 'Undated visit'}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="entry-grid__patient-meta entry-grid__patient-date">
                          {chart.patientInfo.date}
                        </span>
                      )}
                    </>
                  );
                })()}
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
                ? cloud.saveError || 'Chart not saved'
                : ''}
            </span>
          )}
          {/* Manual save only — no autosave. The save state is always
              visible so the model is learnable: amber button while dirty,
              Saving…, then a quiet Saved chip. localStorage keeps the
              working copy across reloads regardless. ⌘S / Ctrl+S saves. */}
          {cloud.enabled && cloud.status === 'saving' && (
            <span className="save-status save-status--saving" aria-hidden="true">Saving…</span>
          )}
          {cloud.enabled && cloud.status === 'error' && (
            <span className="save-status-error-wrap">
              <button
                type="button"
                className="save-status save-status--error"
                onClick={attemptSave}
                title={cloud.saveError || 'Retry saving this chart'}
              >
                Not saved — retry
              </button>
              {cloud.saveError && (
                <span className="save-status__detail">{cloud.saveError}</span>
              )}
            </span>
          )}
          {cloud.enabled && saveHint && cloud.status !== 'error' && (
            <span className="save-status-error-wrap" role="alert">
              <span className="save-status save-status--error">Not saved</span>
              <span className="save-status__detail">{saveHint}</span>
            </span>
          )}
          {/* New charts autosave — show a quiet "Saved" once there's a
              name and nothing pending, or a nudge to add a name. Opened
              (existing) charts are driven by the banner below, not here. */}
          {cloud.enabled && !chart.openedExisting && cloud.status !== 'saving' && cloud.status !== 'error' && (
            chart.patientInfo.patientName.trim() === '' && cloud.dirty ? (
              <span className="save-status save-status--manual" title="Autosaves once the patient has a name">
                Add a patient name to save
              </span>
            ) : cloud.status === 'saved' ? (
              // Transient — useCloudSync flips 'saved' back to 'idle' after
              // ~2.5s, so this chip fades on its own.
              <span className="save-status save-status--saved" aria-hidden="true" title="Autosaved to the cloud">
                ✓ Saved
              </span>
            ) : null
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
          {/* AI autofill is a Pro-plan feature; the keys live server-side
              behind JWT-gated edge functions, so trial (no account) and
              Basic practices don't get it. */}
          {profile.aiEnabled && (
            <VoiceInputButton
              context={aiContext}
              handlers={aiHandlers}
            />
          )}
          <ChartMenu
            onOpenWalkthrough={() => setWalkthroughOpen(true)}
            onGoHome={onGoHome}
            onOpenAdmin={isAdmin && !trial ? () => setAdminOpen(true) : undefined}
            cloud={
              cloud.enabled
                ? {
                    onPracticeSettings: () => setPracticeSettingsOpen(true),
                    onOpenReminders: () => setRemindersOpen(true),
                    onOpenAccount: () => setAccountOpen(true),
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

      {/* Opened-from-saved notice: view is locked until the user chooses
          to edit, and saving then overwrites the original — a deliberate
          act, so historical charts aren't changed by accident. */}
      {cloud.enabled && chart.openedExisting && (
        <div className={`chart-lock-banner${readOnly ? '' : ' chart-lock-banner--editing'}`} role="status">
          {readOnly ? (
            <>
              <span className="chart-lock-banner__text">
                You're viewing a saved chart. Editing is locked so it isn't changed by accident.
              </span>
              <button
                type="button"
                className="entry-grid__button entry-grid__button--topbar"
                onClick={() => setEditUnlocked(true)}
              >
                Edit chart
              </button>
            </>
          ) : (
            <>
              <span className="chart-lock-banner__text">
                Editing a saved chart — saving <strong>overwrites</strong> it.
                {cloud.status === 'saving' ? ' Saving…' : cloud.status === 'saved' || !cloud.dirty ? ' All changes saved.' : ' Unsaved changes.'}
              </span>
              <button
                type="button"
                className="entry-grid__button entry-grid__button--topbar"
                onClick={attemptSave}
                disabled={!cloud.dirty || cloud.status === 'saving'}
                title="Overwrite the saved chart (⌘S)"
              >
                {cloud.status === 'saving' ? 'Saving…' : 'Save changes'}
              </button>
            </>
          )}
          {cloud.status === 'error' && cloud.saveError && (
            <span className="save-status__detail">{cloud.saveError}</span>
          )}
        </div>
      )}
      {libraryOpen && (
        <ChartLibrary
          listCharts={cloud.listCharts}
          onOpen={cloud.openChart}
          onDelete={cloud.deleteChart}
          onNewVisit={async (latestChartId) => {
            try {
              const snap = await cloud.fetchChart(latestChartId);
              // Teeth already gone: missing (pre) ∪ extracted (post).
              const gone = new Set<number>();
              for (const [k, v] of Object.entries(snap.preMarks ?? {})) if (v === 'missing') gone.add(Number(k));
              for (const [k, v] of Object.entries(snap.postMarks ?? {})) if (v === 'extracted') gone.add(Number(k));
              chart.startNewVisit({
                identity: {
                  patientName: snap.patientInfo.patientName,
                  patientNumber: snap.patientInfo.patientNumber,
                  ownerName: snap.patientInfo.ownerName ?? '',
                  ownerPhone: snap.patientInfo.ownerPhone ?? '',
                  ownerEmail: snap.patientInfo.ownerEmail ?? '',
                  species: snap.species,
                },
                goneTeeth: Array.from(gone),
              });
              setLibraryOpen(false);
            } catch {
              alert('Could not start a new visit — check your connection.');
            }
          }}
          onSendReminder={(c) => setReminderTarget(c)}
          onNewPatient={() => {
            if (
              window.confirm(
                'Start a new patient? This clears the current chart. New charts autosave once they have a name.'
              )
            ) {
              chart.resetChart();
            }
          }}
          onLoadPdf={chart.loadFromPdf}
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
        <SidebarLayout
          sections={sections}
          activeId={activeSection}
          onActiveChange={setActiveSection}
          contentDisabled={readOnly}
        />
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

      <WalkthroughModal
        open={walkthroughOpen}
        onClose={() => setWalkthroughOpen(false)}
        aiEnabled={profile.aiEnabled}
      />

      <PracticeSettingsModal
        open={practiceSettingsOpen}
        onClose={() => setPracticeSettingsOpen(false)}
        profile={profile}
      />

      <RemindersModal
        open={remindersOpen}
        onClose={() => setRemindersOpen(false)}
      />

      <AccountModal
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        profile={profile}
      />

      {isAdmin && (
        <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} />
      )}

      {cloud.enabled && reminderTarget && (
        <ReminderModal
          open={!!reminderTarget}
          onClose={() => setReminderTarget(null)}
          practiceId={profile.practiceId}
          practiceName={profile.practiceName}
          chartId={reminderTarget.id}
          toEmail={reminderTarget.owner_email ?? ''}
          patientName={reminderTarget.patient_name}
          ownerName={reminderTarget.owner_name ?? ''}
          recheckDate={reminderTarget.recall_date ?? ''}
        />
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
