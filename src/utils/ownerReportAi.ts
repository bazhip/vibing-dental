import { ctRecordedText } from './ctReportState';
import { radiologyRecordedText } from './radiologyReportState';
import type Anthropic from '@anthropic-ai/sdk';
import i18n from '../i18n';
import { ChartSnapshot } from '../types';
import { AutofillRequest, sendAutofill } from './aiAutofill';
import {
  buildOwnerReportModel,
  placeholderValuesFor,
  templateForSnapshot,
  templateHomecareTips,
  templateIntro,
} from './ownerReport';
import type { OwnerReportContext } from './ownerReportConfig';
import { LOCALE_LABELS } from './ownerReportI18n';
import { LocalizedError } from './apiErrors';

/**
 * "Write with AI" for the owner report: drafts the two narrative blocks —
 * the opening summary and the home-care tips — from the chart. The
 * per-tooth findings stay deterministic (ownerReport.ts); the draft only
 * fills the existing editable fields, which the vet reviews before
 * printing. Sent through the ai-autofill edge function (server-side key,
 * site model, per-account rate limits).
 */

export interface OwnerReportDraft {
  intro: string;
  /** One tip per line, as the Home care block stores them. */
  homecare: string;
}

const WRITE_TOOL: Anthropic.Messages.Tool = {
  name: 'write_owner_report',
  description: 'Return the drafted opening summary and home-care tips for the owner report. Call exactly once.',
  input_schema: {
    type: 'object',
    properties: {
      intro: { type: 'string', description: 'Opening summary: 2–4 short sentences.' },
      homecare: {
        type: 'array',
        description: 'Home-care tips, 3–6 items, one short sentence each.',
        items: { type: 'string' },
        maxItems: 6,
      },
    },
    required: ['intro', 'homecare'],
  },
};

const SYSTEM = [
  'You write the narrative parts of a take-home dental report that a veterinary practice gives a pet owner after a dental visit.',
  'Write for the owner: warm, calm, plain words, short sentences. Explain clinical terms in everyday language (e.g. "gum disease" for periodontal disease, "tartar" for calculus, "a fractured tooth" for T/FX) — no abbreviations or codes.',
  '',
  'Write, with the write_owner_report tool (call it exactly once):',
  '1. intro — 2–4 sentences: what was done at this visit and the main findings at a high level, and why they matter for the pet. Use the pet\'s name (and the owner\'s, if given).',
  '2. homecare — 3–6 short tips specific to THIS visit (e.g. soft food and no chew toys after extractions, brushing for gum disease, the recheck if one is set). Fall back to standard home dental care only where the chart gives nothing specific.',
  '',
  'STRICT RULES (this goes to a client):',
  '- Use ONLY facts in the chart below. Never invent anything: no diagnoses, causes, prognoses, medications, doses, prices or timelines that aren\'t there.',
  '- Lead with the main reason for the visit and what was done (the reason for visit and the treatment report say what it was) — not with routine findings.',
  '- When the notes say samples were sent to the lab, say the results are pending (e.g. a biopsy, cytology or histopathology) and that the practice will be in touch.',
  '- If something isn\'t in the chart (e.g. no extractions, no recheck date), don\'t mention it — never guess.',
  '- Don\'t list every tooth; the report already lists each tooth\'s findings below the summary. Summarize instead.',
  '- Missing or blank entries mean not recorded, never normal, healthy, examined, or completed. Report review status is not proof that any procedure occurred.',
  '- Do not claim anesthesia, cleaning, examination, treatment completion, or absence of disease unless explicitly documented. Draft reports are incomplete and require veterinary review.',
  '- Don\'t contradict the chart. Don\'t promise outcomes.',
  '- No greeting line and no sign-off — the report adds the practice\'s header and closing.',
  '- The practice\'s default wording is given as a reference for tone and length; follow its voice.',
].join('\n');

/** The chart facts the draft may use, as plain lines. */
export function ownerReportFacts(snapshot: ChartSnapshot, context?: OwnerReportContext): string {
  const model = buildOwnerReportModel(snapshot, context);
  const template = templateForSnapshot(snapshot, context);
  const values = placeholderValuesFor(snapshot, context, template);
  const info = snapshot.patientInfo;
  const lines: string[] = [
    `Report completion status: ${model.reviewed ? 'reviewed for this chart revision' : 'draft — not reviewed for this chart revision'}`,
    `Pet: ${values.pet} (${values.species})`,
    values.owner ? `Owner: ${values.owner}` : 'Owner: (not given)',
    `Visit date: ${values.date || '(not given)'}`,
    `Practice: ${values.practice}`,
    info.complaint?.trim() ? `Reason for visit: ${info.complaint.trim()}` : '',
    model.extracted.length ? `Teeth removed at this visit: ${model.extracted.join(', ')}` : 'Teeth removed at this visit: none recorded',
    model.alreadyMissing.length ? `Teeth already missing before this visit: ${model.alreadyMissing.join(', ')}` : '',
    model.summaryLines.length ? `Mouth-wide findings:\n${model.summaryLines.map((l) => `- ${l}`).join('\n')}` : '',
    model.otherFindings.length ? `Other findings:\n${model.otherFindings.map((l) => `- ${l}`).join('\n')}` : '',
    model.teeth.filter((t) => t.notes.length).length
      ? `Findings by tooth:\n${model.teeth.filter((t) => t.notes.length).map((t) => `- ${t.layName}${t.extracted ? ' (removed today)' : ''}: ${t.notes.join('; ')}`).join('\n')}`
      : model.summaryLines.length || model.otherFindings.length
        ? 'Findings by tooth: none beyond the above'
        : 'Findings by tooth: none recorded',
    model.examNotes.length
      ? `Oral exam — abnormal areas: ${model.examNotes.map((n) => `${n.area}${n.comment ? ` (${n.comment})` : ''}`).join('; ')}`
      : 'Oral exam: nothing abnormal recorded',
    radiologyRecordedText(info).trim() ? `${typeof info.radiologyReport === 'string' ? 'Radiology report (clinician-edited text; may include an unreviewed AI refinement)' : 'Radiographic findings (written by the vet)'}:\n${radiologyRecordedText(info).trim()}` : '',
    ctRecordedText(info).trim() ? `CT report (clinician-edited text; may include an unreviewed AI refinement):\n${ctRecordedText(info).trim()}` : '',
    info.treatmentReport?.trim() ? `Treatment report (written by the vet):\n${info.treatmentReport.trim()}` : '',
    ...(['gpVitals', 'gpPhysicalExam', 'gpDiagnostics'] as const).map(field => info[field]?.trim() ? `${field} (recorded source, preserve doses and uncertainty):\n${info[field]}` : ''),
    info.consultationHistory?.trim() ? `consultationHistory (recorded source, preserve doses and uncertainty):\n${info.consultationHistory}` : '',
    info.consultationAssessment?.trim() ? `consultationAssessment (recorded source, preserve doses and uncertainty):\n${info.consultationAssessment}` : '',
    info.consultationPlan?.trim() ? `consultationPlan (recorded source, preserve doses and uncertainty):\n${info.consultationPlan}` : '',
    info.dischargeMedications?.trim() ? `dischargeMedications (recorded source, preserve doses and uncertainty):\n${info.dischargeMedications}` : '',
    info.dischargeInstructions?.trim() ? `dischargeInstructions (recorded source, preserve doses and uncertainty):\n${info.dischargeInstructions}` : '',
    info.dischargeFollowUp?.trim() ? `dischargeFollowUp (recorded source, preserve doses and uncertainty):\n${info.dischargeFollowUp}` : '',
    model.recallDate ? `Recommended recheck: ${model.recallDate}` : 'Recommended recheck: none set',
    model.extraNotes ? `Note from the veterinary team (already printed separately): ${model.extraNotes}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

export function buildOwnerReportAiRequest(snapshot: ChartSnapshot, context?: OwnerReportContext): AutofillRequest {
  const template = templateForSnapshot(snapshot, context);
  const values = placeholderValuesFor(snapshot, context, template);
  const language = LOCALE_LABELS[template.language] ?? 'English';
  const userText = [
    `Write in ${language}.`,
    '',
    'CHART',
    ownerReportFacts(snapshot, context),
    '',
    'PRACTICE DEFAULT WORDING (tone and length reference only — not facts about this patient):',
    `Summary: ${templateIntro(snapshot, template, values)}`,
    `Home care: ${templateHomecareTips(template, values, snapshot.species).join(' | ')}`,
  ].join('\n');
  return {
    max_tokens: 2048,
    kind: 'owner_report',
    system: [{ type: 'text', text: SYSTEM }],
    tools: [WRITE_TOOL],
    messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
  };
}

/** The draft from the model's reply, or null if it didn't produce one. */
export function parseOwnerReportDraft(content: Array<{ type: string; name?: string; input?: unknown }>): OwnerReportDraft | null {
  const call = content.find((b) => b.type === 'tool_use' && b.name === WRITE_TOOL.name);
  const input = (call?.input ?? null) as { intro?: unknown; homecare?: unknown } | null;
  if (!input) return null;
  const intro = typeof input.intro === 'string' ? input.intro.trim() : '';
  const tips = Array.isArray(input.homecare)
    ? input.homecare.filter((t): t is string => typeof t === 'string').map((t) => t.replace(/^[-•*]\s*/, '').trim()).filter(Boolean).slice(0, 6)
    : [];
  if (!intro && tips.length === 0) return null;
  return { intro, homecare: tips.join('\n') };
}

export async function draftOwnerReport(snapshot: ChartSnapshot, context?: OwnerReportContext): Promise<OwnerReportDraft> {
  const content = await sendAutofill(buildOwnerReportAiRequest(snapshot, context));
  const draft = parseOwnerReportDraft(content);
  if (!draft) throw new LocalizedError(i18n.t('section.draftEmpty', { ns: 'reportui' }));
  return draft;
}
