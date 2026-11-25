import { logEvent, newSessionId, type EventDetail } from './appEvents';

/**
 * One tracker per dictation, shared by both flows (charting by voice and the
 * clinical-note dictation). It collects counters while the dictation runs and
 * emits ONE `summary` event with a derived outcome, so "how often does
 * dictation work, and where does it break" is a single query over one row
 * per session. Failures are also logged as they happen (stage `failure`).
 *
 * Privacy: counters and short codes only. Never transcript or patient text.
 */
export type DictationFlow = 'dental' | 'clinical';
type Fact = string | number | boolean | readonly string[];

/** What a dictation amounted to, from the user's point of view. */
export type DictationOutcome =
  | 'applied'            // something reached the chart
  | 'review_abandoned'   // clinical review was shown and left unapplied
  | 'nothing_extracted'  // speech heard, no chart content produced, no failure
  | 'no_speech'          // the mic ran but nothing was heard
  | 'capture_failed'     // the mic or transcription could not start or died
  | 'extract_failed'     // speech heard but extraction failed and nothing applied
  | 'superseded'         // replaced by a new dictation before it finished
  | 'closed';            // page closed or unmounted mid-dictation

export function classifyDictation(c: Record<string, number>): DictationOutcome {
  if ((c.applied_fields ?? 0) > 0 || (c.actions ?? 0) > 0) return 'applied';
  if ((c.review_abandoned ?? 0) > 0) return 'review_abandoned';
  if ((c.chars ?? 0) === 0) return (c.capture_fail ?? 0) > 0 ? 'capture_failed' : 'no_speech';
  if ((c.extract_fail ?? 0) > 0) return 'extract_failed';
  return 'nothing_extracted';
}

export class DictationTracker {
  readonly id = newSessionId();
  private readonly startedAt = Date.now();
  private counts: Record<string, number> = {};
  private facts: Record<string, Fact> = {};
  private done = false;

  constructor(readonly flow: DictationFlow, facts: Record<string, Fact> = {}) {
    this.facts = { ...facts };
  }

  get flushed(): boolean { return this.done; }

  /** Add to a counter (chunks, actions, chars, ...). */
  count(key: string, n = 1): void {
    if (this.done || !Number.isFinite(n)) return;
    this.counts[key] = (this.counts[key] ?? 0) + n;
  }

  /** Set a counter to an absolute value (a running total read from elsewhere). */
  put(key: string, n: number): void {
    if (!this.done && Number.isFinite(n)) this.counts[key] = n;
  }

  /** Record a one-off fact (provider, language, the first failure code, ...). */
  set(key: string, value: Fact): void {
    if (!this.done) this.facts[key] = value;
  }

  /** First value wins: keeps the earliest cause of a failure. */
  setOnce(key: string, value: Fact): void {
    if (!this.done && !(key in this.facts)) this.facts[key] = value;
  }

  /** Log one failure now (it is also counted in the summary). */
  failure(where: string, code: string, extra: EventDetail = {}): void {
    if (this.done) return;
    this.count(`${where}_fail`);
    this.setOnce(`${where}_code`, code);
    logEvent('dictation', 'failure', 'fail', { flow: this.flow, where, code, ...extra }, this.id);
  }

  /** Emit the one summary row. Safe to call more than once. */
  flush(forced?: DictationOutcome): DictationOutcome | null {
    if (this.done) return null;
    this.done = true;
    const outcome = forced ?? classifyDictation(this.counts);
    logEvent('dictation', 'summary', outcome === 'applied' || outcome === 'nothing_extracted' ? 'ok' : 'fail', {
      flow: this.flow, outcome, total_ms: Date.now() - this.startedAt, ...this.facts, ...this.counts,
    }, this.id);
    return outcome;
  }
}
