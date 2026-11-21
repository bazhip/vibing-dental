import { VisitTypeChooser } from './components/VisitTypeChooser';
import { visitTypeOf, type VisitType } from './utils/visitTypes';
import { useConsultationLibrary } from './hooks/useConsultationLibrary';
import { CONSULTATION_FIELDS, isUnmodifiedStandardDischarge, consultationLayoutFor, dischargeLayoutFor, isCustomConsultationField, isCustomDischargeField } from './utils/consultationTemplates';
import { ConsultationTemplatesDialog } from './components/ConsultationTemplatesDialog';
import { Icon } from './ios/icons';
import { useTeam } from './hooks/useTeam';
import { RefineTextContext } from './components/RefineTextAction';
import type { HistoryVisit } from './components/PatientRecordHistory';
import { ClinicalDictationButton } from './components/ClinicalDictationButton';
import { appendClinicalDictationSource } from './utils/clinicalDictationSources';
import { previousMedicationVisit, sameMedicationPatient, type PreviousMedicationList } from './utils/consultationMedicationHistory';
import { clinicalDictationLayout, allowedClinicalFields } from './utils/clinicalDictationAi';
import { LocalizedError } from './utils/apiErrors';
import type { ClinicalDictationKind, ClinicalDictationSource } from './types';
import { appendRadiologyDictation, radiologyRecordedText } from './utils/radiologyReportState';
import { VisitDocumentationSection } from './components/VisitDocumentationSection';
import { RadiologyReportSection } from './components/RadiologyReportSection';
import { isGeneratedPatientNumber } from './utils/patientIds';
import { ImageHistory } from './components/ImageHistory';
import { imageToothLabel } from './utils/imageTeeth';
import React from 'react';
import { createPortal } from 'react-dom';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import i18n from './i18n';
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
import { VoiceInputButton, actionFocus, voiceReviewSection } from './components/VoiceInputButton';
import { App as CapacitorApp } from '@capacitor/app';
import { FeedbackModal } from './components/FeedbackModal';
import { ChartSettingsModal, type SettingsSection } from './components/ChartSettingsModal';
import { WhatsNewModal } from './components/WhatsNewModal';
import { ChartHistoryModal } from './components/ChartHistoryModal';
import { WHATS_NEW, shouldShowWhatsNew } from './constants/whatsNew';
import { OwnerReportCustomize } from './components/OwnerReportCustomize';
import { useChartSettings } from './hooks/useChartSettings';
import { useAppLanguage } from './i18n/useAppLanguage';
import { formatDate, formatDateTime, formatMonthDay, formatTime } from './i18n/format';
import type { ChartPrefs } from './utils/chartSettings';
import { useChartState } from './hooks/useChartState';
import { ensureChartSaved } from './utils/ensureSaved';
import { useCloudSync } from './hooks/useCloudSync';
import { useProfile } from './hooks/useProfile';
import { TOOTH_DIAGRAMS } from './constants/toothShapes';
import { syncGridComments, isGridComment } from './utils/gridComments';
import { toast, statusToast, friendlyError, friendlyDetail, confirmDialog, chooseDialog, presentSheet } from './components/ui/dialogs';
import { PracticeSettingsModal } from './components/PracticeSettingsModal';
import { RemindersModal } from './components/RemindersModal';
import { AccountModal } from './components/AccountModal';
import { FinishSetupModal, useFinishSetup } from './components/FinishSetupModal';
import { WalkthroughModal } from './components/WalkthroughModal';
import { readString, writeString } from './utils/storage';
import { lazyWithReload, whenIdle } from './utils/lazyWithReload';
import { useHashRoute, useHashRouteGuard } from './hooks/useHashRoute';
import { useEzyvetHandover } from './hooks/useEzyvetHandover';
import { takePendingPatient } from './utils/pims/extensionBridge';
import { supabase } from './utils/supabaseClient';
import { subscribeToChartChanges } from './utils/chartChangeNotifications';
import { ChartLibrary } from './components/ChartLibrary';
import { AnimalTabs } from './components/AnimalTabs';
import { useAnimalTabs } from './hooks/useAnimalTabs';
import type { ChartLibraryViewState } from './components/chartLibraryData';
import { OwnerReportSection } from './components/OwnerReportSection';
import { ToothChartView } from './components/ToothChartView';
import { AdminPanel, useIsAdmin } from './components/AdminPanel';
import { ReminderModal } from './components/ReminderModal';
import type { CloudChartMeta } from './hooks/useCloudSync';
import type { ChartContext, ChartHandlers, AiAction } from './utils/aiAutofill';
import type { AppLanguage } from './i18n/config';
import { DiagramComment, PatientInfo, NerveBlockSite, usualConcentration, withDrugUnit, ExamFinding, DentalField, ToothData, ToothMarks } from './types';
import { setCustomExamValue } from './utils/customExam';
import { legacyExamLayout } from './utils/examLayout';
import { useExamLayout } from './hooks/useExamLayout';
import { ExamLayoutDialog } from './components/ExamLayoutDialog';
import { localDateISO } from './utils/localDate';
import { visitsForPatient } from './utils/currentVisit';
import { shouldOpenLibraryOnArrival } from './utils/arrival';
import { isNativeApp } from './native/platform';
import { AppShell, type AppTab, type AppShellHandle } from './ios/AppShell';
import { AppDataProvider, useStableFunctions, type AppLibrary, type AppSettings } from './ios/appData';
import { previewLibrary } from './ios/previewLibrary';
import { PatientsScreen } from './ios/screens/PatientsScreen';
import { RechecksScreen } from './ios/screens/RechecksScreen';
import { SettingsScreen } from './ios/screens/SettingsScreen';
import { useRechecksDue } from './ios/screens/useRechecksDue';
import { ChartNavBar, ChartNotice } from './ios/chart/ChartNavBar';
import { chartStatus } from './ios/chart/chartStatus';
import type { MenuItem } from './ios/ContextMenu';
import { speciesBase } from './utils/species';
import { CodeSpeciesContext } from './components/codeSpecies';
import './components/EntryGrid.css';
import './components/Workspace.css';
import './components/ClinicalPolish.css';
import './components/DialogPolish.css';

// The PDF engine (pdf-lib + the whole draw pipeline) loads the first
// time a preview is requested, not with the charting screen.
/** Time of day today ("2:41 pm"), otherwise the short date then the time ("Nov 9, 2:41 pm"),
 *  in the active language (English output is the browser-locale format it always was). */
function formatSavedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toDateString() === new Date().toDateString() ? formatTime(d) : `${formatMonthDay(d)}, ${formatTime(d)}`;
}

const PAGE_PRESENTATION = 'page' as const;
const MODAL_PRESENTATION = 'modal' as const;
const MORE_SCOPE = 'more' as const;
const EDIT_ICON = 'pencil-tip';
const FINALIZE_ICON = 'checkmark';
const HELP_SCOPE = 'help' as const;
const ACCOUNT_SCOPE = 'account' as const;

const PatientRecordHistory = lazyWithReload(() =>
  import('./components/PatientRecordHistory').then(module => ({ default: module.PatientRecordHistory }))
);
const DocumentsModal = lazyWithReload(() =>
  import('./components/DocumentsModal').then((m) => ({ default: m.DocumentsModal }))
);

/**
 * Pre-filled feedback email. The body seeds the prompts that make a bug
 * report actionable (repro steps, expected vs. actual, the tooth/section
 * involved, browser) so reports come back with enough detail to act on.
 */
// The subject stays English: it is read by whoever triages the report.
function feedbackMailto(t: TFunction<'app'>): string {
  return `mailto:admin@toothops.app?subject=${encodeURIComponent(
    'ToothOps Charting — feedback / bug report'
  )}&body=${encodeURIComponent(
    [
      t('feedbackMail.doing'),
      '',
      t('feedbackMail.expected'),
      '',
      t('feedbackMail.actual'),
      '',
      t('feedbackMail.involved'),
      '',
      t('feedbackMail.browser'),
      '',
      t('feedbackMail.screenshot'),
      '',
    ].join('\n')
  )}`;
}

/** Sections shown side by side on wide screens (app only): Charting (grid view)
 *  with the Diagnosis diagram, so findings mirrored to the diagram show
 *  up as they're typed. */
const CHARTING_COMPANIONS: Record<string, string> = { charting: 'diagnosis' };

// What toLocaleString() prints by default: the saved-at tooltip's old format.
const FULL_DATE_TIME: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' };
const OWNER_REPORT_SECTION = 'discharge';
const CT_REPORT_KIND = 'ct';
function mostRecentVisitFirst(a: CloudChartMeta, b: CloudChartMeta): number {
  return (b.chart_date || '').localeCompare(a.chart_date || '') || b.updated_at.localeCompare(a.updated_at);
}

const CLINICAL_WORKFLOWS = { consultation: 'consultation', dentalVisit: 'dental-visit', ct: 'ct' } as const;
const CONSULTATION_SECTIONS = new Set(['patient', 'consultation']);
const WARNING_TONE = 'warning' as const;
const CHARTING_VIEWS = ['grid', 'tooth'] as const;
const CHARTING_VIEW_KEYS = { grid: 'chartingView.grid', tooth: 'chartingView.tooth' } as const;

/** Catalog keys for the species toggle values, used in the patient banner. */


/**
 * Top-level chart entry. Reads chart state (with all the persistence,
 * derivation, and PDF-load handlers) from `useChartState`; this component
 * is purely about layout: the topbar with the menu, the section list
 * driven by the active design board, and the preview modal.
 */
interface EntryGridProps {
  transcriptUserId?: string;
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
  transcriptUserId,
  onRequestAccount,
  onGoHome,
}) => {
  const { t } = useTranslation('app');
  // The app's chart status messages (src/ios/chart/chartStatus.ts).
  const { t: tChart } = useTranslation('chart');
  const chart = useChartState();
  const [reviewFocus, setReviewFocus] = React.useState<{ triadan: number; field?: string; session: number }>();
  const [voiceReviewHost, setVoiceReviewHost] = React.useState<HTMLDivElement | null>(null);
  const profile = useProfile();
  const logoInputRef = React.useRef<HTMLInputElement>(null);
  const [logoUploading, setLogoUploading] = React.useState(false);
  const handleHeaderLogoPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setLogoUploading(true);
    try {
      await profile.uploadLogo(file);
      toast(t('practice.logo.updated', { ns: 'settings' }), { kind: 'success' });
    } catch (error) {
      toast(friendlyError(error, t('practice.logo.uploadFailed', { ns: 'settings' })), { kind: 'error' });
    } finally {
      setLogoUploading(false);
    }
  };
  const chartSettings = useChartSettings(profile.loaded);
  const prefs = chartSettings.prefs;
  const language = useAppLanguage(prefs.language, chartSettings.loaded, true);
  const setPref = React.useCallback((patch: Partial<ChartPrefs>) => {
    // Looked up when it fails, in the language in effect then.
    chartSettings.update(patch).catch((err) =>
      toast(i18n.getFixedT(null, 'app')('errors.setting', { error: friendlyDetail(err) }), { kind: 'error' }));
  }, [chartSettings.update]); // eslint-disable-line react-hooks/exhaustive-deps
  // Chart settings dialog: closed, everything, or one section only.
  const [chartSettingsOpen, setChartSettingsOpen] = React.useState<false | 'all' | SettingsSection>(false);
  const [reportCustomizeOpen, setReportCustomizeOpen] = React.useState(false);
  const returnToOwnerPreview = React.useRef(false);
  // Chart history: which chart (the open one, or a visit picked in My charts).
  const [historyFor, setHistoryFor] = React.useState<{ id: string; label?: string; fromLibrary?: boolean } | null>(null);
  // Reopening is explicit; this flag only offers Undo for that editing session.
  const [editUnlocked, setEditUnlocked] = React.useState(false);
  const [finalizationBusy, setFinalizationBusy] = React.useState(false);
  const lifecycleBusyRef = React.useRef(false);
  const finalizeConfirmationRef = React.useRef(false);
  const activeLifecycleSession = React.useRef(chart.chartSession);
  activeLifecycleSession.current = chart.chartSession;
  const activeLifecycleChart = React.useRef(chart.cloudChartId);
  activeLifecycleChart.current = chart.cloudChartId;
  React.useEffect(() => { setEditUnlocked(false); }, [chart.cloudChartId]);
  // The open patient's visits (newest first), for the topbar date
  // switcher. Loaded further down.
  const [libraryVersion, setLibraryVersion] = React.useState(0);
  const [loadedVisits, setVisits] = React.useState<CloudChartMeta[]>([]);
  const visitCache = React.useRef(new Map<string, CloudChartMeta[]>());
  const visitIdentity = chart.patientInfo.patientId ? JSON.stringify([chart.patientInfo.patientId, chart.species]) : JSON.stringify([chart.patientInfo.patientNumber.trim().toLowerCase(), chart.patientInfo.patientName.trim().toLowerCase(), chart.species, !chart.patientInfo.patientNumber.trim() && !chart.patientInfo.patientName.trim() ? chart.cloudChartId : '']);
  const visits = React.useMemo(() => visitCache.current.get(visitIdentity) ?? visitsForPatient(loadedVisits, chart.patientInfo.patientNumber, chart.patientInfo.patientName, chart.patientInfo.patientId), [loadedVisits, chart.patientInfo.patientId, visitIdentity, chart.patientInfo.patientNumber, chart.patientInfo.patientName]);
  const editable = !chart.finalizedAt && !finalizationBusy;
  const native = isNativeApp();
  const rawCloud = useCloudSync(chart, !trial, profile.practiceId, editable, profile.loaded && profile.practiceKnown, chartSettings.loaded && prefs.autosave);
  const animalTabs = useAnimalTabs(chart, rawCloud, !native);
  const cloud = native ? rawCloud : { ...rawCloud, openChart: animalTabs.openChart, signOut: animalTabs.signOut, confirmDiscardIfDirty: animalTabs.confirmDiscardIfDirty };
  const saveDraft = cloud.enabled && !chart.finalizedAt && cloud.preclinical;
  // Owner report is per-practice, admin-flagged, and off by default —
  // everything it touches (section, FAB, image tags, modal) gates here.
  const visitType = visitTypeOf(chart.patientInfo.visitType);
  const consultationOn = visitType === 'consultation';
  const canCreateConsultation = !trial && cloud.enabled && profile.consultationEnabled;
  const ownerReportOn = !consultationOn && cloud.enabled && profile.ownerReportEnabled;
  const chooseVisitType = (): Promise<VisitType | null> => canCreateConsultation
    ? presentSheet<VisitType | null>(({ open, finish }) => <VisitTypeChooser open={open} onChoose={finish} />, null)
    : Promise.resolve('dental');
  const { route, navigate } = useHashRoute();
  // The iOS app renders the chart inside the app shell (tab bar / iPad
  // sidebar) instead of the website's topbar and section rail.
  // App shell tab. #/library (My charts on the web) is the Patients tab.
  const [appTab, setAppTab] = React.useState<AppTab>(() => (native && route.view === 'library' ? 'patients' : 'chart'));
  // The one way to "land on the Chart tab": select it and pop its stack to
  // the root (the shell's showChart; before the shell mounts, just select).
  const shellRef = React.useRef<AppShellHandle>(null);
  const landOnChart = React.useCallback(() => {
    if (shellRef.current) shellRef.current.showChart();
    else setAppTab('chart');
  }, []);
  const [practiceSettingsOpen, setPracticeSettingsOpen] = React.useState(false);
  const libraryViewState = React.useRef<ChartLibraryViewState | undefined>(undefined);
  const rechecksViewState = React.useRef<ChartLibraryViewState | undefined>({
    query: '', speciesFilter: '', doctorFilter: '', dueOnly: true, sortKey: 'recall', sortDir: 'asc',
  });
  const practiceLeaveGuard = React.useRef<(() => Promise<boolean>) | null>(null);
  const registerPracticeGuard = React.useCallback((guard: (() => Promise<boolean>) | null) => {
    practiceLeaveGuard.current = guard;
  }, []);
  const guardPracticeLeave = React.useCallback(() => practiceLeaveGuard.current?.() ?? Promise.resolve(true), []);
  useHashRouteGuard(guardPracticeLeave, !native && practiceSettingsOpen);
  React.useEffect(() => {
    if (!native) setPracticeSettingsOpen(route.view === 'settings');
  }, [route.view, native]);
  const openPracticeSettings = () => {
    setPracticeSettingsOpen(true);
  };
  const returnToVisit = () => navigate(`#/chart/${chart.cloudChartId}`);
  const [navigationHost, setNavigationHost] = React.useState<HTMLDivElement | null>(null);
  const workspacePage = !native && cloud.enabled && route.view === 'rechecks';
  const [remindersOpen, setRemindersOpen] = React.useState(false);
  const [accountOpen, setAccountOpen] = React.useState(false);
  // Which chart section is showing (controlled so a blocked save can jump
  // the user to Patient). Mirrored into the hash (#/chart/:id/:section)
  // so a refresh or shared link lands on the same section.
  const [requestedSection, setActiveSection] = React.useState(
    () => (route.view === 'chart' && route.section) || 'patient'
  );
  const activeSection = consultationOn
    ? CONSULTATION_SECTIONS.has(requestedSection) ? requestedSection : 'consultation'
    : requestedSection === 'gp-exam' || requestedSection === 'consultation' ? 'patient' : requestedSection;
  const sectionDisabled = requestedSection !== activeSection;
  const consultationLibrary = useConsultationLibrary(consultationOn ? profile.practiceId : '');
  const dischargeLibrary = useConsultationLibrary(!consultationOn && cloud.enabled && !trial ? profile.practiceId : '', 'discharge');
  const dischargeTemplatesAvailable = !consultationOn && !trial && cloud.enabled && !!profile.practiceId;
  const imagingTemplatesAvailable = !consultationOn && !trial && cloud.enabled && !!profile.practiceId;
  const imagingLibrary = useConsultationLibrary(imagingTemplatesAvailable && activeSection === 'imaging' ? profile.practiceId : '', 'imaging');
  const imagingReportFields = imagingTemplatesAvailable ? imagingLibrary.config.imagingReportFields : undefined;
  const [imagingTemplatesPractice, setImagingTemplatesPractice] = React.useState<string | null>(null);
  const imagingTemplatesOpen = imagingTemplatesAvailable && imagingTemplatesPractice === profile.practiceId && activeSection === 'imaging';
  const openImagingTemplates = () => {
    if (!imagingTemplatesAvailable) {
      setChartSettingsOpen('images');
      return;
    }
    imagingLibrary.reload();
    setImagingTemplatesPractice(profile.practiceId);
  };
  const [dischargeTemplatesPractice, setDischargeTemplatesPractice] = React.useState<string | null>(null);
  const dischargeTemplatesOpen = dischargeTemplatesAvailable && dischargeTemplatesPractice === profile.practiceId;
  const openDischargeTemplates = () => {
    dischargeLibrary.reload();
    setDischargeTemplatesPractice(profile.practiceId);
  };
  const [consultationTemplatesPractice, setConsultationTemplatesPractice] = React.useState<string | null>(null);
  const consultationTemplatesOpen = consultationOn && consultationTemplatesPractice === profile.practiceId;
  const examPractice = !trial && cloud.enabled ? profile.practiceId : '';
  const [examLayoutScope, setExamLayoutScope] = React.useState<string | null>(null);
  const examLayoutOpen = examLayoutScope === examPractice;
  const examLibrary = useExamLayout(activeSection === 'exam' || examLayoutOpen ? examPractice : '');
  const examFields = examLibrary.fields ?? prefs.examLayout ?? legacyExamLayout(prefs.customExamAreas, prefs.hiddenExamAreas);
  const openExamLayout = () => {
    if (examPractice) examLibrary.reload();
    setExamLayoutScope(examPractice);
  };
  const practiceTeam = useTeam(!trial && ((ownerReportOn && activeSection === OWNER_REPORT_SECTION) || consultationTemplatesOpen || dischargeTemplatesOpen || imagingTemplatesOpen || (examLayoutOpen && !!examPractice)));
  const openConsultationTemplates = () => {
    consultationLibrary.reload();
    setConsultationTemplatesPractice(profile.practiceId);
  };
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
    const section = id === 'owner-report' ? OWNER_REPORT_SECTION : id;
    setActiveSection(section);
    if (routeViewRef.current === 'chart') navigate(`${hashBaseRef.current}/${section}`, { replace: true });
  }, [navigate]);
  /** App: a chart section, shown in the Chart tab. */
  const showChartSection = (id: string) => {
    landOnChart();
    goToSection(id);
  };
  // Inline reason a save was blocked (e.g. missing patient name).
  const [saveHint, setSaveHint] = React.useState('');
  const readOnly = cloud.enabled && !editable;
  const pinInitialConsultationLayout = consultationOn && consultationLibrary.resolved && !readOnly
    && !chart.openedExisting && !chart.patientInfo.consultationLayout;
  React.useEffect(() => {
    if (!pinInitialConsultationLayout) return;
    chart.setPatientInfo(previous => previous.consultationLayout ? previous : {
      ...previous,
      consultationLayout: consultationLayoutFor(previous, consultationLibrary.config),
    });
  }, [pinInitialConsultationLayout, chart.chartSession, chart.setPatientInfo, consultationLibrary.config]);
  const defaultDischargeLayout = dischargeLayoutFor(chart.patientInfo, dischargeLibrary.config, chart.openedExisting);
  const pinDischargeLayout = dischargeTemplatesAvailable && dischargeLibrary.resolved && !readOnly
    && !chart.openedExisting && !chart.patientInfo.dischargeLayout && (!isUnmodifiedStandardDischarge(defaultDischargeLayout) || !!defaultDischargeLayout.name);
  React.useEffect(() => {
    if (!pinDischargeLayout) return;
    chart.setPatientInfo(previous => previous.dischargeLayout ? previous : { ...previous, dischargeLayout: defaultDischargeLayout });
  }, [pinDischargeLayout, defaultDischargeLayout, chart.chartSession, chart.setPatientInfo]);
  // Has the chart changed since the user chose Edit chart? (Offers Undo changes.)
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
    <div className="charting-view-switch" role="group" aria-label={t('chartingView.label')}>
      {CHARTING_VIEWS.map((v) => (
        <button
          key={v}
          type="button"
          className={`charting-view-switch__btn${chartingView === v ? ' charting-view-switch__btn--active' : ''}`}
          aria-pressed={chartingView === v}
          onClick={() => setChartingView(v)}
          title={v === 'tooth' ? t('chartingView.toothHint') : t('chartingView.gridHint')}
        >
          {t(CHARTING_VIEW_KEYS[v])}
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
      {/* The app has Customize in the Chart bar's More menu. */}
      {!native && (
        <button
          type="button"
          className="diagram-view__action section-header__customize"
          onClick={() => setChartSettingsOpen('charting')}
          title={t('customize.hint')}
        >
          {t('customize.label')}
        </button>
      )}
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
  const [dentalDictationBusy, setDentalDictationBusy] = React.useState(false);
  const finalDictationReviewRef = React.useRef<(() => Promise<void> | undefined) | null>(null);
  const [clinicalDictationActive, setClinicalDictationActive] = React.useState(false);
  const [dictationRequest, setDictationRequest] = React.useState<{
    kind: ClinicalDictationKind; id: number; session: number; transcript?: { text: string; language: AppLanguage };
  }>();
  const requestSerial = React.useRef(0);
  const requestFor = (kind: ClinicalDictationKind) => dictationRequest?.session === chart.chartSession
    && dictationRequest.kind === kind ? dictationRequest.id : null;
  const clinicalSession = JSON.stringify([chart.cloudChartId, chart.chartSession]);
  const clinicalAuthEpoch = React.useRef(0);
  const renderedClinicalAuthEpoch = clinicalAuthEpoch.current;
  const clinicalApplyContext = React.useRef({ chart, readOnly, enabled: profile.aiEnabled && !trial && cloud.enabled, consultationOn, canCreateConsultation, session: clinicalSession });
  clinicalApplyContext.current = { chart, readOnly, enabled: profile.aiEnabled && !trial && cloud.enabled, consultationOn, canCreateConsultation, session: clinicalSession };
  React.useEffect(() => {
    const subscription = supabase?.auth?.onAuthStateChange?.(event => {
      if (['SIGNED_OUT', 'SIGNED_IN', 'USER_UPDATED', 'PASSWORD_RECOVERY'].includes(event)) clinicalAuthEpoch.current++;
    });
    return () => subscription?.data.subscription.unsubscribe();
  }, []);
  const applyClinicalDictation = (changes: Partial<PatientInfo>, source: ClinicalDictationSource, routed = false) => {
    const live = clinicalApplyContext.current;
    if (live.readOnly || !live.enabled || live.session !== clinicalSession || clinicalAuthEpoch.current !== renderedClinicalAuthEpoch) throw new LocalizedError(i18n.t('voice:clinical.stale'));
    if (source.kind === 'gp-exam' || source.kind === 'gp-visit') throw new LocalizedError(i18n.t('voice:clinical.stale'));
    if (source.kind === 'dental-visit' && live.consultationOn) throw new LocalizedError(i18n.t('voice:clinical.stale'));
    if (source.kind === 'consultation' && (!live.consultationOn || !live.canCreateConsultation)) throw new LocalizedError(i18n.t('voice:clinical.stale'));
    const allowed: readonly string[] = source.kind === 'ct'
      ? ['ctReport', 'ctReportLanguage', 'ctReviewedBasis']
      : allowedClinicalFields(source.kind, live.consultationOn, routed ? false : undefined, source.kind === 'consultation' && live.consultationOn,
        source.kind === 'consultation' ? consultationLayoutFor(live.chart.patientInfo, consultationLibrary.config, live.chart.openedExisting)
          : clinicalDictationLayout(source.kind, live.chart.patientInfo));
    if (!Object.keys(changes).length || [...Object.keys(changes), ...source.fields].some(field => !allowed.includes(field))) throw new LocalizedError(i18n.t('voice:clinical.invalidSource'));
    appendClinicalDictationSource(live.chart.clinicalDictations, source);
    // The source append validates synchronously before any clinical fields change.
    live.chart.appendClinicalDictation(source);
    const touchesConsultation = source.kind === 'consultation' && live.consultationOn;
    live.chart.setPatientInfo(previous => ({
      ...previous, ...changes,
      ...(touchesConsultation && !previous.consultationLayout
        ? { consultationLayout: consultationLayoutFor(previous, consultationLibrary.config, live.chart.openedExisting) } : {}),
      ...(source.kind === 'imaging' && changes.radiographicFindings !== undefined
        ? { radiologyReport: changes.radiographicFindings, radiologyReportLanguage: source.language, radiologyReviewedBasis: '' } : {}),
      ...((source.kind === 'imaging' || source.kind === 'dental-visit') && changes.ctReport !== undefined
        ? { ctReportLanguage: source.language, ctReviewedBasis: '' } : {}),
    }));
  };
  const radiologyDictatedSession = React.useRef<string | null>(null);
  const radiologyRefineSerial = React.useRef(0);
  const [radiologyRefineRequest, setRadiologyRefineRequest] = React.useState<{ id: number; language: AppLanguage; session: string }>();
  const radiologySession = JSON.stringify([chart.cloudChartId, chart.chartSession]);
  const handleDictationComplete = (lng: AppLanguage, transcript: string) => {
    if (radiologyDictatedSession.current === radiologySession) {
      radiologyDictatedSession.current = null;
      if (!readOnly && profile.aiEnabled && !trial && cloud.enabled) {
        setRadiologyRefineRequest({ id: ++radiologyRefineSerial.current, language: lng, session: radiologySession });
      }
    }
    if (!consultationOn && !readOnly && profile.aiEnabled && !trial && cloud.enabled && transcript.trim()) {
      setDictationRequest({
        kind: CLINICAL_WORKFLOWS.dentalVisit,
        id: ++requestSerial.current,
        session: chart.chartSession,
        transcript: { text: transcript, language: lng },
      });
    }
  };
  const clinicalDictationControl = (kind: ClinicalDictationKind) => profile.aiEnabled && !trial && cloud.enabled
    ? <ClinicalDictationButton key={`${kind}:${chart.chartSession}`} strictTarget consultationEnabled={consultationOn} kind={kind}
        snapshot={kind === 'consultation' ? {
          ...chart.getSnapshot(),
          patientInfo: { ...chart.patientInfo, consultationLayout: consultationLayoutFor(chart.patientInfo, consultationLibrary.config, chart.openedExisting) },
        } : chart.getSnapshot()} chartId={chart.cloudChartId} chartSession={chart.chartSession} transcriptUserId={transcriptUserId} readOnly={readOnly} aiEnabled
        disabled={dentalDictationBusy} openRequest={requestFor(kind)}
        seededTranscript={dictationRequest?.kind === kind && dictationRequest.session === chart.chartSession ? dictationRequest.transcript : undefined}
        onApply={applyClinicalDictation} onOpenChange={setClinicalDictationActive} /> : undefined;
  const handleAiActivity = React.useCallback((actions: AiAction[], lng: AppLanguage) => {
    // Never navigate: the vet stays on the page they chose, and the voice
    // panel says where anything else went ("→ Exam: …"). Just flash the
    // tooth from the last change that belongs on this page.
    for (let i = actions.length - 1; i >= 0; i--) {
      const f = actionFocus(actions[i], activeSectionRef.current, lng);
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
  const [walkthroughFirstRun, setWalkthroughFirstRun] = React.useState(false);
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
    setWalkthroughFirstRun(true);
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
  // Legacy Patients URLs and startup arrivals use the same modal as the tab plus.
  const libraryOpen = cloud.enabled && (route.view === 'library' || route.view === 'rechecks') && !native;
  const [patientPickerOpen, setPatientPickerOpen] = React.useState(false);
  const openLibrary = () => {
    navigate('#/library');
  };
  const closeLibrary = React.useCallback(() => {
    // The app has no My charts dialog: "close the library after opening a
    // chart" means show the Chart tab.
    if (native) {
      landOnChart();
      return;
    }
    navigate(`#/chart/${chart.cloudChartId}`, { replace: true });
  }, [navigate, chart.cloudChartId, native, landOnChart]);

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
  const [resolvingChartLink, setResolvingChartLink] = React.useState(() =>
    !!(cloud.enabled && initialChartLinkRef.current && initialChartLinkRef.current !== chart.cloudChartId));
  React.useEffect(() => {
    const id = initialChartLinkRef.current;
    if (!cloud.enabled || !id || id === chart.cloudChartId) return;
    // Wait a tick so the chart restored from this device has landed (the
    // grid restores in an effect). Web workspaces preserve the previous
    // draft when opening the selected visit. Native links still keep an
    // unsaved chart open.
    const t = window.setTimeout(() => {
      void cloud.openChart(id, native ? { ifClean: true } : undefined).catch(() => { /* stale link — keep the working chart */ })
        .finally(() => setResolvingChartLink(false));
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
  const pendingSectionRef = React.useRef<string | null>(null);
  pendingSectionRef.current = !trial && cloud.enabled && !profile.loaded && sectionDisabled ? requestedSection : null;
  React.useEffect(() => {
    if (route.view !== 'chart' || resolvingChartLink) return;
    const section = pendingSectionRef.current ?? activeSectionRef.current;
    navigate(`${hashBaseRef.current}/${section}`, { replace: true });
  }, [cloud.enabled, route.view, chart.cloudChartId, resolvingChartLink, navigate]);
  // Resolve an unavailable section after the practice loads. Check the live
  // address in case a browser navigation is still waiting for its hash event.
  React.useEffect(() => {
    if (resolvingChartLink || !profile.loaded || !sectionDisabled || route.view !== 'chart' || route.section !== requestedSection) return;
    const base = hashBaseRef.current;
    if (window.location.hash === `${base}/${requestedSection}`) {
      navigate(`${base}/${activeSection}`, { replace: true });
    }
  }, [resolvingChartLink, profile.loaded, sectionDisabled, route, requestedSection, activeSection, navigate]);
  // App: #/library (the arrival rule, an old link) shows the Patients tab;
  // the address goes back to naming the chart.
  React.useEffect(() => {
    if (!native || (route.view !== 'library' && route.view !== 'rechecks')) return;
    setAppTab(route.view === 'rechecks' ? 'rechecks' : 'patients');
    navigate(`${hashBaseRef.current}/${activeSectionRef.current}`, { replace: true });
  }, [native, route.view, navigate]);
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

  // The app's chart live region announces a save the user asked for
  // (Save now, Try again, Done), not every autosave: an explicit save
  // marks itself, and the next 'saved' it reaches is announced until the
  // following save starts.
  const explicitSaveRef = React.useRef(false);
  // Email to owner: the server sends to the chart's *saved* owner email,
  // so the chart must be saved as shown first. Read through a ref — the
  // save updates cloud state between the call and the check.
  const cloudRef = React.useRef({ ...cloud, chartId: chart.cloudChartId });
  cloudRef.current = { ...cloud, chartId: chart.cloudChartId };
  const ensureSavedForEmail = React.useCallback(
    () => (trial ? Promise.resolve(false) : ensureChartSaved(() => cloudRef.current, () => { explicitSaveRef.current = true; })),
    [trial],
  );
  const [announceSaved, setAnnounceSaved] = React.useState(false);
  React.useEffect(() => {
    if (cloud.status === 'saving') setAnnounceSaved(false);
    else if (cloud.status === 'saved' && explicitSaveRef.current) {
      explicitSaveRef.current = false;
      setAnnounceSaved(true);
    } else if (cloud.status === 'error') explicitSaveRef.current = false;
  }, [cloud.status]);

  // Single save gate for the button, ⌘S, and retry: a chart with no
  // patient name can't be found again in My charts (the library groups by
  // number-else-name), so require one before it reaches the cloud.
  const attemptSave = () => {
    if (!cloud.enabled || readOnly) return;
    if (!chart.patientInfo.patientName.trim()) {
      setSaveHint(t('status.saveHint'));
      goToSection('patient');
      return;
    }
    setSaveHint('');
    explicitSaveRef.current = true;
    cloud.saveNow().catch(() => {});
  };
  // Clear the hint the moment a name exists.
  React.useEffect(() => {
    if (chart.patientInfo.patientName.trim()) setSaveHint('');
  }, [chart.patientInfo.patientName]);

  // Load the open patient's visits when switching charts or refreshing the
  // library, so the visit selector also picks up saves from another device.
  React.useEffect(() => {
    if (!cloud.enabled) { setVisits([]); return; }
    const num = chart.patientInfo.patientNumber.trim().toLowerCase();
    const name = chart.patientInfo.patientName.trim().toLowerCase();
    if (!num && !name) { setVisits([]); return; }
    let cancelled = false;
    // Server-side patient lookup — correct however many charts the
    // practice has. The exact key filter re-applies the library's
    // grouping rule to the (already narrow) result set.
    cloud.listPatientVisits(chart.patientInfo.patientNumber, chart.patientInfo.patientName, chart.patientInfo.patientId, true)
      .then((all) => {
        if (cancelled) return;
        const mine = visitsForPatient(all, chart.patientInfo.patientNumber, chart.patientInfo.patientName, chart.patientInfo.patientId)
          .sort(mostRecentVisitFirst);
        visitCache.current.set(visitIdentity, mine);
        setVisits(mine);
      })
      .catch(() => { if (!cancelled) setVisits([]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud.enabled, chart.cloudChartId, libraryVersion]);

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
    if (!cloud.enabled || consultationOn || visits.length === 0) { setPriorTooth(null); setPriorGone(null); return; }
    // Only dental visits carry measurements and previously extracted teeth.
    const dentalVisits = visits.filter(visit => visitTypeOf(visit.visit_type) === 'dental');
    const idx = dentalVisits.findIndex(visit => visit.id === chart.cloudChartId);
    const prior = dentalVisits[idx + 1];
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
  }, [cloud.enabled, visits, chart.cloudChartId, consultationOn]);

  // The patient's other visits, for the Images section's "Image history".
  const imageHistoryVisits = React.useMemo(() => {
    const number = chart.patientInfo.patientNumber.trim().toLowerCase();
    const name = chart.patientInfo.patientName.trim().toLowerCase();
    if (!number && !name) return [];
    return visitsForPatient(visits, chart.patientInfo.patientNumber, chart.patientInfo.patientName, chart.patientInfo.patientId)
      .filter(v => v.id !== chart.cloudChartId).map(v => ({ id: v.id, date: v.chart_date }));
  }, [visits, chart.cloudChartId, chart.patientInfo.patientId, chart.patientInfo.patientNumber, chart.patientInfo.patientName]);

  const switchVisit = (id: string) => {
    if (id === chart.cloudChartId) return;
    cloud.openChart(id).catch((err) => {
      toast(t('errors.openVisit', { error: friendlyDetail(err) }), { kind: 'error' });
    });
  };

  // Start a fresh visit for a patient, carrying identity plus the teeth
  // already gone (missing ∪ extracted) from their most recent saved
  // visit. Shared by the library's "+ Visit" and the saved-chart
  // banner's "+ New visit".
  const createVisitFromChart = async (latestChartId: string, type: VisitType, openVisit = rawCloud.openChart): Promise<boolean> => {
    // Starting a visit replaces the open chart — never silently.
    if (!(await cloud.confirmDiscardIfDirty('newVisit'))) return false;
    const snap = await cloud.fetchChart(latestChartId);
    // Already seen today? Offer that visit rather than a second one —
    // same-day restarts were the main source of duplicate records.
    let answeredToday = false;
    let todays: CloudChartMeta | undefined;
    let latestDentalId: string | undefined;
    try {
      const sp = speciesBase(snap.species);
      const rows = await cloud.listPatientVisits(snap.patientInfo.patientNumber ?? '', snap.patientInfo.patientName ?? '', snap.patientInfo.patientId, true);
      const visits = visitsForPatient(rows, snap.patientInfo.patientNumber, snap.patientInfo.patientName, snap.patientInfo.patientId)
        .sort(mostRecentVisitFirst);
      todays = visits.find(v => v.chart_date === localDateISO() && v.species === sp && visitTypeOf(v.visit_type) === type);
      latestDentalId = visits.find(v => v.species === sp && visitTypeOf(v.visit_type) === 'dental')?.id;
      answeredToday = true;
    } catch {
      /* couldn't check — the first-save check will ask instead */
    }
    if (todays) {
      const who = snap.patientInfo.patientName?.trim() || t('sync.duplicate.patient');
      // Three answers, not yes/no: dismissing (Cancel, Escape, a click
      // outside) must start nothing. As a confirm, a dismissal meant
      // "Start a second visit" — which then autosaved an empty duplicate
      // beside the morning's chart.
      const choice = await chooseDialog({
        title: t('sync.duplicate.titleToday', { name: who }),
        message: t('todaysVisit.message'),
        choices: [
          { value: 'second', label: t('todaysVisit.cancel') },
          { value: 'open', label: t('todaysVisit.confirm') },
        ],
      });
      if (choice === null) return false;
      if (choice === 'open') {
        // Unsaved changes were already confirmed above.
        if (!(await openVisit(todays.id, { skipConfirm: true }))) return false;
        const section = type === 'consultation' ? 'consultation' : 'patient';
        setActiveSection(section);
        navigate(`#/chart/${todays.id}/${section}`, { replace: true });
        return true;
      }
    }
    const dentalSnapshot = type !== 'dental' ? undefined
      : latestDentalId && latestDentalId !== latestChartId ? await cloud.fetchChart(latestDentalId)
        : visitTypeOf(snap.patientInfo.visitType) === 'dental' ? snap : undefined;
    const gone = new Set<number>();
    for (const [k, v] of Object.entries(dentalSnapshot?.preMarks ?? {})) if (v === 'missing') gone.add(Number(k));
    for (const [k, v] of Object.entries(dentalSnapshot?.postMarks ?? {})) if (v === 'extracted') gone.add(Number(k));
    const newVisitId = chart.startNewVisit({
      visitType: type,
      identity: {
        patientName: snap.patientInfo.patientName,
        patientNumber: snap.patientInfo.patientNumber,
        patientId: snap.patientInfo.patientId,
        generatedPatientNumber: snap.patientInfo.generatedPatientNumber,
        ownerName: snap.patientInfo.ownerName ?? '',
        ownerPhone: snap.patientInfo.ownerPhone ?? '',
        ownerEmail: snap.patientInfo.ownerEmail ?? '',
        species: snap.species,
      },
      goneTeeth: Array.from(gone),
    });
    if (answeredToday) cloud.skipDuplicateCheckFor(newVisitId);
    const section = type === 'consultation' ? 'consultation' : 'patient';
    setActiveSection(section);
    navigate(`#/chart/${newVisitId}/${section}`, { replace: true });
    const name = snap.patientInfo.patientName?.trim();
    toast(
      gone.size
        ? name ? t('toasts.visitStartedForCarried', { name, count: gone.size }) : t('toasts.visitStartedCarried', { count: gone.size })
        : name ? t('toasts.visitStartedFor', { name }) : t('toasts.visitStarted'),
      { kind: 'success' }
    );
    return true;
  };

  const startVisitFromChart = async (id: string, requestedType?: VisitType) => {
    const type = requestedType ?? await chooseVisitType();
    if (!type) return false;
    return native ? createVisitFromChart(id, type) : animalTabs.transition(open => createVisitFromChart(id, type, open));
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
  const [previewVisitSession, setPreviewVisitSession] = React.useState<number>();
  const [ownerPreviewOnly, setOwnerPreviewOnly] = React.useState(false);
  const ownerReportEditor = React.useRef<HTMLElement>(null);
  const [jumpToOwnerReport, setJumpToOwnerReport] = React.useState(false);
  React.useEffect(() => {
    if (!jumpToOwnerReport || previewOpen || activeSection !== OWNER_REPORT_SECTION) return;
    const frame = requestAnimationFrame(() => {
      const editor = ownerReportEditor.current;
      editor?.focus({ preventScroll: true });
      editor?.scrollIntoView({ block: 'start' });
      setJumpToOwnerReport(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [jumpToOwnerReport, previewOpen, activeSection]);

  const documentChart = React.useMemo(() => previewSnapshot ? {
    ...previewSnapshot,
    includeGrid: !mirrorToDiagnosis || pdfIncludeGrid,
    includeRadiographicReport: prefs.pdfIncludeRadiographicReport,
    includeCtReport: prefs.pdfIncludeCtReport,
    includeDischarge: prefs.pdfIncludeDischarge,
    includeCodesUsed: prefs.pdfIncludeCodesUsed,
    imagesChartId: pdfIncludeImages && cloud.enabled && !trial ? chart.cloudChartId : undefined,
  } : null, [previewSnapshot, mirrorToDiagnosis, pdfIncludeGrid, prefs.pdfIncludeRadiographicReport,
    prefs.pdfIncludeCtReport, prefs.pdfIncludeDischarge, prefs.pdfIncludeCodesUsed, pdfIncludeImages, cloud.enabled, trial, chart.cloudChartId]);
  // Owner report — the chart translated for the pet's owner.
  /** Which tab the Documents dialog opens on (undefined = last used). */
  const [docsTab, setDocsTab] = React.useState<'chart' | 'owner' | 'note' | undefined>(undefined);

  // ----- AI autofill plumbing -------------------------------------------
  // Snapshot of state Claude sees alongside the transcript.
  const aiContext: ChartContext = {
    patientInfo: typeof chart.patientInfo.radiologyReport === 'string'
      ? { ...chart.patientInfo, radiographicFindings: radiologyRecordedText(chart.patientInfo) } : chart.patientInfo,
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
        const strength = concentration != null
          ? withDrugUnit(drug, concentration)
          : i >= 0 ? named[i].concentration : usualConcentration(drug);
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
    appendRadiographicFindings: (text, lng = language) => {
      if (readOnly) return;
      radiologyDictatedSession.current = radiologySession;
      chart.setPatientInfo((prev: PatientInfo) => ({ ...prev,
        ...appendRadiologyDictation({ ...chart.getSnapshot(), patientInfo: prev }, text, lng) }));
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

  const hasPriorVisits = cloud.enabled && visits.some(visit => visit.id !== chart.cloudChartId);
  const recordHistoryScope = JSON.stringify([visitIdentity, chart.cloudChartId, chart.chartSession, profile.practiceId, cloud.enabled]);
  const [recordHistory, setRecordHistory] = React.useState<{
    scope: string;
    snapshot: ReturnType<typeof chart.getSnapshot>;
    listVisits?: () => Promise<HistoryVisit[]>;
  }>();
  const closeRecordHistory = React.useCallback(() => setRecordHistory(undefined), []);
  React.useEffect(() => {
    const subscription = supabase?.auth?.onAuthStateChange?.(event => {
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'USER_UPDATED') closeRecordHistory();
    });
    return () => subscription?.data.subscription.unsubscribe();
  }, [closeRecordHistory]);

  const openRecordHistory = () => {
    const snapshot = chart.getSnapshot();
    const { patientNumber, patientName, patientId } = snapshot.patientInfo;
    const listVisits = cloud.enabled && (patientId || patientNumber.trim() || patientName.trim())
      ? async () => {
        const rows = await cloud.listPatientVisits(patientNumber, patientName, patientId, true);
        return visitsForPatient(rows, patientNumber, patientName, patientId).sort(mostRecentVisitFirst)
          .map(visit => ({ ...visit, visitType: visitTypeOf(visit.visit_type) }));
      }
      : undefined;
    setRecordHistory({ scope: recordHistoryScope, snapshot, listVisits });
  };

  const pdfBranding = React.useMemo(() => trial
    ? { doctorName: 'TRIAL', logoUrl: '', practiceName: 'TRIAL' }
    : { doctorName: profile.doctorName, logoUrl: profile.logoUrl, practiceName: profile.practiceName,
        useTemplateLogo: !transcriptUserId },
  [trial, profile.doctorName, profile.logoUrl, profile.practiceName, transcriptUserId]);
  const pdfBrandingReady = trial || (profile.brandingReady && chartSettings.loaded);

  const openDocuments = (tab?: 'chart' | 'owner' | 'note', ownerOnly = false) => {
    setDocsTab(tab);
    setOwnerPreviewOnly(ownerOnly);
    setPreviewVisitSession(chart.chartSession);
    if (consultationOn) {
      setDocsTab('note');
      setOwnerPreviewOnly(false);
      setPreviewSnapshot(null);
      setPreviewOpen(true);
      return;
    }
    try {
      const preHandle  = preDiagramRef.current;
      const postHandle = postDiagramRef.current;
      const preSvg  = preHandle?.getSvgElement();
      const postSvg = postHandle?.getSvgElement();
      if (!preHandle || !postHandle || !preSvg || !postSvg) {
        // eslint-disable-next-line no-restricted-syntax -- dev-only: caught below; the user sees errors.preview
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
        includeRadiographicReport: prefs.pdfIncludeRadiographicReport,
        includeCtReport: prefs.pdfIncludeCtReport,
        includeDischarge: prefs.pdfIncludeDischarge,
        includeCodesUsed: prefs.pdfIncludeCodesUsed,
        imagesChartId:
          pdfIncludeImages && cloud.enabled && !trial ? chart.cloudChartId : undefined,
        pdfExcludedImages: chart.pdfExcludedImages,
      });
      setPreviewOpen(true);
    } catch (error) {
      toast(t('errors.preview'), { kind: 'error' });
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
      title={readOnly ? t('lock.title') : undefined}
    >
      <fieldset className="sidebar-layout__fieldset" disabled={readOnly}>
        {node}
      </fieldset>
    </div>
  );

  // Section list — rendered by whichever layout the active board picks.
  const priorMedicationVisit = consultationOn && cloud.enabled
    ? previousMedicationVisit(visits, chart.patientInfo, chart.cloudChartId, chart.species, profile.practiceId)
    : undefined;
  const medicationScope = JSON.stringify([profile.practiceId, visitIdentity, chart.chartSession, priorMedicationVisit?.id, priorMedicationVisit?.updated_at]);
  const [priorMedicationList, setPriorMedicationList] = React.useState<{ scope: string; list: PreviousMedicationList }>();
  const fetchPastMedicationVisit = useStableFunctions({ fetchChart: cloud.fetchChart }).fetchChart;
  React.useEffect(() => {
    const sourceId = priorMedicationVisit?.id;
    if (!sourceId) return;
    const identity = chart.patientInfo;
    let active = true;
    void fetchPastMedicationVisit(sourceId, profile.practiceId).then(snapshot => {
      const source = snapshot.patientInfo;
      if (!active || source.visitType !== 'consultation' || source.date !== priorMedicationVisit.chart_date
        || !sameMedicationPatient(identity, source)) return;
      const current = source.consultationCurrentMedications?.trim() ?? '';
      const decisions = source.consultationMedicationPlan?.trim() ?? '';
      if (current || decisions) setPriorMedicationList({ scope: medicationScope, list: { date: source.date, current, decisions } });
    }).catch(() => { /* The record remains available through visit history. */ });
    return () => { active = false; };
    // The scope tracks changes to the source record, patient and visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medicationScope, fetchPastMedicationVisit]);
  const medicationList = priorMedicationList?.scope === medicationScope ? priorMedicationList.list : undefined;

  const renderNoteImages = ({ label, guidance }: { label?: string; guidance?: string }) =>
    <ImagingSection key={chart.cloudChartId} compact readOnly={readOnly} chartId={chart.cloudChartId}
      cloudActive={cloud.enabled} practiceId={profile.practiceId} maxImages={profile.maxImages}
      dicomEnabled={profile.dicomEnabled} species={chart.species} sectionLabel={label} sectionGuidance={guidance} />;

  const reviewFields = React.useMemo(() => new Set((chart.voiceReviews ?? []).flatMap(item => {
    const action = item.proposal?.action ?? item.flag.applied;
    return action?.name === 'set_tooth_field' ? [`${action.input.triadan}:${action.input.field}`] : [];
  })), [chart.voiceReviews]);
  const chartReviewFocus = reviewFocus?.session === chart.chartSession ? reviewFocus : undefined;
  const sections: ChartSection[] = [
    {
      id: 'patient',
      label: t('sections.patient'),
      content: (
        <PatientForm
          patientInfo={chart.patientInfo}
          species={chart.species}
          onPatientInfoChange={chart.handlePatientInfoChange}
          onSpeciesChange={chart.handleSpeciesChange}
          readOnly={readOnly}
          onReviewHistory={hasPriorVisits ? openRecordHistory : undefined}
          hideRecheck={prefs.hideRecheck}
          hiddenFields={prefs.hiddenPatientFields}
          onCustomize={native ? undefined : () => setChartSettingsOpen('patient')}
        />
      ),
    },
    ...(consultationOn ? [{
      id: 'consultation',
      label: i18n.t('visitDocumentation:consultation.title'),
      content: <VisitDocumentationSection key={chart.chartSession} dictation={canCreateConsultation ? clinicalDictationControl(CLINICAL_WORKFLOWS.consultation) : undefined}
        kind="consultation" patientInfo={chart.patientInfo} readOnly={readOnly} renderImages={renderNoteImages} onReview={() => openDocuments('note')}
        consultation={{
          library: consultationLibrary.config, historical: chart.openedExisting,
          onTemplates: openConsultationTemplates,
          previousMedicationList: medicationList,
          onCopyMedicationList: !readOnly && medicationList?.current ? () => {
            chart.setPatientInfo(previous => previous.consultationCurrentMedications?.trim()
              ? previous : { ...previous, consultationCurrentMedications: medicationList.current });
          } : undefined,
          sources: chart.clinicalDictations?.filter(source => source.kind === 'consultation'
            || source.fields.some(field => (CONSULTATION_FIELDS as readonly string[]).includes(field))),
        }}
        onChange={changes => {
          if (readOnly) return;
          chart.setPatientInfo(previous => ({
            ...previous,
            ...((consultationLibrary.resolved || Object.keys(changes).some(isCustomConsultationField))
              ? { consultationLayout: consultationLayoutFor(previous, consultationLibrary.config, chart.openedExisting) } : {}),
            ...changes,
          }));
        }} />,
    }] : []),
    {
      id: 'exam',
      label: t('sections.exam'),
      content: (
        <ExamForm
          exam={chart.patientInfo.exam}
          layout={examFields}
          customRows={chart.patientInfo.customExam}
          diagnostics={chart.patientInfo.gpDiagnostics ?? ''}
          onDiagnosticsChange={value => { if (!readOnly) chart.handlePatientInfoChange('gpDiagnostics', value); }}
          onStatusChange={chart.handleExamStatusChange}
          onCommentChange={chart.handleExamCommentChange}
          onCustomChange={(row, patch) => {
            if (!readOnly) chart.setPatientInfo(previous => ({ ...previous, customExam: setCustomExamValue(previous.customExam, row, patch) }));
          }}
          readOnly={readOnly}
          onCustomize={native ? undefined : openExamLayout}
        />
      ),
    },
    {
      id: 'anesthesia',
      label: t('sections.anesthesia'),
      content: lock(
        <AnesthesiaForm
          nerveBlocks={chart.patientInfo.nerveBlocks}
          secondNerveBlocks={chart.patientInfo.secondNerveBlocks}
          onSecondNerveBlocksChange={update => chart.setPatientInfo(prev => ({
            ...prev, secondNerveBlocks: update(prev.secondNerveBlocks),
          }))}
          onNerveBlockChange={chart.handleNerveBlockChange}
          onDrugsChange={chart.setNerveBlockDrugs}
          logo={chart.logo}
          hiddenBlocks={prefs.hiddenBlocks}
          usualDrug={prefs.usualDrug}
          usualAdjunct={prefs.usualAdjunct}
          onCustomize={native ? undefined : () => setChartSettingsOpen('anesthesia')}
          customBlockDefs={prefs.customBlocks}
          customFieldDefs={prefs.customFields}
          customValues={chart.patientInfo.customAnesthesia}
          onCustomValuesChange={(next) => chart.setPatientInfo((prev: PatientInfo) => ({ ...prev, customAnesthesia: next }))}
        />
      ),
    },
    {
      id: 'charting',
      label: t('sections.charting'),
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
              reviewFields={reviewFields}
              reviewFocus={chartReviewFocus}
              headerAccessory={chartingHeaderAccessory}
              hiddenColumns={prefs.hiddenColumns}
              pocketMode={prefs.pocketMode}
              quickCodes={prefs.quickCodes}
            />
          ) : (
          <DentalGrid
            headerAccessory={chartingHeaderAccessory}
            readOnly={readOnly}
            toothData={chart.toothData}
            onToothDataChange={chart.setToothDataDirectly}
            highlightTriadan={aiHighlightTriadan}
            reviewFields={reviewFields}
            reviewFocus={chartReviewFocus}
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
            scorePicker={prefs.scorePicker}
          />
          )
        ) : null
      ),
    },
    {
      id: 'diagnosis',
      label: t('sections.diagnosis'),
      content: (
        <div className="diagram-with-codes">
          <div className="diagram-with-codes__diagram">
                        <DiagramView
              // Remount per chart: undo history must not carry another
              // patient's marks into this one.
              key={`pre-${chart.chartSession}`}
              ref={preDiagramRef}
              readOnly={readOnly}
              title={t('sections.diagnosis')}
              onCustomize={native ? undefined : () => setChartSettingsOpen('diagnosis')}
              species={chart.species}
              toothMarks={chart.preToothMarks}
              onToothMarksChange={chart.setPreToothMarks}
              comments={chart.preDiagramComments}
              onCommentsChange={chart.setPreDiagramComments}
              strokes={chart.preDiagramStrokes}
              onStrokesChange={chart.setPreDiagramStrokes}
              markMode="missing-only"
              quickCodes={prefs.quickCodes}
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
      label: t('sections.procedure'),
      content: (
        <div className="diagram-with-codes">
          <div className="diagram-with-codes__diagram">
                        <DiagramView
              key={`post-${chart.chartSession}`}
              ref={postDiagramRef}
              readOnly={readOnly}
              title={t('sections.procedure')}
              species={chart.species}
              toothMarks={chart.effectivePostMarks}
              onToothMarksChange={chart.handlePostMarksChange}
              comments={chart.postDiagramComments}
              onCommentsChange={chart.setPostDiagramComments}
              strokes={chart.postDiagramStrokes}
              onStrokesChange={chart.setPostDiagramStrokes}
              lockedTriadans={chart.lockedPostTriadans}
              quickCodes={prefs.procedureQuickCodes}
              onCustomize={native ? undefined : () => setChartSettingsOpen('procedure')}
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
      label: t('sections.images'),
      content: (
        <>
        <ImagingSection key={chart.cloudChartId}
          readOnly={readOnly}
          chartId={chart.cloudChartId}
          cloudActive={cloud.enabled}
          practiceId={profile.practiceId}
          maxImages={profile.maxImages}
          dicomEnabled={profile.dicomEnabled}
          species={chart.species}
          imageRoles={chart.imageRoles}
          onImageRoleChange={ownerReportOn ? chart.setImageRole : undefined}
          ownerReportImageInclusion={chart.ownerReportImageInclusion}
          onOwnerReportImageChange={ownerReportOn ? chart.setImageInOwnerReport : undefined}
          onReportContentChange={() => { if (chart.ownerReport.reviewedBasis && !readOnly) chart.setOwnerReportOverride('reviewedBasis', null); }}
          includeInPdf={pdfIncludeImages}
          onCustomize={native ? undefined : openImagingTemplates}
          pdfExcludedImages={chart.pdfExcludedImages}
          onImageInPdfChange={chart.setImageInPdf}
        />
        <ImageHistory visits={imageHistoryVisits} onOpenVisit={switchVisit} toothLabel={imageToothLabel} />
        <div className="imaging-reports">
          <div>
          {lock(<RadiologyReportSection chartEditor
            snapshot={{ ...chart.getSnapshot(), patientInfo: { ...chart.patientInfo,
              radiologyReport: chart.patientInfo.radiographicFindings ?? chart.patientInfo.radiologyReport ?? '', radiographicFindings: '' } }}
            chartId={chart.cloudChartId} chartSession={chart.chartSession} readOnly={readOnly}
            reportLabel={imagingReportFields?.radiology?.label}
            starterText={!chart.openedExisting && chart.patientInfo.radiographicFindings === undefined && chart.patientInfo.radiologyReport === undefined
              ? imagingReportFields?.radiology?.starterText : undefined}
            preferredLanguage={prefs.imagingReportLanguage}
            aiEnabled={profile.aiEnabled && !trial && cloud.enabled}
            refineRequest={radiologyRefineRequest?.session === radiologySession ? radiologyRefineRequest : undefined}
            onChange={changes => chart.setPatientInfo(prev => ({ ...prev, ...changes,
              ...(Object.hasOwn(changes, 'radiologyReport') ? { radiographicFindings: changes.radiologyReport } : {}) }))} />)}
          </div>
          <div>
          {lock(<RadiologyReportSection chartEditor reportKind={CLINICAL_WORKFLOWS.ct} snapshot={chart.getSnapshot()}
            chartId={chart.cloudChartId} chartSession={chart.chartSession} readOnly={readOnly}
            reportLabel={imagingReportFields?.ct?.label}
            starterText={!chart.openedExisting && chart.patientInfo.ctReport === undefined ? imagingReportFields?.ct?.starterText : undefined}
            preferredLanguage={prefs.imagingReportLanguage}
            aiEnabled={profile.aiEnabled && !trial && cloud.enabled} showAiNotice={false}
            onChange={changes => chart.setPatientInfo(prev => ({ ...prev, ...changes }))} />)}
          </div>
        </div>
        </>
      ),
    },
    {
      id: 'treatment',
      label: t('sections.treatment'),
      content: (
        <SurgeryReportForm
          key={chart.chartSession}
          readOnly={readOnly}
          value={chart.patientInfo.treatmentReport}
          templateId={chart.patientInfo.treatmentReportTemplateId}
          chartFields={{
            pet: chart.patientInfo.patientName,
            owner: chart.patientInfo.ownerName,
            species: t(`species.${chart.species === 'canine-deciduous' ? 'canine' : chart.species === 'feline-deciduous' ? 'feline' : chart.species}`),
            date: chart.patientInfo.date,
            practice: profile.practiceName,
            doctor: chart.patientInfo.doctor || profile.doctorName,
          }}
          onApplyTemplate={(value, id) => {
            if (!readOnly) chart.setPatientInfo(previous => ({ ...previous, treatmentReport: value, treatmentReportTemplateId: id }));
          }}
          onChange={(value) => chart.handlePatientInfoChange('treatmentReport', value)}
          cloudActive={cloud.enabled}
          practiceId={profile.practiceId}
        />
      ),
    },
    {
      id: OWNER_REPORT_SECTION,
      label: i18n.t('visitDocumentation:discharge.title'),
      content: <VisitDocumentationSection kind="discharge" patientInfo={chart.patientInfo} readOnly={readOnly} renderImages={renderNoteImages}
        discharge={dischargeTemplatesAvailable ? { library: dischargeLibrary.config, historical: chart.openedExisting, onTemplates: openDischargeTemplates } : undefined}
        onChange={changes => {
          if (readOnly) return;
          chart.setPatientInfo(previous => ({
            ...previous,
            ...(!previous.dischargeLayout && Object.keys(changes).some(isCustomDischargeField) ? { dischargeLayout: defaultDischargeLayout } : {}),
            ...changes,
          }));
        }}>
        {ownerReportOn && <OwnerReportSection
          key={chart.chartSession}
          editorRef={ownerReportEditor}
          chartId={cloud.enabled ? chart.cloudChartId : null}
          readOnly={readOnly}
          snapshot={chart.getSnapshot()}
          overrides={chart.ownerReport}
          onOverrideChange={chart.setOwnerReportOverride}
          onPreview={() => openDocuments('owner', true)}
          context={{ config: profile.ownerReportConfig, practiceName: profile.practiceName, doctorName: profile.doctorName }}
          aiEnabled={profile.aiEnabled && !trial && cloud.enabled}
          onCustomize={cloud.enabled && !trial ? () => setReportCustomizeOpen(true) : undefined}
        />}
      </VisitDocumentationSection>,
    },
  ].filter(section => !consultationOn || CONSULTATION_SECTIONS.has(section.id));

  // An explicitly reopened record offers Undo and Finalize.
  const editingSavedVisit = cloud.enabled && editUnlocked && !readOnly;
  const patientTabSaveStatus = cloud.enabled && !workspacePage && !animalTabs.empty
    ? cloud.status === 'saving' ? 'saving'
      : !readOnly && (cloud.dirty || cloud.status === 'error') ? 'notSaved'
      : !cloud.dirty && !!cloud.lastSavedAt ? 'saved' : undefined
    : undefined;
  const saveStatusTitle = patientTabSaveStatus === 'saved' && cloud.lastSavedAt
    ? t('status.savedTitle', { when: formatDateTime(cloud.lastSavedAt, undefined, FULL_DATE_TIME) })
    : patientTabSaveStatus === 'notSaved'
      ? !cloud.online ? t('status.offlineTitle')
        : !chart.patientInfo.patientName.trim() ? t('status.needsNameTitle')
        : cloud.status === 'error' ? cloud.saveError || t('status.retryTitle')
        : !prefs.autosave ? t('status.autosaveOff')
        : t('status.unsavedTitle')
      : undefined;
  const showManualSave = !saveDraft && patientTabSaveStatus === 'notSaved' && cloud.status !== 'error' && cloud.online
    && !!chart.patientInfo.patientName.trim() && !prefs.autosave;
  const saveAction = React.useRef(attemptSave);
  saveAction.current = attemptSave;
  const saveFeedback = React.useMemo(() => {
    if (native || !cloud.enabled || workspacePage || animalTabs.empty) return null;

    if (cloud.status === 'saving') {
      return null; // Saving feedback lives on the active patient tab.
    }
    if (cloud.status === 'error') {
      return (
        <span className="save-status-error-wrap">
          <button
            type="button"
            className="save-status save-status--error"
            onClick={() => saveAction.current()}
            title={cloud.saveError || t('status.retryTitle')}
          >
            {t('status.notSavedRetry')}
          </button>
          {cloud.saveError && <span className="save-status__detail">{cloud.saveError}</span>}
        </span>
      );
    }
    if (saveHint) {
      return (
        <span className="save-status-error-wrap" role="alert">
          <span className="save-status save-status--error">{t('status.notSaved')}</span>
          <span className="save-status__detail">{saveHint}</span>
        </span>
      );
    }
    return null;
  }, [native, cloud.enabled, cloud.status, cloud.saveError, saveHint, workspacePage, animalTabs.empty, t]);
  React.useEffect(() => {
    if (saveFeedback) return statusToast(saveFeedback, { kind: 'error', duration: 0 });
  }, [saveFeedback]);

  // Only explicitly finalized records require Edit chart.
  const viewingSavedVisit = cloud.enabled && !!chart.finalizedAt;
  const lifecycleLabel = viewingSavedVisit ? t('topbar.editChart') : saveDraft ? t('actions.save', { ns: 'common' }) : t('finalization.finalize');
  const startNewVisitFromLatest = () => {
    // Carry forward from the patient's LATEST visit — this also shows
    // when viewing an older one.
    const latest = visits[0]?.id ?? chart.cloudChartId;
    startVisitFromChart(latest).catch((err) => {
      toast(t('errors.newVisit', { error: friendlyDetail(err) }), { kind: 'error' });
    });
  };
  // Start a blank chart (asks only when something would be lost).
  // `beforeReset` runs only once discarding is agreed (the ezyVet hand-over
  // stashes its patient there, so a cancelled question leaves nothing behind).
  const createPatient = async (beforeReset?: () => void, requestedType?: VisitType): Promise<boolean> => {
    const type = requestedType ?? await chooseVisitType();
    if (!type || !(await cloud.confirmDiscardIfDirty('newPatient'))) return false;
    beforeReset?.();
    if (native && type === 'dental') {
      chart.resetChart();
      setActiveSection('patient');
    } else {
      const id = chart.startNewVisit({
        visitType: type,
        identity: { patientName: '', patientNumber: '', ownerName: '', ownerPhone: '', ownerEmail: '', species: chart.species },
        goneTeeth: [],
      });
      const section = type === 'consultation' ? 'consultation' : 'patient';
      navigate(`#/chart/${id}/${section}`);
      setActiveSection(section);
    }
    return true;
  };
  const startNewPatient = (beforeReset?: () => void, requestedType?: VisitType) => native
    ? createPatient(beforeReset, requestedType)
    : animalTabs.transition(() => createPatient(beforeReset, requestedType));
  const addAnimal = async () => {
    if (cloud.enabled) { setPatientPickerOpen(true); return; }
    if (animalTabs.closedLocal.length) {
      const choice = await chooseDialog({ title: t('animalTabs.open'), choices: [
        { value: 'new', label: t('animalTabs.unnamed') },
        ...animalTabs.closedLocal.map(tab => ({ value: tab.id, label: [tab.name || t('animalTabs.unnamed'), tab.owner].filter(Boolean).join(' · ') })),
      ] });
      if (choice === null) return;
      if (choice !== 'new') { await animalTabs.select(choice); return; }
    }
    await startNewPatient();
  };
  // A patient picked in the ToothOps for ezyVet side panel: start their
  // chart once signed in (the flag waits in sessionStorage until then).
  useEzyvetHandover({
    enabled: !trial && cloud.enabled,
    newPatientInPlace: !native,
    getUserId: async () => (await supabase?.auth.getSession())?.data.session?.user.id ?? null,
    take: takePendingPatient,
    startNewPatient: beforeReset => startNewPatient(beforeReset, 'dental'),
    startVisitFromChart: id => startVisitFromChart(id, 'dental'),
    fillPatient: ({ patientName, patientNumber, ownerName }) =>
      chart.setPatientInfo((prev: PatientInfo) => ({ ...prev, patientName, ownerName, patientNumber })),
    fillNumberIfBlank: (patientNumber) =>
      chart.setPatientInfo((prev: PatientInfo) => (prev.patientNumber?.trim() && !isGeneratedPatientNumber(prev) ? prev : { ...prev, patientNumber })),
    isChartBlank: () => !chart.patientInfo.patientName?.trim() && (!chart.patientInfo.patientNumber?.trim() || isGeneratedPatientNumber(chart.patientInfo)),
  });
  const changeFinalization = async (finalized: boolean) => {
    if (lifecycleBusyRef.current) return false;
    if (!chart.patientInfo.patientName.trim()) {
      setSaveHint(t('status.needsNameTitle'));
      goToSection('patient');
      return false;
    }
    lifecycleBusyRef.current = true;
    try {
      const session = activeLifecycleSession.current;
      const review = finalized ? finalDictationReviewRef.current?.() : undefined;
      if (review) {
        await review;
        // Allow any last chart updates from the review to reach the save snapshot.
        await new Promise(resolve => setTimeout(resolve, 0));
        if (session !== activeLifecycleSession.current) return false;
      }
      setFinalizationBusy(true);
      explicitSaveRef.current = true;
      return await cloud.setFinalized(finalized);
    } catch (err) {
      toast(t('finalization.failed', { error: friendlyDetail(err) }), { kind: 'error' });
      return false;
    } finally {
      lifecycleBusyRef.current = false;
      setFinalizationBusy(false);
    }
  };
  const unlockForEditing = async () => {
    const id = chart.cloudChartId;
    const snapshot = chart.getSnapshot();
    if (!(await changeFinalization(false)) || activeLifecycleChart.current !== id) return;
    try { window.sessionStorage.setItem(`chart.unlockSnapshot.${id}`, JSON.stringify({ ...snapshot, finalizedAt: undefined })); } catch { /* too big / private mode */ }
    setEditUnlocked(true);
  };
  const revertUnlockedChanges = async () => {
    const raw = (() => { try { return window.sessionStorage.getItem(`chart.unlockSnapshot.${chart.cloudChartId}`); } catch { return null; } })();
    if (!raw) return;
    if (!(await confirmDialog({
      title: t('revert.title'),
      message: t('revert.message'),
      confirmLabel: t('revert.confirm'),
      danger: true,
    }))) return;
    chart.applySnapshot(JSON.parse(raw), chart.cloudChartId);
    toast(t('toasts.reverted'), { kind: 'success' });
  };
  const finalizeRecord = async () => {
    const id = chart.cloudChartId;
    if (!(await changeFinalization(true)) || activeLifecycleChart.current !== id) return false;
    try { window.sessionStorage.removeItem(`chart.unlockSnapshot.${id}`); } catch { /* ignore */ }
    setEditUnlocked(false);
    return true;
  };

  const confirmFinalizeRecord = async () => {
    if (finalizeConfirmationRef.current || lifecycleBusyRef.current) return;
    if (!chart.patientInfo.patientName.trim()) {
      await finalizeRecord();
      return;
    }
    const session = chart.chartSession;
    finalizeConfirmationRef.current = true;
    try {
      const accepted = await confirmDialog({
        title: t('finalization.confirmTitle'),
        message: t('finalization.confirmMessage', { edit: t('topbar.editChart') }),
        confirmLabel: t('finalization.finalize'),
      });
      if (accepted && activeLifecycleSession.current === session) await finalizeRecord();
    } finally {
      finalizeConfirmationRef.current = false;
    }
  };

  // ----- Saved-chart actions ---------------------------------------------
  // One copy for the web's My charts dialog and the app's tabs (the app
  // adds "land on the Chart tab" on top). Stable identities.
  // libraryVersion tells the app's list screens to refetch.
  const refreshOpenChart = rawCloud.refreshOpenChart;
  React.useEffect(() => {
    if (!cloud.enabled) return;
    let timer: number | undefined;
    const refreshChart = () => { void refreshOpenChart?.().catch(() => { /* Keep the working copy on a failed read. */ }); };
    const onForeground = () => {
      if (document.visibilityState === 'hidden' || timer !== undefined) return;
      // Browsers often deliver focus and visibility together on return.
      timer = window.setTimeout(() => {
        timer = undefined;
        setLibraryVersion(version => version + 1);
        refreshChart();
      }, 0);
    };
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) onForeground(); };
    document.addEventListener('visibilitychange', onForeground);
    window.addEventListener('focus', onForeground);
    window.addEventListener('online', onForeground);
    window.addEventListener('pageshow', onPageShow);
    const resume = native ? CapacitorApp.addListener('resume', onForeground).catch(() => undefined) : undefined;
    const live = supabase && typeof supabase.channel === 'function' ? supabase : null;
    const unsubscribe = live ? subscribeToChartChanges(live, profile.practiceId, onForeground) : undefined;
    const catchUp = live ? window.setInterval(onForeground, 30_000) : undefined;
    refreshChart();
    return () => {
      unsubscribe?.();
      window.clearInterval(catchUp);
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onForeground);
      window.removeEventListener('focus', onForeground);
      window.removeEventListener('online', onForeground);
      window.removeEventListener('pageshow', onPageShow);
      void resume?.then(handle => handle?.remove()).catch(() => undefined);
    };
  }, [cloud.enabled, native, profile.practiceId, refreshOpenChart]);
  // App only: the website has no list that needs it (no extra renders there).
  const bumpLibrary = React.useCallback(() => {
    if (native) setLibraryVersion((v) => v + 1);
  }, [native]);
  // An autosave refreshes the lists only when it saved something they
  // show: another chart, the patient's name/number/owner, species, visit
  // or recheck date, or the first save of the day ("Updated" date). Each
  // bump refetches the Rechecks badge's due query (up to 500 rows).
  const pi = chart.patientInfo;
  const listSignature = native
    ? JSON.stringify([
      chart.cloudChartId, pi.patientName, pi.patientNumber, pi.ownerName, pi.ownerPhone, pi.ownerEmail,
      chart.species, pi.date, pi.recallDate ?? '', chart.finalizedAt, cloud.lastSavedAt ? localDateISO(new Date(cloud.lastSavedAt)) : '',
    ])
    : '';
  const listedSignatureRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!cloud.lastSavedAt || listedSignatureRef.current === listSignature) return;
    bumpLibrary();
    // Edits still pending when this save landed may not be in it: the
    // next save refreshes again.
    listedSignatureRef.current = cloud.dirty ? null : listSignature;
  }, [cloud.lastSavedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const libraryCore = useStableFunctions({
    deleteChart: async (id: string): Promise<void> => {
      await cloud.deleteChart(id);
      animalTabs.forget(id);
      bumpLibrary();
    },
    /** Start a visit from the patient's latest; toasts failures. */
    newVisit: async (latestChartId: string): Promise<boolean> => {
      try {
        if (!(await startVisitFromChart(latestChartId))) return false;
      } catch (err) {
        toast(t('errors.newVisit', { error: friendlyDetail(err) }), { kind: 'error' });
        return false;
      }
      bumpLibrary();
      return true;
    },
    newPatient: async (): Promise<boolean> => {
      if (!(await startNewPatient())) return false;
      bumpLibrary();
      return true;
    },
    loadPdf: async (file: File): Promise<boolean> => {
      const load = async () => {
        if (!(await cloud.confirmDiscardIfDirty('importPdf'))) return false;
        return chart.loadFromPdf(file);
      };
      return native ? load() : animalTabs.transition(load);
    },
    sendReminder: (c: CloudChartMeta) => setReminderTarget(c),
    openHistory: (chartId: string, label: string) => setHistoryFor({ id: chartId, label, fromLibrary: true }),
    clearRecalls: async (chartIds: string[]): Promise<void> => {
      await cloud.clearRecalls(chartIds);
      // If the working chart is one of them, mirror the clear
      // locally — a later save must not resurrect the date.
      if (chartIds.includes(chart.cloudChartId)) {
        chart.handlePatientInfoChange('recallDate', '');
      }
      bumpLibrary();
    },
  });

  // Shared by the website page and the app shell (same order on the web).
  const otherTabBanner = otherTabWarning && (
    <div className="chart-lock-banner chart-lock-banner--warning" role="alert">
      <span className="chart-lock-banner__text">
        {t('otherTab.text')}
      </span>
      <button
        type="button"
        className="entry-grid__button entry-grid__button--topbar"
        onClick={() => setOtherTabWarning(false)}
      >
        {t('gotIt', { ns: 'whatsNew' })}
      </button>
    </div>
  );
  const dialogsBeforeForm = (
    <>
      {reportCustomizeOpen && (
        <OwnerReportCustomize
          aiEnabled={profile.aiEnabled}
          onClose={() => {
            setReportCustomizeOpen(false);
            if (returnToOwnerPreview.current) {
              returnToOwnerPreview.current = false;
              openDocuments('owner');
            }
          }}
          config={profile.ownerReportConfig}
          onSave={profile.saveOwnerReportConfig}
          loadFailed={profile.ownerReportConfigLoadFailed}
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
            restoreHint={isOpenChart ? undefined : t('historyRestoreHint')}
            onOpenChart={historyFor.fromLibrary && !isOpenChart ? () => {
              const id = historyFor.id;
              setHistoryFor(null);
              cloud.openChart(id).then((ok) => { if (ok) closeLibrary(); }).catch((err) => {
                toast(t('errors.openVisit', { error: friendlyDetail(err) }), { kind: 'error' });
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
          onCustomizeExam={consultationOn ? undefined : openExamLayout}
        />
      )}

      {feedback && (
        <FeedbackModal
          onClose={() => setFeedback(null)}
          section={activeSection}
          transcript={feedback.transcript}
        />
      )}

      {(libraryOpen || patientPickerOpen) && (() => {
        const library = <ChartLibrary
          presentation={patientPickerOpen || route.view === 'library' ? MODAL_PRESENTATION : PAGE_PRESENTATION}
          key={route.view}
          rechecksOnly={route.view === 'rechecks'}
          viewState={route.view === 'rechecks' ? rechecksViewState : libraryViewState}
          reloadToken={libraryVersion}
          listCharts={cloud.listCharts}
          onOpen={cloud.openChart}
          onDelete={libraryCore.deleteChart}
          onNewVisit={async (latestChartId) => {
            // Cancelled at the unsaved-changes prompt → stay in the library.
            if (await libraryCore.newVisit(latestChartId)) setPatientPickerOpen(false);
          }}
          onSendReminder={libraryCore.sendReminder}
          onOpenHistory={libraryCore.openHistory}
          onClearRecalls={libraryCore.clearRecalls}
          onNewPatient={async () => { if (await libraryCore.newPatient()) setPatientPickerOpen(false); }}
          onLoadPdf={libraryCore.loadPdf}
          onClose={() => { if (patientPickerOpen) setPatientPickerOpen(false); else closeLibrary(); }}
        />;
        return patientPickerOpen || route.view === 'library' ? createPortal(library, document.body) : library;
      })()}
    </>
  );
  const reviewSections = sections.map(section => section.id);
  for (const item of chart.voiceReviews ?? []) {
    const section = sections.find(section => section.id === voiceReviewSection(item, reviewSections));
    if (section) section.needsReview = true;
  }

  for (const section of sections) {
    section.content = <>
      <div ref={section.id === activeSection ? setVoiceReviewHost : undefined} hidden={!section.needsReview} />
      {section.content}
    </>;
  }

  const chartForm = (
    <form
      id="chart-form"
      className="entry-grid-form"
      // Focus target for the skip link — without it the anchor jump
      // scrolls but keyboard focus stays on the link.
      tabIndex={-1}
      onSubmit={handleOpenPreview}
      // Stop browser-default form submit on Enter from any single-line
      // input. Textareas, buttons, and inputs that
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
          target instanceof HTMLButtonElement ||
          target.dataset.allowFormSubmit === 'true';
        if (!allow) e.preventDefault();
      }}
    >
      <SidebarLayout
        sections={sections}
        notice={viewingSavedVisit ? (
          <div className="chart-readonly-notice" role="note" aria-label={t('status.viewOnly')}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
            <div><strong>{t('status.viewOnly')}</strong><p>{t('finalization.description')}</p></div>
          </div>
        ) : undefined}
        activeId={activeSection}
        onActiveChange={goToSection}
        // Wide screens in the app (13" iPad landscape): the Diagnosis
        // diagram sits beside the grid. By tooth already has its own
        // diagram. The website keeps its layout unchanged.
        companions={native && chartingView === 'grid' ? CHARTING_COMPANIONS : undefined}
        hideNav={native}
        navigationHost={native ? undefined : navigationHost}
      />
    </form>
  );
  const pdfButton = consultationOn && activeSection === 'consultation' ? null : (
    <button
      type="submit"
      form="chart-form"
      className="entry-grid__button visit-export__button"
      aria-haspopup="dialog"
      aria-label={t('fab.review')}
    >
      <span aria-hidden="true">⤓</span> {t('fab.review')}
    </button>
  );
  // Owner report → "Add owner email": close Documents, open the Patient section.
  const editPatientFromDocuments = () => {
    setPreviewOpen(false);
    goToSection('patient');
  };
  const setOwnerTemplate = (id: string | null) => chart.setOwnerReportOverride('templateId', id);
  const dialogsAfterForm = (
    <>
      {!consultationOn && clinicalDictationControl(CLINICAL_WORKFLOWS.dentalVisit)}
      {recordHistory?.scope === recordHistoryScope && (
        <React.Suspense fallback={null}>
          <PatientRecordHistory current={recordHistory.snapshot}
            currentId={cloud.enabled ? chart.cloudChartId : null}
            listVisits={recordHistory.listVisits} fetchVisit={cloud.fetchChart}
            branding={pdfBranding}
            brandingReady={pdfBrandingReady}
            onClose={closeRecordHistory} />
        </React.Suspense>
      )}
      {consultationTemplatesOpen && (
        <ConsultationTemplatesDialog
          initial={consultationLibrary.config} status={consultationLibrary.status}
          canEdit={practiceTeam.practice?.id === profile.practiceId && practiceTeam.role === 'owner'}
          onSave={consultationLibrary.save} onReload={consultationLibrary.reload}
          onClose={() => setConsultationTemplatesPractice(null)} />
      )}
      {dischargeTemplatesOpen && (
        <ConsultationTemplatesDialog kind="discharge"
          initial={dischargeLibrary.config} status={dischargeLibrary.status}
          canEdit={practiceTeam.practice?.id === profile.practiceId && practiceTeam.role === 'owner'}
          onSave={dischargeLibrary.save} onReload={dischargeLibrary.reload}
          onClose={() => setDischargeTemplatesPractice(null)} />
      )}
      {examLayoutOpen && (
        <ExamLayoutDialog fields={examFields} mode={examPractice ? 'practice' : 'personal'}
          status={examLibrary.status} canEdit={!examPractice || (practiceTeam.practice?.id === examPractice && practiceTeam.role === 'owner')}
          onSave={examPractice ? examLibrary.save : fields => chartSettings.update({ examLayout: fields })}
          onReload={examLibrary.reload} onClose={() => setExamLayoutScope(null)} />
      )}
      {imagingTemplatesOpen && (
        <ConsultationTemplatesDialog kind="imaging"
          initial={imagingLibrary.config} status={imagingLibrary.status}
          canEdit={practiceTeam.practice?.id === profile.practiceId && practiceTeam.role === 'owner'}
          onSave={imagingLibrary.save} onReload={imagingLibrary.reload}
          onClose={() => setImagingTemplatesPractice(null)} onOpenSettings={() => setChartSettingsOpen('images')} />
      )}
      {(previewSnapshot || consultationOn) && previewVisitSession === chart.chartSession && (
        <React.Suspense fallback={null}>
          <DocumentsModal
            open={previewOpen}
            onClose={() => setPreviewOpen(false)}
            initialTab={docsTab}
            ownerPreviewOnly={ownerPreviewOnly}
            chartSnapshot={consultationOn ? null : documentChart}
            chartBranding={pdfBranding}
            brandingReady={pdfBrandingReady}
            chartOptions={{
              gridRequired: !mirrorToDiagnosis,
              imagesAvailable: cloud.enabled && !trial,
              includeImages: pdfIncludeImages,
              onChange: (field, value) => setPref({ [field]: value }),
            }}
            chartLifecycle={{
              unsaved: !cloud.enabled || cloud.dirty || !cloud.lastSavedAt || cloud.status === 'saving' || cloud.status === 'error',
              unfinalized: !chart.finalizedAt,
              canFinalize: cloud.enabled && !trial && cloud.online && !finalizationBusy && !!chart.patientInfo.patientName.trim(),
              finalize: finalizeRecord,
            }}
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
                setJumpToOwnerReport(true);
                goToSection(OWNER_REPORT_SECTION);
              },
              onTemplateChange: readOnly ? undefined : setOwnerTemplate,
              onCustomizeTemplate: cloud.enabled && !trial ? () => {
                returnToOwnerPreview.current = true;
                setPreviewOpen(false);
                setReportCustomizeOpen(true);
              } : undefined,
              ownerEmail: chart.patientInfo.ownerEmail,
              ensureSaved: ensureSavedForEmail,
              onEditPatient: editPatientFromDocuments,
            } : undefined}
            recordNote={{
              snapshot: chart.getSnapshot(),
              stored: chart.recordNote,
              showConsultationGuide: consultationOn,
              onChange: chart.setRecordNote,
              readOnly,
              pims: {
                enabled: profile.pimsSendEnabled,
                aiEnabled: profile.aiEnabled && !trial && cloud.enabled,
                chartId: cloud.enabled ? chart.cloudChartId : null,
                patientName: chart.patientInfo.patientName,
                patientNumber: chart.patientInfo.patientNumber,
                // Not loaded with the chart: the Send dialog reads it.
                sentAt: null,
              },
            }}
          />
        </React.Suspense>
      )}

      <WalkthroughModal
        open={walkthroughOpen}
        firstRun={walkthroughFirstRun}
        onClose={() => setWalkthroughOpen(false)}
        aiEnabled={profile.aiEnabled && !trial}
        ownerReportEnabled={ownerReportOn}
        onNavigate={native ? showChartSection : goToSection}
      />

      <PracticeSettingsModal
        open={practiceSettingsOpen}
        sectionNavigation={!native}
        onClose={() => { practiceLeaveGuard.current = null; setPracticeSettingsOpen(false); if (!native && route.view === 'settings') returnToVisit(); }}
        presentation={MODAL_PRESENTATION}
        onLeaveGuardChange={registerPracticeGuard}
        onOpenReminders={() => setRemindersOpen(true)}
        onOpenChartSettings={() => setChartSettingsOpen('all')}
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
        language={language}
        onLanguageChange={(lng) => setPref({ language: lng })}
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
    </>
  );

  // ----- iOS app shell --------------------------------------------------
  // What the Patients / Rechecks / Settings tabs get from this component
  // (src/ios/appData.tsx documents the contract). Context values are
  // referentially stable, and every "lands on Chart" goes through
  // landOnChart (Chart tab + its stack popped to the root).
  const appFns = useStableFunctions({
    listCharts: cloud.listCharts,
    /** The shell's onOpenChart: opens the visit; the shell then lands on Chart. */
    openChart: async (id: string): Promise<boolean> => {
      try {
        return await cloud.openChart(id);
      } catch (err) {
        toast(t('errors.openVisit', { error: friendlyDetail(err) }), { kind: 'error' });
        return false;
      }
    },
    newVisit: async (latestChartId: string): Promise<boolean> => {
      if (!(await libraryCore.newVisit(latestChartId))) return false;
      landOnChart();
      return true;
    },
    newPatient: async (): Promise<boolean> => {
      if (!(await libraryCore.newPatient())) return false;
      landOnChart();
      return true;
    },
    loadPdf: async (file: File): Promise<boolean> => {
      if (!(await libraryCore.loadPdf(file))) return false;
      landOnChart();
      return true;
    },
  });
  const appLibrary = React.useMemo<AppLibrary | null>(
    () => (cloud.enabled ? {
      listCharts: appFns.listCharts,
      libraryVersion,
      deleteChart: libraryCore.deleteChart,
      newVisit: appFns.newVisit,
      newPatient: appFns.newPatient,
      loadPdf: appFns.loadPdf,
      sendReminder: libraryCore.sendReminder,
      clearRecalls: libraryCore.clearRecalls,
      openHistory: libraryCore.openHistory,
      openChartId: chart.cloudChartId,
    } : null),
    // appFns' / libraryCore's members never change identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cloud.enabled, chart.cloudChartId, libraryVersion]
  );
  // The library the app's screens see (DEV: the preview's sample patients).
  const shellLibrary = import.meta.env.DEV ? previewLibrary(appLibrary) : appLibrary;
  // Rechecks tab badge: patients Overdue + Due today (app only).
  const rechecksDue = useRechecksDue(native ? shellLibrary : null);
  const rechecksBadge = React.useMemo(() => (rechecksDue > 0 ? { rechecks: rechecksDue } : undefined), [rechecksDue]);
  const settingsFns = useStableFunctions({
    setPref,
    setLanguage: (lng: AppSettings['language']) => setPref({ language: lng }),
    goToSection: showChartSection,
    account: () => setAccountOpen(true),
    practice: openPracticeSettings,
    chartSettings: (section?: SettingsSection) => setChartSettingsOpen(section ?? 'all'),
    customizeExam: openExamLayout,
    reminders: () => setRemindersOpen(true),
    walkthrough: () => { setWalkthroughFirstRun(false); setWalkthroughOpen(true); },
    whatsNew: () => setWhatsNewOpen(true),
    feedback: () => setFeedback({}),
    admin: () => setAdminOpen(true),
    signOut: () => cloud.signOut().catch((err) => {
      toast(t('errors.signOut', { error: friendlyDetail(err) }), { kind: 'error' });
    }),
    requestAccount: (mode: 'signup' | 'signin') => onRequestAccount?.(mode),
  });
  const appSettings = React.useMemo<AppSettings>(() => ({
    trial,
    cloudEnabled: cloud.enabled,
    isAdmin: isAdmin && !trial,
    aiEnabled: profile.aiEnabled && !trial,
    canFeedback,
    profile,
    prefs,
    prefsFollowAccount: chartSettings.followsAccount,
    setPref: settingsFns.setPref,
    language,
    setLanguage: settingsFns.setLanguage,
    activeSection,
    goToSection: settingsFns.goToSection,
    open: {
      account: cloud.enabled ? settingsFns.account : undefined,
      practice: cloud.enabled ? settingsFns.practice : undefined,
      chartSettings: settingsFns.chartSettings,
      customizeExam: consultationOn ? undefined : settingsFns.customizeExam,
      reminders: cloud.enabled ? settingsFns.reminders : undefined,
      walkthrough: settingsFns.walkthrough,
      whatsNew: settingsFns.whatsNew,
      feedback: canFeedback ? settingsFns.feedback : undefined,
      admin: isAdmin && !trial ? settingsFns.admin : undefined,
    },
    signOut: cloud.enabled ? settingsFns.signOut : undefined,
    requestAccount: trial && onRequestAccount ? settingsFns.requestAccount : undefined,
    // settingsFns' members never change identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [trial, cloud.enabled, isAdmin, canFeedback, profile, prefs, chartSettings.followsAccount, language, activeSection, consultationOn, !!onRequestAccount]);

  // Hoisted elements: the other tabs don't re-render when the chart does
  // (they read live data through context; see appData.tsx).
  const tabScreens = React.useMemo(() => ({
    patients: <PatientsScreen />,
    rechecks: <RechecksScreen />,
    settings: <SettingsScreen />,
  }), []);
  const sectionLinksKey = sections.map((x) => `${x.id}\u0000${x.label}\u0000${!!x.needsReview}`).join('\u0001');
  const chartSectionLinks = React.useMemo(
    () => sections.map(({ id, label, needsReview }) => ({ id, label, needsReview })),
    // Only ids, labels, and review indicators matter here; `sections` itself is rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sectionLinksKey]
  );

  const contextualDestination = consultationOn ? {
    label: t('visitTypes.consultation'),
    onOpen: () => setDictationRequest({
      kind: CLINICAL_WORKFLOWS.consultation, id: ++requestSerial.current, session: chart.chartSession,
    }),
  } : { label: t('visitTypes.dictateDental') };
  const canDictate = profile.aiEnabled && !trial && (!consultationOn || canCreateConsultation);
  const dictate = (triggerHidden: boolean) => (canDictate || !!chart.voiceReviews?.length) && (
    <VoiceInputButton
      context={aiContext}
      savedReviews={chart.voiceReviews}
      onReviewsChange={chart.setVoiceReviews}
      reviewHost={voiceReviewHost}
      reviewSections={reviewSections}
      reviewOnly={!canDictate}
      handlers={aiHandlers}
      onActivity={handleAiActivity}
      onShowAction={native ? showChartSection : goToSection}
      onReviewFocus={focus => {
        if (focus.section === 'charting' && focus.triadan != null) {
          setReviewFocus({ triadan: focus.triadan, field: focus.field, session: chart.chartSession });
        }
      }}
      onDictationComplete={handleDictationComplete}
      finalReviewRef={finalDictationReviewRef}
      contextualDestination={contextualDestination}
      triggerHidden={triggerHidden || readOnly || clinicalDictationActive}
      onBusyChange={setDentalDictationBusy}
      activeSection={activeSection}
      sessionKey={String(chart.chartSession)}
      transcriptUserId={transcriptUserId}
      locked={readOnly || clinicalDictationActive}
      onOpenFeedback={canFeedback ? (transcript) => setFeedback({ transcript }) : undefined}
    />
  );

  const refineContext = {
    enabled: profile.aiEnabled && cloud.enabled && !trial && !readOnly && !workspacePage && (!native || appTab === 'chart'),
    scope: JSON.stringify([chart.cloudChartId, chart.chartSession, activeSection, previewOpen]),
  };

  if (native) {
    // ----- Chart tab (iOS): navigation bar, inline notices, dictation ----
    const status = chartStatus(
      {
        cloudEnabled: cloud.enabled,
        trial,
        status: cloud.status,
        saveError: cloud.saveError || '',
        saveHint,
        readOnly,
        viewingSavedVisit,
        editingSavedVisit,
        dirty: cloud.dirty,
        online: cloud.online,
        hasName: !!chart.patientInfo.patientName.trim(),
        autosaveEnabled: prefs.autosave,
        lastSavedAt: cloud.lastSavedAt || '',
        announceSaved,
        visitDate: chart.patientInfo.date,
      },
      tChart,
      {
        // In the active language (format helpers, as on the website).
        time: (iso) => formatSavedAt(iso),
        date: (ymd) => formatDate(ymd, 'medium'),
      }
    );
    const customizeFor: Record<string, (() => void) | undefined> = {
      patient: () => setChartSettingsOpen('patient'),
      exam: openExamLayout,
      procedure: () => setChartSettingsOpen('procedure'),
      anesthesia: () => setChartSettingsOpen('anesthesia'),
      charting: () => setChartSettingsOpen('charting'),
      diagnosis: () => setChartSettingsOpen('diagnosis'),
      imaging: openImagingTemplates,
    };
    const hasSavedPatient = cloud.enabled && chart.openedExisting && !!chart.cloudChartId;
    const customize = customizeFor[activeSection];
    const sectionLabel = sections.find((x) => x.id === activeSection)?.label ?? '';
    const moreMenu: MenuItem[] = [
      // A fresh chart is one tap away, except mid-edit (Done comes first).
      ...(cloud.enabled && !editingSavedVisit
        ? [{ label: t('ios.menu.newChart', { ns: 'chart' }), icon: 'plus' as const, onSelect: () => { void appFns.newPatient(); } }]
        : []),
      ...(hasSavedPatient
        ? [
            { label: t('ios.menu.newVisit', { ns: 'chart' }), icon: 'calendar-badge-clock' as const, onSelect: startNewVisitFromLatest },
            { label: t('history.title', { ns: 'library' }), icon: 'clock-arrow-circlepath' as const, onSelect: () => setHistoryFor({ id: chart.cloudChartId }) },
          ]
        : []),
      ...(viewingSavedVisit ? [{ label: t('topbar.editChart', { ns: 'app' }), icon: 'doc-text' as const, onSelect: unlockForEditing }] : []),
      ...(editingSavedVisit && unlockSnapshotChanged
        ? [{ label: t('topbar.undo', { ns: 'app' }), icon: 'arrow-uturn-backward' as const, onSelect: () => { void revertUnlockedChanges(); } }]
        : []),
      ...(status.canSaveNow && !saveDraft ? [{ label: t('ios.menu.saveNow', { ns: 'chart' }), icon: 'checkmark-circle' as const, onSelect: attemptSave }] : []),
      ...(status.retry ? [{ label: t('ios.menu.retrySave', { ns: 'chart' }), icon: 'arrow-uturn-forward' as const, onSelect: attemptSave }] : []),
      ...(customize ? [{ label: t('ios.menu.customize', { ns: 'chart', section: sectionLabel }), icon: 'gear' as const, onSelect: customize }] : []),
      // Always there, so the bar's trailing capsule keeps its shape.
      { label: t('chart.title', { ns: 'settings' }), icon: 'line-3-horizontal-decrease' as const, onSelect: () => setChartSettingsOpen('all') },
    ];
    const chartTab = (
      <div className="ios-chart-screen">
        <ChartNavBar
          title={chart.patientInfo.patientName.trim() || t('ios.newChart', { ns: 'chart' })}
          subtitle={viewingSavedVisit ? t('finalization.finalized') : status.text}
          sections={chartSectionLinks}
          activeSection={activeSection}
          onSection={goToSection}
          shareLabel={ownerReportOn ? t('fab.downloadAria', { ns: 'app' }) : t('fab.previewAria', { ns: 'app' })}
          menu={moreMenu}
          onEdit={viewingSavedVisit ? unlockForEditing : undefined}
          onSave={saveDraft ? attemptSave : undefined}
          onFinalize={cloud.enabled && !chart.finalizedAt && !saveDraft ? confirmFinalizeRecord : undefined}
          lifecycleBusy={finalizationBusy || !cloud.online || cloud.status === 'saving' || (saveDraft && !cloud.dirty)}
        />
        {/* Stays mounted so screen readers hear every save. */}
        {cloud.enabled && (
          <span className="visually-hidden" role="status" aria-live="polite">{status.live}</span>
        )}
        {otherTabWarning && (
          <ChartNotice tone={WARNING_TONE} text={t('ios.notice.otherTab', { ns: 'chart' })} actionLabel={t('ios.notice.gotIt', { ns: 'chart' })} onAction={() => setOtherTabWarning(false)} />
        )}
        {status.tone === 'error' && (
          <ChartNotice
            tone={status.tone}
            text={t('ios.notice.notSaved', { ns: 'chart' })}
            detail={status.detail}
            actionLabel={status.retry ? t('actions.tryAgain', { ns: 'common' }) : undefined}
            onAction={status.retry ? attemptSave : undefined}
          />
        )}
        <div className="entry-grid-container entry-grid-container--app">
          {chartForm}
        </div>
      </div>
    );
    return (
      <RefineTextContext.Provider value={refineContext}>
      <div className="entry-grid-app">
        {/* DEV only: ?iosPreview=1&iosFixtures=1 gives the trial sample patients. */}
        <AppDataProvider library={shellLibrary} settings={appSettings}>
          <AppShell
            activeTab={appTab}
            onTabChange={setAppTab}
            controllerRef={shellRef}
            onOpenChart={appFns.openChart}
            chartSections={chartSectionLinks}
            activeChartSection={activeSection}
            onChartSection={goToSection}
            chart={chartTab}
            patients={tabScreens.patients}
            rechecks={tabScreens.rechecks}
            settings={tabScreens.settings}
            badges={rechecksBadge}
          />
        </AppDataProvider>
        {/* Dictation floats above the tab bar, outside the shell's stacks
            (fixed position). Mounted on every tab so a recording keeps
            going; shown on the Chart tab only. */}
        <div className="ios-chart-dictate" hidden={appTab !== 'chart' || readOnly || clinicalDictationActive}
          role="region" aria-label={t('ios.form.dictate', { ns: 'chart' })}>
          {dictate(appTab !== 'chart')}
        </div>
        {dialogsBeforeForm}
        {dialogsAfterForm}
      </div>
      </RefineTextContext.Provider>
    );
  }

  return (
    <RefineTextContext.Provider value={refineContext}>
    <CodeSpeciesContext.Provider value={chart.species}>
    <div className="entry-grid-container" ref={containerRef} inert={animalTabs.busy}>
      {/* Keyboard users skip the topbar controls straight to the chart. */}
      <a className="skip-link" href={workspacePage ? '#workspace-content' : '#chart-form'} onClick={(event) => {
        event.preventDefault();
        const target = document.getElementById(workspacePage ? 'workspace-content' : 'chart-form');
        target?.focus();
        target?.scrollIntoView({ block: 'start' });
      }}>
        {t('skipLink')}
      </a>
      <header className="entry-grid__topbar" ref={topbarRef}>

        <div className="entry-grid__topbar-lead">
          <div className="entry-grid__practice-brand">
            <div className="entry-grid__practice-brand-desktop">
              {/* Uploaded practice logo leads the identity block (decorative —
                  the practice name is right beside it). */}
              {profile.logoUrl ? (
                <img src={profile.logoUrl} alt="" className="entry-grid__topbar-logo" />
              ) : cloud.enabled && <button type="button" className="entry-grid__add-logo" disabled={logoUploading} aria-busy={logoUploading} onClick={() => logoInputRef.current?.click()}>
                {t('topbar.addLogo')} <span aria-hidden="true">+</span>
              </button>}
              <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden
                aria-label={t('practice.logo.choose', { ns: 'settings' })} onChange={handleHeaderLogoPick} />
              {cloud.enabled && !trial ? (
                <button type="button" className="entry-grid__topbar-identity entry-grid__practice-link" onClick={openPracticeSettings} title={t('menu.practiceSettings.label')}>
                  <span className="entry-grid__doctor">{profile.practiceName.trim() || t('brand')}</span>
                  {profile.doctorName.trim() && <span className="entry-grid__title">{profile.doctorName}</span>}
                </button>
              ) : (
                <div className="entry-grid__topbar-identity"><h1 className="entry-grid__title">{trial ? t('brandTrial') : profile.practiceName.trim() || t('brand')}</h1></div>
              )}
            </div>
            <ChartMenu
              onSave={showManualSave ? { onClick: attemptSave, hint: saveStatusTitle } : undefined}
              scope={MORE_SCOPE}
              practice={{
                name: trial ? t('brandTrial') : profile.practiceName.trim() || t('brand'),
                doctorName: cloud.enabled && !trial ? profile.doctorName.trim() : undefined,
                logoUrl: profile.logoUrl,
              }}
              onPreviewDocuments={!workspacePage ? () => (document.getElementById('chart-form') as HTMLFormElement | null)?.requestSubmit() : undefined}
              onOpenWalkthrough={() => { void guardPracticeLeave().then((leave) => { if (leave) { practiceLeaveGuard.current = null; setPracticeSettingsOpen(false); returnToVisit(); setWalkthroughFirstRun(false); setWalkthroughOpen(true); } }); }}
              onGoHome={onGoHome}
              onOpenAdmin={isAdmin && !trial ? () => setAdminOpen(true) : undefined}
              onOpenFeedback={canFeedback ? () => setFeedback({}) : undefined}
              onOpenChartSettings={() => setChartSettingsOpen('all')}
              onOpenWhatsNew={() => setWhatsNewOpen(true)}
              onRevert={editingSavedVisit && !workspacePage && unlockSnapshotChanged ? revertUnlockedChanges : undefined}
              cloud={cloud.enabled ? {
                onPracticeSettings: openPracticeSettings,
                onOpenReminders: () => setRemindersOpen(true),
                onOpenAccount: () => setAccountOpen(true),
                onSignOut: () => { void guardPracticeLeave().then((leave) => { if (leave) return cloud.signOut(); }).catch((err) => toast(t('errors.signOut', { error: friendlyDetail(err) }), { kind: 'error' })); },
              } : undefined}
            />
          </div>
          <div className="entry-grid__patient-workspace">
        <AnimalTabs tabs={animalTabs.tabs} showEmpty={false} activeId={animalTabs.empty || workspacePage ? '' : chart.cloudChartId}
          busy={animalTabs.busy} editing={editingSavedVisit}
          saveStatus={patientTabSaveStatus}
          saveStatusTitle={saveStatusTitle}
          activeVisitType={visitType}
          visits={cloud.enabled ? Array.from(new Map([...visits.map(visit => ({ id: visit.id, date: visit.chart_date, visitType: visitTypeOf(visit.visit_type) })), ...animalTabs.draftVisits].map(visit => [visit.id, visit])).values()).sort((a, b) => b.date.localeCompare(a.date)) : []}
          onVisit={switchVisit}
          onAdd={() => { void addAnimal(); }}
          onSelect={id => { void animalTabs.select(id).then(ok => { if (ok && workspacePage) navigate(`#/chart/${id}`); }).catch(err => toast(t('errors.openVisit', { error: friendlyDetail(err) }), { kind: 'error' })); }}
          onClose={id => { void animalTabs.close(id).catch(err => toast(t('errors.openVisit', { error: friendlyDetail(err) }), { kind: 'error' })); }} />
          </div>
        </div>
        {/* --app: the signed-in toolbar (phones lay it out as an even,
            full-width row). */}
        <div className={`entry-grid__topbar-actions${cloud.enabled && !trial ? ' entry-grid__topbar-actions--app' : ''}${viewingSavedVisit ? ' entry-grid__topbar-actions--view-only' : ''}`}>
          {trial && (
            <>
              <button
                type="button"
                className="chart-menu__trigger topbar-library-btn"
                onClick={() => onRequestAccount?.('signin')}
                title={t('topbar.signInHint')}
              >
                {t('topbar.signIn')}
              </button>
              <button
                type="button"
                className="chart-menu__trigger topbar-library-btn"
                onClick={() => onRequestAccount?.('signup')}
                title={t('topbar.signUpHint')}
              >
                {t('topbar.signUp')}
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
                ? t('status.srSaving')
                : cloud.status === 'saved'
                ? t('status.srSaved')
                : cloud.status === 'error'
                ? cloud.saveError || t('status.srNotSaved')
                : ''}
            </span>
          )}

          <span data-tour="settings" className="topbar-tour-anchor topbar-desktop-help">
          <ChartMenu
            scope={HELP_SCOPE}
            onOpenWalkthrough={() => { void guardPracticeLeave().then((leave) => { if (leave) { practiceLeaveGuard.current = null; setPracticeSettingsOpen(false); returnToVisit(); setWalkthroughFirstRun(false); setWalkthroughOpen(true); } }); }}
            onGoHome={onGoHome}
            onOpenAdmin={isAdmin && !trial ? () => setAdminOpen(true) : undefined}
            onOpenFeedback={canFeedback ? () => setFeedback({}) : undefined}
            onOpenChartSettings={() => setChartSettingsOpen('all')}
            onOpenWhatsNew={() => setWhatsNewOpen(true)}
            cloud={
              cloud.enabled
                ? {
                    onPracticeSettings: openPracticeSettings,
                    onOpenReminders: () => setRemindersOpen(true),
                    onOpenAccount: () => setAccountOpen(true),
                    onSignOut: () => {
                      cloud.signOut().catch((err) => {
                        toast(t('errors.signOut', { error: friendlyDetail(err) }), { kind: 'error' });
                      });
                    },
                  }
                : undefined
            }
          />
          </span>
          {/* AI autofill (every signed-in plan during the beta); the keys live server-side
              behind JWT-gated edge functions, so trial (no account) and
              Basic practices don't get it. */}
          {dictate(workspacePage || animalTabs.empty)}
          {showManualSave && <button type="button" className="diagram-view__action topbar-desktop-save"
            onClick={attemptSave} title={saveStatusTitle}>{t('ios.menu.saveNow', { ns: 'chart' })}</button>}
          {cloud.enabled && !workspacePage && !animalTabs.empty && (
            <>
              {viewingSavedVisit && <span className="save-status save-status--saved">{t('finalization.finalized')}</span>}
              {editingSavedVisit && unlockSnapshotChanged && (
                <button
                  type="button"
                  className="topbar-editing__undo topbar-desktop-revert"
                  aria-label={t('topbar.undo')}
                  onClick={revertUnlockedChanges}
                  title={t('topbar.undoTitle')}
                >
                  <span aria-hidden="true">↺</span> <span className="topbar-icon-label">{t('topbar.undo')}</span>
                </button>
              )}
              <button
                type="button"
                className="entry-grid__button entry-grid__button--topbar topbar-lifecycle"
                aria-label={lifecycleLabel}
                title={lifecycleLabel}
                onClick={viewingSavedVisit ? unlockForEditing : saveDraft ? attemptSave : confirmFinalizeRecord}
                disabled={finalizationBusy || !cloud.online || cloud.status === 'saving' || (saveDraft && !cloud.dirty)}
              >
                {saveDraft ? lifecycleLabel : (
                  <>
                    <Icon className="topbar-lifecycle__icon" name={viewingSavedVisit ? EDIT_ICON : FINALIZE_ICON} size={18} />
                    <span className="topbar-lifecycle__label">{lifecycleLabel}</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </header>

      <div className={`workspace-layout${!workspacePage && animalTabs.empty ? ' workspace-layout--empty' : ''}`}>
      <aside className="workspace-sidebar">
      {!cloud.enabled && <nav className="workspace-nav" aria-label={t('workspace.navigation')}>
        <button type="button" onClick={() => setChartSettingsOpen('all')}>{t('menu.chartSettings.label')}</button>
      </nav>}
      <div className="workspace-sidebar__sections" hidden={workspacePage || animalTabs.empty} ref={setNavigationHost} />
      <div className="workspace-sidebar__account">
          {cloud.enabled && <ChartMenu
            scope={ACCOUNT_SCOPE}
            onOpenWalkthrough={() => { void guardPracticeLeave().then((leave) => { if (leave) { practiceLeaveGuard.current = null; setPracticeSettingsOpen(false); returnToVisit(); setWalkthroughFirstRun(false); setWalkthroughOpen(true); } }); }}
            onOpenAdmin={isAdmin && !trial ? () => setAdminOpen(true) : undefined}
            cloud={{
              onPracticeSettings: openPracticeSettings,
              onOpenReminders: () => setRemindersOpen(true),
              onOpenAccount: () => setAccountOpen(true),
              onSignOut: () => { void guardPracticeLeave().then((leave) => { if (leave) return cloud.signOut(); }).catch((err) => toast(t('errors.signOut', { error: friendlyDetail(err) }), { kind: 'error' })); },
            }}
          />}
      </div>
      </aside>
      <div className="workspace-main">
      {otherTabBanner}

      <div id="workspace-content" tabIndex={-1}>
        {dialogsBeforeForm}
        {!workspacePage && animalTabs.empty && <div className="animal-tabs__empty">
          <h2>{t('animalTabs.emptyTitle')}</h2><p>{t('animalTabs.emptyBody')}</p>
          <button type="button" className="animal-tabs__open" onClick={() => { void addAnimal(); }}>{t('animalTabs.open')}</button>
        </div>}
        <div id="animal-chart-panel" role="tabpanel" aria-labelledby={!animalTabs.empty ? `animal-tab-${chart.cloudChartId}` : undefined}
          hidden={workspacePage || animalTabs.empty} inert={animalTabs.busy}>
          {chartForm}
          {pdfButton && <div className="visit-export">{pdfButton}</div>}
        </div>
        {dialogsAfterForm}
      </div>

      </div>
      </div>

      {/* Compact feedback link — the email it opens pre-fills the useful
          details (what happened, section, browser). */}
      <footer className="entry-grid__footnote">
        {trial && <span className="save-status save-status--muted" title={t('status.localTitle')}>{t('status.local')}</span>}
        <span className="entry-grid__footnote-lead">
          <Trans t={t} i18nKey="footer.feedback" components={{ a: <a href={feedbackMailto(t)} /> }} />
        </span>
      </footer>
    </div>
    </CodeSpeciesContext.Provider>
    </RefineTextContext.Provider>
  );
};

export default EntryGrid;
