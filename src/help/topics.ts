import type help from '../locales/en/help.json';

export const HELP_GROUPS = {
  start: ['start', 'account', 'patients'],
  clinical: ['charting', 'by-number', 'exam', 'imaging', 'viewer', 'dictation', 'treatment'],
  output: ['discharge', 'export', 'rechecks', 'recovery'],
  practice: ['settings', 'preferences', 'team', 'billing', 'troubleshooting', 'help-tools'],
} as const;

export type HelpTopic = typeof HELP_GROUPS[keyof typeof HELP_GROUPS][number];
export const HELP_TOPICS = Object.values(HELP_GROUPS).flat();
export const HELP_SECTIONS = ['first', 'second', 'third'] as const;

type HelpScreenshot = {
  caption: keyof typeof help.images;
  src: string;
  width: number;
  height: number;
  section: typeof HELP_SECTIONS[number];
};

export const HELP_SCREENSHOTS: Partial<Record<HelpTopic, readonly HelpScreenshot[]>> = {
  start: [{ caption: 'start', src: '/help/screenshots/chart-overview.jpg', width: 1280, height: 605, section: 'first' }],
  patients: [{ caption: 'patients', src: '/help/screenshots/patient-history.jpg', width: 1132, height: 772, section: 'third' }],
  exam: [{ caption: 'exam', src: '/help/screenshots/exam.jpg', width: 976, height: 508, section: 'first' }],
  viewer: [{ caption: 'viewer', src: '/help/screenshots/viewer.jpg', width: 1200, height: 712, section: 'second' }],
  treatment: [{ caption: 'treatment', src: '/help/screenshots/treatment.jpg', width: 976, height: 394, section: 'second' }],
  preferences: [
    { caption: 'preferences', src: '/help/screenshots/preferences.jpg', width: 960, height: 772, section: 'first' },
    { caption: 'imagingSettings', src: '/help/screenshots/imaging-settings.jpg', width: 960, height: 780, section: 'third' },
  ],
  'help-tools': [{ caption: 'help-tools', src: '/help/screenshots/help-menu.jpg', width: 354, height: 329, section: 'first' }],
  charting: [{ caption: 'charting', src: '/screenshots/feat-grid.jpg', width: 1400, height: 515, section: 'first' }],
  imaging: [{ caption: 'imaging', src: '/help/screenshots/imaging.jpg', width: 942, height: 598, section: 'third' }],
  dictation: [{ caption: 'dictation', src: '/help/screenshots/dictation.jpg', width: 600, height: 952, section: 'second' }],
  discharge: [{ caption: 'owner', src: '/help/screenshots/owner-report.jpg', width: 982, height: 298, section: 'second' }],
  export: [{ caption: 'export', src: '/screenshots/feat-pdf.jpg', width: 1400, height: 1081, section: 'first' }],
  'by-number': [{ caption: 'by-number', src: '/help/screenshots/by-tooth.jpg', width: 942, height: 1039, section: 'first' }],
};

export const CHART_CUSTOMIZATION_CATEGORIES = ['patient', 'exam', 'anesthesia', 'charting', 'diagnosis', 'procedure', 'images'] as const;

export const RELATED_HELP: Record<HelpTopic, readonly HelpTopic[]> = {
  start: ['patients', 'by-number', 'export'],
  account: ['settings', 'team', 'troubleshooting'],
  patients: ['start', 'export', 'rechecks'],
  charting: ['by-number', 'preferences', 'dictation'],
  'by-number': ['charting', 'preferences', 'dictation'],
  exam: ['charting', 'dictation', 'treatment'],
  imaging: ['viewer', 'dictation', 'export'],
  viewer: ['imaging', 'dictation', 'export'],
  dictation: ['charting', 'imaging', 'troubleshooting'],
  treatment: ['charting', 'discharge', 'export'],
  discharge: ['treatment', 'imaging', 'export'],
  export: ['discharge', 'recovery', 'troubleshooting'],
  recovery: ['patients', 'export', 'troubleshooting'],
  rechecks: ['patients', 'discharge', 'settings'],
  settings: ['account', 'preferences', 'team'],
  preferences: ['by-number', 'treatment', 'export'],
  team: ['account', 'discharge', 'billing'],
  billing: ['team', 'account', 'help-tools'],
  'help-tools': ['start', 'account', 'troubleshooting'],
  troubleshooting: ['patients', 'dictation', 'export'],
};

type SearchableTopic = { id: HelpTopic; title: string; excerpt: string; text: string };

function searchable(value: string) {
  return value.normalize('NFKD').toLowerCase().replace(/\p{Mark}+/gu, '');
}

export function searchHelp(articles: readonly SearchableTopic[], query: string) {
  const words = searchable(query.trim()).split(/\s+/u).filter(Boolean);
  if (!words.length) return [];
  return articles.map(article => {
    const title = searchable(article.title);
    const text = searchable(`${article.excerpt} ${article.text}`);
    const score = words.every(word => title.includes(word) || text.includes(word))
      ? words.reduce((sum, word) => sum + (title.includes(word) ? 3 : 1), 0)
      : 0;
    return { article, score };
  }).filter(result => result.score > 0)
    .sort((first, second) => second.score - first.score)
    .map(result => result.article);
}

export function helpRoute(hash: string) {
  const [topic, section] = hash.replace(/^#/, '').split('/');
  return {
    topic: HELP_TOPICS.find(id => id === topic),
    section: HELP_SECTIONS.find(id => id === section),
  };
}
