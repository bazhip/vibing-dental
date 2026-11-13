// @vitest-environment node
// Every screen needs a pseudo-locale test (installPseudoLocale + findUntranslated):
// each component file must be imported by at least one `*.i18n.test.tsx`, so a
// new screen without one fails `npm test`. A static scan of import statements;
// `vi.mock` stubs don't count, since a stubbed component is never rendered.
import { existsSync, globSync, readFileSync } from 'node:fs';
import path from 'node:path';

interface LintScope {
  exempt: { pattern: string; reason: string }[];
}
const scope: LintScope = JSON.parse(readFileSync('src/i18n/lint-scope.json', 'utf8'));
const exempt = scope.exempt.map((e) => e.pattern);

const SCREENS = ['src/components/**/*.tsx', 'src/EntryGrid.tsx', 'src/App.tsx'];
const IMPORT = /\bimport\s*(?:[^'"()]*?\bfrom\s*)?['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

function resolve(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = path.join(path.dirname(fromFile), spec);
  for (const candidate of [base, `${base}.tsx`, `${base}.ts`, path.join(base, 'index.tsx'), path.join(base, 'index.ts')]) {
    if (/\.tsx?$/.test(candidate) && existsSync(candidate)) return path.normalize(candidate);
  }
  return null;
}

/** Files imported by the pseudo-locale tests. */
function pseudoTested(): Set<string> {
  const covered = new Set<string>();
  for (const test of globSync('src/**/*.i18n.test.tsx')) {
    for (const m of readFileSync(test, 'utf8').matchAll(IMPORT)) {
      const file = resolve(test, m[1] ?? m[2]);
      if (file) covered.add(file);
    }
  }
  return covered;
}

/** Screens that must be covered: component files minus tests and lint exemptions. */
function screens(): string[] {
  return globSync(SCREENS, { exclude: ['**/*.test.tsx', ...exempt] }).map((f) => path.normalize(f)).sort();
}

test('every screen is rendered by a pseudo-locale test (*.i18n.test.tsx)', () => {
  const covered = pseudoTested();
  expect(screens().length).toBeGreaterThan(40);
  expect(screens().filter((f) => !covered.has(f))).toEqual([]);
});
