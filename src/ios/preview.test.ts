import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { isIosPreview } from './preview';

const setSearch = (search: string) => {
  window.history.replaceState(null, '', `/${search}`);
};

describe('isIosPreview (DEV-only ?iosPreview=1)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    setSearch('');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    sessionStorage.clear();
    setSearch('');
  });

  it('is false in a production build even with ?iosPreview=1', () => {
    vi.stubEnv('DEV', false);
    setSearch('?iosPreview=1');
    expect(isIosPreview()).toBe(false);
  });

  it('is false in a production build even when remembered for the session', () => {
    vi.stubEnv('DEV', false);
    sessionStorage.setItem('toothops:iosPreview', '1');
    expect(isIosPreview()).toBe(false);
  });

  it('is false in DEV without the param', () => {
    vi.stubEnv('DEV', true);
    expect(isIosPreview()).toBe(false);
  });

  it('is true in DEV with ?iosPreview=1 and is remembered for the session', () => {
    vi.stubEnv('DEV', true);
    setSearch('?iosPreview=1');
    expect(isIosPreview()).toBe(true);
    setSearch('');
    expect(isIosPreview()).toBe(true);
  });

  it('?iosPreview=0 turns a remembered preview off', () => {
    vi.stubEnv('DEV', true);
    setSearch('?iosPreview=1');
    isIosPreview();
    setSearch('?iosPreview=0');
    expect(isIosPreview()).toBe(false);
    setSearch('');
    expect(isIosPreview()).toBe(false);
  });
});

describe('platform with the iOS preview', () => {
  beforeEach(() => {
    vi.resetModules();
    sessionStorage.clear();
    document.documentElement.classList.remove('native-ios', 'ios-preview');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    sessionStorage.clear();
    setSearch('');
    document.documentElement.classList.remove('native-ios', 'ios-preview');
  });

  it('isNativeApp is true and initNativeShell marks <html> in the DEV preview', async () => {
    vi.stubEnv('DEV', true);
    setSearch('?iosPreview=1');
    const { isNativeApp, initNativeShell } = await import('../native/platform');
    expect(isNativeApp()).toBe(true);
    initNativeShell();
    expect(document.documentElement.classList.contains('native-ios')).toBe(true);
    expect(document.documentElement.classList.contains('ios-preview')).toBe(true);
  });

  it('isNativeApp stays false in production even with ?iosPreview=1', async () => {
    vi.stubEnv('DEV', false);
    setSearch('?iosPreview=1');
    const { isNativeApp, initNativeShell } = await import('../native/platform');
    expect(isNativeApp()).toBe(false);
    initNativeShell();
    expect(document.documentElement.classList.contains('native-ios')).toBe(false);
  });
});
