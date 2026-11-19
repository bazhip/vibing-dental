import { fillPlaceholders, PLACEHOLDERS, type PlaceholderKey, type PlaceholderValues } from './ownerReportConfig';

// Single braces name fill-in fields. Doubled braces remain literal text.
const templateField = /\{\{[^{}\r\n]*\}\}|\{([^{}\r\n]+)\}/gu;

export function treatmentTemplateFields(body: string): string[] {
  return Array.from(new Set(Array.from(body.matchAll(templateField), match => match[1]?.trim() ?? '').filter(Boolean)));
}

export function fillTreatmentTemplate(body: string, values: ReadonlyMap<string, string>): string {
  return body.replace(templateField, (match, field?: string) => values.get(field?.trim() ?? '') ?? match);
}

export function treatmentChartFieldValue(field: string, values: PlaceholderValues = {}): string {
  const key = field.toLowerCase() as PlaceholderKey;
  return PLACEHOLDERS.includes(key) ? fillPlaceholders(`{${field}}`, values).trim() : '';
}

export function treatmentCodeSuggestions(body: string, caret: number | null) {
  if (caret === null) return null;
  const match = body.slice(0, caret).match(/(?:^|[^{])\{([a-z]*)$/i);
  if (!match) return null;
  const prefix = match[1].toLowerCase();
  const codes = PLACEHOLDERS.filter(key => key.startsWith(prefix));
  if (!codes.length) return null;
  const existingEnding = body.slice(caret).match(/^[a-z]*\}/i)?.[0] ?? '';
  return { start: caret - match[1].length - 1, end: caret + existingEnding.length, codes };
}
