import { EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS } from '../types';
import { normalizeTranscript, chunkWorthSending, buildChunkRequest, buildReviewRequest, markFinalCheck, normalizeFieldValue, isPerioOnlyText, codeOnlyComment, dedupeActions } from './aiAutofill';

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

describe('chunkWorthSending', () => {
  it('sends findings, including ones the old keyword gate dropped', () => {
    expect(chunkWorthSending('209 extracted')).toBe(true);
    expect(chunkWorthSending('tongue normal palate normal')).toBe(true);
    expect(chunkWorthSending('104 M2')).toBe(true);
    expect(chunkWorthSending('M2')).toBe(true);
    expect(chunkWorthSending('504 fractured')).toBe(true); // deciduous + "fractured"
    expect(chunkWorthSending('that one is fractured')).toBe(true);
    expect(chunkWorthSending('and two on that one')).toBe(true); // continuation
    expect(chunkWorthSending('Speaker 0: resorbed')).toBe(true);
    expect(chunkWorthSending('2')).toBe(true);
  });

  it('skips pure filler', () => {
    expect(chunkWorthSending('')).toBe(false);
    expect(chunkWorthSending('ok')).toBe(false);
    expect(chunkWorthSending('thanks')).toBe(false);
    expect(chunkWorthSending('Okay, got it.')).toBe(false);
    expect(chunkWorthSending('Speaker 1: yeah thank you')).toBe(false);
  });
});

describe('buildChunkRequest', () => {
  const ctx = {
    patientInfo: {
      patientName: '', patientNumber: '', ownerName: '', ownerPhone: '', ownerEmail: '', doctor: '', tech: '',
      date: '', complaint: '', treatmentReport: '', recallDate: '',
      nerveBlocks: { ...EMPTY_NERVE_BLOCKS }, exam: { ...EMPTY_EXAM_FINDINGS },
    },
    species: 'canine' as const, logo: 'socal' as const, toothData: [],
    preMarks: {}, preComments: [], postMarks: {}, postComments: [],
  };
  const text = (r: ReturnType<typeof buildChunkRequest>) => r!.messages[0].content[0].text;

  it('sends the raw transcript alongside the cleaned one when they differ', () => {
    const t = text(buildChunkRequest({ delta: 'one oh four GI two', recentContext: '', context: ctx }));
    expect(t).toContain('AS TRANSCRIBED:\none oh four GI two');
    expect(t).toContain('AUTO-CLEANED:\n104 GI 2');
  });

  it('sends one copy when cleanup changes nothing', () => {
    const t = text(buildChunkRequest({ delta: '104 extracted', recentContext: '', context: ctx }));
    expect(t).not.toContain('AS TRANSCRIBED');
    expect(t).toContain('104 extracted');
  });

  it('lets earlier context complete a finding split across chunks', () => {
    const t = text(buildChunkRequest({ delta: 'GI 2 calc 1', recentContext: '105', context: ctx }));
    expect(t).toMatch(/completes, continues or corrects a finding/);
    expect(t).not.toMatch(/already considered/);
  });

  it('returns null for filler', () => {
    expect(buildChunkRequest({ delta: 'okay', recentContext: '', context: ctx })).toBeNull();
  });

  it('treats the open page as a hint, not a limit', () => {
    const t = text(buildChunkRequest({ delta: 'tongue normal', recentContext: '', context: ctx, section: 'charting' }));
    expect(t).toContain('OPEN PAGE');
    expect(t).toMatch(/doesn't limit anything/);
    expect(t).not.toMatch(/get no tool call/);
  });
});

describe('buildReviewRequest', () => {
  const ctx = {
    patientInfo: {
      patientName: '', patientNumber: '', ownerName: '', ownerPhone: '', ownerEmail: '', doctor: '', tech: '',
      date: '', complaint: '', treatmentReport: '', recallDate: '',
      nerveBlocks: { ...EMPTY_NERVE_BLOCKS }, exam: { ...EMPTY_EXAM_FINDINGS },
    },
    species: 'canine' as const, logo: 'socal' as const, toothData: [],
    preMarks: {}, preComments: [], postMarks: {}, postComments: [],
  };

  it('sends the whole transcript, the chart and rejected items in review mode', () => {
    const r = buildReviewRequest({
      transcript: '104 GI 2\n105 missing',
      context: ctx,
      rejected: [{ name: 'set_tooth_mark', input: { diagram: 'pre', triadan: 105, mark: 'missing' } }],
    })!;
    expect(r.mode).toBe('review');
    const t = r.messages[0].content[0].text;
    expect(t).toContain('104 GI 2\n105 missing');
    expect(t).toContain('Rejected by the vet');
    expect(t).toContain('Current chart state');
  });

  it('keeps the end of an over-long transcript and says so', () => {
    const line = 'x'.repeat(99) + '\n';
    const r = buildReviewRequest({ transcript: line.repeat(3000) + 'LAST LINE', context: ctx, rejected: [] })!;
    const t = r.messages[0].content[0].text;
    expect(t).toContain('LAST LINE');
    expect(t).toContain('starts partway through');
  });
});

describe('markFinalCheck', () => {
  it('turns every final-check change into a review flag', () => {
    const a = { name: 'set_tooth_field', input: { triadan: 104, field: 'gingivitis', value: '2' } };
    const flags = markFinalCheck({ actions: [a], skipped: [], flags: [] });
    expect(flags).toHaveLength(1);
    expect(flags[0].applied).toBe(a);
    expect(flags[0].reason).toMatch(/final check/i);
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
    expect(chunkWorthSending(out)).toBe(true);
  });
  it('passes spoken shorthand without a tooth number', () => {
    expect(chunkWorthSending(normalizeTranscript('Or GI two?'))).toBe(true);
    expect(chunkWorthSending(normalizeTranscript('calc one'))).toBe(true);
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

describe('GE = gingival enlargement (the Enlargement column)', () => {
  it('normalizes the ways GE gets transcribed', () => {
    expect(normalizeTranscript('106 GE3')).toBe('106 GE 3');
    expect(normalizeTranscript('106 GE three')).toBe('106 GE 3');
    expect(normalizeTranscript('106 G E three')).toBe('106 GE 3');
    expect(normalizeTranscript('104GE3, calc 1')).toBe('104 GE 3, calc 1');
    expect(normalizeTranscript('enlargement three')).toBe('enlargement 3');
  });

  it('splits a GE score run into the next tooth', () => {
    expect(normalizeTranscript('105 GE 3102 GI 1')).toBe('105 GE 3 102 GI 1');
  });

  it('keeps GE distinct from GI and leaves ordinary words alone', () => {
    expect(normalizeTranscript('106 GI two, GE three')).toBe('106 GI 2, GE 3');
    expect(normalizeTranscript('the gauge is good')).toBe('the gauge is good');
  });

  it('the prompt maps GE to hyperplasia, not gingivitis', () => {
    const ctx = {
      patientInfo: {
        patientName: '', patientNumber: '', ownerName: '', ownerPhone: '', ownerEmail: '', doctor: '', tech: '',
        date: '', complaint: '', treatmentReport: '', recallDate: '',
        nerveBlocks: { ...EMPTY_NERVE_BLOCKS }, exam: { ...EMPTY_EXAM_FINDINGS },
      },
      species: 'canine' as const, logo: 'socal' as const, toothData: [],
      preMarks: {}, preComments: [], postMarks: {}, postComments: [],
    };
    const req = buildChunkRequest({ delta: '106 GE3', recentContext: '', context: ctx })!;
    expect(req.system[0].text).toMatch(/"GE 3" → hyperplasia 3/);
    expect(req.system[0].text).toMatch(/field=hyperplasia, value=3/);
    const tool = req.tools.find((t) => t.name === 'set_tooth_field')!;
    expect(tool.description).toMatch(/GE is enlargement \(hyperplasia\), never gingivitis/);
  });
});

import { buildReviewRequest as _brr } from './aiAutofill';
describe('call type is labelled for usage logging', () => {
  it('live chunks and final checks carry their kind', () => {
    const ctx = {
      patientInfo: {
        patientName: '', patientNumber: '', ownerName: '', ownerPhone: '', ownerEmail: '', doctor: '', tech: '',
        date: '', complaint: '', treatmentReport: '', recallDate: '',
        nerveBlocks: { ...EMPTY_NERVE_BLOCKS }, exam: { ...EMPTY_EXAM_FINDINGS },
      },
      species: 'canine' as const, logo: 'socal' as const, toothData: [],
      preMarks: {}, preComments: [], postMarks: {}, postComments: [],
    };
    expect(buildChunkRequest({ delta: '104 GI 2', recentContext: '', context: ctx })!.kind).toBe('live');
    expect(_brr({ transcript: '104 GI 2', context: ctx, rejected: [] })!.kind).toBe('review');
  });
});

import { dictationCacheWarm, markDictationPromptUsed } from './aiAutofill';

describe('dictation prompt cache warmth', () => {
  it('is warm for a few minutes after the prompt was used, then cold', () => {
    const t0 = 1_000_000_000;
    markDictationPromptUsed(t0);
    expect(dictationCacheWarm(t0 + 60_000)).toBe(true);
    expect(dictationCacheWarm(t0 + 3.9 * 60_000)).toBe(true);
    expect(dictationCacheWarm(t0 + 4.1 * 60_000)).toBe(false); // the 5-minute cache may be gone: warm again
  });
});
