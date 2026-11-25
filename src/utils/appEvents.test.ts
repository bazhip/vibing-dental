import { beforeEach, describe, expect, it, vi } from 'vitest';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('./supabaseClient', () => ({ supabase: { rpc } }));
import { errorCode, errorWhere, logEvent, installCrashLogging } from './appEvents';

beforeEach(() => { rpc.mockReset().mockResolvedValue({ error: null }); });

describe('logEvent', () => {
  it('sends only scalars and short string lists, trimmed to the server limits', () => {
    logEvent('dictation', 'summary', 'ok', {
      count: 3.6, flag: true, note: 'x'.repeat(200), fields: Array.from({ length: 30 }, (_, i) => `field${i}`.padEnd(60, 'z')),
      skipped: undefined, nothing: null, 'Bad Key': 'dropped', nan: Number.NaN,
    }, 'session-1');
    const [name, args] = rpc.mock.calls[0];
    expect(name).toBe('log_app_event');
    expect(args).toMatchObject({ p_session_id: 'session-1', p_area: 'dictation', p_stage: 'summary', p_outcome: 'ok' });
    const detail = args.p_detail as Record<string, unknown>;
    expect(detail.count).toBe(4);
    expect(detail.flag).toBe(true);
    expect((detail.note as string).length).toBe(80);
    expect(detail.fields as string[]).toHaveLength(20);
    expect((detail.fields as string[])[0].length).toBe(40);
    expect(Object.keys(detail).sort()).toEqual(['count', 'fields', 'flag', 'note']);
  });
  it('never throws or rejects, whatever the client does', async () => {
    rpc.mockImplementation(() => { throw new Error('offline'); });
    expect(() => logEvent('app', 'x', 'info')).not.toThrow();
    rpc.mockReset().mockRejectedValue(new Error('rls'));
    expect(() => logEvent('app', 'x', 'info')).not.toThrow();
    await Promise.resolve();
  });
});

describe('error summaries', () => {
  it('reduces an error to a code and a file:line, never its message', () => {
    const error = Object.assign(new Error('Patient Rex has a fractured 108'), { code: 'ai_rate_limit' });
    expect(errorCode(error)).toBe('ai_rate_limit');
    expect(errorCode(new TypeError('Rex'))).toBe('TypeError');
    expect(errorCode({ code: 'has spaces and text' })).toBe('unknown');
    const where = errorWhere(Object.assign(new Error('Rex'), { stack: 'Error: Rex\n    at f (https://app.example/src/EntryGrid.tsx:210:15)' }));
    expect(where).toBe('EntryGrid.tsx:210');
    expect(where).not.toContain('Rex');
  });
});

describe('crash logging', () => {
  it('logs one event per distinct crash and nothing from the message', () => {
    installCrashLogging();
    const crash = Object.assign(new RangeError('Rex Smith 555-1234'), { stack: 'RangeError\n    at g (/src/utils/foo.ts:9:3)' });
    for (let i = 0; i < 3; i++) window.dispatchEvent(new ErrorEvent('error', { error: crash }));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_area: 'app', p_stage: 'uncaught_error', p_outcome: 'fail', p_detail: { code: 'RangeError', where: 'foo.ts:9' } });
    expect(JSON.stringify(rpc.mock.calls[0])).not.toContain('Rex');
  });
});

describe('logEventThrottled', () => {
  it('sends an identical event once per interval and different ones separately', async () => {
    const { logEventThrottled } = await import('./appEvents');
    rpc.mockClear();
    logEventThrottled('save', 'save_failed', 'fail', { code: 'offline' });
    logEventThrottled('save', 'save_failed', 'fail', { code: 'offline' });
    logEventThrottled('save', 'save_failed', 'fail', { code: 'forbidden' });
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
