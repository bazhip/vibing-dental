import { vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('./supabaseClient', () => ({ supabase: { functions: { invoke } } }));

import { extractChartActions, invalidReason } from './aiAutofill';

const ctx = {
  patientInfo: { exam: {}, nerveBlocks: {}, treatmentReport: '', patientName: '', patientNumber: '', complaint: '' },
  species: 'canine', logo: 'none', toothData: [], preMarks: {}, postMarks: {}, preComments: [], postComments: [],
} as never;

const toolUse = (name: string, input: Record<string, unknown>) => ({ type: 'tool_use', id: name, name, input });

describe('extractChartActions — review flags', () => {
  it('turns uncertain calls, out-of-range values and flag_unclear into flags', async () => {
    invoke.mockResolvedValue({
      data: {
        content: [
          toolUse('add_comment', { diagram: 'pre', triadan: 109, text: 'AT', uncertain: true, reason: '"8T"',
            alternatives: [{ label: '108 T/FX', name: 'add_comment', input: { diagram: 'pre', triadan: 108, text: 'T/FX' } }] }),
          toolUse('set_tooth_field', { triadan: 104, field: 'gingivitis', value: '7' }), // out of range
          toolUse('set_tooth_field', { triadan: 104, field: 'calculus', value: '2' }),   // clean
          toolUse('flag_unclear', { heard: 'ninety-nine T/FX', reason: 'not a tooth', options: [
            { label: '109 T/FX', name: 'add_comment', input: { diagram: 'pre', triadan: 109, text: 'T/FX' } },
          ] }),
        ],
      },
      error: null,
    });
    const r = await extractChartActions({ delta: '1098T 104 GI 7 calc 2', recentContext: '', context: ctx, section: 'charting' });
    expect(r.actions).toHaveLength(3);
    expect(r.flags).toHaveLength(3);
    expect(r.flags[0]).toMatchObject({ triadan: 109, reason: '"8T"', options: [{ label: '108 T/FX' }] });
    expect(r.flags[1].reason).toMatch(/outside 0–3/);
    expect(r.flags[2].heard).toBe('ninety-nine T/FX');
    expect(r.flags[2].applied).toBeUndefined();
    expect(r.flags[2].options[0].label).toBe('109 T/FX');
  });
});

describe('invalidReason', () => {
  it('rejects impossible teeth and out-of-scale grid values', () => {
    expect(invalidReason({ name: 'add_comment', input: { triadan: 99, text: 'T/FX' } })).toMatch(/Triadan/);
    expect(invalidReason({ name: 'set_tooth_field', input: { triadan: 104, field: 'mobility', value: '5' } })).toMatch(/outside/);
    expect(invalidReason({ name: 'set_tooth_field', input: { triadan: 104, field: 'pocket', value: '4 5 4' } })).toBeNull();
    expect(invalidReason({ name: 'set_tooth_field', input: { triadan: 104, field: 'gingivitis', value: 'G2' } })).toBeNull();
  });
});
