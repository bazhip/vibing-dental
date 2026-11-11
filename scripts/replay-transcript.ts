/**
 * Replay a dictation transcript through the app's exact voice-autofill
 * pipeline and show where it loses information.
 *
 *   npm run replay -- <transcript.txt> [--offline] [--model claude-opus-5-5] [--section charting]
 *
 * Input: the "Download transcript" file from the voice panel, or any text
 * file with one utterance per line (a single paragraph is split into
 * sentences). Each line is treated as one live chunk — the app chunks on
 * pauses, so this is an approximation of the live path.
 *
 * Stages reported:
 *   1. per chunk: whether the filter sends it, and what the regex cleanup changed
 *   2. LIVE: chunk-by-chunk extraction on a simulated chart (what the app does while recording)
 *   3. FINAL CHECK: the end-of-dictation pass over that chart
 *   4. ONE SHOT: the whole transcript on a blank chart (roughly what pasting it to Claude gets)
 * and diffs the charts from 2+3 against 4.
 *
 * --offline runs stage 1 only (no API calls, no cost). Otherwise it calls
 * the Anthropic API directly with your credentials (ANTHROPIC_API_KEY or an
 * `ant auth login` profile) — one call per chunk plus two full-transcript
 * calls. Model settings mirror supabase/functions/ai-autofill — keep in sync.
 */
import fs from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import {
  normalizeTranscript,
  chunkWorthSending,
  buildChunkRequest,
  buildReviewRequest,
  parseAutofillContent,
  actionAllowedInSection,
  applyAiActions,
  dedupeActions,
  describeAction,
  summarizeChart,
  AutofillRequest,
  AiAction,
  ChartContext,
  ChartHandlers,
  ReviewFlag,
} from '../src/utils/aiAutofill';
import { EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS, DentalField, PatientInfo } from '../src/types';

// ---- args ----------------------------------------------------------------
const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const offline = args.includes('--offline');
if (offline) args.splice(args.indexOf('--offline'), 1);
const model = flag('--model') ?? 'claude-opus-5-5';
const section = flag('--section');
const file = args[0];
if (!file) {
  console.error('usage: npm run replay -- <transcript.txt> [--offline] [--model id] [--section charting]');
  process.exit(1);
}

// ---- transcript ----------------------------------------------------------
function readUtterances(path: string): string[] {
  const text = fs.readFileSync(path, 'utf8');
  // The panel's download appends an activity log — not part of the speech.
  const body = text.split(/\n\s*Activity\s*\n/)[0];
  const lines = body
    .split('\n')
    .filter((l) => !/^Transcript — /.test(l) && !/^─+$/.test(l.trim()))
    .map((l) => l.replace(/^\[\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AP]M)?\]\s*/i, '').trim())
    .filter(Boolean);
  if (lines.length === 1) return lines[0].split(/(?<=[.?!])\s+/).filter(Boolean);
  return lines;
}
const utterances = readUtterances(file);

// ---- simulated chart -----------------------------------------------------
function blankChart(): ChartContext {
  return {
    patientInfo: {
      patientName: '', patientNumber: '', ownerName: '', ownerPhone: '', ownerEmail: '',
      doctor: '', tech: '', date: '', complaint: '', treatmentReport: '', recallDate: '',
      nerveBlocks: { ...EMPTY_NERVE_BLOCKS, drugs: [] },
      exam: JSON.parse(JSON.stringify(EMPTY_EXAM_FINDINGS)),
    },
    species: 'canine', logo: 'socal', toothData: [],
    preMarks: {}, preComments: [], postMarks: {}, postComments: [],
  };
}

function handlersFor(c: ChartContext): ChartHandlers {
  const note = (diagram: 'pre' | 'post', t: number | null) =>
    (diagram === 'pre' ? c.preComments : c.postComments).find((n) => n.anchorTriadan === t);
  return {
    setPreMark: (t, m) => { if (m) c.preMarks[t] = m; else delete c.preMarks[t]; },
    setPostMark: (t, m) => { if (m) c.postMarks[t] = m; else delete c.postMarks[t]; },
    setToothField: (t, field: DentalField, value) => {
      let tooth = c.toothData.find((x) => x.triadan === t);
      if (!tooth) { tooth = { tooth: String(t), triadan: t }; c.toothData.push(tooth); }
      tooth[field] = value;
    },
    addComment: (diagram, t, text) => {
      const existing = note(diagram, t);
      if (existing) existing.text = `${existing.text}, ${text}`;
      else (diagram === 'pre' ? c.preComments : c.postComments).push({ id: String(Math.random()), text, anchorTriadan: t });
    },
    removeComment: () => {},
    setExamFinding: (area, status, comment) => { c.patientInfo.exam[area] = { status, comment: comment ?? '' }; },
    setNerveBlock: (site, mL) => { c.patientInfo.nerveBlocks[site] = mL; },
    setAnestheticDrug: (drug, concentration) => {
      const d = c.patientInfo.nerveBlocks.drugs.find((x) => x.name.toLowerCase() === drug.toLowerCase());
      if (d) d.concentration = concentration ?? d.concentration;
      else c.patientInfo.nerveBlocks.drugs.push({ name: drug, concentration: concentration ?? '' });
    },
    setPatientField: (field: keyof PatientInfo, value) => { (c.patientInfo as unknown as Record<string, string>)[field] = value; },
    appendTreatmentReport: (text) => {
      c.patientInfo.treatmentReport = [c.patientInfo.treatmentReport, text].filter(Boolean).join('\n');
    },
  };
}

// ---- API (mirrors the edge function) -------------------------------------
const LIVE: Record<string, Record<string, unknown>> = {
  'claude-opus-5-5': { output_config: { effort: 'low' } },
  'claude-sonnet-5-5': { thinking: { type: 'between_tools' } },
  'claude-haiku-5-5': { output_config: { effort: 'low' } },
  'claude-opus-4-8': {},
};
const REVIEW: Record<string, Record<string, unknown>> = {
  'claude-opus-5-5': { output_config: { effort: 'medium' } },
  'claude-sonnet-5-5': { output_config: { effort: 'medium' } },
  'claude-haiku-5-5': { output_config: { effort: 'medium' } },
  'claude-opus-4-8': { thinking: { type: 'adaptive' }, output_config: { effort: 'medium' } },
};
const usage = { calls: 0, input: 0, cacheRead: 0, output: 0 };

async function call(client: Anthropic, req: AutofillRequest) {
  const review = req.mode === 'review';
  const { mode: _mode, ...body } = req;
  const res = await client.messages.create({
    ...body,
    model,
    max_tokens: review ? 16_000 : 4096,
    ...(review ? REVIEW[model] : LIVE[model]),
  } as unknown as Anthropic.MessageCreateParamsNonStreaming);
  usage.calls++;
  usage.input += (res.usage.input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0);
  usage.cacheRead += res.usage.cache_read_input_tokens ?? 0;
  usage.output += res.usage.output_tokens ?? 0;
  if (res.stop_reason === 'max_tokens') console.log('   ⚠ hit max_tokens — output truncated');
  if (res.stop_reason === 'refusal') console.log('   ⚠ refused');
  return res.content as Array<{ type: string; name?: string; input?: unknown }>;
}

// ---- report --------------------------------------------------------------
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const fmtFlags = (flags: ReviewFlag[]) =>
  flags.map((f) => `   ? ${f.applied ? 'applied, flagged' : 'question'}: ${f.heard} — ${f.reason}`).join('\n');

function chartLines(c: ChartContext): Set<string> {
  // One finding per line so two charts diff cleanly.
  const out = new Set<string>();
  for (const t of c.toothData) {
    for (const [k, v] of Object.entries(t)) if (k !== 'tooth' && k !== 'triadan' && v) out.add(`${t.triadan} ${k}=${v}`);
  }
  for (const [t, m] of Object.entries(c.preMarks)) out.add(`pre ${t} ${m}`);
  for (const [t, m] of Object.entries(c.postMarks)) out.add(`post ${t} ${m}`);
  for (const n of c.preComments) for (const p of n.text.split(/,\s*/)) out.add(`pre note ${n.anchorTriadan ?? '-'}: ${p}`);
  for (const n of c.postComments) for (const p of n.text.split(/,\s*/)) out.add(`post note ${n.anchorTriadan ?? '-'}: ${p}`);
  for (const [a, v] of Object.entries(c.patientInfo.exam)) if (v.status) out.add(`exam ${a}=${v.status}${v.comment ? ` (${v.comment})` : ''}`);
  const nb = c.patientInfo.nerveBlocks;
  for (const [k, v] of Object.entries(nb)) if (k !== 'drugs' && v) out.add(`block ${k}=${v}`);
  for (const d of nb.drugs) out.add(`drug ${d.name} ${d.concentration}`.trim());
  for (const f of ['patientName', 'patientNumber', 'doctor', 'tech', 'complaint'] as const) {
    if (c.patientInfo[f]) out.add(`${f}=${c.patientInfo[f]}`);
  }
  if (c.patientInfo.treatmentReport) out.add('treatment report: (present)');
  return out;
}

async function main() {
  console.log(bold(`\n1. FILTER + CLEANUP — ${utterances.length} chunks\n`));
  let dropped = 0;
  let changed = 0;
  for (const u of utterances) {
    const sent = chunkWorthSending(u);
    const cleaned = normalizeTranscript(u);
    const diff = cleaned !== u.replace(/\s+/g, ' ').trim();
    if (!sent) dropped++;
    if (diff) changed++;
    console.log(`${sent ? '  →' : dim('  ✗ skipped')} ${u}`);
    if (diff) console.log(dim(`      cleaned: ${cleaned}`));
  }
  console.log(`\n  ${dropped} skipped as filler, ${changed} rewritten by cleanup.`);
  if (offline) return;

  const client = new Anthropic();
  const live = blankChart();
  const liveHandlers = handlersFor(live);

  console.log(bold(`\n2. LIVE — chunk by chunk on ${model}${section ? `, section ${section}` : ''}\n`));
  for (let i = 0; i < utterances.length; i++) {
    const req = buildChunkRequest({
      delta: utterances[i],
      recentContext: utterances.slice(Math.max(0, i - 8), i).join(' '),
      context: live,
      section,
    });
    if (!req) continue;
    const r = parseAutofillContent(await call(client, req), (a) => actionAllowedInSection(a, section));
    const applied = applyAiActions(dedupeActions(r.actions, live), liveHandlers);
    console.log(`  ${utterances[i]}`);
    for (const a of applied) console.log(`   + ${describeAction(a)}`);
    for (const a of r.skipped) console.log(dim(`   - other page: ${describeAction(a)}`));
    if (r.flags.length) console.log(fmtFlags(r.flags));
  }

  console.log(bold('\n3. FINAL CHECK — whole transcript vs. the live chart\n'));
  const transcript = utterances.join('\n');
  const finalReq = buildReviewRequest({ transcript, context: live, rejected: [] });
  if (finalReq) {
    const r = parseAutofillContent(await call(client, finalReq), (a) => actionAllowedInSection(a, section));
    const applied = applyAiActions(dedupeActions(r.actions, live), liveHandlers);
    if (!applied.length && !r.flags.length) console.log('  nothing missed');
    for (const a of applied) console.log(`   + ${describeAction(a)}`);
    if (r.flags.length) console.log(fmtFlags(r.flags));
  }

  console.log(bold('\n4. ONE SHOT — whole transcript on a blank chart\n'));
  const oneShot = blankChart();
  const oneReq = buildReviewRequest({ transcript, context: oneShot, rejected: [] });
  let oneShotActions: AiAction[] = [];
  if (oneReq) {
    const r = parseAutofillContent(await call(client, oneReq), (a) => actionAllowedInSection(a, section));
    oneShotActions = applyAiActions(dedupeActions(r.actions, oneShot), handlersFor(oneShot));
    for (const a of oneShotActions) console.log(`   + ${describeAction(a)}`);
    if (r.flags.length) console.log(fmtFlags(r.flags));
  }

  console.log(bold('\nCOMPARE — app (live + final check) vs. one shot\n'));
  const app = chartLines(live);
  const one = chartLines(oneShot);
  const onlyOne = [...one].filter((l) => !app.has(l));
  const onlyApp = [...app].filter((l) => !one.has(l));
  if (!onlyOne.length && !onlyApp.length) console.log('  identical');
  for (const l of onlyOne) console.log(`  only one-shot: ${l}`);
  for (const l of onlyApp) console.log(`  only app:      ${l}`);

  console.log(dim(`\nFinal app chart:\n${summarizeChart(live)}`));
  console.log(dim(`\n${usage.calls} calls · ${usage.input} input · ${usage.cacheRead} cache-read · ${usage.output} output tokens`));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
