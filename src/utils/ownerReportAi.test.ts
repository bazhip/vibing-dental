import { buildOwnerReportAiRequest, ownerReportFacts, parseOwnerReportDraft } from './ownerReportAi';
import { EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS, ChartSnapshot } from '../types';

const snap: ChartSnapshot = {
  patientInfo: {
    patientName: 'Bella', patientNumber: '4411', ownerName: 'Sam', ownerPhone: '', ownerEmail: '',
    doctor: '', tech: '', date: '2026-11-12', complaint: 'Bad breath', treatmentReport: 'Full mouth scale and polish. 108 extracted.',
    recallDate: '2027-05-12',
    nerveBlocks: { ...EMPTY_NERVE_BLOCKS },
    exam: { ...EMPTY_EXAM_FINDINGS, buccal: { status: 'abnormal', comment: 'ulcer left cheek' } },
  },
  toothData: [{ tooth: 'P4', triadan: 108, pocket: 'MB4 MP7 D6', gingivitis: '2' }],
  species: 'canine', logo: 'socal',
  preMarks: {}, preComments: [], preStrokes: [],
  postMarks: { 108: 'extracted' }, postComments: [], postStrokes: [],
};

describe('owner report AI draft', () => {
  it('gives the model only chart facts, in plain language', () => {
    const facts = ownerReportFacts(snap);
    expect(facts).toContain('Pet: Bella');
    expect(facts).toContain('Owner: Sam');
    expect(facts).toContain('Reason for visit: Bad breath');
    expect(facts).toMatch(/Teeth removed at this visit: .*108/);
    expect(facts).toMatch(/ulcer left cheek/);
    expect(facts).toContain('Full mouth scale and polish');
    expect(facts).toMatch(/Recommended recheck: /);
    expect(facts).toMatch(/7 mm/); // per-root pocket summarized as the deepest
  });

  it('the prompt forbids inventing anything and sets the report language', () => {
    const req = buildOwnerReportAiRequest(snap);
    expect(req.system[0].text).toMatch(/Use ONLY facts in the chart/);
    expect(req.system[0].text).toMatch(/never guess/);
    expect(req.messages[0].content[0].text).toMatch(/^Write in English\./);
    expect(req.tools.map((t) => t.name)).toEqual(['write_owner_report']);
  });

  it('reads the drafted summary and tips', () => {
    expect(parseOwnerReportDraft([
      { type: 'text' },
      { type: 'tool_use', name: 'write_owner_report', input: { intro: ' Bella had her teeth cleaned. ', homecare: ['- Soft food for 10 days', 'Brush daily', '', 7] } },
    ])).toEqual({ intro: 'Bella had her teeth cleaned.', homecare: 'Soft food for 10 days\nBrush daily' });
    expect(parseOwnerReportDraft([{ type: 'text' }])).toBeNull();
  });
});
