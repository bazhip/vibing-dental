import { describe, expect, test } from 'vitest';
import { resolveLanguage } from './resolveLanguage';
import { LANGUAGE_SWITCHING_ENABLED } from './config';
import { normalizeChartPrefs } from '../utils/chartSettings';

describe('resolveLanguage', () => {
  test('forces English while switching is disabled', () => {
    expect(resolveLanguage('fr', ['fr-FR'], false)).toBe('en');
  });
  test('switching is on as shipped: saved choice, then browser language', () => {
    expect(LANGUAGE_SWITCHING_ENABLED).toBe(true);
    expect(resolveLanguage('it', ['fr-FR'], LANGUAGE_SWITCHING_ENABLED)).toBe('it');
    expect(resolveLanguage(null, ['fr-FR'], LANGUAGE_SWITCHING_ENABLED)).toBe('fr');
  });
  test('saved choice beats browser', () => {
    expect(resolveLanguage('de', ['fr-FR'], true)).toBe('de');
  });
  test('maps regional and unsupported browser languages', () => {
    expect(resolveLanguage(null, ['fr-CA'], true)).toBe('fr');
    expect(resolveLanguage(null, ['de-AT', 'en'], true)).toBe('de');
    expect(resolveLanguage(null, ['es-419'], true)).toBe('es');
    expect(resolveLanguage(null, ['pt-BR', 'ja'], true)).toBe('en');
    expect(resolveLanguage(null, [], true)).toBe('en');
  });
});

describe('chart prefs language', () => {
  test('normalizeChartPrefs drops an invalid language', () => {
    expect(normalizeChartPrefs({ language: 'xx' }).language).toBeNull();
    expect(normalizeChartPrefs({ language: 'it' }).language).toBe('it');
  });
});
