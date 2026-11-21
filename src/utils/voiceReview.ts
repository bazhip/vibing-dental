import type { AiAction, ReviewFlag } from './aiAutofill';

/** Review belongs to the visit, independently of the recording session. */
export interface VoiceReviewItem {
  id: string;
  flag: ReviewFlag;
  spoken: boolean;
  section?: string;
  /** Previous scalar value, or null when removal needs no string value. */
  previous?: string | null;
  proposal?: { action: AiAction; existing?: string };
}

function isAction(value: unknown): value is AiAction {
  if (!value || typeof value !== 'object') return false;
  const action = value as Partial<AiAction>;
  return typeof action.name === 'string' && !!action.input && typeof action.input === 'object' && !Array.isArray(action.input);
}

export function normalizeVoiceReviews(value: unknown): VoiceReviewItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is VoiceReviewItem =>
    !!item && typeof item.id === 'string' && typeof item.flag?.heard === 'string'
    && typeof item.flag.reason === 'string' && Array.isArray(item.flag.options)
  ).map(item => ({
    id: item.id,
    spoken: item.spoken === true,
    section: typeof item.section === 'string' ? item.section : undefined,
    previous: typeof item.previous === 'string' || item.previous === null ? item.previous : undefined,
    flag: {
      heard: item.flag.heard,
      reason: item.flag.reason,
      triadan: typeof item.flag.triadan === 'number' ? item.flag.triadan : undefined,
      applied: isAction(item.flag.applied) ? item.flag.applied : undefined,
      options: item.flag.options.filter(option => typeof option?.label === 'string' && isAction(option.action)),
    },
    proposal: isAction(item.proposal?.action) ? {
      action: item.proposal.action,
      existing: typeof item.proposal.existing === 'string' ? item.proposal.existing : undefined,
    } : undefined,
  }));
}
