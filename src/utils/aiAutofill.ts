import type Anthropic from '@anthropic-ai/sdk';
import { supabase } from './supabaseClient';
import i18n from '../i18n';
import { invokeFunction } from './edgeFunctions';
import { ApiError, LocalizedError } from './apiErrors';
import { DENTAL_CODES } from '../constants/dentalCodes';
import { pocketDepths } from './pocket';
import {
  PatientInfo,
  Species,
  Logo,
  ToothData,
  ToothMarks,
  DiagramComment,
  NerveBlockSite,
  formatAnestheticDrug,
  ExamFindings,
  ExamFinding,
  DentalField,
} from '../types';

/**
 * AI-driven chart autofill. Pipeline (per chunk):
 *
 *   normalized transcript chunk + recent context + current chart state
 *     → Claude messages.create() with the tools defined below
 *     → list of `tool_use` blocks
 *     → applyAiActions() pipes each call through the matching chart
 *       handler (the same functions the manual UI already uses)
 *     → existing diagram-history hook handles undo
 *
 * The system prompt + few-shot examples are static and tagged with
 * cache_control so Anthropic prompt-caches them — every subsequent chunk
 * pays cache-read pricing on those (~10× cheaper) instead of fresh input.
 *
 * BYOK: the API key is taken from a Settings panel and persisted in
 * localStorage. The Anthropic SDK is initialised in the browser with
 * `dangerouslyAllowBrowser: true` — for an animal-records app on a
 * single trusted machine that's an acceptable trade-off; if this ever
 * needs central auth, swap the call site for a tiny edge-function proxy.
 */

/** Default extraction model. Opus 4.8 is the most capable; the AI-settings
 *  model picker can swap it for a faster/cheaper model (Sonnet, Haiku) for
 *  real-time voice work. */
export const DEFAULT_MODEL = 'claude-opus-4-8';

export interface ModelOption {
  id: string;
  displayName: string;
}

/** The SDK is only needed once a key is configured and voice autofill
 *  actually runs — load it on first use, not with the app bundle. */
async function createClient(apiKey: string): Promise<Anthropic> {
  const { default: AnthropicSdk } = await import('@anthropic-ai/sdk');
  return new AnthropicSdk({ apiKey, dangerouslyAllowBrowser: true });
}

/** Static fallback list, used when the live Models API can't be reached
 *  (no key entered yet, offline, etc.). Newest/most-capable first. */
export const KNOWN_MODELS: ModelOption[] = [
  { id: 'claude-opus-4-8',   displayName: 'Claude Opus 4.8 (most capable)' },
  { id: 'claude-sonnet-4-6', displayName: 'Claude Sonnet 4.6 (balanced)' },
  { id: 'claude-haiku-4-5',  displayName: 'Claude Haiku 4.5 (fastest)' },
];

/**
 * Fetch the models this key can actually use, straight from the Anthropic
 * Models API, so the picker only ever offers valid IDs. Falls back to
 * KNOWN_MODELS on any error (bad key, offline). Filters to Claude text
 * models and orders newest-first by `created_at`.
 */
export async function listModels(apiKey: string): Promise<ModelOption[]> {
  const trimmed = apiKey.trim();
  if (!trimmed) return KNOWN_MODELS;
  try {
    const client = await createClient(trimmed);
    const out: ModelOption[] = [];
    // The SDK page object auto-paginates when iterated.
    for await (const m of client.models.list()) {
      if (m.id.startsWith('claude-')) {
        out.push({ id: m.id, displayName: m.display_name ?? m.id });
      }
    }
    return out.length > 0 ? out : KNOWN_MODELS;
  } catch {
    return KNOWN_MODELS;
  }
}

// ----- Tool schemas --------------------------------------------------------

// Every charting tool also accepts these, so the model can apply its best
// guess while saying it isn't sure and what else it might have been.
const REVIEW_PROPS = {
  uncertain: {
    type: 'boolean',
    description: 'True when you are NOT confident this is what the vet said (misheard word, garbled number, ambiguous tooth, [?]-marked word, unclear speaker). The change is applied and queued for the vet to review.',
  },
  reason: { type: 'string', description: 'When uncertain: a few words on why, e.g. "\"8T\" may be AT".' },
  alternatives: {
    type: 'array',
    description: 'When uncertain: up to 3 other likely readings, each as a complete tool call.',
    maxItems: 3,
    items: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Short, e.g. "108 T/FX".' },
        name: { type: 'string', description: 'Tool name for this reading.' },
        input: { type: 'object', description: 'Tool input for this reading.' },
      },
      required: ['label', 'name', 'input'],
    },
  },
} as const;

const chartTools: Anthropic.Messages.Tool[] = [
  {
    name: 'set_tooth_mark',
    description:
      'Mark a tooth missing (already gone before this visit) or extracted (extracted during this visit). Use the "pre" diagram for missing teeth observed at exam; "post" for teeth extracted during the procedure.',
    input_schema: {
      type: 'object',
      properties: {
        diagram: { type: 'string', enum: ['pre', 'post'] },
        triadan: { type: 'integer', description: 'Triadan tooth number (e.g. 104, 209, 309, 408)' },
        mark: { type: 'string', enum: ['missing', 'extracted'] },
      },
      required: ['diagram', 'triadan', 'mark'],
    },
  },
  {
    name: 'unset_tooth_mark',
    description: 'Clear a tooth mark — useful if a previous statement is corrected.',
    input_schema: {
      type: 'object',
      properties: {
        diagram: { type: 'string', enum: ['pre', 'post'] },
        triadan: { type: 'integer' },
      },
      required: ['diagram', 'triadan'],
    },
  },
  {
    name: 'set_tooth_field',
    description:
      'Set a periodontal value on a tooth in the Charting grid. The value is the BARE NUMBER the grid shows — no letter prefix, no units: ' +
      'gingivitis "2" (spoken "GI 2", "G2", "gingivitis two"), calculus "2" ("calc 2", "C2"), mobility "3" ("mobility 3", "M3"), ' +
      'furcation "3" ("F3", "furcation 3"), pocket "5" (mm; "5 millimeter pocket"; several sites "4 5 4"), recession "2" (mm), ' +
      'pocket PER ROOT when the vet names roots — labelled tokens in root order: "M4 D6" ("mesial 4, distal 6"), "MB4 MP5 D6" (upper P4: mesiobuccal, mesiopalatal, distal), "MB3 DB4 P5" (upper M1/M2: palatal root). ' +
      'When adding one root to a tooth that already has per-root depths in the chart state, send the full set ("M4" already charted + "distal 6" → "M4 D6"). ' +
      'pdstate "2" ("PD2", "stage 2"), hyperplasia "3" = the Enlargement column, gingival enlargement in mm ("GE 3", "GE3", "G E 3", "enlargement 3"). ' +
      'GE is enlargement (hyperplasia), never gingivitis — gingivitis is GI.',
    input_schema: {
      type: 'object',
      properties: {
        triadan: { type: 'integer' },
        field: {
          type: 'string',
          enum: [
            'mobility', 'recession', 'pocket', 'furcation',
            'hyperplasia', 'calculus', 'gingivitis', 'pdstate',
          ],
        },
        value: { type: 'string' },
      },
      required: ['triadan', 'field', 'value'],
    },
  },
  {
    name: 'add_comment',
    description:
      'Add a note on a diagram, optionally anchored to a tooth. Use it for diagnosis/procedure findings that are NOT grid values (fractures, resorption, abrasion, biopsy…). ' +
      'Write the AVDC abbreviation ONLY when one exists — text "T/FX", never "Fracture (T/FX)" or "Tooth fracture". Several findings: "T/FX/CCF", or codes joined with ", ". Plain words only for a finding with no code. ' +
      'Never use it for periodontal grid values (gingivitis, calculus, mobility, pocket, furcation, recession, PD stage) — those go in set_tooth_field only.',
    input_schema: {
      type: 'object',
      properties: {
        diagram: { type: 'string', enum: ['pre', 'post'] },
        triadan: { type: 'integer', description: 'Tooth to anchor to. Omit for a free-floating note.' },
        text: { type: 'string' },
      },
      required: ['diagram', 'text'],
    },
  },
  {
    name: 'set_exam_finding',
    description: 'Record an oral-exam finding (six standard areas).',
    input_schema: {
      type: 'object',
      properties: {
        area: { type: 'string', enum: ['extraoral', 'lymph', 'buccal', 'tongue', 'palate', 'pharynx'] },
        status: { type: 'string', enum: ['normal', 'abnormal'] },
        comment: { type: 'string', description: 'Free text — used when status is abnormal.' },
      },
      required: ['area', 'status'],
    },
  },
  {
    name: 'set_nerve_block',
    description: 'Record an anesthetic nerve-block dose in millilitres.',
    input_schema: {
      type: 'object',
      properties: {
        site: {
          type: 'string',
          enum: [
            'infraorbitalRight', 'infraorbitalLeft',
            'caudalMaxillaryRight', 'caudalMaxillaryLeft',
            'inferiorAlveolarRight', 'inferiorAlveolarLeft',
            'mentalRight', 'mentalLeft',
            'other',
          ],
        },
        mL: { type: 'string', description: 'Dose as a number string, e.g. "0.3".' },
      },
      required: ['site', 'mL'],
    },
  },
  {
    name: 'set_anesthetic_drug',
    description: 'Record an anesthetic used for the nerve blocks (e.g. "Bupivacaine", "Lidocaine"). When several drugs are mixed, call once per drug — each call adds to the list (a drug already listed is updated, not duplicated).',
    input_schema: {
      type: 'object',
      properties: {
        drug: { type: 'string' },
        concentration: { type: 'string', description: 'Percent strength if stated, as a number string without "%", e.g. "0.5" or "2".' },
      },
      required: ['drug'],
    },
  },
  {
    name: 'set_patient_field',
    description: 'Set a patient-level text field.',
    input_schema: {
      type: 'object',
      properties: {
        field: {
          type: 'string',
          enum: ['patientName', 'patientNumber', 'doctor', 'tech', 'complaint'],
        },
        value: { type: 'string' },
      },
      required: ['field', 'value'],
    },
  },
  {
    name: 'append_treatment_report',
    description:
      'Append a paragraph to the running treatment report. Use for narrative descriptions of work performed during the procedure (cleanings, extractions performed, suturing, etc.).',
    input_schema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
  },
  {
    name: 'append_radiographic_findings',
    description:
      'Append to the radiographic findings: what the dental radiographs show (bone loss, root fractures, tooth resorption, periapical lucency, retained roots, unerupted teeth…). Only for findings the vet attributes to radiographs/x-rays/rads. Start with the tooth number when one is given, e.g. "108: vertical bone loss, distal root."',
    input_schema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
  },
];

const FLAG_UNCLEAR_TOOL: Anthropic.Messages.Tool = {
  name: 'flag_unclear',
  description:
    'Use when something sounds like a finding but you cannot pick a best reading (garbled tooth number, homophone with no clear winner, fragment). Nothing is applied; the vet hears a short prompt and picks from your options later. Prefer a best-guess tool call with uncertain=true when one reading is clearly most likely.',
  input_schema: {
    type: 'object',
    properties: {
      heard: { type: 'string', description: 'The words as transcribed, e.g. "1098T".' },
      reason: { type: 'string', description: 'Why it is unclear, in a few words.' },
      triadan: { type: 'integer', description: 'The tooth, if known.' },
      options: REVIEW_PROPS.alternatives,
    },
    required: ['heard', 'reason', 'options'],
  },
};

const tools: Anthropic.Messages.Tool[] = [
  ...chartTools.map((t) => ({
    ...t,
    input_schema: {
      ...t.input_schema,
      properties: { ...(t.input_schema.properties as Record<string, unknown>), ...REVIEW_PROPS },
    },
  })),
  FLAG_UNCLEAR_TOOL,
];

// ----- Static (cacheable) system prompt + few-shot examples ----------------

const FEW_SHOT_EXAMPLES = `EXAMPLES of vet phrasing → tool calls. Match these patterns.

[EX 1] "104 mobility class two, calculus stage one"
→ set_tooth_field(triadan=104, field=mobility, value=2)
→ set_tooth_field(triadan=104, field=calculus, value=1)

[EX 2] "209 is going to come out today" / "we might have to extract 209"
→ NO TOOL CALL — speculative. Wait for definitive language ("extracted", "removing now", etc.).

[EX 3] "209 extracted" / "just took out 209" / "removing 209 now"
→ set_tooth_mark(diagram=post, triadan=209, mark=extracted)

[EX 4] "104 is missing on exam" / "patient is missing 104 already"
→ set_tooth_mark(diagram=pre, triadan=104, mark=missing)

[EX 5] "tongue normal, palate normal"
→ set_exam_finding(area=tongue, status=normal)
→ set_exam_finding(area=palate, status=normal)

[EX 6] "extraoral exam unremarkable, lymph nodes within normal limits"
→ set_exam_finding(area=extraoral, status=normal)
→ set_exam_finding(area=lymph, status=normal)

[EX 7] "buccal mucosa abnormal, slight ulceration on the right cheek"
→ set_exam_finding(area=buccal, status=abnormal, comment="Slight ulceration on right cheek")

[EX 8] "0.3 mL bupivacaine right infraorbital"
→ set_anesthetic_drug(drug=Bupivacaine)
→ set_nerve_block(site=infraorbitalRight, mL=0.3)

[EX 9] "0.4 on the left mental" (drug already discussed earlier)
→ set_nerve_block(site=mentalLeft, mL=0.4)

[EX 9b] "blocks were a mix of half percent bupivacaine and two percent lidocaine"
→ set_anesthetic_drug(drug=Bupivacaine, concentration=0.5)
→ set_anesthetic_drug(drug=Lidocaine, concentration=2)

[EX 10] "401 has a fractured slab, took a biopsy"
→ add_comment(diagram=pre, triadan=401, text="T/FX")
→ add_comment(diagram=post, triadan=401, text="B")

[EX 11] "completed full mouth cleaning, polish, all four quadrants"
→ append_treatment_report(text="Completed full mouth cleaning with polish, all four quadrants.")

[EX 12] "108 stage three periodontal disease, four millimeter pocket distally"
→ set_tooth_field(triadan=108, field=pdstate, value=3)
→ set_tooth_field(triadan=108, field=pocket, value=4)

[EX 12b] "106 GI 2, GE3, calc 1" (GE = gingival enlargement — the Enlargement column; GI = gingivitis)
→ set_tooth_field(triadan=106, field=gingivitis, value=2)
→ set_tooth_field(triadan=106, field=hyperplasia, value=3)
→ set_tooth_field(triadan=106, field=calculus, value=1)

[EX 12c] "108 pockets mesiobuccal 4, mesiopalatal 5, distal 6" / "308 mesial 3 distal 5"
→ set_tooth_field(triadan=108, field=pocket, value="MB4 MP5 D6")
→ set_tooth_field(triadan=308, field=pocket, value="M3 D5")

[EX 13] "patient looks great" / "doing well today" / "hand me the scaler"
→ NO TOOL CALL — small talk / instructions to staff / vague.

[EX 14] "this canine looks pretty bad" (no Triadan number stated)
→ NO TOOL CALL — don't guess teeth. Skip and let the vet name it.

[EX 15] "AB on 304" / "304 abrasion"
→ add_comment(diagram=pre, triadan=304, text="AB")

[EX 15b] "105 fracture" / "105 is fractured"
→ add_comment(diagram=pre, triadan=105, text="T/FX")   (the code alone — not "Fracture (T/FX)")

[EX 16] "I want to redo what I said about 209, that's actually fine"
→ unset_tooth_mark(diagram=post, triadan=209)

[EX 16b] "1098T" (speech-to-text garbled "109 AT")
→ add_comment(diagram=pre, triadan=109, text="AT", uncertain=true, reason="\"8T\" heard — likely AT", alternatives=[{label:"108 T (no code)", name:"flag_unclear", ...}])
   Better when no second reading is plausible: just the best guess with uncertain=true and no alternatives.

[EX 16c] "two [?oh] [?for] GI 2"
→ set_tooth_field(triadan=204, field=gingivitis, value=2, uncertain=true, reason="tooth number low confidence", alternatives=[{label:"104 GI 2", name:"set_tooth_field", input:{triadan:104, field:"gingivitis", value:"2"}}])

[EX 16d] "ninety-nine T/FX" (no valid tooth)
→ flag_unclear(heard="ninety-nine T/FX", reason="99 isn't a Triadan number", options=[{label:"109 T/FX", name:"add_comment", input:{diagram:"pre", triadan:109, text:"T/FX"}}, {label:"409 T/FX", name:"add_comment", input:{diagram:"pre", triadan:409, text:"T/FX"}}])

[EX 17] "101 GI 2, calc 2, F3. 102 GI 2, calc 2, mobility 3. 103 GI 2, calc 2, 5 millimeter pocket"
(several teeth in one breath — every value belongs to the most recent tooth number; cover ALL of them)
→ set_tooth_field(triadan=101, field=gingivitis, value=2)
→ set_tooth_field(triadan=101, field=calculus, value=2)
→ set_tooth_field(triadan=101, field=furcation, value=3)
→ set_tooth_field(triadan=102, field=gingivitis, value=2)
→ set_tooth_field(triadan=102, field=calculus, value=2)
→ set_tooth_field(triadan=102, field=mobility, value=3)
→ set_tooth_field(triadan=103, field=gingivitis, value=2)
→ set_tooth_field(triadan=103, field=calculus, value=2)
→ set_tooth_field(triadan=103, field=pocket, value=5)

[EX 18] "104 GI2, calc 1, T/FX/CCF. 105 missing."
→ set_tooth_field(triadan=104, field=gingivitis, value=2)
→ set_tooth_field(triadan=104, field=calculus, value=1)
→ add_comment(diagram=pre, triadan=104, text="T/FX/CCF")
→ set_tooth_mark(diagram=pre, triadan=105, mark=missing)
`;

function buildStaticSystemPrompt(): string {
  const codeList = DENTAL_CODES
    .map((c) => `  ${c.code} — ${c.definition} (${c.kind})`)
    .join('\n');

  return [
    'You are a veterinary dental scribe. The user is a vet calling out findings during an exam or procedure on one patient. Each chunk of transcript you receive may contain dental findings, side conversation, instructions to staff, or pure silence. Emit tool calls only for clearly stated dental information.',
    '',
    'CORE RULES (these are firm):',
    '1. Be conservative. If wording is speculative ("might", "maybe", "could be", "I think"), prefer add_comment over a definitive change — or skip entirely.',
    '2. Don\'t restate findings already in the chart state. Each chunk should produce only new or corrective information.',
    '3. Don\'t guess Triadan numbers. If a tooth is referred to as "this one" or "the canine" without a number, skip it — the vet will fill it in.',
    '4. Side conversation, instructions to staff ("hand me the scaler", "more suction"), and pleasantries get NO tool calls. Silence is fine.',
    '5. Numbers in the transcript may be lightly garbled by speech-to-text. "One oh four" / "1 oh 4" / "1-0-4" all mean 104. Common shorthand spacings ("P D 2", "M 2", "C 1") collapse to PD2, M2, C1. You may get the text twice: AS TRANSCRIBED (what speech-to-text produced) and AUTO-CLEANED (a regex pass that turns number words into digits and joins shorthand). The cleanup can be wrong — when the two disagree, reason from the as-transcribed words.',
    '6. When the vet says they "redid" or "corrected" a previous statement, use unset_tooth_mark or update via setter accordingly.',
    '7. SPEAKER LABELS: Some chunks include speaker labels like "Speaker 0:" or "Speaker 1:" — these come from a diarizing transcription model. Treat the speaker who states medical findings as the vet. Treat other speakers as the tech/assistant; their statements are CONTEXT, not findings, unless they\'re reading back numbers the vet asked for. Don\'t emit tool calls for the tech\'s acknowledgements ("got it", "suctioning now") or tooth callouts directed at the vet. If only one speaker label appears, treat them as the vet.',
    '8. Dictation often runs through several teeth in one breath. Each Triadan number starts a new tooth; every value after it belongs to that tooth until the next number. Emit a call for EVERY value of EVERY tooth in the chunk — never stop after the first tooth.',
    '9. Periodontal grid values (gingivitis, calculus, mobility, pocket, furcation, recession, PD stage) go ONLY in set_tooth_field, never in add_comment — the app mirrors the grid onto the diagram itself when the vet wants that.',
    '10. Diagram notes are AVDC codes, not words: "T/FX", "TR", "AB", "T/FX/CCF". Use plain words only when no code exists for the finding.',
    '',
    'UNCERTAINTY (the vet is looking at the mouth, not the screen — flags are how they find out):',
    '- Words written [?like this] were low-confidence in speech-to-text. Treat them as possibly misheard.',
    '- When one reading is clearly most likely but you are not sure, make the call with uncertain=true, a short reason, and alternatives (each a complete tool call).',
    '- When you cannot choose at all, use flag_unclear with options. Never silently drop something that sounds like a finding.',
    '- Typical causes: homophones ("8T" for AT, "for" for 4, "to/too" for 2), a tooth number that isn\'t valid Triadan, a value outside its range, a phrase cut off mid-finding, a finding stated by a non-vet speaker.',
    '- Don\'t flag what is clear. Most findings are not uncertain; over-flagging makes the review list useless.',
    '',
    'FIELD SEMANTICS:',
    '- "pre" diagram = Diagnosis (findings observed at exam, before procedure). Teeth already missing, periodontal disease grades, fractures.',
    '- "post" diagram = Procedure (work performed today). Teeth extracted during this visit.',
    '- mobility/recession/pocket/furcation/hyperplasia/calculus/gingivitis/pdstate go into the per-tooth grid as bare numbers ("GI 2" → gingivitis 2, "GE 3" → hyperplasia 3 (the Enlargement column), "calc 1" → calculus 1, "M3" → mobility 3, "5 mm pocket" → pocket 5).',
    '- add_comment for findings that don\'t fit a structured field (biopsy, draining tract, photo taken, fracture details).',
    '- append_treatment_report for narrative description of WORK DONE (scaling, polish, suturing, extractions performed).',
    '- append_radiographic_findings for what the radiographs show ("on rads", "radiographically", "x-rays show") — not exam findings, not work done.',
    '',
    FEW_SHOT_EXAMPLES,
    '',
    'DENTAL SHORTHAND CODES (use in field values and comments where natural):',
    codeList,
  ].join('\n');
}

// ----- Transcript normalization -------------------------------------------
// STT mangles numbers and shorthand. We normalize before Claude sees it.

const DIGIT_WORDS: Record<string, string> = {
  zero: '0', oh: '0',
  one: '1', two: '2', three: '3', four: '4',
  five: '5', six: '6', seven: '7', eight: '8', nine: '9',
};

const DIGIT_WORD_RE = new RegExp(
  `\\b(${Object.keys(DIGIT_WORDS).join('|')})(?:[\\s\\-]+(${Object.keys(DIGIT_WORDS).join('|')}))(?:[\\s\\-]+(${Object.keys(DIGIT_WORDS).join('|')}))?\\b`,
  'gi'
);

// Words after which a single spoken number is a score/measurement, not
// part of a tooth number: "mobility three one zero three" is mobility 3,
// tooth 103 — not tooth 310.
const SCORE_TERMS = 'GI|GE|G|C|calc|calculus|mobility|mob|M|F|furcation|PD|stage|grade|class|pocket|recession|gingivitis|enlargement|hyperplasia|mesial|distal|mesiobuccal|mesiopalatal|distobuccal|palatal';
const SCORE_WORD_RE = new RegExp(
  `\\b(${SCORE_TERMS})([\\s,.-]+)(${Object.keys(DIGIT_WORDS).join('|')})\\b`,
  'gi'
);
// A spoken number right before a unit is a measurement: "five millimeter".
const UNIT_WORD_RE = new RegExp(
  `\\b(${Object.keys(DIGIT_WORDS).join('|')})(?=[\\s-]*(?:mm|millimet(?:er|re)s?)\\b)`,
  'gi'
);

export function normalizeTranscript(raw: string): string {
  let text = raw;

  // Deepgram's smart formatting runs findings together ("104GI2",
  // "CCF105"); split digits from letters so tooth numbers and scores are
  // separate tokens. Code+digit pairs (PD3, M2) are re-joined below.
  text = text.replace(/(\d)(?=[A-Za-z])/g, '$1 ').replace(/([A-Za-z])(?=\d)/g, '$1 ');

  // AVDC codes dictated as words: "T slash FX slash CCF" → "T/FX/CCF".
  text = text.replace(/\s*\bslash\b\s*/gi, '/');
  // "AT" (attrition) heard as "eight-T": "1098T" / "109 8T" → "109 AT".
  text = text.replace(/\b([1-8][0-1]\d)\s*8\s*T\b/g, '$1 AT');

  // Spelled-out letters: "g I" → "GI", "g e" → "GE" (gingival
  // enlargement), "P D" handled below.
  text = text.replace(/\bg[\s.-]*i\b/gi, 'GI');
  text = text.replace(/\bg[\s.-]+e\b/gi, 'GE');
  // STT spells the letter F as "f e" ("f e three" = F3, furcation 3).
  text = text.replace(/\bf[\s.]+e\b/gi, 'F');

  // Scores and measurements first, one word each, so the tooth-number
  // pass below can't swallow them ("calc two five millimeter" is calc 2,
  // 5 mm — not 25).
  text = text.replace(SCORE_WORD_RE, (_m, term, sep, word) => `${term}${sep}${DIGIT_WORDS[word.toLowerCase()]}`);
  // A score run into the next tooth number: "calc 2102" → "calc 2 102".
  text = text.replace(new RegExp(`\\b(${SCORE_TERMS})\\s+(\\d)([1-8][0-1]\\d)\\b`, 'gi'), '$1 $2 $3');
  // A pause before the value gets punctuated ("Calc. 3"): rejoin it.
  text = text.replace(new RegExp(`\\b(${SCORE_TERMS})\\.\\s+(?=\\d)`, 'gi'), '$1 ');
  text = text.replace(UNIT_WORD_RE, (word) => DIGIT_WORDS[word.toLowerCase()]);

  // "one oh four" / "two-o-nine" / "three zero one" → "104" / "209" / "301"
  text = text.replace(DIGIT_WORD_RE, (match, a, b, c) => {
    const parts = [a, b, c].filter(Boolean).map((w: string) => DIGIT_WORDS[w.toLowerCase()]);
    if (parts.length < 2) return match;
    return parts.join('');
  });

  // "P D" / "P-D" → "PD" (the multi-letter prefix needs its own pass first;
  // otherwise "P-D-3" stays split because the second letter is followed
  // by a hyphen, not a digit).
  text = text.replace(/\bP[\s-]+D\b/gi, 'PD');

  // "PD 2" / "PD-2" → "PD2"; "M 2" → "M2"; "C 1" → "C1"; "F 2" → "F2"
  text = text.replace(
    /\b(PD|M|C|F|G)[\s-]*(\d)\b/gi,
    (_, code, digit) => `${code.toUpperCase()}${digit}`
  );

  // Standalone "stage two", "class three" → preserve but Claude handles
  // them via examples; no transform needed.

  // Collapse whitespace.
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

// ----- Heuristic: is this chunk worth sending? -----------------------------
// Only pure filler is skipped. An earlier keyword gate dropped real
// findings before the model ever saw them ("504 fractured", "and two on
// that one", deciduous teeth) — a missed finding costs far more than a
// call on small talk, and the model already ignores small talk.

const FILLER_WORDS = new Set([
  'ok', 'okay', 'k', 'yeah', 'yep', 'yes', 'no', 'nope', 'um', 'uh', 'umm', 'uhh', 'hmm', 'mm', 'mhm',
  'thanks', 'thank', 'you', 'got', 'it', 'alright', 'all', 'right', 'cool', 'sure', 'great', 'good',
  'perfect', 'nice', 'so', 'and', 'oh',
]);

export function chunkWorthSending(chunk: string): boolean {
  const text = chunk.replace(/\bSpeaker \d+:\s*/gi, '').trim();
  if (text.length < 2) return /\d/.test(text);
  if (/\d/.test(text)) return true;
  const words = text.toLowerCase().replace(/\[\?([^\]]*)\]/g, '$1').match(/[a-z\/]+/g) ?? [];
  return words.some((w) => !FILLER_WORDS.has(w));
}

// ----- Chart context summary ----------------------------------------------

export interface ChartContext {
  patientInfo: PatientInfo;
  species: Species;
  logo: Logo;
  toothData: ToothData[];
  preMarks: ToothMarks;
  preComments: DiagramComment[];
  postMarks: ToothMarks;
  postComments: DiagramComment[];
}

export function summarizeChart(c: ChartContext): string {
  const lines = [
    `species: ${c.species}`,
    `patient: ${c.patientInfo.patientName || '(unset)'} #${c.patientInfo.patientNumber || '(unset)'}`,
    `complaint: ${c.patientInfo.complaint || '(unset)'}`,
    `pre.missing: ${markList(c.preMarks, 'missing')}`,
    `pre.extracted: ${markList(c.preMarks, 'extracted')}`,
    `post.extracted: ${markList(c.postMarks, 'extracted')}`,
    `pre.comments: ${commentList(c.preComments)}`,
    `post.comments: ${commentList(c.postComments)}`,
    `treatmentReport: ${(c.patientInfo.treatmentReport || '').slice(0, 200)}`,
    `radiographicFindings: ${(c.patientInfo.radiographicFindings || '').slice(0, 200)}`,
  ];
  const exam = Object.entries(c.patientInfo.exam)
    .filter(([, v]) => v.status)
    .map(([k, v]) => `${k}=${v.status}${v.comment ? `(${v.comment})` : ''}`);
  if (exam.length) lines.push(`exam: ${exam.join(' ')}`);

  const filledTeeth = c.toothData.filter((t) =>
    t.mobility || t.recession || t.pocket || t.furcation ||
    t.hyperplasia || t.calculus || t.gingivitis || t.pdstate
  );
  if (filledTeeth.length) {
    lines.push(
      `toothFields: ` +
      filledTeeth
        .map((t) => {
          const parts: string[] = [];
          for (const f of ['mobility', 'recession', 'pocket', 'furcation', 'hyperplasia', 'calculus', 'gingivitis', 'pdstate'] as const) {
            if (t[f]) parts.push(`${f}=${t[f]}`);
          }
          return `${t.triadan}{${parts.join(',')}}`;
        })
        .join(' ')
    );
  }
  const nb = c.patientInfo.nerveBlocks;
  const blocks = Object.entries(nb).filter(([k, v]) => k !== 'drugs' && typeof v === 'string' && v);
  const drugs = (nb.drugs ?? []).filter((d) => d.name.trim()).map(formatAnestheticDrug);
  if (blocks.length || drugs.length) {
    const parts = blocks.map(([k, v]) => `${k}=${v}`);
    if (drugs.length) parts.unshift(`drugs=${JSON.stringify(drugs.join(' + '))}`);
    lines.push(`nerveBlocks: ${parts.join(' ')}`);
  }
  return lines.join('\n');
}

function markList(marks: ToothMarks, kind: 'missing' | 'extracted'): string {
  const ids = Object.entries(marks).filter(([, v]) => v === kind).map(([k]) => k);
  return ids.length ? ids.join(',') : '(none)';
}
function commentList(comments: DiagramComment[]): string {
  if (!comments.length) return '(none)';
  return comments
    .map((c) => (c.anchorTriadan ? `@${c.anchorTriadan}: ` : '') + (c.text || '∅'))
    .join(' | ');
}

// ----- Key verification ---------------------------------------------------

export interface VerifyResult {
  ok: boolean;
  /** Human-readable reason on failure (auth, network, format, etc.). */
  message?: string;
}

/**
 * Lightweight credential check. Format-validate, then make a 1-token
 * messages.create() call against the cheapest model — costs a fraction
 * of a cent and surfaces auth / network errors before the user is mid-
 * procedure with the mic on.
 */
export async function verifyApiKey(key: string): Promise<VerifyResult> {
  const trimmed = key.trim();
  if (!trimmed) {
    return { ok: false, message: 'No key provided.' };
  }
  if (!/^sk-ant-[A-Za-z0-9_-]{10,}$/.test(trimmed)) {
    return {
      ok: false,
      message: 'Doesn\'t look like an Anthropic key — should start with "sk-ant-".',
    };
  }
  try {
    const client = await createClient(trimmed);
    await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ok' }],
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/401|invalid.*api.?key|authentication/i.test(msg)) {
      return { ok: false, message: 'Anthropic rejected the key (401). Check it on console.anthropic.com.' };
    }
    if (/403|permission/i.test(msg)) {
      return { ok: false, message: 'Key authenticates but lacks permission for the messages API.' };
    }
    if (/network|fetch|cors/i.test(msg)) {
      return { ok: false, message: 'Network error — check your connection and try again.' };
    }
    return { ok: false, message: `Verification failed: ${msg}` };
  }
}

// ----- Section scoping -----------------------------------------------------
// Dictation fills the section the vet is looking at. The tool list sent to
// the model stays the same everywhere (it's part of the prompt-cache
// prefix); instead the active section is named in the user message and
// anything that doesn't belong to it is filtered out here.

interface SectionScope {
  label: string;
  /** What the model may write on this page, in plain words. */
  guidance: string;
  allows: (a: AiAction) => boolean;
}

const diagramOf = (a: AiAction) => (a.input.diagram === 'post' ? 'post' : 'pre');

/** True when a comment holds nothing but periodontal scores ("GI 2, calc
 *  1, M3") — grid values the Charting page's mirror option already puts
 *  on the diagram, so a comment would duplicate them. */
export function isPerioOnlyText(text: string): boolean {
  const rest = text
    .replace(/\b(?:GI|G|C|calc(?:ulus)?|M|mob(?:ility)?|F|furc(?:ation)?|PD|stage|grade|class|gingivitis|pocket|recession)\s*[-:=]?\s*\d+(?:\s*mm)?\b/gi, '')
    .replace(/\b\d+\s*(?:mm|millimet(?:er|re)s?)\s*(?:pocket|recession)?\b/gi, '')
    .replace(/[\s,.;/]+/g, '');
  return text.trim().length > 0 && rest.length === 0;
}

const SECTION_SCOPES: Record<string, SectionScope> = {
  patient: {
    label: 'Patient',
    guidance: 'set_patient_field only.',
    allows: (a) => a.name === 'set_patient_field',
  },
  exam: {
    label: 'Exam',
    guidance: 'set_exam_finding only.',
    allows: (a) => a.name === 'set_exam_finding',
  },
  anesthesia: {
    label: 'Anesthesia',
    guidance: 'set_nerve_block and set_anesthetic_drug only.',
    allows: (a) => a.name === 'set_nerve_block' || a.name === 'set_anesthetic_drug',
  },
  charting: {
    label: 'Charting (per-tooth periodontal grid)',
    guidance:
      'set_tooth_field for every periodontal value (gingivitis, calculus, mobility, pocket, furcation, recession, enlargement, PD stage); ' +
      'set_tooth_mark/unset_tooth_mark with diagram=pre, mark=missing for missing teeth; ' +
      'and add_comment with diagram=pre for DIAGNOSIS findings that are not grid values (AVDC codes like T/FX, CCF, TR; fractures; resorption) — those go on the Diagnosis diagram. ' +
      'Never put periodontal values in a comment.',
    allows: (a) =>
      a.name === 'set_tooth_field' ||
      ((a.name === 'set_tooth_mark' || a.name === 'unset_tooth_mark') &&
        diagramOf(a) === 'pre' &&
        (a.name === 'unset_tooth_mark' || a.input.mark === 'missing')) ||
      (a.name === 'add_comment' && diagramOf(a) === 'pre' && !isPerioOnlyText(String(a.input.text ?? ''))),
  },
  diagnosis: {
    label: 'Diagnosis diagram',
    guidance: 'set_tooth_mark/unset_tooth_mark and add_comment with diagram=pre only.',
    allows: (a) =>
      (a.name === 'set_tooth_mark' || a.name === 'unset_tooth_mark' || a.name === 'add_comment') &&
      diagramOf(a) === 'pre',
  },
  procedure: {
    label: 'Procedure diagram',
    guidance: 'set_tooth_mark/unset_tooth_mark and add_comment with diagram=post only.',
    allows: (a) =>
      (a.name === 'set_tooth_mark' || a.name === 'unset_tooth_mark' || a.name === 'add_comment') &&
      diagramOf(a) === 'post',
  },
  treatment: {
    label: 'Treatment Report',
    guidance: 'append_treatment_report only.',
    allows: (a) => a.name === 'append_treatment_report',
  },
};

/** True when dictation on this section is limited to that section's
 *  fields. Sections without a scope (Images, Owner report) leave every
 *  tool available. */
export function isScopedSection(section: string | undefined): boolean {
  return !!section && section in SECTION_SCOPES;
}

const SECTION_LABELS: Record<string, () => string> = {
  patient: () => i18n.t('sections.patient', { ns: 'voice' }),
  exam: () => i18n.t('sections.exam', { ns: 'voice' }),
  anesthesia: () => i18n.t('sections.anesthesia', { ns: 'voice' }),
  charting: () => i18n.t('sections.charting', { ns: 'voice' }),
  diagnosis: () => i18n.t('sections.diagnosis', { ns: 'voice' }),
  procedure: () => i18n.t('sections.procedure', { ns: 'voice' }),
  treatment: () => i18n.t('sections.treatment', { ns: 'voice' }),
};

/** The section's name in the active language, for the activity log. (The AI prompt
 *  keeps using the English `scope.label`.) */
export function sectionLabel(section: string): string {
  return SECTION_LABELS[section]?.() ?? section;
}

/** What dictation may do on any page: everything except a diagram note
 *  holding only perio scores (those belong in the grid, which mirrors
 *  them onto the diagram itself). */
export function actionAllowedAnywhere(a: AiAction): boolean {
  return !(a.name === 'add_comment' && isPerioOnlyText(String(a.input.text ?? '')));
}

export function actionAllowedInSection(a: AiAction, section: string | undefined): boolean {
  const scope = section ? SECTION_SCOPES[section] : undefined;
  return scope ? scope.allows(a) : true;
}

// ----- Caller --------------------------------------------------------------

export interface AiAction {
  name: string;
  input: Record<string, unknown>;
}

export interface ExtractInput {
  /** New transcript text since the last extraction. */
  delta: string;
  /** Earlier transcript (last ~90s) for back-references and findings that
   *  straddle chunks. Empty string is fine on the first chunk. */
  recentContext: string;
  context: ChartContext;
  /** Id of the chart section on screen — a tie-break hint only; findings
   *  go wherever they belong. */
  section?: string;
}

/** Something the vet should check: a best guess that was applied but may
 *  be wrong (`applied` set), or a question nothing was applied for. */
export interface ReviewFlag {
  heard: string;
  reason: string;
  triadan?: number;
  applied?: AiAction;
  options: { label: string; action: AiAction }[];
}

export interface ExtractResult {
  actions: AiAction[];
  /** Actions the model proposed that belong to a different section —
   *  not applied, surfaced so the vet knows something was heard. */
  skipped: AiAction[];
  /** Uncertain guesses (also in `actions`) and unclear findings. */
  flags: ReviewFlag[];
  /** True if the extractor ran (vs. skipped because the chunk was pure
   *  filler). */
  ran: boolean;
}

/** Both transcript forms for the prompt: as transcribed, plus the regex
 *  cleanup when it changed anything. */
function transcriptBlock(heading: string, raw: string): string {
  const cleaned = normalizeTranscript(raw);
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  return cleaned === trimmed
    ? `${heading}:\n${trimmed}\n\n`
    : `${heading} — AS TRANSCRIBED:\n${trimmed}\n${heading} — AUTO-CLEANED:\n${cleaned}\n\n`;
}

/** The request body for one live chunk, or null when the chunk is pure
 *  filler. Pure — shared by the app and scripts/replay-transcript.ts. */
export function buildChunkRequest(input: ExtractInput): AutofillRequest | null {
  const { delta, recentContext, context, section } = input;
  if (!chunkWorthSending(delta)) return null;
  const scope = section ? SECTION_SCOPES[section] : undefined;

  const userText =
    `Current chart state:\n${summarizeChart(context)}\n\n` +
    (recentContext.trim()
      ? `Earlier transcript (already processed — what it established is in the chart state above). Use it to resolve back-references. ` +
        `If the new chunk completes, continues or corrects a finding that started here (e.g. a tooth number here, its values in the new chunk), emit the complete finding:\n` +
        `${recentContext.replace(/\s+/g, ' ').trim()}\n\n`
      : '') +
    transcriptBlock('New transcript chunk to extract from', delta) +
    (scope
      ? `OPEN PAGE: the vet has the ${scope.label} page on screen. That doesn't limit anything — chart every finding where it belongs, ` +
        `whichever page it's on. Only when a finding could equally go in two places (e.g. a note for the Diagnosis or the Procedure diagram) prefer this page.\n\n`
      : '') +
    `Emit tool calls only for new information from this chunk. If nothing in this chunk warrants a chart change, return no tool calls.`;

  return {
    max_tokens: 1024,
    kind: 'live',
    system: [
      { type: 'text', text: buildStaticSystemPrompt(), cache_control: { type: 'ephemeral' } },
    ],
    tools,
    messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
  };
}

export interface AutofillRequest {
  max_tokens: number;
  /** 'review' = the end-of-dictation check: the edge function gives the
   *  model more thinking and output room for it. */
  mode?: 'review';
  /** Which feature the call is for — logged with usage (ai_usage.kind). */
  kind?: 'live' | 'review' | 'owner_report' | 'warmup';
  system: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>;
  tools: Anthropic.Messages.Tool[];
  messages: Array<{ role: 'user'; content: Array<{ type: 'text'; text: string }> }>;
}

/** Longest transcript sent to the final check. ~1.5 h of steady
 *  dictation; the edge function's size cap leaves room above it. */
export const REVIEW_TRANSCRIPT_MAX_CHARS = 200_000;

export interface ReviewInput {
  /** The whole session's transcript, one utterance per line. */
  transcript: string;
  context: ChartContext;
  /** Chart changes the vet rejected in review — never re-add them. */
  rejected: AiAction[];
}

/**
 * The end-of-dictation check: the whole transcript against the chart as it
 * stands, emitting only what live chunking missed or got wrong. This is the
 * same view a person gets reading the transcript top to bottom.
 */
export function buildReviewRequest(input: ReviewInput): AutofillRequest | null {
  let transcript = input.transcript.trim();
  if (!transcript || !chunkWorthSending(transcript)) return null;
  let truncatedNote = '';
  if (transcript.length > REVIEW_TRANSCRIPT_MAX_CHARS) {
    transcript = transcript.slice(-REVIEW_TRANSCRIPT_MAX_CHARS);
    transcript = transcript.slice(transcript.indexOf('\n') + 1);
    truncatedNote = 'The transcript was too long to send whole; it starts partway through the session. Only check what it covers.\n\n';
  }
  const rejected = input.rejected.map(describeAction);

  const userText =
    `FINAL CHECK — dictation has stopped.\n\n` +
    `Live extraction ran on short chunks as the vet spoke, so it may have missed findings (split across chunks, misheard, said quickly) ` +
    `or applied a value the vet later corrected. Read the whole transcript, compare it with the chart, and emit tool calls ONLY for:\n` +
    `- findings stated in the transcript that are missing from the chart;\n` +
    `- chart values that contradict what the vet finally said (the last correction wins).\n` +
    `Do NOT re-emit anything the chart already has right. If the chart has something the transcript never mentions, leave it alone — the vet may have entered it by hand. ` +
    `Speculative or planned work ("might extract 209") still gets no call. Mark anything you are unsure of with uncertain=true, or use flag_unclear, as usual. ` +
    `Most sessions need few or no calls here.\n\n` +
    `Current chart state:\n${summarizeChart(input.context)}\n\n` +
    (rejected.length ? `Rejected by the vet in review — never re-add these:\n${rejected.map((r) => `- ${r}`).join('\n')}\n\n` : '') +
    truncatedNote +
    `Full transcript (as transcribed; one utterance per line):\n${transcript}`;

  return {
    max_tokens: 8192,
    mode: 'review',
    kind: 'review',
    system: [
      { type: 'text', text: buildStaticSystemPrompt(), cache_control: { type: 'ephemeral' } },
    ],
    tools,
    messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
  };
}

export async function sendAutofill(requestBody: AutofillRequest): Promise<Array<Anthropic.ContentBlock>> {
  if (!supabase) throw new LocalizedError(i18n.t('errors.noCloud', { ns: 'voice' }));
  const send = async (): Promise<Array<Anthropic.ContentBlock>> => {
    const data = await invokeFunction<{ content?: Array<Anthropic.ContentBlock> }>('ai-autofill', requestBody);
    return data?.content ?? [];
  };
  try {
    return await send();
  } catch (err) {
    // Matched on the server's English text: coded errors carry it as serverMessage.
    const text = err instanceof ApiError ? err.serverMessage : err instanceof Error ? err.message : '';
    const retryable = err instanceof Error && /rate|timeout|network|503|502|429/i.test(text);
    if (!retryable) throw err;
    await new Promise((r) => setTimeout(r, 800));
    return send();
  }
}

/** Turn the model's tool calls into actions, skips and review flags.
 *  `allowed` decides which actions may land (section scoping). */
export function parseAutofillContent(
  content: Array<{ type: string; name?: string; input?: unknown }>,
  allowed: (a: AiAction) => boolean,
): Omit<ExtractResult, 'ran'> {
  const actions: AiAction[] = [];
  const skipped: AiAction[] = [];
  const flags: ReviewFlag[] = [];
  for (const block of content) {
    if (block.type !== 'tool_use' || !block.name) continue;
    const input = (block.input ?? {}) as Record<string, unknown>;
    if (block.name === 'flag_unclear') {
      const options = parseAlternatives(input.options).filter((o) => allowed(o.action));
      flags.push({
        heard: String(input.heard ?? ''),
        reason: String(input.reason ?? 'Unclear'),
        triadan: typeof input.triadan === 'number' ? input.triadan : undefined,
        options,
      });
      continue;
    }
    const action = { name: block.name, input };
    if (!allowed(action)) {
      skipped.push(action);
      continue;
    }
    actions.push(action);
    // Uncertain per the model, or a value our own checks reject.
    const invalid = invalidReason(action);
    if (input.uncertain === true || invalid) {
      flags.push({
        heard: describeAction(action),
        reason: invalid ?? String(input.reason ?? 'Not sure this was heard right'),
        triadan: typeof input.triadan === 'number' ? input.triadan : undefined,
        applied: action,
        options: parseAlternatives(input.alternatives).filter((o) => allowed(o.action)),
      });
    }
  }
  return { actions, skipped, flags };
}

/**
 * Extract tool calls from a chunk of transcript. The request is built
 * here but SENT through the `ai-autofill` edge function, which holds the
 * Anthropic key server-side, picks the model, and logs usage. Static
 * prompt keeps `cache_control` so Anthropic prompt-caches it. One retry
 * on transient errors.
 */
export async function extractChartActions(
  input: ExtractInput
): Promise<ExtractResult> {
  const requestBody = buildChunkRequest(input);
  if (!requestBody) return { actions: [], skipped: [], flags: [], ran: false };
  markDictationPromptUsed();
  const content = await sendAutofill(requestBody);
  return { ...parseAutofillContent(content, actionAllowedAnywhere), ran: true };
}

/**
 * The end-of-dictation check (see buildReviewRequest). Every change it
 * makes is flagged for review, since it lands after the vet stopped
 * watching the live feed.
 */
export async function reviewFullTranscript(input: ReviewInput): Promise<ExtractResult> {
  const requestBody = buildReviewRequest(input);
  if (!requestBody) return { actions: [], skipped: [], flags: [], ran: false };
  markDictationPromptUsed();
  const content = await sendAutofill(requestBody);
  const result = parseAutofillContent(content, actionAllowedAnywhere);
  return { ...result, flags: markFinalCheck(result), ran: true };
}

/** Every applied action from the final check becomes a review flag. */
export function markFinalCheck(r: Omit<ExtractResult, 'ran'>): ReviewFlag[] {
  const flagged = new Set(r.flags.map((f) => f.applied).filter(Boolean));
  return [
    ...r.flags.map((f) => (f.applied ? { ...f, reason: `Final check: ${f.reason}` } : f)),
    ...r.actions
      .filter((a) => !flagged.has(a))
      .map((a) => ({
        heard: describeAction(a),
        reason: 'Added in the final check — missed live',
        triadan: typeof a.input.triadan === 'number' ? a.input.triadan : undefined,
        applied: a,
        options: [],
      })),
  ];
}

function parseAlternatives(raw: unknown): { label: string; action: AiAction }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((o): o is { label?: unknown; name?: unknown; input?: unknown } => !!o && typeof o === 'object')
    .filter((o) => typeof o.name === 'string' && o.name !== 'flag_unclear' && !!o.input && typeof o.input === 'object')
    .slice(0, 3)
    .map((o) => ({
      label: String(o.label ?? o.name),
      action: { name: String(o.name), input: o.input as Record<string, unknown> },
    }));
}

const FIELD_RANGES: Partial<Record<DentalField, [number, number]>> = {
  mobility: [0, 3], furcation: [0, 3], calculus: [0, 3], gingivitis: [0, 3], pdstate: [0, 4],
  pocket: [0, 15], recession: [0, 15],
};

/** Our own sanity check, independent of the model's confidence: a grid
 *  value outside its scale, or a tooth number the species chart can't
 *  have. Returns why, or null when it looks fine. */
export function invalidReason(action: AiAction): string | null {
  const t = Number(action.input.triadan);
  if (action.input.triadan != null && !(Number.isInteger(t) && t >= 100 && t < 900 && t % 100 >= 1 && t % 100 <= 11)) {
    return `${action.input.triadan} isn't a Triadan tooth number`;
  }
  if (action.name === 'set_tooth_field') {
    const field = String(action.input.field) as DentalField;
    const range = FIELD_RANGES[field];
    if (!range) return null;
    const normalized = normalizeFieldValue(String(action.input.value ?? ''));
    // Pockets may be per root ("M4 D6"): check the depths themselves.
    const nums = field === 'pocket' ? pocketDepths(normalized) : normalized.split(/\s+/).filter(Boolean).map(Number);
    if (nums.some((n) => Number.isNaN(n) || n < range[0] || n > range[1])) {
      return `${field} ${action.input.value} is outside ${range[0]}–${range[1]}`;
    }
  }
  return null;
}

/**
 * Warm the autofill path when dictation starts: boots the edge function
 * and writes the prompt cache (tools + system prompt) with a
 * `max_tokens: 0` request — prefill only, no output billed — so the first
 * real chunk doesn't pay the cold-start + cache-miss latency.
 * Best-effort; failures are ignored.
 */
/** When the dictation prompt was last sent (chunk, final check or
 *  warm-up) — the prompt cache lives 5 minutes from its last use. */
let lastDictationPromptAt = 0;
const CACHE_STILL_WARM_MS = 4 * 60_000;
export function markDictationPromptUsed(at: number = Date.now()): void {
  lastDictationPromptAt = at;
}
/** True when a warm-up would only re-read a cache that's already warm. */
export function dictationCacheWarm(now: number = Date.now()): boolean {
  return now - lastDictationPromptAt < CACHE_STILL_WARM_MS;
}

export async function prewarmAutofill(): Promise<void> {
  if (!supabase) return;
  // Each cold warm-up writes the ~17.5k-token prompt into the cache (the
  // biggest single line on the bill) — skip it while the cache is warm.
  if (dictationCacheWarm()) return;
  markDictationPromptUsed();
  try {
    await supabase.functions.invoke('ai-autofill', {
      body: {
        max_tokens: 0,
        kind: 'warmup',
        system: [
          { type: 'text', text: buildStaticSystemPrompt(), cache_control: { type: 'ephemeral' } },
        ],
        tools,
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Warm-up. No transcript yet.' }] }],
      },
    });
  } catch {
    /* best-effort */
  }
}

// ----- Apply actions to chart state ---------------------------------------

export interface ChartHandlers {
  setPreMark: (triadan: number, mark: 'missing' | 'extracted' | null) => void;
  setPostMark: (triadan: number, mark: 'missing' | 'extracted' | null) => void;
  setToothField: (triadan: number, field: DentalField, value: string) => void;
  addComment: (diagram: 'pre' | 'post', triadan: number | null, text: string) => void;
  /** Remove `text` from that tooth's note (deleting the note if nothing
   *  is left) — used to take back a guess the vet rejected in review. */
  removeComment: (diagram: 'pre' | 'post', triadan: number | null, text: string) => void;
  setExamFinding: (area: keyof ExamFindings, status: ExamFinding, comment?: string) => void;
  setNerveBlock: (site: NerveBlockSite, mL: string) => void;
  /** Add `drug` to the anesthetic list (or update its strength). */
  setAnestheticDrug: (drug: string, concentration?: string) => void;
  setPatientField: (field: keyof PatientInfo, value: string) => void;
  appendTreatmentReport: (text: string) => void;
  /** Optional so older callers (tests, harness) needn't provide it. */
  appendRadiographicFindings?: (text: string) => void;
}

/**
 * Human-readable descriptor for an applied action — surfaced in the live
 * activity log so the vet can spot bad calls in real time and Cmd+Z them.
 */
export function describeAction(action: AiAction): string {
  const { name, input } = action;
  const get = (k: string): string => String(input[k] ?? '');
  switch (name) {
    case 'set_tooth_mark':       return `${get('triadan')} → ${get('mark')}`;
    case 'unset_tooth_mark':     return i18n.t('activity.clearedMark', { ns: 'voice', diagram: get('diagram'), triadan: get('triadan') });
    case 'set_tooth_field':      return `${get('triadan')} ${get('field')} = ${get('value')}`;
    case 'add_comment': {
      const text = get('text').slice(0, 60);
      const triadan = get('triadan');
      if (get('diagram') === 'post') {
        return input.triadan
          ? i18n.t('activity.noteProcedureTooth', { ns: 'voice', triadan, text })
          : i18n.t('activity.noteProcedure', { ns: 'voice', text });
      }
      return input.triadan
        ? i18n.t('activity.noteDiagnosisTooth', { ns: 'voice', triadan, text })
        : i18n.t('activity.noteDiagnosis', { ns: 'voice', text });
    }
    case 'set_exam_finding':     return `${get('area')} ${get('status')}${input.comment ? ` — ${get('comment')}` : ''}`;
    case 'set_nerve_block':      return i18n.t('activity.block', { ns: 'voice', site: get('site'), mL: get('mL') });
    case 'set_anesthetic_drug':  return input.concentration
      ? i18n.t('activity.anestheticConcentration', { ns: 'voice', concentration: get('concentration'), drug: get('drug') })
      : i18n.t('activity.anesthetic', { ns: 'voice', drug: get('drug') });
    case 'set_patient_field':    return `${get('field')} = ${get('value')}`;
    case 'append_treatment_report': return i18n.t('activity.report', { ns: 'voice', text: get('text').slice(0, 60) });
    case 'append_radiographic_findings': return i18n.t('activity.radiographic', { ns: 'voice', text: get('text').slice(0, 60) });
    default:                     return name;
  }
}

export function applyAiActions(actions: AiAction[], h: ChartHandlers): AiAction[] {
  const applied: AiAction[] = [];
  for (const action of actions) {
    try {
      if (applyOne(action, h)) applied.push(action);
    } catch (err) {
      console.warn(`[aiAutofill] could not apply ${action.name}:`, err, action.input);
    }
  }
  return applied;
}

// Triadan numbering: quadrants 1–4 (permanent) + 5–8 (deciduous), tooth
// 01–11 → 100–899. The model can hallucinate a non-numeric or out-of-range
// id (e.g. "104a"); guard so a NaN/garbage triadan never reaches the chart.
function validTriadan(v: number): boolean {
  return Number.isInteger(v) && v >= 100 && v <= 899;
}

const DENTAL_FIELD_SET = new Set<DentalField>([
  'mobility', 'recession', 'pocket', 'furcation',
  'hyperplasia', 'calculus', 'gingivitis', 'pdstate',
]);

/** Grid cells hold bare numbers. Strip a letter prefix or unit the model
 *  may still add ("G2" → "2", "PD3" → "3", "5mm" → "5"). Free text that
 *  isn't a prefixed number is left alone. */
export function normalizeFieldValue(value: string): string {
  return value
    .trim()
    .replace(/^(?:GI|G|C|calc(?:ulus)?|M|mob(?:ility)?|F|furc(?:ation)?|PD|stage|grade|class)\s*[-:]?\s*(?=\d)/i, '')
    .replace(/\s*(?:mm|millimet(?:er|re)s?)\.?$/i, '')
    .trim();
}

/**
 * True when applying `action` wouldn't change the chart: the value is
 * already there, the mark already set, the note already on that tooth.
 * The model sees recent transcript as context and sometimes re-emits a
 * finding it already charted; filtering these keeps the activity log to
 * real changes (and avoids touching state, undo history, autosave).
 */
export function isNoopAction(action: AiAction, c: ChartContext): boolean {
  const { name, input } = action;
  const str = (k: string) => String(input[k] ?? '').trim();
  const t = Number(input.triadan);
  const post = input.diagram === 'post';
  switch (name) {
    case 'set_tooth_field': {
      const tooth = c.toothData.find((x) => x.triadan === t);
      const cur = tooth ? String(tooth[str('field') as DentalField] ?? '').trim() : '';
      return !!tooth && cur === normalizeFieldValue(str('value'));
    }
    case 'set_tooth_mark':
      return (post ? c.postMarks : c.preMarks)[t] === str('mark');
    case 'unset_tooth_mark':
      return !(post ? c.postMarks : c.preMarks)[t];
    case 'add_comment': {
      const text = codeOnlyComment(str('text')).toUpperCase();
      const anchor = input.triadan != null ? t : null;
      return (post ? c.postComments : c.preComments).some(
        (x) => (x.anchorTriadan ?? null) === anchor && x.text.toUpperCase().includes(text)
      );
    }
    case 'set_exam_finding': {
      const cur = c.patientInfo.exam?.[str('area') as keyof ExamFindings];
      return !!cur && cur.status === str('status') && (!str('comment') || cur.comment === str('comment'));
    }
    case 'set_nerve_block':
      return String(c.patientInfo.nerveBlocks?.[str('site') as NerveBlockSite] ?? '') === str('mL');
    case 'set_anesthetic_drug': {
      const want = str('drug').trim().toLowerCase();
      const conc = str('concentration').replace(/%/g, '').trim();
      return (c.patientInfo.nerveBlocks?.drugs ?? []).some(
        (d) => d.name.trim().toLowerCase() === want && (!conc || d.concentration.trim() === conc)
      );
    }
    case 'set_patient_field':
      return String(c.patientInfo[str('field') as keyof PatientInfo] ?? '').trim() === str('value');
    case 'append_treatment_report':
      return (c.patientInfo.treatmentReport ?? '').includes(str('text'));
    case 'append_radiographic_findings':
      return (c.patientInfo.radiographicFindings ?? '').includes(str('text'));
    default:
      return false;
  }
}

/** Drop no-op actions and exact repeats within one reply. */
export function dedupeActions(actions: AiAction[], c: ChartContext): AiAction[] {
  const seen = new Set<string>();
  return actions.filter((a) => {
    const key = `${a.name}:${JSON.stringify(a.input)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return !isNoopAction(a, c);
  });
}

const KNOWN_CODES = new Set(DENTAL_CODES.map((c) => c.code.toUpperCase()));

/** Diagram notes should read as the AVDC code alone. If the model still
 *  writes "Fracture (T/FX)" or "T/FX — tooth fracture", keep just the
 *  code; anything else is left as written. */
export function codeOnlyComment(text: string): string {
  const t = text.trim().replace(/\.$/, '');
  const paren = t.match(/^[^()]*\(\s*([A-Za-z][A-Za-z0-9/]*)\s*\)$/);
  if (paren && KNOWN_CODES.has(paren[1].toUpperCase())) return paren[1].toUpperCase();
  const lead = t.match(/^([A-Za-z][A-Za-z0-9/]*)\s*[-–—:]\s+.+$/);
  if (lead && KNOWN_CODES.has(lead[1].toUpperCase())) return lead[1].toUpperCase();
  return text.trim();
}

// Whitelists mirroring the tool schemas: a hallucinated key must never
// reach chart state (e.g. field "exam" would replace an object with a
// string and corrupt the saved chart).
const EXAM_AREAS = new Set(['extraoral', 'lymph', 'buccal', 'tongue', 'palate', 'pharynx']);
const NERVE_SITES = new Set([
  'infraorbitalRight', 'infraorbitalLeft', 'caudalMaxillaryRight', 'caudalMaxillaryLeft',
  'inferiorAlveolarRight', 'inferiorAlveolarLeft',
  'mentalRight', 'mentalLeft', 'other',
]);
const PATIENT_FIELDS = new Set(['patientName', 'patientNumber', 'doctor', 'tech', 'complaint']);

function applyOne(action: AiAction, h: ChartHandlers): boolean {
  const { name, input } = action;
  const s = (k: string): string => String(input[k] ?? '');
  const n = (k: string): number => Number(input[k]);

  switch (name) {
    case 'set_tooth_mark': {
      const diagram = s('diagram');
      const triadan = n('triadan');
      const mark = s('mark');
      if (!validTriadan(triadan)) return false;
      if (mark !== 'missing' && mark !== 'extracted') return false;
      if (diagram === 'pre') h.setPreMark(triadan, mark);
      else h.setPostMark(triadan, mark);
      return true;
    }
    case 'unset_tooth_mark': {
      const diagram = s('diagram');
      const triadan = n('triadan');
      if (!validTriadan(triadan)) return false;
      if (diagram === 'pre') h.setPreMark(triadan, null);
      else h.setPostMark(triadan, null);
      return true;
    }
    case 'set_tooth_field': {
      const triadan = n('triadan');
      const field = s('field') as DentalField;
      if (!validTriadan(triadan) || !DENTAL_FIELD_SET.has(field)) return false;
      h.setToothField(triadan, field, normalizeFieldValue(s('value')));
      return true;
    }
    case 'add_comment': {
      const diagram = s('diagram') === 'post' ? 'post' : 'pre';
      // Keep the note even if the anchor tooth is bogus — fall back to an
      // unanchored comment rather than dropping the text entirely.
      const triadan =
        input.triadan != null && validTriadan(n('triadan')) ? n('triadan') : null;
      h.addComment(diagram, triadan, codeOnlyComment(s('text')));
      return true;
    }
    case 'set_exam_finding': {
      if (!EXAM_AREAS.has(s('area')) || !['normal', 'abnormal'].includes(s('status'))) return false;
      h.setExamFinding(
        s('area') as keyof ExamFindings,
        s('status') as ExamFinding,
        s('comment') || undefined
      );
      return true;
    }
    case 'set_nerve_block': {
      if (!NERVE_SITES.has(s('site'))) return false;
      h.setNerveBlock(s('site') as NerveBlockSite, s('mL'));
      return true;
    }
    case 'set_anesthetic_drug': {
      if (!s('drug').trim()) return false;
      h.setAnestheticDrug(s('drug').trim(), s('concentration').replace(/%/g, '').trim() || undefined);
      return true;
    }
    case 'set_patient_field': {
      if (!PATIENT_FIELDS.has(s('field'))) return false;
      h.setPatientField(s('field') as keyof PatientInfo, s('value'));
      return true;
    }
    case 'append_treatment_report': {
      h.appendTreatmentReport(s('text'));
      return true;
    }
    case 'append_radiographic_findings': {
      if (!h.appendRadiographicFindings) return false;
      h.appendRadiographicFindings(s('text'));
      return true;
    }
    default:
      console.warn(`[aiAutofill] unknown tool: ${name}`);
      return false;
  }
}
