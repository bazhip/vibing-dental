import { identifyPims } from './hosts';
import type { AdapterContext } from './types';

export type NoteProvider = 'pulse' | 'rhapsody' | 'vetspire';
export type NoteAutofillRequest = { operation: 'inspect' } | { operation: 'prepare'; field: string }
  | { operation: 'fill'; ticket: string; text: string };
type Destination = { provider: NoteProvider; origin: string; title: string };
export type NoteAutofillResult = (Destination & { state: 'fields'; fields: string[] })
  | (Destination & { state: 'prepared'; field: string; ticket: string; existing_characters: number; expires_at: string })
  | { state: 'filled' | 'blocked' | 'unknown' };
const MAX_TEXT = 60000, MAX_HTML = 360000;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max: number): value is string => typeof value === 'string' && !!value.trim() && value.length <= max
  && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
export function identifyNoteProvider(value: string): NoteProvider | null {
  try {
    const url = new URL(value), provider = identifyPims(value);
    return !url.port && (provider === 'pulse' || provider === 'rhapsody' || provider === 'vetspire') ? provider : null;
  } catch { return null; }
}
export function isNoteAutofillRequest(value: unknown): value is NoteAutofillRequest {
  return object(value) && (value.operation === 'inspect' || value.operation === 'prepare' && text(value.field, 500)
    || value.operation === 'fill' && text(value.ticket, 160) && text(value.text, MAX_TEXT));
}
export function isNoteAutofillResult(value: unknown): value is NoteAutofillResult {
  if (!object(value)) return false;
  if (['filled', 'blocked', 'unknown'].includes(String(value.state))) return true;
  if (!['fields', 'prepared'].includes(String(value.state)) || typeof value.origin !== 'string'
    || typeof value.title !== 'string' || value.title.length > 500) return false;
  try {
    if (new URL(value.origin).origin !== value.origin || !identifyNoteProvider(value.origin) || identifyNoteProvider(value.origin) !== value.provider) return false;
  } catch { return false; }
  if (value.state === 'fields') return Array.isArray(value.fields) && value.fields.length <= 100
    && value.fields.every(field => text(field, 500)) && new Set(value.fields).size === value.fields.length;
  return text(value.field, 500) && text(value.ticket, 160) && Number.isSafeInteger(value.existing_characters)
    && Number(value.existing_characters) >= 0 && Number(value.existing_characters) <= MAX_TEXT
    && typeof value.expires_at === 'string' && value.expires_at.length <= 100 && Number.isFinite(Date.parse(value.expires_at));
}

type Tiny = { focus(): void; getBody(): HTMLElement; getContent(): string;
  selection: { select(element: HTMLElement, contents: boolean): void; collapse(toStart: boolean): void };
  insertContent(html: string): void; setDirty(dirty: boolean): void };
type CK = { state: string; data: { processor: { toView(html: string): unknown }; toModel(view: unknown): unknown };
  model: { document: { getRoot(): unknown; selection: unknown }; change(callback: (writer: { createPositionAt(root: unknown, offset: 'end'): unknown; setSelection(position: unknown): void }) => void): void;
    insertContent(fragment: unknown, selection: unknown): void } };
type Editor = { title: string; element: HTMLElement; host: HTMLElement; kind: 'dom' | 'ck' | 'tiny'; api?: Tiny | CK; read(): string };
type Ticket = { editor: Editor; html: string; expires: number; generation: number; title: string };
const escaped = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\r\n?/g, '\n').replace(/\n/g, '<br>');

/** User-confirmed editor autofill only: no independently observed patient/encounter or saved-note claim. */
export function createNoteAutofill(context: AdapterContext): { execute(request: NoteAutofillRequest): Promise<NoteAutofillResult>; dispose(): void } {
  const doc = context.doc, root = doc.documentElement, href = context.url.href, provider = identifyNoteProvider(href), view = doc.defaultView;
  let invalid = false, generation = 0, initialSession: string | undefined, busy = false;
  const tickets = new Map<string, Ticket>();
  const invalidate = () => { invalid = true; generation++; tickets.clear(); };
  for (const event of ['hashchange', 'popstate', 'pagehide']) view?.addEventListener(event, invalidate);
  const navigation = (view as (Window & { navigation?: EventTarget }) | null)?.navigation;
  navigation?.addEventListener('navigate', invalidate);
  const session = (): string | null => {
    try {
      let values: (string | null)[];
      if (provider === 'pulse') {
        const tokens = doc.querySelectorAll<HTMLInputElement>('input[name="__RequestVerificationToken"]');
        if (tokens.length !== 1) return null;
        values = [tokens[0].value];
      } else if (provider === 'rhapsody') {
        const businesses = new URL(href).searchParams.getAll('businessId');
        const tokens = doc.cookie.split(';').map(part => part.trim()).filter(part => part.startsWith('JWT='));
        if (businesses.length !== 1 || tokens.length !== 1) return null;
        values = [businesses[0], tokens[0].slice(4)];
      } else if (provider === 'vetspire') values = [context.localStorage.getItem('authToken'), context.localStorage.getItem('__pref-location')];
      else return null;
      if (values.some(value => typeof value !== 'string' || !value.trim() || value.length > 65536)) return null;
      return JSON.stringify(values);
    } catch { return null; }
  };
  const current = (): boolean => {
    if (invalid) return false;
    const active = session();
    if (!provider || context.doc !== doc || doc.documentElement !== root || (context.currentUrl?.() ?? context.url).href !== href
      || identifyNoteProvider(href) !== provider || active === null || initialSession !== undefined && initialSession !== active) {
      invalidate(); return false;
    }
    initialSession = active; return true;
  };
  current();
  const visible = (element: HTMLElement): boolean => {
    if (!element.isConnected || element.closest('[hidden], [inert], [aria-hidden="true"], [disabled], [readonly], [aria-disabled="true"], [aria-readonly="true"]')) return false;
    for (let parent: HTMLElement | null = element; parent; parent = parent.parentElement) {
      const style = (parent.ownerDocument.defaultView ?? window).getComputedStyle(parent);
      if (style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility) || style.opacity === '0') return false;
    }
    const check = (element as HTMLElement & { checkVisibility?: (options?: object) => boolean }).checkVisibility;
    return !check || check.call(element, { checkOpacity: true, checkVisibilityCSS: true });
  };
  const domEditor = (title: string, element: HTMLElement, host: HTMLElement, ck = false): Editor | null => {
    if (!text(title, 500) || !visible(host) || !visible(element) || element.getAttribute('contenteditable') !== 'true') return null;
    if (!ck) return { title, element, host, kind: 'dom', read: () => element.innerHTML };
    const api = (element as HTMLElement & { ckeditorInstance?: CK }).ckeditorInstance;
    if (!api || api.state !== 'ready' || typeof api.data?.processor?.toView !== 'function' || typeof api.data.toModel !== 'function'
      || typeof api.model?.change !== 'function' || typeof api.model.insertContent !== 'function' || typeof api.model.document?.getRoot !== 'function') return null;
    return { title, element, host, kind: 'ck', api, read: () => element.innerHTML };
  };
  const tinyEditor = (title: string, iframe: HTMLIFrameElement): Editor | null => {
    if (!text(title, 500) || !visible(iframe) || !iframe.id.endsWith('_ifr')) return null;
    try {
      const globals = view as (Window & { tinymce?: { get(id: string): Tiny | null }; tinyMCE?: { get(id: string): Tiny | null } }) | null;
      const api = (globals?.tinymce ?? globals?.tinyMCE)?.get(iframe.id.slice(0, -4));
      if (!api || typeof api.getBody !== 'function' || typeof api.getContent !== 'function' || typeof api.insertContent !== 'function'
        || typeof api.focus !== 'function' || typeof api.selection?.select !== 'function' || typeof api.selection.collapse !== 'function' || typeof api.setDirty !== 'function') return null;
      const body = api.getBody();
      if (body !== iframe.contentDocument?.body || body.getAttribute('contenteditable') !== 'true' || !visible(body)) return null;
      return { title, element: body, host: iframe, kind: 'tiny', api, read: () => api.getContent() };
    } catch { return null; }
  };
  const inScope = (title: string, scope: Element): Editor | null => {
    const candidates = [
      ...Array.from(scope.querySelectorAll<HTMLIFrameElement>('iframe')).filter(visible).map(frame => tinyEditor(title, frame)),
      ...Array.from(scope.querySelectorAll<HTMLElement>('[contenteditable="true"]')).filter(visible).map(editor => domEditor(title, editor, editor)),
    ].filter((editor): editor is Editor => editor !== null);
    return candidates.length === 1 ? candidates[0] : null;
  };
  const editors = (): Editor[] => {
    if (!current()) return [];
    let result: Editor[] = [];
    if (provider === 'vetspire') {
      for (const section of Array.from(doc.querySelectorAll<HTMLElement>('#sectionContainer > div[id]')).filter(visible)) {
        const candidates = Array.from(section.querySelectorAll<HTMLElement>('div.ql-editor[contenteditable="true"]')).filter(visible);
        if (candidates.length === 1) { const editor = domEditor(section.id, candidates[0], section); if (editor) result.push(editor); }
      }
    } else if (provider === 'rhapsody') {
      // Only an already-open, unambiguously selected tab. No click followed by a guessed editor.
      const selected = Array.from(doc.querySelectorAll<HTMLButtonElement>('button[role="tab"][aria-selected="true"]'))
        .filter(button => visible(button) && ['Medical notes', 'Discharge notes'].includes(button.textContent?.trim() ?? ''));
      const candidates = Array.from(doc.querySelectorAll<HTMLElement>('.ck-editor__editable[contenteditable="true"]')).filter(visible);
      if (selected.length === 1 && candidates.length === 1) {
        const editor = domEditor(selected[0].textContent!.trim(), candidates[0], selected[0], true); if (editor) result.push(editor);
      }
    } else if (provider === 'pulse') {
      const sidebars = Array.from(doc.querySelectorAll<HTMLElement>('[role="complementary"].p-sidebar-active')).filter(visible);
      if (sidebars.length) {
        if (sidebars.length !== 1) return [];
        const headers = Array.from(sidebars[0].querySelectorAll<HTMLElement>('.covetrus-sidebar-header-title')).filter(visible);
        if (headers.length === 1) { const editor = inScope(headers[0].textContent?.replace(/\s+/g, ' ').trim() ?? '', sidebars[0]); if (editor) result.push(editor); }
      } else {
        for (const section of Array.from(doc.querySelectorAll<HTMLElement>('medical-record-question-section, medical-record-patient-form-section')).filter(visible)) {
          const titles = Array.from(section.querySelectorAll<HTMLElement>('span.ds-text-h4')).filter(visible);
          if (titles.length === 1) { const editor = inScope(titles[0].textContent?.trim() ?? '', section); if (editor) result.push(editor); }
        }
        for (const fieldset of Array.from(doc.querySelectorAll<HTMLElement>('fieldset')).filter(visible)) {
          const legend = fieldset.querySelector<HTMLElement>(':scope > legend');
          if (!legend || !visible(legend)) continue;
          const title = context.url.pathname.includes('/Notes/AddNote') && legend.textContent?.includes('Note Details') ? 'Medical Notes' : legend.textContent?.trim() ?? '';
          const editor = inScope(title, fieldset); if (editor) result.push(editor);
        }
        if (context.url.pathname.includes('Patients/EditAndGenerateDocument')) {
          const frames = Array.from(doc.querySelectorAll<HTMLIFrameElement>('form[action*="/Practice/Patients/EditAndGenerateDocument/"] iframe#Text_ifr')).filter(visible);
          if (frames.length === 1) { const editor = tinyEditor('Patient Documents', frames[0]); if (editor) result.push(editor); }
        }
      }
    }
    // Ambiguous duplicate field titles must never silently choose a destination.
    result = result.filter((editor, index) => result.findIndex(other => other.element === editor.element) === index);
    return result.filter(editor => result.filter(other => other.title === editor.title).length === 1);
  };
  const same = (ticket: Ticket, html: string): boolean => {
    if (!current() || Date.now() >= ticket.expires || ticket.generation !== generation || doc.title !== ticket.title) return false;
    const found = editors().filter(editor => editor.title === ticket.editor.title);
    return found.length === 1 && found[0].element === ticket.editor.element && found[0].host === ticket.editor.host
      && found[0].api === ticket.editor.api && found[0].kind === ticket.editor.kind && found[0].read() === html;
  };
  const plain = (html: string): string => { const node = doc.createElement('div'); node.innerHTML = html.replace(/<br\s*\/?\s*>/gi, ' ').replace(/<\/(?:p|div|li|h[1-6])>/gi, ' '); return (node.textContent ?? '').replace(/\s+/g, ' ').trim(); };
  return {
    dispose() { invalidate(); for (const event of ['hashchange', 'popstate', 'pagehide']) view?.removeEventListener(event, invalidate); navigation?.removeEventListener('navigate', invalidate); },
    async execute(request): Promise<NoteAutofillResult> {
      if (busy) return { state: 'blocked' };
      busy = true; let mutated = false;
      try {
        if (!isNoteAutofillRequest(request) || !current() || !provider) return { state: 'blocked' };
        const destination = { provider, origin: new URL(href).origin, title: doc.title.slice(0, 500) };
        if (request.operation === 'inspect') return { ...destination, state: 'fields', fields: editors().map(editor => editor.title).slice(0, 100) };
        if (request.operation === 'prepare') {
          tickets.clear();
          const found = editors().filter(editor => editor.title === request.field);
          if (found.length !== 1) return { state: 'blocked' };
          const editor = found[0], html = editor.read();
          if (html.length > MAX_HTML || plain(html).length > MAX_TEXT || !current()) return { state: 'blocked' };
          const ticket = crypto.randomUUID(), expires = Date.now() + 120000;
          tickets.set(ticket, { editor, html, expires, generation, title: doc.title });
          return { ...destination, state: 'prepared', ticket, field: editor.title, existing_characters: plain(html).length, expires_at: new Date(expires).toISOString() };
        }
        const prepared = tickets.get(request.ticket); tickets.delete(request.ticket);
        if (!prepared || Date.now() >= prepared.expires || !same(prepared, prepared.html)) return { state: 'blocked' };
        const html = `${prepared.html ? '<br>' : ''}${escaped(request.text)}`;
        if (prepared.html.length + html.length > MAX_HTML || plain(prepared.html).length + request.text.length + 1 > MAX_TEXT) return { state: 'blocked' };
        const editor = prepared.editor;
        if (editor.kind === 'ck') {
          const api = editor.api as CK;
          const fragment = api.data.toModel(api.data.processor.toView(html));
          if (!same(prepared, prepared.html)) return { state: 'blocked' };
          api.model.change(writer => {
            writer.setSelection(writer.createPositionAt(api.model.document.getRoot(), 'end'));
            if (!same(prepared, prepared.html)) throw new TypeError();
            mutated = true; api.model.insertContent(fragment, api.model.document.selection);
          });
        } else if (editor.kind === 'tiny') {
          const api = editor.api as Tiny;
          api.focus(); if (!same(prepared, prepared.html)) return { state: 'blocked' };
          api.selection.select(editor.element, true); if (!same(prepared, prepared.html)) return { state: 'blocked' };
          api.selection.collapse(false); if (!same(prepared, prepared.html)) return { state: 'blocked' };
          mutated = true; api.insertContent(html);
        } else { mutated = true; editor.element.innerHTML = prepared.html + html; }
        const inserted = editor.read();
        const expectedText = [plain(prepared.html), request.text.replace(/\s+/g, ' ').trim()].filter(Boolean).join(' ');
        if (plain(inserted) !== expectedText || !same(prepared, inserted)) return { state: 'unknown' };
        if (editor.kind === 'tiny') {
          (editor.api as Tiny).setDirty(true); if (!same(prepared, inserted)) return { state: 'unknown' };
        } else if (editor.kind === 'dom') {
          const ownerView = editor.element.ownerDocument.defaultView;
          if (provider === 'pulse') {
            const KeyboardType = ownerView?.KeyboardEvent ?? KeyboardEvent;
            const notifications = [['keydown', ' ', 'Space', 32], ['keypress', ' ', 'Space', 32], ['keyup', ' ', 'Space', 32],
              ['keydown', 'Backspace', 'Backspace', 8], ['keyup', 'Backspace', 'Backspace', 8]] as const;
            for (const [event, key, code, keyCode] of notifications) {
              editor.element.dispatchEvent(new KeyboardType(event, { key, code, keyCode, which: keyCode, bubbles: true }));
              if (!same(prepared, inserted)) return { state: 'unknown' };
            }
          }
          const EventType = ownerView?.Event ?? Event;
          for (const event of ['input', 'change']) {
            editor.element.dispatchEvent(new EventType(event, { bubbles: true }));
            if (!same(prepared, inserted)) return { state: 'unknown' };
          }
        }
        await context.wait(0);
        return same(prepared, inserted) ? { state: 'filled' } : { state: 'unknown' };
      } catch { return { state: mutated ? 'unknown' : 'blocked' }; }
      finally { busy = false; }
    },
  };
}
