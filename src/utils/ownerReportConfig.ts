import { ReportLocale, isReportLocale, reportStrings } from './ownerReportI18n';

/**
 * Per-practice owner report customization. A practice keeps one or more
 * templates (stored as JSON in practices.owner_report_config); each chart
 * picks one (OwnerReportOverrides.templateId) or falls back to the
 * practice default. With no config at all, DEFAULT_TEMPLATE reproduces
 * the original fixed report exactly.
 *
 * Everything here is pure (no React, no Supabase) so it can be unit
 * tested and shared by the model builder, the PDF, and the editor UI.
 */

export const BUILT_IN_SECTION_IDS = [
  'diagram',
  'extractions',
  'findings',
  'alreadyMissing',
  'examNotes',
  'photos',
  'teamNote',
  'homecare',
  'recheck',
] as const;

export type BuiltInSectionId = (typeof BUILT_IN_SECTION_IDS)[number];

export interface BuiltInReportSection {
  id: BuiltInSectionId;
  enabled: boolean;
  /** Custom heading; '' = the default heading. Placeholders allowed. */
  title: string;
}

export interface CustomReportSection {
  /** 'custom-<uuid>'. */
  id: string;
  enabled: boolean;
  title: string;
  /** Free text printed under the heading. Placeholders allowed. */
  body: string;
}

export type ReportSectionConfig = BuiltInReportSection | CustomReportSection;

export interface OwnerReportTemplate {
  id: string;
  name: string;
  /** Header title (top right of page one). */
  title: string;
  /** Opening paragraph template; '' = use the generated intro. */
  introTemplate: string;
  /** Section order + visibility. */
  sections: ReportSectionConfig[];
  /** Default home-care tips; empty = the generated defaults. */
  homecareTips: string[];
  /** Printed after the recheck line, before the "Prepared by" line. */
  closingNote: string;
  /** Small contact line printed at the bottom of every page. */
  footer: string;
  /** "Upper right canine tooth (104)" vs "Upper right canine tooth". */
  showToothNumbers: boolean;
  /** Keep "(grade 2)" / "(6 mm)" in findings, or drop them. */
  showGrades: boolean;
  /** Language of every generated sentence (headings, findings, tooth
   *  names, defaults). Typed text prints as written. */
  language: ReportLocale;
  /** 'iso' prints dates as charted (2026-07-19); 'long' spells them out
   *  in the report language. */
  dateFormat: 'iso' | 'long';
}

export interface OwnerReportConfig {
  templates: OwnerReportTemplate[];
  defaultTemplateId: string;
}

/** Everything the report-building code needs beyond the snapshot. */
export interface OwnerReportContext {
  config?: OwnerReportConfig | null;
  practiceName?: string;
  doctorName?: string;
}

export const DEFAULT_TEMPLATE_ID = 'default';
export const DEFAULT_REPORT_TITLE = 'Dental Visit Report';

/** Human labels for the built-in sections (editor list). */
export const SECTION_LABELS: Record<BuiltInSectionId, string> = {
  diagram: 'Mouth diagram',
  extractions: 'Teeth removed',
  findings: 'What we found',
  alreadyMissing: 'Already missing',
  examNotes: 'Other exam notes',
  photos: 'Before & after photos',
  teamNote: 'Note from the team',
  homecare: 'Home care tips',
  recheck: 'Recheck date',
};

/** Default headings ({pet} / {Pet} are filled at render time). */
export const DEFAULT_SECTION_TITLES: Record<BuiltInSectionId, string> = {
  diagram: '{Pet}’s mouth',
  extractions: 'Teeth removed during this visit',
  findings: 'What we found',
  alreadyMissing: 'Already missing before this visit',
  examNotes: 'Other exam notes',
  photos: 'Before & after',
  teamNote: 'A note from your veterinary team',
  homecare: 'Caring for {pet}’s teeth at home',
  recheck: 'Recommended recheck',
};

/** Today's fixed order (extractions print before the diagram). */
const DEFAULT_SECTION_ORDER: BuiltInSectionId[] = [
  'extractions',
  'diagram',
  'findings',
  'alreadyMissing',
  'examNotes',
  'photos',
  'teamNote',
  'homecare',
  'recheck',
];

export const PLACEHOLDERS = ['pet', 'owner', 'species', 'date', 'practice', 'doctor'] as const;
export type PlaceholderKey = (typeof PLACEHOLDERS)[number];

export const MAX_TEMPLATES = 20;
export const MAX_CONFIG_BYTES = 50 * 1024;

export function isBuiltInSectionId(id: string): id is BuiltInSectionId {
  return (BUILT_IN_SECTION_IDS as readonly string[]).includes(id);
}

export function isCustomSection(section: ReportSectionConfig): section is CustomReportSection {
  return section.id.startsWith('custom-');
}

export function newId(prefix = ''): string {
  let uuid: string;
  try {
    uuid = crypto.randomUUID();
  } catch {
    uuid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
  return `${prefix}${uuid}`;
}

export function defaultSections(): BuiltInReportSection[] {
  return DEFAULT_SECTION_ORDER.map((id) => ({ id, enabled: true, title: '' }));
}

export const DEFAULT_TEMPLATE: OwnerReportTemplate = Object.freeze({
  id: DEFAULT_TEMPLATE_ID,
  name: 'Standard',
  title: DEFAULT_REPORT_TITLE,
  introTemplate: '',
  sections: defaultSections(),
  homecareTips: [],
  closingNote: '',
  footer: '',
  showToothNumbers: true,
  showGrades: true,
  language: 'en',
  dateFormat: 'iso',
}) as OwnerReportTemplate;

export function defaultTemplate(): OwnerReportTemplate {
  return { ...DEFAULT_TEMPLATE, sections: defaultSections(), homecareTips: [] };
}

export function defaultConfig(): OwnerReportConfig {
  return { templates: [defaultTemplate()], defaultTemplateId: DEFAULT_TEMPLATE_ID };
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

function normalizeSections(raw: unknown): ReportSectionConfig[] {
  const out: ReportSectionConfig[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!isObj(item)) continue;
      const id = str(item.id);
      if (!id || seen.has(id)) continue;
      if (isBuiltInSectionId(id)) {
        out.push({ id, enabled: bool(item.enabled, true), title: str(item.title) });
        seen.add(id);
      } else if (id.startsWith('custom-')) {
        out.push({ id, enabled: bool(item.enabled, true), title: str(item.title), body: str(item.body) });
        seen.add(id);
      }
    }
  }
  // Built-ins missing from a stored config (older shape, or a section
  // added in a later release) slot in at their default relative position.
  DEFAULT_SECTION_ORDER.forEach((id, defaultIndex) => {
    if (seen.has(id)) return;
    const section: BuiltInReportSection = { id, enabled: true, title: '' };
    // Insert after the nearest preceding default section already present.
    let insertAt = 0;
    for (let i = defaultIndex - 1; i >= 0; i--) {
      const idx = out.findIndex((s) => s.id === DEFAULT_SECTION_ORDER[i]);
      if (idx !== -1) {
        insertAt = idx + 1;
        break;
      }
    }
    out.splice(insertAt, 0, section);
    seen.add(id);
  });
  return out;
}

export function normalizeTemplate(raw: unknown, fallbackId?: string): OwnerReportTemplate {
  const t = isObj(raw) ? raw : {};
  const tips = Array.isArray(t.homecareTips)
    ? t.homecareTips.filter((x): x is string => typeof x === 'string')
    : typeof t.homecareTips === 'string'
      ? t.homecareTips.split('\n')
      : [];
  const language: ReportLocale = isReportLocale(t.language) ? t.language : 'en';
  return {
    id: str(t.id) || fallbackId || newId('tpl-'),
    name: str(t.name).trim() || 'Untitled template',
    title: typeof t.title === 'string' ? t.title : reportStrings(language).defaultTitle,
    introTemplate: str(t.introTemplate),
    sections: normalizeSections(t.sections),
    homecareTips: tips,
    closingNote: str(t.closingNote),
    footer: str(t.footer),
    showToothNumbers: bool(t.showToothNumbers, true),
    showGrades: bool(t.showGrades, true),
    language,
    dateFormat: t.dateFormat === 'long' ? 'long' : 'iso',
  };
}

/** Tolerates null, garbage, and older/partial shapes; always returns a
 *  config with at least one template and a valid default id. */
export function normalizeConfig(raw: unknown): OwnerReportConfig {
  if (!isObj(raw)) return defaultConfig();
  const templates: OwnerReportTemplate[] = [];
  const ids = new Set<string>();
  if (Array.isArray(raw.templates)) {
    for (const item of raw.templates.slice(0, MAX_TEMPLATES)) {
      if (!isObj(item)) continue;
      let tpl = normalizeTemplate(item);
      if (ids.has(tpl.id)) tpl = { ...tpl, id: newId('tpl-') };
      ids.add(tpl.id);
      templates.push(tpl);
    }
  }
  if (templates.length === 0) templates.push(defaultTemplate());
  const wanted = str(raw.defaultTemplateId);
  return {
    templates,
    defaultTemplateId: templates.some((t) => t.id === wanted) ? wanted : templates[0].id,
  };
}

/** The template a chart renders with: its chosen id, else the practice
 *  default, else the built-in default. */
export function resolveTemplate(
  config: OwnerReportConfig | null | undefined,
  templateId?: string
): OwnerReportTemplate {
  if (!config || config.templates.length === 0) return DEFAULT_TEMPLATE;
  return (
    (templateId && config.templates.find((t) => t.id === templateId)) ||
    config.templates.find((t) => t.id === config.defaultTemplateId) ||
    config.templates[0]
  );
}

export type PlaceholderValues = Partial<Record<PlaceholderKey, string>>;

/** Replaces {pet}, {owner}, {species}, {date}, {practice}, {doctor}.
 *  Matching is case-insensitive; a capitalized token ({Pet}) capitalizes
 *  the first letter of the value. Unknown tokens are left untouched. */
export function fillPlaceholders(text: string, values: PlaceholderValues): string {
  return text.replace(/\{([a-zA-Z]+)\}/g, (match, name: string) => {
    const key = name.toLowerCase() as PlaceholderKey;
    if (!(PLACEHOLDERS as readonly string[]).includes(key)) return match;
    const value = values[key] ?? '';
    if (name[0] === name[0].toUpperCase() && value) {
      return value.charAt(0).toUpperCase() + value.slice(1);
    }
    return value;
  });
}

/** Serialized size guard — mirrors the edge function's cap. */
export function configByteSize(config: OwnerReportConfig): number {
  return new TextEncoder().encode(JSON.stringify(config)).length;
}
