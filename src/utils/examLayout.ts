import { EXAM_ITEMS, type ExamFindings } from '../types';
import { MAX_EXAM_LABEL, type CustomExamAreaDef } from './customExam';

export type ExamLayoutField =
  | { id: string; kind: 'area'; label?: string }
  | { id: string; kind: 'text'; label?: string };

export const EXAM_LAYOUT_LIMIT = 24;
export const EXAM_DIAGNOSTICS_ID = 'gpDiagnostics';

const builtInIds = new Set<string>(EXAM_ITEMS.map(({ key }) => key));

export function isBuiltInExamArea(id: string): id is keyof ExamFindings {
  return builtInIds.has(id);
}

const textPrefix = 'exam-text-';

export function isCustomExamText(id: string): boolean {
  return id.startsWith(textPrefix);
}

export function newExamLayoutFieldId(kind: ExamLayoutField['kind']): string {
  const prefix = kind === 'text' ? textPrefix : 'exam-area-';
  return prefix + crypto.randomUUID().replace(/-/gu, '').slice(0, 24);
}

export const DEFAULT_EXAM_LAYOUT: ExamLayoutField[] = [
  ...EXAM_ITEMS.map(({ key: id }) => ({ id, kind: 'area' as const })),
  { id: EXAM_DIAGNOSTICS_ID, kind: 'text' },
];

export function legacyExamLayout(areas: CustomExamAreaDef[], hidden: string[]): ExamLayoutField[] {
  return [
    ...DEFAULT_EXAM_LAYOUT.filter(field => field.kind === 'area' && !hidden.includes(field.id)),
    ...areas.flatMap(({ id, label }): ExamLayoutField[] =>
      label.trim() && /^[A-Za-z0-9_-]{1,40}$/u.test(id) && !hidden.includes(id) && !isBuiltInExamArea(id) &&
      id !== EXAM_DIAGNOSTICS_ID && !isCustomExamText(id) ? [{ id, kind: 'area', label: label.trim() }] : []),
    { id: EXAM_DIAGNOSTICS_ID, kind: 'text' },
  ];
}

/** Validates practice writes and tolerates surrounding whitespace in field names. */
export function parseExamLayout(value: unknown): ExamLayoutField[] | undefined {
  if (!Array.isArray(value) || value.length > EXAM_LAYOUT_LIMIT) return;
  const fields: ExamLayoutField[] = [];
  const ids = new Set<string>();
  for (const field of value) {
    if (!field || typeof field !== 'object' || Array.isArray(field)) return;
    const { id, kind, label: rawLabel } = field;
    if (Object.keys(field).some(key => key !== 'id' && key !== 'kind' && key !== 'label') ||
      typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/u.test(id) || ids.has(id)) return;
    const expected = id === EXAM_DIAGNOSTICS_ID || isCustomExamText(id) ? 'text' : 'area';
    if (kind !== expected) return;
    if (rawLabel !== undefined && (typeof rawLabel !== 'string' || [...rawLabel].length > MAX_EXAM_LABEL)) return;
    const label = rawLabel?.trim();
    if (!label && !isBuiltInExamArea(id) && id !== EXAM_DIAGNOSTICS_ID) return;
    fields.push(label ? { id, kind, label } : { id, kind });
    ids.add(id);
  }
  return fields;
}
