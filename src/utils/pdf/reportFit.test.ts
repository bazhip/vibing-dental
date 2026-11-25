import { describe, it, expect, vi } from 'vitest';
import { PDFDocument, PDFPage, StandardFonts } from 'pdf-lib';
import { layoutTreatmentArea, type TreatmentAreaCard } from './sections';
import { buildDentalChartPDFBytes, type ReportFit } from '../pdfGenerator';
import { sampleOwnerReportSnapshot } from '../ownerReportSample';

// Page 2's right column: 7.7in tall, 5.1in wide (TREATMENT_REPORT).
const H = 7.7 * 72;
const W = 5.1 * 72;
const helvetica = async () => (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);

/** A structured CT report: mostly short "Structure: finding" lines. */
const ctReport = [
  'Study reviewed: cone-beam CT, bone window, 0.3 mm reconstruction. Head imaged from the nose to C1-2.',
  ' ',
  'Findings',
  ...['Skull', 'Cervical area', 'Mandible', 'Maxilla', 'TMJ', 'Nasal cavity', 'Frontal sinus', 'Nasopharynx',
    'Soft palate', 'Orbits', 'Ears', 'Hyoid', 'Zygomatic arch', 'Tympanic bulla'].map(s => `${s}: no pathological changes noted.`),
  '',
  'Dental structures:',
  'Retained tooth root: 301',
  'Complicated crown fracture: 104, 404',
  'All other teeth without pathological changes.',
  ' ',
  'Conclusions',
  '1. Complicated crown fractures: 104, 404',
  '2. Retained tooth root: 301',
  ' ',
  'Signed by the reviewing veterinarian.',
].join('\n');
const prose = 'Coronal access with a round bur, canal shaped with files and irrigated with saline and EDTA; working length confirmed radiographically. ';

const printed = (card: TreatmentAreaCard) => card.columns.flat().map(line => line.text).filter(Boolean).join(' ');

describe('page 2 report fitting', () => {
  it('sets a long list-style CT report in two columns instead of cutting it', async () => {
    const font = await helvetica();
    const layout = layoutTreatmentArea({ treatment: prose.repeat(6), radiographic: 'Pre and post-op radiographs taken.', ct: ctReport }, font, H, W);
    const ct = layout.cards.find(card => card.kind === 'ct')!;
    expect(ct.columns).toHaveLength(2);
    expect(layout.cards.every(card => card.hiddenLines === 0)).toBe(true);
    expect(printed(ct)).toContain('Signed by the reviewing veterinarian.');
    // The treatment report stays one column.
    expect(layout.cards[0].columns).toHaveLength(1);
  });

  it('keeps one column while the report fits that way', async () => {
    const font = await helvetica();
    const ct = layoutTreatmentArea({ treatment: 'Scaled.', ct: 'TMJ: normal.\nSkull: normal.' }, font, H, W).cards[1];
    expect(ct.columns).toHaveLength(1);
  });

  it('prints a run of blank or space-only lines as one half-height break', async () => {
    const font = await helvetica();
    const ct = layoutTreatmentArea({ treatment: 'Scaled.', ct: '\nFindings  \n \n\n\t\nConclusions\n\n' }, font, H, W).cards[1];
    expect(ct.columns[0].map(line => line.text)).toEqual(['Findings', '', 'Conclusions']);
  });

  it('reports what was cut and hands back the rest of the text', async () => {
    const font = await helvetica();
    const long = `${ctReport}\n${ctReport}\n${ctReport}\nThe very last line.`;
    const layout = layoutTreatmentArea({ treatment: prose.repeat(12), ct: long }, font, H, W);
    const ct = layout.cards.find(card => card.kind === 'ct')!;
    expect(ct.hiddenLines).toBeGreaterThan(0);
    expect(ct.remainder.endsWith('The very last line.')).toBe(true);
    // Nothing is lost between the printed part and the remainder.
    const all = (s: string) => s.replace(/\s+/g, ' ').trim();
    expect(all(`${printed(ct)} ${ct.remainder}`)).toBe(all(long.split('\n').filter(l => l.trim()).join(' ')));
  });
});

describe('continuing a cut report on an extra page', () => {
  const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));
  const diagram = { state: { marks: {}, comments: [], strokes: [] }, png: PNG };

  async function build(continueCutReports: boolean) {
    const snap = sampleOwnerReportSnapshot();
    const patient = { ...snap.patientInfo, treatmentReport: prose.repeat(14), radiographicFindings: '', ctReport: `${ctReport}\n${ctReport}\n${ctReport}\nThe very last line.` };
    const texts: string[] = [];
    const original = PDFPage.prototype.drawText;
    const spy = vi.spyOn(PDFPage.prototype, 'drawText').mockImplementation(function (this: PDFPage, text, options) {
      texts.push(text);
      return original.call(this, text, options);
    });
    let fit: ReportFit[] = [];
    try {
      const bytes = await buildDentalChartPDFBytes(patient, snap.toothData, snap.species, 'socal', diagram, diagram, 'clinic', {},
        { continueCutReports, onReportFit: cut => { fit = cut; } });
      return { texts, fit, pages: (await PDFDocument.load(bytes)).getPageCount() };
    } finally {
      spy.mockRestore();
    }
  }

  it('warns about the cut and, when asked, prints the rest on page 3', async () => {
    const cut = await build(false);
    expect(cut.fit).toEqual([expect.objectContaining({ kind: 'ct', hiddenLines: expect.any(Number) })]);
    expect(cut.texts.some(t => t.startsWith('… continued — full report'))).toBe(true);
    expect(cut.texts).not.toContain('The very last line.');

    const continued = await build(true);
    expect(continued.pages).toBeGreaterThan(cut.pages);
    expect(continued.texts).toContain('… continued on page 3.');
    expect(continued.texts).toContain('CT Report (continued)');
    expect(continued.texts).toContain('The very last line.');
  });
});
