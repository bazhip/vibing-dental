import { clearChartStorage } from '../hooks/useChartState';
import { readJson, writeJson } from './storage';

// Lives under the chart prefix, so clearing the chart also clears its owner.
const OWNER_KEY = 'chart.owner';

export function ownsChartStorage(userId: string): boolean {
  return readJson<string>(OWNER_KEY, 1, '') === userId;
}

/**
 * Claim the working chart in localStorage for the account that just got a
 * session (app launch or sign-in). If it belongs to a different account,
 * wipe it first so a shared clinic machine never shows (or autosaves) the
 * previous person's patient. Returns true when it wiped something.
 *
 * This doesn't rely on having seen the previous account in this page load:
 * a session that expired, a closed tab, or a Google sign-in redirect all
 * start with no one remembered in memory. A chart with no recorded owner
 * (a trial, or one stored before owners were recorded) is adopted.
 */
export function claimChartStorage(userId: string): boolean {
  const owner = readJson<string>(OWNER_KEY, 1, '');
  if (owner === userId) return false;
  const wiped = !!owner;
  if (wiped) clearChartStorage();
  writeJson(OWNER_KEY, 1, userId);
  return wiped;
}
