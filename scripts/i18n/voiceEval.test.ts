// @vitest-environment node
import type { AiAction, ChartContext } from '../../src/utils/aiAutofill';
import { EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS } from '../../src/types';
import { aggregateScores, chartToActions, evaluateRuns, keyTokens, parseRuns, readUtterances, scoreActions } from './voiceEval';

const field = (triadan: number, f: string, value: string): AiAction => ({ name: 'set_tooth_field', input: { triadan, field: f, value } });
const note = (triadan: number, text: string, diagram = 'pre'): AiAction => ({ name: 'add_comment', input: { diagram, triadan, text } });

describe('scoreActions', () => {
  it('scores a perfect match as 1, whatever the order', () => {
    const expected = [field(101, 'gingivitis', '2'), note(104, 'T/FX/CCF')];
    const s = scoreActions(expected, [...expected].reverse());
    expect(s).toMatchObject({ precision: 1, recall: 1, f1: 1, missing: [], extra: [] });
  });

  it('reports missing and extra actions with precision, recall and F1', () => {
    const expected = [field(101, 'gingivitis', '2'), field(101, 'calculus', '2'), note(104, 'T/FX/CCF'), note(109, 'AT')];
    const actual = [field(101, 'gingivitis', '2'), field(101, 'calculus', '3'), note(104, 'T/FX/CCF')];
    const s = scoreActions(expected, actual);
    expect(s.precision).toBeCloseTo(2 / 3);
    expect(s.recall).toBeCloseTo(2 / 4);
    expect(s.f1).toBeCloseTo((2 * (2 / 3) * 0.5) / (2 / 3 + 0.5));
    expect(s.missing).toEqual([field(101, 'calculus', '2'), note(109, 'AT')]);
    expect(s.extra).toEqual([field(101, 'calculus', '3')]);
  });

  it('normalizes grid values, doses, drug names and ignores review props', () => {
    const expected: AiAction[] = [
      field(102, 'mobility', '2'),
      field(108, 'pocket', '5'),
      { name: 'set_nerve_block', input: { site: 'infraorbitalRight', mL: '0.3' } },
      { name: 'set_anesthetic_drug', input: { drug: 'Bupivacaine', concentration: '0.5' } },
    ];
    const actual: AiAction[] = [
      { name: 'set_tooth_field', input: { triadan: 102, field: 'mobility', value: 'M2', uncertain: true, reason: 'x' } },
      field(108, 'pocket', 'D5'),
      { name: 'set_nerve_block', input: { site: 'infraorbitalRight', mL: '0,3' } },
      { name: 'set_anesthetic_drug', input: { drug: 'bupivacaïne', concentration: '0,5%' } },
    ];
    expect(scoreActions(expected, actual).f1).toBe(1);
  });

  it('keeps structured fields strict', () => {
    const s = scoreActions(
      [{ name: 'set_nerve_block', input: { site: 'infraorbitalRight', mL: '0.3' } }, { name: 'set_tooth_mark', input: { diagram: 'post', triadan: 108, mark: 'extracted' } }],
      [{ name: 'set_nerve_block', input: { site: 'infraorbitalLeft', mL: '0.3' } }, { name: 'set_tooth_mark', input: { diagram: 'pre', triadan: 108, mark: 'extracted' } }],
    );
    expect(s.f1).toBe(0);
  });

  it('compares free text loosely: the expected codes and numbers must be there', () => {
    const exam = (comment: string): AiAction => ({ name: 'set_exam_finding', input: { area: 'buccal', status: 'abnormal', comment } });
    expect(scoreActions([exam('Légère ulcération sur la joue gauche')], [exam('Ulcération joue gauche')]).f1).toBe(1);
    expect(scoreActions([note(104, 'T/FX/CCF')], [note(104, 'Fracture (T/FX/CCF)')]).f1).toBe(1);
    expect(scoreActions([note(104, 'T/FX/CCF')], [note(104, 'T/FX')]).f1).toBe(0);
    expect(scoreActions([note(104, 'T/FX')], [note(104, 'T/FX/CCF')]).f1).toBe(0);
    const report = (text: string): AiAction => ({ name: 'append_treatment_report', input: { text } });
    expect(scoreActions([report('Detartrasi completa e lucidatura.')], [report('Pulizia completa con lucidatura')]).f1).toBe(1);
  });

  it('does not accept dropped or empty free text', () => {
    const exam = (comment?: string): AiAction => ({ name: 'set_exam_finding', input: { area: 'buccal', status: 'abnormal', ...(comment !== undefined ? { comment } : {}) } });
    const report = (text: string): AiAction => ({ name: 'append_treatment_report', input: { text } });
    // abnormal exam finding with the comment dropped → no match
    expect(scoreActions([exam('Mild ulceration on the left cheek')], [exam()]).f1).toBe(0);
    expect(scoreActions([exam('Mild ulceration on the left cheek')], [exam('  ')]).f1).toBe(0);
    // empty treatment report → no match
    expect(scoreActions([report('Full mouth scaling and polish.')], [report('')]).f1).toBe(0);
    // a token-free text far shorter than expected → no match
    expect(scoreActions([report('Détartrage complet et polissage.')], [report('Fait')]).f1).toBe(0);
    // paraphrased comment of similar length → match
    expect(scoreActions([exam('Leichte Ulzeration an der linken Wange')], [exam('Geringe Ulzeration, Wange links')]).f1).toBe(1);
    // a normal finding with no expected comment still matches with or without one
    const normal = (comment?: string): AiAction => ({ name: 'set_exam_finding', input: { area: 'tongue', status: 'normal', ...(comment ? { comment } : {}) } });
    expect(scoreActions([normal()], [normal('ok')]).f1).toBe(1);
  });

  it('handles empty lists', () => {
    expect(scoreActions([], [])).toMatchObject({ precision: 1, recall: 1, f1: 1 });
    expect(scoreActions([note(104, 'AT')], [])).toMatchObject({ precision: 0, recall: 0, f1: 0 });
    expect(scoreActions([], [note(104, 'AT')])).toMatchObject({ precision: 0, recall: 1, f1: 0 });
  });
});

it('keyTokens picks codes and numbers out of free text', () => {
  expect(keyTokens('108: perte osseuse verticale, T/FX/CCF, 0,3 mL')).toEqual(['108', 'T/FX/CCF', '0,3']);
  expect(keyTokens('Légère ulcération. E il resto')).toEqual([]);
  expect(keyTokens('DT/P, AT')).toEqual(['DT/P', 'AT']);
});

it('chartToActions lists one action per charted finding', () => {
  const c: ChartContext = {
    patientInfo: {
      patientName: '', patientNumber: '', ownerName: '', ownerPhone: '', ownerEmail: '',
      doctor: '', tech: '', date: '', complaint: '', treatmentReport: 'Scaling.', recallDate: '',
      nerveBlocks: { ...EMPTY_NERVE_BLOCKS, infraorbitalRight: '0.3', drugs: [{ name: 'Bupivacaine', concentration: '0.5' }] },
      exam: { ...JSON.parse(JSON.stringify(EMPTY_EXAM_FINDINGS)), tongue: { status: 'normal', comment: '' } },
    },
    species: 'canine', logo: 'socal',
    toothData: [{ tooth: '101', triadan: 101, gingivitis: '2' }],
    preMarks: { 205: 'missing' }, preComments: [{ id: '1', text: 'T/FX/CCF, AT', anchorTriadan: 104 }],
    postMarks: { 108: 'extracted' }, postComments: [],
  };
  expect(scoreActions(chartToActions(c), [
    field(101, 'gingivitis', '2'),
    { name: 'set_tooth_mark', input: { diagram: 'pre', triadan: 205, mark: 'missing' } },
    { name: 'set_tooth_mark', input: { diagram: 'post', triadan: 108, mark: 'extracted' } },
    note(104, 'T/FX/CCF'), note(104, 'AT'),
    { name: 'set_exam_finding', input: { area: 'tongue', status: 'normal' } },
    { name: 'set_nerve_block', input: { site: 'infraorbitalRight', mL: '0.3' } },
    { name: 'set_anesthetic_drug', input: { drug: 'Bupivacaine', concentration: '0.5' } },
    { name: 'append_treatment_report', input: { text: 'Scaling.' } },
  ]).f1).toBe(1);
});

describe('readUtterances', () => {
  it('strips the localized header, rule, timestamps and activity log', () => {
    const text = 'Transkript — Aufnahme gestartet 11.11.2026, 09:02:10\n──────\n\n[09:02:11] Speaker 0: Hundertvier fehlt.\n[9:03 AM] Speaker 1: Okay.\n\nActivity\n+ something';
    expect(readUtterances(text)).toEqual(['Speaker 0: Hundertvier fehlt.', 'Speaker 1: Okay.']);
  });
  it('splits a single paragraph into sentences', () => {
    expect(readUtterances('104 missing. 108 GI 2!')).toEqual(['104 missing.', '108 GI 2!']);
  });
  it('keeps a plain line with a dash', () => {
    expect(readUtterances('Bon — on commence.\n101 GI 2.')).toEqual(['Bon — on commence.', '101 GI 2.']);
  });
});

describe('repeated runs', () => {
  const expected = [field(101, 'gingivitis', '2'), field(101, 'calculus', '2'), note(104, 'T/FX/CCF')];

  it('averages precision, recall and F1 and counts missing/extra across runs', () => {
    const runs = [
      scoreActions(expected, expected), // F1 1
      scoreActions(expected, [field(101, 'gingivitis', '2'), field(101, 'calculus', '3')]), // P .5 R 1/3
      scoreActions(expected, [field(101, 'gingivitis', '2'), note(104, 'T/FX/CCF')]), // P 1 R 2/3
    ];
    const agg = aggregateScores(runs);
    expect(agg.runs).toBe(3);
    expect(agg.f1s).toEqual(runs.map((r) => r.f1));
    expect(agg.f1).toBeCloseTo((runs[0].f1 + runs[1].f1 + runs[2].f1) / 3);
    expect(agg.precision).toBeCloseTo((1 + 0.5 + 1) / 3);
    expect(agg.recall).toBeCloseTo((1 + 1 / 3 + 2 / 3) / 3);
    expect(agg.missing).toEqual([
      { action: field(101, 'calculus', '2'), count: 2 },
      { action: note(104, 'T/FX/CCF'), count: 1 },
    ]);
    expect(agg.extra).toEqual([{ action: field(101, 'calculus', '3'), count: 1 }]);
  });

  it('runs a fake extractor N times and aggregates app and one-shot separately', async () => {
    const calls: number[] = [];
    const result = await evaluateRuns(expected, 2, async (i) => {
      calls.push(i);
      return {
        app: i === 0 ? expected : expected.slice(0, 2),
        oneShot: [field(101, 'gingivitis', '2')],
      };
    });
    expect(calls).toEqual([0, 1]);
    expect(result.app.runs).toBe(2);
    expect(result.app.f1s[0]).toBe(1);
    expect(result.app.f1).toBeCloseTo((1 + scoreActions(expected, expected.slice(0, 2)).f1) / 2);
    expect(result.app.missing).toEqual([{ action: note(104, 'T/FX/CCF'), count: 1 }]);
    expect(result.oneShot.f1).toBeCloseTo(scoreActions(expected, [field(101, 'gingivitis', '2')]).f1);
    expect(result.oneShot.missing.map((m) => m.count)).toEqual([2, 2]);
  });

  it('parses --runs (default 1, positive integers only)', () => {
    expect(parseRuns(undefined)).toBe(1);
    expect(parseRuns('3')).toBe(3);
    for (const bad of ['0', '-1', '1.5', 'x', '']) expect(() => parseRuns(bad)).toThrow();
  });
});
