// Writing side of the ezyVet page script: one writer per field kind (spec §2). Every failure is a
// specific code naming the step that failed. All waits are bounded (see `waits`).
import type { SendItem } from '../../utils/pims/mapping';
import { isVisible, listFieldElements, status } from './read';
import * as S from './selectors';
import { matchField } from './matchField';
import { withTemplateGuard } from './templateGuard';

export type WriteCode =
  | 'not_writable'
  | 'field_not_found'
  | 'editor_not_found'
  | 'popup_not_found'
  | 'popup_not_closed'
  | 'save_button_not_found'
  | 'save_not_confirmed'
  | 'no_preferred_email'
  | 'image_not_accepted'
  | 'invalid_image';

export type WriteResult = { ok: true; guardSkipped?: boolean } | { ok: false; code: WriteCode };

/** Wait limits. Mutable so tests can shorten them. */
export const waits = { timeoutMs: 10_000, pollMs: 50 };

class Fail extends Error {
  constructor(readonly code: WriteCode) {
    // eslint-disable-next-line no-restricted-syntax -- dev-only: internal control flow, caught in write() and turned into a code
    super(code);
  }
}

/** Resolves with the first truthy result of `probe`, or null after the timeout. Re-checks on DOM
 *  mutations and on a short poll (some state, such as HugeRTE, is not in the DOM). */
function waitFor<T>(doc: Document, probe: () => T | null | undefined | false): Promise<T | null> {
  return new Promise((resolve) => {
    const win = doc.defaultView ?? window;
    let done = false;
    let observer: MutationObserver | null = null;
    let poll: number | undefined;
    let timer: number | undefined;
    const finish = (value: T | null) => {
      if (done) return;
      done = true;
      observer?.disconnect();
      win.clearInterval(poll);
      win.clearTimeout(timer);
      resolve(value);
    };
    const check = () => {
      let v: T | null | undefined | false = null;
      try {
        v = probe();
      } catch {
        v = null;
      }
      if (v) finish(v);
    };
    check();
    if (done) return;
    observer = new MutationObserver(check);
    observer.observe(doc, { subtree: true, childList: true, attributes: true });
    poll = win.setInterval(check, waits.pollMs);
    timer = win.setTimeout(() => finish(null), waits.timeoutMs);
  });
}

const PNG_RE = /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/;
function validPng(url: string): boolean {
  return PNG_RE.test(url) && (url.length - url.indexOf(',') - 1) % 4 === 0;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function richContent(item: SendItem): string {
  let out =
    item.html ??
    (item.text !== undefined
      ? item.text
          .split(/\r?\n/)
          .map((l) => `<p>${escapeHtml(l)}</p>`)
          .join('')
      : '');
  if (item.pngDataUrl) out += `<p><img src="${item.pngDataUrl}"></p>`;
  return out;
}

function click(el: Element) {
  (el as HTMLElement).click();
}

// ---------- Lexical note fields ----------

type LexicalNodeLike = { append: (...n: unknown[]) => unknown; clear?: () => unknown };
type LexicalEditorLike = {
  _nodes: Map<string, { klass: new (text?: string) => LexicalNodeLike }>;
  update: (fn: () => void, opts?: { discrete?: boolean }) => void;
  _pendingEditorState?: { _nodeMap: Map<string, LexicalNodeLike> } | null;
  getEditorState: () => { _nodeMap: Map<string, LexicalNodeLike> };
};
type EditableEl = Element & { __lexicalEditor?: LexicalEditorLike };

function emptyEditors(section: Element): EditableEl[] {
  return Array.from(section.querySelectorAll(S.NOTE_EDITABLE)).filter(
    (el) => (el.textContent ?? '').trim() === '',
  ) as EditableEl[];
}

function pointerdown(el: Element) {
  const Ctor = typeof PointerEvent === 'function' ? PointerEvent : MouseEvent;
  el.dispatchEvent(new Ctor('pointerdown', { bubbles: true, cancelable: true }));
}

async function writeNote(doc: Document, section: Element, item: SendItem) {
  let entry: EditableEl | undefined = emptyEditors(section)[0];
  if (!entry) {
    const add = section.querySelector(S.ADD_NOTE_BUTTON);
    if (!add) throw new Fail('editor_not_found');
    click(add);
    entry = (await waitFor(doc, () => emptyEditors(section)[0])) ?? undefined;
  }
  const editor = entry?.__lexicalEditor;
  if (!entry || !editor) throw new Fail('editor_not_found');
  const paragraph = editor._nodes?.get('paragraph')?.klass;
  const text = editor._nodes?.get('text')?.klass;
  if (!paragraph || !text) throw new Fail('editor_not_found');

  const lines = (item.text ?? '').split(/\r?\n/);
  editor.update(
    () => {
      const root = (editor._pendingEditorState ?? editor.getEditorState())._nodeMap.get('root');
      if (!root) throw new Fail('editor_not_found');
      root.clear?.(); // only ever an empty entry, so nothing existing is lost
      for (const line of lines) {
        const p = new paragraph();
        if (line !== '') p.append(new text(line));
        root.append(p);
      }
    },
    { discrete: true },
  );

  // ezyVet saves an entry on a pointerdown outside it, once armed by one inside it.
  pointerdown(entry);
  const away = doc.createElement('button');
  away.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px';
  doc.body.appendChild(away);
  try {
    pointerdown(away);
  } finally {
    away.remove();
  }
}

// ---------- popups ----------

function setTextarea(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function visibleFormboxes(doc: Document): Element[] {
  return Array.from(doc.querySelectorAll(S.FORMBOX)).filter(
    (f) => f.querySelector(S.POPUP_FORM_INTERNAL) && isVisible(f),
  );
}

function addTarget(titleNode: Element): Element | null {
  const add = titleNode.querySelector(S.POPUP_ADD_BUTTON) ?? titleNode.querySelector('.addButton');
  if (!add) return null;
  return add.querySelector('button, [role="button"]') ?? add;
}

async function openPopup(doc: Document, titleNode: Element): Promise<Element> {
  const target = addTarget(titleNode);
  if (!target) throw new Fail('popup_not_found');
  const before = new Set(visibleFormboxes(doc));
  click(target);
  const box = await waitFor(doc, () => visibleFormboxes(doc).find((f) => !before.has(f)));
  if (!box) throw new Fail('popup_not_found');
  return box;
}

function closePopup(box: Element) {
  const close = box.querySelector(S.POPUP_CLOSE_BUTTON);
  if (close) click(close);
}

async function saveAndConfirm(doc: Document, box: Element, saveSelector: string, notConfirmed: WriteCode) {
  const save = box.querySelector(saveSelector);
  if (!save) throw new Fail('save_button_not_found');
  click(save);
  const closed = await waitFor(doc, () => !box.isConnected || !isVisible(box));
  if (!closed) throw new Fail(notConfirmed);
}

async function writePlainPopup(doc: Document, titleNode: Element, text: string) {
  const box = await openPopup(doc, titleNode);
  const area = box.querySelector<HTMLTextAreaElement>(S.POPUP_TEXTAREA);
  if (!area) throw new Fail('editor_not_found');
  setTextarea(area, text);
  await saveAndConfirm(doc, box, S.POPUP_SAVE_BUTTON, 'popup_not_closed');
}

async function writeInPerson(doc: Document, titleNode: Element, text: string) {
  const box = await openPopup(doc, titleNode);
  const method = box.querySelector(S.CONTACT_IN_PERSON);
  if (!method) throw new Fail('popup_not_found');
  click(method);
  const area = await waitFor(doc, () => box.querySelector<HTMLTextAreaElement>(S.IN_PERSON_TEXTAREA));
  if (!area) throw new Fail('editor_not_found');
  setTextarea(area, text);
  await saveAndConfirm(doc, box, S.IN_PERSON_ADD, 'popup_not_closed');
}

// ---------- HugeRTE ----------

type HugeRteEditor = {
  initialized?: boolean;
  setContent: (html: string) => void;
  focus?: () => void;
  fire?: (name: string) => void;
  save?: () => void;
  setDirty?: (dirty: boolean) => void;
};
type HugeRteGlobal = { activeEditor?: HugeRteEditor | null; editors?: HugeRteEditor[] };

function currentHugeRte(win: Window): HugeRteEditor | null {
  const h = (win as Window & { hugerte?: HugeRteGlobal }).hugerte;
  if (!h) return null;
  const ed = h.activeEditor ?? h.editors?.[h.editors.length - 1] ?? null;
  return ed && ed.initialized !== false ? ed : null;
}

function fillHugeRte(ed: HugeRteEditor, html: string) {
  ed.focus?.();
  ed.setContent(html);
  ed.fire?.('input');
  ed.fire?.('change');
  ed.save?.();
  ed.setDirty?.(true);
}

async function writeEmail(doc: Document, win: Window, titleNode: Element, item: SendItem) {
  const box = await openPopup(doc, titleNode);
  const method = box.querySelector(S.CONTACT_EMAIL);
  if (!method) throw new Fail('popup_not_found');
  click(method);
  const to = await waitFor(doc, () => box.querySelector(S.EMAIL_TO_INPUT));
  if (!to) throw new Fail('popup_not_found');
  // Only the client's preferred address, never another one.
  const preferred = box.querySelector(S.PREFERRED_ADDRESS);
  if (!preferred) {
    closePopup(box);
    throw new Fail('no_preferred_email');
  }
  click(preferred);
  const pending = box.querySelector(S.EMAIL_STATUS_PENDING);
  if (pending) click(pending);
  const ed = await waitFor(doc, () => currentHugeRte(win));
  if (!ed) throw new Fail('editor_not_found');
  fillHugeRte(ed, richContent(item));
  await saveAndConfirm(doc, box, S.POPUP_SAVE_BUTTON, 'popup_not_closed');
}

async function writeDischargeSummary(doc: Document, win: Window, titleNode: Element, item: SendItem) {
  const target = addTarget(titleNode);
  if (!target) throw new Fail('popup_not_found');
  click(target);
  // A template chooser may come first; cancel it, then wait for the editor.
  const ed = await waitFor(doc, () => {
    const cancel = doc.querySelector(S.TEMPLATE_CHOOSER_CANCEL);
    if (cancel && isVisible(cancel)) click(cancel);
    return currentHugeRte(win);
  });
  if (!ed) throw new Fail('editor_not_found');
  fillHugeRte(ed, richContent(item));
  let save: Element | null = null;
  for (const sel of S.DISCHARGE_SAVE_CLOSE) {
    save = doc.querySelector(sel);
    if (save) break;
  }
  if (!save) throw new Fail('save_button_not_found');
  const button = save;
  click(button);
  const closed = await waitFor(doc, () => !button.isConnected || !isVisible(button));
  if (!closed) throw new Fail('save_not_confirmed');
}

// ---------- entry ----------

export async function write(item: SendItem, doc: Document = document): Promise<WriteResult> {
  if (item.text === undefined && item.html === undefined && item.pngDataUrl === undefined) {
    // eslint-disable-next-line no-restricted-syntax -- dev-only: callers never build an item with no content
    throw new Error('write() needs text, html or pngDataUrl');
  }
  if (status(doc).state !== 'writable') return { ok: false, code: 'not_writable' };

  const fields = listFieldElements(doc);
  const title = matchField(item.fieldTitle, fields.map((f) => f.title));
  const field = title === null ? undefined : fields.find((f) => f.title === title);
  if (!field) return { ok: false, code: 'field_not_found' };

  if (item.pngDataUrl !== undefined) {
    if (!field.acceptsImage) return { ok: false, code: 'image_not_accepted' };
    if (!validPng(item.pngDataUrl)) return { ok: false, code: 'invalid_image' };
  }

  const win = doc.defaultView ?? window;
  const text = item.text ?? '';
  try {
    const { guardSkipped } = await withTemplateGuard(win, async () => {
      switch (field.kind) {
        case 'note':
          return writeNote(doc, field.node, item);
        case 'popup':
          return writePlainPopup(doc, field.node, text);
        case 'inPerson':
          return writeInPerson(doc, field.node, text);
        case 'email':
          return writeEmail(doc, win, field.node, item);
        case 'dischargeSummary':
          return writeDischargeSummary(doc, win, field.node, item);
      }
    });
    return guardSkipped ? { ok: true, guardSkipped: true } : { ok: true };
  } catch (e) {
    if (e instanceof Fail) return { ok: false, code: e.code };
    throw e;
  }
}
