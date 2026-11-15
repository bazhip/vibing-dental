import type Anthropic from '@anthropic-ai/sdk';
import i18n from '../i18n';
import type { AppLanguage } from '../i18n/config';
import { ChartSnapshot } from '../types';
import { AutofillRequest, sendAutofill } from './aiAutofill';
import { LocalizedError } from './apiErrors';
import { LOCALE_LABELS } from './ownerReportI18n';
import { buildRecordNote, recordNoteT, recordNoteText } from './recordNote';

/**
 * "Polish with AI" for the medical record note: rewrites the rule-built
 * note (recordNote.ts) as concise clinical prose. The input is only the
 * rule-built note, so the model can't see — or add — anything beyond what
 * was charted. Sent through the ai-autofill edge function.
 */

const WRITE_TOOL: Anthropic.Messages.Tool = {
  name: 'write_record_note',
  description: 'Return the rewritten medical record note. Call exactly once.',
  input_schema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The full note, plain text, section headings kept.' },
    },
    required: ['text'],
  },
};

const SYSTEM = [
  'You rewrite a veterinary dental procedure note for the patient\'s medical record, read by veterinarians and technicians.',
  'The input is a structured note generated from the dental chart. Rewrite it as a concise, professional clinical note.',
  '',
  'Write it with the write_record_note tool (call it exactly once).',
  '',
  'STRICT RULES (this is a medical record):',
  '- Use ONLY facts in the note below. Never add diagnoses, causes, prognoses, drugs, doses, findings or recommendations that aren\'t there.',
  '- Keep every tooth number (Triadan), measurement, score, code and date exactly as given.',
  '- Keep the section headings and their order. Within a section you may join lines into sentences; per-tooth findings may stay as a list.',
  '- Standard veterinary dental abbreviations are fine. No markdown: plain text only, headings on their own line.',
  '- If a section is a list of facts that reads fine as is, leave it as is.',
].join('\n');

export function buildRecordNoteAiRequest(snapshot: ChartSnapshot, lng: AppLanguage): AutofillRequest {
  const note = recordNoteText(buildRecordNote(snapshot, recordNoteT(lng)));
  const language = LOCALE_LABELS[lng] ?? 'English';
  return {
    max_tokens: 4096,
    kind: 'record_note',
    system: [{ type: 'text', text: SYSTEM }],
    tools: [WRITE_TOOL],
    messages: [{ role: 'user', content: [{ type: 'text', text: [`Write in ${language}.`, '', 'NOTE', note].join('\n') }] }],
  };
}

/** The rewritten note from the model's reply, or null if it gave none. */
export function parseRecordNoteDraft(content: Array<{ type: string; name?: string; input?: unknown }>): string | null {
  const call = content.find((b) => b.type === 'tool_use' && b.name === WRITE_TOOL.name);
  const text = (call?.input as { text?: unknown } | undefined)?.text;
  return typeof text === 'string' && text.trim() ? text.trim() : null;
}

export async function polishRecordNote(snapshot: ChartSnapshot, lng: AppLanguage): Promise<string> {
  const draft = parseRecordNoteDraft(await sendAutofill(buildRecordNoteAiRequest(snapshot, lng)));
  if (!draft) throw new LocalizedError(i18n.t('recordNote.aiEmpty', { ns: 'media' }));
  return draft;
}
