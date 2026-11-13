import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { NavBar } from './NavBar';

describe('NavBar', () => {
  it('renders the title, leading and trailing content', () => {
    render(<NavBar title="Patients" leading={<button>Edit</button>} trailing={<button>Add</button>} />);
    expect(screen.getByRole('heading', { name: 'Patients' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('title menu opens a menu whose items call onSelect', () => {
    const a = vi.fn();
    const b = vi.fn();
    render(
      <NavBar
        title="Chart"
        titleMenu={[
          { label: 'Perio', onSelect: a, checked: true },
          { label: 'Restorative', onSelect: b },
        ]}
      />
    );
    fireEvent.click(screen.getAllByRole('button', { name: /Chart/ })[0]);
    const menu = screen.getByRole('menu');
    expect(menu).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: 'Perio' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Restorative' }));
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('Escape closes the title menu', () => {
    render(<NavBar title="Chart" titleMenu={[{ label: 'Perio', onSelect: () => {} }]} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Chart/ })[0]);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('large title collapses to the inline title when the content scrolls', () => {
    const ref = React.createRef<HTMLDivElement>();
    function Screen() {
      return (
        <div ref={ref} style={{ overflow: 'auto' }}>
          <NavBar title="Rechecks" largeTitle scrollRef={ref} />
          <p>content</p>
        </div>
      );
    }
    const { container } = render(<Screen />);
    const bar = container.querySelector('.ios-navbar')!;
    expect(bar).not.toHaveClass('ios-navbar--collapsed');
    expect(container.querySelector('.ios-navbar__large')).not.toBeNull();
    Object.defineProperty(ref.current!, 'scrollTop', { configurable: true, value: 120 });
    fireEvent.scroll(ref.current!);
    expect(bar).toHaveClass('ios-navbar--collapsed');
    Object.defineProperty(ref.current!, 'scrollTop', { configurable: true, value: 0 });
    fireEvent.scroll(ref.current!);
    expect(bar).not.toHaveClass('ios-navbar--collapsed');
  });
});
