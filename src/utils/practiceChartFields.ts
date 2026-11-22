import { isChoiceInput, NOTE_INPUT_TYPES, NOTE_OPTION_LENGTH, NOTE_OPTION_LIMIT, type NoteInputType } from './consultationTemplates';

export const PRACTICE_CHART_PAGES = ['patient', 'exam', 'anesthesia', 'images'] as const;
export type PracticeChartPage = typeof PRACTICE_CHART_PAGES[number];

export interface SharedPracticeField {
  id: string;
  label: string;
  guidance?: string;
  inputType?: NoteInputType;
  options?: readonly string[];
}

export interface PracticeChartFieldConfig {
  fields: SharedPracticeField[];
  pages: Partial<Record<PracticeChartPage, SharedPracticeField[]>>;
}

export const EMPTY_PRACTICE_CHART_FIELDS: PracticeChartFieldConfig = { fields: [], pages: {} };
export const PRACTICE_CHART_FIELD_LIMIT = 128;
export const PRACTICE_CHART_PAGE_FIELD_LIMIT = 24;
const PRACTICE_CHART_CONFIG_BYTES = 196608;
const FIELD_ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isValidText(value: unknown, limit: number): value is string {
  // PostgreSQL jsonb rejects null characters and unpaired UTF-16 surrogates.
  return typeof value === 'string' && !value.includes('\0') && !/[\uD800-\uDFFF]/u.test(value)
    && [...value].length <= limit;
}

export function parsePracticeChartField(value: unknown): SharedPracticeField | undefined {
  if (!isRecord(value) || Object.keys(value).some(key => !['id', 'label', 'guidance', 'inputType', 'options'].includes(key))) return undefined;
  const { id, label, guidance, options } = value;
  if (typeof id !== 'string' || !FIELD_ID.test(id) || !isValidText(label, 100) || !label.trim()
    || (guidance !== undefined && !isValidText(guidance, 1000))) return undefined;

  const inputType = NOTE_INPUT_TYPES.find(type => type === value.inputType);
  if (value.inputType !== undefined && inputType === undefined) return undefined;
  if (isChoiceInput(inputType) !== (options !== undefined)) return undefined;
  if (options !== undefined && (!Array.isArray(options) || !options.length || options.length > NOTE_OPTION_LIMIT
    || new Set(options).size !== options.length || [...options].some(option => !isValidText(option, NOTE_OPTION_LENGTH)
      || !option || option.trim() !== option || /[\r\n]/u.test(option)))) return undefined;

  return { id, label: label.trim(), ...(guidance ? { guidance } : {}), ...(inputType ? { inputType } : {}),
    ...(options ? { options: [...options] } : {}) };
}

function parseFieldList(value: unknown, limit: number): SharedPracticeField[] | undefined {
  if (!Array.isArray(value) || value.length > limit) return undefined;
  const fields: SharedPracticeField[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const field = parsePracticeChartField(item);
    if (!field || seen.has(field.id)) return undefined;
    fields.push(field);
    seen.add(field.id);
  }
  return fields;
}

/** PostgreSQL jsonb adds a space after each object colon and list separator. */
function jsonbSpaces(value: unknown): number {
  if (Array.isArray(value)) return Math.max(0, value.length - 1) + value.reduce((bytes, entry) => bytes + jsonbSpaces(entry), 0);
  if (!isRecord(value)) return 0;
  const entries = Object.values(value);
  return entries.length + Math.max(0, entries.length - 1) + entries.reduce<number>((bytes, entry) => bytes + jsonbSpaces(entry), 0);
}

export function parsePracticeChartFieldConfig(value: unknown): PracticeChartFieldConfig | undefined {
  if (!isRecord(value) || Object.keys(value).some(key => key !== 'fields' && key !== 'pages') || !isRecord(value.pages)) return undefined;
  const fields = parseFieldList(value.fields, PRACTICE_CHART_FIELD_LIMIT);
  if (!fields) return undefined;

  const pages: PracticeChartFieldConfig['pages'] = {};
  for (const [key, items] of Object.entries(value.pages)) {
    const page = PRACTICE_CHART_PAGES.find(candidate => candidate === key);
    if (!page) return undefined;
    const placements = parseFieldList(items, PRACTICE_CHART_PAGE_FIELD_LIMIT);
    if (!placements) return undefined;
    pages[page] = placements;
  }

  const config = { fields, pages };
  return new TextEncoder().encode(JSON.stringify(config)).byteLength + jsonbSpaces(config) <= PRACTICE_CHART_CONFIG_BYTES ? config : undefined;
}
