import { afterEach, expect, it } from 'vitest';
import i18n from '../i18n';
import { AI_FEATURE_INFO } from './aiModels';

const originalGerman = JSON.parse(JSON.stringify(i18n.getResourceBundle('de', 'app')));
afterEach(async () => {
  await i18n.changeLanguage('en');
  i18n.removeResourceBundle('de', 'app');
  i18n.addResourceBundle('de', 'app', originalGerman);
});

it('reads the new radiology feature labels in the current app language at access time', async () => {
  const feature = AI_FEATURE_INFO.find(item => item.id === 'radiology_report');
  expect(feature).toBeDefined();
  i18n.addResourceBundle('de', 'app', { radiologyReport: { aiFeatureLabel: 'Localized report model', aiFeatureHint: 'Localized model hint' } }, true, true);
  await i18n.changeLanguage('de');
  expect(feature!.label).toBe('Localized report model');
  expect(feature!.hint).toBe('Localized model hint');
  i18n.addResourceBundle('de', 'app', { radiologyReport: { aiFeatureLabel: 'Updated report model', aiFeatureHint: 'Updated model hint' } }, true, true);
  expect(feature!.label).toBe('Updated report model');
  expect(feature!.hint).toBe('Updated model hint');
});
