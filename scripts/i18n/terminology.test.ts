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

// Italian addresses the user as Lei with the courtesy capital throughout:
// Suo / Sua / Suoi / Sue. Lowercase is only for a third party's ("their").
const THIRD_PERSON = new Set([
  'app:sync.changedByOther', // someone else's version
  'app:sync.notSavedConflict',
  'auth:login.emailPlaceholder', // an example address
  'landing:features.avdc.points.p3', // a code's meaning
  'landing:paper.point3', // inside the PDF
  'settings:practice.team.removePendingMessage', // the invitee's invite
]);

test('Italian capitalises the courtesy possessive (Suo, Sua, Suoi, Sue)', () => {
  const lower: string[] = [];
  for (const file of globSync('src/locales/it/*.json').filter((f) => !f.endsWith('.meta.json'))) {
    const ns = path.basename(file, '.json');
    for (const [key, text] of flat(load('it', ns))) {
      if (/\b(suo|sua|suoi|sue)\b/.test(text) && !THIRD_PERSON.has(`${ns}:${key}`)) lower.push(`${ns}:${key}: ${text}`);
    }
  }
  expect(lower).toEqual([]);
});

// The iOS app's strings (ios.* keys, the patients namespace, the app tour and
// Getting started) were written before chart_record existed and used the
// dental-chart word for the record. Where English means the record, the
// translation must not use the dental_chart term (schéma dentaire / Zahnschema /
// odontogramma / odontograma).
const DENTAL_CHART: Record<(typeof LANGS)[number], RegExp> = {
  fr: /sch[ée]ma/i,
  de: /Zahnschema/,
  it: /odontogramm/i,
  es: /odontograma/i,
};
// The Chart tab names the dental chart itself (where you chart teeth).
const APP_DENTAL = new Set(['common:ios.tabs.chart']);
const isAppKey = (ns: string, key: string) =>
  key.startsWith('ios.') || ns === 'patients' || (ns === 'settings' && /^(tour|gettingStarted)\./.test(key));

test('the app\'s strings about a chart use the chart_record term, not the dental-chart word', () => {
  const wrong: string[] = [];
  for (const file of globSync('src/locales/en/*.json').filter((f) => !f.endsWith('.meta.json'))) {
    const ns = path.basename(file, '.json');
    const en = flat(load('en', ns));
    for (const lng of LANGS) {
      const tr = new Map(flat(load(lng, ns)));
      for (const [key, text] of en) {
        if (!isAppKey(ns, key) || !RECORD.test(text) || /dental chart/i.test(text) || APP_DENTAL.has(`${ns}:${key}`)) continue;
        const t = tr.get(key) ?? '';
        if (DENTAL_CHART[lng].test(t)) wrong.push(`${lng}:${ns}:${key}: ${t}`);
      }
    }
  }
  expect(wrong).toEqual([]);
});
