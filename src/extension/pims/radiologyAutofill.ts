import type { AdapterContext } from './types';

export type RadiologyProvider = 'radimal' | 'vetology';
export const RADIOLOGY_HOST_PERMISSIONS = ['https://*.radimal.ai/*', 'https://*.vetology.net/*'];
export type RadiologyAutofillRequest = { operation: 'prepare' } | { operation: 'fill'; ticket: string; text: string };
export type RadiologyAutofillResult =
  | { state: 'prepared'; ticket: string; provider: RadiologyProvider; origin: string; title: string;
    existing_characters: number; expires_at: string }
  | { state: 'filled' } | { state: 'blocked' } | { state: 'unknown' };

const MAX_TEXT = 60000;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value: unknown, max: number): value is string => typeof value === 'string' && !!value.trim() && value.length <= max;
const hostProvider = (url: URL): RadiologyProvider | null => {
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  if (url.hostname === 'radimal.ai' || url.hostname.endsWith('.radimal.ai')) return 'radimal';
  if (url.hostname === 'vetology.net' || url.hostname.endsWith('.vetology.net')) return 'vetology';
  return null;
};

export function identifyRadiology(value: string): RadiologyProvider | null {
  try {
    const url = new URL(value), provider = hostProvider(url);
    return provider === 'radimal' && !/^\/request-consult(?:\/|$)/.test(url.pathname) ? null : provider;
  } catch { return null; }
}

export function isRadiologyAutofillRequest(value: unknown): value is RadiologyAutofillRequest {
  return object(value) && (value.operation === 'prepare' || value.operation === 'fill' && nonempty(value.ticket, 160)
    && nonempty(value.text, MAX_TEXT) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value.text));
}

export function isRadiologyAutofillResult(value: unknown): value is RadiologyAutofillResult {
  if (!object(value)) return false;
  if (value.state === 'filled' || value.state === 'blocked' || value.state === 'unknown') return true;
  if (value.state !== 'prepared' || !nonempty(value.ticket, 160) || typeof value.title !== 'string' || value.title.length > 500
    || typeof value.existing_characters !== 'number' || !Number.isSafeInteger(value.existing_characters)
    || value.existing_characters < 0 || value.existing_characters > MAX_TEXT || typeof value.origin !== 'string'
    || typeof value.expires_at !== 'string' || value.expires_at.length > 100 || !Number.isFinite(Date.parse(value.expires_at))) return false;
  try {
    const url = new URL(value.origin);
    return url.origin === value.origin && hostProvider(url) !== null && hostProvider(url) === value.provider;
  } catch { return false; }
}

type Ticket = { field: HTMLTextAreaElement; value: string; expires: number; generation: number };

export function createRadiologyAutofill(context: AdapterContext): { execute(request: RadiologyAutofillRequest): Promise<RadiologyAutofillResult>; dispose(): void } {
  const initialDoc = context.doc, initialUrl = context.url.href, provider = identifyRadiology(initialUrl);
  const tickets = new Map<string, Ticket>();
  let generation = 0, disposed = false;
  const invalidate = () => { generation++; tickets.clear(); };
  const view = initialDoc.defaultView;
  for (const event of ['hashchange', 'popstate', 'pagehide']) view?.addEventListener(event, invalidate);
  const navigation = (view as (Window & { navigation?: EventTarget }) | null)?.navigation;
  navigation?.addEventListener('navigate', invalidate);
  const current = () => !disposed && context.doc === initialDoc && (context.currentUrl?.() ?? context.url).href === initialUrl
    && identifyRadiology(initialUrl) === provider && provider !== null;
  const eligible = (field: HTMLTextAreaElement): boolean => {
    if (!initialDoc.contains(field) || field.ownerDocument !== initialDoc || field.disabled || field.readOnly
      || field.matches(':disabled') || field.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
    for (let ancestor: HTMLElement | null = field; ancestor; ancestor = ancestor.parentElement) {
      const style = (view ?? window).getComputedStyle(ancestor);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') return false;
    }
    // checkVisibility covers CSS content-visibility and non-rendered ancestors in real browsers.
    const check = (field as HTMLTextAreaElement & { checkVisibility?: (options?: object) => boolean }).checkVisibility;
    return !check || check.call(field, { checkOpacity: true, checkVisibilityCSS: true });
  };
  const fieldNow = (): HTMLTextAreaElement | undefined => {
    if (!current()) return undefined;
    const fields = Array.from(initialDoc.querySelectorAll<HTMLTextAreaElement>(provider === 'radimal'
      ? 'textarea[name="notes"]' : 'textarea[name="history"]')).filter(eligible);
    return fields.length === 1 ? fields[0] : undefined;
  };
  const same = (prepared: Ticket, expected: string): boolean => current() && prepared.generation === generation
    && fieldNow() === prepared.field && prepared.field.value === expected;
  return {
    dispose() {
      disposed = true; invalidate();
      for (const event of ['hashchange', 'popstate', 'pagehide']) view?.removeEventListener(event, invalidate);
      navigation?.removeEventListener('navigate', invalidate);
    },
    async execute(request): Promise<RadiologyAutofillResult> {
      let mutated = false;
      try {
        if (!isRadiologyAutofillRequest(request) || !current()) return { state: 'blocked' };
        if (request.operation === 'prepare') {
          const now = Date.now();
          for (const [id, entry] of tickets) if (entry.expires <= now) tickets.delete(id);
          const field = fieldNow();
          if (!provider || !field || field.value.length > MAX_TEXT || tickets.size >= 128) return { state: 'blocked' };
          const ticket = crypto.randomUUID(), expires = now + 300000;
          tickets.set(ticket, { field, value: field.value, expires, generation });
          return { state: 'prepared', ticket, provider, origin: new URL(initialUrl).origin,
            title: initialDoc.title.slice(0, 500), existing_characters: field.value.length, expires_at: new Date(expires).toISOString() };
        }
        const prepared = tickets.get(request.ticket);
        tickets.delete(request.ticket);
        if (!prepared || Date.now() >= prepared.expires || !same(prepared, prepared.value)) return { state: 'blocked' };
        const value = prepared.value + (prepared.value && !prepared.value.endsWith('\n') ? '\n' : '') + request.text;
        if (value.length > MAX_TEXT || prepared.field.maxLength >= 0 && value.length > prepared.field.maxLength) return { state: 'blocked' };
        const proto = (view?.HTMLTextAreaElement ?? HTMLTextAreaElement).prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (!setter || !same(prepared, prepared.value)) return { state: 'blocked' };
        // Consume the ticket before any provider handler can run. Events acknowledge form fill only.
        mutated = true;
        setter.call(prepared.field, value);
        if (!same(prepared, value)) return { state: 'unknown' };
        const EventType = view?.Event ?? Event;
        prepared.field.dispatchEvent(new EventType('input', { bubbles: true }));
        if (!same(prepared, value)) return { state: 'unknown' };
        prepared.field.dispatchEvent(new EventType('change', { bubbles: true }));
        return same(prepared, value) ? { state: 'filled' } : { state: 'unknown' };
      } catch { return { state: mutated ? 'unknown' : 'blocked' }; }
    },
  };
}
