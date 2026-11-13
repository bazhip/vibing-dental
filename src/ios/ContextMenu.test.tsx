import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContextMenu } from './ContextMenu';

const ev = { pointerId: 9, pointerType: 'touch', isPrimary: true, clientX: 50, clientY: 50 };

describe('ContextMenu', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    const onDuplicate = vi.fn();
    const onDelete = vi.fn();
    const onClick = vi.fn();
    render(
      <ContextMenu
        items={[
          { label: 'Duplicate', onSelect: onDuplicate },
          { label: 'Delete', icon: 'trash', destructive: true, onSelect: onDelete },
        ]}
      >
        <button onClick={onClick}>Visit 3 May</button>
      </ContextMenu>
    );
    return { onDuplicate, onDelete, onClick, target: screen.getByRole('button', { name: 'Visit 3 May' }) };
  }

  it('a 500ms long-press opens the menu; Escape closes it', () => {
    const { target, onClick } = setup();
    fireEvent.pointerDown(target, ev);
    act(() => { vi.advanceTimersByTime(499); });
    expect(screen.queryByRole('menu')).toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.getByRole('menu')).toBeInTheDocument();
    // The click that ends a long-press does not also activate the child.
    fireEvent.pointerUp(target, ev);
    fireEvent.click(target);
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('a short press is a normal tap', () => {
    const { target, onClick } = setup();
    fireEvent.pointerDown(target, ev);
    act(() => { vi.advanceTimersByTime(200); });
    fireEvent.pointerUp(target, ev);
    fireEvent.click(target);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('moving the finger cancels the long-press', () => {
    const { target } = setup();
    fireEvent.pointerDown(target, ev);
    fireEvent.pointerMove(target, { ...ev, clientY: 80 });
    act(() => { vi.advanceTimersByTime(600); });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('items call onSelect and close; the contextmenu event (keyboard / right click) also opens it', () => {
    const { target, onDelete } = setup();
    fireEvent.contextMenu(target);
    const del = screen.getByRole('menuitem', { name: 'Delete' });
    expect(del).toHaveClass('ios-menu__item--destructive');
    fireEvent.click(del);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
