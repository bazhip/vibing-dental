import type { DiagramComment } from '../types';
import { DENTAL_CODES } from '../constants/dentalCodes';
import { isGridComment } from './gridComments';

/**
 * Quick codes: a person's one-tap code stamps on the Diagnosis diagram
 * (Chart settings → Diagnosis). Pick one in the toolbar, tap a tooth, and
 * the code is added to that tooth's comment, the same as typing it, so the
 * PDF and its "codes used" legend pick it up unchanged. Tapping the tooth
 * again takes the code back out.
 */

export const MAX_QUICK_CODES = 12;
export const MAX_QUICK_CODE_LENGTH = 16;
/** None: every quick code is one the person adds in Customize. */
export const DEFAULT_QUICK_CODES: string[] = [];

const CATALOG_BY_UPPER = new Map(DENTAL_CODES.map((c) => [c.code.toUpperCase(), c.code]));

/** A typed code tidied up: trimmed, inner spaces removed, and spelled as
 *  in the AVDC catalog when it's one of those ("t/sn" → "T/SN"). Codes
 *  outside the catalog (a practice's own) are kept as typed. '' = none. */
export function canonicalQuickCode(input: string): string {
  const code = input.replace(/\s+/g, '').slice(0, MAX_QUICK_CODE_LENGTH);
  return CATALOG_BY_UPPER.get(code.toUpperCase()) ?? code;
}

/** Tolerant read of a stored list: strings only, tidied, no repeats,
 *  at most MAX_QUICK_CODES. */
export function normalizeQuickCodes(raw: unknown[]): string[] {
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== 'string') continue;
    const code = canonicalQuickCode(v);
    if (code && !out.includes(code)) out.push(code);
    if (out.length >= MAX_QUICK_CODES) break;
  }
  return out;
}

const SEP = '[\\s,;·]';
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const tokenPattern = (code: string) => new RegExp(`(^|${SEP})${escape(code)}(?=$|${SEP})`, 'g');

/** Whether `text` already carries `code` as a whole token. */
export function hasCode(text: string, code: string): boolean {
  return tokenPattern(code).test(text);
}

/**
 * Stamps `code` on a tooth: added to the tooth's own (hand-written)
 * comment, or a new comment holding just the code; when the comment
 * already has it, the code is taken out instead (and an emptied comment
 * removed). Mirrored grid cards are never touched. A changed comment
 * drops its fitted size so the diagram re-fits it to the new text.
 */
export function stampQuickCode(
  comments: DiagramComment[],
  triadan: number,
  code: string,
  newId: () => string,
): DiagramComment[] {
  const existing = comments.find((c) => c.anchorTriadan === triadan && !isGridComment(c));
  if (!existing) return [...comments, { id: newId(), text: code, anchorTriadan: triadan }];

  let text: string;
  if (hasCode(existing.text, code)) {
    text = existing.text
      .replace(tokenPattern(code), '$1')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/^[ \t,;·]+|[ \t,;·]+$/gm, '')
      .trim();
    if (!text) return comments.filter((c) => c.id !== existing.id);
  } else {
    const base = existing.text.trimEnd();
    text = base ? `${base} ${code}` : code;
  }
  const { width: _w, height: _h, ...rest } = existing;
  return comments.map((c) => (c.id === existing.id ? { ...rest, text } : c));
}
