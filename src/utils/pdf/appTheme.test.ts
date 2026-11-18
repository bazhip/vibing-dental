import { describe, it, expect, afterEach } from 'vitest';
import { rgb } from 'pdf-lib';
import { readAppTokens } from './appTheme';

describe('readAppTokens', () => {
  afterEach(() => {
    document.documentElement.classList.remove('native-ios');
    document.documentElement.style.cssText = '';
    delete document.documentElement.dataset.theme;
  });

  it('keeps web dark-mode PDFs on a light palette', () => {
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.style.setProperty('--text', '#ffffff');
    expect(readAppTokens().text).toEqual(rgb(0x17 / 255, 0x23 / 255, 0x2e / 255));
  });

  it('reads the live web theme tokens', () => {
    document.documentElement.style.setProperty('--text', '#123456');
    expect(readAppTokens().text).toEqual(rgb(0x12 / 255, 0x34 / 255, 0x56 / 255));
  });

  it('keeps record colors independent of warm light screen colors', () => {
    const root = document.documentElement;
    root.style.setProperty('--text', '#24312f');
    root.style.setProperty('--text-muted', '#62665f');
    root.style.setProperty('--border', '#ddd8ce');
    root.style.setProperty('--border-strong', '#85887b');
    root.style.setProperty('--pdf-text', '#17232e');
    root.style.setProperty('--pdf-muted', '#55677a');
    root.style.setProperty('--pdf-border', '#e2e7eb');
    root.style.setProperty('--pdf-border-strong', '#9cabb7');
    const tokens = readAppTokens();
    expect(tokens.text).toEqual(rgb(0x17 / 255, 0x23 / 255, 0x2e / 255));
    expect(tokens.muted).toEqual(rgb(0x55 / 255, 0x67 / 255, 0x7a / 255));
    expect(tokens.border).toEqual(rgb(0xe2 / 255, 0xe7 / 255, 0xeb / 255));
    expect(tokens.borderStrong).toEqual(rgb(0x9c / 255, 0xab / 255, 0xb7 / 255));
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
