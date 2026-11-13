import { describe, expect, it, vi } from 'vitest';

vi.mock('../utils/supabaseClient', () => ({ supabase: null, cloudEnabled: false }));

import { appSafeTeamError } from './useTeam';
import { ApiError, LocalizedError } from '../utils/apiErrors';

const individual = 'Your Individual plan is single-user — switch to a Practice plan (up to 5 people) to add your team.';
const practice = 'Practice plans include up to 5 team members — contact us about a larger plan.';

describe('appSafeTeamError', () => {
  it('web: the server message is unchanged', () => {
    expect(appSafeTeamError(new Error(individual), false)).toEqual(new Error(individual));
    expect(appSafeTeamError(new Error(practice), false)).toEqual(new Error(practice));
  });

  it('app: seat-limit upsells become a plain fact', () => {
    for (const msg of [individual, practice]) {
      expect(appSafeTeamError(new Error(msg), true)).toEqual(new LocalizedError('This practice has reached its team member limit.'));
    }
  });

  it('app: coded seat-limit errors become the plain fact too; the web keeps them', () => {
    for (const code of ['seat_limit', 'seat_limit_individual']) {
      const err = new ApiError('Translated upsell', code, 'upsell');
      expect(appSafeTeamError(err, true)).toEqual(new LocalizedError('This practice has reached its team member limit.'));
      expect(appSafeTeamError(err, false)).toBe(err);
    }
  });

  it('app: other errors pass through', () => {
    const err = new Error('That email is already on your team.');
    expect(appSafeTeamError(err, true)).toBe(err);
  });

  it('app: errors that merely mention a plan are not rewritten', () => {
    // Only team-api's two exact seat-limit messages are replaced.
    const err = new Error('Could not load your plan details. Try again.');
    expect(appSafeTeamError(err, true)).toBe(err);
  });
});
