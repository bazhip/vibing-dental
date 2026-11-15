// Keeps ezyVet's practice template from filling in over text we just wrote (spec §2a).
// While active, only `get/templateFillData.php` requests are answered here, with the empty success
// ezyVet's own code expects. Every other request goes to the original function. The reply shape is
// unverified against a live page.
import { COVER_BLOCK } from './selectors';

const TEMPLATE_URL = 'get/templateFillData.php';

type Jax = { request: (...args: unknown[]) => unknown };
type GuardWindow = Window & {
  jaxmanager?: Jax;
  response?: (id: string, html: string) => void;
  updateGlobalItem?: (name: string, value: unknown) => void;
};

function emptyTemplateReply(win: GuardWindow, callback: unknown) {
  win.setTimeout(() => {
    if (typeof win.response === 'function') win.response(String(Math.random()), '');
    const cover = win.document.querySelector<HTMLElement>(COVER_BLOCK);
    if (cover) cover.style.display = 'none';
    if (typeof win.updateGlobalItem === 'function') win.updateGlobalItem('serverRendering', false);
    if (typeof callback === 'function') callback();
  }, 0);
}

export async function withTemplateGuard<T>(
  win: Window,
  fn: () => Promise<T>,
): Promise<{ result: T; guardSkipped: boolean }> {
  const w = win as GuardWindow;
  const jax = w.jaxmanager;
  if (!jax || typeof jax.request !== 'function') {
    return { result: await fn(), guardSkipped: true };
  }
  const original = jax.request;
  const guarded = function (this: unknown, ...args: unknown[]) {
    if (typeof args[0] === 'string' && args[0].includes(TEMPLATE_URL)) {
      emptyTemplateReply(w, args[3]);
      return undefined;
    }
    return original.apply(jax, args);
  };
  jax.request = guarded;
  try {
    return { result: await fn(), guardSkipped: false };
  } finally {
    if (jax.request === guarded) jax.request = original;
  }
}
