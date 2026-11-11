import { beforeEach, expect, it, vi } from 'vitest';
const rpc = vi.hoisted(() => vi.fn(async () => ({ data: null, error: null })));
vi.mock('./supabaseClient', () => ({ supabase: { rpc }, cloudEnabled: true }));
import { touchLastSeen, resetLastSeenThrottle } from './lastSeen';

beforeEach(() => { rpc.mockClear(); resetLastSeenThrottle(); });

it('records activity at most every 15 minutes', () => {
  touchLastSeen(1_000_000);
  touchLastSeen(1_000_000 + 5 * 60_000);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith('touch_last_seen');
  touchLastSeen(1_000_000 + 16 * 60_000);
  expect(rpc).toHaveBeenCalledTimes(2);
});

it('a failing call (e.g. migration not applied) is swallowed', async () => {
  rpc.mockRejectedValueOnce(new Error('function not found'));
  expect(() => touchLastSeen(5_000_000)).not.toThrow();
  await Promise.resolve();
});
