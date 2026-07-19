import { PDFDocument } from 'pdf-lib';
import { parseDentalChartPDF, DIAGRAM_STATE_FIELD, StashedState } from './parser';
import {
  PatientInfo,
  ToothData,
  Species,
  Logo,
  EMPTY_NERVE_BLOCKS,
  EMPTY_EXAM_FINDINGS,
} from '../../types';

/**
 * Builds a minimal PDF that carries a JSON stash in the hidden form
 * field — same shape the real generator emits — and wraps the bytes in
 * a File for the parser. We don't go through the real generator here:
 * those drawers depend on canvas/SVG rasterization which isn't
 * available in jsdom.
 */
async function pdfWithStash(stash: StashedState): Promise<File> {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const form = pdf.getForm();
  const field = form.createTextField(DIAGRAM_STATE_FIELD);
  field.setText(JSON.stringify(stash));
  const bytes = await pdf.save();
  const file = new File([bytes as BlobPart], 'chart.pdf', { type: 'application/pdf' });
  // jsdom's File doesn't implement arrayBuffer() in the version pinned here,
  // so we polyfill it with the original bytes for the parser.
  if (typeof file.arrayBuffer !== 'function') {
    Object.defineProperty(file, 'arrayBuffer', {
      value: () => Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
    });
  }
  return file;
}

describe('parseDentalChartPDF (modern stash format)', () => {
  it('round-trips full chart state', async () => {
    const patientInfo: PatientInfo = {
      patientName: 'Whiskers',
      patientNumber: 'P-42',
      doctor: 'Dr. Sam Waggoner, DVM, DAVDC',
      tech: 'Alex',
      date: '2026-04-15',
      complaint: 'tartar buildup',
      treatmentReport: 'Cleaning + extraction of 209.',
      recallDate: '2027-01-15',
      ownerName: 'Alex Doe',
      ownerPhone: '555-0101',
      ownerEmail: 'alex@example.com',
      nerveBlocks: { ...EMPTY_NERVE_BLOCKS, infraorbitalRight: '0.3' },
      exam: {
        ...EMPTY_EXAM_FINDINGS,
        buccal: { status: 'abnormal', comment: 'mild redness' },
      },
    };
    const toothData: ToothData[] = [
      { tooth: '101', triadan: 101, mobility: '1' },
      { tooth: '209', triadan: 209, calculus: '2' },
    ];
    const species: Species = 'feline';
    const logo: Logo = 'socal';

    const pre = {
      marks: { 101: 'missing' as const },
      comments: [{ id: 'c1', text: 'note', anchorTriadan: 101, x: 100, y: 50 }],
      strokes: [],
    };
    const post = {
      marks: { 209: 'extracted' as const },
      comments: [],
      strokes: [
        {
          id: 's1',
          arch: 'maxilla' as const,
          color: '#e53e3e',
          width: 2,
          points: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
        },
      ],
    };

    const file = await pdfWithStash({
      patientInfo, toothData, species, logo, pre, post,
    });
    const parsed = await parseDentalChartPDF(file);

    expect(parsed.patientInfo).toEqual(patientInfo);
    expect(parsed.toothData).toEqual(toothData);
    expect(parsed.species).toBe(species);
    expect(parsed.logo).toBe(logo);
    expect(parsed.preDiagram).toEqual(pre);
    expect(parsed.postDiagram).toEqual(post);
  });

  it('falls back to empty diagram state when stash omits pre/post', async () => {
    const patientInfo: PatientInfo = {
      patientName: 'Rex',
      patientNumber: 'P-1',
      doctor: 'Dr. Sam Waggoner, DVM, DAVDC',
      tech: '',
      date: '2026-04-15',
      complaint: '',
      treatmentReport: '',
      recallDate: '',
      ownerName: '',
      ownerPhone: '',
      ownerEmail: '',
      nerveBlocks: { ...EMPTY_NERVE_BLOCKS },
      exam: { ...EMPTY_EXAM_FINDINGS },
    };
    const file = await pdfWithStash({
      patientInfo,
      toothData: [],
      species: 'canine',
      logo: 'vca',
    });
    const parsed = await parseDentalChartPDF(file);

    expect(parsed.preDiagram).toEqual({ marks: {}, comments: [], strokes: [] });
    expect(parsed.postDiagram).toEqual({ marks: {}, comments: [], strokes: [] });
  });
});
