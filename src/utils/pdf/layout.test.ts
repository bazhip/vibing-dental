import { afterEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument, PDFPage } from 'pdf-lib';
import { buildDentalChartPDFBytes, type PdfLayoutOptions } from '../pdfGenerator';
import { DIAGRAM_STATE_FIELD } from './parser';
import { EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS, type PatientInfo, type Species } from '../../types';

const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));
const diagram = { png, state: { marks: {}, comments: [], strokes: [] } };
const patient: PatientInfo = {
  patientName: 'Layout fixture', patientNumber: 'TEST', ownerName: '', ownerPhone: '', ownerEmail: '',
  doctor: '', tech: '', date: '2026-11-16', complaint: '', treatmentReport: '', recallDate: '',
  nerveBlocks: { ...EMPTY_NERVE_BLOCKS }, exam: { ...EMPTY_EXAM_FINDINGS },
};

afterEach(() => vi.restoreAllMocks());

async function capture(p: PatientInfo = patient, species: Species = 'canine', layout: PdfLayoutOptions = {}) {
  const images: Array<{ page: PDFPage; x: number; y: number; width: number; height: number }> = [];
  const texts: Array<{ page: PDFPage; text: string; y: number }> = [];
  const drawImage = PDFPage.prototype.drawImage;
  vi.spyOn(PDFPage.prototype, 'drawImage').mockImplementation(function (this: PDFPage, image, options = {}) {
    images.push({ page: this, x: options.x!, y: options.y!, width: options.width!, height: options.height! });
    return drawImage.call(this, image, options);
  });
  const drawText = PDFPage.prototype.drawText;
  vi.spyOn(PDFPage.prototype, 'drawText').mockImplementation(function (this: PDFPage, text, options = {}) {
    texts.push({ page: this, text, y: options.y! });
    return drawText.call(this, text, options);
  });
  const bytes = await buildDentalChartPDFBytes(p, [], species, 'socal', diagram, diagram, 'clinic', { practiceName: 'Test practice' }, layout);
  const post = images.at(-1)!;
  return { post, texts: texts.filter(t => t.page === post.page), bytes, allTexts: texts };
}

describe('procedure diagram available region', () => {
  it.each<Species>(['canine', 'canine-deciduous', 'feline', 'feline-deciduous', 'equine'])('centers %s in the full left column without anesthesia', async species => {
    const { post, texts } = await capture(patient, species);
    expect(texts.some(t => t.text.includes('Nerve Block'))).toBe(false);
    // Empty optional cards release the region from the report's top (0.30in)
    // to the footer clearance (8in), regardless of image aspect ratio.
    expect((612 - post.y - post.height / 2) / 72).toBeCloseTo((0.30 + 8) / 2, 6);
    expect((post.x + post.width / 2) / 72).toBeCloseTo(2.85, 6);
  });

  it('releases unused room above a short anesthesia card', async () => {
    const { post, texts } = await capture({ ...patient, nerveBlocks: { ...EMPTY_NERVE_BLOCKS, mentalLeft: '0.2' } });
    const lowest = Math.min(...texts.filter(t => t.text.includes('0.2')).map(t => t.y));
    expect((612 - post.y - post.height / 2) / 72).toBeLessThan((1.75 + 8) / 2);
    expect(post.y + post.height).toBeLessThan(lowest);
  });

  it('starts a custom-exam-only card at the top of the released column', async () => {
    const { post, texts } = await capture({ ...patient, customExam: [
      { id: 'e', label: 'Salivary glands', status: 'abnormal', comment: 'Enlarged left gland' },
    ] });
    const heading = texts.find(t => t.text.toLowerCase() === 'additional exam areas')!;
    expect(heading).toBeDefined();
    expect(heading.y).toBeGreaterThan(612 - 0.6 * 72);
    expect(texts.find(t => t.text === 'Enlarged left gland')!.y).toBeGreaterThan(post.y + post.height);
  });

  it('keeps the procedure diagram above its populated codes legend', async () => {
    const { post, texts } = await capture({ ...patient, treatmentReport: 'PD3, X, GTR, TR, RTR' });
    const heading = texts.find(t => t.text.toLowerCase() === 'codes used')!;
    expect(heading).toBeDefined();
    expect(post.y).toBeGreaterThan(heading.y);
    expect(post.width).toBeGreaterThan(0);
    expect(post.height).toBeGreaterThan(0);
  });

  it.each([true, false])('keeps populated cards above the diagram with grid=%s and appended imaging', async includeGrid => {
    const { post, texts, bytes } = await capture({ ...patient,
      treatmentReport: 'Extraction completed. '.repeat(200), radiographicFindings: 'Root resorption.',
      nerveBlocks: { ...EMPTY_NERVE_BLOCKS, infraorbitalLeft: '0.2', caudalMaxillaryLeft: '0.3', inferiorAlveolarRight: '0.4', mentalLeft: '0.1' },
      customAnesthesia: { blocks: [{ id: 'b', label: 'Palatine', right: '0.2', left: '' }], fields: [{ id: 'f', label: 'Fluids', type: 'text', value: 'LRS' }] },
      customExam: [{ id: 'e', label: 'Salivary glands', status: 'abnormal', comment: 'Enlarged left gland' }],
    }, 'canine', { includeGrid, images: [{ jpegBytes: null, caption: 'Radiograph', kind: 'xray' }] });
    const cardText = texts.filter(t => ['Palatine', 'LRS', 'Salivary glands', 'Enlarged left gland'].some(s => t.text.includes(s)));
    expect(cardText).toHaveLength(4);
    for (const line of cardText) expect(line.y).toBeGreaterThan(post.y + post.height);
    expect(post.y).toBeGreaterThanOrEqual(0.5 * 72);
    expect(post.height).toBeGreaterThan(2.2 * 72);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(3);
    expect(texts.map(t => t.text).join(' ')).toContain('Root resorption.');
  });
});


describe('supported maximum custom chart settings', () => {
  it('prints every entered field and exam comment on readable continuation pages', async () => {
    const maximal: PatientInfo = { ...patient,
      nerveBlocks: { ...EMPTY_NERVE_BLOCKS, infraorbitalLeft: '0.2', caudalMaxillaryLeft: '0.3', inferiorAlveolarRight: '0.4', mentalLeft: '0.1', other: 'Other detail '.repeat(80) + 'OTHER-END' },
      customAnesthesia: {
        blocks: Array.from({ length: 10 }, (_, i) => ({ id: `b${i}`, label: `Block ${i} ` + 'B'.repeat(31), right: '0.2', left: '0.3' })),
        fields: Array.from({ length: 15 }, (_, i) => ({ id: `f${i}`, label: `Field ${i} ` + 'F'.repeat(30), type: 'text' as const, value: 'Clinical detail '.repeat(30) + `FIELD-END-${i}` })),
      },
      customExam: Array.from({ length: 8 }, (_, i) => ({ id: `e${i}`, label: `Area ${i} ` + 'A'.repeat(52), status: 'abnormal' as const, comment: 'Exam detail '.repeat(40) + `EXAM-END-${i}` })),
    };
    const { bytes, allTexts, post } = await capture(maximal, 'canine', { includeGrid: false, images: [{ jpegBytes: null, caption: 'Supplemental radiograph', kind: 'xray' }] });
    const visible = allTexts.map(t => t.text).join(' ');
    for (let i = 0; i < 15; i++) expect(visible).toContain(`FIELD-END-${i}`);
    for (let i = 0; i < 8; i++) expect(visible).toContain(`EXAM-END-${i}`);
    expect(visible).toContain('OTHER-END');
    for (const field of maximal.customAnesthesia!.fields) expect(visible).toContain(field.value);
    for (const area of maximal.customExam!) expect(visible).toContain(area.comment);
    const loaded = await PDFDocument.load(bytes);
    expect(JSON.parse(loaded.getForm().getTextField(DIAGRAM_STATE_FIELD).getText()!).patientInfo).toEqual(maximal);
    const count = loaded.getPageCount();
    expect(count).toBeGreaterThan(2);
    expect(post.height).toBeGreaterThanOrEqual(2.2 * 72);
    expect(post.y).toBeGreaterThanOrEqual(0.5 * 72);
    for (const text of allTexts) expect(text.y, text.text).toBeGreaterThanOrEqual(8);
    const printedPages = new Set(allTexts.map(text => text.page));
    expect(printedPages.size).toBe(count);
    for (const page of printedPages) {
      const pageText = allTexts.filter(text => text.page === page).map(text => text.text).join(' ');
      expect(pageText).toContain(` of ${count}`);
      expect(pageText).toContain(maximal.patientName);
    }
  });
});
it('prints the visible radiology report, not superseded hidden findings, and respects a clear', async () => {
  const p = { ...patient, radiologyReport: 'Visible corrected radiology text.', radiographicFindings: 'Hidden superseded finding.' };
  const output = await capture(p);
  expect(output.allTexts.map(item => item.text).join('\n')).toContain('Visible corrected radiology text.');
  expect(output.allTexts.map(item => item.text).join('\n')).not.toContain('Hidden superseded');
  vi.restoreAllMocks();
  const empty = await capture({ ...p, radiologyReport: '' });
  expect(empty.allTexts.map(item => item.text).join('\n')).not.toContain('Hidden superseded');
});
