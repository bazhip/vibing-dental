/**
 * The "What's new" announcement, shown once per account (the id is stored
 * in the person's chart settings). To announce a new batch: change `id`
 * and replace the groups — everyone who saw the old one sees this once.
 */

export interface WhatsNewItem {
  title: string;
  body: string;
  /** In the iOS app, the body from `settings:whatsNew.<appBody>` instead —
   *  for items that speak mouse and keyboard or name web-only places. */
  appBody?: 'severalTeeth' | 'customize' | 'leftOff';
}

export interface WhatsNewGroup {
  heading: string;
  items: WhatsNewItem[];
}

export const WHATS_NEW: { id: string; title: string; intro: string; groups: WhatsNewGroup[] } = {
  id: '2026-11-12',
  title: 'What’s new in ToothOps',
  intro: 'A big round of updates, most of them straight from your feedback — thank you!',
  groups: [
    {
      heading: 'Dictation',
      items: [
        { title: 'Dictate from any page', body: 'The button is now 🎤 Dictate. Talk through your findings from wherever you are — each one lands in the right place.' },
        { title: 'More accurate, with a final check', body: 'It catches findings split across pauses and your corrections. When you tap Stop it re-reads the whole recording and lists anything it wasn’t sure about under Needs review.' },
        { title: 'Better on phones', body: 'Dictation opens full screen and keeps your screen awake while you talk.' },
        { title: 'Understands more', body: '“GE 3” for enlargement, pocket depths per root, the caudal maxillary block and radiographic findings.' },
      ],
    },
    {
      heading: 'Charting',
      items: [
        { title: 'Pocket depth per root', body: 'Charting → Customize → One per root. Multi-rooted teeth get a labelled box per root (M / D, or MB / MP / D).' },
        { title: 'Set several teeth at once', body: 'Click tooth numbers in the grid (Shift-click for a range), then set one score on all of them.', appBody: 'severalTeeth' },
        { title: 'Make it yours', body: 'Every page has a Customize button: hide columns, choose what shows beside the teeth, what the Space key does, and more. Settings follow your account to every device.', appBody: 'customize' },
      ],
    },
    {
      heading: 'Records',
      items: [
        { title: 'Radiographic findings', body: 'A dedicated box on the Images page. It prints on the PDF above the treatment report.' },
        { title: 'Anesthesia', body: 'Caudal maxillary block added. Hide the blocks you don’t use, and save your usual anesthetic for one-tap entry.' },
        { title: 'Skip the recheck field', body: 'Don’t use recheck reminders? Patient → Customize → Hide the Recheck due field.' },
      ],
    },
    {
      heading: 'Owner report',
      items: [
        { title: '✨ Write with AI', body: 'Drafts the opening summary and home care advice from the chart, using only what you charted. You review before printing.' },
        { title: 'Customize the report', body: 'Change its layout, wording and language right from the Owner Report page.' },
      ],
    },
    {
      heading: 'Everyday',
      items: [
        { title: 'Starts where you left off', body: 'Opening ToothOps fresh shows My charts — unless today’s visit is still open — and today’s visit opens ready to edit.', appBody: 'leftOff' },
        { title: 'Send feedback in two taps', body: 'Settings → Send feedback, or Feedback in the dictation panel (it can attach your transcript). It comes straight to us.' },
      ],
    },
  ],
};

/** Show the announcement now? Once per account, after its settings load,
 *  never on a device's first run (the walkthrough covers that) or while
 *  the walkthrough is open, and only for signed-in accounts. */
export function shouldShowWhatsNew(s: {
  signedIn: boolean;
  settingsLoaded: boolean;
  seenId: string;
  onboardedDevice: boolean;
  walkthroughOpen: boolean;
}): boolean {
  return s.signedIn && s.settingsLoaded && s.onboardedDevice && !s.walkthroughOpen && s.seenId !== WHATS_NEW.id;
}
