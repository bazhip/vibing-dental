import {
  BUILT_IN_SECTION_IDS,
  DEFAULT_TEMPLATE,
  DEFAULT_TEMPLATE_ID,
  defaultConfig,
  fillPlaceholders,
  normalizeConfig,
  resolveTemplate,
} from './ownerReportConfig';
import { reportStrings } from './ownerReportI18n';

describe('DEFAULT_TEMPLATE', () => {
  test('has every built-in section, enabled, in the original order', () => {
    expect(DEFAULT_TEMPLATE.sections.map((s) => s.id)).toEqual([
      'extractions', 'diagram', 'findings', 'alreadyMissing', 'examNotes',
      'photos', 'teamNote', 'homecare', 'recheck',
    ]);
    expect(DEFAULT_TEMPLATE.sections.every((s) => s.enabled && s.title === '')).toBe(true);
    expect(DEFAULT_TEMPLATE.title).toBe('Dental Visit Report');
    expect(DEFAULT_TEMPLATE.introTemplate).toBe('');
    expect(DEFAULT_TEMPLATE.showToothNumbers).toBe(true);
    expect(DEFAULT_TEMPLATE.showGrades).toBe(true);
  });
});

describe('normalizeConfig', () => {
  test('null / garbage falls back to the default config', () => {
    for (const raw of [null, undefined, 42, 'x', [], {}]) {
      const config = normalizeConfig(raw);
      expect(config.templates).toHaveLength(1);
      expect(config.defaultTemplateId).toBe(DEFAULT_TEMPLATE_ID);
      expect(config.templates[0].sections).toHaveLength(BUILT_IN_SECTION_IDS.length);
    }
  });

  test('fills missing fields and slots missing built-in sections back in', () => {
    const config = normalizeConfig({
      templates: [
        {
          id: 'a',
          name: 'Short',
          sections: [
            { id: 'homecare', enabled: false, title: 'Brushing' },
            { id: 'custom-1', title: 'Pricing', body: 'Ask us' },
            { id: 'bogus', enabled: true },
            { id: 'homecare', enabled: true }, // duplicate dropped
          ],
        },
      ],
      defaultTemplateId: 'missing',
    });
    const tpl = config.templates[0];
    expect(config.defaultTemplateId).toBe('a');
    expect(tpl.title).toBe('Dental Visit Report');
    expect(tpl.showGrades).toBe(true);
    expect(tpl.homecareTips).toEqual([]);
    const ids = tpl.sections.map((s) => s.id);
    expect(ids).not.toContain('bogus');
    expect(ids.filter((id) => id === 'homecare')).toHaveLength(1);
    expect(ids).toHaveLength(BUILT_IN_SECTION_IDS.length + 1);
    // Stored order kept; recheck (after homecare by default) follows it.
    expect(ids.indexOf('recheck')).toBe(ids.indexOf('homecare') + 1);
    const homecare = tpl.sections.find((s) => s.id === 'homecare')!;
    expect(homecare.enabled).toBe(false);
    expect(homecare.title).toBe('Brushing');
    expect(tpl.sections.find((s) => s.id === 'custom-1')).toEqual({
      id: 'custom-1', enabled: true, title: 'Pricing', body: 'Ask us',
    });
  });

  test('duplicate template ids get re-keyed; valid default id is kept', () => {
    const config = normalizeConfig({
      templates: [{ id: 'x', name: 'One' }, { id: 'x', name: 'Two' }],
      defaultTemplateId: 'x',
    });
    expect(config.templates).toHaveLength(2);
    expect(config.templates[0].id).toBe('x');
    expect(config.templates[1].id).not.toBe('x');
    expect(config.defaultTemplateId).toBe('x');
  });

  test('keeps an explicitly blank title (header title off)', () => {
    expect(normalizeConfig({ templates: [{ id: 'a', title: '' }] }).templates[0].title).toBe('');
  });
});

describe('resolveTemplate', () => {
  const config = normalizeConfig({
    templates: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    defaultTemplateId: 'b',
  });
  test('chosen id > practice default > built-in default', () => {
    expect(resolveTemplate(config, 'a').id).toBe('a');
    expect(resolveTemplate(config, 'gone').id).toBe('b');
    expect(resolveTemplate(config).id).toBe('b');
    expect(resolveTemplate(null)).toBe(DEFAULT_TEMPLATE);
    expect(resolveTemplate(defaultConfig()).id).toBe(DEFAULT_TEMPLATE_ID);
  });
});

describe('fillPlaceholders', () => {
  const values = { pet: 'biscuit', owner: 'Sam', species: 'cat', date: '2026-07-19', practice: 'Bay Vets', doctor: 'Dr. Lee' };
  test('replaces every known token, case-insensitively', () => {
    expect(
      fillPlaceholders('{pet} the {species} ({owner}) saw {doctor} at {practice} on {date}.', values)
    ).toBe('biscuit the cat (Sam) saw Dr. Lee at Bay Vets on 2026-07-19.');
    expect(fillPlaceholders('{PET}', values)).toBe('Biscuit');
  });
  test('capitalized token capitalizes the value', () => {
    expect(fillPlaceholders('{Pet} did great.', values)).toBe('Biscuit did great.');
  });
  test('unknown tokens and missing values', () => {
    expect(fillPlaceholders('{weight} {pet}', {})).toBe('{weight} ');
  });
});

describe('defaultConfig language', () => {
  test('seeds the default template in the given language', () => {
    const t = defaultConfig('es').templates[0];
    expect(t.language).toBe('es');
    expect(t.title).toBe(reportStrings('es').defaultTitle);
  });
  test('no argument is unchanged (English)', () => {
    const t = defaultConfig().templates[0];
    expect(t.language).toBe('en');
    expect(t.title).toBe('Dental Visit Report');
  });
  test('normalizeConfig seeds a missing config in the given language', () => {
    expect(normalizeConfig(null, 'de').templates[0].language).toBe('de');
  });
});
