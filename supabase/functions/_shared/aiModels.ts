// Which Claude model serves each AI feature. Chosen per feature in the
// admin panel (app_config.ai_models); these are the defaults for a
// feature with no entry. Keep ALLOWED_AI_MODELS in sync with
// MODEL_SETTINGS in ai-autofill and AI_MODEL_CHOICES in
// src/constants/aiModels.ts.

export const AI_FEATURES = ['live', 'review', 'owner_report'] as const;
export type AiFeature = typeof AI_FEATURES[number];

export const DEFAULT_AI_MODELS: Record<AiFeature, string> = {
  // One call per spoken phrase: the bulk of AI spend. Haiku 5.5 is ~20×
  // cheaper than Sonnet 5.5 per token.
  live: 'claude-haiku-5-5',
  // Once per dictation / per report: accuracy over cost.
  review: 'claude-sonnet-5-5',
  owner_report: 'claude-sonnet-5-5',
};

export const ALLOWED_AI_MODELS = ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5', 'claude-opus-4-8'];

export function isAiFeature(v: unknown): v is AiFeature {
  return typeof v === 'string' && (AI_FEATURES as readonly string[]).includes(v);
}

/** The model for each feature from app_config.ai_models, with defaults
 *  for missing or unsupported entries. */
export function resolveAiModels(stored: unknown): Record<AiFeature, string> {
  const s = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {};
  const out = { ...DEFAULT_AI_MODELS };
  for (const f of AI_FEATURES) {
    const m = s[f];
    if (typeof m === 'string' && ALLOWED_AI_MODELS.includes(m)) out[f] = m;
  }
  return out;
}

/** The feature an ai-autofill request belongs to. Warm-ups prime the
 *  live prompt cache (caches are per model), so they use the live model. */
export function featureForRequest(mode: unknown, kind: string): AiFeature {
  if (mode === 'review') return 'review';
  if (kind === 'owner_report') return 'owner_report';
  return 'live';
}
