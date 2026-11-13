/**
 * Voice evaluation helpers shared by scripts/replay-transcript.ts and the
 * fixture tests: reading a transcript file, turning a simulated chart into
 * actions, and scoring actual actions against a fixture's expected ones.
 */
import fs from 'node:fs';
import path from 'node:path';
import { codeOnlyComment, normalizeFieldValue, type AiAction, type ChartContext } from '../../src/utils/aiAutofill';
import type { AppLanguage } from '../../src/i18n/config';

export const VOICE_LANGS: AppLanguage[] = ['en', 'fr', 'de', 'it', 'es'];
/** Relative to the repo root (npm scripts and vitest run from there). */
export const FIXTURE_DIR = path.resolve('scripts/fixtures/voice');

/** One transcript line in a fixture's expected.json. */
export interface ExpectedLine {
  /** The utterance as in transcript.txt (timestamp stripped). */
  heard: string;
  /** What normalizeTranscript(heard, lng) returns. */
  cleaned: string;
  /** True when the line carries a chartable finding (so the filter must send it). */
  finding: boolean;
}

export interface VoiceFixture {
  lng: AppLanguage;
  lines: ExpectedLine[];
  /** The target chart after the final check, as actions. */
  actions: AiAction[];
}

export const fixtureTranscriptPath = (lng: AppLanguage) => path.join(FIXTURE_DIR, lng, 'transcript.txt');
export const fixtureExpectedPath = (lng: AppLanguage) => path.join(FIXTURE_DIR, lng, 'expected.json');

export function loadFixture(lng: AppLanguage): VoiceFixture {
  return JSON.parse(fs.readFileSync(fixtureExpectedPath(lng), 'utf8')) as VoiceFixture;
}

/** Utterances of a transcript file: the voice panel's "Download transcript"
 *  file, or plain text with one utterance per line (a single paragraph is
 *  split into sentences). */
export function readUtterances(text: string): string[] {
  // The panel's download appends an activity log — not part of the speech.
  const body = text.split(/\n\s*Activity\s*\n/)[0];
  const lines = body
    .split('\n')
    // The header line is localized ("Transcript — …", "Transkript — …") and dated.
    .filter((l) => !/^\S+ — .*\d{4}/.test(l) && !/^─+$/.test(l.trim()))
    .map((l) => l.replace(/^\[\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AP]M)?\]\s*/i, '').trim())
    .filter(Boolean);
  if (lines.length === 1) return lines[0].split(/(?<=[.?!])\s+/).filter(Boolean);
  return lines;
}

/** The simulated chart as one action per finding, so it can be scored
 *  against a fixture: corrections are already resolved in the chart. */
export function chartToActions(c: ChartContext): AiAction[] {
  const out: AiAction[] = [];
  for (const t of c.toothData) {
    for (const [field, value] of Object.entries(t)) {
      if (field === 'tooth' || field === 'triadan' || !value) continue;
      out.push({ name: 'set_tooth_field', input: { triadan: t.triadan, field, value: String(value) } });
    }
  }
  for (const [diagram, marks] of [['pre', c.preMarks], ['post', c.postMarks]] as const) {
    for (const [t, mark] of Object.entries(marks)) {
      if (mark) out.push({ name: 'set_tooth_mark', input: { diagram, triadan: Number(t), mark } });
    }
  }
  for (const [diagram, notes] of [['pre', c.preComments], ['post', c.postComments]] as const) {
    for (const n of notes) {
      for (const text of n.text.split(/,\s*/).filter(Boolean)) {
        out.push({ name: 'add_comment', input: { diagram, ...(n.anchorTriadan != null ? { triadan: n.anchorTriadan } : {}), text } });
      }
    }
  }
  for (const [area, v] of Object.entries(c.patientInfo.exam ?? {})) {
    if (v?.status) out.push({ name: 'set_exam_finding', input: { area, status: v.status, ...(v.comment ? { comment: v.comment } : {}) } });
  }
  const nb = c.patientInfo.nerveBlocks;
  for (const [site, mL] of Object.entries(nb ?? {})) {
    if (site !== 'drugs' && mL) out.push({ name: 'set_nerve_block', input: { site, mL: String(mL) } });
  }
  for (const d of nb?.drugs ?? []) {
    out.push({ name: 'set_anesthetic_drug', input: { drug: d.name, ...(d.concentration ? { concentration: d.concentration } : {}) } });
  }
  for (const field of ['patientName', 'patientNumber', 'doctor', 'tech', 'complaint'] as const) {
    if (c.patientInfo[field]) out.push({ name: 'set_patient_field', input: { field, value: c.patientInfo[field] } });
  }
  if (c.patientInfo.treatmentReport) out.push({ name: 'append_treatment_report', input: { text: c.patientInfo.treatmentReport } });
  if (c.patientInfo.radiographicFindings) {
    out.push({ name: 'append_radiographic_findings', input: { text: c.patientInfo.radiographicFindings } });
  }
  return out;
}

// ----- scoring --------------------------------------------------------------

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
/** "0,3" / "0.30" / "0.3 mL" / "0,5 %" → "0.3" / "0.5". */
const decimal = (s: unknown) => {
  const m = String(s ?? '').replace(',', '.').match(/\d+(?:\.\d+)?|\.\d+/);
  return m ? String(Number(m[0])) : String(s ?? '').trim();
};
/** Grid value as the grid shows it; a single labelled pocket ("D5") is the
 *  same depth as a bare one ("5"). */
const gridValue = (field: string, value: unknown) => {
  const v = normalizeFieldValue(String(value ?? '')).toUpperCase();
  return field === 'pocket' ? v.replace(/^(?:M|D|MB|MP|DB|P|B|L)\s*(?=\d+$)/, '') : v;
};

/** Fields compared exactly, per tool, after normalization. Everything else
 *  in the input (free text, review props) is not part of the identity. */
function strictKey(a: AiAction): string {
  const i = a.input;
  const parts: unknown[] = [a.name];
  switch (a.name) {
    case 'set_tooth_field':
      parts.push(Number(i.triadan), i.field, gridValue(String(i.field), i.value));
      break;
    case 'set_tooth_mark':
      parts.push(i.diagram === 'post' ? 'post' : 'pre', Number(i.triadan), i.mark);
      break;
    case 'unset_tooth_mark':
      parts.push(i.diagram === 'post' ? 'post' : 'pre', Number(i.triadan));
      break;
    case 'add_comment':
      parts.push(i.diagram === 'post' ? 'post' : 'pre', i.triadan == null ? null : Number(i.triadan));
      break;
    case 'set_exam_finding':
      parts.push(i.area, i.status);
      break;
    case 'set_nerve_block':
      parts.push(i.site, decimal(i.mL));
      break;
    case 'set_anesthetic_drug':
      parts.push(fold(String(i.drug ?? '')), i.concentration == null || i.concentration === '' ? '' : decimal(i.concentration));
      break;
    case 'set_patient_field':
      parts.push(i.field, fold(String(i.value ?? '')));
      break;
    default:
      break;
  }
  return JSON.stringify(parts);
}

/** The free text of an action, if it has one compared loosely. */
function looseText(a: AiAction): string | null {
  const i = a.input;
  if (a.name === 'add_comment') return codeOnlyComment(String(i.text ?? ''));
  if (a.name === 'set_exam_finding') return String(i.comment ?? '');
  if (a.name === 'append_treatment_report' || a.name === 'append_radiographic_findings') return String(i.text ?? '');
  return null;
}

/** The parts of free text that must survive in any language: AVDC-style
 *  codes (two or more capitals, or slash-joined: "T/FX/CCF", "AT") and
 *  numbers. Single capitals are skipped so a capitalised word ("E il…",
 *  "Légère") never counts as a code. */
export function keyTokens(text: string): string[] {
  return (
    text.match(/(?<![\p{L}\p{N}/])(?:[A-Z][A-Z0-9]*\/[A-Z0-9/]*[A-Z0-9]|[A-Z][A-Z0-9]+)(?![\p{L}\p{N}/])|\d+(?:[.,]\d+)?/gu) ?? []
  );
}

/** A token-free expected text needs an actual text at least this long,
 *  relative to it, so a dropped or stub text never counts as a match. */
const MIN_LENGTH_RATIO = 0.4;

function looseMatch(expected: string, actual: string): boolean {
  const want = expected.trim();
  const got = actual.trim();
  if (!want) return true;
  if (!got) return false;
  const tokens = keyTokens(want);
  if (!tokens.length) return got.length >= MIN_LENGTH_RATIO * want.length;
  const have = got.toUpperCase().replace(',', '.');
  // A code must match whole ("T/FX" is not "T/FX/CCF").
  return tokens.every((tok) => {
    const t = tok.toUpperCase().replace(',', '.');
    return new RegExp(`(?<![A-Z0-9/])${t.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?![A-Z0-9/])`).test(have);
  });
}

export function actionsMatch(expected: AiAction, actual: AiAction): boolean {
  if (strictKey(expected) !== strictKey(actual)) return false;
  const want = looseText(expected);
  return want === null || looseMatch(want, looseText(actual) ?? '');
}

export interface Score {
  precision: number;
  recall: number;
  f1: number;
  missing: AiAction[];
  extra: AiAction[];
}

/** Order-insensitive match of `actual` against `expected`: name and the
 *  normalized structured input must agree; free text only needs the
 *  expected codes and numbers. */
export function scoreActions(expected: AiAction[], actual: AiAction[]): Score {
  const unmatched = [...actual];
  const missing: AiAction[] = [];
  for (const e of expected) {
    const i = unmatched.findIndex((a) => actionsMatch(e, a));
    if (i >= 0) unmatched.splice(i, 1);
    else missing.push(e);
  }
  const hit = expected.length - missing.length;
  const precision = actual.length ? hit / actual.length : expected.length ? 0 : 1;
  const recall = expected.length ? hit / expected.length : 1;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1, missing, extra: unmatched };
}

/** The clinical identity of an action for cross-language parity: no free
 *  text, no dose formatting. */
export function clinicalKey(a: AiAction): string {
  const i = a.input;
  return JSON.stringify([a.name, i.triadan ?? null, i.field ?? null, i.mark ?? null, i.site ?? null, i.area ?? null, i.status ?? null]);
}

// ----- repeated runs ----------------------------------------------------------

/** An action and how many runs it was missing (or extra) in. */
export interface CountedAction {
  action: AiAction;
  count: number;
}

/** Mean scores over several online runs (Claude is not deterministic), with
 *  the union of missing/extra actions and how often each occurred. */
export interface AggregateScore {
  runs: number;
  precision: number;
  recall: number;
  f1: number;
  /** F1 of each run, in order. */
  f1s: number[];
  missing: CountedAction[];
  extra: CountedAction[];
}

function countUnion(lists: AiAction[][]): CountedAction[] {
  const byKey = new Map<string, CountedAction>();
  for (const list of lists) {
    // Count each distinct action once per run.
    const seen = new Set<string>();
    for (const action of list) {
      const key = JSON.stringify([action.name, action.input]);
      if (seen.has(key)) continue;
      seen.add(key);
      const hit = byKey.get(key);
      if (hit) hit.count++;
      else byKey.set(key, { action, count: 1 });
    }
  }
  // Most frequent first; first-seen order breaks ties.
  return [...byKey.values()].sort((a, b) => b.count - a.count);
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function aggregateScores(scores: Score[]): AggregateScore {
  return {
    runs: scores.length,
    precision: mean(scores.map((s) => s.precision)),
    recall: mean(scores.map((s) => s.recall)),
    f1: mean(scores.map((s) => s.f1)),
    f1s: scores.map((s) => s.f1),
    missing: countUnion(scores.map((s) => s.missing)),
    extra: countUnion(scores.map((s) => s.extra)),
  };
}

/** Run the online extraction `runs` times (sequentially) and score the app
 *  chart (live + final check) and the one-shot chart against `expected`. */
export async function evaluateRuns(
  expected: AiAction[],
  runs: number,
  extract: (run: number) => Promise<{ app: AiAction[]; oneShot: AiAction[] }>,
): Promise<{ app: AggregateScore; oneShot: AggregateScore }> {
  const app: Score[] = [];
  const oneShot: Score[] = [];
  for (let i = 0; i < runs; i++) {
    const r = await extract(i);
    app.push(scoreActions(expected, r.app));
    oneShot.push(scoreActions(expected, r.oneShot));
  }
  return { app: aggregateScores(app), oneShot: aggregateScores(oneShot) };
}

/** `--runs N`: default 1, positive integers only. */
export function parseRuns(value: string | undefined): number {
  if (value === undefined) return 1;
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`--runs must be a positive integer (got "${value}")`);
  return Number(value);
}
