import { vi } from 'vitest';
import { ensureChartSaved, type SaveState } from './ensureSaved';

function cloud(over: Partial<SaveState>, after?: Partial<SaveState>) {
  let state: SaveState = { enabled: true, dirty: false, lastSavedAt: '2026-11-14T10:00:00Z', saveNow: vi.fn(async () => {}), ...over };
  if (after) {
    const save = vi.fn(async () => { state = { ...state, ...after }; });
    state.saveNow = save;
  }
  return { get: () => state, saveNow: () => state.saveNow };
}

describe('ensureChartSaved', () => {
  it('a clean, saved chart is ready without saving', async () => {
    const c = cloud({});
    await expect(ensureChartSaved(c.get)).resolves.toBe(true);
    expect(c.saveNow()).not.toHaveBeenCalled();
  });

  it('saves unsaved changes first', async () => {
    const c = cloud({ dirty: true }, { dirty: false });
    await expect(ensureChartSaved(c.get)).resolves.toBe(true);
    expect(c.saveNow()).toHaveBeenCalled();
  });

  it('a chart that never reached the cloud is saved first', async () => {
    const c = cloud({ lastSavedAt: '' }, { lastSavedAt: '2026-11-14T10:01:00Z' });
    await expect(ensureChartSaved(c.get)).resolves.toBe(true);
  });

  it('fails when the save throws (offline, server error)', async () => {
    const c = cloud({ dirty: true, saveNow: vi.fn(async () => { throw new Error('offline'); }) });
    await expect(ensureChartSaved(c.get)).resolves.toBe(false);
  });

  it('fails when the save quietly did nothing (still dirty)', async () => {
    const c = cloud({ dirty: true });
    await expect(ensureChartSaved(c.get)).resolves.toBe(false);
  });

  it('fails without cloud sync', async () => {
    await expect(ensureChartSaved(cloud({ enabled: false }).get)).resolves.toBe(false);
  });

  it('tells the caller a deliberate save is happening', async () => {
    const onSave = vi.fn();
    await ensureChartSaved(cloud({ dirty: true }, { dirty: false }).get, onSave);
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
