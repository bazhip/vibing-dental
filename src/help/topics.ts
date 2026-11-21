import type help from '../locales/en/help.json';

export const HELP_GROUPS = {
  start: ['start', 'account', 'patients'],
  clinical: ['charting', 'by-number', 'exam', 'consultation', 'consultation-templates', 'imaging', 'viewer', 'dictation', 'treatment'],
  output: ['consultation-transfer', 'discharge', 'export', 'rechecks', 'recovery'],
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
  exam: [
    { caption: 'exam', src: '/help/screenshots/exam.jpg', width: 984, height: 660, section: 'first' },
    { caption: 'examCustomize', src: '/help/screenshots/exam-customize.jpg', width: 964, height: 784, section: 'first' },
  ],
  consultation: [
    { caption: 'dentalConsultation', src: '/help/screenshots/dental-consultation.jpg', width: 1240, height: 1100, section: 'second' },
    { caption: 'consultationMedicationHistory', src: '/help/screenshots/consultation-medication-history.jpg', width: 1100, height: 780, section: 'second' },
    { caption: 'consultationMedicationReview', src: '/help/screenshots/consultation-medication-review.jpg', width: 1000, height: 1000, section: 'second' },
    { caption: 'consultationReview', src: '/help/screenshots/consultation-review.jpg', width: 1200, height: 780, section: 'second' },
  ],
  'consultation-templates': [{ caption: 'consultationBuilder', src: '/help/screenshots/consultation-builder.jpg', width: 832, height: 928, section: 'second' }],
  'consultation-transfer': [{ caption: 'consultationRecordNote', src: '/help/screenshots/consultation-record-note.jpg', width: 1100, height: 780, section: 'first' }],
  viewer: [{ caption: 'viewer', src: '/help/screenshots/viewer.jpg', width: 1200, height: 772, section: 'second' }],
  treatment: [{ caption: 'treatment', src: '/help/screenshots/treatment.jpg', width: 976, height: 367, section: 'second' }],
  preferences: [
    { caption: 'preferences', src: '/help/screenshots/preferences.jpg', width: 960, height: 772, section: 'first' },
    { caption: 'imagingSettings', src: '/help/screenshots/imaging-settings.jpg', width: 960, height: 780, section: 'third' },
  ],
  'help-tools': [{ caption: 'help-tools', src: '/help/screenshots/help-menu.jpg', width: 354, height: 329, section: 'first' }],
  charting: [{ caption: 'charting', src: '/screenshots/feat-grid.jpg', width: 1400, height: 515, section: 'first' }],
  imaging: [
    { caption: 'attachmentNames', src: '/help/screenshots/attachment-names.jpg', width: 968, height: 233, section: 'first' },
    { caption: 'imagingTemplates', src: '/help/screenshots/imaging.jpg', width: 1240, height: 686, section: 'third' },
  ],
  dictation: [
    { caption: 'dictation', src: '/help/screenshots/dictation.jpg', width: 1440, height: 705, section: 'third' },
    { caption: 'dictationCheck', src: '/help/screenshots/dictation-check.jpg', width: 352, height: 290, section: 'third' },
  ],
  discharge: [
    { caption: 'dischargeTemplates', src: '/help/screenshots/discharge-templates.jpg', width: 836, height: 922, section: 'first' },
    { caption: 'owner', src: '/help/screenshots/owner-report.jpg', width: 976, height: 438, section: 'second' },
  ],
  export: [{ caption: 'export', src: '/help/screenshots/review-export.jpg', width: 1280, height: 772, section: 'second' }],
  'by-number': [{ caption: 'by-number', src: '/help/screenshots/by-tooth.jpg', width: 984, height: 916, section: 'first' }],
};

export const CHART_CUSTOMIZATION_CATEGORIES = ['patient', 'exam', 'anesthesia', 'charting', 'diagnosis', 'procedure', 'images'] as const;

export const RELATED_HELP: Record<HelpTopic, readonly HelpTopic[]> = {
  start: ['patients', 'by-number', 'export'],
  account: ['settings', 'team', 'troubleshooting'],
  patients: ['start', 'consultation', 'export', 'rechecks'],
  charting: ['by-number', 'preferences', 'dictation'],
  'by-number': ['charting', 'preferences', 'dictation'],
  exam: ['imaging', 'preferences', 'charting', 'dictation', 'treatment', 'consultation'],
  consultation: ['patients', 'consultation-templates', 'consultation-transfer', 'dictation'],
  'consultation-templates': ['consultation', 'consultation-transfer', 'team'],
  'consultation-transfer': ['consultation', 'consultation-templates', 'export'],
  imaging: ['exam', 'preferences', 'viewer', 'dictation', 'export'],
  viewer: ['imaging', 'dictation', 'export'],
  dictation: ['charting', 'imaging', 'troubleshooting'],
  treatment: ['charting', 'discharge', 'export'],
  discharge: ['treatment', 'imaging', 'export'],
  export: ['discharge', 'recovery', 'troubleshooting', 'consultation-transfer'],
  recovery: ['patients', 'export', 'troubleshooting'],
  rechecks: ['patients', 'discharge', 'settings'],
  settings: ['account', 'preferences', 'team'],
  preferences: ['exam', 'imaging', 'by-number', 'treatment', 'export'],
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
