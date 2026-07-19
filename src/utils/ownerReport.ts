import { ChartSnapshot, DentalField, EXAM_ITEMS } from '../types';

/**
 * Owner report model — the chart's structured findings translated into
 * plain English for the pet's owner. Fully deterministic: every sentence
 * comes from the mapping tables below, so the report needs no AI, works
 * offline, and never invents a finding that isn't on the chart.
 */

export interface OwnerReportTooth {
  triadan: number;
  /** e.g. "Upper right canine (104)". */
  layName: string;
  /** Plain-English findings for this tooth, in chart order. */
  notes: string[];
  /** True when the tooth was extracted during this visit. */
  extracted: boolean;
}

export interface OwnerReportModel {
  patientName: string;
  ownerName: string;
  speciesLabel: string;
  visitDate: string;
  recallDate: string;
  /** Opening paragraph — generated, or the team's hand-edited version. */
  intro: string;
  /** Home-care tips, one per bullet — generated defaults or edited. */
  homecareTips: string[];
  /** Optional extra note from the team ('' = omit the section). */
  extraNotes: string;
  /** Lay names of teeth that were already missing before this visit. */
  alreadyMissing: string[];
  /** Lay names of teeth extracted during this visit. */
  extracted: string[];
  /** Per-tooth findings (teeth with nothing recorded are omitted —
   *  standard charting convention: blank means healthy). */
  teeth: OwnerReportTooth[];
  /** Abnormal oral-exam areas with their comments. */
  examNotes: { area: string; comment: string }[];
}

const ORDINALS = ['first', 'second', 'third', 'fourth'];

const QUADRANT_NAMES: Record<number, string> = {
  1: 'upper right',
  2: 'upper left',
  3: 'lower left',
  4: 'lower right',
};

/** "Upper right canine (104)", "lower left first molar (309)",
 *  "baby upper right canine (504)". */
export function toothLayName(triadan: number): string {
  let quadrant = Math.floor(triadan / 100);
  const position = triadan % 100;
  const deciduous = quadrant >= 5;
  if (deciduous) quadrant -= 4;
  const side = QUADRANT_NAMES[quadrant] ?? '';
  let tooth: string;
  if (position <= 3) tooth = `${ORDINALS[position - 1]} incisor`;
  else if (position === 4) tooth = 'canine tooth';
  else if (position <= 8) tooth = `${ORDINALS[position - 5]} premolar`;
  else tooth = `${ORDINALS[position - 9]} molar`;
  const name = `${deciduous ? 'baby ' : ''}${side} ${tooth}`.trim();
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} (${triadan})`;
}

/** Chart-field values translated for owners. The recorded value (a grade
 *  or measurement the vet entered) is kept visible so the report stays a
 *  faithful reflection of the clinical chart. */
const FIELD_PHRASES: Record<DentalField, (value: string) => string> = {
  mobility: (v) => `loose tooth (mobility ${v})`,
  recession: (v) => `receding gums (${v})`,
  pocket: (v) => `deepened gum pocket (${v} mm)`,
  furcation: (v) => `bone loss between the roots (grade ${v})`,
  hyperplasia: (v) => `overgrown gum tissue (${v})`,
  calculus: (v) => `tartar buildup (grade ${v})`,
  gingivitis: (v) => `gum inflammation (grade ${v})`,
  pdstate: (v) => `periodontal disease, stage ${v}`,
};

const FIELD_ORDER: DentalField[] = [
  'mobility', 'recession', 'pocket', 'furcation',
  'hyperplasia', 'calculus', 'gingivitis', 'pdstate',
];

const SPECIES_LABELS: Record<string, string> = {
  feline: 'Cat',
  canine: 'Dog',
  'feline-deciduous': 'Kitten',
  'canine-deciduous': 'Puppy',
};

/** The auto-generated opening paragraph (editable in the Owner Report
 *  section — this is the prefill). */
export function generatedIntro(patientName: string): string {
  return (
    `${patientName || 'Your pet'} had a professional dental assessment and cleaning ` +
    'under anesthesia. This report explains what we found in everyday language — the full ' +
    'clinical chart with measurements is on file and available any time.'
  );
}

/** Default home-care advice — the prefill for the editable tips block. */
export const DEFAULT_HOMECARE_TIPS = [
  'Daily tooth brushing with a pet-safe toothpaste is the single most effective thing you can do.',
  'Dental diets, chews, and water additives with the VOHC seal help between brushings.',
  'Watch for bad breath, drooling, dropping food, or pawing at the mouth — call us if you notice any.',
];

export function buildOwnerReportModel(snapshot: ChartSnapshot): OwnerReportModel {
  const alreadyMissing: string[] = [];
  for (const [key, mark] of Object.entries(snapshot.preMarks ?? {})) {
    if (mark === 'missing') alreadyMissing.push(toothLayName(Number(key)));
  }

  const extractedSet = new Set<number>();
  for (const [key, mark] of Object.entries(snapshot.postMarks ?? {})) {
    if (mark === 'extracted') extractedSet.add(Number(key));
  }

  // Comments anchored to a tooth join that tooth's notes; the vet wrote
  // them for the record, so they carry through verbatim.
  const commentsByTooth = new Map<number, string[]>();
  for (const comment of [...(snapshot.preComments ?? []), ...(snapshot.postComments ?? [])]) {
    if (comment.anchorTriadan == null || !comment.text.trim()) continue;
    const list = commentsByTooth.get(comment.anchorTriadan) ?? [];
    list.push(comment.text.trim());
    commentsByTooth.set(comment.anchorTriadan, list);
  }

  const teeth: OwnerReportTooth[] = [];
  for (const tooth of snapshot.toothData ?? []) {
    const notes: string[] = [];
    for (const field of FIELD_ORDER) {
      const raw = tooth[field];
      const value = typeof raw === 'string' ? raw.trim() : '';
      if (value) notes.push(FIELD_PHRASES[field](value));
    }
    for (const text of commentsByTooth.get(tooth.triadan) ?? []) notes.push(text);
    commentsByTooth.delete(tooth.triadan);
    const extracted = extractedSet.has(tooth.triadan);
    if (notes.length === 0 && !extracted) continue;
    teeth.push({
      triadan: tooth.triadan,
      layName: toothLayName(tooth.triadan),
      notes,
      extracted,
    });
  }
  // Comments anchored to teeth outside the grid (species mismatch edge
  // case) still deserve a row.
  for (const [triadan, texts] of commentsByTooth) {
    teeth.push({
      triadan,
      layName: toothLayName(triadan),
      notes: texts,
      extracted: extractedSet.has(triadan),
    });
  }
  teeth.sort((a, b) => a.triadan - b.triadan);

  const examNotes: { area: string; comment: string }[] = [];
  for (const { key, label } of EXAM_ITEMS) {
    const finding = snapshot.patientInfo.exam?.[key];
    if (finding?.status === 'abnormal' || (finding?.comment ?? '').trim()) {
      examNotes.push({ area: label, comment: (finding?.comment ?? '').trim() });
    }
  }

  // Hand-edited blocks win over the generated text; absent = generated.
  const overrides = snapshot.ownerReport ?? {};
  const homecareSource = overrides.homecare ?? DEFAULT_HOMECARE_TIPS.join('\n');

  return {
    patientName: snapshot.patientInfo.patientName,
    ownerName: snapshot.patientInfo.ownerName ?? '',
    speciesLabel: SPECIES_LABELS[snapshot.species] ?? snapshot.species,
    visitDate: snapshot.patientInfo.date,
    recallDate: snapshot.patientInfo.recallDate ?? '',
    intro: (overrides.intro ?? generatedIntro(snapshot.patientInfo.patientName)).trim(),
    homecareTips: homecareSource.split('\n').map((tip) => tip.trim()).filter(Boolean),
    extraNotes: (overrides.extraNotes ?? '').trim(),
    alreadyMissing,
    extracted: [...extractedSet].sort((a, b) => a - b).map(toothLayName),
    teeth,
    examNotes,
  };
}
