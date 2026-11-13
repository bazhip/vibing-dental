// @vitest-environment node
import { ESLint } from 'eslint';
import path from 'node:path';

const eslint = new ESLint({ overrideConfigFile: 'eslint.config.js', warnIgnored: false });
// Every source file is linted unless src/i18n/lint-scope.json exempts it, so a
// brand-new file is checked like an existing screen.
const LISTED = path.resolve('src/components/BrandNewScreen.tsx');
const UNLISTED = path.resolve('src/components/AdminPanel.tsx'); // exempt: operator-only

async function rules(src: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(src, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? `parse error: ${m.message}`);
}

// (The rule skips variables with ALL-CAPS names, so test components are not named `A`.)
test('a JSX literal in a new, unlisted file is reported', async () => {
  expect(await rules('export const Comp = () => <p>Hello</p>;', LISTED)).toEqual(['i18next/no-literal-string']);
});

test('the same text in an exempt file is not reported', async () => {
  expect(await rules('export const Comp = () => <p>Hello</p>;', UNLISTED)).toEqual([]);
});

test('translated text and allowed attributes are not reported', async () => {
  const src = `export const Comp = ({ t }) => <div className="x" data-testid="y" id="z" role="dialog">{t('common:actions.save')}</div>;`;
  expect(await rules(src, LISTED)).toEqual([]);
});

test('translatable attributes are reported', async () => {
  const src = `export const Comp = () => <><input title="Hi" placeholder="Name" aria-label="Close" alt="Pic" /><Field label="Lbl" /></>;`;
  expect(await rules(src, LISTED)).toEqual(Array(5).fill('i18next/no-literal-string'));
});

test('strings without letters are allowed', async () => {
  expect(await rules('export const Comp = () => <button>×</button>;', LISTED)).toEqual([]);
});

test('test files are ignored', async () => {
  const results = await eslint.lintText('const Comp = () => <p>Hello</p>;', {
    filePath: path.resolve('src/components/AccountModal.test.tsx'),
  });
  expect(results).toEqual([]);
});

describe('message helpers', () => {
  const RESTRICTED = 'no-restricted-syntax';

  test.each([
    ["toast('Saved.')"],
    ['toast(`Saved ${n}.`)'],
    ["friendlyError(err, 'Could not save.')"],
    ["window.alert('Oops')"],
    ["confirmDialog({ title: 'Delete?' })"],
    ["promptDialog({ title: t('x'), placeholder: `Type ${n}` })"],
    ["confirmDialog({ title: t('x'), cancelLabel: 'Keep' })"],
  ])('%s is reported in a linted file', async (call) => {
    expect(await rules(`export function run(n, err, t) { ${call}; }`, LISTED)).toEqual([RESTRICTED]);
  });

  test.each([
    ["toast(t('x'))"],
    ["toast(t('x'), { kind: 'success' })"],
    ["friendlyError(err, t('x'))"],
    ["confirmDialog({ title: t('x'), danger: true })"],
    ["toast('…')"],
  ])('%s is not reported in a linted file', async (call) => {
    expect(await rules(`export function run(n, err, t) { ${call}; }`, LISTED)).toEqual([]);
  });

  test('the same literals are not reported in an exempt file', async () => {
    const src = "export function run() { toast('Saved.'); confirmDialog({ title: 'Delete?' }); }";
    expect(await rules(src, UNLISTED)).toEqual([]);
  });
});

describe('string concatenation with t()', () => {
  test.each([["t('a') + name"], ["name + t('a')"], ["i18n.t('a') + name"]])('%s is reported in a linted file', async (expr) => {
    expect(await rules(`export function run(t, i18n, name) { return ${expr}; }`, LISTED)).toEqual(['no-restricted-syntax']);
  });

  test('interpolation and arithmetic are not reported', async () => {
    expect(await rules("export function run(t, n) { return [t('a', { n }), n + 1]; }", LISTED)).toEqual([]);
  });

  test('concatenation is not reported in an exempt file', async () => {
    expect(await rules("export function run(t, name) { return t('a') + name; }", UNLISTED)).toEqual([]);
  });
});

describe('thrown error text', () => {
  const ERROR_MESSAGE =
    'User-visible error text must come from t(); for developer-only errors add `// eslint-disable-next-line no-restricted-syntax -- dev-only: <reason>`';

  async function messages(src: string, filePath: string) {
    const [result] = await eslint.lintText(src, { filePath });
    return (result?.messages ?? []).map((m) => `${m.ruleId}: ${m.message}`);
  }

  test.each([
    ["new Error('Could not save.')"],
    ['new Error(`Could not save ${n}.`)'],
    ["new TypeError('Bad input')"],
    ["new AuthFlowError('Sign-in failed')"],
  ])('%s is reported in a linted file', async (expr) => {
    expect(await messages(`export function run(t, n) { throw ${expr}; }`, LISTED)).toEqual([
      `no-restricted-syntax: ${ERROR_MESSAGE}`,
    ]);
  });

  test.each([
    ["new Error(t('common:errors.generic'))"],
    ['new Error(String(n))'],
    ["new Error('…')"],
    ["new LocalizedError('Already translated')"],
    ["new ApiError('Already translated', 'code')"],
    ["new DicomError('Already translated')"],
    ["new Thing('Not an error')"],
  ])('%s is not reported in a linted file', async (expr) => {
    expect(await messages(`export function run(t, n) { throw ${expr}; }`, LISTED)).toEqual([]);
  });

  test('a dev-only disable comment silences it', async () => {
    const src = [
      'export function run() {',
      '  // eslint-disable-next-line no-restricted-syntax -- dev-only: invariant',
      "  throw new Error('unreachable');",
      '}',
    ].join('\n');
    expect(await messages(src, LISTED)).toEqual([]);
  });

  test('thrown literals are not reported in an exempt file', async () => {
    expect(await messages("export function run() { throw new Error('Oops'); }", UNLISTED)).toEqual([]);
  });
});
