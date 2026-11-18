import i18n from '../i18n';
import { ChartSnapshot, EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS, Species } from '../types';
import { getInitialToothData } from '../constants';
import { buildRecordNote, recordNoteBasis, recordNoteHtml, recordNoteT, recordNoteText } from './recordNote';

function snap(over: Partial<ChartSnapshot> = {}, info: Partial<ChartSnapshot['patientInfo']> = {}): ChartSnapshot {
  const species: Species = over.species ?? 'canine';
  return {
    patientInfo: {
      patientName: 'Rex', patientNumber: '', ownerName: '', ownerPhone: '', ownerEmail: '',
      doctor: '', tech: '', date: '', complaint: '', treatmentReport: '', recallDate: '',
      nerveBlocks: { ...EMPTY_NERVE_BLOCKS }, exam: { ...EMPTY_EXAM_FINDINGS },
      ...info,
    },
    toothData: getInitialToothData(species),
    species,
    logo: 'socal',
    preMarks: {}, preComments: [], preStrokes: [],
    postMarks: {}, postComments: [], postStrokes: [],
    ...over,
  };
}

const en = () => recordNoteT('en');
const section = (s: ChartSnapshot, heading: string) =>
  buildRecordNote(s, en()).sections.find((x) => x.heading === heading);

describe('record note builder', () => {
  afterEach(() => i18n.changeLanguage('en'));

  it('omits empty sections', () => {
    expect(buildRecordNote(snap(), en()).sections.map((s) => s.heading)).toEqual(['Dental procedure']);
  });

  it('orders teeth by Triadan', () => {
    const toothData = getInitialToothData('canine').map((t) =>
      t.triadan === 409 ? { ...t, pocket: '5' } : t.triadan === 104 ? { ...t, mobility: '1' } : t);
    const lines = section(snap({ toothData }), 'Findings by tooth')!.lines;
    expect(lines[0]).toMatch(/^104/);
    expect(lines[0]).toContain('Mobility 1');
    expect(lines[1]).toMatch(/^409/);
    expect(lines[1]).toContain('Pocket 5');
  });

  it('quotes pinned comments, skips grid- mirrors, collects unpinned', () => {
    const lines = section(snap({
      preComments: [
        { id: 'c1', text: 'T/FX', anchorTriadan: 104 },
        { id: 'grid-104-x', text: 'dup', anchorTriadan: 104 },
        { id: 'c2', text: 'check occlusion', anchorTriadan: null },
      ],
    }), 'Findings by tooth')!.lines;
    const l104 = lines.find((l) => l.startsWith('104'))!;
    expect(l104).toContain('T/FX');
    expect(l104).not.toContain('dup');
    expect(lines[lines.length - 1]).toContain('check occlusion');
  });

  it('summarises missing and extracted', () => {
    const s = snap({ preMarks: { 108: 'missing', 204: 'missing' }, postMarks: { 409: 'extracted' } });
    expect(section(s, 'Findings by tooth')!.lines.join('\n')).toContain('108, 204');
    expect(section(s, 'Procedures')!.lines.join('\n')).toContain('409');
  });

  it('renders equine and deciduous charts', () => {
    expect(buildRecordNote(snap({ species: 'equine' }), en()).sections[0].lines.join(' ')).toContain('Equine');
    expect(buildRecordNote(snap({ species: 'canine-deciduous' }), en()).sections[0].lines.join(' ')).toContain('Deciduous');
  });

  it('includes exam, anesthesia, free text and recheck', () => {
    const s = snap({}, {
      exam: { ...EMPTY_EXAM_FINDINGS, buccal: { status: 'abnormal', comment: 'ulcer' }, tongue: { status: 'normal', comment: '' } },
      nerveBlocks: { ...EMPTY_NERVE_BLOCKS, infraorbitalRight: '0.2', drugs: [{ name: 'Bupivacaine', concentration: '0.5' }] },
      radiographicFindings: 'Root remnant 308',
      ctReport: 'TMJs normal',
      treatmentReport: 'Closed extraction',
      recallDate: '2027-01-01',
    });
    const headings = buildRecordNote(s, en()).sections.map((x) => x.heading);
    expect(headings).toEqual(['Dental procedure', 'Anesthesia', 'Oral exam', 'Radiographic report', 'CT report', 'Treatment report', 'Recheck']);
    expect(section(s, 'Oral exam')!.lines.join('\n')).toContain('Buccal mucosa: Abnormal — ulcer');
    expect(section(s, 'Anesthesia')!.lines.join('\n')).toContain('Infraorbital');
    expect(section(s, 'Anesthesia')!.lines.join('\n')).toContain('0.5% Bupivacaine');
  });

  it('names the template default anesthetic when blocks are charted without a drug', () => {
    const s = snap({}, { nerveBlocks: { ...EMPTY_NERVE_BLOCKS, mentalLeft: '0.1' } });
    expect(section(s, 'Anesthesia')!.lines[0]).toBe('0.5% Bupivacaine');
    const vca = snap({ logo: 'vca' }, { nerveBlocks: { ...EMPTY_NERVE_BLOCKS, mentalLeft: '0.1' } });
    expect(section(vca, 'Anesthesia')!.lines[0]).toBe('0.5% Ropivacaine');
    expect(recordNoteBasis(vca)).not.toBe(recordNoteBasis({ ...vca, logo: 'socal' }));
  });

  it('escapes html', () => {
    const html = recordNoteHtml(buildRecordNote(snap({}, { treatmentReport: '<b>&' }), en()));
    expect(html).toContain('&lt;b&gt;&amp;');
    expect(html).not.toContain('<b>&');
    expect(html).toContain('<strong>Treatment report</strong>');
  });

  it('formats text with uppercase headings and blank lines between sections', () => {
    const text = recordNoteText(buildRecordNote(snap({}, { treatmentReport: 'Done' }), en()));
    expect(text.startsWith('DENTAL PROCEDURE\n')).toBe(true);
    expect(text).toContain('\n\nTREATMENT REPORT\nDone');
  });

  it('basis ignores language and tracks the chart', () => {
    const s = snap();
    const a = recordNoteBasis(s);
    i18n.changeLanguage('fr');
    expect(recordNoteBasis(s)).toBe(a);
    const changed = { ...s, toothData: s.toothData.map((t, i) => (i === 0 ? { ...t, pocket: '9' } : t)) };
    expect(recordNoteBasis(changed)).not.toBe(a);
  });

  it('is deterministic', () => {
    const s = snap({ preMarks: { 108: 'missing' } });
    expect(buildRecordNote(s, en())).toEqual(buildRecordNote(s, en()));
  });
});
