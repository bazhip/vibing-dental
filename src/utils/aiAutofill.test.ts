import { normalizeTranscript, chunkLooksMedical, normalizeFieldValue, isPerioOnlyText, codeOnlyComment, dedupeActions } from './aiAutofill';

describe('normalizeTranscript', () => {
  it('collapses spelled-out triadan numbers', () => {
    expect(normalizeTranscript('one oh four mobility class two'))
      .toBe('104 mobility class 2');
    expect(normalizeTranscript('two oh nine extracted'))
      .toBe('209 extracted');
    expect(normalizeTranscript('three zero one missing on exam'))
      .toBe('301 missing on exam');
    expect(normalizeTranscript('four-oh-eight has a fracture'))
      .toBe('408 has a fracture');
  });

  it('also handles two-digit spell-outs', () => {
    expect(normalizeTranscript('class M two on tooth four oh'))
      .toContain('40');
  });

  it('collapses shorthand spacing', () => {
    expect(normalizeTranscript('PD 2 on the distal'))
      .toBe('PD2 on the distal');
    expect(normalizeTranscript('M 2, C 1, F 2'))
      .toBe('M2, C1, F2');
    expect(normalizeTranscript('P-D-3'))
      .toBe('PD3');
  });

  it('leaves untouched text alone', () => {
    expect(normalizeTranscript('Hand me the scaler please'))
      .toBe('Hand me the scaler please');
    expect(normalizeTranscript('104 already digits'))
      .toBe('104 already digits');
  });
});

describe('chunkLooksMedical', () => {
  it('detects Triadan numbers', () => {
    expect(chunkLooksMedical('209 extracted')).toBe(true);
    expect(chunkLooksMedical('check 104 next')).toBe(true);
  });

  it('detects medical keywords', () => {
    expect(chunkLooksMedical('tongue normal palate normal')).toBe(true);
    expect(chunkLooksMedical('give 0.3 mL bupivacaine')).toBe(true);
    expect(chunkLooksMedical('completed full mouth cleaning')).toBe(true);
    expect(chunkLooksMedical('PD3 distally')).toBe(true);
  });

  it('rejects small talk', () => {
    expect(chunkLooksMedical('hand me the suction')).toBe(false);
    expect(chunkLooksMedical('how was your weekend')).toBe(false);
    expect(chunkLooksMedical('thanks')).toBe(false);
    expect(chunkLooksMedical('')).toBe(false);
  });
});

describe('chunkLooksMedical — short utterances', () => {
  it('keeps short per-utterance findings', () => {
    expect(chunkLooksMedical('104 M2')).toBe(true);
    expect(chunkLooksMedical('M2')).toBe(true);
    expect(chunkLooksMedical('PD3')).toBe(true);
    expect(chunkLooksMedical('ok')).toBe(false);
  });
});

describe('normalizeTranscript — multi-tooth perio runs', () => {
  it('keeps scores separate from tooth numbers (real dictation)', () => {
    const raw =
      'To the service one. One zero one g I two, calc two, f e three One zero two g I two, calc two, mobility three one zero three g I two calc two five millimeter pocket';
    const out = normalizeTranscript(raw);
    expect(out).toContain('101 GI 2, calc 2');
    expect(out).toContain('F3 102 GI 2, calc 2, mobility 3 103 GI 2 calc 2 5 millimeter pocket');
  });

  it('still joins plain tooth numbers', () => {
    expect(normalizeTranscript('one oh four missing, two zero nine extracted')).toBe('104 missing, 209 extracted');
  });
});

describe('normalizeFieldValue', () => {
  it('strips prefixes and units to the bare grid number', () => {
    expect(normalizeFieldValue('G2')).toBe('2');
    expect(normalizeFieldValue('GI 2')).toBe('2');
    expect(normalizeFieldValue('C1')).toBe('1');
    expect(normalizeFieldValue('M3')).toBe('3');
    expect(normalizeFieldValue('PD3')).toBe('3');
    expect(normalizeFieldValue('5mm')).toBe('5');
    expect(normalizeFieldValue('4 5 4')).toBe('4 5 4');
    expect(normalizeFieldValue('2')).toBe('2');
  });
});

describe('isPerioOnlyText', () => {
  it('flags comments that only repeat grid scores', () => {
    expect(isPerioOnlyText('GI 2, calc 1')).toBe(true);
    expect(isPerioOnlyText('M3, 5 mm pocket')).toBe(true);
    expect(isPerioOnlyText('T/FX/CCF')).toBe(false);
    expect(isPerioOnlyText('GI 2, complicated crown fracture')).toBe(false);
  });
});

describe('run-together Deepgram output', () => {
  it('splits "104GI2" into tooth + score and passes the medical gate', () => {
    const out = normalizeTranscript('Speaker 0: 104GI2.');
    expect(out).toContain('104 GI 2');
    expect(chunkLooksMedical(out)).toBe(true);
  });
  it('passes spoken shorthand without a tooth number', () => {
    expect(chunkLooksMedical(normalizeTranscript('Or GI two?'))).toBe(true);
    expect(chunkLooksMedical(normalizeTranscript('calc one'))).toBe(true);
  });
  it('keeps codes joined to tooth numbers apart', () => {
    expect(normalizeTranscript('calc 1T slash FX slash CCF105 missing')).toContain('CCF 105 missing');
  });
});

describe('codeOnlyComment', () => {
  it('reduces "Word (CODE)" and "CODE — words" to the code', () => {
    expect(codeOnlyComment('Fracture (T/FX)')).toBe('T/FX');
    expect(codeOnlyComment('Tooth resorption (TR).')).toBe('TR');
    expect(codeOnlyComment('T/FX — tooth fracture')).toBe('T/FX');
  });
  it('leaves codes, unknown parentheticals and plain notes alone', () => {
    expect(codeOnlyComment('T/FX/CCF')).toBe('T/FX/CCF');
    expect(codeOnlyComment('Draining tract (left)')).toBe('Draining tract (left)');
    expect(codeOnlyComment('Biopsy sent to lab')).toBe('Biopsy sent to lab');
  });
});

describe('dedupeActions — the 105/104 repeat from a real run', () => {
  const ctx = {
    patientInfo: { exam: {}, nerveBlocks: {}, treatmentReport: '' },
    species: 'canine', logo: 'none',
    toothData: [{ tooth: 'P1', triadan: 105, gingivitis: '2' }, { tooth: 'C', triadan: 104 }],
    preMarks: {}, postMarks: {},
    preComments: [{ id: 'ai1', text: 'T/FX', anchorTriadan: 104 }],
    postComments: [],
  } as never;

  it('drops values/notes already on the chart and keeps real changes', () => {
    const out = dedupeActions([
      { name: 'set_tooth_field', input: { triadan: 105, field: 'gingivitis', value: '2' } },   // already 2
      { name: 'set_tooth_field', input: { triadan: 105, field: 'calculus', value: '3' } },     // new
      { name: 'add_comment', input: { diagram: 'pre', triadan: 105, text: 'T/FX/CCF' } },     // new
      { name: 'add_comment', input: { diagram: 'pre', triadan: 104, text: 'Fracture (T/FX)' } }, // already there
      { name: 'set_tooth_field', input: { triadan: 105, field: 'calculus', value: '3' } },     // repeat in reply
    ], ctx);
    expect(out.map((a) => `${a.name}:${a.input.field ?? a.input.text}`)).toEqual([
      'set_tooth_field:calculus',
      'add_comment:T/FX/CCF',
    ]);
  });
});

describe('real run 2 — Deepgram punctuation and homophones', () => {
  const raw = 'Speaker 0: 101GI2, calc 2102GI2, calc 2. Mobility one. 103GI1, Calc 1. 104. Fracture. 105. GI2. Calc. 3T slash FX slash CCF106 missing';
  it('rejoins a punctuated pause and turns spoken slashes into a code', () => {
    const out = normalizeTranscript(raw);
    expect(out).toContain('Calc 3 T/FX/CCF 106 missing');
    expect(out).toContain('Mobility 1');
  });
  it('reads "1098T" as 109 AT', () => {
    expect(normalizeTranscript('1098T. One ten enamel fracture.')).toContain('109 AT');
  });
});

describe('score run into the next tooth number', () => {
  it('splits "calc 2102GI2" into calc 2, tooth 102', () => {
    expect(normalizeTranscript('101GI2, calc 2102GI2, calc 2.')).toContain('calc 2 102 GI 2');
  });
});

import { findCodesInText } from '../constants/dentalCodes';
describe('findCodesInText — one-letter codes', () => {
  it('ignores R/L/B/X used as words, counts them standing alone', () => {
    expect(findCodesInText('Mild ulceration R maxillary buccal mucosa').map((c) => c.code)).not.toContain('R');
    expect(findCodesInText('R').map((c) => c.code)).toContain('R');
    expect(findCodesInText('T/FX, X').map((c) => c.code)).toEqual(expect.arrayContaining(['T/FX', 'X']));
  });
});
