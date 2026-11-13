// @vitest-environment node
// Guards the translation rules on the real repo, so `npm test` (not just
// `npm run build`) fails before merge when a change skips them.
import { ESLint } from 'eslint';
import { globSync, readFileSync } from 'node:fs';

interface LintScope {
  files: string[];
  exempt: { pattern: string; reason: string }[];
}
const scope: LintScope = JSON.parse(readFileSync('src/i18n/lint-scope.json', 'utf8'));

test('every lint exemption states a reason and still matches a file', () => {
  expect(scope.exempt.filter((e) => !e.reason?.trim()).map((e) => e.pattern)).toEqual([]);
  expect(scope.exempt.filter((e) => globSync(e.pattern).length === 0).map((e) => e.pattern)).toEqual([]);
});

test('every non-exempt source file has no hard-coded user-facing text', async () => {
  const eslint = new ESLint({ overrideConfigFile: 'eslint.config.js' });
  // Exempt files are ignored by the config itself.
  const results = await eslint.lintFiles(scope.files);
  expect(results.length).toBeGreaterThan(50); // the scope really covers the app
  const problems = results.flatMap((r) =>
    r.messages.map((m) => `${r.filePath.replace(`${process.cwd()}/`, '')}:${m.line} ${m.ruleId ?? 'parse'}: ${m.message}`),
  );
  expect(problems).toEqual([]);
}, 60_000);

test('Codex (AGENTS.md) and Claude (CLAUDE.md) get the same translation rules', () => {
  expect(readFileSync('AGENTS.md', 'utf8')).toMatch(/^## Translations$/m);
  expect(readFileSync('CLAUDE.md', 'utf8')).toMatch(/^@AGENTS\.md$/m);
});
