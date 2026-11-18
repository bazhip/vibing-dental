import i18n from '../i18n';
import { toast } from '../components/ui/dialogs';

/**
 * View-only (locked) charts keep every control on screen. Display
 * controls (expanding a group, zoom, numbers, text size, Customize, PDF
 * preview) keep working; anything that would change the chart looks
 * greyed out and, when pressed, explains that editing has to be turned on.
 */

let lastNotice = 0;

/** "View only — choose Edit chart to make changes", at most once every
 *  few seconds so a burst of presses shows a single toast. */
export function notifyLocked(): void {
  const now = Date.now();
  if (now - lastNotice < 2500) return;
  lastNotice = now;
  toast(i18n.t('app:lock.title'));
}

/** Controls that edit the chart. `[data-lock-exempt]` (and anything inside
 *  one) is a display control and stays usable. */
const EDIT_CONTROLS = [
  'input:not([type="hidden"])',
  'textarea',
  'select',
  'button',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="textbox"]',
].join(', ');

/** Text fields stay focusable so their text can still be selected and
 *  copied; typing, pasting and dropping into them is what's blocked. */
const TEXT_ENTRY = [
  'textarea',
  'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"])' +
    ':not([type="submit"]):not([type="reset"]):not([type="file"]):not([type="color"])',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[role="textbox"]',
].join(', ');

const PASS_KEYS = new Set(['Tab', 'Escape', 'Shift', 'Control', 'Alt', 'Meta']);

export function editControl(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest(EDIT_CONTROLS);
  if (!el || el.closest('[data-lock-exempt]')) return null;
  return el;
}

/**
 * Ref callback for a block of chart content. While `locked`, the block's
 * editing controls can't change anything and trying shows notifyLocked().
 * Listeners sit in the capture phase on the block itself, so the
 * controls' own handlers never see a blocked event.
 */
export function lockGuard(locked: boolean): (el: HTMLElement | null) => void | (() => void) {
  return (el) => {
    if (!el || !locked) return;
    const block = (e: Event, notify: boolean) => {
      e.preventDefault();
      e.stopPropagation();
      if (notify) notifyLocked();
    };
    const onPointerDown = (e: Event) => {
      const c = editControl(e.target);
      if (!c) return;
      notifyLocked();
      if (!c.matches(TEXT_ENTRY)) block(e, false);
    };
    const onMouseDown = (e: Event) => {
      const c = editControl(e.target);
      if (c && !c.matches(TEXT_ENTRY)) block(e, false);
    };
    // Keyboard activation (Enter / Space on a button) has no pointerdown.
    const onClick = (e: Event) => {
      const c = editControl(e.target);
      if (c && !c.matches(TEXT_ENTRY)) block(e, (e as MouseEvent).detail === 0);
    };
    const onKeyDown = (e: Event) => {
      const k = e as KeyboardEvent;
      const c = editControl(k.target);
      if (!c || c.matches(TEXT_ENTRY) || PASS_KEYS.has(k.key) || k.metaKey || k.ctrlKey) return;
      block(e, true);
    };
    const onEdit = (e: Event) => {
      if (editControl(e.target)) block(e, true);
    };
    const listeners: [string, (e: Event) => void][] = [
      ['pointerdown', onPointerDown],
      ['mousedown', onMouseDown],
      ['click', onClick],
      ['keydown', onKeyDown],
      ['beforeinput', onEdit],
      ['paste', onEdit],
      ['cut', onEdit],
      ['drop', onEdit],
    ];
    for (const [type, fn] of listeners) el.addEventListener(type, fn, true);
    return () => {
      for (const [type, fn] of listeners) el.removeEventListener(type, fn, true);
    };
  };
}
