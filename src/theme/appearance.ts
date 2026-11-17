export type Appearance = 'system' | 'light' | 'dark';
export const APPEARANCE_KEY = 'toothops-appearance';
export const APPEARANCE_EVENT = 'toothops-appearance-change';

let preference: Appearance = 'system';
let media: MediaQueryList | undefined;
const listeners = new Set<() => void>();

function valid(value: unknown): Appearance {
  return value === 'light' || value === 'dark' ? value : 'system';
}

function apply() {
  const dark = preference === 'dark' || (preference === 'system' && !!media?.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#10191f' : '#0c6b63');
  listeners.forEach((listener) => listener());
  window.dispatchEvent(new Event(APPEARANCE_EVENT));
}

export function getAppearance(): Appearance { return preference; }
export function subscribeAppearance(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function setAppearance(value: Appearance): void {
  preference = valid(value);
  try { localStorage.setItem(APPEARANCE_KEY, preference); } catch { /* Private/blocked storage: keep this session usable. */ }
  apply();
}

/** Run before React renders. The returned cleanup also supports tests/HMR. */
export function initAppearance(): () => void {
  try { preference = valid(localStorage.getItem(APPEARANCE_KEY)); } catch { preference = 'system'; }
  media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : undefined;
  const query = media;
  const onStorage = (event: StorageEvent) => {
    if (event.storageArea && event.storageArea !== localStorage) return;
    if (event.key !== APPEARANCE_KEY && event.key !== null) return;
    preference = valid(event.newValue);
    apply();
  };
  query?.addEventListener('change', apply);
  window.addEventListener('storage', onStorage);
  apply();
  return () => {
    query?.removeEventListener('change', apply);
    window.removeEventListener('storage', onStorage);
  };
}
