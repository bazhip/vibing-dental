import type { PracticeChartFieldAnswer } from '../types';
import { PRACTICE_CHART_PAGES, parsePracticeChartField } from './practiceChartFields';
import { VISIT_DOCUMENT_MAX_LENGTH } from './visitDocumentation';

/** The visit keeps its own labels, choice definitions, and answers. */
export function readPracticeChartFieldAnswers(raw: unknown): PracticeChartFieldAnswer[] {
  if (!Array.isArray(raw)) return [];
  const answers: PracticeChartFieldAnswer[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const page = PRACTICE_CHART_PAGES.find(candidate => candidate === item.page);
    const value: unknown = item.value;
    if (!page || typeof value !== 'string' || value.length > VISIT_DOCUMENT_MAX_LENGTH || !value.trim()
      || value.includes('\0') || /[\uD800-\uDFFF]/u.test(value)) continue;
    const field = parsePracticeChartField(item.field);
    if (!field) continue;
    const key = `${page}:${field.id}`;
    if (seen.has(key)) continue;
    answers.push({ page, field, value, ...(page === 'patient' && item.origin === 'patientLayout' ? { origin: item.origin } : {}) });
    seen.add(key);
  }
  return answers;
}
