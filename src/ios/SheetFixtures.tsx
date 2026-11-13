/* DEV-only fixtures for the app's sheets and sign-in surfaces:
 * `?iosPreview=1&iosFixture=<name>` on the dev server renders one surface
 * with sample data instead of the app (names in FIXTURES below). Never
 * bundled into production (index.tsx only imports it behind
 * import.meta.env.DEV). Sheets that read the cloud get their data from the
 * supabase client patched in place here, so no account or network is
 * needed. Sample text is fixture data, not user-facing copy, so it isn't
 * translated. */
import React from 'react';
import { supabase } from '../utils/supabaseClient';
import { EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS } from '../types';
import type { ChartSnapshot } from '../types';
import { DocumentsModal } from '../components/DocumentsModal';
import type { ChartSnapshot as PreviewSnapshot } from '../components/PdfPreviewModal';
import { ChartHistoryModal } from '../components/ChartHistoryModal';
import { ReminderModal } from '../components/ReminderModal';
import { WhatsNewModal } from '../components/WhatsNewModal';
import { FeedbackModal } from '../components/FeedbackModal';
import { JoinPracticeModal } from '../components/JoinPracticeModal';
import { FinishSetupModal } from '../components/FinishSetupModal';
import { SessionExpiredOverlay } from '../components/SessionExpiredOverlay';
import { AppLockOverlay } from '../components/AppLockOverlay';
import { InactivePlan } from '../components/InactivePlan';
import { BillingGate } from '../components/BillingGate';
import { Sheet } from './Sheet';
import { ensureAiConsent } from '../native/aiConsent';
import type { UseProfileReturn } from '../hooks/useProfile';
// The chart screen's stylesheet (chart history, PDF bodies), as in the app.
import '../components/EntryGrid.css';

const patientInfo = {
  patientName: 'Bella', patientNumber: '1042', ownerName: 'Sam Rivera', ownerPhone: '', ownerEmail: 'sam@example.com',
  doctor: 'Dr. Jane Kaser', tech: 'Alex', date: '2026-11-12', complaint: 'Halitosis, reluctant to chew on the left.',
  treatmentReport: 'Scaled and polished. Extracted 208.', recallDate: '2027-05-12',
  nerveBlocks: { ...EMPTY_NERVE_BLOCKS }, exam: { ...EMPTY_EXAM_FINDINGS },
};

const snapshot = {
  patientInfo,
  toothData: [], species: 'canine', logo: 'socal',
  preMarks: {}, preComments: [], preStrokes: [], postMarks: {}, postComments: [], postStrokes: [],
} as unknown as ChartSnapshot;

function svg(): SVGSVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 100 100');
  return el;
}
const empty = { marks: {}, comments: [], strokes: [] };
const previewSnapshot = {
  patientInfo, toothData: [], species: 'canine', logo: 'socal',
  preSvg: svg(), preComments: [], preState: empty,
  postSvg: svg(), postComments: [], postState: empty,
  branding: { doctorName: 'Dr. Jane Kaser' },
} as unknown as PreviewSnapshot;

/** Point the cloud reads these sheets make at sample data. */
function patchCloud() {
  if (!supabase) return;
  const client = supabase as unknown as Record<string, unknown>;
  const revisions = [
    { id: 3, saved_by: 'u2', started_at: '2026-11-12T15:02:00Z', saved_at: '2026-11-12T15:40:00Z', note: '' },
    { id: 2, saved_by: 'u1', started_at: '2026-11-11T10:00:00Z', saved_at: '2026-11-11T10:00:20Z', note: '' },
    { id: 1, saved_by: 'u1', started_at: '2026-11-10T09:00:00Z', saved_at: '2026-11-10T09:00:00Z', note: 'baseline' },
  ];
  const builder = (result: unknown): unknown => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'limit']) b[m] = () => b;
    b.single = async () => ({ data: { data: snapshot }, error: null });
    b.maybeSingle = async () => ({ data: null, error: null });
    b.then = (resolve: (v: unknown) => void) => resolve(result);
    return b;
  };
  client.from = () => builder({ data: revisions, error: null });
  client.rpc = async () => ({ data: [{ id: 'u1', name: 'Tim O’Brien' }, { id: 'u2', name: 'Dr. Jane Kaser' }], error: null });
  // `functions` is a getter that builds a new client each time.
  const invoke = async (fn: string, opts: { body?: { preview?: boolean } }) =>
    fn === 'billing-api'
      ? { data: null, error: new Error('Network connection was lost.') }
      : opts?.body?.preview ? { data: { practiceName: 'SoCal Veterinary Dentistry', alreadyMember: false }, error: null } : { data: {}, error: null };
  Object.defineProperty(client, 'functions', { configurable: true, value: { invoke } });
}

const profile = {
  practiceName: '', doctorName: '', logoUrl: '', practiceId: '', loaded: true,
  update: async () => undefined, uploadLogo: async () => undefined,
} as unknown as UseProfileReturn;

function Consent() {
  // After <DialogHost /> (a sibling mounted after this) has registered.
  React.useEffect(() => {
    const id = window.setTimeout(() => void ensureAiConsent(), 50);
    return () => window.clearTimeout(id);
  }, []);
  return null;
}

const FIXTURES: Record<string, () => React.ReactElement> = {
  documents: () => <DocumentsModal open onClose={() => {}} initialTab="chart" chartSnapshot={previewSnapshot} />,
  'documents-owner': () => (
    <DocumentsModal
      open
      onClose={() => {}}
      initialTab="owner"
      chartSnapshot={previewSnapshot}
      ownerReport={{
        snapshot, branding: { practiceName: 'SoCal Veterinary Dentistry', doctorName: 'Dr. Jane Kaser', logoUrl: '' },
        imageRoles: {}, chartId: '', practiceId: '', cloudActive: false, onEditWording: () => {},
      }}
    />
  ),
  'whats-new': () => <WhatsNewModal onClose={() => {}} />,
  feedback: () => (
    <FeedbackModal onClose={() => {}} section="exam" transcript="[10:02] 104 gingival index 2, 108 fractured, slab fracture" />
  ),
  history: () => <ChartHistoryModal chartId="c1" onClose={() => {}} onRestore={async () => true} label="Bella · Nov 12, 2026" />,
  reminder: () => (
    <ReminderModal
      open onClose={() => {}} practiceId="" practiceName="SoCal Veterinary Dentistry" chartId="c1"
      toEmail="sam@example.com" patientName="Bella" ownerName="Sam" recheckDate="May 12, 2027"
    />
  ),
  join: () => <JoinPracticeModal token="t1" onDone={() => {}} />,
  finish: () => (
    <FinishSetupModal need={{ practice: true, doctor: true, suggestedDoctor: 'Jane Kaser', userId: 'u1' }} profile={profile} onDone={() => {}} />
  ),
  consent: () => <Consent />,
  session: () => <SessionExpiredOverlay email="jane@socalvetdentistry.com" onSignOut={() => {}} />,
  lock: () => <AppLockOverlay lockOnLaunch />,
  inactive: () => <InactivePlan />,
  // The subscription check failed and there is no cached status.
  'billing-error': () => <BillingGate><p>Signed in</p></BillingGate>,
  // Long (French-length) bar labels, for the bar-layout check at large text sizes.
  // Sheet form rows: a text field and a switch row with long labels (check
  // at large text sizes: only the text field drops under its label).
  'field-controls': () => (
    <Sheet open onClose={() => {}} title="Field rows" onDone={() => {}}>
      <div className="ios-form">
        <div className="ios-form-group">
          <label className="ios-field">
            <span className="ios-field__label">Practice name</span>
            <input className="ios-field__input" defaultValue="SoCal Veterinary Dentistry" />
          </label>
          <label className="ios-field">
            <span className="ios-field__label">Email reminders to owners</span>
            <span className="ios-field__control">
              <input type="checkbox" role="switch" className="ios-switch" defaultChecked />
            </span>
          </label>
          <label className="ios-field">
            <span className="ios-field__label">Doctor name</span>
            <input className="ios-field__input" defaultValue="Dr. Jane Kaser" />
          </label>
        </div>
      </div>
    </Sheet>
  ),
  'bar-long': () => (
    <Sheet open onClose={() => {}} title="Envoyer un rappel de contrôle" cancelLabel="Abandonner les modifications" doneLabel="Enregistrer et envoyer" onDone={() => {}}>
      <p style={{ padding: 20 }}>Contenu</p>
    </Sheet>
  ),
};

export default function SheetFixtures() {
  const name = new URLSearchParams(window.location.search).get('iosFixture') ?? '';
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    patchCloud();
    setReady(true);
  }, []);
  const render = FIXTURES[name];
  return (
    <div className="ios-fixture-backdrop" style={{ minHeight: '100dvh', background: 'var(--ios-bg-grouped)' }}>
      {!render && <p style={{ padding: 40 }}>Unknown fixture. Try: {Object.keys(FIXTURES).join(', ')}</p>}
      {ready && render?.()}
    </div>
  );
}
