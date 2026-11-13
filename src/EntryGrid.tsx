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
import { VoiceInputButton, actionFocus } from './components/VoiceInputButton';
import { FeedbackModal } from './components/FeedbackModal';
import { CodeField } from './components/CodeField';
import { ChartSettingsModal, type SettingsSection } from './components/ChartSettingsModal';
import { WhatsNewModal } from './components/WhatsNewModal';
import { ChartHistoryModal } from './components/ChartHistoryModal';
import { WHATS_NEW, shouldShowWhatsNew } from './constants/whatsNew';
import { OwnerReportCustomize } from './components/OwnerReportCustomize';
import { useChartSettings } from './hooks/useChartSettings';
import type { ChartPrefs } from './utils/chartSettings';
import { useChartState } from './hooks/useChartState';
import { useCloudSync } from './hooks/useCloudSync';
import { useProfile } from './hooks/useProfile';
import { TOOTH_DIAGRAMS } from './constants/toothShapes';
import { syncGridComments, isGridComment } from './utils/gridComments';
import { toast, friendlyError, confirmDialog } from './components/ui/dialogs';
import { PracticeSettingsModal } from './components/PracticeSettingsModal';
import { RemindersModal } from './components/RemindersModal';
import { AccountModal } from './components/AccountModal';
import { FinishSetupModal, useFinishSetup } from './components/FinishSetupModal';
import { WalkthroughModal } from './components/WalkthroughModal';
import { readString, writeString } from './utils/storage';
import { lazyWithReload, whenIdle } from './utils/lazyWithReload';
import { useHashRoute } from './hooks/useHashRoute';
import { ChartLibrary } from './components/ChartLibrary';
import { OwnerReportSection } from './components/OwnerReportSection';
import { ToothChartView } from './components/ToothChartView';
import { AdminPanel, useIsAdmin } from './components/AdminPanel';
import { ReminderModal } from './components/ReminderModal';
import type { CloudChartMeta } from './hooks/useCloudSync';
import type { ChartContext, ChartHandlers, AiAction } from './utils/aiAutofill';
import { DiagramComment, PatientInfo, NerveBlockSite, usualConcentration, ExamFinding, DentalField, ToothData, ToothMarks } from './types';
import { localDateISO } from './utils/localDate';
import { isCurrentVisit } from './utils/currentVisit';
import { shouldOpenLibraryOnArrival } from './utils/arrival';
import './components/EntryGrid.css';

// The PDF engine (pdf-lib + the whole draw pipeline) loads the first
// time a preview is requested, not with the charting screen.
/** "2:41 pm" today, "Nov 9, 2:41 pm" otherwise. */
function formatSavedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? time
    : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

const DocumentsModal = lazyWithReload(() =>
  import('./components/DocumentsModal').then((m) => ({ default: m.DocumentsModal }))
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
  const chartSettings = useChartSettings(profile.loaded);
  const prefs = chartSettings.prefs;
  const setPref = React.useCallback((patch: Partial<ChartPrefs>) => {
    chartSettings.update(patch).catch((err) => toast(`Couldn’t save that setting. ${friendlyError(err)}`, { kind: 'error' }));
  }, [chartSettings.update]); // eslint-disable-line react-hooks/exhaustive-deps
  // Chart settings dialog: closed, everything, or one section only.
  const [chartSettingsOpen, setChartSettingsOpen] = React.useState<false | 'all' | SettingsSection>(false);
  const [reportCustomizeOpen, setReportCustomizeOpen] = React.useState(false);
  // Chart history: which chart (the open one, or a visit picked in My charts).
  const [historyFor, setHistoryFor] = React.useState<{ id: string; label?: string; fromLibrary?: boolean } | null>(null);
  // Saved charts open read-only; the user unlocks to edit them (then
  // changes autosave). Remembered per chart for this browser session, so
  // a refresh mid-edit doesn't re-lock and hide pending edits.
  const unlockKey = `chart.unlocked.${chart.cloudChartId}`;
  const [editUnlocked, setEditUnlockedState] = React.useState<boolean>(() => {
    try { return window.sessionStorage.getItem(unlockKey) === '1'; } catch { return false; }
  });
  React.useEffect(() => {
    try { setEditUnlockedState(window.sessionStorage.getItem(unlockKey) === '1'); } catch { setEditUnlockedState(false); }
  }, [unlockKey]);
  const setEditUnlocked = (v: boolean) => {
    try {
      if (v) window.sessionStorage.setItem(unlockKey, '1');
      else window.sessionStorage.removeItem(unlockKey);
    } catch { /* private mode */ }
    setEditUnlockedState(v);
  };
  // The open patient's visits (newest first), for the topbar date
  // switcher and the current-visit rule below. Loaded further down.
  const [visits, setVisits] = React.useState<CloudChartMeta[]>([]);
  // Today's visit isn't a "saved visit": reloading or reopening it
  // mid-visit opens it editable with no banner (see isCurrentVisit).
  // Latched per chart so changing the date mid-edit doesn't lock it.
  const currentVisitRule = isCurrentVisit(chart.patientInfo.date, localDateISO(), visits, chart.cloudChartId);
  const [currentVisitLatch, setCurrentVisitLatch] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (currentVisitRule) setCurrentVisitLatch(chart.cloudChartId);
  }, [currentVisitRule, chart.cloudChartId]);
  const currentVisit = currentVisitRule || currentVisitLatch === chart.cloudChartId;
  const editable = editUnlocked || currentVisit;
  const cloud = useCloudSync(chart, !trial, profile.practiceId, editable);
  // Owner report is per-practice, admin-flagged, and off by default —
  // everything it touches (section, FAB, image tags, modal) gates here.
  const ownerReportOn = cloud.enabled && profile.ownerReportEnabled;
  const { route, navigate } = useHashRoute();
  const [practiceSettingsOpen, setPracticeSettingsOpen] = React.useState(false);
  const [remindersOpen, setRemindersOpen] = React.useState(false);
  const [accountOpen, setAccountOpen] = React.useState(false);
  // Which chart section is showing (controlled so a blocked save can jump
  // the user to Patient). Mirrored into the hash (#/chart/:id/:section)
  // so a refresh or shared link lands on the same section.
  const [activeSection, setActiveSection] = React.useState(
    () => (route.view === 'chart' && route.section) || 'patient'
  );
  // Follow the hash when it names a different section (Back/Forward, a
  // hand-edited URL) — state-driven changes are already in sync.
  React.useEffect(() => {
    if (route.view === 'chart' && route.section) setActiveSection(route.section);
  }, [route.view, route.section]);
  // The ONE way the app changes section: state and hash move together.
  // (Mirroring activeSection into the hash from an effect, next to the
  // effect above mirroring the hash into activeSection, ping-ponged
  // forever whenever one render carried a hash change AND a different
  // section pick — each effect undid the other every render until Safari
  // threw "replaceState() more than 100 times per 10 seconds".)
  const hashBaseRef = React.useRef('');
  hashBaseRef.current = cloud.enabled ? `#/chart/${chart.cloudChartId}` : '#/chart';
  const routeViewRef = React.useRef(route.view);
  routeViewRef.current = route.view;
  const goToSection = React.useCallback((id: string) => {
    setActiveSection(id);
    if (routeViewRef.current === 'chart') navigate(`${hashBaseRef.current}/${id}`, { replace: true });
  }, [navigate]);
  // Inline reason a save was blocked (e.g. missing patient name).
  const [saveHint, setSaveHint] = React.useState('');
  const readOnly = cloud.enabled && chart.openedExisting && !editable;
  // Has the chart changed since the user chose Edit chart? (Offers Revert.)
  const unlockSnapshotChanged = React.useMemo(() => {
    if (!editUnlocked || !chart.openedExisting) return false;
    try {
      const raw = window.sessionStorage.getItem(`chart.unlockSnapshot.${chart.cloudChartId}`);
      return !!raw && raw !== JSON.stringify(chart.getSnapshot());
    } catch {
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editUnlocked, chart.openedExisting, chart.cloudChartId, chart.getSnapshot()]);

  // AI autofill focus: the tooth the AI most recently edited, flashed in
  // the diagrams/grid. Cleared a few seconds after the last edit.
  const [aiHighlightTriadan, setAiHighlightTriadan] = React.useState<number | null>(null);
  const aiHighlightTimer = React.useRef<number | undefined>(undefined);
  React.useEffect(() => () => window.clearTimeout(aiHighlightTimer.current), []);
  // Stable identity: the setter from usePersistedState never changes, so
  // DentalGrid's memoized column definitions survive unrelated re-renders
  // (an inline arrow here rebuilt them on every keystroke elsewhere).
  const { setPreToothMarks } = chart;
  const toggleMissing = React.useCallback((triadan: number) => {
    setPreToothMarks((marks: ToothMarks) => {
      const next = { ...marks };
      if (next[triadan] === 'missing') delete next[triadan];
      else next[triadan] = 'missing';
      return next;
    });
  }, [setPreToothMarks]);

  // Charting → Diagnosis: optionally mirror each tooth's grid findings
  // onto the Diagnosis diagram as anchored comments (owners follow the
  // mouth picture far better than the spreadsheet). A per-browser
  // preference, toggled from the Charting section. Read-only charts are
  // left as saved — the sync catches up once the user unlocks to edit.
  const mirrorToDiagnosis = prefs.mirrorToDiagnosis;
  // Companion switch: leave the arch grids off the PDF since the diagram
  // now carries the same findings. Only honored while mirroring is on,
  // so turning mirroring off can never silently drop the grid data.
  const pdfIncludeGrid = prefs.pdfIncludeGrid;
  // Charting view: the spreadsheet grid, or By tooth (click a numbered
  // tooth on the diagram and chart it in a side panel). Both edit the
  // same chart data. Per-browser preference.
  const chartingView = prefs.chartingView;
  const setChartingView = (v: 'grid' | 'tooth') => setPref({ chartingView: v });
  const chartingViewSwitch = (
    <div className="charting-view-switch" role="group" aria-label="Charting view">
      {([['grid', 'Grid'], ['tooth', 'By tooth']] as const).map(([v, label]) => (
        <button
          key={v}
          type="button"
          className={`charting-view-switch__btn${chartingView === v ? ' charting-view-switch__btn--active' : ''}`}
          aria-pressed={chartingView === v}
          onClick={() => setChartingView(v)}
          title={v === 'tooth'
            ? 'Click a tooth on a numbered diagram and chart it — findings, notes, planned and confirmed extractions'
            : 'Spreadsheet of every tooth\'s measurements'}
        >
          {label}
        </button>
      ))}
    </div>
  );
  // Charting header: the view switch plus Customize, which opens Chart
  // settings — every charting option lives there, not split between the
  // menu and checkboxes above the chart.
  const chartingHeaderAccessory = (
    <div className="charting-header-actions">
      {chartingViewSwitch}
      <button
        type="button"
        className="diagram-view__action"
        onClick={() => setChartSettingsOpen('charting')}
        title="Pockets per root, columns, what shows beside the teeth, PDF options"
      >
        Customize
      </button>
    </div>
  );
  // Append the chart's photos/radiographs to the PDF as extra pages, four
  // per page. Per-browser preference, toggled from the Images section.
  const pdfIncludeImages = prefs.pdfIncludeImages;
  // Values written beside the teeth: the person's choice, minus any
  // column they hide.
  const besideTeeth = React.useMemo(
    () => prefs.besideTeeth.filter((f) => !prefs.hiddenColumns.includes(f)),
    [prefs.besideTeeth, prefs.hiddenColumns],
  );
  const { setPreDiagramComments } = chart;
  React.useEffect(() => {
    if (readOnly) return;
    const diag = TOOTH_DIAGRAMS[chart.species];
    // Same seat as the diagram's "add comment" button.
    const seat = { x: diag.width / 2 - 65, y: diag.midlineY + 20 };
    setPreDiagramComments((prev) =>
      syncGridComments(prev, chart.toothData, chart.preToothMarks, mirrorToDiagnosis, seat, besideTeeth)
    );
  }, [readOnly, mirrorToDiagnosis, chart.species, chart.toothData, chart.preToothMarks, setPreDiagramComments, besideTeeth]);

  const activeSectionRef = React.useRef(activeSection);
  activeSectionRef.current = activeSection;
  const handleAiActivity = React.useCallback((actions: AiAction[]) => {
    // Never navigate: the vet stays on the page they chose, and the voice
    // panel says where anything else went ("→ Exam: …"). Just flash the
    // tooth from the last change that belongs on this page.
    for (let i = actions.length - 1; i >= 0; i--) {
      const f = actionFocus(actions[i], activeSectionRef.current);
      if (!f || f.section !== activeSectionRef.current) continue;
      if (typeof f.triadan === 'number') {
        setAiHighlightTriadan(f.triadan);
        window.clearTimeout(aiHighlightTimer.current);
        aiHighlightTimer.current = window.setTimeout(() => setAiHighlightTriadan(null), 4000);
      }
      break;
    }
  }, []);

  // First-run walkthrough — auto-shown once per browser for real accounts,
  // and relaunchable from Settings.
  const [walkthroughOpen, setWalkthroughOpen] = React.useState(false);
  // New Google accounts name their practice/doctor first; the walkthrough
  // waits until that's settled.
  const setup = useFinishSetup(profile, cloud.enabled && !trial);
  // Captured before the walkthrough effect marks it: a device that has
  // never seen the walkthrough gets that instead of "What's new".
  const onboardedRef = React.useRef(readString('onboarding.seen', 1, '') === '1');
  React.useEffect(() => {
    if (trial || !profile.loaded || !setup.checked || setup.need) return;
    if (readString('onboarding.seen', 1, '') === '1') return;
    writeString('onboarding.seen', 1, '1');
    setWalkthroughOpen(true);
    // The walkthrough covers everything; don't follow it with "What's new".
    setPref({ whatsNewSeen: WHATS_NEW.id });
  }, [trial, profile.loaded, setup.checked, setup.need]); // eslint-disable-line react-hooks/exhaustive-deps

  // "What's new": once per account (the seen id is in chart settings),
  // after the account's settings load. Reopenable from the menu.
  const [whatsNewOpen, setWhatsNewOpen] = React.useState(false);
  const whatsNewShownRef = React.useRef(false);
  React.useEffect(() => {
    if (whatsNewShownRef.current) return;
    if (!shouldShowWhatsNew({
      signedIn: !trial && cloud.enabled,
      settingsLoaded: chartSettings.loaded,
      seenId: prefs.whatsNewSeen,
      onboardedDevice: onboardedRef.current,
      walkthroughOpen,
    })) return;
    whatsNewShownRef.current = true;
    setWhatsNewOpen(true);
  }, [trial, cloud.enabled, chartSettings.loaded, prefs.whatsNewSeen, walkthroughOpen]);
  const closeWhatsNew = () => {
    setWhatsNewOpen(false);
    if (prefs.whatsNewSeen !== WHATS_NEW.id) setPref({ whatsNewSeen: WHATS_NEW.id });
  };
  // "My charts" dialog — a real route (#/library) so the Back button and
  // gesture-back close it instead of exiting the site, and a refresh
  // reopens it.
  const libraryOpen = cloud.enabled && route.view === 'library';
  // True when THIS session pushed #/library — closing can then be a
  // history.back() (clean stack). A deep-linked/refreshed library has no
  // in-app entry behind it, so closing navigates to the chart instead.
  const libraryPushedRef = React.useRef(false);
  const openLibrary = () => {
    libraryPushedRef.current = true;
    navigate('#/library');
  };
  const closeLibrary = React.useCallback(() => {
    if (libraryPushedRef.current) {
      libraryPushedRef.current = false;
      window.history.back();
    } else {
      navigate(`#/chart/${chart.cloudChartId}`, { replace: true });
    }
  }, [navigate, chart.cloudChartId]);

  // Deep link support: arriving on #/chart/:id for a chart that isn't
  // the working one opens it from the cloud (same path as the library,
  // including the unsaved-changes confirm). Mount-time only — reacting
  // to every hash change would fight history.back() from the library,
  // whose restored hash names the previously open chart. A stale or
  // foreign id keeps the current chart; the canonicalizing effect below
  // rewrites the hash either way.
  const initialChartLinkRef = React.useRef(
    route.view === 'chart' ? route.chartId : undefined
  );
  React.useEffect(() => {
    const id = initialChartLinkRef.current;
    if (!cloud.enabled || !id || id === chart.cloudChartId) return;
    // Wait a tick so the chart restored from this device has landed (the
    // grid restores in an effect); then open the link only if that
    // working chart has no unsaved edits — a reload never prompts.
    const t = window.setTimeout(() => {
      cloud.openChart(id, { ifClean: true }).catch(() => { /* stale link — keep the working chart */ });
    }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Opening plain toothops.app (no #/ route): reopen the last chart only
  // if it's today's visit or has unsaved changes; otherwise start on My
  // charts. Captured before the hash is canonicalized below; decided a
  // tick later, once the chart restored from this device has landed.
  const bareArrivalRef = React.useRef(!window.location.hash.startsWith('#/'));
  const arrivalStateRef = React.useRef({ dirty: cloud.dirty, date: chart.patientInfo.date, name: chart.patientInfo.patientName });
  arrivalStateRef.current = { dirty: cloud.dirty, date: chart.patientInfo.date, name: chart.patientInfo.patientName };
  React.useEffect(() => {
    if (!cloud.enabled || trial || !bareArrivalRef.current) return;
    const t = window.setTimeout(() => {
      const a = arrivalStateRef.current;
      if (shouldOpenLibraryOnArrival({ bareArrival: true, chartDate: a.date, today: localDateISO(), patientName: a.name, dirty: a.dirty })) {
        navigate('#/library', { replace: true });
      }
    }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the hash naming the working chart (replace, not push — visit
  // switches must not pollute the Back stack). Section changes write the
  // hash themselves (goToSection), so this deliberately does NOT re-run
  // on activeSection — see goToSection for the loop that caused. Trial
  // mode has no meaningful chart id, so its hash carries the section alone.
  React.useEffect(() => {
    if (route.view !== 'chart') return;
    navigate(`${hashBaseRef.current}/${activeSectionRef.current}`, { replace: true });
  }, [cloud.enabled, route.view, chart.cloudChartId, navigate]);
  const isAdmin = useIsAdmin();
  const [adminOpen, setAdminOpen] = React.useState(false);
  // Feedback form; `transcript` is offered when opened from the voice panel.
  const [feedback, setFeedback] = React.useState<{ transcript?: string } | null>(null);
  const canFeedback = cloud.enabled && !trial;
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
      goToSection('patient');
      return;
    }
    setSaveHint('');
    cloud.saveNow().catch(() => {});
  };
  // Clear the hint the moment a name exists.
  React.useEffect(() => {
    if (chart.patientInfo.patientName.trim()) setSaveHint('');
  }, [chart.patientInfo.patientName]);

  // Load the open patient's visits when the active chart changes (open /
  // new visit / new patient) rather than on every keystroke.
  React.useEffect(() => {
    if (!cloud.enabled) { setVisits([]); return; }
    const num = chart.patientInfo.patientNumber.trim().toLowerCase();
    const name = chart.patientInfo.patientName.trim().toLowerCase();
    if (!num && !name) { setVisits([]); return; }
    const key = num ? `n:${num}` : `p:${name}`;
    let cancelled = false;
    // Server-side patient lookup — correct however many charts the
    // practice has. The exact key filter re-applies the library's
    // grouping rule to the (already narrow) result set.
    cloud.listPatientVisits(chart.patientInfo.patientNumber, chart.patientInfo.patientName)
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

  // The previous visit's per-tooth values — shown as muted hints in
  // empty grid cells and as "Last visit" tooltips, so the person probing
  // can compare without opening the old chart. Values are NEVER
  // prefilled: a stale probing depth must not save as if measured today.
  const [priorTooth, setPriorTooth] = React.useState<Record<number, ToothData> | null>(null);
  // Teeth already gone (missing or extracted) at the previous visit —
  // startNewVisit pre-marks them missing so nobody re-enters them, and
  // the grid badges them as carried forward rather than found today.
  const [priorGone, setPriorGone] = React.useState<Set<number> | null>(null);
  React.useEffect(() => {
    if (!cloud.enabled || visits.length === 0) { setPriorTooth(null); setPriorGone(null); return; }
    // `visits` is sorted newest-first. For a saved visit, "prior" is the
    // one before it; for an unsaved new visit (id not in the list yet),
    // it's the patient's latest saved visit.
    const idx = visits.findIndex((v) => v.id === chart.cloudChartId);
    const prior = idx >= 0 ? visits[idx + 1] : visits[0];
    if (!prior) { setPriorTooth(null); setPriorGone(null); return; }
    let cancelled = false;
    cloud.fetchChart(prior.id)
      .then((snap) => {
        if (cancelled) return;
        const byTriadan: Record<number, ToothData> = {};
        for (const tooth of snap.toothData ?? []) byTriadan[tooth.triadan] = tooth;
        setPriorTooth(byTriadan);
        const gone = new Set<number>();
        for (const [key, mark] of Object.entries(snap.preMarks ?? {})) {
          if (mark === 'missing') gone.add(Number(key));
        }
        for (const [key, mark] of Object.entries(snap.postMarks ?? {})) {
          if (mark === 'extracted') gone.add(Number(key));
        }
        setPriorGone(gone);
      })
      .catch(() => { if (!cancelled) { setPriorTooth(null); setPriorGone(null); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud.enabled, visits, chart.cloudChartId]);

  const switchVisit = (id: string) => {
    if (id === chart.cloudChartId) return;
    cloud.openChart(id).catch((err) => {
      toast(`Couldn’t open that visit. ${friendlyError(err)}`, { kind: 'error' });
    });
  };

  // Start a fresh visit for a patient, carrying identity plus the teeth
  // already gone (missing ∪ extracted) from their most recent saved
  // visit. Shared by the library's "+ Visit" and the saved-chart
  // banner's "+ New visit".
  const startVisitFromChart = async (latestChartId: string): Promise<boolean> => {
    // Starting a visit replaces the open chart — never silently.
    if (!(await cloud.confirmDiscardIfDirty('Start a new visit'))) return false;
    const snap = await cloud.fetchChart(latestChartId);
    // Already seen today? Offer that visit rather than a second one —
    // same-day restarts were the main source of duplicate records.
    try {
      const sp = snap.species.startsWith('canine') ? 'canine' : 'feline';
      const visits = await cloud.listPatientVisits(snap.patientInfo.patientNumber ?? '', snap.patientInfo.patientName ?? '');
      const todays = visits.find((v) => v.chart_date === localDateISO() && v.species === sp);
      if (todays) {
        const who = snap.patientInfo.patientName?.trim() || 'This patient';
        const openIt = await confirmDialog({
          title: `${who} already has a visit today`,
          message: 'Open today’s visit instead of starting a second one?',
          confirmLabel: 'Open today’s visit',
          cancelLabel: 'Start a second visit',
        });
        if (openIt) {
          // Unsaved changes were already confirmed above.
          await cloud.openChart(todays.id, { skipConfirm: true });
          goToSection('patient');
          return true;
        }
      }
      // Answered here — don't ask again on the new visit's first save.
      cloud.skipNextDuplicateCheck();
    } catch {
      /* couldn't check — the first-save check will ask instead */
    }
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
    goToSection('patient');
    const name = snap.patientInfo.patientName?.trim();
    toast(
      `New visit${name ? ` for ${name}` : ''} started${gone.size ? ` — ${gone.size} missing/extracted ${gone.size === 1 ? 'tooth' : 'teeth'} carried forward` : ''}.`,
      { kind: 'success' }
    );
    return true;
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

  // Two tabs share the same localStorage working copy, last-write-wins.
  // A `storage` event for any chart key means another tab of this app is
  // editing too — warn once so nobody loses work to a silent overwrite.
  const [otherTabWarning, setOtherTabWarning] = React.useState(false);
  React.useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key.startsWith('vibing-dental.chart.') && e.newValue !== null) {
        setOtherTabWarning(true);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Don't let a tab close/refresh slip away while a cloud save is in
  // flight or failing — the chart would exist only in this machine's
  // localStorage without the user ever deciding that.
  React.useEffect(() => {
    // Warn on close/refresh while anything isn't in the cloud yet: a save
    // in flight, a failed save, or plain unsaved edits (they'd survive on
    // this device, but not on another computer or after signing out).
    if (cloud.status !== 'saving' && cloud.status !== 'error' && !cloud.dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [cloud.status, cloud.dirty]);

  // Refs into the diagram views — we need their live SVG elements at
  // preview time so we can rasterize them with the active style's
  // comment colors.
  const preDiagramRef  = React.useRef<DiagramViewHandle>(null);
  const postDiagramRef = React.useRef<DiagramViewHandle>(null);

  // PDF preview modal state.
  const [previewSnapshot, setPreviewSnapshot] = React.useState<ChartSnapshot | null>(null);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  // Owner report — the chart translated for the pet's owner.
  /** Which tab the Documents dialog opens on (undefined = last used). */
  const [docsTab, setDocsTab] = React.useState<'chart' | 'owner' | undefined>(undefined);

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
    // Every handler below uses a functional update: one AI reply can carry
    // several edits, and building each from this render's snapshot would
    // make every edit overwrite the one before it.
    setPostMark: (triadan, mark) => {
      // Keep the manual UI's invariant: pre-missing teeth aren't post marks.
      if (mark !== null && chart.preToothMarks[triadan] === 'missing') return;
      chart.setPostToothMarksDirect((m: ToothMarks) => {
        const next = { ...m };
        if (mark === null) delete next[triadan];
        else next[triadan] = mark;
        return next;
      });
    },
    setToothField: (triadan: number, field: DentalField, value: string) => {
      chart.setToothDataDirectly((rows: ToothData[]) =>
        rows.map((t) => (t.triadan === triadan ? { ...t, [field]: value } : t))
      );
    },
    addComment: (diagram, triadan, text) => {
      const setter = diagram === 'pre' ? chart.setPreDiagramComments : chart.setPostDiagramComments;
      setter((prev: DiagramComment[]) => {
        // One note per tooth, like the diagram's own comment tool: add to
        // the tooth's existing note (not a mirrored grid card) instead of
        // stacking a second card. Dropping the size lets it re-fit.
        const existing = triadan != null
          ? prev.find((c) => c.anchorTriadan === triadan && !isGridComment(c))
          : undefined;
        if (existing) {
          if (existing.text.includes(text)) return prev;
          const { width: _w, height: _h, ...rest } = existing;
          const merged = existing.text.trim() ? `${existing.text.trim()}\n${text}` : text;
          return prev.map((c) => (c === existing ? { ...rest, text: merged } : c));
        }
        const id = `ai${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        return [...prev, { id, text, anchorTriadan: triadan }];
      });
    },
    removeComment: (diagram, triadan, text) => {
      const setter = diagram === 'pre' ? chart.setPreDiagramComments : chart.setPostDiagramComments;
      setter((prev: DiagramComment[]) => {
        const target = text.trim();
        const note = prev.find((c) => (c.anchorTriadan ?? null) === triadan && !isGridComment(c) && c.text.includes(target));
        if (!note) return prev;
        // Notes merge findings one per line; drop that line, or the text
        // itself if it shares a line. An emptied note is deleted.
        const lines = note.text.split('\n');
        const kept = lines.filter((l) => l.trim() !== target);
        const next = (kept.length < lines.length ? kept.join('\n') : note.text.replace(target, '')).replace(/[ \t]{2,}/g, ' ').trim();
        if (!next) return prev.filter((c) => c !== note);
        const { width: _w, height: _h, ...keep } = note;
        return prev.map((c) => (c === note ? { ...keep, text: next } : c));
      });
    },
    setExamFinding: (area, status, comment) => {
      chart.handleExamStatusChange(area, status as ExamFinding);
      if (comment !== undefined) chart.handleExamCommentChange(area, comment);
    },
    setNerveBlock: (site, mL) => {
      chart.handleNerveBlockChange(site as NerveBlockSite, mL);
    },
    setAnestheticDrug: (drug, concentration) => {
      chart.setNerveBlockDrugs((prev) => {
        const named = prev.filter((d) => d.name.trim());
        const i = named.findIndex((d) => d.name.trim().toLowerCase() === drug.toLowerCase());
        const strength = concentration ?? (i >= 0 ? named[i].concentration : usualConcentration(drug));
        if (i < 0) return [...named, { name: drug, concentration: strength }];
        return named.map((d, j) => (j === i ? { ...d, concentration: strength } : d));
      });
    },
    setPatientField: (field, value) => {
      chart.handlePatientInfoChange(field as keyof PatientInfo, value);
    },
    appendTreatmentReport: (text) => {
      chart.setPatientInfo((prev: PatientInfo) => {
        const existing = prev.treatmentReport ?? '';
        return { ...prev, treatmentReport: existing ? `${existing}\n${text}` : text };
      });
    },
    appendRadiographicFindings: (text) => {
      chart.setPatientInfo((prev: PatientInfo) => {
        const existing = prev.radiographicFindings ?? '';
        return { ...prev, radiographicFindings: existing ? `${existing}\n${text}` : text };
      });
    },
  };

  const handleOpenPreview = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    openDocuments();
  };

  /** Capture the chart (live diagram SVGs + state) and open the Documents
   *  dialog, optionally on a given tab. */
  // Fetch the PDF / owner-report dialog's code once the chart is up. Opened
  // lazily, a deploy while this tab was open left it asking for renamed
  // files: the recovery reload flashed the screen and swallowed the click
  // (open the owner report → flash → nothing → click again).
  React.useEffect(() => whenIdle(() => DocumentsModal.preload()), []);

  const openDocuments = (tab?: 'chart' | 'owner') => {
    setDocsTab(tab);
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
        includeGrid: !mirrorToDiagnosis || pdfIncludeGrid,
        hiddenBlocks: prefs.hiddenBlocks,
        imagesChartId:
          pdfIncludeImages && cloud.enabled && !trial ? chart.cloudChartId : undefined,
        pdfExcludedImages: chart.pdfExcludedImages,
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
      toast('Couldn’t build the preview yet — the diagrams are still loading. Try again in a moment.', { kind: 'error' });
      console.error(error);
    }
  };

  // Read-only lock for a section's editable content. Applied per block
  // (not around the whole section) so reference-only content — the codes
  // panel beside each diagram — stays scrollable and searchable while a
  // saved chart is locked. Styling + pointer blocking come from
  // .sidebar-layout__fieldset:disabled.
  const lock = (node: React.ReactNode) => (
    <div
      className={readOnly ? 'lock-wrap lock-wrap--locked' : 'lock-wrap'}
      title={readOnly ? 'View only — choose Edit chart to make changes' : undefined}
    >
      <fieldset className="sidebar-layout__fieldset" disabled={readOnly}>
        {node}
      </fieldset>
    </div>
  );

  // Section list — rendered by whichever layout the active board picks.
  const sections: ChartSection[] = [
    {
      id: 'patient',
      label: 'Patient',
      content: lock(
        <PatientForm
          patientInfo={chart.patientInfo}
          species={chart.species}
          onPatientInfoChange={chart.handlePatientInfoChange}
          onSpeciesChange={chart.handleSpeciesChange}
          hideRecheck={prefs.hideRecheck}
          onCustomize={() => setChartSettingsOpen('patient')}
        />
      ),
    },
    {
      id: 'exam',
      label: 'Exam',
      content: lock(
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
      content: lock(
        <AnesthesiaForm
          nerveBlocks={chart.patientInfo.nerveBlocks}
          onNerveBlockChange={chart.handleNerveBlockChange}
          onDrugsChange={chart.setNerveBlockDrugs}
          logo={chart.logo}
          hiddenBlocks={prefs.hiddenBlocks}
          usualDrug={prefs.usualDrug}
          onCustomize={() => setChartSettingsOpen('anesthesia')}
          customBlockDefs={prefs.customBlocks}
          customFieldDefs={prefs.customFields}
          customValues={chart.patientInfo.customAnesthesia}
          onCustomValuesChange={(next) => chart.setPatientInfo((prev: PatientInfo) => ({ ...prev, customAnesthesia: next }))}
        />
      ),
    },
    {
      id: 'charting',
      label: 'Charting',
      // Unlike the diagrams (whose mounted SVGs the PDF export needs),
      // the grid keeps no cross-section refs — so it only mounts while
      // its section is visible. react-data-grid runs measurement layout
      // effects that can storm ("Maximum update depth exceeded") when
      // the whole row set is swapped inside a display:none panel, which
      // is exactly what starting a new visit from a saved chart does.
      content: (
        activeSection === 'charting' ? (
          chartingView === 'tooth' ? (
            <ToothChartView
              readOnly={readOnly}
              species={chart.species}
              toothData={chart.toothData}
              setToothData={chart.setToothDataDirectly}
              preMarks={chart.preToothMarks}
              onToggleMissing={toggleMissing}
              effectivePostMarks={chart.effectivePostMarks}
              setPostMarks={chart.setPostToothMarksDirect}
              preComments={chart.preDiagramComments}
              setPreComments={chart.setPreDiagramComments}
              postComments={chart.postDiagramComments}
              setPostComments={chart.setPostDiagramComments}
              plannedExtractions={chart.plannedExtractions}
              setPlannedExtraction={chart.setPlannedExtraction}
              highlightTriadan={aiHighlightTriadan}
              headerAccessory={chartingHeaderAccessory}
              hiddenColumns={prefs.hiddenColumns}
              pocketMode={prefs.pocketMode}
            />
          ) : (
          <DentalGrid
            headerAccessory={chartingHeaderAccessory}
            readOnly={readOnly}
            toothData={chart.toothData}
            onToothDataChange={chart.setToothDataDirectly}
            highlightTriadan={aiHighlightTriadan}
            // The grid's "Missing" toggle writes the same pre-surgery marks
            // the Diagnosis diagram edits, so marking a tooth missing in
            // either place crosses out the grid row AND fills the tooth on
            // the diagram (and locks it in the Procedure diagram).
            toothMarks={chart.preToothMarks}
            onToggleMissing={toggleMissing}
            priorToothData={priorTooth}
            priorGoneTeeth={priorGone}
            hiddenColumns={prefs.hiddenColumns}
            pocketMode={prefs.pocketMode}
            species={chart.species}
            spaceMovesDown={prefs.spaceMovesDown}
            scoreTapMoves={prefs.scoreTapMoves}
          />
          )
        ) : null
      ),
    },
    {
      id: 'diagnosis',
      label: 'Diagnosis',
      content: (
        <div className="diagram-with-codes">
          <div className="diagram-with-codes__diagram">
                        <DiagramView
              // Remount per chart: undo history must not carry another
              // patient's marks into this one.
              key={`pre-${chart.chartSession}`}
              ref={preDiagramRef}
              readOnly={readOnly}
              title="Diagnosis"
              onCustomize={() => setChartSettingsOpen('diagnosis')}
              species={chart.species}
              toothMarks={chart.preToothMarks}
              onToothMarksChange={chart.setPreToothMarks}
              comments={chart.preDiagramComments}
              onCommentsChange={chart.setPreDiagramComments}
              strokes={chart.preDiagramStrokes}
              onStrokesChange={chart.setPreDiagramStrokes}
              markMode="missing-only"
              defaultTool="comment"
              highlightTriadan={aiHighlightTriadan}
            />
          </div>
          {/* Reference only — deliberately outside the lock so codes stay
              browsable on read-only charts. */}
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
              key={`post-${chart.chartSession}`}
              ref={postDiagramRef}
              readOnly={readOnly}
              title="Procedure"
              species={chart.species}
              toothMarks={chart.effectivePostMarks}
              onToothMarksChange={chart.handlePostMarksChange}
              comments={chart.postDiagramComments}
              onCommentsChange={chart.setPostDiagramComments}
              strokes={chart.postDiagramStrokes}
              onStrokesChange={chart.setPostDiagramStrokes}
              lockedTriadans={chart.lockedPostTriadans}
              markMode="extracted-only"
              highlightTriadan={aiHighlightTriadan}
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
        <>
        {lock(
          <div className="patient-form radiographic-findings">
            <label className="patient-form__label">
              <span className="patient-form__section-title radiographic-findings__title">Radiographic findings</span>
              <CodeField
                multiline
                className="patient-form__textarea radiographic-findings__text"
                placeholder="e.g. 108: vertical bone loss distal root, furcation exposure. 307: type 2 tooth resorption."
                value={chart.patientInfo.radiographicFindings ?? ''}
                onChange={(value) => chart.handlePatientInfoChange('radiographicFindings', value)}
              />
              <span className="patient-form__hint">Prints in the PDF above the treatment report.</span>
            </label>
          </div>
        )}
        <ImagingSection
          readOnly={readOnly}
          chartId={chart.cloudChartId}
          cloudActive={cloud.enabled}
          practiceId={profile.practiceId}
          maxImages={profile.maxImages}
          dicomEnabled={profile.dicomEnabled}
          imageRoles={chart.imageRoles}
          onImageRoleChange={ownerReportOn ? chart.setImageRole : undefined}
          includeInPdf={pdfIncludeImages}
          onCustomize={() => setChartSettingsOpen('images')}
          pdfExcludedImages={chart.pdfExcludedImages}
          onImageInPdfChange={chart.setImageInPdf}
        />
        </>
      ),
    },
    {
      id: 'treatment',
      label: 'Treatment report',
      content: lock(
        <SurgeryReportForm
          value={chart.patientInfo.treatmentReport}
          onChange={(value) => chart.handlePatientInfoChange('treatmentReport', value)}
          cloudActive={cloud.enabled}
          practiceId={profile.practiceId}
        />
      ),
    },
    // Feature-flagged per practice (admin panel), off by default.
    ...(ownerReportOn
      ? [{
          id: 'owner-report',
          label: 'Owner Report',
          content: (
            <OwnerReportSection
              readOnly={readOnly}
              snapshot={chart.getSnapshot()}
              overrides={chart.ownerReport}
              onOverrideChange={chart.setOwnerReportOverride}
              onPreview={() => openDocuments('owner')}
              context={{ config: profile.ownerReportConfig, practiceName: profile.practiceName, doctorName: profile.doctorName }}
              aiEnabled={profile.aiEnabled && !trial && cloud.enabled}
              onCustomize={cloud.enabled && !trial ? () => setReportCustomizeOpen(true) : undefined}
            />
          ),
        }]
      : []),
  ];

  // Editing a saved visit (unlocked): the topbar's action row turns
  // amber and carries the way out — Revert (back to the version that was
  // opened) and Done editing (save, then re-lock).
  const editingSavedVisit = cloud.enabled && chart.openedExisting && !currentVisit && !readOnly;
  const revertUnlockedChanges = async () => {
    const raw = (() => { try { return window.sessionStorage.getItem(`chart.unlockSnapshot.${chart.cloudChartId}`); } catch { return null; } })();
    if (!raw) return;
    if (!(await confirmDialog({
      title: 'Revert your changes?',
      message: 'This chart goes back to how it was when you chose Edit chart, and that version is saved.',
      confirmLabel: 'Revert changes',
      danger: true,
    }))) return;
    chart.applySnapshot(JSON.parse(raw), chart.cloudChartId);
    toast('Changes reverted.', { kind: 'success' });
  };
  const doneEditing = async () => {
    if (cloud.dirty) {
      try { await cloud.saveNow(); } catch { return; /* the status pill shows the error */ }
    }
    try { window.sessionStorage.removeItem(`chart.unlockSnapshot.${chart.cloudChartId}`); } catch { /* ignore */ }
    setEditUnlocked(false);
  };

  return (
    <div className="entry-grid-container" ref={containerRef}>
      {/* Keyboard users skip the topbar controls straight to the chart. */}
      <a className="skip-link" href="#chart-form">
        Skip to the chart
      </a>
      <header className="entry-grid__topbar" ref={topbarRef}>
        <div className="entry-grid__topbar-lead">
          {/* Uploaded practice logo leads the identity block (decorative —
              the practice name is right beside it). */}
          {profile.logoUrl && (
            <img src={profile.logoUrl} alt="" className="entry-grid__topbar-logo" />
          )}
          <div className="entry-grid__topbar-identity">
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
                        /* Visit history switcher — a pill with a history
                           icon so it reads as a control, not a date. */
                        <span
                          className="entry-grid__visit-switch"
                          title={`Visit history — ${opts.length} visits. Pick one to view it.`}
                        >
                          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                            <path
                              d="M8 2.5a5.5 5.5 0 1 1-5.24 3.83l-1.2.9A.5.5 0 0 1 .5 6.9V3.4a.5.5 0 0 1 .8-.4l2.9 2.17a.5.5 0 0 1-.06.84l-.9.53A4.3 4.3 0 1 0 8 3.7zm-.5 2.2a.6.6 0 0 1 1.2 0v2.9l2.1 1.26a.6.6 0 0 1-.62 1.03L7.8 8.5a.6.6 0 0 1-.3-.52z"
                              fill="currentColor"
                            />
                          </svg>
                          <select
                            className="entry-grid__visit-select"
                            value={chart.cloudChartId}
                            onChange={(e) => switchVisit(e.target.value)}
                            aria-label={`Visit history — switch between this patient's ${opts.length} visits`}
                          >
                            {opts.map((v, i) => (
                              <option key={v.id} value={v.id}>
                                {(v.chart_date || 'Undated visit') + (i === 0 ? ' · latest' : ' · earlier')}
                              </option>
                            ))}
                          </select>
                        </span>
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
                No patient yet — add one in the Patient section
              </span>
            )}
          </div>
          </div>
        </div>
        <div className={`entry-grid__topbar-actions${editingSavedVisit ? ' entry-grid__topbar-actions--editing' : ''}`}>
          {editingSavedVisit && (
            <span className="topbar-editing" title="Editing a saved visit — changes save automatically">
              <span className="topbar-label-long">Editing saved visit</span>
              <span className="topbar-label-short">Editing</span>
            </span>
          )}
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
          {/* One save-status pill, always telling the truth: what's
              happening now, or when this chart last reached the cloud.
              ⌘S / Ctrl+S saves immediately. */}
          {cloud.enabled ? (() => {
            if (cloud.status === 'saving') {
              return <span className="save-status save-status--saving" aria-hidden="true">Saving…</span>;
            }
            if (cloud.status === 'error') {
              return (
                <span className="save-status-error-wrap">
                  <button
                    type="button"
                    className="save-status save-status--error"
                    onClick={attemptSave}
                    title={cloud.saveError || 'Retry saving this chart'}
                  >
                    Not saved — retry
                  </button>
                  {cloud.saveError && <span className="save-status__detail">{cloud.saveError}</span>}
                </span>
              );
            }
            if (saveHint) {
              return (
                <span className="save-status-error-wrap" role="alert">
                  <span className="save-status save-status--error">Not saved</span>
                  <span className="save-status__detail">{saveHint}</span>
                </span>
              );
            }
            if (readOnly) {
              return <span className="save-status save-status--muted" title="Saved visits open view-only — choose Edit chart to make changes">View only</span>;
            }
            if (cloud.dirty && !cloud.online) {
              return <span className="save-status save-status--manual" title="Changes are kept on this device and save when you're back online">Offline — saved on this device</span>;
            }
            if (cloud.dirty && !chart.patientInfo.patientName.trim()) {
              return <span className="save-status save-status--manual" title="Charts save once the patient has a name">Add a patient name to save</span>;
            }
            if (cloud.awaitingClinical) {
              // Filled in ahead of time: autosave starts with charting;
              // Save puts it in the cloud now (e.g. to open elsewhere).
              return (
                <button
                  type="button"
                  className="save-status save-status--manual"
                  onClick={attemptSave}
                  title="Kept on this device for now — it saves automatically once you start charting. Save now to open it on another device."
                >
                  Save
                </button>
              );
            }
            if (cloud.dirty) {
              return <span className="save-status save-status--manual" title="Saving automatically…">Unsaved changes</span>;
            }
            if (cloud.lastSavedAt) {
              return (
                <span className="save-status save-status--saved" title={`Saved to the cloud ${new Date(cloud.lastSavedAt).toLocaleString()}`}>
                  Saved · {formatSavedAt(cloud.lastSavedAt)}
                </span>
              );
            }
            return null;
          })() : trial ? (
            <span className="save-status save-status--muted" title="Trial charts stay in this browser. Create a free account to save to the cloud.">
              On this device only
            </span>
          ) : null}
          {cloud.enabled && (
            <button
              type="button"
              className="chart-menu__trigger topbar-library-btn"
              data-tour="library"
              aria-label="My charts"
              onClick={openLibrary}
              aria-haspopup="dialog"
            >
              <span className="topbar-label-long">My charts</span>
              <span className="topbar-label-short">Charts</span>
            </button>
          )}
          {/* AI autofill (every signed-in plan during the beta); the keys live server-side
              behind JWT-gated edge functions, so trial (no account) and
              Basic practices don't get it. */}
          {profile.aiEnabled && !trial && (
            <VoiceInputButton
              context={aiContext}
              handlers={aiHandlers}
              onActivity={handleAiActivity}
              activeSection={activeSection}
              sessionKey={String(chart.chartSession)}
              locked={readOnly}
              onOpenFeedback={canFeedback ? (transcript) => setFeedback({ transcript }) : undefined}
            />
          )}
          <span data-tour="settings" className="topbar-tour-anchor">
          <ChartMenu
            onOpenWalkthrough={() => setWalkthroughOpen(true)}
            onGoHome={onGoHome}
            onOpenAdmin={isAdmin && !trial ? () => setAdminOpen(true) : undefined}
            onOpenFeedback={canFeedback ? () => setFeedback({}) : undefined}
            onOpenChartSettings={() => setChartSettingsOpen('all')}
            onOpenWhatsNew={() => setWhatsNewOpen(true)}
            cloud={
              cloud.enabled
                ? {
                    onPracticeSettings: () => setPracticeSettingsOpen(true),
                    onOpenReminders: () => setRemindersOpen(true),
                    onOpenAccount: () => setAccountOpen(true),
                    onSignOut: () => {
                      cloud.signOut().catch((err) => {
                        toast(`Couldn’t sign out. ${friendlyError(err)}`, { kind: 'error' });
                      });
                    },
                  }
                : undefined
            }
          />
          </span>
          {editingSavedVisit && (
            <>
              {unlockSnapshotChanged && (
                <button
                  type="button"
                  className="diagram-view__action topbar-editing__revert"
                  onClick={revertUnlockedChanges}
                  title="Put this chart back the way it was when you chose Edit chart"
                >
                  Revert
                </button>
              )}
              <button
                type="button"
                className="entry-grid__button entry-grid__button--topbar"
                onClick={doneEditing}
              >
                Done editing
              </button>
            </>
          )}
        </div>
      </header>

      {otherTabWarning && (
        <div className="chart-lock-banner chart-lock-banner--warning" role="alert">
          <span className="chart-lock-banner__text">
            This chart is open in another tab or window. Both tabs edit the
            same working copy — close one to avoid overwriting your changes.
          </span>
          <button
            type="button"
            className="entry-grid__button entry-grid__button--topbar"
            onClick={() => setOtherTabWarning(false)}
          >
            Got it
          </button>
        </div>
      )}

      {/* Saved-visit banner: opens view-only so history isn't changed by
          accident; Edit chart unlocks (changes then autosave), Revert
          restores the version that was opened, Done editing re-locks. */}
      {cloud.enabled && chart.openedExisting && !currentVisit && readOnly && (
        <div className="chart-lock-banner" role="status">
          {readOnly ? (
            <>
              <span className="chart-lock-banner__text">
                <strong>Viewing a saved visit</strong>{chart.patientInfo.date ? ` from ${chart.patientInfo.date}` : ''} — it’s view-only so it isn’t changed by accident.
              </span>
              <button
                type="button"
                className="diagram-view__action"
                onClick={() => {
                  // Carry forward from the patient's LATEST visit — this
                  // banner also shows when viewing an older one.
                  const latest = visits[0]?.id ?? chart.cloudChartId;
                  startVisitFromChart(latest).catch((err) => {
                    toast(`Couldn’t start a new visit. ${friendlyError(err)}`, { kind: 'error' });
                  });
                }}
                title="Start a fresh dated visit for this patient — identity and already-gone teeth carry over"
              >
                + New visit
              </button>
              <button
                type="button"
                className="diagram-view__action"
                onClick={() => setHistoryFor({ id: chart.cloudChartId })}
                title="Every saved version of this chart — who saved it and when"
              >
                History
              </button>
              <button
                type="button"
                className="entry-grid__button entry-grid__button--topbar"
                onClick={() => {
                  try { window.sessionStorage.setItem(`chart.unlockSnapshot.${chart.cloudChartId}`, JSON.stringify(chart.getSnapshot())); } catch { /* too big / private mode */ }
                  setEditUnlocked(true);
                }}
              >
                Edit chart
              </button>
            </>
          ) : null}
        </div>
      )}
      {reportCustomizeOpen && (
        <OwnerReportCustomize
          onClose={() => setReportCustomizeOpen(false)}
          config={profile.ownerReportConfig}
          onSave={profile.saveOwnerReportConfig}
          branding={{ practiceName: profile.practiceName, doctorName: profile.doctorName, logoUrl: profile.logoUrl }}
        />
      )}

      {whatsNewOpen && <WhatsNewModal onClose={closeWhatsNew} />}

      {historyFor && (() => {
        // Restore only on the open, editable chart; from My charts it's
        // view-only with a shortcut to open the visit.
        const isOpenChart = historyFor.id === chart.cloudChartId;
        const canRestore = isOpenChart && !readOnly;
        return (
          <ChartHistoryModal
            chartId={historyFor.id}
            label={historyFor.label}
            onClose={() => setHistoryFor(null)}
            onRestore={canRestore ? (snap) => cloud.restoreRevision(historyFor.id, snap) : undefined}
            restoreHint={isOpenChart ? undefined : 'Open this visit to restore an earlier version.'}
            onOpenChart={historyFor.fromLibrary && !isOpenChart ? () => {
              const id = historyFor.id;
              setHistoryFor(null);
              cloud.openChart(id).then((ok) => { if (ok) closeLibrary(); }).catch((err) => {
                toast(`Couldn’t open that visit. ${friendlyError(err)}`, { kind: 'error' });
              });
            } : undefined}
          />
        );
      })()}

      {chartSettingsOpen && (
        <ChartSettingsModal
          onClose={() => setChartSettingsOpen(false)}
          section={chartSettingsOpen && chartSettingsOpen !== 'all' ? chartSettingsOpen : undefined}
          prefs={prefs}
          followsAccount={chartSettings.followsAccount}
          onChange={setPref}
        />
      )}

      {feedback && (
        <FeedbackModal
          onClose={() => setFeedback(null)}
          section={activeSection}
          transcript={feedback.transcript}
        />
      )}

      {libraryOpen && (
        <ChartLibrary
          listCharts={cloud.listCharts}
          onOpen={cloud.openChart}
          onDelete={cloud.deleteChart}
          onNewVisit={async (latestChartId) => {
            try {
              // Cancelled at the unsaved-changes prompt → stay in the library.
              if (await startVisitFromChart(latestChartId)) closeLibrary();
            } catch (err) {
              toast(`Couldn’t start a new visit. ${friendlyError(err)}`, { kind: 'error' });
            }
          }}
          onSendReminder={(c) => setReminderTarget(c)}
          onOpenHistory={(id, label) => setHistoryFor({ id, label, fromLibrary: true })}
          onClearRecalls={async (chartIds) => {
            await cloud.clearRecalls(chartIds);
            // If the working chart is one of them, mirror the clear
            // locally — a later save must not resurrect the date.
            if (chartIds.includes(chart.cloudChartId)) {
              chart.handlePatientInfoChange('recallDate', '');
            }
          }}
          onNewPatient={async () => {
            // Only ask when something would actually be lost.
            if (!(await cloud.confirmDiscardIfDirty('Start a new patient'))) return;
            chart.resetChart();
          }}
          onLoadPdf={async (file) => {
            if (!(await cloud.confirmDiscardIfDirty('Import this PDF'))) return;
            await chart.loadFromPdf(file);
          }}
          onClose={closeLibrary}
        />
      )}

      <form
        id="chart-form"
        className="entry-grid-form"
        // Focus target for the skip link — without it the anchor jump
        // scrolls but keyboard focus stays on the link.
        tabIndex={-1}
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
          onActiveChange={goToSection}
        />
      </form>

      <button
        type="submit"
        form="chart-form"
        className="fab-download"
        aria-haspopup="dialog"
        aria-label={ownerReportOn ? 'Preview and download the clinical chart and owner report' : 'Preview and download the chart PDF'}
      >
        <span aria-hidden="true">⤓</span> {ownerReportOn ? 'Download PDFs' : 'Preview PDF'}
      </button>

      {previewSnapshot && (
        <React.Suspense fallback={null}>
          <DocumentsModal
            open={previewOpen}
            onClose={() => setPreviewOpen(false)}
            initialTab={docsTab}
            chartSnapshot={previewSnapshot}
            ownerReport={ownerReportOn ? {
              snapshot: chart.getSnapshot(),
              branding: {
                practiceName: profile.practiceName,
                doctorName: profile.doctorName,
                logoUrl: profile.logoUrl,
              },
              imageRoles: chart.imageRoles,
              chartId: chart.cloudChartId,
              practiceId: profile.practiceId,
              cloudActive: cloud.enabled,
              config: profile.ownerReportConfig,
              onEditWording: () => {
                setPreviewOpen(false);
                goToSection('owner-report');
              },
            } : undefined}
          />
        </React.Suspense>
      )}

      <WalkthroughModal
        open={walkthroughOpen}
        onClose={() => setWalkthroughOpen(false)}
        aiEnabled={profile.aiEnabled && !trial}
        onNavigate={goToSection}
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

      {setup.need && (
        <FinishSetupModal need={setup.need} profile={profile} onDone={setup.done} />
      )}

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

      {/* Compact feedback link — the email it opens pre-fills the useful
          details (what happened, section, browser). */}
      <footer className="entry-grid__footnote">
        <span className="entry-grid__footnote-lead">
          Found a bug or have an idea? <a href={FEEDBACK_MAILTO}>Send feedback</a>
        </span>
      </footer>
    </div>
  );
};

export default EntryGrid;
