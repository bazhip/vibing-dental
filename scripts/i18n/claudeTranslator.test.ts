// @vitest-environment node
import { readFileSync } from 'node:fs';
import { systemPrompt } from './claudeTranslator';
import type { GlossaryTerm } from './work';

const { terms } = JSON.parse(readFileSync('src/locales/glossary.json', 'utf8')) as { terms: GlossaryTerm[] };

test('the Portuguese prompt carries the pt glossary values', () => {
  const prompt = systemPrompt('pt', terms);
  expect(prompt).toContain('chart (patient record) => prontuário');
  expect(prompt).not.toContain('=> historial');
});

test('the Spanish prompt still uses the es values', () => {
  expect(systemPrompt('es', terms)).toContain('chart (patient record) => historial');
});
