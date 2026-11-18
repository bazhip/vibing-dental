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

  it('sends the short findings: mouth-wide lines and notes with no tooth, codes in plain words', () => {
    const many: ChartSnapshot = {
      ...snap,
      toothData: [101, 102, 103, 104, 105, 106, 107].map((triadan) => ({ tooth: 'x', triadan, gingivitis: '2' })),
      postMarks: {},
      preComments: [{ id: 'n1', text: 'OM, left buccal mucosa', anchorTriadan: null, x: 0, y: 0, width: 100, height: 40 },
        { id: 'n2', text: 'T/FX/CCF', anchorTriadan: 104, x: 0, y: 0, width: 100, height: 40 }],
    };
    const facts = ownerReportFacts(many);
    expect(facts).toMatch(/Mouth-wide findings:\n- Gum inflammation on most teeth \(moderate\)/);
    expect(facts).toMatch(/Other findings:\n- a growth in the mouth, left buccal mucosa/);
    expect(facts).toContain('Reason for visit: Bad breath');
    expect(facts).toContain('Full mouth scale and polish');
    expect(facts).not.toContain('T/FX');
  });

  it('the prompt leads with the visit and mentions pending results', () => {
    const text = buildOwnerReportAiRequest(snap).system[0].text;
    expect(text).toMatch(/Lead with the main reason for the visit and what was done/);
    expect(text).toMatch(/results are pending.*biopsy, cytology or histopathology/s);
    expect(text).toMatch(/Never invent anything/);
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

it('blank AI facts distinguish missing documentation from health and include draft status', () => {
  const blank = { ...snap, toothData: [], postMarks: {}, patientInfo: { ...snap.patientInfo, treatmentReport: '', complaint: '', exam: { ...EMPTY_EXAM_FINDINGS } } };
  const facts = ownerReportFacts(blank);
  expect(facts).toContain('Report completion status: draft');
  expect(facts).toContain('Teeth removed at this visit: none recorded');
  expect(facts).toContain('Findings by tooth: none recorded');
  expect(facts).not.toContain('healthy');
  expect(buildOwnerReportAiRequest(blank).system[0].text).toContain('Missing or blank entries mean not recorded');
});

it('keeps explicit visit sources available to AI even with a manual report override', () => {
  const sources = { consultationHistory: 'History uncertain?', consultationAssessment: 'Possible disease?', consultationPlan: 'Discuss options', dischargeMedications: 'Drug 2 mg? verify', dischargeInstructions: 'Recorded instructions', dischargeFollowUp: 'As discussed' };
  const facts = ownerReportFacts({ ...snap, patientInfo: { ...snap.patientInfo, ...sources }, ownerReport: { extraNotes: 'Manual note' } });
  for (const text of Object.values(sources)) expect(facts).toContain(text);
  expect(facts).toContain('Manual note');
});
it('uses visible radiology report text instead of superseded legacy findings', () => {
  const value = { ...snap, patientInfo: { ...snap.patientInfo, radiographicFindings: 'Old hidden 108 finding', radiologyReport: '409: corrected possible resorption' } };
  expect(ownerReportFacts(value)).toContain('409: corrected possible resorption');
  expect(ownerReportFacts(value)).not.toContain('Old hidden');
  value.patientInfo.radiologyReport = '';
  expect(ownerReportFacts(value)).not.toContain('Old hidden');
});
it('includes recorded CT text separately from x-ray observations', () => {
  const value = { ...snap, patientInfo: { ...snap.patientInfo, ctReport: 'CT: 409 lesion; extent uncertain.', radiologyReport: 'Separate x-ray report.' } };
  expect(ownerReportFacts(value)).toContain('CT: 409 lesion; extent uncertain.');
  expect(ownerReportFacts(value)).toContain('Separate x-ray report.');
});
