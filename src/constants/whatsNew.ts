import i18n from '../i18n';
import type whatsNew from '../locales/en/whatsNew.json';

/**
 * The "What's new" announcement, shown once per account (the id is stored
 * in the person's chart settings). To announce a new batch: change `id`
 * and replace the groups and their catalog entries (whatsNew:<item>.title|body,
 * whatsNew:groups.<group>) — everyone who saw the old one sees this once.
 *
 * Text fields are getters read in the active language each time.
 */

type GroupId = keyof typeof whatsNew.groups;
type ItemId = Exclude<keyof typeof whatsNew, 'title' | 'intro' | 'groups' | 'gotIt'>;
type AppBody = 'severalTeeth' | 'customize' | 'leftOff';

/** Items whose app wording differs (keyed by item id). */
const APP_BODIES: Partial<Record<ItemId, AppBody>> = {
  severalTeeth: 'severalTeeth',
  makeItYours: 'customize',
  startsWhereLeft: 'leftOff',
};

export interface WhatsNewItem {
  id: ItemId;
  readonly title: string;
  readonly body: string;
  /** In the iOS app, the body from `settings:whatsNew.<appBody>` instead —
   *  for items that speak mouse and keyboard or name web-only places. */
  appBody?: AppBody;
}

export interface WhatsNewGroup {
  id: GroupId;
  readonly heading: string;
  items: WhatsNewItem[];
}

const tw = () => i18n.getFixedT(i18n.language, 'whatsNew');

const item = (id: ItemId): WhatsNewItem => ({
  id,
  appBody: APP_BODIES[id],
  get title() {
    return tw()(`${id}.title`);
  },
  get body() {
    return tw()(`${id}.body`);
  },
});

const group = (id: GroupId, items: ItemId[]): WhatsNewGroup => ({
  id,
  get heading() {
    return tw()(`groups.${id}`);
  },
  items: items.map(item),
});

export const WHATS_NEW: { id: string; readonly title: string; readonly intro: string; groups: WhatsNewGroup[] } = {
  id: '2026-11-12',
  get title() {
    return tw()('title');
  },
  get intro() {
    return tw()('intro');
  },
  groups: [
    group('dictation', ['dictateAnywhere', 'finalCheck', 'phones', 'understandsMore']),
    group('charting', ['pocketPerRoot', 'severalTeeth', 'makeItYours']),
    group('records', ['radiographicFindings', 'anesthesia', 'skipRecheck']),
    group('ownerReport', ['writeWithAi', 'customizeReport']),
    group('everyday', ['startsWhereLeft', 'sendFeedback']),
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
