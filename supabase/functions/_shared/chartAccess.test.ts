import { describe, expect, it } from 'vitest';
import { canAccessChart } from './chartAccess';

// Minimal stand-in for the service-role client: records the membership query
// and answers from a fixed member list.
function fakeAdmin(members: Array<{ practice_id: string; user_id: string }>) {
  const calls: Array<Record<string, string>> = [];
  const admin = {
    from(table: string) {
      expect(table).toBe('practice_members');
      const filters: Record<string, string> = {};
      const q = {
        select: () => q,
        eq: (col: string, val: string) => {
          filters[col] = val;
          return q;
        },
        maybeSingle: async () => {
          calls.push({ ...filters });
          const hit = members.find((m) => m.practice_id === filters.practice_id && m.user_id === filters.user_id);
          return { data: hit ? { user_id: hit.user_id } : null };
        },
      };
      return q;
    },
  };
  return { admin, calls };
}

describe('canAccessChart', () => {
  it('allows the creator without being a member', async () => {
    const { admin } = fakeAdmin([]);
    const r = await canAccessChart(admin, { created_by: 'u1', practice_id: null }, 'u1');
    expect(r).toEqual({ allowed: true, isMember: false });
  });

  it('allows a member of the chart practice and reports isMember', async () => {
    const { admin, calls } = fakeAdmin([{ practice_id: 'p1', user_id: 'u2' }]);
    const r = await canAccessChart(admin, { created_by: 'u1', practice_id: 'p1' }, 'u2');
    expect(r).toEqual({ allowed: true, isMember: true });
    expect(calls).toEqual([{ practice_id: 'p1', user_id: 'u2' }]);
  });

  it('reports isMember for a creator who is also a member', async () => {
    const { admin } = fakeAdmin([{ practice_id: 'p1', user_id: 'u1' }]);
    const r = await canAccessChart(admin, { created_by: 'u1', practice_id: 'p1' }, 'u1');
    expect(r).toEqual({ allowed: true, isMember: true });
  });

  it('denies a non-member of the chart practice', async () => {
    const { admin } = fakeAdmin([{ practice_id: 'p2', user_id: 'u3' }]);
    const r = await canAccessChart(admin, { created_by: 'u1', practice_id: 'p1' }, 'u3');
    expect(r).toEqual({ allowed: false, isMember: false });
  });

  it('denies a non-creator when the chart has no practice, without querying', async () => {
    const { admin, calls } = fakeAdmin([{ practice_id: 'p1', user_id: 'u3' }]);
    const r = await canAccessChart(admin, { created_by: 'u1', practice_id: null }, 'u3');
    expect(r).toEqual({ allowed: false, isMember: false });
    expect(calls).toEqual([]);
  });
});
