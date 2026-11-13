import { describe, it, expect, vi, afterEach } from 'vitest';
import { scrollFocusedCellIntoView } from './iosFeel';

describe('scrollFocusedCellIntoView (keyboard avoidance)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('scrolls the grid cell holding the focused editor into view', () => {
    document.body.innerHTML = '<div class="rdg-cell" id="cell"><input id="ed" /></div>';
    const cell = document.getElementById('cell')!;
    const scroll = vi.fn();
    cell.scrollIntoView = scroll;
    document.getElementById('ed')!.focus();
    scrollFocusedCellIntoView();
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('scrolls a focused field outside the grid itself', () => {
    document.body.innerHTML = '<textarea id="t"></textarea>';
    const t = document.getElementById('t')!;
    const scroll = vi.fn();
    t.scrollIntoView = scroll;
    t.focus();
    scrollFocusedCellIntoView();
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('does nothing when nothing is focused', () => {
    const scroll = vi.fn();
    document.body.scrollIntoView = scroll;
    (document.activeElement as HTMLElement | null)?.blur();
    scrollFocusedCellIntoView();
    expect(scroll).not.toHaveBeenCalled();
  });
});
