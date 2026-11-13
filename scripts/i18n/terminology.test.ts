// @vitest-environment node
// "Chart" meaning the patient record has one translation per language (glossary
// `chart_record`), and text that names a button uses that button's exact label.
import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';

type Catalog = { [key: string]: string | Catalog };
const LANGS = ['fr', 'de', 'it', 'es'] as const;

const load = (lng: string, ns: string): Catalog => JSON.parse(readFileSync(`src/locales/${lng}/${ns}.json`, 'utf8'));
function flat(c: Catalog, prefix = ''): [string, string][] {
  return Object.entries(c).flatMap(([k, v]) => (typeof v === 'string' ? [[prefix + k, v] as [string, string]] : flat(v, `${prefix}${k}.`)));
}
const lookup = (c: Catalog, key: string) => key.split('.').reduce<string | Catalog>((v, k) => (v as Catalog)[k], c) as string;

const glossary = JSON.parse(readFileSync('src/locales/glossary.json', 'utf8')) as { terms: Record<string, string>[] };

test('the glossary defines chart_record, distinct from dental_chart', () => {
  const record = glossary.terms.find((t) => t.id === 'chart_record');
  expect(record).toMatchObject({ fr: 'dossier', de: 'Akte', it: 'cartella', es: 'historial' });
  expect(record!.note).toMatch(/dental_chart/);
});

test('the view-only dictation toast names the Edit chart button by its label', () => {
  for (const lng of LANGS) {
    const label = lookup(load(lng, 'app'), 'topbar.editChart');
    const message = lookup(load(lng, 'voice'), 'toast.viewOnly').replace('{{button}}', label);
    expect(message, lng).toContain(label);
  }
});

// Words earlier translations used for the record that the glossary rules out.
const DRIFT: Record<(typeof LANGS)[number], RegExp> = {
  fr: /\bfiches?\b(?! d’anesthésie)/i,
  de: /\bKarten?\b|\bFormular/,
  it: /\bschede?\b|\bscheda\b/i,
  es: /\bfichas?\b/i,
};
// Italian "scheda" is also a browser tab: these strings mean that.
const TAB = new Set(['it:app:otherTab.text', 'it:landing:features.avdc.points.p2']);
// English that says "chart" as a noun (not "dental chart", "Charting", "Chart settings").
const RECORD = /\bcharts?\b(?!\s+settings)|\bchart's\b/i;

test('every string about a chart uses the chart_record term, not an older synonym', () => {
  const drift: string[] = [];
  for (const file of globSync('src/locales/en/*.json').filter((f) => !f.endsWith('.meta.json'))) {
    const ns = path.basename(file, '.json');
    const en = flat(load('en', ns));
    for (const lng of LANGS) {
      const tr = new Map(flat(load(lng, ns)));
      for (const [key, text] of en) {
        if (!RECORD.test(text) || /dental chart/i.test(text)) continue;
        const t = tr.get(key) ?? '';
        if (DRIFT[lng].test(t) && !TAB.has(`${lng}:${ns}:${key}`)) drift.push(`${lng}:${ns}:${key}: ${t}`);
      }
    }
  }
  expect(drift).toEqual([]);
});
