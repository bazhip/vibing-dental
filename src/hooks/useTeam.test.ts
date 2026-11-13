import { describe, expect, it, vi } from 'vitest';

vi.mock('../utils/supabaseClient', () => ({ supabase: null, cloudEnabled: false }));

import { appSafeTeamError } from './useTeam';

const individual = 'Your Individual plan is single-user — switch to a Practice plan (up to 5 people) to add your team.';
const practice = 'Practice plans include up to 5 team members — contact us about a larger plan.';

describe('appSafeTeamError', () => {
  it('web: the server message is unchanged', () => {
    expect(appSafeTeamError(new Error(individual), false)).toEqual(new Error(individual));
    expect(appSafeTeamError(new Error(practice), false)).toEqual(new Error(practice));
  });

  it('app: seat-limit upsells become a plain fact', () => {
    for (const msg of [individual, practice]) {
      expect(appSafeTeamError(new Error(msg), true)).toEqual(new Error('This practice has reached its team member limit.'));
    }
  });

  it('app: other errors pass through', () => {
    const err = new Error('That email is already on your team.');
    expect(appSafeTeamError(err, true)).toBe(err);
  });
});
