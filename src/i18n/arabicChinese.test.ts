import { applyLanguage } from './applyLanguage';
import { resolveLanguage } from './resolveLanguage';
import { normalizeChartPrefs } from '../utils/chartSettings';
import i18n from './index';
import { APP_LANGUAGES, LANGUAGE_NAMES, type AppLanguage } from './config';

afterEach(async () => { await applyLanguage('en'); });

test('Chinese and Arabic are selectable and persist as account preferences', () => {
  expect(APP_LANGUAGES).toContain('zh');
  expect(APP_LANGUAGES).toContain('ar');
  expect(LANGUAGE_NAMES).toMatchObject({ zh: '简体中文', ar: 'العربية' });
  for (const lng of ['zh', 'ar']) {
    expect(resolveLanguage(null, [lng === 'zh' ? 'zh-CN' : 'ar-SA'], true)).toBe(lng);
    expect(normalizeChartPrefs({ language: lng }).language).toBe(lng);
  }
});

test('Arabic switches the document direction and returning to Chinese or English restores LTR', async () => {
  await applyLanguage('ar' as AppLanguage);
  expect(document.documentElement.lang).toBe('ar');
  expect(document.documentElement.dir).toBe('rtl');
  await applyLanguage('zh' as AppLanguage);
  expect(document.documentElement.lang).toBe('zh');
  expect(document.documentElement.dir).toBe('ltr');
  await applyLanguage('en');
  expect(document.documentElement.dir).toBe('ltr');
  expect(i18n.language).toBe('en');
});

test('Chinese by-tooth labels put the ordinal before the baby-tooth prefix', async () => {
  const { toothDisplayName } = await import('../utils/toothChart');
  expect(toothDisplayName(501, 'I1', 'zh')).toBe('右上第一乳门齿');
  expect(toothDisplayName(504, 'C', 'zh')).toBe('右上乳犬齿');
});
