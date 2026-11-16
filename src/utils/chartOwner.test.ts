import { beforeEach, describe, expect, it, vi } from 'vitest';

// This jsdom build has no Web Storage.
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size; },
});

import { claimChartStorage } from './chartOwner';

const CHART_KEY = 'vibing-dental.chart.patientInfo.v1';
const OWNER_KEY = 'vibing-dental.chart.owner.v1';

beforeEach(() => store.clear());

describe('claimChartStorage', () => {
  it('another account’s working chart is wiped before this account sees it', () => {
    store.set(OWNER_KEY, JSON.stringify('user-a'));
    store.set(CHART_KEY, '{"patientName":"Rex"}');
    expect(claimChartStorage('user-b')).toBe(true);
    expect(store.has(CHART_KEY)).toBe(false);
    expect(JSON.parse(store.get(OWNER_KEY)!)).toBe('user-b');
  });

  it('the same account keeps its chart', () => {
    store.set(OWNER_KEY, JSON.stringify('user-a'));
    store.set(CHART_KEY, '{"patientName":"Rex"}');
    expect(claimChartStorage('user-a')).toBe(false);
    expect(store.has(CHART_KEY)).toBe(true);
  });

  it('an unowned chart (from before owners were recorded, or a trial) is adopted, not wiped', () => {
    store.set(CHART_KEY, '{"patientName":"Rex"}');
    expect(claimChartStorage('user-a')).toBe(false);
    expect(store.has(CHART_KEY)).toBe(true);
    expect(JSON.parse(store.get(OWNER_KEY)!)).toBe('user-a');
  });
});
