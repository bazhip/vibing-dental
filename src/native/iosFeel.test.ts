import { describe, it, expect, vi, afterEach } from 'vitest';
import { Style } from '@capacitor/status-bar';
import { scrollFocusedCellIntoView, followColorSchemeForStatusBar } from './iosFeel';

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

describe('followColorSchemeForStatusBar', () => {
  function fakeMedia(dark: boolean) {
    let listener: ((e: { matches: boolean }) => void) | null = null;
    const mql = {
      matches: dark,
      addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => { listener = fn; },
      removeEventListener: vi.fn(),
    };
    const matchMedia = vi.fn().mockReturnValue(mql);
    return { matchMedia, change: (d: boolean) => listener?.({ matches: d }) };
  }

  it('uses dark text in light mode and light text in dark mode', () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const light = fakeMedia(false);
    followColorSchemeForStatusBar(set, light.matchMedia);
    expect(light.matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
    expect(set).toHaveBeenLastCalledWith({ style: Style.Light });

    const set2 = vi.fn().mockResolvedValue(undefined);
    followColorSchemeForStatusBar(set2, fakeMedia(true).matchMedia);
    expect(set2).toHaveBeenLastCalledWith({ style: Style.Dark });
  });

  it('follows the system when the scheme changes', () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const media = fakeMedia(false);
    followColorSchemeForStatusBar(set, media.matchMedia);
    media.change(true);
    expect(set).toHaveBeenLastCalledWith({ style: Style.Dark });
    media.change(false);
    expect(set).toHaveBeenLastCalledWith({ style: Style.Light });
  });
});
