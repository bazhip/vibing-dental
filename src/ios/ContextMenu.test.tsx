import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContextMenu, MenuPopover } from './ContextMenu';

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

describe('MenuPopover sections', () => {
  it('groups items under section titles, with radio and checkbox items in one menu', () => {
    const onDue = vi.fn();
    render(
      <MenuPopover
        anchor={{ left: 0, top: 0, width: 10, height: 10 }}
        onClose={() => {}}
        items={[
          { label: 'Name', section: 'Sort by', type: 'radio', checked: true, onSelect: () => {} },
          { label: 'Updated', type: 'radio', checked: false, onSelect: () => {} },
          { label: 'Due', section: true, checked: false, onSelect: onDue },
          { label: 'Plain', onSelect: () => {} },
        ]}
      />
    );
    const groups = screen.getAllByRole('group');
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveAccessibleName('Sort by');
    expect(screen.getByText('Sort by')).toHaveClass('ios-menu__section-title');
    expect(screen.getByRole('menuitemradio', { name: 'Name' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: 'Updated' })).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Due' }));
    expect(onDue).toHaveBeenCalled();
    expect(screen.getByRole('menuitem', { name: 'Plain' })).toBeInTheDocument();
  });

  it('menus without sections keep their flat structure', () => {
    render(<MenuPopover anchor={{ left: 0, top: 0, width: 0, height: 0 }} onClose={() => {}} items={[{ label: 'A', onSelect: () => {} }]} />);
    expect(screen.queryByRole('group')).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'A' })).toBeInTheDocument();
  });
});
