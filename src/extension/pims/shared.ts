import type { AdapterContext, AppointmentsResult, SendItem, Status } from './types';
export { isVisible } from '../ezyvet/read';

export function routeStatus(context: AdapterContext, patientId: string | null, recordId: string | null, editable: boolean): Status {
  return {
    state: !recordId ? 'notConsult' : editable ? 'writable' : 'locked',
    patientName: null,
    patientNumber: null,
    consult: recordId ? { viewId: `${context.url.href}|${patientId ?? ''}`, recordId } : null,
  };
}

export function appendText(input: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  const prototype = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  setter?.call(input, input.value ? `${input.value}\n${text}` : text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

export function plainHtml(item: SendItem): string {
  if (item.html !== undefined) return item.html;
  return (item.text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '<br>');
}

export async function readJson(context: AdapterContext, url: string, init?: RequestInit): Promise<unknown> {
  const timeout = AbortSignal.timeout(15_000);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  const response = await context.fetch(url, { credentials: 'include', ...init, redirect: 'error', signal });
  if (!response.ok) throw new TypeError();
  return response.json();
}

export function dayBounds(date: string): { start: string; end: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [year, month, day] = date.split('-').map(Number);
  const start = new Date(year, month - 1, day);
  if (start.getFullYear() !== year || start.getMonth() !== month - 1 || start.getDate() !== day) return null;
  const end = new Date(year, month - 1, day + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function readFailed(): AppointmentsResult {
  return { ok: false, code: 'read_failed' };
}
