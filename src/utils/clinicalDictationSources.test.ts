import { describe, expect, it } from 'vitest';
import { appendClinicalDictationSource, normalizeClinicalDictations } from './clinicalDictationSources';
const source = { id: 'source-1', kind: 'gp-exam' as const, language: 'en' as const, transcript: 'Weight 4 kg?', recordedAt: '2026-11-18T12:00:00Z', fields: ['gpVitals' as const] };
describe('clinical dictation sources', () => {
  it('keeps wording verbatim and rejects malformed imports', () => {
    expect(normalizeClinicalDictations([source, { ...source, id: 'bad', fields: ['unknown'] }])).toEqual([source]);
    expect(normalizeClinicalDictations({})).toEqual([]);
    expect(normalizeClinicalDictations([source, source])).toEqual([source]);
    expect(normalizeClinicalDictations([{ ...source, language: 'pt' }, { ...source, recordedAt: 'yesterday' }, { ...source, transcript: '' }])).toEqual([]);
    expect(normalizeClinicalDictations([{ ...source, kind: 'ct', fields: ['ctReport'] }])).toEqual([{ ...source, kind: 'ct', fields: ['ctReport'] }]);
    expect(normalizeClinicalDictations([{ ...source, transcript: 'x'.repeat(40001) }])).toEqual([]);
  });
  it('preserves a dental visit transcript with only its supplemental fields', () => {
    const dental = { ...source, kind: 'dental-visit' as const, transcript: 'CBC pending.', fields: ['gpDiagnostics' as const] };
    expect(normalizeClinicalDictations([dental])).toEqual([dental]);
    expect(appendClinicalDictationSource([], dental)).toEqual([dental]);
    expect(normalizeClinicalDictations([{ ...dental, fields: ['consultationAssessment'] }])).toEqual([]);
  });

  it('rejects count, individual and aggregate limits without truncating existing sources', () => {
    const full = Array.from({ length: 20 }, (_, i) => ({ ...source, id: String(i) }));
    expect(() => appendClinicalDictationSource(full, source)).toThrow();
    expect(() => appendClinicalDictationSource([], { ...source, transcript: 'x'.repeat(40001) })).toThrow();
    const large = Array.from({ length: 5 }, (_, i) => ({ ...source, id: String(i), transcript: 'x'.repeat(40000) }));
    expect(() => appendClinicalDictationSource(large, source)).toThrow();
    expect(full).toHaveLength(20);
    expect(appendClinicalDictationSource([], source)).toEqual([source]);
    expect(() => appendClinicalDictationSource([source], source)).toThrow();
    expect(normalizeClinicalDictations(large.concat({ ...source, id: 'over-total' }))).toEqual(large);
  });
});
