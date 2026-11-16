import { afterEach, describe, expect, it, vi } from 'vitest';
import { EXTENSION_VERSION } from '../version';

afterEach(() => {
  delete window.__toothopsEzyvet;
  vi.resetModules();
});

describe('page entry', () => {
  it('installs the API once per version', async () => {
    await import('./page');
    const api = window.__toothopsEzyvet!;
    expect(api.version).toBe(EXTENSION_VERSION);
    expect(Object.keys(api).sort()).toEqual([
      'consultPatientNumber',
      'diagnostics',
      'listAppointments',
      'listFields',
      'status',
      'version',
      'write',
    ]);
    expect(typeof api.listAppointments).toBe('function');
    expect(typeof api.consultPatientNumber).toBe('function');
    vi.resetModules();
    await import('./page');
    expect(window.__toothopsEzyvet).toBe(api);
  });
  it('replaces an older version', async () => {
    const old = { version: 'old' } as unknown as NonNullable<typeof window.__toothopsEzyvet>;
    window.__toothopsEzyvet = old;
    await import('./page');
    expect(window.__toothopsEzyvet).not.toBe(old);
    expect(window.__toothopsEzyvet!.version).toBe(EXTENSION_VERSION);
  });
});
