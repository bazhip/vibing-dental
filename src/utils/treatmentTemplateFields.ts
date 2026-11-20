import { fillPlaceholders, PLACEHOLDERS, type PlaceholderKey, type PlaceholderValues } from './ownerReportConfig';

// Double braces and unsupported tokens are kept as written.
const templateField = /\{\{[^{}\r\n]*\}\}|\{([^{}\r\n]+)\}/gu;

export function treatmentTemplateFields(body: string): string[] {
  const fields = new Set<string>();
  for (const [, token] of body.matchAll(templateField)) {
    const field = token?.trim();
    if (field && PLACEHOLDERS.includes(field.toLowerCase() as PlaceholderKey)) fields.add(field);
  }
  return [...fields];
}

export function fillTreatmentTemplate(body: string, values: PlaceholderValues = {}): string {
  return body.replace(templateField, (match, field?: string) => {
    const name = field?.trim();
    if (!name || !PLACEHOLDERS.includes(name.toLowerCase() as PlaceholderKey)) return match;
    return fillPlaceholders(`{${name}}`, values).trim() || match;
  });
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
