import { afterEach, describe, expect, it, vi } from 'vitest';
import { withTemplateGuard } from './templateGuard';

type W = Window & { jaxmanager?: { request: unknown }; response?: unknown; updateGlobalItem?: unknown };
const w = window as unknown as W;

afterEach(() => {
  delete w.jaxmanager;
  delete w.response;
  delete w.updateGlobalItem;
  document.body.innerHTML = '';
});

describe('withTemplateGuard', () => {
  it('intercepts only templateFillData.php while active', async () => {
    const orig = vi.fn();
    w.jaxmanager = { request: orig };
    w.response = vi.fn();
    w.updateGlobalItem = vi.fn();
    document.body.innerHTML = '<div id="coverblock"></div>';
    const cb = vi.fn();
    const cb2 = vi.fn();
    const jax = w.jaxmanager as { request: (...a: unknown[]) => void };
    await withTemplateGuard(window, async () => {
      jax.request('get/templateFillData.php?id=1', '', null, cb);
      jax.request('get/other.php', '', null, cb2);
    });
    expect(orig).toHaveBeenCalledTimes(1);
    expect(orig).toHaveBeenCalledWith('get/other.php', '', null, cb2);
    await vi.waitFor(() => expect(cb).toHaveBeenCalled());
    expect(w.response).toHaveBeenCalledWith(expect.any(String), '');
    expect(w.updateGlobalItem).toHaveBeenCalledWith('serverRendering', false);
    expect((document.getElementById('coverblock') as HTMLElement).style.display).toBe('none');
    expect(jax.request).toBe(orig);
  });

  it('guard restored when write throws', async () => {
    const orig = vi.fn();
    w.jaxmanager = { request: orig };
    await expect(
      withTemplateGuard(window, async () => {
        // eslint-disable-next-line no-restricted-syntax -- dev-only: test
        throw new Error('x');
      }),
    ).rejects.toThrow();
    expect(w.jaxmanager.request).toBe(orig);
  });

  it('a wrapper left behind after the guard ends is inert', async () => {
    const orig = vi.fn();
    w.jaxmanager = { request: orig };
    const jax = w.jaxmanager as { request: (...a: unknown[]) => void };
    await withTemplateGuard(window, async () => {
      const guarded = jax.request;
      jax.request = (...a: unknown[]) => guarded(...a); // someone re-wraps it, so it can't be restored
    });
    jax.request('get/templateFillData.php?id=1', '', null, vi.fn());
    expect(orig).toHaveBeenCalledWith('get/templateFillData.php?id=1', '', null, expect.any(Function));
  });

  it('skipped without jaxmanager', async () => {
    expect((await withTemplateGuard(window, async () => 1)).guardSkipped).toBe(true);
  });

  it('reports the result and not skipped when installed', async () => {
    w.jaxmanager = { request: vi.fn() };
    expect(await withTemplateGuard(window, async () => 7)).toEqual({ result: 7, guardSkipped: false });
  });
});
