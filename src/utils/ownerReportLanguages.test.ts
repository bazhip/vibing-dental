import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => vi.resetModules());

test('practice reports use native code definitions before that app language has ever been loaded', async () => {
  vi.resetModules();
  const { default: freshI18n } = await import('../i18n');
  const { ownerFriendlyText } = await import('./ownerReportCodes');
  expect(freshI18n.language).toBe('en');
  // PD3 has no curated owner phrase, so it uses the clinical code catalog.
  expect(ownerFriendlyText('PD3', 'hu')).toContain('fogágygyulladás');
  expect(ownerFriendlyText('PD3', 'ro').toLowerCase()).toContain('parodontită');
});
