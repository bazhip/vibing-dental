import i18n from '../../i18n';
import { ChartSnapshot, EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS } from '../../types';
import { getInitialToothData } from '../../constants';
import { buildRecordNote, recordNoteT, recordNoteText } from '../recordNote';
import { buildSendItems, effectiveMap, splitStoredNote, type FieldInfo } from './mapping';

const PNG = 'data:image/png;base64,AAA';
const fields: FieldInfo[] = [
  { title: 'History', kind: 'note', acceptsImage: false },
  { title: 'Physical Exam', kind: 'note', acceptsImage: false },
  { title: 'Assessment', kind: 'note', acceptsImage: false },
  { title: 'Plan', kind: 'note', acceptsImage: false },
  { title: 'Discharge Summary', kind: 'dischargeSummary', acceptsImage: true },
  { title: 'Client Communication > Email', kind: 'email', acceptsImage: true },
];

const snapshot: ChartSnapshot = {
  patientInfo: {
    patientName: 'Rex', patientNumber: '123', ownerName: '', ownerPhone: '', ownerEmail: '',
    doctor: 'Dr A', tech: '', date: '2026-01-01', complaint: '', treatmentReport: 'Scaled <all>', recallDate: '',
    nerveBlocks: { ...EMPTY_NERVE_BLOCKS, infraorbitalRight: '0.5 ml' }, exam: { ...EMPTY_EXAM_FINDINGS, tongue: { status: 'normal', comment: '' } },
    radiographicFindings: 'No lesions',
  },
  toothData: getInitialToothData('canine').map((t) => (t.triadan === 104 ? { ...t, mobility: '1' } : t)),
  species: 'canine', logo: 'socal',
  preMarks: {}, preComments: [], preStrokes: [],
  postMarks: { 109: 'extracted' }, postComments: [], postStrokes: [],
};
const canineNote = buildRecordNote(snapshot, recordNoteT('en'));
const build = () => buildSendItems({ note: canineNote, map: effectiveMap(null), fields, pngDataUrl: PNG });

describe('buildSendItems', () => {
  afterEach(() => i18n.changeLanguage('en'));

  it('defaults group by field in note order', () => {
    const { items } = build();
    expect(items.map((i) => i.fieldTitle)).toEqual(['Plan', 'Physical Exam', 'Discharge Summary']);
    expect(items[0].text!.startsWith(canineNote.sections.find((x) => x.key === 'anesthesia')!.heading.toLocaleUpperCase())).toBe(true);
    expect(items[2]).toEqual({ fieldTitle: 'Discharge Summary', pngDataUrl: PNG });
  });
  it('header not sent by default', () => {
    expect(JSON.stringify(build())).not.toContain(canineNote.sections[0].lines[0]);
  });
  it('html escapes like the record note', () => {
    expect(build().items[0].html).toContain('Scaled &lt;all&gt;');
  });
  it('picture joins text sent to the same field', () => {
    const { items } = buildSendItems({ note: canineNote, map: { ...effectiveMap(null), treatment: 'Discharge Summary' }, fields, pngDataUrl: PNG });
    const ds = items.find((i) => i.fieldTitle === 'Discharge Summary')!;
    expect(ds.text).toBeTruthy();
    expect(ds.pngDataUrl).toBe(PNG);
  });
  it('picture to a field that rejects images is unresolved', () => {
    const r = buildSendItems({ note: canineNote, map: { ...effectiveMap(null), chart: 'Plan' }, fields, pngDataUrl: PNG });
    expect(r.unresolved).toEqual(['Plan']);
    expect(r.items.some((i) => i.pngDataUrl)).toBe(false);
  });
  it('email never targetable', () => {
    const r = buildSendItems({ note: canineNote, map: { ...effectiveMap(null), chart: 'Client Communication > Email' }, fields, pngDataUrl: PNG });
    expect(r.unresolved).toContain('Client Communication > Email');
  });
  it('unknown field is reported, rest still sent', () => {
    const r = buildSendItems({ note: canineNote, map: { ...effectiveMap(null), exam: 'Dental' }, fields, pngDataUrl: null });
    expect(r.unresolved).toEqual(['Dental']);
    expect(r.items.length).toBeGreaterThan(0);
  });
  it('edited note as one block', () => {
    expect(buildSendItems({ note: { editedText: 'x', field: 'Plan' }, map: effectiveMap(null), fields, pngDataUrl: null }).items[0])
      .toMatchObject({ fieldTitle: 'Plan', text: 'x', html: '<p>x</p>' });
  });
  it('edited note plus picture to the same field is one item', () => {
    const { items } = buildSendItems({ note: { editedText: 'x', field: 'Discharge Summary' }, map: effectiveMap(null), fields, pngDataUrl: PNG });
    expect(items).toEqual([expect.objectContaining({ fieldTitle: 'Discharge Summary', text: 'x', pngDataUrl: PNG })]);
  });
  it('edited note without a field yields no item', () => {
    expect(buildSendItems({ note: { editedText: 'x', field: null }, map: effectiveMap(null), fields, pngDataUrl: null }).items).toEqual([]);
  });
});

describe('splitStoredNote', () => {
  it('returns null when text precedes the first heading', () => {
    expect(splitStoredNote(`typed above\n${recordNoteText(canineNote)}`, canineNote)).toBeNull();
  });
  it('allows blank lines before the first heading', () => {
    expect(splitStoredNote(`\n\n${recordNoteText(canineNote)}`, canineNote)).toEqual(canineNote);
  });
  it('preserves edited body text', () => {
    const edited = recordNoteText(canineNote).replace('No lesions', 'Lesions seen');
    const r = splitStoredNote(edited, canineNote)!;
    expect(r.sections.find((x) => x.key === 'radiographs')!.lines).toEqual(['Lesions seen']);
  });
  it('round trip', () => expect(splitStoredNote(recordNoteText(canineNote), canineNote)).toEqual(canineNote));
  it('keeps the edited text when the generated note has no sections', () => {
    expect(splitStoredNote('Typed by hand', { sections: [] })).toBeNull();
    expect(splitStoredNote(' \n ', { sections: [] })).toEqual({ sections: [] });
  });
  it('fails on renamed heading', () => {
    expect(splitStoredNote(recordNoteText(canineNote).replace('PROCEDURES', 'WORK DONE'), canineNote)).toBeNull();
  });
});

it('saved null overrides default', () => expect(effectiveMap({ chart: null }).chart).toBeNull());
it('effectiveMap keeps the saved edited-note destination', () => {
  expect(effectiveMap({ editedNote: 'Assessment' })).toMatchObject({ editedNote: 'Assessment', treatment: 'Plan' });
  expect(effectiveMap(null).editedNote).toBeUndefined();
});

it.each(['edited', 'removed', 'multiline'])('keeps a legacy stored complaint %s without sending demographics or restoring current chart wording', mode => {
  const generated = buildRecordNote({ ...snapshot, patientInfo: { ...snapshot.patientInfo, patientName: 'Private patient', complaint: 'Current chart complaint' } }, recordNoteT('en'));
  const complaint = generated.sections.find(section => section.key === 'complaint')!;
  const legacy = { sections: generated.sections.filter(section => section.key !== 'complaint').map(section => ({ ...section, lines: [...section.lines] })) };
  const header = legacy.sections.find(section => section.key === 'header')!;
  if (mode !== 'removed') header.lines.push(`${complaint.heading}: Edited legacy wording`, ...(mode === 'multiline' ? ['Second recorded line'] : []));
  const split = splitStoredNote(recordNoteText(legacy), generated);
  expect(split).not.toBeNull();
  const { items } = buildSendItems({ note: split!, map: effectiveMap(null), fields, pngDataUrl: null });
  const text = items.map(item => item.text ?? '').join('\n');
  expect(text).not.toContain('Private patient');
  expect(text).not.toContain('Current chart complaint');
  if (mode === 'removed') expect(split!.sections.some(section => section.key === 'complaint')).toBe(false);
  else expect(text).toContain(mode === 'multiline' ? 'Edited legacy wording\nSecond recorded line' : 'Edited legacy wording');
});
it('keeps the whole stored note when only its complaint heading was removed', () => {
  const generated = buildRecordNote({ ...snapshot, patientInfo: { ...snapshot.patientInfo, complaint: 'Recorded complaint that must not disappear' } }, recordNoteT('en'));
  const complaint = generated.sections.find(section => section.key === 'complaint')!;
  const edited = recordNoteText(generated).replace(complaint.heading.toLocaleUpperCase() + '\n', '');
  expect(splitStoredNote(edited, generated)).toBeNull();
});

it('sends a mapped custom discharge section with its clinical heading and text', () => {
  const field = 'dischargeCustom_activity';
  const note = buildRecordNote({ ...snapshot, patientInfo: {
    ...snapshot.patientInfo,
    [field]: 'Follow the activity plan.',
    dischargeLayout: { id: 'recovery', fields: [], sections: [{ id: field, label: 'Activity' }] },
  } }, recordNoteT('en'));
  const available = fields.filter(field => field.title === 'Discharge Summary');
  const { items } = buildSendItems({ note, map: { ...effectiveMap(null, 'ezyvet', available), [field]: 'Discharge Summary' },
    fields: available, pngDataUrl: null });
  expect(items).toEqual([expect.objectContaining({
    fieldTitle: 'Discharge Summary',
    text: 'ACTIVITY\nFollow the activity plan.',
  })]);
});
