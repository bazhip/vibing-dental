// @vitest-environment node
// Every screen needs a pseudo-locale test (installPseudoLocale + findUntranslated):
// each component file must be imported by at least one `*.i18n.test.tsx`, so a
// new screen without one fails `npm test`. A static scan of import statements;
// `vi.mock` stubs, type-only imports and commented-out imports don't count,
// since none of them renders the component.
import { readFileSync } from 'node:fs';
import { componentFiles, coveredFiles, importedFiles } from './pseudoCoverage';

const exempt = (JSON.parse(readFileSync('src/i18n/lint-scope.json', 'utf8')) as { exempt: { pattern: string }[] }).exempt.map((e) => e.pattern);

describe('importedFiles', () => {
  // Resolves against real files, so the specs point at existing components.
  const from = 'src/components/probe.i18n.test.tsx';

  test('counts static, side-effect and dynamic imports', () => {
    const src = `
      import { BillingGate } from './BillingGate';
      import './ChartMenu';
      const { WhatsNewModal } = await import('./WhatsNewModal');
    `;
    expect(importedFiles(from, src)).toEqual(['src/components/BillingGate.tsx', 'src/components/ChartMenu.tsx', 'src/components/WhatsNewModal.tsx']);
  });

  test('ignores comments, type-only imports and typeof import() in mock factories', () => {
    const src = `
      // import { BillingGate } from './BillingGate';
      /* import { ChartMenu } from './ChartMenu'; */
      /**
       * import { WhatsNewModal } from './WhatsNewModal';
       */
      import type { ExamForm } from './ExamForm';
      import { type FeedbackModal } from './FeedbackModal';
      vi.mock('./WalkthroughModal', async (orig) => ({ ...(await orig<typeof import('./WalkthroughModal')>()) }));
      const url = 'https://example.com'; import { Landing } from './Landing';
    `;
    expect(importedFiles(from, src)).toEqual(['src/components/Landing.tsx']);
  });
});

test('screens are every .tsx file outside tests and lint exemptions that exports a component', () => {
  const files = componentFiles(exempt);
  expect(files).toEqual(expect.arrayContaining(['src/App.tsx', 'src/EntryGrid.tsx', 'src/components/BillingGate.tsx', 'src/i18n/LanguageSwitcher.tsx']));
  expect(files).not.toContain('src/index.tsx'); // the entry point exports nothing
  expect(files).not.toContain('src/components/AdminPanel.tsx'); // operator-only, exempt
  expect(files.some((f) => f.endsWith('.test.tsx'))).toBe(false);
});

test('every screen is rendered by a pseudo-locale test (*.i18n.test.tsx)', () => {
  const covered = coveredFiles();
  const screens = componentFiles(exempt);
  expect(screens.length).toBeGreaterThan(40);
  expect(screens.filter((f) => !covered.has(f))).toEqual([]);
});
