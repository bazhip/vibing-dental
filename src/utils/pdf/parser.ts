import { PDFDocument, PDFForm } from 'pdf-lib';
import {
  PatientInfo,
  ToothData,
  Species,
  Logo,
  NerveBlocks,
  EMPTY_NERVE_BLOCKS,
  ExamFindings,
  ExamFinding,
  EMPTY_EXAM_FINDINGS,
  EXAM_ITEMS,
  DentalField,
  ToothMarks,
  DiagramComment,
  DiagramStroke,
} from '../../types';
import { getInitialToothData } from '../../constants';

/**
 * Parser for previously-generated chart PDFs. Modern PDFs carry the full
 * chart state in a hidden JSON-stash form field; legacy PDFs (pre-static
 * refactor) had values in normal AcroForm fields. The parser falls back
 * cleanly between the two formats so older charts still rehydrate.
 */

export const DIAGRAM_STATE_FIELD = 'diagrams';

export interface DiagramState {
  marks: ToothMarks;
  comments: DiagramComment[];
  strokes: DiagramStroke[];
}

const EMPTY_DIAGRAM_STATE: DiagramState = { marks: {}, comments: [], strokes: [] };

export interface ParsedChart {
  patientInfo: PatientInfo;
  toothData: ToothData[];
  species: Species;
  logo: Logo;
  preDiagram?: DiagramState;
  postDiagram?: DiagramState;
}

export interface StashedState {
  pre?: DiagramState;
  post?: DiagramState;
  nerveBlocks?: NerveBlocks;
  exam?: ExamFindings;
  // Full state for non-interactive PDFs. When present, the parser
  // recovers everything from these fields directly.
  patientInfo?: PatientInfo;
  toothData?: ToothData[];
  species?: Species;
  logo?: Logo;
}

// ---------- Legacy form-field maps (only used as fallback) -----------------

/** Maps NerveBlocks keys → PDF form field names. The Other field had no
 *  PDF form-field equivalent in newer versions (it became free-text), so
 *  we handle it separately in the parser. */
const NERVE_BLOCK_FIELDS: Array<[Exclude<keyof NerveBlocks, 'other'>, string]> = [
  ['infraorbitalRight',     'nbior'],
  ['infraorbitalLeft',      'nbiol'],
  ['inferiorAlveolarRight', 'nbiar'],
  ['inferiorAlveolarLeft',  'nbial'],
  ['mentalRight',           'nbmenr'],
  ['mentalLeft',            'nbmenl'],
];

const DENTAL_FIELDS: DentalField[] = [
  'mobility', 'recession', 'pocket', 'furcation',
  'hyperplasia', 'calculus', 'gingivitis', 'pdstate',
];

/** LaTeX/hyperref strips underscores from PDF form field names, so the
 *  legacy template's `g_110_mob` ended up as `g110mob`. */
const FIELD_SUFFIX: Record<DentalField, string> = {
  mobility: 'mob', recession: 'rec', pocket: 'poc', furcation: 'fur',
  hyperplasia: 'hyp', calculus: 'cal', gingivitis: 'gin', pdstate: 'pds',
};

// ---------- Form helpers ---------------------------------------------------

function readTextField(form: PDFForm, name: string): string {
  try { return form.getTextField(name).getText() ?? ''; } catch { return ''; }
}

function hasTextField(form: PDFForm, name: string): boolean {
  try { form.getTextField(name); return true; } catch { return false; }
}

function readCheckBox(form: PDFForm, name: string): boolean {
  try { return form.getCheckBox(name).isChecked(); } catch { return false; }
}

function readStashedState(form: PDFForm): StashedState {
  try {
    const raw = form.getTextField(DIAGRAM_STATE_FIELD).getText();
    if (!raw) return {};
    return JSON.parse(raw) as StashedState;
  } catch {
    return {};
  }
}

function readExamFindings(form: PDFForm): ExamFindings {
  const result: ExamFindings = {
    extraoral: { ...EMPTY_EXAM_FINDINGS.extraoral },
    lymph:     { ...EMPTY_EXAM_FINDINGS.lymph },
    buccal:    { ...EMPTY_EXAM_FINDINGS.buccal },
    tongue:    { ...EMPTY_EXAM_FINDINGS.tongue },
    palate:    { ...EMPTY_EXAM_FINDINGS.palate },
    pharynx:   { ...EMPTY_EXAM_FINDINGS.pharynx },
  };
  for (const { key, pdfName } of EXAM_ITEMS) {
    const normal = readCheckBox(form, `ex${pdfName}N`);
    const abnormal = readCheckBox(form, `ex${pdfName}A`);
    let status: ExamFinding = '';
    if (normal && !abnormal) status = 'normal';
    else if (abnormal && !normal) status = 'abnormal';
    result[key] = {
      status,
      comment: readTextField(form, `ex${pdfName}C`),
    };
  }
  return result;
}

// ---------- Public parser --------------------------------------------------

export async function parseDentalChartPDF(file: File): Promise<ParsedChart> {
  const bytes = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes);
  const form = pdfDoc.getForm();
  const stash = readStashedState(form);

  // Modern format: full state lives in the JSON stash. Recover and exit.
  if (stash.patientInfo && stash.toothData && stash.species && stash.logo) {
    return {
      patientInfo: stash.patientInfo,
      toothData: stash.toothData,
      species: stash.species,
      logo: stash.logo,
      preDiagram: stash.pre ?? EMPTY_DIAGRAM_STATE,
      postDiagram: stash.post ?? EMPTY_DIAGRAM_STATE,
    };
  }

  // Legacy format: read AcroForm fields. The diagram-state stash + nerve
  // blocks + exam comments may still be present and override the
  // checkbox / form-field reads where they exist.
  const logo: Logo = hasTextField(form, 'doctor') ? 'vca' : 'socal';
  const species: Species =
    hasTextField(form, 'g110mob') || hasTextField(form, 'g311mob') ? 'canine' : 'feline';

  const patientName =
    logo === 'vca' ? readTextField(form, 'doctor') : readTextField(form, 'patient');
  const patientNumber =
    logo === 'vca' ? readTextField(form, 'tech') : readTextField(form, 'pid');

  const nerveBlocks: NerveBlocks = stash.nerveBlocks
    ? { ...EMPTY_NERVE_BLOCKS, ...stash.nerveBlocks }
    : (() => {
        const fallback: NerveBlocks = { ...EMPTY_NERVE_BLOCKS };
        for (const [key, fieldName] of NERVE_BLOCK_FIELDS) {
          fallback[key] = readTextField(form, fieldName);
        }
        // Combine legacy nbothr / nbothl into the new free-text `other`.
        const legacyOther = [readTextField(form, 'nbothr'), readTextField(form, 'nbothl')]
          .filter(Boolean)
          .join(' / ');
        fallback.other = legacyOther;
        return fallback;
      })();

  const examFromCheckboxes = readExamFindings(form);
  const exam: ExamFindings = (() => {
    if (!stash.exam) return examFromCheckboxes;
    const merged = { ...examFromCheckboxes };
    for (const { key } of EXAM_ITEMS) {
      const stashed = stash.exam[key];
      if (stashed) {
        merged[key] = {
          status: stashed.status || examFromCheckboxes[key].status,
          comment: stashed.comment ?? examFromCheckboxes[key].comment,
        };
      }
    }
    return merged;
  })();

  const legacyDoctor = readTextField(form, 'doctor');
  const legacyTech   = readTextField(form, 'tech');
  const patientInfo: PatientInfo = {
    date:            readTextField(form, 'date'),
    patientName,
    patientNumber,
    doctor:          logo === 'vca' ? legacyDoctor : 'Dr. Margaret Smith, DVM, DAVDC',
    tech:            logo === 'vca' ? legacyTech   : '',
    complaint:       readTextField(form, 'chief'),
    treatmentReport: readTextField(form, 'treatmentreport'),
    nerveBlocks,
    exam,
  };

  const toothData = getInitialToothData(species).map((tooth) => {
    const updates: Partial<ToothData> = {};
    for (const field of DENTAL_FIELDS) {
      const value = readTextField(form, `g${tooth.triadan}${FIELD_SUFFIX[field]}`);
      if (value) updates[field] = value;
    }
    return { ...tooth, ...updates };
  });

  return {
    patientInfo,
    toothData,
    species,
    logo,
    preDiagram: stash.pre ?? EMPTY_DIAGRAM_STATE,
    postDiagram: stash.post ?? EMPTY_DIAGRAM_STATE,
  };
}
