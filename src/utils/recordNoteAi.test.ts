import { buildRecordNoteAiRequest, parseRecordNoteDraft } from './recordNoteAi';
import { EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS, ChartSnapshot } from '../types';

const snap: ChartSnapshot = {
  patientInfo: {
    patientName: 'Bella', patientNumber: '4411', ownerName: 'Sam', ownerPhone: '', ownerEmail: '',
    doctor: '', tech: '', date: '2026-11-12', complaint: '', treatmentReport: 'Closed extraction 108.',
    recallDate: '', nerveBlocks: { ...EMPTY_NERVE_BLOCKS }, exam: { ...EMPTY_EXAM_FINDINGS },
  },
  toothData: [{ tooth: 'I4', triadan: 104, mobility: '2' }],
  species: 'canine', logo: 'socal',
  preMarks: {}, preComments: [], preStrokes: [],
  postMarks: {}, postComments: [], postStrokes: [],
};

describe('record note AI polish', () => {
  it('asks for the note language and sends the rule-built note', () => {
    const req = buildRecordNoteAiRequest(snap, 'fr');
    expect(req.kind).toBe('record_note');
    expect(req.tools[0].name).toBe('write_record_note');
    const text = req.messages[0].content[0].text;
    expect(text).toContain('Write in Français (French).');
    expect(text).toContain('104');
    expect(text).toContain('Closed extraction 108.');
  });

  it('keeps the facts-only rules in the system prompt', () => {
    const system = buildRecordNoteAiRequest(snap, 'en').system[0].text;
    expect(system).toMatch(/only facts/i);
    expect(system).toMatch(/tooth number/i);
  });

  it('parses the tool reply', () => {
    expect(parseRecordNoteDraft([{ type: 'tool_use', name: 'write_record_note', input: { text: ' A ' } }])).toBe('A');
    expect(parseRecordNoteDraft([{ type: 'text' }])).toBeNull();
    expect(parseRecordNoteDraft([{ type: 'tool_use', name: 'write_record_note', input: { text: '  ' } }])).toBeNull();
  });
});
