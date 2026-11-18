import i18n from '../i18n';

/**
 * Models the admin panel offers for each AI feature. Each one has request
 * settings tuned in the ai-autofill edge function (MODEL_SETTINGS) and is
 * allow-listed in supabase/functions/_shared/aiModels.ts
 * (ALLOWED_AI_MODELS) — keep all three in sync.
 *
 * Cost per hour is a rough estimate for continuous live dictation (~250
 * utterances/hr, warm prompt cache), at list prices. `price` is list
 * input / output $ per million tokens.
 */
export interface AiModelChoice {
  id: string;
  label: string;
  speed: string;
  costPerHour: string;
  price: string;
  note: string;
}

/** The AI features that each get their own model (app_config.ai_models). */
export type AiFeature = 'live' | 'review' | 'owner_report' | 'radiology_report';

export const AI_FEATURE_INFO: Array<{ id: AiFeature; label: string; hint: string }> = [
  {
    id: 'live',
    label: 'Live dictation',
    hint: 'One call per spoken phrase while the vet dictates (plus cache warm-ups). Most of the AI spend — the cheapest model that keeps up usually wins here.',
  },
  {
    id: 'review',
    label: 'End-of-dictation review',
    hint: 'One call when dictation stops: rereads the whole transcript and flags anything missed. Thinks at medium effort.',
  },
  {
    id: 'owner_report',
    label: 'Owner report drafts',
    hint: 'One call per "Draft with AI" on an owner report.',
  },
  {
    id: 'radiology_report',
    get label() { return i18n.t('radiologyReport.aiFeatureLabel', { ns: 'app' }); },
    get hint() { return i18n.t('radiologyReport.aiFeatureHint', { ns: 'app' }); },
  },
];

export const AI_MODEL_CHOICES: AiModelChoice[] = [
  {
    id: 'claude-sonnet-5-5',
    label: 'Claude Sonnet 5.5',
    speed: 'Fast',
    costPerHour: '~$1/hr',
    price: '$2 / $10',
    note: 'Thinking off on live calls for quick replies; accurate on dictated findings. Default for review and owner reports.',
  },
  {
    id: 'claude-haiku-5-5',
    label: 'Claude Haiku 5.5',
    speed: 'Fastest',
    costPerHour: '~$0.10/hr',
    price: '$0.10 / $0.50',
    note: 'Cheapest (~20× less than Sonnet). Default for live dictation; may miss subtler phrasing — the end-of-dictation review catches some of that.',
  },
  {
    id: 'claude-opus-5-5',
    label: 'Claude Opus 5.5',
    speed: 'Slower',
    costPerHour: '~$2–3/hr',
    price: '$4 / $20',
    note: 'Most capable. Always thinks briefly (low effort), so each reply takes longer.',
  },
  {
    id: 'claude-opus-4-8',
    label: 'Claude Opus 4.8 (previous default)',
    speed: 'Medium',
    costPerHour: '~$3/hr',
    price: '$5 / $25',
    note: 'Previous generation. Kept for comparison.',
  },
];
