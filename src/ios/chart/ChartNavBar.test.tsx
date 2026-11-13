import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../native/haptics', () => ({ hapticSelection: vi.fn(), hapticTap: vi.fn(), hapticImpact: vi.fn(), hapticSuccess: vi.fn() }));

import { ChartNavBar, ChartNotice, type ChartNavBarProps } from './ChartNavBar';

const SECTIONS = [
  { id: 'patient', label: 'Patient' },
  { id: 'exam', label: 'Exam' },
  { id: 'charting', label: 'Charting' },
];

function setup(patch: Partial<ChartNavBarProps> = {}) {
  const props: ChartNavBarProps = {
    title: 'Biscuit',
    subtitle: 'Saved · 9:41 AM',
    sections: SECTIONS,
    activeSection: 'patient',
    onSection: vi.fn(),
    shareLabel: 'Preview and download the chart PDF',
    menu: [],
    ...patch,
  };
  const utils = render(<ChartNavBar {...props} />);
  return { ...utils, props };
}

describe('ChartNavBar', () => {
  it('shows the patient name as the title and the save status as the subtitle', () => {
    setup();
    expect(screen.getByRole('heading', { level: 1, name: /Biscuit/ })).toBeInTheDocument();
    expect(screen.getAllByText('Saved · 9:41 AM').length).toBeGreaterThan(0);
  });

  it('keeps the leading slot empty (the iPad Show-sidebar button floats there)', () => {
    const { container } = setup({ onEdit: vi.fn() });
    expect(container.querySelector('.ios-navbar__leading')?.childElementCount).toBe(0);
  });

  it('Share submits the chart form (opens Documents), with an icon and no text glyph', () => {
    setup();
    const share = screen.getByRole('button', { name: 'Preview and download the chart PDF' });
    expect(share).toHaveAttribute('type', 'submit');
    expect(share).toHaveAttribute('form', 'chart-form');
    expect(share.querySelector('[data-icon="square-and-arrow-up"]')).not.toBeNull();
    expect(share.textContent).not.toMatch(/⤓/);
  });

  it('the title menu lists the sections, checks the current one, and jumps on select', () => {
    const { props } = setup({ activeSection: 'exam' });
    fireEvent.click(screen.getAllByRole('button', { name: /Biscuit/ })[0]);
    const menu = screen.getByRole('menu');
    const items = within(menu).getAllByRole('menuitemradio');
    expect(items.map((i) => i.textContent)).toEqual(['Patient', 'Exam', 'Charting']);
    expect(items[1]).toHaveAttribute('aria-checked', 'true');
    act(() => fireEvent.click(items[2]));
    expect(props.onSection).toHaveBeenCalledWith('charting');
  });

  it('More opens the menu; each item calls its handler', () => {
    const onNewChart = vi.fn();
    const onHistory = vi.fn();
    setup({
      menu: [
        { label: 'New chart', icon: 'plus', onSelect: onNewChart },
        { label: 'Chart history', icon: 'clock-arrow-circlepath', onSelect: onHistory },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    act(() => fireEvent.click(screen.getByRole('menuitem', { name: 'Chart history' })));
    expect(onHistory).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    act(() => fireEvent.click(screen.getByRole('menuitem', { name: 'New chart' })));
    expect(onNewChart).toHaveBeenCalledTimes(1);
  });

  it('no More button when there is nothing in it', () => {
    setup({ menu: [] });
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
  });

  it('a view-only saved visit gets an Edit button', () => {
    const onEdit = vi.fn();
    setup({ subtitle: 'View only · Mar 4, 2026', onEdit });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
  });

  it('editing a saved visit gets a Done button instead', () => {
    const onDone = vi.fn();
    setup({ subtitle: 'Editing', onDone });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });
});

describe('ChartNotice', () => {
  it('renders an inline notice with its action', () => {
    const onAction = vi.fn();
    render(<ChartNotice tone="warning" text="Open in another window." actionLabel="Got it" onAction={onAction} />);
    const notice = screen.getByRole('alert');
    expect(notice).toHaveClass('ios-chart-notice', 'ios-chart-notice--warning');
    fireEvent.click(within(notice).getByRole('button', { name: 'Got it' }));
    expect(onAction).toHaveBeenCalled();
  });
});
