import { normalizeTranscript, chunkLooksMedical } from './aiAutofill';

describe('normalizeTranscript', () => {
  it('collapses spelled-out triadan numbers', () => {
    expect(normalizeTranscript('one oh four mobility class two'))
      .toBe('104 mobility class two');
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
