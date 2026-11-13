import type { AppLanguage } from '../i18n/config';
import glossary from '../locales/glossary.json';

/**
 * Deepgram Nova-3 "keyterm prompting" list for AI voice autofill.
 *
 * Nova-3 accepts up to 100 keyterms per request; each biases the model
 * toward domain vocabulary that's rare in everyday speech and therefore
 * easily mis-heard. The nova-3-medical model already covers human
 * clinical terms — this list closes the *veterinary-dental* gap: Triadan
 * numbering language, AVDC diagnoses/procedures, anatomy, and the drugs
 * used for dental nerve blocks and anesthesia.
 *
 * Curated to the ~90 most commonly dictated terms (kept < 100). Prefer
 * spoken forms over AVDC abbreviations — a clinician says "complicated
 * crown fracture", not "T/FX/CC".
 */
export const VOICE_KEYTERMS: string[] = [
  // Numbering & orientation
  'Triadan',
  'maxillary',
  'mandibular',
  'rostral',
  'caudal',
  'buccal',
  'palatal',
  'lingual',
  'mesial',
  'distal',
  'cementoenamel junction',
  // Tooth types
  'incisor',
  'canine tooth',
  'premolar',
  'molar',
  'carnassial',
  // Periodontal
  'periodontal',
  'gingival',
  'gingivitis',
  'gingival recession',
  'gingival hyperplasia',
  'gingival enlargement',
  'enlargement',
  'furcation',
  'furcation exposure',
  'periodontal pocket',
  'attachment loss',
  'mobility',
  'calculus',
  'stomatitis',
  'halitosis',
  // Occlusion
  'malocclusion',
  'distoclusion',
  'mesioclusion',
  'crossbite',
  'buccoversion',
  'distoversion',
  'labioversion',
  'linguoversion',
  'mesioversion',
  'palatoversion',
  // Tooth pathology
  'complicated crown fracture',
  'uncomplicated crown fracture',
  'root fracture',
  'enamel hypoplasia',
  'enamel hypomineralization',
  'tooth resorption',
  'external resorption',
  'caries',
  'abrasion',
  'attrition',
  'pulp exposure',
  'pulpitis',
  'periapical',
  'non-vital',
  'discolored tooth',
  'persistent deciduous',
  'supernumerary',
  'missing tooth',
  'oronasal fistula',
  'epulis',
  'oral mass',
  // Procedures
  'extraction',
  'surgical extraction',
  'scaling',
  'root planing',
  'subgingival',
  'supragingival',
  'gingivectomy',
  'gingivoplasty',
  'odontoplasty',
  'alveoloplasty',
  'apicoectomy',
  'pulpotomy',
  'root canal',
  'vital pulp therapy',
  'bonded sealant',
  'mucogingival flap',
  'intraoral radiograph',
  'biopsy',
  // Nerve blocks
  'infraorbital block',
  'mental nerve block',
  'inferior alveolar nerve block',
  'caudal maxillary nerve block',
  'bupivacaine',
  'lidocaine',
  'mepivacaine',
  // Anesthesia & analgesia
  'dexmedetomidine',
  'methadone',
  'hydromorphone',
  'buprenorphine',
  'butorphanol',
  'alfaxalone',
  'midazolam',
  'maropitant',
  'meloxicam',
  'carprofen',
  'gabapentin',
  'isoflurane',
  'sevoflurane',
];

/** Deepgram limits: 100 terms and 500 tokens per request (over → error). */
const MAX_TERMS = 100;
const MAX_TOKENS = 500;

/** Rough token estimate, deliberately pessimistic for non-English words. */
const termTokens = (t: string): number => Math.ceil(t.length / 3) + 1;

// Vets say these in English whatever the working language: Triadan numbering
// and drug names (indices into VOICE_KEYTERMS by value, not position).
const ENGLISH_CORE: string[] = [
  'Triadan',
  'bupivacaine', 'lidocaine', 'mepivacaine', 'dexmedetomidine', 'methadone',
  'hydromorphone', 'buprenorphine', 'butorphanol', 'alfaxalone', 'midazolam',
  'maropitant', 'meloxicam', 'carprofen', 'gabapentin', 'isoflurane', 'sevoflurane',
];

// VOICE_KEYTERMS entries whose glossary `en` value differs from the keyterm,
// mapped to the glossary id. Some ids equal the keyterm ("mobility") but are
// still needed: the lookup without an alias goes by `en` value, and that is
// "tooth mobility" / "furcation involvement", not the keyterm.
const GLOSSARY_ALIAS: Record<string, string> = {
  'carnassial': 'carnassial_tooth',
  'mobility': 'mobility',
  'furcation': 'furcation',
  'furcation exposure': 'furcation',
  'enlargement': 'hyperplasia',
  'root canal': 'root_canal_therapy',
  'non-vital': 'non_vital_tooth',
  'persistent deciduous': 'persistent_deciduous_tooth',
  'supernumerary': 'supernumerary_tooth',
};

// Most-dictated glossary terms that have no VOICE_KEYTERMS entry; placed
// right after the English core.
const EXTRA_GLOSSARY_IDS = ['periodontitis'];

type GlossaryTerm = { id: string; en: string } & Partial<Record<AppLanguage, string>>;
const TERMS = (glossary as { terms: GlossaryTerm[] }).terms;
const BY_ID = new Map(TERMS.map((t) => [t.id, t]));
const BY_EN = new Map(TERMS.map((t) => [t.en.toLowerCase(), t]));

/**
 * Keyterms for Deepgram in `lng`. English: VOICE_KEYTERMS unchanged. Other
 * languages: the English codes/drug names vets say in English, then the
 * glossary's native clinical values in VOICE_KEYTERMS order, de-duplicated
 * and capped to Deepgram's term and token limits.
 */
export function voiceKeyterms(lng: AppLanguage): string[] {
  if (lng === 'en') return VOICE_KEYTERMS;
  const candidates: string[] = [...ENGLISH_CORE];
  for (const id of EXTRA_GLOSSARY_IDS) {
    const v = BY_ID.get(id)?.[lng];
    if (v) candidates.push(v);
  }
  for (const kt of VOICE_KEYTERMS) {
    const entry = BY_ID.get(GLOSSARY_ALIAS[kt] ?? '') ?? BY_EN.get(kt.toLowerCase());
    const v = entry?.[lng];
    if (v) candidates.push(v);
  }
  return capKeyterms(candidates);
}

/** De-duplicate (case-insensitively) and fit Deepgram's limits, in order.
 *  A term that would overflow the token budget is skipped, so shorter
 *  terms after it still get in. */
export function capKeyterms(candidates: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let tokens = 0;
  for (const term of candidates) {
    if (out.length >= MAX_TERMS) break;
    const key = term.toLowerCase();
    if (seen.has(key) || tokens + termTokens(term) > MAX_TOKENS) continue;
    seen.add(key);
    out.push(term);
    tokens += termTokens(term);
  }
  return out;
}
