import { describe, it, expect, afterEach } from 'vitest';
import { rgb } from 'pdf-lib';
import { readAppTokens } from './appTheme';

describe('readAppTokens', () => {
  afterEach(() => {
    document.documentElement.classList.remove('native-ios');
    document.documentElement.style.cssText = '';
  });

  it('reads the live web theme tokens', () => {
    document.documentElement.style.setProperty('--text', '#123456');
    expect(readAppTokens().text).toEqual(rgb(0x12 / 255, 0x34 / 255, 0x56 / 255));
  });

  it('in the iOS app, ignores the app tokens (which follow dark mode) — PDFs stay light', () => {
    document.documentElement.classList.add('native-ios');
    // What the app's dark scheme resolves the theme variables to.
    document.documentElement.style.setProperty('--text', '#ffffff');
    document.documentElement.style.setProperty('--danger-tint', '#402729');
    const t = readAppTokens();
    expect(t.text).toEqual(rgb(0x17 / 255, 0x23 / 255, 0x2e / 255));
    expect(t.dangerTint).toEqual(rgb(0xfa / 255, 0xf1 / 255, 0xef / 255));
  });
});
