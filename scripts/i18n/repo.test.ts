// @vitest-environment node
// Guards the translation rules on the real repo, so `npm test` (not just
// `npm run build`) fails before merge when a change skips them.
import { ESLint } from 'eslint';
import { existsSync, readFileSync } from 'node:fs';

const extracted: string[] = JSON.parse(readFileSync('src/i18n/extracted.json', 'utf8'));

test('every file listed as extracted exists', () => {
  expect(extracted.filter((f) => !existsSync(f))).toEqual([]);
});

test('extracted files have no hard-coded user-facing text', async () => {
  const eslint = new ESLint({ overrideConfigFile: 'eslint.config.js' });
  const results = await eslint.lintFiles(extracted);
  const problems = results.flatMap((r) =>
    r.messages.map((m) => `${r.filePath.replace(`${process.cwd()}/`, '')}:${m.line} ${m.ruleId ?? 'parse'}: ${m.message}`),
  );
  expect(problems).toEqual([]);
}, 30_000);

test('Codex (AGENTS.md) and Claude (CLAUDE.md) get the same translation rules', () => {
  expect(readFileSync('AGENTS.md', 'utf8')).toMatch(/^## Translations$/m);
  expect(readFileSync('CLAUDE.md', 'utf8')).toMatch(/^@AGENTS\.md$/m);
});
