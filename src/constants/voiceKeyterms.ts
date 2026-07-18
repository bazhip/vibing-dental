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
  'maxillary nerve block',
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
