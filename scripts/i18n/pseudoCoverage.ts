// Static scan behind pseudo-coverage.test.ts: which component files exist, and
// which of them the pseudo-locale tests (*.i18n.test.tsx) really import.
import { existsSync, globSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Strings are matched so a `//` inside one (a URL) isn't taken for a comment.
const STRING_OR_COMMENT = /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
export const stripComments = (src: string) => src.replace(STRING_OR_COMMENT, (m, str: string | undefined) => str ?? ' ');

// import X from '…' | import { a, type B } from '…' | import type … from '…' |
// import '…' | import('…'), the last possibly preceded by `typeof`.
const IMPORT =
  /\bimport\s+(type\s+)?([^'"()]*?)\s*\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]|(\btypeof\s+)?\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

/** True when every named specifier is `type …` (`import { type A, type B } from`). */
const typeOnlyClause = (clause: string) => {
  const m = clause.trim().match(/^\{([\s\S]*)\}$/);
  if (!m) return false;
  const names = m[1].split(',').map((s) => s.trim()).filter(Boolean);
  return names.length > 0 && names.every((n) => n.startsWith('type '));
};

function resolve(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = path.join(path.dirname(fromFile), spec);
  for (const candidate of [base, `${base}.tsx`, `${base}.ts`, path.join(base, 'index.tsx'), path.join(base, 'index.ts')]) {
    if (/\.tsx?$/.test(candidate) && existsSync(candidate)) return path.normalize(candidate);
  }
  return null;
}

/** Project files `source` (the text of `fromFile`) imports at runtime. */
export function importedFiles(fromFile: string, source: string): string[] {
  const files: string[] = [];
  for (const m of stripComments(source).matchAll(IMPORT)) {
    const [, typeKeyword, clause, fromSpec, bareSpec, typeofKeyword, dynamicSpec] = m;
    if (typeKeyword || typeofKeyword || (clause !== undefined && typeOnlyClause(clause))) continue;
    const file = resolve(fromFile, fromSpec ?? bareSpec ?? dynamicSpec);
    if (file) files.push(file);
  }
  return files;
}

/** Files imported by the pseudo-locale tests. */
export function coveredFiles(): Set<string> {
  const covered = new Set<string>();
  for (const test of globSync('src/**/*.i18n.test.tsx')) {
    for (const file of importedFiles(test, readFileSync(test, 'utf8'))) covered.add(file);
  }
  return covered;
}

// `export function Foo`, `export const Foo`, `export class Foo`, `export default`.
const EXPORTS_COMPONENT = /\bexport\s+(?:default\b|(?:async\s+)?(?:function|const|let|class)\s+[A-Z])/;

/** Screens that must be covered: .tsx files under src/ that export a component,
 *  minus tests and the lint-scope exemptions (`exempt` glob patterns). */
export function componentFiles(exempt: string[]): string[] {
  return globSync('src/**/*.tsx', { exclude: ['**/*.test.tsx', ...exempt] })
    .map((f) => path.normalize(f))
    .filter((f) => EXPORTS_COMPONENT.test(stripComments(readFileSync(f, 'utf8'))))
    .sort();
}
