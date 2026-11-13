import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { PDFDocument, PDFPage, StandardFonts } from 'pdf-lib';
import { buildDentalChartPDFBytes, type DiagramExport, type PdfLayoutOptions } from '../pdfGenerator';
import { EMPTY_NERVE_BLOCKS, normalizeNerveBlocks, type PatientInfo, type ToothData, type Species, type Logo } from '../../types';
import { parseDentalChartPDF, type DiagramState } from './parser';
import { pdfSafe } from './sections';
import { codeDefinition } from '../../constants/dentalCodes';
import { APP_LANGUAGES } from '../../i18n/config';

/**
 * Text the generated clinical chart PDF draws, captured from every
 * page.drawText call in draw order (text, position, size). The English
 * capture is pinned in __snapshots__/en-text.json, taken before the PDF
 * was localized: English output must never drift.
 */

// 1×1 transparent PNG — the diagrams are images, their text isn't captured.
const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0)
);

const diagram = (state: Partial<DiagramState> = {}): DiagramExport => ({
  state: { marks: {}, comments: [], strokes: [], ...state },
  png: PNG,
});

const r2 = (n: number) => Math.round(n * 100) / 100;

type Run = { t: string; x: number; y: number; s: number };

async function captureText(
  patientInfo: PatientInfo,
  toothData: ToothData[],
  species: Species,
  logo: Logo,
  pre: DiagramExport,
  post: DiagramExport,
  styleId: string,
  layout: PdfLayoutOptions
): Promise<Run[]> {
  return (await buildCapturing(patientInfo, toothData, species, logo, pre, post, styleId, layout)).runs;
}

async function buildCapturing(
  patientInfo: PatientInfo,
  toothData: ToothData[],
  species: Species,
  logo: Logo,
  pre: DiagramExport,
  post: DiagramExport,
  styleId: string,
  layout: PdfLayoutOptions
): Promise<{ runs: Run[]; bytes: Uint8Array }> {
  const runs: Run[] = [];
  const original = PDFPage.prototype.drawText;
  const spy = vi.spyOn(PDFPage.prototype, 'drawText').mockImplementation(function (this: PDFPage, text, options) {
    runs.push({ t: text, x: r2(options?.x ?? 0), y: r2(options?.y ?? 0), s: r2(options?.size ?? 0) });
    return original.call(this, text, options);
  });
  let bytes: Uint8Array;
  try {
    bytes = await buildDentalChartPDFBytes(
      patientInfo, toothData, species, logo, pre, post, styleId,
      { practiceName: 'Harbor Animal Dental', doctorName: 'Dr. Ada Lin, DVM' },
      layout
    );
  } finally {
    spy.mockRestore();
  }
  return { runs, bytes };
}

// ---------------------------------------------------------------- Fixtures --

const richPatient: PatientInfo = {
  patientName: 'Biscuit',
  patientNumber: 'P-2048',
  ownerName: 'Jo Rivera',
  ownerPhone: '555-0102',
  ownerEmail: 'jo@example.com',
  doctor: 'Dr. Typed Doctor',
  tech: 'Sam Patel',
  date: '2026-11-13',
  complaint: 'Halitosis, PD3 suspected; T/FX on 108. Owner reports chewing on one side only for two weeks.',
  treatmentReport: 'Scaling and polishing. X on 108 (surgical). ' + 'GTR performed on 409. ',
  radiographicFindings: 'TR on 307 and 407; RTR 208.',
  recallDate: '2027-05-13',
  nerveBlocks: {
    ...EMPTY_NERVE_BLOCKS,
    infraorbitalRight: '0.3', infraorbitalLeft: '0.3',
    caudalMaxillaryRight: '0.2',
    inferiorAlveolarLeft: '0.4',
    mentalRight: '0.1',
    other: 'Splash block at 108 extraction site.',
    drugs: [
      { name: 'Bupivacaine', concentration: '0.5' },
      { name: 'Lidocaine', concentration: '2' },
      { name: 'Dexmedetomidine', concentration: '0.05' },
    ],
  },
  customAnesthesia: {
    blocks: [
      { id: 'b1', label: 'Major palatine', right: '0.2', left: '0.2' },
      { id: 'b2', label: '', right: '', left: '0.1' },
    ],
    fields: [
      { id: 'f1', label: 'Premedication', type: 'text', value: 'Methadone' },
      { id: 'f2', label: 'ET tube', type: 'number', unit: 'mm', value: '7' },
      { id: 'f3', label: 'IV catheter', type: 'checkbox', value: 'yes' },
      { id: 'f4', label: '', type: 'select', value: 'LRS' },
    ],
  },
  exam: {
    extraoral: { status: 'normal', comment: '' },
    lymph: { status: 'abnormal', comment: 'Left mandibular node enlarged, firm, non-painful on palpation; recommend fine-needle aspirate at next visit if persistent.' },
    buccal: { status: 'abnormal', comment: 'GH near 108' },
    tongue: { status: 'normal', comment: '' },
    palate: { status: '', comment: '' },
    pharynx: { status: 'abnormal', comment: 'Mild tonsillar redness' },
  },
};

const richTeeth: ToothData[] = [
  { tooth: '108', triadan: 108, mobility: '2', recession: '1', pocket: '5', furcation: 'F2', hyperplasia: '', calculus: '3', gingivitis: '2', pdstate: 'PD3' },
  { tooth: '208', triadan: 208, mobility: '1', pocket: 'MB4 MP5 D6', calculus: '2', pdstate: 'PD2' },
  { tooth: '307', triadan: 307, recession: '2', hyperplasia: 'GH', gingivitis: '1', pdstate: 'TR' },
  { tooth: '409', triadan: 409, mobility: '3', pocket: '8', furcation: 'F3', pdstate: 'PD4' },
];

const manyCodes = [
  'PD1', 'PD2', 'PD3', 'PD4', 'GR', 'GH', 'GE', 'TR', 'RTR', 'RCR', 'T/NV', 'T/PE', 'T/NE', 'MAL1', 'MAL2',
  'MAL3', 'CB', 'DT/P', 'T/A', 'T/LUX', 'T/U', 'ANO', 'HYP', 'OLI', 'T/SN', 'T/SR', 'E/P', 'ABE', 'AOS', 'PEC',
  'T/FUS', 'T/GEM', 'T/MAC', 'T/MIC', 'T/EL', 'ATE', 'RR', 'T/DIL', 'T/V', 'T/CCR',
].join(', ');

const plainPatient: PatientInfo = {
  ...richPatient,
  patientName: 'Mochi',
  patientNumber: '',
  complaint: '',
  radiographicFindings: '',
  customAnesthesia: undefined,
  nerveBlocks: { ...EMPTY_NERVE_BLOCKS, mentalLeft: '0.2' },
  treatmentReport: Array.from({ length: 70 }, (_, i) => `Line ${i + 1}: extraction of 1${String(i % 9 + 1).padStart(2, '0')} with closure.`).join('\n'),
  exam: {
    extraoral: { status: 'abnormal', comment: 'Swelling below the right eye' },
    lymph: { status: 'normal', comment: '' },
    buccal: { status: 'normal', comment: '' },
    tongue: { status: 'abnormal', comment: '' },
    palate: { status: 'normal', comment: '' },
    pharynx: { status: 'normal', comment: '' },
  },
};

type Scenario = Parameters<typeof captureText>;

const SCENARIOS: Record<string, Scenario> = {
  // Every page-1/page-2 section with the grid: VCA tech line, drug row,
  // caudal block, custom blocks/fields, findings + treatment, both legends.
  vcaGrid: [
    richPatient, richTeeth, 'canine', 'vca',
    diagram({ marks: { 108: 'missing' }, comments: [{ id: 'c1', text: 'T/FX 108', anchorTriadan: 108 }] }),
    diagram({ marks: { 108: 'extracted' }, comments: [{ id: 'c2', text: 'X 108, GTR', anchorTriadan: 108 }] }),
    'iris', { includeGrid: true },
  ],
  // No grid: compact exam, one-column legend that overflows ("+N more"),
  // single-drug header, a report long enough to be cut off, one image.
  socalNoGrid: [
    plainPatient, richTeeth, 'feline-deciduous', 'socal',
    diagram({ comments: [{ id: 'c1', text: manyCodes, anchorTriadan: null }] }),
    diagram(),
    'clinic', { includeGrid: false, hiddenBlocks: ['infraorbital'], images: [{ jpegBytes: null, caption: 'Left lateral', kind: 'photo' }] },
  ],
  // Image pages counting across pages.
  images: [
    plainPatient, [], 'canine-deciduous', 'socal', diagram(), diagram(), 'journal',
    {
      images: [
        { jpegBytes: null, caption: 'Rostral maxilla', kind: 'xray' },
        { jpegBytes: null, caption: '', kind: 'photo' },
        { jpegBytes: null, caption: 'Right mandible', kind: 'xray' },
        { jpegBytes: null, caption: 'Occlusion', kind: 'photo' },
        { jpegBytes: null, caption: 'Post-op', kind: 'photo' },
      ],
    },
  ],
};

// ------------------------------------------------------------------- Tests --

beforeAll(() => {
  // The footer prints the generation time.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 13, 9, 30));
});
afterAll(() => vi.useRealTimers());
afterEach(() => vi.restoreAllMocks());

describe('clinical chart PDF text', () => {
  it('English output is unchanged (snapshot taken before localization)', async () => {
    const out: Record<string, Run[]> = {};
    for (const [name, args] of Object.entries(SCENARIOS)) out[name] = await captureText(...args);
    await expect(JSON.stringify(out, null, 1) + '\n').toMatchFileSnapshot('./__snapshots__/en-text.json');
  });
});

describe('clinical chart PDF in another language', () => {
  const texts = async (lng: string, styleId = 'clinic') => {
    const [p, teeth, species, logo, pre, post, , layout] = SCENARIOS.vcaGrid;
    const runs = await captureText(p, teeth, species, logo, pre, post, styleId, { ...layout, lng } as PdfLayoutOptions);
    return runs.map((r) => r.t);
  };

  it('prints French headings, column labels and code definitions', async () => {
    const fr = await texts('fr');
    for (const s of [
      'Schéma dentaire canin', 'Informations sur le patient', 'Motif de consultation', 'Examen bucco-dentaire',
      'Nœuds lymphatiques', 'Arcade maxillaire', 'Arcade mandibulaire', 'Mobilité', 'Dent', 'Codes utilisés',
      'Anesthésie · Blocs nerveux', 'Bloc nerveux', 'DROITE', 'GAUCHE', 'Infra-orbitaire', 'Autre',
      'Compte rendu de traitement et de chirurgie', 'OBSERVATIONS RADIOGRAPHIQUES', 'Généré le 2026-11-13 09:30',
      'Auxiliaire : Sam Patel', 'Bloc personnalisé', '0.3 mL',
    ]) expect(fr, s).toContain(s);
    expect(fr).toContain(codeDefinition('TR', 'fr'));
    expect(codeDefinition('TR', 'fr')).not.toBe('Tooth resorption');
    // "Page 1 sur 2" is drawn in three runs so the number can be bold.
    expect(fr).toEqual(expect.arrayContaining(['Page ', ' sur 2']));
    // No English chrome left behind.
    for (const s of [
      'Mobility', 'Patient Information', 'Oral Exam Findings', 'Maxillary Arch', 'Codes Used', 'Tooth resorption',
      'RIGHT', 'LEFT', 'Other', 'Nerve Block', 'Custom block', ' of 2', 'Treatment & Surgery Report',
    ]) expect(fr, s).not.toContain(s);
    // Saved free text prints as stored.
    expect(fr).toContain('TR on 307 and 407; RTR 208.');
    expect(fr).toContain('Biscuit');
  });

  it('every language draws without unencodable characters', async () => {
    for (const lng of APP_LANGUAGES) await expect(texts(lng, 'iris')).resolves.not.toHaveLength(0);
  });
});

describe('PDF round trip', () => {
  it('a PDF made in German loads back into the app', async () => {
    const [p, teeth, species, logo, pre, post, styleId, layout] = SCENARIOS.vcaGrid;
    const { bytes } = await buildCapturing(p, teeth, species, logo, pre, post, styleId, { ...layout, lng: 'de' } as PdfLayoutOptions);
    const file = new File([bytes as BlobPart], 'chart.pdf', { type: 'application/pdf' });
    if (typeof file.arrayBuffer !== 'function') {
      Object.defineProperty(file, 'arrayBuffer', {
        value: () => Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
      });
    }
    const parsed = await parseDentalChartPDF(file);
    expect(parsed.patientInfo).toEqual({ ...p, nerveBlocks: normalizeNerveBlocks(p.nerveBlocks) });
    expect(parsed.toothData).toEqual(teeth);
    expect(parsed.species).toBe(species);
    expect(parsed.logo).toBe(logo);
    expect(parsed.preDiagram).toEqual(pre.state);
  });
});

describe('PDF catalog strings', () => {
  // Strings allowed to carry characters the standard fonts can't encode
  // (safeFont swaps or drops them). Keep empty unless there's a reason.
  const ALLOWED_UNSAFE = new Set<string>([]);

  it('are all WinAnsi-encodable (standard PDF fonts)', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const strings = (v: unknown): string[] =>
      typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : [];
    const bad: string[] = [];
    for (const lng of APP_LANGUAGES) {
      const catalog = (await import(`../../locales/${lng}/pdf.json`)).default;
      for (const s of strings(catalog)) {
        if (pdfSafe(s, font) !== s && !ALLOWED_UNSAFE.has(s)) bad.push(`${lng}: ${s}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
