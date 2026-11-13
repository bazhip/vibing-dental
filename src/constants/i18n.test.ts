import i18n from '../i18n';
import { APP_LANGUAGES } from '../i18n/config';
import { installPseudoLocale, restoreLocale } from '../i18n/testing/pseudo';
import glossary from '../locales/glossary.json';
import { DENTAL_CODES, DENTAL_CODE_GROUPS, codeDefinition, searchCodes } from './dentalCodes';
import { GRID_COLUMNS, columnLabel } from './columnDefinitions';
import { TOOTH_DATA_ROWS } from './chartLayout';
import { PLANS, planFeatures, planName, planTagline } from './plans';
import { WHATS_NEW } from './whatsNew';
import { blocksForForm, fieldsForForm, fieldLines } from '../utils/customAnesthesia';

const WRAPPED = /^⟦.*⟧$/s;
const codesOf = (list: { code: string }[]) => list.map((c) => c.code);

describe('code definitions', () => {
  it('every DENTAL_CODES code has a definition in each language', () => {
    for (const lng of APP_LANGUAGES) {
      const missing = DENTAL_CODES.filter((c) => {
        const v: unknown = i18n.getResource(lng, 'codes', c.code);
        return typeof v !== 'string' || !v.trim();
      });
      expect({ lng, missing: codesOf(missing) }).toEqual({ lng, missing: [] });
    }
  });

  it('the English catalog is the DENTAL_CODES definition verbatim', () => {
    const differs = DENTAL_CODES.filter((c) => i18n.getResource('en', 'codes', c.code) !== c.definition);
    expect(codesOf(differs)).toEqual([]);
  });

  it('codeDefinition in en equals the old literal', () => {
    expect(codeDefinition('T/FX/CCF', 'en')).toBe('Complicated crown fracture');
    expect(codeDefinition('PD3', 'en')).toBe('Moderate periodontitis (25–50% attachment loss)');
    expect(codeDefinition('MAL2', 'en')).toBe(
      'Class 2 malocclusion (mandibular distoclusion; lower jaw relatively shorter than the upper)',
    );
    expect(codeDefinition('XSS', 'en')).toBe('Extraction, open (surgical)');
    expect(codeDefinition('OM/POF', 'en')).toBe('Oral mass, peripheral odontogenic fibroma');
  });

  it('codeDefinition follows the requested language and keeps codes and numbers', () => {
    expect(codeDefinition('T/FX/CCF', 'fr')).toBe('Fracture coronaire compliquée');
    expect(codeDefinition('PD3', 'de')).toContain('25–50 %');
  });

  it('searchCodes finds translated, English and code queries', () => {
    const crownFractures = ['T/FX/UCF', 'T/FX/CCF', 'T/FX/UCRF', 'T/FX/CCRF'];
    expect(codesOf(searchCodes('fracture', 'fr')).some((c) => crownFractures.includes(c))).toBe(true);
    // An English definition still matches while the app is in French.
    expect(codesOf(searchCodes('crown fracture', 'fr'))).toEqual(expect.arrayContaining(['T/FX/CCF']));
    // A code typed in German finds it (the brief's "CFX" is not an AVDC code; see report).
    expect(codesOf(searchCodes('T/FX/CCF', 'de'))[0]).toBe('T/FX/CCF');
    expect(codesOf(searchCodes('t/fx', 'de'))).toEqual(expect.arrayContaining(crownFractures));
    // Accents don't matter: "periapical" finds "périapical".
    expect(codesOf(searchCodes('abces periapical', 'fr'))).toContain('PA/A');
  });

  it('searchCodes ranks code prefixes first', () => {
    expect(codesOf(searchCodes('PD', 'en')).slice(0, 6)).toEqual(['PD', 'PD0', 'PD1', 'PD2', 'PD3', 'PD4']);
  });
});

describe('column labels', () => {
  const fr = (id: string) => glossary.terms.find((t) => t.id === id)!.fr.toLowerCase();

  it('match the glossary in fr for mobility, pocket and calculus', () => {
    for (const key of ['mobility', 'pocket', 'calculus'] as const) {
      const label = columnLabel(key, 'fr');
      expect(label).not.toBe(columnLabel(key, 'en'));
      expect(fr(key).startsWith(label.toLowerCase())).toBe(true);
    }
  });

  it('GRID_COLUMNS keep stable keys and read their name at access time', () => {
    expect(GRID_COLUMNS.map((c) => c.key)).toContain('mobility');
    expect(GRID_COLUMNS.find((c) => c.key === 'mobility')!.name).toBe('Mobility');
  });
});

describe('pseudo-locale', () => {
  beforeAll(installPseudoLocale);
  afterAll(restoreLocale);

  it('constant display text is translated at read time', () => {
    const texts: string[] = [
      ...GRID_COLUMNS.map((c) => c.name),
      ...TOOTH_DATA_ROWS.map((r) => columnLabel(r.key)),
      ...DENTAL_CODE_GROUPS.map((g) => g.name),
      ...DENTAL_CODES.map((c) => codeDefinition(c.code)),
      ...PLANS.flatMap((p) => [p.name, p.tagline, ...p.features, planName(p.key), planTagline(p.key), ...planFeatures(p.key)]),
      WHATS_NEW.title,
      WHATS_NEW.intro,
      ...WHATS_NEW.groups.flatMap((g) => [g.heading, ...g.items.flatMap((it) => [it.title, it.body])]),
      blocksForForm([{ id: 'b1', label: '' }], undefined)[0].label,
      fieldsForForm([{ id: 'f1', label: '', type: 'text' }], undefined)[0].value.label,
    ];
    expect(texts.filter((s) => !WRAPPED.test(s))).toEqual([]);
  });

  it('PDF-bound custom anesthesia lines stay English until the PDF is translated', () => {
    const chart = { blocks: [], fields: [{ id: 'f', label: '', type: 'checkbox' as const, value: 'true' }] };
    expect(fieldLines(chart)).toEqual(['Custom field: Yes']);
  });
});
