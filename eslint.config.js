// Opt-in literal-string lint: only files listed in src/i18n/extracted.json
// (text fully moved into the catalogs) are checked, and only for the one rule.
// No other lint rules are enabled; this project deliberately has no style linter.
const tseslint = require('typescript-eslint');
const i18next = require('eslint-plugin-i18next');
const extracted = require('./src/i18n/extracted.json');

// Source files carry `// eslint-disable-next-line react-hooks/exhaustive-deps`
// from before this project had a linter. The plugin isn't installed (and its
// rules aren't wanted), so register an inert rule of that name so those
// directives resolve instead of erroring.
const reactHooksStub = { rules: { 'exhaustive-deps': { meta: { schema: [] }, create: () => ({}) } } };

module.exports = [
  {
    // Test files and operator-only surfaces are exempt.
    ignores: [
      '**/*.test.ts',
      '**/*.test.tsx',
      'src/components/AdminPanel.tsx',
      'src/components/AdminChartList.tsx',
      'src/components/AdminChartViewer.tsx',
    ],
  },
  {
    files: extracted,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    plugins: { i18next, 'react-hooks': reactHooksStub },
    rules: {
      'i18next/no-literal-string': [
        'error',
        {
          mode: 'jsx-only',
          // Attributes listed here are skipped; everything else (title,
          // placeholder, aria-label, alt, label) is checked.
          'jsx-attributes': {
            exclude: ['className', 'data-testid', 'key', 'id', 'type', 'role', 'href'],
          },
          // Only strings that contain a letter count as text.
          words: { exclude: [/^[^\p{L}]*$/u] },
        },
      ],
    },
  },
];
