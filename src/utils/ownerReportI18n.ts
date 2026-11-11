import type { DentalField, ExamFindings } from '../types';
import type { BuiltInSectionId } from './ownerReportConfig';

/**
 * Owner report translations. Every sentence the report generates (the
 * headings, finding phrases, lay tooth names, intro, home-care defaults,
 * legends, labels, and long-form dates) comes from these tables, so a
 * practice can keep e.g. an English and a Spanish template side by side.
 *
 * Free text the team typed (chart comments, exam comments, custom
 * sections, per-chart edits) prints as written — it is never machine
 * translated. Only Latin-script languages are offered: the PDF uses the
 * standard Helvetica font (WinAnsi), which covers Western European
 * accents but not other scripts.
 *
 * English strings must stay byte-identical to the original report; the
 * other languages are careful translations that should still get a
 * native-speaker review before marketing them.
 */

export const REPORT_LOCALES = ['en', 'es', 'fr', 'de', 'pt'] as const;
export type ReportLocale = (typeof REPORT_LOCALES)[number];

export const LOCALE_LABELS: Record<ReportLocale, string> = {
  en: 'English',
  es: 'Español (Spanish)',
  fr: 'Français (French)',
  de: 'Deutsch (German)',
  pt: 'Português (Portuguese)',
};

export function isReportLocale(v: unknown): v is ReportLocale {
  return typeof v === 'string' && (REPORT_LOCALES as readonly string[]).includes(v);
}

export interface ReportStrings {
  /** BCP-47 tag for Intl date formatting. */
  intlLocale: string;
  defaultTitle: string;
  /** Placeholder fallbacks. */
  yourPet: string;
  ourPractice: string;
  yourTeam: string;
  /** Default section headings; `pet` is '' when the chart has no name. */
  headings: Record<BuiltInSectionId, (pet: string) => string>;
  intro: (pet: string) => string;
  homecareTips: string[];
  fieldPhrases: Record<DentalField, (value: string) => string>;
  fieldPlain: Record<DentalField, string>;
  /** Lay tooth name without the Triadan number, capitalized. */
  toothName: (quadrant: number, position: number, deciduous: boolean) => string;
  species: Record<string, string>;
  examAreas: Record<keyof ExamFindings, string>;
  patientLabel: string;
  ownerLabel: string;
  extractionsLead: string;
  removedToday: string;
  alreadyMissingLine: (list: string) => string;
  abnormalityNoted: string;
  noProblems: string;
  legendNumbers: string;
  legendFilled: string;
  legendRemoved: string;
  before: string;
  after: string;
  preparedBy: (doctor: string, practice: string) => string;
}

const cap = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;

/** Tooth type for a Triadan position (1-3 incisors, 4 canine, 5-8
 *  premolars, 9-11 molars) and its 0-based ordinal within the type. */
function toothType(position: number): { kind: 'incisor' | 'canine' | 'premolar' | 'molar'; ordinal: number } {
  if (position <= 3) return { kind: 'incisor', ordinal: position - 1 };
  if (position === 4) return { kind: 'canine', ordinal: 0 };
  if (position <= 8) return { kind: 'premolar', ordinal: position - 5 };
  return { kind: 'molar', ordinal: position - 9 };
}

const EN: ReportStrings = {
  intlLocale: 'en-US',
  defaultTitle: 'Dental Visit Report',
  yourPet: 'your pet',
  ourPractice: 'our practice',
  yourTeam: 'your veterinary team',
  headings: {
    diagram: (pet) => `${pet ? `${pet}’s` : 'Your pet’s'} mouth`,
    extractions: () => 'Teeth removed during this visit',
    findings: () => 'What we found',
    alreadyMissing: () => 'Already missing before this visit',
    examNotes: () => 'Other exam notes',
    photos: () => 'Before & after',
    teamNote: () => 'A note from your veterinary team',
    homecare: (pet) => `Caring for ${pet || 'your pet'}’s teeth at home`,
    recheck: () => 'Recommended recheck',
  },
  intro: (pet) =>
    `${pet || 'Your pet'} had a professional dental assessment and cleaning ` +
    'under anesthesia. This report explains what we found in everyday language — the full ' +
    'clinical chart with measurements is on file and available any time.',
  homecareTips: [
    'Daily tooth brushing with a pet-safe toothpaste is the single most effective thing you can do.',
    'Dental diets, chews, and water additives with the VOHC seal help between brushings.',
    'Watch for bad breath, drooling, dropping food, or pawing at the mouth — call us if you notice any.',
  ],
  fieldPhrases: {
    mobility: (v) => `loose tooth (mobility ${v})`,
    recession: (v) => `receding gums (${v})`,
    pocket: (v) => `deepened gum pocket (${v} mm)`,
    furcation: (v) => `bone loss between the roots (grade ${v})`,
    hyperplasia: (v) => `overgrown gum tissue (${v})`,
    calculus: (v) => `tartar buildup (grade ${v})`,
    gingivitis: (v) => `gum inflammation (grade ${v})`,
    pdstate: (v) => `periodontal disease, stage ${v}`,
  },
  fieldPlain: {
    mobility: 'loose tooth',
    recession: 'receding gums',
    pocket: 'deepened gum pocket',
    furcation: 'bone loss between the roots',
    hyperplasia: 'overgrown gum tissue',
    calculus: 'tartar buildup',
    gingivitis: 'gum inflammation',
    pdstate: 'periodontal disease',
  },
  toothName: (quadrant, position, deciduous) => {
    const sides: Record<number, string> = { 1: 'upper right', 2: 'upper left', 3: 'lower left', 4: 'lower right' };
    const ord = ['first', 'second', 'third', 'fourth'];
    const { kind, ordinal } = toothType(position);
    const tooth = kind === 'canine' ? 'canine tooth' : `${ord[ordinal]} ${kind}`;
    return cap(`${deciduous ? 'baby ' : ''}${sides[quadrant] ?? ''} ${tooth}`.trim());
  },
  species: { feline: 'Cat', canine: 'Dog', 'feline-deciduous': 'Kitten', 'canine-deciduous': 'Puppy' },
  examAreas: {
    extraoral: 'Extraoral / facial',
    lymph: 'Lymph nodes',
    buccal: 'Buccal mucosa',
    tongue: 'Tongue',
    palate: 'Palate',
    pharynx: 'Pharynx / Tonsils',
  },
  patientLabel: 'Patient',
  ownerLabel: 'Owner',
  extractionsLead: 'These teeth could not be saved and were removed so they no longer cause pain or infection:',
  removedToday: 'removed today',
  alreadyMissingLine: (list) => `Already missing before this visit: ${list}.`,
  abnormalityNoted: 'abnormality noted',
  noProblems: 'No dental problems were recorded on the chart for this visit — great news!',
  legendNumbers: 'Numbers match the findings below',
  legendFilled: 'filled = missing before this visit',
  legendRemoved: 'red ✕ = removed today',
  before: 'Before',
  after: 'After',
  preparedBy: (doctor, practice) => `Prepared by ${doctor || 'your veterinary team'}${practice ? `, ${practice}` : ''}.`,
};

const ES: ReportStrings = {
  intlLocale: 'es',
  defaultTitle: 'Informe de la visita dental',
  yourPet: 'su mascota',
  ourPractice: 'nuestra clínica',
  yourTeam: 'su equipo veterinario',
  headings: {
    diagram: (pet) => `La boca de ${pet || 'su mascota'}`,
    extractions: () => 'Dientes extraídos durante esta visita',
    findings: () => 'Lo que encontramos',
    alreadyMissing: () => 'Ausentes antes de esta visita',
    examNotes: () => 'Otras observaciones del examen',
    photos: () => 'Antes y después',
    teamNote: () => 'Una nota de su equipo veterinario',
    homecare: (pet) => `Cuidado dental de ${pet || 'su mascota'} en casa`,
    recheck: () => 'Próxima revisión recomendada',
  },
  intro: (pet) =>
    `${pet || 'Su mascota'} recibió una evaluación y limpieza dental profesional bajo anestesia. ` +
    'Este informe explica lo que encontramos en un lenguaje sencillo; la ficha clínica completa ' +
    'con las mediciones está archivada y disponible en cualquier momento.',
  homecareTips: [
    'Cepillarle los dientes a diario con una pasta dental apta para mascotas es lo más eficaz que puede hacer.',
    'Las dietas dentales, los premios masticables y los aditivos para el agua con el sello VOHC ayudan entre cepillados.',
    'Esté atento al mal aliento, la salivación excesiva, la comida que se le cae o si se toca la boca con la pata; llámenos si nota algo.',
  ],
  fieldPhrases: {
    mobility: (v) => `diente flojo (movilidad ${v})`,
    recession: (v) => `retracción de las encías (${v})`,
    pocket: (v) => `bolsa periodontal profunda (${v} mm)`,
    furcation: (v) => `pérdida de hueso entre las raíces (grado ${v})`,
    hyperplasia: (v) => `crecimiento excesivo de las encías (${v})`,
    calculus: (v) => `acumulación de sarro (grado ${v})`,
    gingivitis: (v) => `inflamación de las encías (grado ${v})`,
    pdstate: (v) => `enfermedad periodontal, estadio ${v}`,
  },
  fieldPlain: {
    mobility: 'diente flojo',
    recession: 'retracción de las encías',
    pocket: 'bolsa periodontal profunda',
    furcation: 'pérdida de hueso entre las raíces',
    hyperplasia: 'crecimiento excesivo de las encías',
    calculus: 'acumulación de sarro',
    gingivitis: 'inflamación de las encías',
    pdstate: 'enfermedad periodontal',
  },
  toothName: (quadrant, position, deciduous) => {
    const sides: Record<number, string> = { 1: 'superior derecho', 2: 'superior izquierdo', 3: 'inferior izquierdo', 4: 'inferior derecho' };
    const ord = ['primer', 'segundo', 'tercer', 'cuarto'];
    const kinds = { incisor: 'incisivo', canine: 'canino', premolar: 'premolar', molar: 'molar' };
    const { kind, ordinal } = toothType(position);
    const tooth = kind === 'canine' ? kinds.canine : `${ord[ordinal]} ${kinds[kind]}`;
    return cap(`${tooth} ${sides[quadrant] ?? ''}${deciduous ? ' de leche' : ''}`.trim());
  },
  species: { feline: 'Gato', canine: 'Perro', 'feline-deciduous': 'Gatito', 'canine-deciduous': 'Cachorro' },
  examAreas: {
    extraoral: 'Extraoral / facial',
    lymph: 'Ganglios linfáticos',
    buccal: 'Mucosa bucal',
    tongue: 'Lengua',
    palate: 'Paladar',
    pharynx: 'Faringe / amígdalas',
  },
  patientLabel: 'Paciente',
  ownerLabel: 'Propietario',
  extractionsLead: 'Estos dientes no se podían salvar y se extrajeron para que dejen de causar dolor o infección:',
  removedToday: 'extraído hoy',
  alreadyMissingLine: (list) => `Ausentes antes de esta visita: ${list}.`,
  abnormalityNoted: 'se observó una anomalía',
  noProblems: 'No se registraron problemas dentales en la ficha de esta visita: ¡excelentes noticias!',
  legendNumbers: 'Los números corresponden a los hallazgos de abajo',
  legendFilled: 'relleno = ausente antes de esta visita',
  legendRemoved: '✕ rojo = extraído hoy',
  before: 'Antes',
  after: 'Después',
  preparedBy: (doctor, practice) => `Preparado por ${doctor || 'su equipo veterinario'}${practice ? `, ${practice}` : ''}.`,
};

const FR: ReportStrings = {
  intlLocale: 'fr',
  defaultTitle: 'Compte rendu de la visite dentaire',
  yourPet: 'votre animal',
  ourPractice: 'notre clinique',
  yourTeam: 'votre équipe vétérinaire',
  headings: {
    diagram: (pet) => `La bouche de ${pet || 'votre animal'}`,
    extractions: () => 'Dents extraites lors de cette visite',
    findings: () => 'Ce que nous avons constaté',
    alreadyMissing: () => 'Déjà absentes avant cette visite',
    examNotes: () => 'Autres remarques de l’examen',
    photos: () => 'Avant et après',
    teamNote: () => 'Un mot de votre équipe vétérinaire',
    homecare: (pet) => `Prendre soin des dents de ${pet || 'votre animal'} à la maison`,
    recheck: () => 'Prochain contrôle recommandé',
  },
  intro: (pet) =>
    `${pet || 'Votre animal'} a bénéficié d’un bilan et d’un détartrage dentaires professionnels sous anesthésie. ` +
    'Ce compte rendu explique nos constatations avec des mots simples ; le dossier clinique complet, ' +
    'avec les mesures, est conservé et disponible à tout moment.',
  homecareTips: [
    'Le brossage quotidien des dents avec un dentifrice adapté aux animaux est la mesure la plus efficace.',
    'Les aliments dentaires, friandises à mâcher et additifs pour l’eau portant le label VOHC aident entre deux brossages.',
    'Surveillez la mauvaise haleine, l’hypersalivation, la nourriture qui tombe ou le grattage de la bouche — appelez-nous si vous remarquez quelque chose.',
  ],
  fieldPhrases: {
    mobility: (v) => `dent mobile (mobilité ${v})`,
    recession: (v) => `rétraction des gencives (${v})`,
    pocket: (v) => `poche gingivale approfondie (${v} mm)`,
    furcation: (v) => `perte osseuse entre les racines (grade ${v})`,
    hyperplasia: (v) => `prolifération des gencives (${v})`,
    calculus: (v) => `accumulation de tartre (grade ${v})`,
    gingivitis: (v) => `inflammation des gencives (grade ${v})`,
    pdstate: (v) => `maladie parodontale, stade ${v}`,
  },
  fieldPlain: {
    mobility: 'dent mobile',
    recession: 'rétraction des gencives',
    pocket: 'poche gingivale approfondie',
    furcation: 'perte osseuse entre les racines',
    hyperplasia: 'prolifération des gencives',
    calculus: 'accumulation de tartre',
    gingivitis: 'inflammation des gencives',
    pdstate: 'maladie parodontale',
  },
  toothName: (quadrant, position, deciduous) => {
    // Every tooth noun is feminine in French (incisive, canine,
    // prémolaire, molaire), so the adjectives agree accordingly.
    const sides: Record<number, string> = { 1: 'supérieure droite', 2: 'supérieure gauche', 3: 'inférieure gauche', 4: 'inférieure droite' };
    const ord = ['première', 'deuxième', 'troisième', 'quatrième'];
    const kinds = { incisor: 'incisive', canine: 'canine', premolar: 'prémolaire', molar: 'molaire' };
    const { kind, ordinal } = toothType(position);
    const tooth = kind === 'canine' ? kinds.canine : `${ord[ordinal]} ${kinds[kind]}`;
    return cap(`${tooth} ${sides[quadrant] ?? ''}${deciduous ? ' de lait' : ''}`.trim());
  },
  species: { feline: 'Chat', canine: 'Chien', 'feline-deciduous': 'Chaton', 'canine-deciduous': 'Chiot' },
  examAreas: {
    extraoral: 'Extra-oral / face',
    lymph: 'Nœuds lymphatiques',
    buccal: 'Muqueuse buccale',
    tongue: 'Langue',
    palate: 'Palais',
    pharynx: 'Pharynx / amygdales',
  },
  patientLabel: 'Patient',
  ownerLabel: 'Propriétaire',
  extractionsLead: 'Ces dents ne pouvaient pas être sauvées et ont été extraites pour ne plus causer de douleur ni d’infection :',
  removedToday: 'extraite aujourd’hui',
  alreadyMissingLine: (list) => `Déjà absentes avant cette visite : ${list}.`,
  abnormalityNoted: 'anomalie constatée',
  noProblems: 'Aucun problème dentaire n’a été noté au dossier lors de cette visite — excellente nouvelle !',
  legendNumbers: 'Les numéros renvoient aux constatations ci-dessous',
  legendFilled: 'plein = absente avant cette visite',
  legendRemoved: '✕ rouge = extraite aujourd’hui',
  before: 'Avant',
  after: 'Après',
  preparedBy: (doctor, practice) => `Préparé par ${doctor || 'votre équipe vétérinaire'}${practice ? `, ${practice}` : ''}.`,
};

const DE: ReportStrings = {
  intlLocale: 'de',
  defaultTitle: 'Bericht zum Zahnarztbesuch',
  yourPet: 'Ihr Tier',
  ourPractice: 'unsere Praxis',
  yourTeam: 'Ihr Tierarztteam',
  headings: {
    diagram: (pet) => (pet ? `Das Gebiss von ${pet}` : 'Das Gebiss Ihres Tieres'),
    extractions: () => 'Bei diesem Besuch entfernte Zähne',
    findings: () => 'Unsere Befunde',
    alreadyMissing: () => 'Bereits vor diesem Besuch fehlend',
    examNotes: () => 'Weitere Untersuchungsbefunde',
    photos: () => 'Vorher und nachher',
    teamNote: () => 'Eine Nachricht von Ihrem Tierarztteam',
    homecare: (pet) => (pet ? `Zahnpflege für ${pet} zu Hause` : 'Zahnpflege für Ihr Tier zu Hause'),
    recheck: () => 'Empfohlene Kontrolle',
  },
  intro: (pet) =>
    `${pet || 'Ihr Tier'} hatte eine professionelle Zahnuntersuchung und Zahnreinigung unter Narkose. ` +
    'Dieser Bericht erklärt unsere Befunde in einfachen Worten – die vollständige klinische Akte ' +
    'mit allen Messwerten liegt bei uns vor und ist jederzeit einsehbar.',
  homecareTips: [
    'Tägliches Zähneputzen mit einer tiergerechten Zahnpasta ist das Wirksamste, was Sie tun können.',
    'Zahnpflegefutter, Kauartikel und Wasserzusätze mit VOHC-Siegel helfen zwischen dem Putzen.',
    'Achten Sie auf Mundgeruch, Sabbern, herausfallendes Futter oder Pfoteln am Maul – rufen Sie uns an, wenn Ihnen etwas auffällt.',
  ],
  fieldPhrases: {
    mobility: (v) => `lockerer Zahn (Beweglichkeit ${v})`,
    recession: (v) => `Zahnfleischrückgang (${v})`,
    pocket: (v) => `vertiefte Zahnfleischtasche (${v} mm)`,
    furcation: (v) => `Knochenabbau zwischen den Wurzeln (Grad ${v})`,
    hyperplasia: (v) => `Zahnfleischwucherung (${v})`,
    calculus: (v) => `Zahnsteinbildung (Grad ${v})`,
    gingivitis: (v) => `Zahnfleischentzündung (Grad ${v})`,
    pdstate: (v) => `Parodontalerkrankung, Stadium ${v}`,
  },
  fieldPlain: {
    mobility: 'lockerer Zahn',
    recession: 'Zahnfleischrückgang',
    pocket: 'vertiefte Zahnfleischtasche',
    furcation: 'Knochenabbau zwischen den Wurzeln',
    hyperplasia: 'Zahnfleischwucherung',
    calculus: 'Zahnsteinbildung',
    gingivitis: 'Zahnfleischentzündung',
    pdstate: 'Parodontalerkrankung',
  },
  toothName: (quadrant, position, deciduous) => {
    // Strong (article-less) masculine declension: "Erster oberer rechter …".
    const sides: Record<number, string> = { 1: 'oberer rechter', 2: 'oberer linker', 3: 'unterer linker', 4: 'unterer rechter' };
    const ord = ['erster', 'zweiter', 'dritter', 'vierter'];
    const kinds = { incisor: 'Schneidezahn', canine: 'Eckzahn', premolar: 'Prämolar', molar: 'Molar' };
    const { kind, ordinal } = toothType(position);
    const name = kind === 'canine'
      ? `${sides[quadrant] ?? ''} ${kinds.canine}`
      : `${ord[ordinal]} ${sides[quadrant] ?? ''} ${kinds[kind]}`;
    return cap(`${name.replace(/\s+/g, ' ').trim()}${deciduous ? ' (Milchzahn)' : ''}`);
  },
  species: { feline: 'Katze', canine: 'Hund', 'feline-deciduous': 'Kätzchen', 'canine-deciduous': 'Welpe' },
  examAreas: {
    extraoral: 'Extraoral / Gesicht',
    lymph: 'Lymphknoten',
    buccal: 'Mundschleimhaut',
    tongue: 'Zunge',
    palate: 'Gaumen',
    pharynx: 'Rachen / Mandeln',
  },
  patientLabel: 'Patient',
  ownerLabel: 'Besitzer',
  extractionsLead: 'Diese Zähne waren nicht zu retten und wurden entfernt, damit sie keine Schmerzen oder Infektionen mehr verursachen:',
  removedToday: 'heute entfernt',
  alreadyMissingLine: (list) => `Bereits vor diesem Besuch fehlend: ${list}.`,
  abnormalityNoted: 'Auffälligkeit festgestellt',
  noProblems: 'Bei diesem Besuch wurden keine Zahnprobleme festgestellt – eine tolle Nachricht!',
  legendNumbers: 'Die Nummern entsprechen den Befunden unten',
  legendFilled: 'ausgefüllt = schon vorher fehlend',
  legendRemoved: 'rotes ✕ = heute entfernt',
  before: 'Vorher',
  after: 'Nachher',
  preparedBy: (doctor, practice) => `Erstellt von ${doctor || 'Ihrem Tierarztteam'}${practice ? `, ${practice}` : ''}.`,
};

const PT: ReportStrings = {
  intlLocale: 'pt',
  defaultTitle: 'Relatório da consulta odontológica',
  yourPet: 'seu animal',
  ourPractice: 'nossa clínica',
  yourTeam: 'sua equipe veterinária',
  headings: {
    diagram: (pet) => (pet ? `A boca de ${pet}` : 'A boca do seu animal'),
    extractions: () => 'Dentes extraídos nesta consulta',
    findings: () => 'O que encontramos',
    alreadyMissing: () => 'Ausentes antes desta consulta',
    examNotes: () => 'Outras observações do exame',
    photos: () => 'Antes e depois',
    teamNote: () => 'Uma mensagem da sua equipe veterinária',
    homecare: (pet) => (pet ? `Cuidando dos dentes de ${pet} em casa` : 'Cuidando dos dentes do seu animal em casa'),
    recheck: () => 'Retorno recomendado',
  },
  intro: (pet) =>
    `${pet || 'Seu animal'} passou por uma avaliação e limpeza dentária profissional sob anestesia. ` +
    'Este relatório explica o que encontramos em linguagem simples — o prontuário clínico completo, ' +
    'com as medições, está arquivado e disponível a qualquer momento.',
  homecareTips: [
    'Escovar os dentes diariamente com um creme dental próprio para animais é a medida mais eficaz que você pode tomar.',
    'Rações dentais, petiscos mastigáveis e aditivos para a água com o selo VOHC ajudam entre as escovações.',
    'Fique atento ao mau hálito, à salivação excessiva, à comida caindo da boca ou se ele coçar a boca com a pata — ligue para nós se notar algo.',
  ],
  fieldPhrases: {
    mobility: (v) => `dente mole (mobilidade ${v})`,
    recession: (v) => `retração gengival (${v})`,
    pocket: (v) => `bolsa gengival aprofundada (${v} mm)`,
    furcation: (v) => `perda óssea entre as raízes (grau ${v})`,
    hyperplasia: (v) => `crescimento excessivo da gengiva (${v})`,
    calculus: (v) => `acúmulo de tártaro (grau ${v})`,
    gingivitis: (v) => `inflamação da gengiva (grau ${v})`,
    pdstate: (v) => `doença periodontal, estágio ${v}`,
  },
  fieldPlain: {
    mobility: 'dente mole',
    recession: 'retração gengival',
    pocket: 'bolsa gengival aprofundada',
    furcation: 'perda óssea entre as raízes',
    hyperplasia: 'crescimento excessivo da gengiva',
    calculus: 'acúmulo de tártaro',
    gingivitis: 'inflamação da gengiva',
    pdstate: 'doença periodontal',
  },
  toothName: (quadrant, position, deciduous) => {
    const sides: Record<number, string> = { 1: 'superior direito', 2: 'superior esquerdo', 3: 'inferior esquerdo', 4: 'inferior direito' };
    const ord = ['primeiro', 'segundo', 'terceiro', 'quarto'];
    const kinds = { incisor: 'incisivo', canine: 'canino', premolar: 'pré-molar', molar: 'molar' };
    const { kind, ordinal } = toothType(position);
    const tooth = kind === 'canine' ? kinds.canine : `${ord[ordinal]} ${kinds[kind]}`;
    return cap(`${tooth} ${sides[quadrant] ?? ''}${deciduous ? ' de leite' : ''}`.trim());
  },
  species: { feline: 'Gato', canine: 'Cão', 'feline-deciduous': 'Filhote de gato', 'canine-deciduous': 'Filhote de cão' },
  examAreas: {
    extraoral: 'Extraoral / face',
    lymph: 'Linfonodos',
    buccal: 'Mucosa oral',
    tongue: 'Língua',
    palate: 'Palato',
    pharynx: 'Faringe / tonsilas',
  },
  patientLabel: 'Paciente',
  ownerLabel: 'Tutor',
  extractionsLead: 'Estes dentes não podiam ser salvos e foram extraídos para que não causem mais dor ou infecção:',
  removedToday: 'extraído hoje',
  alreadyMissingLine: (list) => `Ausentes antes desta consulta: ${list}.`,
  abnormalityNoted: 'alteração observada',
  noProblems: 'Nenhum problema dentário foi registrado no prontuário nesta consulta — ótima notícia!',
  legendNumbers: 'Os números correspondem aos achados abaixo',
  legendFilled: 'preenchido = ausente antes desta consulta',
  legendRemoved: '✕ vermelho = extraído hoje',
  before: 'Antes',
  after: 'Depois',
  preparedBy: (doctor, practice) => `Preparado por ${doctor || 'sua equipe veterinária'}${practice ? `, ${practice}` : ''}.`,
};

const STRINGS: Record<ReportLocale, ReportStrings> = { en: EN, es: ES, fr: FR, de: DE, pt: PT };

export function reportStrings(locale: ReportLocale | undefined): ReportStrings {
  return STRINGS[locale ?? 'en'] ?? EN;
}

/** Format a yyyy-mm-dd chart date for the report. 'iso' keeps the value
 *  as charted (the original behaviour); 'long' spells it out in the
 *  report language ("19 de julio de 2026"). Unparseable input passes
 *  through untouched. */
export function formatReportDate(value: string, locale: ReportLocale, style: 'iso' | 'long'): string {
  if (!value || style === 'iso') return value;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return value;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(reportStrings(locale).intlLocale, { dateStyle: 'long' }).format(date);
  } catch {
    return value;
  }
}
