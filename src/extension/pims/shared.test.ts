import { describe, expect, it, vi } from 'vitest';
import { appendText, dayBounds, plainHtml, readJson, routeStatus } from './shared';
import type { AdapterContext } from './types';

const context = () => ({ doc: document, url: new URL('https://app.shepherd.vet/soap/123') }) as AdapterContext;

describe('shared PIMS safeguards', () => {
  it('never follows authenticated API redirects and preserves caller cancellation', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.redirect).toBe('error');
      controller.abort();
      expect(init?.signal?.aborted).toBe(true);
      return { ok: true, json: async () => ({}) } as Response;
    });
    await readJson({ ...context(), fetch: fetcher as unknown as typeof fetch }, '/api', { signal: controller.signal });
  });
  it('requires a stable encounter and an editable target', () => {
    expect(routeStatus(context(), 'patient', null, true).state).not.toBe('writable');
    expect(routeStatus(context(), 'patient', 'visit', false).state).not.toBe('writable');
    expect(routeStatus(context(), 'patient', 'visit', true).consult).toEqual({
      viewId: 'https://app.shepherd.vet/soap/123|patient', recordId: 'visit',
    });
  });
  it('appends text through the native setter and emits framework events', () => {
    const input = document.createElement('textarea');
    input.value = 'Existing';
    const events: string[] = [];
    input.addEventListener('input', () => events.push('input'));
    input.addEventListener('change', () => events.push('change'));
    appendText(input, 'New');
    expect(input.value).toBe('Existing\nNew');
    expect(events).toEqual(['input', 'change']);
  });
  it('escapes plain text instead of turning it into executable HTML', () => {
    expect(plainHtml({ fieldTitle: 'Plan', text: '<img onerror=bad>\nNext' })).toBe('&lt;img onerror=bad&gt;<br>Next');
  });
  it('rejects invalid dates and uses local calendar boundaries', () => {
    expect(dayBounds('2026-02-30')).toBeNull();
    expect(dayBounds('bad')).toBeNull();
    const bounds = dayBounds('2026-11-16')!;
    expect(new Date(bounds.start).getHours()).toBe(0);
    expect(new Date(bounds.end).getHours()).toBe(0);
    expect(new Date(bounds.end).getDate()).toBe(17);
  });
});
