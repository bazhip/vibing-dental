import type { CustomExamValue, ExamFinding } from '../types';

/**
 * Custom exam areas.
 *
 * Definitions are per person (chart settings → Exam): extra structures to
 * check beyond the six built-in areas, e.g. lips or salivary duct
 * openings. Answers live on the chart (patientInfo.customExam), each
 * carrying its label, so a chart reads the same for anyone (a colleague,
 * the PDF) and removing a definition never deletes charted findings.
 * Only answered areas are saved on the chart, and only they print.
 */

export interface CustomExamAreaDef {
  id: string;
  label: string;
}

/** Kept small: each answered area is a PDF row on page 1, and a person's
 *  settings must stay under the database's 8 KB cap for preferences. */
export const MAX_CUSTOM_EXAM_AREAS = 8;
export const MAX_EXAM_LABEL = 60;
const MAX_EXAM_COMMENT = 500;

/** The preset ("Add the full oral exam list"): structures a full oral
 *  exam checks that the built-in areas don't already cover. Keys under
 *  settings:chart.exam.presets; labels are added in the person's language. */
export const EXAM_PRESET_KEYS = ['lips', 'gingiva', 'salivary', 'floor'] as const;

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const status = (v: unknown): ExamFinding => (v === 'normal' || v === 'abnormal' ? v : '');

export function newExamAreaId(): string {
  return `x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Tolerant read of area definitions (settings): unique ids, capped. */
export function normalizeExamAreaDefs(raw: unknown): CustomExamAreaDef[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: CustomExamAreaDef[] = [];
  for (const r of raw) {
    const o = obj(r);
    const id = str(o?.id, 40);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label: str(o?.label, MAX_EXAM_LABEL) });
    if (out.length >= MAX_CUSTOM_EXAM_AREAS) break;
  }
  return out;
}

/** Tolerant read of a chart's answers: answered ones only, unique ids. */
export function normalizeCustomExam(raw: unknown): CustomExamValue[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: CustomExamValue[] = [];
  for (const r of raw) {
    const o = obj(r);
    const id = str(o?.id, 40);
    const label = str(o?.label, MAX_EXAM_LABEL);
    const s = status(o?.status);
    const comment = typeof o?.comment === 'string' ? o.comment.slice(0, MAX_EXAM_COMMENT) : '';
    if (!id || !label || seen.has(id) || (!s && !comment.trim())) continue;
    seen.add(id);
    out.push({ id, label, status: s, comment });
  }
  return out;
}

/** Rows to show on the Exam page: every named definition (with its answer
 *  on this chart, if any), then answers whose definition has since been
 *  removed (they stay visible, and editable, on the chart that has them). */
export function customExamRows(defs: CustomExamAreaDef[], values: CustomExamValue[] = []): CustomExamValue[] {
  const byId = new Map(values.map((v) => [v.id, v]));
  const rows: CustomExamValue[] = defs
    .filter((d) => d.label.trim())
    .map((d) => {
      const v = byId.get(d.id);
      return { id: d.id, label: d.label.trim(), status: v?.status ?? '', comment: v?.comment ?? '' };
    });
  const shown = new Set(rows.map((r) => r.id));
  for (const v of values) if (!shown.has(v.id) && (v.status || v.comment.trim())) rows.push(v);
  return rows;
}

/** Sets an area's answer on the chart's list (label captured from `row`);
 *  an area with no status and no comment is dropped. */
export function setCustomExamValue(
  values: CustomExamValue[] = [],
  row: CustomExamValue,
  patch: Partial<Pick<CustomExamValue, 'status' | 'comment'>>,
): CustomExamValue[] {
  const current = values.find((v) => v.id === row.id) ?? row;
  const next: CustomExamValue = { ...current, label: row.label, ...patch };
  const keep = !!next.status || !!next.comment.trim();
  const rest = values.filter((v) => v.id !== row.id);
  if (!keep) return rest;
  return values.some((v) => v.id === row.id) ? values.map((v) => (v.id === row.id ? next : v)) : [...values, next];
}

/** Answered custom areas, in the order the Exam page shows them — for the
 *  PDF, which prints these after the built-in areas. */
export function answeredCustomExam(values: CustomExamValue[] = []): CustomExamValue[] {
  return values.filter((v) => v.label.trim() && (v.status || v.comment.trim()));
}
