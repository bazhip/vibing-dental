import { beforeEach, describe, expect, it, vi } from 'vitest';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('./supabaseClient', () => ({ supabase: { rpc } }));
import { DictationTracker, classifyDictation } from './dictationTelemetry';

const summaries = () => rpc.mock.calls.filter(([, args]) => args.p_stage === 'summary').map(([, args]) => args);
beforeEach(() => { rpc.mockReset().mockResolvedValue({ error: null }); });

describe('classifyDictation', () => {
  it.each([
    [{ chars: 120, actions: 2 }, 'applied'],
    [{ chars: 120, applied_fields: 1 }, 'applied'],
    [{ chars: 120, review_abandoned: 1 }, 'review_abandoned'],
    [{ chars: 0 }, 'no_speech'],
    [{ chars: 0, capture_fail: 1 }, 'capture_failed'],
    [{ chars: 120, extract_fail: 2 }, 'extract_failed'],
    [{ chars: 120 }, 'nothing_extracted'],
    [{ chars: 120, extract_fail: 1, actions: 1 }, 'applied'],
  ] as const)('%j is %s', (counts, outcome) => { expect(classifyDictation({ ...counts })).toBe(outcome); });
});

describe('DictationTracker', () => {
  it('emits exactly one summary, with counters, facts and the derived outcome', () => {
    const tracker = new DictationTracker('dental', { provider: 'deepgram', lang: 'it' });
    tracker.count('chunks'); tracker.count('chunks'); tracker.count('actions', 3); tracker.put('chars', 250);
    expect(tracker.flush()).toBe('applied');
    expect(tracker.flush()).toBeNull();
    tracker.count('chunks'); // ignored once flushed
    expect(summaries()).toHaveLength(1);
    expect(summaries()[0]).toMatchObject({
      p_session_id: tracker.id, p_area: 'dictation', p_outcome: 'ok',
      p_detail: { flow: 'dental', outcome: 'applied', provider: 'deepgram', lang: 'it', chunks: 2, actions: 3, chars: 250 },
    });
  });
  it('logs a failure immediately, counts it, and keeps the first cause', () => {
    const tracker = new DictationTracker('clinical');
    tracker.failure('token', 'dictation_rate_limit');
    tracker.failure('token', 'no_token');
    expect(rpc.mock.calls.filter(([, args]) => args.p_stage === 'failure')).toHaveLength(2);
    tracker.put('chars', 0);
    tracker.flush();
    expect(summaries()[0].p_detail).toMatchObject({ token_fail: 2, token_code: 'dictation_rate_limit' });
  });
  it('lets a forced outcome override the derived one', () => {
    const tracker = new DictationTracker('dental');
    tracker.count('actions');
    tracker.flush('superseded');
    expect(summaries()[0].p_detail).toMatchObject({ outcome: 'superseded' });
    expect(summaries()[0].p_outcome).toBe('fail');
  });
  it('shares one session id across a dictation, for joining events', () => {
    const tracker = new DictationTracker('clinical');
    tracker.failure('extract', 'invalidResponse', { reason: 'evidence_mismatch' });
    tracker.flush();
    expect(new Set(rpc.mock.calls.map(([, args]) => args.p_session_id))).toEqual(new Set([tracker.id]));
  });
});
