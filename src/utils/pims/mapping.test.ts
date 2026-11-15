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
  it('edited note without a field yields no item', () => {
    expect(buildSendItems({ note: { editedText: 'x', field: null }, map: effectiveMap(null), fields, pngDataUrl: null }).items).toEqual([]);
  });
});

describe('splitStoredNote', () => {
  it('round trip', () => expect(splitStoredNote(recordNoteText(canineNote), canineNote)).toEqual(canineNote));
  it('fails on renamed heading', () => {
    expect(splitStoredNote(recordNoteText(canineNote).replace('PROCEDURES', 'WORK DONE'), canineNote)).toBeNull();
  });
});

it('saved null overrides default', () => expect(effectiveMap({ chart: null }).chart).toBeNull());
