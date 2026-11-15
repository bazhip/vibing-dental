import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waits, write } from './write';

const dir = resolve(__dirname, '__fixtures__');
const PNG = 'data:image/png;base64,iVBORw0KGgo=';
type W = Window & Record<string, unknown>;
const w = window as unknown as W;

function load(name: string) {
  document.body.innerHTML = readFileSync(resolve(dir, name), 'utf8');
}

// ---- fakes ----
class FakeText {
  constructor(readonly text: string) {}
}
class FakeParagraph {
  children: FakeText[] = [];
  append(t: FakeText) {
    this.children.push(t);
  }
}
function fakeLexical(el: Element, opts: { swallow?: boolean } = {}) {
  const swallow = !!opts.swallow;
  const paragraphs: FakeParagraph[] = [];
  const root = {
    clear: () => (paragraphs.length = 0),
    append: (p: FakeParagraph) => paragraphs.push(p),
  };
  const editor = {
    _nodes: new Map<string, unknown>([
      ['paragraph', { klass: FakeParagraph }],
      ['text', { klass: FakeText }],
    ]),
    update: vi.fn((fn: () => void, opts?: unknown) => {
      editor.lastOpts = opts;
      if (swallow) return; // like Lexical routing an error to onError
      fn();
      el.innerHTML = paragraphs.map((p) => `<p>${p.children.map((c) => c.text).join('')}</p>`).join('');
    }),
    lastOpts: undefined as unknown,
    getEditorState: () => ({ _nodeMap: new Map([['root', root]]) }),
  };
  (el as unknown as { __lexicalEditor: unknown }).__lexicalEditor = editor;
  return {
    editor,
    get paragraphs() {
      return paragraphs.map((p) => p.children.map((c) => c.text).join(''));
    },
  };
}

function planSection(): Element {
  return Array.from(document.querySelectorAll('.sectionContent')).filter((s) => !s.hasAttribute('hidden') && s.querySelector('h2')?.textContent?.startsWith('Plan'))[0];
}
function addEmptyEntry(section: Element) {
  const el = document.createElement('div');
  el.setAttribute('contenteditable', 'true');
  section.appendChild(el);
  return el;
}

function fakeHugeRte() {
  const ed = {
    initialized: true,
    content: '',
    dirty: false,
    events: [] as string[],
    saved: false,
    container: document.createElement('div'),
    getContainer() {
      return ed.container;
    },
    /** Make the editor exist, inside `parent`, as ezyVet does when a popup or document opens. */
    mount(parent: Element) {
      parent.appendChild(ed.container);
      const h = hugeGlobal();
      h.editors.push(ed);
      h.activeEditor = ed;
    },
    setContent(h: string) {
      ed.content = h;
    },
    insertContent: vi.fn(),
    focus: vi.fn(),
    fire(n: string) {
      ed.events.push(n);
    },
    save() {
      ed.saved = true;
    },
    setDirty(d: boolean) {
      ed.dirty = d;
    },
  };
  return ed;
}
type FakeHuge = ReturnType<typeof fakeHugeRte>;
function hugeGlobal() {
  const g = (w.hugerte ??= { editors: [], activeEditor: null }) as { editors: FakeHuge[]; activeEditor: FakeHuge | null };
  return g;
}
const pane = () => document.querySelector('#rtab1details')!;

function addButtonOf(testid: string): HTMLElement {
  return document.querySelector(`[data-testid="${testid}"]`) as HTMLElement;
}
function openOnClick(testid: string, html: string, onOpen?: (box: HTMLElement) => void) {
  addButtonOf(testid).addEventListener('click', () => {
    const box = document.createElement('div');
    box.id = 'formbox1';
    box.innerHTML = html;
    document.body.appendChild(box);
    onOpen?.(box);
  });
}

let jaxRequest: ReturnType<typeof vi.fn>;
const noSubmit = (e: Event) => e.preventDefault();
beforeEach(() => {
  document.addEventListener('submit', noSubmit); // jsdom: fixture buttons live inside a form
  load('consult-medical.html');
  jaxRequest = vi.fn();
  w.jaxmanager = { request: jaxRequest };
  waits.timeoutMs = 150;
  waits.pollMs = 10;
});
afterEach(() => {
  document.removeEventListener('submit', noSubmit);
  delete w.jaxmanager;
  delete w.hugerte;
  document.body.innerHTML = '';
  waits.timeoutMs = 10_000;
  waits.pollMs = 50;
});

describe('write', () => {
  it('refuses when not writable', async () => {
    load('consult-locked.html');
    expect(await write({ fieldTitle: 'Plan', text: 'a' })).toEqual({ ok: false, code: 'not_writable' });
  });

  it('throws a dev error for an empty item', async () => {
    await expect(write({ fieldTitle: 'Plan' })).rejects.toThrow();
  });

  it('unknown field', async () => {
    expect(await write({ fieldTitle: 'Nope', text: 'a' })).toEqual({ ok: false, code: 'field_not_found' });
  });

  describe('note', () => {
    it('new entry, one paragraph per line, existing untouched, save triggered', async () => {
      const plan = planSection();
      const lex = fakeLexical(addEmptyEntry(plan));
      const existing = plan.querySelector('[contenteditable]')!;
      const events: Array<[string, boolean]> = [];
      const entry = plan.querySelectorAll('[contenteditable]')[1];
      document.addEventListener('pointerdown', (e) => events.push([e.type, entry.contains(e.target as Node)]), { once: false });
      const r = await write({ fieldTitle: 'Plan', text: 'line 1\nline 2' });
      expect(r).toEqual({ ok: true });
      expect(lex.paragraphs).toEqual(['line 1', 'line 2']);
      expect(lex.editor.lastOpts).toEqual({ discrete: true });
      expect(existing.textContent).toBe('Fixture plan text');
      expect(events).toEqual([['pointerdown', true], ['pointerdown', false]]);
      expect(document.body.querySelectorAll('button[style*="-9999px"]').length).toBe(0);
    });

    it('clicks Add Note and waits for a new editor when none is empty', async () => {
      const sec = Array.from(document.querySelectorAll('.sectionContent')).find((s) => s.querySelector('h2')?.textContent === 'History')!;
      sec.insertAdjacentHTML('beforeend', '<div class="add-note-button"><svg aria-label="Add Note"></svg></div>');
      let lex: ReturnType<typeof fakeLexical> | undefined;
      sec.querySelector('.add-note-button')!.addEventListener('click', () => {
        setTimeout(() => (lex = fakeLexical(addEmptyEntry(sec))), 20);
      });
      expect(await write({ fieldTitle: 'History', text: 'x' })).toEqual({ ok: true });
      expect(lex!.paragraphs).toEqual(['x']);
    });

    it('an entry holding only an image is not chosen or cleared', async () => {
      const plan = planSection();
      const el = addEmptyEntry(plan);
      el.innerHTML = '<img src="x.png">';
      const lex = fakeLexical(el);
      expect(await write({ fieldTitle: 'Plan', text: 'a' })).toEqual({ ok: false, code: 'editor_not_found' });
      expect(lex.editor.update).not.toHaveBeenCalled();
      expect(el.innerHTML).toBe('<img src="x.png">');
    });

    it('fails when Lexical swallows an error inside update', async () => {
      const plan = planSection();
      fakeLexical(addEmptyEntry(plan), { swallow: true });
      const events: string[] = [];
      document.addEventListener('pointerdown', (e) => events.push(e.type));
      expect(await write({ fieldTitle: 'Plan', text: 'a' })).toEqual({ ok: false, code: 'editor_not_found' });
      expect(events).toEqual([]);
    });

    it('image refused before touching the page', async () => {
      const spy = vi.fn();
      document.body.addEventListener('click', spy);
      expect(await write({ fieldTitle: 'Plan', pngDataUrl: PNG })).toEqual({ ok: false, code: 'image_not_accepted' });
      expect(spy).not.toHaveBeenCalled();
    });

    it('missing lexical editor', async () => {
      addEmptyEntry(planSection());
      expect(await write({ fieldTitle: 'Plan', text: 'a' })).toEqual({ ok: false, code: 'editor_not_found' });
    });
  });

  describe('popup', () => {
    const popupHtml = '<div class="popupFormInternal"><textarea></textarea><button id="saveRecord9"></button></div>';
    it('fills textarea and saves', async () => {
      let saved = '';
      openOnClick('AddVetCommunication', popupHtml, (box) => {
        box.querySelector('#saveRecord9')!.addEventListener('click', () => {
          saved = box.querySelector('textarea')!.value;
          box.remove();
        });
      });
      expect((await write({ fieldTitle: 'Vet Communication', text: 'a' })).ok).toBe(true);
      expect(saved).toBe('a');
      expect(jaxRequest).not.toHaveBeenCalled();
    });

    it('popup_not_found when nothing opens', async () => {
      expect(await write({ fieldTitle: 'Vet Communication', text: 'a' })).toEqual({ ok: false, code: 'popup_not_found' });
    });

    it('save_button_not_found', async () => {
      openOnClick('AddVetCommunication', '<div class="popupFormInternal"><textarea></textarea></div>');
      expect(await write({ fieldTitle: 'Vet Communication', text: 'a' })).toEqual({ ok: false, code: 'save_button_not_found' });
    });

    it('popup_not_closed when the popup stays', async () => {
      openOnClick('AddVetCommunication', popupHtml);
      expect(await write({ fieldTitle: 'Vet Communication', text: 'a' })).toEqual({ ok: false, code: 'popup_not_closed' });
    });
  });

  describe('Client Communication', () => {
    const chooser =
      '<div class="popupFormInternal"><div class="clickable contactMethodSelectionItem" title="Email"></div>' +
      '<div class="clickable contactMethodSelectionItem" title="In Person"></div></div>';

    it('in person: textarea then Add', async () => {
      let saved = '';
      openOnClick('AddClientCommunication', chooser, (box) => {
        box.querySelector('[title="In Person"]')!.addEventListener('click', () => {
          box.querySelector('.popupFormInternal')!.insertAdjacentHTML(
            'beforeend',
            '<textarea name="communicationdata_content"></textarea><button data-testid="Add"></button>',
          );
          box.querySelector('[data-testid="Add"]')!.addEventListener('click', () => {
            saved = box.querySelector('textarea')!.value;
            box.remove();
          });
        });
      });
      expect((await write({ fieldTitle: 'Client Communication > In Person', text: 'hi' })).ok).toBe(true);
      expect(saved).toBe('hi');
    });

    function emailPopup(withPreferred: boolean, opts: { toValue?: string } = {}) {
      const ed = fakeHugeRte();
      let closed = false;
      let saved = false;
      let pendingClicked = false;
      let preferredClicked = false;
      openOnClick('AddClientCommunication', chooser + '<button class="closeButton"></button><button id="saveRecord3"></button>', (box) => {
        box.querySelector('.closeButton')!.addEventListener('click', () => {
          closed = true;
          box.remove();
        });
        box.querySelector('#saveRecord3')!.addEventListener('click', () => {
          saved = true;
          box.remove();
        });
        box.querySelector('[title="Email"]')!.addEventListener('click', () => {
          box.querySelector('.popupFormInternal')!.insertAdjacentHTML(
            'beforeend',
            '<input name="communicationdata_to">' +
              '<span class="other">other@x.com</span>' +
              (withPreferred ? '<span class="preferredMethod">pref@x.com</span>' : '') +
              '<input type="radio" value="Pending">',
          );
          box.querySelector('.preferredMethod')?.addEventListener('click', () => {
            preferredClicked = true;
            box.querySelector<HTMLInputElement>('input[name="communicationdata_to"]')!.value = opts.toValue ?? 'pref@x.com';
          });
          ed.mount(box);
          box.querySelector('input[type="radio"]')!.addEventListener('click', () => (pendingClicked = true));
        });
      });
      return { ed, state: () => ({ closed, saved, pendingClicked, preferredClicked }) };
    }

    it('email: preferred address, pending, HugeRTE content, save', async () => {
      const { ed, state } = emailPopup(true);
      const r = await write({ fieldTitle: 'Client Communication > Email', text: 'a<b\nc' });
      expect(r.ok).toBe(true);
      expect(ed.content).toBe('<p>a&lt;b</p><p>c</p>');
      expect(state()).toEqual({ closed: false, saved: true, pendingClicked: true, preferredClicked: true });
    });

    it('email: address field not holding the preferred address closes the popup', async () => {
      const { ed, state } = emailPopup(true, { toValue: 'other@x.com' });
      expect(await write({ fieldTitle: 'Client Communication > Email', text: 'a' })).toEqual({ ok: false, code: 'no_preferred_email' });
      expect(state().closed).toBe(true);
      expect(state().saved).toBe(false);
      expect(ed.content).toBe('');
    });

    it('email: a stale active editor elsewhere is left untouched', async () => {
      const stale = fakeHugeRte();
      stale.mount(pane());
      stale.content = 'OTHER PATIENT DOC';
      const { ed } = emailPopup(true);
      expect((await write({ fieldTitle: 'Client Communication > Email', text: 'a' })).ok).toBe(true);
      expect(stale.content).toBe('OTHER PATIENT DOC');
      expect(stale.dirty).toBe(false);
      expect(ed.content).toBe('<p>a</p>');
    });

    it('email: no preferred address closes the popup', async () => {
      const { ed, state } = emailPopup(false);
      expect(await write({ fieldTitle: 'Client Communication > Email', text: 'a' })).toEqual({ ok: false, code: 'no_preferred_email' });
      expect(state().closed).toBe(true);
      expect(state().saved).toBe(false);
      expect(ed.content).toBe('');
    });

    it('in person refuses an image', async () => {
      expect(await write({ fieldTitle: 'Client Communication > In Person', pngDataUrl: PNG })).toEqual({
        ok: false,
        code: 'image_not_accepted',
      });
    });
  });

  describe('discharge summary', () => {
    function saveAndClose(onClick?: () => void) {
      const btn = document.createElement('button');
      btn.setAttribute('data-testid', 'Save&Close_DischargeSummary');
      document.body.appendChild(btn);
      btn.addEventListener('click', () => {
        onClick?.();
        btn.remove();
      });
      return btn;
    }

    function openDoc(ed: FakeHuge) {
      addButtonOf('AddDischargeSummary').addEventListener('click', () => ed.mount(pane()));
    }

    it('text then image in one document', async () => {
      const ed = fakeHugeRte();
      openDoc(ed);
      saveAndClose();
      const r = await write({ fieldTitle: 'Discharge Summary', html: '<p>t</p>', pngDataUrl: PNG });
      expect(r.ok).toBe(true);
      expect(ed.content).toBe(`<p>t</p><p><img src="${PNG}"></p>`);
      expect(ed.dirty).toBe(true);
      expect(ed.saved).toBe(true);
      expect(ed.events).toEqual(['input', 'change']);
    });

    it('image only', async () => {
      const ed = fakeHugeRte();
      openDoc(ed);
      saveAndClose();
      await write({ fieldTitle: 'Discharge Summary', pngDataUrl: PNG });
      expect(ed.content).toBe(`<p><img src="${PNG}"></p>`);
    });

    it('cancels the template chooser first', async () => {
      const ed = fakeHugeRte();
      saveAndClose();
      let cancelled = false;
      addButtonOf('AddDischargeSummary').addEventListener('click', () => {
        const c = document.createElement('button');
        c.setAttribute('data-testid', 'Cancel');
        c.addEventListener('click', () => {
          cancelled = true;
          c.remove();
          ed.mount(pane());
        });
        document.body.appendChild(c);
      });
      expect((await write({ fieldTitle: 'Discharge Summary', text: 'x' })).ok).toBe(true);
      expect(cancelled).toBe(true);
      expect(ed.content).toBe('<p>x</p>');
    });

    it('stale active editor from an open document is left untouched', async () => {
      const stale = fakeHugeRte();
      stale.mount(pane());
      stale.content = 'OTHER';
      saveAndClose();
      expect(await write({ fieldTitle: 'Discharge Summary', text: 'x' })).toEqual({ ok: false, code: 'editor_not_found' });
      expect(stale.content).toBe('OTHER');
      expect(stale.dirty).toBe(false);
    });

    it('uses the visible Save & Close, not a stale hidden one', async () => {
      const ed = fakeHugeRte();
      openDoc(ed);
      const stale = document.createElement('button');
      stale.setAttribute('data-testid', 'Save&Close_DischargeSummary');
      stale.hidden = true;
      document.body.prepend(stale);
      const staleClick = vi.fn();
      stale.addEventListener('click', staleClick);
      let saved = false;
      saveAndClose(() => (saved = true));
      expect((await write({ fieldTitle: 'Discharge Summary', text: 'x' })).ok).toBe(true);
      expect(saved).toBe(true);
      expect(staleClick).not.toHaveBeenCalled();
    });

    it('does not click an unrelated pre-existing Cancel', async () => {
      const ed = fakeHugeRte();
      openDoc(ed);
      saveAndClose();
      const cancel = document.createElement('button');
      cancel.setAttribute('data-testid', 'Cancel');
      const spy = vi.fn();
      cancel.addEventListener('click', spy);
      document.body.appendChild(cancel);
      expect((await write({ fieldTitle: 'Discharge Summary', text: 'x' })).ok).toBe(true);
      expect(spy).not.toHaveBeenCalled();
    });

    it('save_not_confirmed when the dialog stays', async () => {
      const ed0 = fakeHugeRte();
      openDoc(ed0);
      const btn = document.createElement('button');
      btn.setAttribute('data-testid', 'Save&Close_DischargeSummary');
      document.body.appendChild(btn);
      expect(await write({ fieldTitle: 'Discharge Summary', text: 'x' })).toEqual({ ok: false, code: 'save_not_confirmed' });
    });

    it('editor_not_found without HugeRTE', async () => {
      expect(await write({ fieldTitle: 'Discharge Summary', text: 'x' })).toEqual({ ok: false, code: 'editor_not_found' });
    });

    it('invalid image', async () => {
      expect(await write({ fieldTitle: 'Discharge Summary', pngDataUrl: 'data:image/png;base64,@@' })).toEqual({
        ok: false,
        code: 'invalid_image',
      });
    });
    it('invalid image: length not a multiple of 4', async () => {
      expect(await write({ fieldTitle: 'Discharge Summary', pngDataUrl: 'data:image/png;base64,abc' })).toEqual({
        ok: false,
        code: 'invalid_image',
      });
    });
  });

  it('write suppresses template fill and restores jaxmanager', async () => {
    const jax = w.jaxmanager as { request: (...a: unknown[]) => void };
    const orig = jax.request;
    const ed = fakeHugeRte();
    const cb = vi.fn();
    addButtonOf('AddDischargeSummary').addEventListener('click', () => ed.mount(pane()));
    const btn = document.createElement('button');
    btn.setAttribute('data-testid', 'Save&Close_DischargeSummary');
    document.body.appendChild(btn);
    addButtonOf('AddDischargeSummary').addEventListener('click', () => {
      jax.request('get/templateFillData.php?x', '', null, cb);
      btn.addEventListener('click', () => btn.remove());
    });
    await write({ fieldTitle: 'Discharge Summary', text: 'x' });
    expect(orig).not.toHaveBeenCalled();
    expect(jax.request).toBe(orig);
    await vi.waitFor(() => expect(cb).toHaveBeenCalled());
    expect(ed.content).toBe('<p>x</p>');
  });

  it('reports guardSkipped without jaxmanager', async () => {
    delete w.jaxmanager;
    const ed = fakeHugeRte();
    addButtonOf('AddDischargeSummary').addEventListener('click', () => ed.mount(pane()));
    const btn = document.createElement('button');
    btn.setAttribute('data-testid', 'Save&Close_DischargeSummary');
    btn.addEventListener('click', () => btn.remove());
    document.body.appendChild(btn);
    expect(await write({ fieldTitle: 'Discharge Summary', text: 'x' })).toEqual({ ok: true, guardSkipped: true });
  });
});
