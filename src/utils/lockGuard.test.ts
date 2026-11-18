import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const toast = vi.fn();
vi.mock('../components/ui/dialogs', () => ({ toast: (...a: unknown[]) => toast(...a) }));

import { lockGuard } from './lockGuard';

function mount(locked: boolean) {
  const root = document.createElement('div');
  root.innerHTML = `
    <button id="edit">Set</button>
    <input id="check" type="checkbox" />
    <textarea id="text">Notes</textarea>
    <select id="pick"><option>a</option><option>b</option></select>
    <button id="customize" data-lock-exempt>Customize</button>
    <label data-lock-exempt><input id="pref" type="checkbox" /> Add images to the PDF</label>
    <details id="owner"><summary id="summary">Owner details</summary>Body</details>`;
  document.body.appendChild(root);
  const cleanup = lockGuard(locked)(root);
  const onClick = vi.fn();
  root.addEventListener('click', onClick);
  return { root, onClick, cleanup: () => { if (typeof cleanup === 'function') cleanup(); root.remove(); } };
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const press = (el: HTMLElement) => {
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
};

describe('lockGuard', () => {
  let now = 0;
  beforeEach(() => {
    toast.mockReset();
    now += 10_000; // past the notice throttle
    vi.spyOn(Date, 'now').mockReturnValue(now);
  });
  afterEach(() => vi.restoreAllMocks());

  it('refuses editing controls and explains once', () => {
    const { onClick, cleanup } = mount(true);
    press($('edit'));
    press($('check'));
    expect($<HTMLInputElement>('check').checked).toBe(false);
    expect(onClick).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith('View only — choose Edit chart to make changes');
    cleanup();
  });

  it('blocks typing, pasting and keyboard changes but leaves text selectable', () => {
    const { cleanup } = mount(true);
    const down = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
    $('text').dispatchEvent(down);
    expect(down.defaultPrevented).toBe(false);
    for (const ev of [
      new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: 'x' }),
      new Event('paste', { bubbles: true, cancelable: true }),
    ]) {
      $('text').dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(true);
    }
    const arrow = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    $('pick').dispatchEvent(arrow);
    expect(arrow.defaultPrevented).toBe(true);
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    $('pick').dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    cleanup();
  });

  it('keeps display controls working: exempt buttons, preferences and details', () => {
    const { onClick, cleanup } = mount(true);
    press($('customize'));
    press($('pref'));
    press($('summary'));
    expect($<HTMLInputElement>('pref').checked).toBe(true);
    expect(onClick).toHaveBeenCalledTimes(3);
    expect(toast).not.toHaveBeenCalled();
    cleanup();
  });

  it('does nothing while unlocked', () => {
    const { onClick, cleanup } = mount(false);
    press($('edit'));
    press($('check'));
    expect($<HTMLInputElement>('check').checked).toBe(true);
    expect(onClick).toHaveBeenCalledTimes(2);
    expect(toast).not.toHaveBeenCalled();
    cleanup();
  });
});
