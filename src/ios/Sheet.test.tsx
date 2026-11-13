import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Sheet } from './Sheet';
import { ContextMenu } from './ContextMenu';
import { ScrollContainerContext } from './scrollContainer';

/** Drag with pointer events from (y0) to (y1) on `el`, in a few steps. */
function drag(el: Element, y0: number, y1: number) {
  fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: y0, button: 0, pointerType: 'touch', isPrimary: true });
  const steps = 5;
  for (let i = 1; i <= steps; i++) {
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 100, clientY: y0 + ((y1 - y0) * i) / steps, pointerType: 'touch', isPrimary: true });
  }
  fireEvent.pointerUp(el, { pointerId: 1, clientX: 100, clientY: y1, pointerType: 'touch', isPrimary: true });
}

const body = () => document.querySelector('.ios-sheet__body') as HTMLElement;

describe('Sheet', () => {
  it('renders a grabber, Cancel and Done, labelled by its title', () => {
    render(
      <Sheet open onClose={() => {}} title="New reminder" onCancel={() => {}} onDone={() => {}}>
        <p>Body</p>
      </Sheet>
    );
    expect(document.querySelector('.ios-sheet__grabber')).not.toBeNull();
    expect(screen.getByRole('dialog', { name: 'New reminder' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });

  it('has a close control when there is no Cancel button', () => {
    const onClose = vi.fn();
    render(<Sheet open onClose={onClose} title="What’s new"><p>Body</p></Sheet>);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    return waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('Done calls onDone; a disabled Done does nothing', () => {
    const onDone = vi.fn();
    const { rerender } = render(<Sheet open onClose={() => {}} onDone={onDone} doneDisabled><p>x</p></Sheet>);
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
    rerender(<Sheet open onClose={() => {}} onDone={onDone}><p>x</p></Sheet>);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('Escape closes', async () => {
    const onClose = vi.fn();
    render(<Sheet open onClose={onClose} title="T"><p>Body</p></Sheet>);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('tapping the backdrop closes', async () => {
    const onClose = vi.fn();
    render(<Sheet open onClose={onClose} title="T"><p>Body</p></Sheet>);
    const backdrop = document.querySelector('.ios-sheet__backdrop') as HTMLElement;
    fireEvent.pointerDown(backdrop);
    fireEvent.click(backdrop);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('confirmDismiss returning false keeps it open', async () => {
    const onClose = vi.fn();
    const confirmDismiss = vi.fn(async () => false);
    render(<Sheet open onClose={onClose} title="T" confirmDismiss={confirmDismiss}><p>Body</p></Sheet>);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(confirmDismiss).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('confirmDismiss returning true closes, and Cancel calls onCancel', async () => {
    const onClose = vi.fn();
    const onCancel = vi.fn();
    render(<Sheet open onClose={onClose} onCancel={onCancel} title="T" confirmDismiss={() => true}><p>Body</p></Sheet>);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('opening a second sheet closes the first', () => {
    const closeA = vi.fn();
    function Two({ b }: { b: boolean }) {
      return (
        <>
          <Sheet open onClose={closeA} title="A"><p>A</p></Sheet>
          <Sheet open={b} onClose={() => {}} title="B"><p>B</p></Sheet>
        </>
      );
    }
    const { rerender } = render(<Two b={false} />);
    expect(closeA).not.toHaveBeenCalled();
    rerender(<Two b />);
    expect(closeA).toHaveBeenCalledTimes(1);
  });

  it('a sheet opened from inside a sheet stacks on it; Escape closes only the top one', async () => {
    const closeA = vi.fn();
    const closeB = vi.fn();
    function Nested({ b }: { b: boolean }) {
      return (
        <Sheet open onClose={closeA} title="A">
          <p>A</p>
          <Sheet open={b} onClose={closeB} title="B"><button>In B</button></Sheet>
        </Sheet>
      );
    }
    const { rerender } = render(<Nested b={false} />);
    rerender(<Nested b />);
    expect(closeA).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'B' })).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(closeB).toHaveBeenCalledTimes(1));
    expect(closeA).not.toHaveBeenCalled();
  });

  it('Tab inside a stacked sheet stays in that sheet', () => {
    render(
      <Sheet open onClose={() => {}} title="A">
        <button>In A</button>
        <Sheet open onClose={() => {}} title="B"><button>In B</button></Sheet>
      </Sheet>
    );
    const inB = screen.getByRole('button', { name: 'In B' });
    inB.focus();
    fireEvent.keyDown(inB, { key: 'Tab' });
    const sheetB = screen.getByRole('dialog', { name: 'B' });
    expect(sheetB.contains(document.activeElement)).toBe(true);
  });

  it('gives its body as the scroll container to what it contains', () => {
    let seen: HTMLElement | null | undefined;
    function Probe() {
      const ref = React.useContext(ScrollContainerContext);
      React.useEffect(() => { seen = ref?.current; });
      return null;
    }
    render(<Sheet open onClose={() => {}} title="T"><Probe /></Sheet>);
    expect(seen).toBe(body());
  });

  it('a drag that starts in a scrolled body scrolls the content, not the sheet', async () => {
    const onClose = vi.fn();
    render(<Sheet open onClose={onClose} title="T"><p>Long content</p></Sheet>);
    Object.defineProperty(body(), 'scrollTop', { configurable: true, value: 120 });
    drag(screen.getByText('Long content'), 100, 600);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(onClose).not.toHaveBeenCalled();
    expect((document.querySelector('.ios-sheet') as HTMLElement).style.transform || '').not.toMatch(/translateY\((?!0)/);
  });

  it('dragging the grabber down past the threshold dismisses', async () => {
    const onClose = vi.fn();
    render(<Sheet open onClose={onClose} title="T"><p>Body</p></Sheet>);
    drag(document.querySelector('.ios-sheet__grabber')!, 50, 450);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('dragging down from the top of the body content dismisses', async () => {
    const onClose = vi.fn();
    render(<Sheet open onClose={onClose} title="T"><p>Content</p></Sheet>);
    drag(screen.getByText('Content'), 100, 500);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('a short, slow drag snaps back instead of dismissing', async () => {
    const onClose = vi.fn();
    const now = vi.spyOn(performance, 'now');
    let t = 0;
    now.mockImplementation(() => (t += 200));
    render(<Sheet open onClose={onClose} title="T"><p>Body</p></Sheet>);
    drag(document.querySelector('.ios-sheet__grabber')!, 50, 70);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(onClose).not.toHaveBeenCalled();
    now.mockRestore();
  });

  it('a drag dismissal still asks confirmDismiss', async () => {
    const onClose = vi.fn();
    const confirmDismiss = vi.fn(() => false);
    render(<Sheet open onClose={onClose} title="T" confirmDismiss={confirmDismiss}><p>Body</p></Sheet>);
    drag(document.querySelector('.ios-sheet__grabber')!, 50, 450);
    await waitFor(() => expect(confirmDismiss).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps focus inside the sheet (Tab wraps) and moves focus into it on open', () => {
    render(
      <Sheet open onClose={() => {}} title="T" onCancel={() => {}} onDone={() => {}}>
        <input aria-label="Name" />
      </Sheet>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
    const done = screen.getByRole('button', { name: 'Done' });
    const input = screen.getByRole('textbox', { name: 'Name' });
    input.focus();
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    screen.getByRole('button', { name: 'Cancel' }).focus();
    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(input);
    void done;
  });

  it('renders nothing when closed', () => {
    render(<Sheet open={false} onClose={() => {}} title="T"><p>Body</p></Sheet>);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Sheet re-open', () => {
  it('re-opening during the exit slide shows the sheet again', async () => {
    const { rerender } = render(<Sheet open onClose={() => {}} title="T"><p>Body</p></Sheet>);
    await waitFor(() => expect(document.querySelector('.ios-sheet-root--shown')).not.toBeNull());
    rerender(<Sheet open={false} onClose={() => {}} title="T"><p>Body</p></Sheet>);
    expect(document.querySelector('.ios-sheet-root--shown')).toBeNull();
    rerender(<Sheet open onClose={() => {}} title="T"><p>Body</p></Sheet>);
    await waitFor(() => expect(document.querySelector('.ios-sheet-root--shown')).not.toBeNull());
    await new Promise((r) => setTimeout(r, 450));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('Sheet first touchmove', () => {
  /** A cancelable touchmove at (x, y), as WebKit sends it after pointermove. */
  function touchMove(el: Element, x: number, y: number) {
    const ev = new Event('touchmove', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'touches', { value: [{ clientX: x, clientY: y }] });
    el.dispatchEvent(ev);
    return ev;
  }
  const down = (el: Element, y: number) =>
    fireEvent.pointerDown(el, { pointerId: 4, clientX: 100, clientY: y, button: 0, pointerType: 'touch', isPrimary: true });

  it('the first downward touchmove from the top of the body is cancelled (no native overscroll)', () => {
    render(<Sheet open onClose={() => {}} title="T"><p>Content</p></Sheet>);
    const content = screen.getByText('Content');
    down(content, 100);
    // 1px: still inside the slop, but already the sheet's.
    expect(touchMove(content, 100, 101).defaultPrevented).toBe(true);
  });

  it('touchmoves in a scrolled body are left to the browser (content scrolls)', () => {
    render(<Sheet open onClose={() => {}} title="T"><p>Content</p></Sheet>);
    Object.defineProperty(document.querySelector('.ios-sheet__body')!, 'scrollTop', { configurable: true, value: 80 });
    const content = screen.getByText('Content');
    down(content, 100);
    expect(touchMove(content, 100, 101).defaultPrevented).toBe(false);
    expect(touchMove(content, 100, 160).defaultPrevented).toBe(false);
  });

  it('an upward touchmove at the top of a large sheet scrolls the content', () => {
    render(<Sheet open onClose={() => {}} title="T"><p>Content</p></Sheet>);
    const content = screen.getByText('Content');
    down(content, 300);
    expect(touchMove(content, 100, 299).defaultPrevented).toBe(false);
    expect(touchMove(content, 100, 260).defaultPrevented).toBe(false);
  });
});

describe('Sheet with a menu open inside it', () => {
  it('Escape closes the menu without closing the sheet', async () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} title="T">
        <ContextMenu items={[{ label: 'Duplicate', onSelect: () => {} }]}>
          <button>Row</button>
        </ContextMenu>
      </Sheet>
    );
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Row' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    await act(async () => { await Promise.resolve(); });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('Sheet while closing', () => {
  it('the exiting sheet does not take taps (pointer-events off until shown)', () => {
    // The rule lives in ios.css; check the class contract it keys on.
    const { rerender } = render(<Sheet open onClose={() => {}} title="T"><p>x</p></Sheet>);
    rerender(<Sheet open={false} onClose={() => {}} title="T"><p>x</p></Sheet>);
    const root = document.querySelector('.ios-sheet-root')!;
    expect(root).not.toHaveClass('ios-sheet-root--shown');
  });
});
