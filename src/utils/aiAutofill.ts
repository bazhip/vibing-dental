import type Anthropic from '@anthropic-ai/sdk';
import { supabase } from './supabaseClient';
import { DENTAL_CODES } from '../constants/dentalCodes';
import {
  PatientInfo,
  Species,
  Logo,
  ToothData,
  ToothMarks,
  DiagramComment,
  NerveBlocks,
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

const tools: Anthropic.Messages.Tool[] = [
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
      'Set a periodontal measurement on a tooth in the data grid. Examples: mobility "M2", recession "3mm", pocket "4 5 4", furcation "F2", calculus "C1", gingivitis "G1", pdstate "PD2".',
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
      'Add a free-form note on the diagram, optionally anchored to a tooth. Use this for findings that don\'t fit the structured fields (e.g. "fractured slab", "draining tract", "biopsy taken").',
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
    description: 'Set the anesthetic drug name used for the nerve blocks (e.g. "Bupivacaine", "Ropivacaine").',
    input_schema: {
      type: 'object',
      properties: { drug: { type: 'string' } },
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
];

// ----- Static (cacheable) system prompt + few-shot examples ----------------

const FEW_SHOT_EXAMPLES = `EXAMPLES of vet phrasing → tool calls. Match these patterns.

[EX 1] "104 mobility class two, calculus stage one"
→ set_tooth_field(triadan=104, field=mobility, value=M2)
→ set_tooth_field(triadan=104, field=calculus, value=C1)

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

[EX 10] "401 has a fractured slab, took a biopsy"
→ add_comment(diagram=pre, triadan=401, text="Fractured slab; biopsy taken.")

[EX 11] "completed full mouth cleaning, polish, all four quadrants"
→ append_treatment_report(text="Completed full mouth cleaning with polish, all four quadrants.")

[EX 12] "108 stage three periodontal disease, four millimeter pocket distally"
→ set_tooth_field(triadan=108, field=pdstate, value=PD3)
→ set_tooth_field(triadan=108, field=pocket, value=4)

[EX 13] "patient looks great" / "doing well today" / "hand me the scaler"
→ NO TOOL CALL — small talk / instructions to staff / vague.

[EX 14] "this canine looks pretty bad" (no Triadan number stated)
→ NO TOOL CALL — don't guess teeth. Skip and let the vet name it.

[EX 15] "AB on 304" (AB = abrasion)
→ add_comment(diagram=pre, triadan=304, text="Abrasion (AB)")

[EX 16] "I want to redo what I said about 209, that's actually fine"
→ unset_tooth_mark(diagram=post, triadan=209)
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
    '5. Numbers in the transcript may be lightly garbled by speech-to-text. "One oh four" / "1 oh 4" / "1-0-4" all mean 104. Common shorthand spacings ("P D 2", "M 2", "C 1") collapse to PD2, M2, C1.',
    '6. When the vet says they "redid" or "corrected" a previous statement, use unset_tooth_mark or update via setter accordingly.',
    '7. SPEAKER LABELS: Some chunks include speaker labels like "Speaker 0:" or "Speaker 1:" — these come from a diarizing transcription model. Treat the speaker who states medical findings as the vet. Treat other speakers as the tech/assistant; their statements are CONTEXT, not findings, unless they\'re reading back numbers the vet asked for. Don\'t emit tool calls for the tech\'s acknowledgements ("got it", "suctioning now") or tooth callouts directed at the vet. If only one speaker label appears, treat them as the vet.',
    '',
    'FIELD SEMANTICS:',
    '- "pre" diagram = Diagnosis (findings observed at exam, before procedure). Teeth already missing, periodontal disease grades, fractures.',
    '- "post" diagram = Procedure (work performed today). Teeth extracted during this visit.',
    '- mobility/recession/pocket/furcation/hyperplasia/calculus/gingivitis/pdstate go into the per-tooth grid using shorthand codes where natural (M2, C1, F2, PD3, etc.).',
    '- add_comment for findings that don\'t fit a structured field (biopsy, draining tract, photo taken, fracture details).',
    '- append_treatment_report for narrative description of WORK DONE (scaling, polish, suturing, extractions performed).',
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

export function normalizeTranscript(raw: string): string {
  let text = raw;

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
// Avoid burning tokens on chunks that are obviously not findings (small
// talk, silence). Cheap regex check — if no Triadan-shaped number AND no
// medical keyword AND no obvious instruction, skip.

const MEDICAL_KEYWORDS = [
  'normal', 'abnormal', 'mobility', 'recession', 'pocket', 'furcation',
  'calculus', 'gingivitis', 'periodontal', 'extract', 'extracted', 'missing',
  'fracture', 'biopsy', 'lesion', 'mass', 'tongue', 'palate', 'pharynx',
  'lymph', 'buccal', 'extraoral', 'block', 'mL', 'bupivacaine', 'ropivacaine',
  'lidocaine', 'mepivacaine', 'cleaning', 'polish', 'scaling', 'suturing',
  'tooth', 'teeth', 'canine', 'incisor', 'molar', 'premolar', 'carnassial',
  'PD', 'P D', 'class', 'stage', 'mm',
];

// Allow trailing digit so "PD3", "M2", "C1" still match when their root
// is in the keyword list — without requiring every numeric variant to
// be explicitly listed.
const KEYWORD_RE = new RegExp(
  `\\b(${MEDICAL_KEYWORDS.join('|')})(?=\\d|\\W|$)`,
  'i'
);
const TRIADAN_RE = /\b[1-4][0-1][0-9]\b/;

export function chunkLooksMedical(chunk: string): boolean {
  if (chunk.length < 8) return false;
  return KEYWORD_RE.test(chunk) || TRIADAN_RE.test(chunk);
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

function summarizeChart(c: ChartContext): string {
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
  const blocks = Object.entries(c.patientInfo.nerveBlocks).filter(([, v]) => v);
  if (blocks.length) {
    lines.push(`nerveBlocks: ${blocks.map(([k, v]) => `${k}=${v}`).join(' ')}`);
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

// ----- Caller --------------------------------------------------------------

export interface AiAction {
  name: string;
  input: Record<string, unknown>;
}

export interface ExtractInput {
  /** New transcript text since the last extraction. */
  delta: string;
  /** Recent transcript context (last ~60s) for resolving "this one" references.
   *  Empty string is fine on the first chunk. */
  recentContext: string;
  context: ChartContext;
}

export interface ExtractResult {
  actions: AiAction[];
  /** True if the extractor ran (vs. skipped because the chunk had no
   *  medical content). */
  ran: boolean;
}

/**
 * Extract tool calls from a chunk of transcript. The request is built
 * here but SENT through the `ai-autofill` edge function, which holds the
 * Anthropic key server-side, enforces the Pro plan, picks the model, and
 * logs usage. Static prompt keeps `cache_control` so Anthropic prompt-
 * caches it. One retry on transient errors.
 */
export async function extractChartActions(
  input: ExtractInput
): Promise<ExtractResult> {
  const { delta, recentContext, context } = input;
  const normalizedDelta = normalizeTranscript(delta);
  if (!chunkLooksMedical(normalizedDelta)) {
    return { actions: [], ran: false };
  }
  if (!supabase) throw new Error('Cloud is not configured.');
  const normalizedContext = recentContext ? normalizeTranscript(recentContext) : '';

  const userText =
    `Current chart state:\n${summarizeChart(context)}\n\n` +
    (normalizedContext
      ? `Recent transcript context (already considered in previous chunks; here for resolving back-references):\n${normalizedContext}\n\n`
      : '') +
    `New transcript chunk to extract from:\n${normalizedDelta}\n\n` +
    `Emit tool calls only for new information from this chunk. If nothing in this chunk warrants a chart change, return no tool calls.`;

  const requestBody = {
    max_tokens: 1024,
    system: [
      { type: 'text', text: buildStaticSystemPrompt(), cache_control: { type: 'ephemeral' } },
    ],
    tools,
    messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
  };

  const send = async (): Promise<Array<Anthropic.ContentBlock>> => {
    const { data, error } = await supabase!.functions.invoke('ai-autofill', { body: requestBody });
    if (error) {
      let msg = error.message;
      try {
        const detail = await (error as { context?: Response }).context?.json();
        if (detail?.error) msg = detail.error;
      } catch { /* keep msg */ }
      throw new Error(msg);
    }
    if (data && (data as { error?: string }).error) throw new Error((data as { error: string }).error);
    return ((data as { content?: Array<Anthropic.ContentBlock> })?.content) ?? [];
  };

  let content: Array<Anthropic.ContentBlock>;
  try {
    content = await send();
  } catch (err) {
    const retryable =
      err instanceof Error && /rate|timeout|network|503|502|429/i.test(err.message);
    if (!retryable) throw err;
    await new Promise((r) => setTimeout(r, 800));
    content = await send();
  }

  const actions: AiAction[] = [];
  for (const block of content) {
    if (block.type === 'tool_use') {
      actions.push({ name: block.name, input: block.input as Record<string, unknown> });
    }
  }
  return { actions, ran: true };
}

// ----- Apply actions to chart state ---------------------------------------

export interface ChartHandlers {
  setPreMark: (triadan: number, mark: 'missing' | 'extracted' | null) => void;
  setPostMark: (triadan: number, mark: 'missing' | 'extracted' | null) => void;
  setToothField: (triadan: number, field: DentalField, value: string) => void;
  addComment: (diagram: 'pre' | 'post', triadan: number | null, text: string) => void;
  setExamFinding: (area: keyof ExamFindings, status: ExamFinding, comment?: string) => void;
  setNerveBlock: (site: keyof NerveBlocks, mL: string) => void;
  setAnestheticDrug: (drug: string) => void;
  setPatientField: (field: keyof PatientInfo, value: string) => void;
  appendTreatmentReport: (text: string) => void;
}

/**
 * Human-readable descriptor for an applied action — surfaced in the live
 * activity log so the vet can spot bad calls in real time and Cmd+Z them.
 */
export function describeAction(action: AiAction): string {
  const { name, input } = action;
  const get = (k: string): string => String(input[k] ?? '');
  switch (name) {
    case 'set_tooth_mark':       return `${get('diagram')}.${get('triadan')} → ${get('mark')}`;
    case 'unset_tooth_mark':     return `cleared ${get('diagram')}.${get('triadan')}`;
    case 'set_tooth_field':      return `${get('triadan')} ${get('field')} = ${get('value')}`;
    case 'add_comment':          return `comment ${input.triadan ? `@${get('triadan')}` : ''} (${get('diagram')}): "${get('text').slice(0, 60)}"`;
    case 'set_exam_finding':     return `${get('area')} ${get('status')}${input.comment ? ` — ${get('comment')}` : ''}`;
    case 'set_nerve_block':      return `block ${get('site')} = ${get('mL')} mL`;
    case 'set_anesthetic_drug':  return `anesthetic = ${get('drug')}`;
    case 'set_patient_field':    return `${get('field')} = ${get('value')}`;
    case 'append_treatment_report': return `report += "${get('text').slice(0, 60)}…"`;
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
      h.setToothField(triadan, field, s('value'));
      return true;
    }
    case 'add_comment': {
      const diagram = s('diagram') === 'post' ? 'post' : 'pre';
      // Keep the note even if the anchor tooth is bogus — fall back to an
      // unanchored comment rather than dropping the text entirely.
      const triadan =
        input.triadan != null && validTriadan(n('triadan')) ? n('triadan') : null;
      h.addComment(diagram, triadan, s('text'));
      return true;
    }
    case 'set_exam_finding': {
      h.setExamFinding(
        s('area') as keyof ExamFindings,
        s('status') as ExamFinding,
        s('comment') || undefined
      );
      return true;
    }
    case 'set_nerve_block': {
      h.setNerveBlock(s('site') as keyof NerveBlocks, s('mL'));
      return true;
    }
    case 'set_anesthetic_drug': {
      h.setAnestheticDrug(s('drug'));
      return true;
    }
    case 'set_patient_field': {
      h.setPatientField(s('field') as keyof PatientInfo, s('value'));
      return true;
    }
    case 'append_treatment_report': {
      h.appendTreatmentReport(s('text'));
      return true;
    }
    default:
      console.warn(`[aiAutofill] unknown tool: ${name}`);
      return false;
  }
}
