// Reading side of the ezyVet page script: consult state, field list, diagnostics.
// Everything here is read-only and returns structure, never page content (other than field titles).
import type { FieldInfo } from '../../utils/pims/mapping';
import { EXTENSION_VERSION } from '../version';
import * as S from './selectors';

export type EzyvetState = 'writable' | 'notConsult' | 'notMedicalTab' | 'locked' | 'combined';

export type Diagnostics = {
  version: string;
  state: EzyvetState;
  selectorHits: Record<string, number>;
  fields: FieldInfo[];
  hasJaxmanager: boolean;
  hasHugerte: boolean;
  hasLexical: boolean;
};

// Visibility: jsdom has no layout, so `offsetParent`/`getClientRects` would call everything hidden.
// We instead treat an element as visible unless it or an ancestor has the `hidden` attribute or
// inline `display: none`. (Real ezyVet hides duplicate copies this way or via CSS classes; a CSS-only
// hide is not detected here, which only matters for choosing between duplicate titles.)
function isVisible(el: Element): boolean {
  for (let n: Element | null = el; n; n = n.parentElement) {
    if (n.hasAttribute('hidden')) return false;
    if ((n as HTMLElement).style?.display === 'none') return false;
  }
  return true;
}

function activePane(doc: Document): Element | null {
  return doc.querySelector(S.ACTIVE_PANE);
}

function viewId(pane: Element): string | null {
  return /^rtab(\d+)details$/.exec(pane.id)?.[1] ?? null;
}

function isConsultPane(doc: Document, pane: Element, id: string): boolean {
  // Newer markup: data-record-class on the pane or on its wrapper directly under #rightpane.
  let tagged: string | null = pane.getAttribute('data-record-class');
  if (tagged === null) {
    let n: Element | null = pane;
    while (n && n.parentElement && n.parentElement.id !== 'rightpane') n = n.parentElement;
    if (n && n.parentElement) tagged = n.getAttribute('data-record-class');
  }
  if (tagged !== null) return tagged === 'Consult';
  // Legacy: #rform<N> has a class like Consult4521Form (RecordClass Consult, RecordId > 0).
  const form = doc.getElementById(`rform${id}`);
  if (!form) return false;
  return Array.from(form.classList).some((c) => {
    const m = /^Consult(\d+)Form$/.exec(c);
    return m !== null && Number(m[1]) > 0;
  });
}

function consultPane(doc: Document): { pane: Element; id: string } | null {
  const pane = activePane(doc);
  if (!pane) return null;
  const id = viewId(pane);
  if (id === null || !isConsultPane(doc, pane, id)) return null;
  return { pane, id };
}

export function status(doc: Document = document): { state: EzyvetState; patientName: string | null } {
  const consult = consultPane(doc);
  if (!consult) return { state: 'notConsult', patientName: null };
  const name = doc.querySelector(S.PATIENT_NAME)?.textContent?.replace(/\s+/g, ' ').trim() || null;
  // Order: the combined view and a locked consult are reported before the sub-tab check, since the
  // combined view has no Medical sub-tab and a locked consult is not writable whichever tab is open.
  let state: EzyvetState;
  if (doc.querySelector(S.COMBINED_VIEW_BUTTON)) state = 'combined';
  else if (doc.querySelector(S.LOCKED_TOOLBAR)) state = 'locked';
  else if (doc.getElementById(`subTab${consult.id}-Medical`)?.classList.contains('active')) state = 'writable';
  else state = 'notMedicalTab';
  return { state, patientName: name };
}

function cleanTitle(raw: string): string {
  return raw
    .replace(/\u00a0/g, ' ')
    .replace(/\s*\(\d*\)?\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function directText(el: Element): string {
  return Array.from(el.childNodes)
    .filter((n) => n.nodeType === 3)
    .map((n) => n.textContent ?? '')
    .join('');
}

function inDischargeSection(el: Element): boolean {
  const sc = el.closest(S.SECTION_CONTENT);
  return !!sc && Array.from(sc.classList).some((c) => c.startsWith(S.DISCHARGE_SECTION_CLASS_PREFIX));
}

type Found = FieldInfo & { node: Element };

export function listFieldElements(doc: Document = document): Found[] {
  if (!consultPane(doc)) return [];
  const root = doc.querySelector(S.ACTIVE_SUBTAB_DETAILS);
  if (!root) return [];
  const found: Found[] = [];

  for (const sec of root.querySelectorAll(S.SECTION_CONTENT)) {
    const h2 = sec.querySelector(S.NOTE_SECTION_TITLE);
    if (!h2) continue;
    if (!sec.querySelector(`${S.NOTE_EDITABLE}, ${S.NOTE_EDITOR_CONTAINER}, ${S.NOTE_ADD_BUTTON}`)) continue;
    const title = cleanTitle(h2.textContent ?? '');
    if (title) found.push({ title, kind: 'note', acceptsImage: false, node: sec });
  }

  for (const t of root.querySelectorAll(S.POPUP_TITLE)) {
    if (!t.querySelector(S.POPUP_ADD_BUTTON)) continue;
    if (inDischargeSection(t)) continue;
    const title = cleanTitle(directText(t));
    if (!title) continue;
    if (t.querySelector(S.ADD_CLIENT_COMMUNICATION)) {
      found.push({ title: `${title} > Email`, kind: 'email', acceptsImage: true, node: t });
      found.push({ title: `${title} > In Person`, kind: 'inPerson', acceptsImage: false, node: t });
    } else {
      found.push({ title, kind: 'popup', acceptsImage: false, node: t });
    }
  }

  for (const t of root.querySelectorAll('.inputSectionTitle')) {
    const direct = t.querySelector(S.DISCHARGE_ADD_BUTTON);
    const inSection = inDischargeSection(t) && t.querySelector('.addButton');
    if (direct || inSection) {
      found.push({ title: 'Discharge Summary', kind: 'dischargeSummary', acceptsImage: true, node: t });
    }
  }

  // De-duplicate by title; the visible copy wins, otherwise the first.
  const byTitle = new Map<string, Found>();
  for (const f of found) {
    const prev = byTitle.get(f.title);
    if (!prev || (!isVisible(prev.node) && isVisible(f.node))) byTitle.set(f.title, f);
  }
  return Array.from(byTitle.values());
}

export function listFields(doc: Document = document): FieldInfo[] {
  return listFieldElements(doc).map(({ title, kind, acceptsImage }) => ({ title, kind, acceptsImage }));
}

export function diagnostics(doc: Document = document): Diagnostics {
  const win = doc.defaultView as (Window & { jaxmanager?: unknown; hugerte?: unknown }) | null;
  const selectorHits: Record<string, number> = {};
  for (const [name, sel] of Object.entries(S.REPORTED_SELECTORS)) {
    selectorHits[name] = doc.querySelectorAll(sel).length;
  }
  const hasLexical = Array.from(doc.querySelectorAll(S.NOTE_EDITABLE)).some(
    (e) => !!(e as unknown as { __lexicalEditor?: unknown }).__lexicalEditor,
  );
  return {
    version: EXTENSION_VERSION,
    state: status(doc).state,
    selectorHits,
    fields: listFields(doc),
    hasJaxmanager: !!win?.jaxmanager,
    hasHugerte: !!win?.hugerte,
    hasLexical,
  };
}
