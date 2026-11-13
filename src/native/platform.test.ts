import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('platform helper', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock('@capacitor/core');
    document.documentElement.classList.remove('native-ios');
  });

  it('isNativeApp is false under jsdom', async () => {
    const { isNativeApp } = await import('./platform');
    expect(isNativeApp()).toBe(false);
  });

  it('isNativeApp is true when Capacitor reports a native platform', async () => {
    vi.doMock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
    const { isNativeApp } = await import('./platform');
    expect(isNativeApp()).toBe(true);
  });

  it('initNativeShell does nothing on web', async () => {
    const { initNativeShell } = await import('./platform');
    initNativeShell();
    expect(document.documentElement.classList.contains('native-ios')).toBe(false);
  });

  it('initNativeShell adds native-ios when native', async () => {
    vi.doMock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
    const { initNativeShell } = await import('./platform');
    initNativeShell();
    expect(document.documentElement.classList.contains('native-ios')).toBe(true);
  });

  it('exposes WEB_ORIGIN', async () => {
    const { WEB_ORIGIN } = await import('./platform');
    expect(WEB_ORIGIN).toBe('https://toothops.app/');
  });
});
