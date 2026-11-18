import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRadiologyAutofill, identifyRadiology, isRadiologyAutofillRequest, isRadiologyAutofillResult, RADIOLOGY_HOST_PERMISSIONS } from './radiologyAutofill';
import type { AdapterContext } from './types';

beforeEach(() => { document.body.innerHTML = ''; document.title = 'Request consultation'; });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

function fixture(url = 'https://app.radimal.ai/request-consult') {
  document.body.innerHTML = '<form><textarea name="notes">Existing history</textarea><button type="submit">Submit</button></form>';
  if (url.includes('vetology.net')) document.querySelector('textarea')!.name = 'history';
  let liveUrl = new URL(url);
  const context: AdapterContext = { doc: document, url: liveUrl, currentUrl: () => liveUrl,
    fetch: vi.fn(), localStorage, sessionStorage, wait: async () => {} };
  const module = createRadiologyAutofill(context);
  const prepare = async () => {
    const result = await module.execute({ operation: 'prepare' });
    if (result.state !== 'prepared') throw new TypeError();
    return result;
  };
  return { context, module, prepare, field: document.querySelector('textarea')!, navigate: (next: string) => { liveUrl = new URL(next); } };
}

it.each([
  ['https://radimal.ai/request-consult', 'radimal'], ['https://app.radimal.ai/request-consult/123', 'radimal'],
  ['https://radimal.ai/request-consult?case=1', 'radimal'], ['https://app.vetology.net/case/1', 'vetology'],
  ['https://vetology.net/', 'vetology'], ['https://radimal.ai/request-consultation', null],
  ['https://radimal.ai/', null], ['https://radimal.ai.evil.example/request-consult', null],
  ['https://evilradimal.ai/request-consult', null], ['http://radimal.ai/request-consult', null],
  ['https://user:secret@radimal.ai/request-consult', null], ['https://radimal.ai:8443/request-consult', null],
  ['https://vetology.net.evil.example/', null], ['data:text/html,radimal.ai/request-consult', null], ['malformed', null],
])('routes only supported radiology page %s', (url, provider) => {
  expect(identifyRadiology(url)).toBe(provider);
});

it('advertises only the two narrow HTTPS host permissions', () => {
  expect(RADIOLOGY_HOST_PERMISSIONS).toEqual(['https://*.radimal.ai/*', 'https://*.vetology.net/*']);
});

it('prepares a credential-free document/field ticket with a compatibility destination summary', async () => {
  const { prepare, context, field } = fixture();
  const result = await prepare();
  expect(result).toEqual({ state: 'prepared', provider: 'radimal', origin: 'https://app.radimal.ai', title: 'Request consultation',
    ticket: expect.any(String), expires_at: expect.any(String), existing_characters: 16 });
  expect(Date.parse(result.expires_at)).toBeGreaterThan(Date.now());
  expect(field.value).toBe('Existing history');
  expect(context.fetch).not.toHaveBeenCalled();
});

it.each(['https://app.radimal.ai/request-consult', 'https://portal.vetology.net/order'])('appends approved multiline text without submitting %s', async (url) => {
  const { module, prepare, field, context } = fixture(url);
  const submit = vi.fn((event: Event) => event.preventDefault());
  document.querySelector('form')!.addEventListener('submit', submit);
  const input = vi.fn(), change = vi.fn();
  field.addEventListener('input', input); field.addEventListener('change', change);
  const prepared = await prepare();
  expect(await module.execute({ operation: 'fill', ticket: prepared.ticket, text: '108: recorded finding\nReview requested' })).toEqual({ state: 'filled' });
  expect(field.value).toBe('Existing history\n108: recorded finding\nReview requested');
  expect(input).toHaveBeenCalledOnce(); expect(change).toHaveBeenCalledOnce();
  expect(submit).not.toHaveBeenCalled(); expect(context.fetch).not.toHaveBeenCalled();
  expect(await module.execute({ operation: 'fill', ticket: prepared.ticket, text: 'Duplicate' })).toEqual({ state: 'blocked' });
  expect(input).toHaveBeenCalledOnce();
});

it.each(['', 'History\n'])('avoids an extra newline when destination is %j', async (existing) => {
  const { module, prepare, field } = fixture(); field.value = existing;
  const prepared = await prepare();
  expect(await module.execute({ operation: 'fill', ticket: prepared.ticket, text: 'Notes' })).toEqual({ state: 'filled' });
  expect(field.value).toBe(`${existing}Notes`);
});

it('uses the native setter when the provider installs an instance setter', async () => {
  const { module, prepare, field } = fixture(); const setter = vi.fn();
  const prepared = await prepare();
  Object.defineProperty(field, 'value', { get: () => Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.get!.call(field), set: setter, configurable: true });
  expect(await module.execute({ operation: 'fill', ticket: prepared.ticket, text: 'Notes' })).toEqual({ state: 'filled' });
  expect(setter).not.toHaveBeenCalled();
});

it.each([
  '<textarea name="notes" hidden></textarea>', '<div hidden><textarea name="notes"></textarea></div>',
  '<div inert><textarea name="notes"></textarea></div>', '<div aria-hidden="true"><textarea name="notes"></textarea></div>',
  '<textarea name="notes" disabled></textarea>', '<textarea name="notes" readonly></textarea>',
  '<fieldset disabled><textarea name="notes"></textarea></fieldset>',
  '<div style="display:none"><textarea name="notes"></textarea></div>',
  '<div style="visibility:hidden"><textarea name="notes"></textarea></div>',
  '<textarea name="notes"></textarea><textarea name="notes"></textarea>', '<textarea name="unrelated"></textarea>', '',
])('refuses unavailable or ambiguous field %s', async (markup) => {
  const { module } = fixture(); document.body.innerHTML = markup;
  expect(await module.execute({ operation: 'prepare' })).toEqual({ state: 'blocked' });
});

it.each(['content', 'replace', 'disabled', 'readonly', 'hidden', 'inert', 'duplicate', 'document', 'url'])('refuses a changed %s after preparation', async (change) => {
  const { module, prepare, field, context, navigate } = fixture(); const prepared = await prepare();
  if (change === 'content') field.value = 'Changed';
  if (change === 'replace') field.outerHTML = '<textarea name="notes">Existing history</textarea>';
  if (change === 'disabled') field.disabled = true;
  if (change === 'readonly') field.readOnly = true;
  if (change === 'hidden') field.hidden = true;
  if (change === 'inert') field.setAttribute('inert', '');
  if (change === 'duplicate') document.body.insertAdjacentHTML('beforeend', '<textarea name="notes"></textarea>');
  if (change === 'document') context.doc = document.implementation.createHTMLDocument();
  if (change === 'url') navigate('https://app.radimal.ai/request-consult/other');
  expect(await module.execute({ operation: 'fill', ticket: prepared.ticket, text: 'Notes' })).toEqual({ state: 'blocked' });
  expect(field.value).not.toContain('Notes');
});

it.each(['hashchange', 'popstate', 'pagehide', 'navigate'])('invalidates tickets on %s even after returning to the same URL', async (event) => {
  const target = new EventTarget();
  Object.defineProperty(window, 'navigation', { value: target, configurable: true });
  const { module, prepare, field } = fixture(); const prepared = await prepare();
  if (event === 'navigate') target.dispatchEvent(new Event(event)); else window.dispatchEvent(new Event(event));
  expect(await module.execute({ operation: 'fill', ticket: prepared.ticket, text: 'Notes' })).toEqual({ state: 'blocked' });
  expect(field.value).toBe('Existing history');
  delete (window as unknown as { navigation?: EventTarget }).navigation;
});

it('expires old tickets without changing the destination', async () => {
  vi.useFakeTimers(); const { module, prepare, field } = fixture(); const prepared = await prepare();
  vi.advanceTimersByTime(300001);
  expect(await module.execute({ operation: 'fill', ticket: prepared.ticket, text: 'Notes' })).toEqual({ state: 'blocked' });
  expect(field.value).toBe('Existing history');
});

it.each(['url', 'replace', 'normalize', 'throw'])('reports unknown when %s changes during provider input handling', async (change) => {
  const { module, prepare, field, navigate } = fixture(); const prepared = await prepare();
  const changeEvent = vi.fn(); field.addEventListener('change', changeEvent);
  field.addEventListener('input', () => {
    if (change === 'url') navigate('https://app.radimal.ai/request-consult/other');
    if (change === 'replace') field.outerHTML = '<textarea name="notes"></textarea>';
    if (change === 'normalize') field.value = 'Provider changed text';
  });
  if (change === 'throw') vi.spyOn(field, 'dispatchEvent').mockImplementation(() => { throw new TypeError(); });
  expect(await module.execute({ operation: 'fill', ticket: prepared.ticket, text: 'Notes' })).toEqual({ state: 'unknown' });
  expect(changeEvent).not.toHaveBeenCalled();
  expect(await module.execute({ operation: 'fill', ticket: prepared.ticket, text: 'Duplicate' })).toEqual({ state: 'blocked' });
});

it('refuses combined values that exceed the destination maxlength', async () => {
  const { module, prepare, field } = fixture(); field.maxLength = 20; const prepared = await prepare();
  expect(await module.execute({ operation: 'fill', ticket: prepared.ticket, text: 'Too long' })).toEqual({ state: 'blocked' });
  expect(field.value).toBe('Existing history');
});

it('validates untrusted request and result unions', () => {
  expect(isRadiologyAutofillRequest({ operation: 'prepare' })).toBe(true);
  expect(isRadiologyAutofillRequest({ operation: 'fill', ticket: 'ticket', text: 'Notes\nNext line' })).toBe(true);
  for (const invalid of [null, {}, { operation: 'fill', ticket: 'ticket', text: '' }, { operation: 'fill', ticket: '', text: 'Notes' },
    { operation: 'fill', ticket: 'ticket', text: ' '.repeat(3) }, { operation: 'fill', ticket: 'ticket', text: 'n'.repeat(60001) },
    { operation: 'fill', ticket: 'ticket', text: 'A\0B' }]) expect(isRadiologyAutofillRequest(invalid)).toBe(false);
  for (const state of ['filled', 'blocked', 'unknown']) expect(isRadiologyAutofillResult({ state })).toBe(true);
  const prepared = { state: 'prepared', ticket: 'ticket', provider: 'radimal', origin: 'https://app.radimal.ai', title: 'Request',
    existing_characters: 0, expires_at: new Date(Date.now() + 60000).toISOString() };
  expect(isRadiologyAutofillResult(prepared)).toBe(true);
  expect(isRadiologyAutofillResult({ ...prepared, provider: 'vetology', origin: 'https://portal.vetology.net' })).toBe(true);
  for (const invalid of [null, {}, { state: 'saved' }, { ...prepared, provider: 'other' }, { ...prepared, origin: 'https://evil.example' },
    { ...prepared, origin: 'https://user:secret@app.radimal.ai' }, { ...prepared, origin: 'https://app.radimal.ai/path' },
    { ...prepared, ticket: '' }, { ...prepared, existing_characters: -1 }, { ...prepared, existing_characters: 1.5 },
    { ...prepared, expires_at: 'invalid' }]) expect(isRadiologyAutofillResult(invalid)).toBe(false);
});

it('disposes a replaced page instance and removes its navigation listeners', async () => {
  const target = new EventTarget();
  Object.defineProperty(window, 'navigation', { value: target, configurable: true });
  const removeWindow = vi.spyOn(window, 'removeEventListener'), removeNavigation = vi.spyOn(target, 'removeEventListener');
  const { module, prepare, field } = fixture(); const prepared = await prepare();
  module.dispose();
  expect(await module.execute({ operation: 'fill', ticket: prepared.ticket, text: 'Notes' })).toEqual({ state: 'blocked' });
  expect(await module.execute({ operation: 'prepare' })).toEqual({ state: 'blocked' });
  expect(field.value).toBe('Existing history');
  for (const event of ['hashchange', 'popstate', 'pagehide']) expect(removeWindow).toHaveBeenCalledWith(event, expect.any(Function));
  expect(removeNavigation).toHaveBeenCalledWith('navigate', expect.any(Function));
  delete (window as unknown as { navigation?: EventTarget }).navigation;
});
