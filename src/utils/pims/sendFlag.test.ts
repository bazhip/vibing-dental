import { vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const plans = vi.hoisted(() => ({ freeBeta: false }));
vi.mock('../../constants/plans', () => ({ get FREE_BETA() { return plans.freeBeta; } }));

import { loadPimsSendAllowed, pimsSendAllowed } from './sendFlag';

type Row = { data: unknown; error: unknown };
function client(rows: Record<string, Row | 'throw'>): SupabaseClient {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            const r = rows[table];
            if (r === 'throw') throw new TypeError('Failed to fetch');
            return r ?? { data: null, error: null };
          },
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

const profile = { data: { practice_id: 'p1' }, error: null };

beforeEach(() => { plans.freeBeta = false; });

describe('pims send flag', () => {
  it('the rule: the practice flag, or the free beta', () => {
    expect(pimsSendAllowed(false)).toBe(false);
    expect(pimsSendAllowed(true)).toBe(true);
    plans.freeBeta = true;
    expect(pimsSendAllowed(false)).toBe(true);
  });

  it('reads the practice flag', async () => {
    expect(await loadPimsSendAllowed(client({ profiles: profile, practices: { data: { pims_send_enabled: true }, error: null } }), 'u1')).toBe(true);
    expect(await loadPimsSendAllowed(client({ profiles: profile, practices: { data: { pims_send_enabled: false }, error: null } }), 'u1')).toBe(false);
  });

  it('no practice is off', async () => {
    expect(await loadPimsSendAllowed(client({ profiles: { data: { practice_id: null }, error: null } }), 'u1')).toBe(false);
  });

  it('a failed read is unknown (null), never on', async () => {
    expect(await loadPimsSendAllowed(client({ profiles: { data: null, error: { message: 'x' } } }), 'u1')).toBeNull();
    expect(await loadPimsSendAllowed(client({ profiles: profile, practices: { data: null, error: { message: 'x' } } }), 'u1')).toBeNull();
    expect(await loadPimsSendAllowed(client({ profiles: 'throw' }), 'u1')).toBeNull();
  });

  it('during the free beta nothing is read', async () => {
    plans.freeBeta = true;
    expect(await loadPimsSendAllowed(client({ profiles: 'throw' }), 'u1')).toBe(true);
  });
});
