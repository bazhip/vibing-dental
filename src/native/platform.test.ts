import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('platform helper', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock('@capacitor/core');
    vi.doUnmock('./authReturn');
    document.documentElement.classList.remove('native-ios');
    document.head.innerHTML =
      '<meta name="viewport" content="width=device-width, initial-scale=1" />';
  });

  const viewport = () =>
    document.querySelector('meta[name="viewport"]')!.getAttribute('content');

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

  it('initNativeShell leaves the viewport alone on web', async () => {
    const { initNativeShell } = await import('./platform');
    initNativeShell();
    expect(viewport()).toBe('width=device-width, initial-scale=1');
  });

  it('initNativeShell adds viewport-fit=cover when native (once)', async () => {
    vi.doMock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
    const { initNativeShell } = await import('./platform');
    initNativeShell();
    initNativeShell();
    expect(viewport()).toBe('width=device-width, initial-scale=1, viewport-fit=cover');
  });

  it('is a leaf: loading it never loads authReturn (no platform → authReturn → supabaseClient → platform cycle)', async () => {
    vi.doMock('./authReturn', () => {
      throw new Error('platform must not import authReturn');
    });
    const platform = await import('./platform');
    expect(typeof platform.isNativeApp).toBe('function');
  });

  it('exposes WEB_ORIGIN', async () => {
    const { WEB_ORIGIN } = await import('./platform');
    expect(WEB_ORIGIN).toBe('https://toothops.app/');
  });
});
