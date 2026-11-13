// Opt-in literal-string lint: only files listed in src/i18n/extracted.json
// (text fully moved into the catalogs) are checked. No style rules are enabled;
// this project deliberately has no style linter.
//
// WHAT THE GUARANTEE COVERS (for a listed file, no more):
//   1. JSX text (i18next/no-literal-string, mode 'jsx-only').
//   2. The JSX attributes that carry text (title, placeholder, aria-label,
//      alt, value on native tags; label and any other non-excluded attribute
//      on components).
//   3. Arguments to message helpers (no-restricted-syntax below): a string or
//      template containing a letter passed to toast / friendlyError / alert /
//      confirm / prompt, or given as title / message / label / confirmLabel /
//      cancelLabel / placeholder in the options object of confirmDialog /
//      promptDialog.
//   4. No `t(...) + x` / `x + t(...)` concatenation (no-restricted-syntax).
// NOT caught: any other non-JSX string, e.g. a const or a ternary of literals
// that is rendered or passed on later. Those need human review.
const tseslint = require('typescript-eslint');
const i18next = require('eslint-plugin-i18next');
const extracted = require('./src/i18n/extracted.json');

const HAS_LETTER = '/[A-Za-z\\u00C0-\\u024F]/';
const TEXT_CALLS = 'toast|friendlyError|alert|confirm|prompt';
const DIALOG_CALLS = 'confirmDialog|promptDialog';
const DIALOG_TEXT_PROPS = 'title|message|label|confirmLabel|cancelLabel|placeholder';
const LITERAL = `Literal[value=${HAS_LETTER}]`;
const TEMPLATE = `TemplateLiteral:has(TemplateElement[value.raw=${HAS_LETTER}])`;
const MESSAGE = 'User-facing text must come from t()';
const restrict = (selector) => ({ selector, message: MESSAGE });
const T_CALL = "CallExpression[callee.name='t']";
const T_METHOD = "CallExpression[callee.property.name='t']";

// Source files carry `// eslint-disable-next-line react-hooks/exhaustive-deps`
// from before this project had a linter. The plugin isn't installed (and its
// rules aren't wanted), so register an inert rule of that name so those
// directives resolve instead of erroring.
const reactHooksStub = { rules: { 'exhaustive-deps': { meta: { schema: [] }, create: () => ({}) } } };

module.exports = [
  {
    // Test files and operator-only surfaces are exempt.
    ignores: [
      'build/**',
      'docs/**',
      'public/**',
      '.superpowers/**',
      '.claude/**',
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
      'no-restricted-syntax': [
        'error',
        ...[LITERAL, TEMPLATE].flatMap((text) => [
          restrict(`CallExpression[callee.name=/^(${TEXT_CALLS})$/] > ${text}`),
          restrict(`CallExpression[callee.property.name=/^(${TEXT_CALLS})$/] > ${text}`),
          restrict(
            `CallExpression[callee.name=/^(${DIALOG_CALLS})$/] > ObjectExpression > Property[key.name=/^(${DIALOG_TEXT_PROPS})$/] > ${text}`,
          ),
        ]),
        // Sentences assembled from pieces can't be reordered by translators; use
        // one key with {{placeholders}} instead.
        ...[T_CALL, T_METHOD].map((call) => ({
          selector: `BinaryExpression[operator='+'] > ${call}`,
          message: 'Don’t concatenate translated text; use one key with {{placeholders}}',
        })),
      ],
    },
  },
];
