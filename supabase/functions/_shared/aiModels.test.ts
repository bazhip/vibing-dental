import { describe, expect, it } from 'vitest';
import { DEFAULT_AI_MODELS, featureForRequest, resolveAiModels, isAiFeature, usesReviewSettings, AI_REQUEST_KINDS } from './aiModels';
import { AI_FEATURE_INFO, AI_MODEL_CHOICES } from '../../../src/constants/aiModels';
import { ALLOWED_AI_MODELS, AI_FEATURES } from './aiModels';

describe('AI model per feature', () => {
  it('defaults live dictation to Haiku and the rest to Sonnet', () => {
    expect(resolveAiModels(undefined)).toEqual({
      live: 'claude-haiku-5-5',
      review: 'claude-sonnet-5-5',
      owner_report: 'claude-sonnet-5-5',
      radiology_report: 'claude-sonnet-5-5',
    });
  });

  it('uses stored choices and ignores unsupported ones', () => {
    expect(resolveAiModels({ live: 'claude-sonnet-5-5', review: 'gpt-9', owner_report: 7 })).toEqual({
      ...DEFAULT_AI_MODELS,
      live: 'claude-sonnet-5-5',
    });
  });

  it('routes requests to a feature (warm-ups prime the live cache)', () => {
    expect(featureForRequest('review', 'review')).toBe('review');
    expect(featureForRequest(undefined, 'owner_report')).toBe('owner_report');
    expect(featureForRequest(undefined, 'live')).toBe('live');
    expect(featureForRequest(undefined, 'warmup')).toBe('live');
    expect(featureForRequest(undefined, '')).toBe('live');
  });

  it('keeps the server allow-list and the admin panel in sync', () => {
    expect([...ALLOWED_AI_MODELS].sort()).toEqual(AI_MODEL_CHOICES.map((c) => c.id).sort());
    expect([...AI_FEATURES].sort()).toEqual(AI_FEATURE_INFO.map((f) => f.id).sort());
  });
});


describe('radiology report model routing', () => {
  it('chooses its own allowed server feature even when review mode is requested', () => {
    expect(isAiFeature('radiology_report')).toBe(true);
    expect(featureForRequest(undefined, 'radiology_report')).toBe('radiology_report');
    expect(featureForRequest('review', 'radiology_report')).toBe('radiology_report');
    expect(resolveAiModels({ radiology_report: 'claude-opus-4-8' }).radiology_report).toBe('claude-opus-4-8');
    expect(resolveAiModels({ radiology_report: 'unapproved-model' }).radiology_report).toBe('claude-sonnet-5-5');
  });
  it('uses review response/thinking limits for radiology while preserving existing request settings', () => {
    expect(usesReviewSettings(undefined, 'radiology_report')).toBe(true);
    expect(usesReviewSettings('review', 'radiology_report')).toBe(true);
    expect(usesReviewSettings('review', 'review')).toBe(true);
    expect(usesReviewSettings(undefined, 'owner_report')).toBe(false);
    expect(usesReviewSettings(undefined, 'live')).toBe(false);
    expect(usesReviewSettings(undefined, 'warmup')).toBe(false);
    expect(AI_REQUEST_KINDS).toContain('radiology_report');
  });
});
