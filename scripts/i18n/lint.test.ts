// @vitest-environment node
import { ESLint } from 'eslint';
import path from 'node:path';

const eslint = new ESLint({ overrideConfigFile: 'eslint.config.js', warnIgnored: false });
const LISTED = path.resolve('src/components/AccountModal.tsx');
const UNLISTED = path.resolve('src/components/NotListed.tsx');

async function rules(src: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(src, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? `parse error: ${m.message}`);
}

// (The rule skips variables with ALL-CAPS names, so test components are not named `A`.)
test('a JSX literal in a listed file is reported', async () => {
  expect(await rules('export const Comp = () => <p>Hello</p>;', LISTED)).toEqual(['i18next/no-literal-string']);
});

test('the same text in a file that is not listed is not reported', async () => {
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
  ])('%s is reported in a listed file', async (call) => {
    expect(await rules(`export function run(n, err, t) { ${call}; }`, LISTED)).toEqual([RESTRICTED]);
  });

  test.each([
    ["toast(t('x'))"],
    ["toast(t('x'), { kind: 'success' })"],
    ["friendlyError(err, t('x'))"],
    ["confirmDialog({ title: t('x'), danger: true })"],
    ["toast('…')"],
  ])('%s is not reported in a listed file', async (call) => {
    expect(await rules(`export function run(n, err, t) { ${call}; }`, LISTED)).toEqual([]);
  });

  test('the same literals are not reported in an unlisted file', async () => {
    const src = "export function run() { toast('Saved.'); confirmDialog({ title: 'Delete?' }); }";
    expect(await rules(src, UNLISTED)).toEqual([]);
  });
});
