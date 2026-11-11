/**
 * Models offered for voice autofill. Each one has request settings tuned
 * in the ai-autofill edge function (MODEL_SETTINGS) and is allow-listed
 * in admin-api's set_ai_model — keep all three in sync.
 *
 * Cost per hour is a rough estimate for continuous dictation (~250
 * utterances/hr, warm prompt cache), at list prices.
 */
export interface AiModelChoice {
  id: string;
  label: string;
  speed: string;
  costPerHour: string;
  note: string;
}

export const AI_MODEL_CHOICES: AiModelChoice[] = [
  {
    id: 'claude-sonnet-5-5',
    label: 'Claude Sonnet 5.5',
    speed: 'Fast',
    costPerHour: '~$1/hr',
    note: 'Recommended. Thinking off for quick replies; accurate on dictated findings.',
  },
  {
    id: 'claude-haiku-5-5',
    label: 'Claude Haiku 5.5',
    speed: 'Fastest',
    costPerHour: '~$0.10/hr',
    note: 'Cheapest. Good for clear, structured dictation; may miss subtler phrasing.',
  },
  {
    id: 'claude-opus-5-5',
    label: 'Claude Opus 5.5',
    speed: 'Slower',
    costPerHour: '~$2–3/hr',
    note: 'Most capable. Always thinks briefly (low effort), so each reply takes longer.',
  },
  {
    id: 'claude-opus-4-8',
    label: 'Claude Opus 4.8 (previous default)',
    speed: 'Medium',
    costPerHour: '~$3/hr',
    note: 'Previous generation. Kept for comparison.',
  },
];
