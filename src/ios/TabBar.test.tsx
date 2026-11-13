import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TabBar } from './TabBar';
import { hapticSelection } from '../native/haptics';

vi.mock('../native/haptics', () => ({ hapticSelection: vi.fn(), hapticTap: vi.fn(), hapticImpact: vi.fn(), hapticSuccess: vi.fn() }));

const tabs = [
  { id: 'chart', label: 'Chart', icon: 'doc-text' as const },
  { id: 'patients', label: 'Patients', icon: 'person-2' as const },
  { id: 'rechecks', label: 'Rechecks', icon: 'calendar-badge-clock' as const, badge: 3 },
  { id: 'settings', label: 'Settings', icon: 'gear' as const },
];

describe('TabBar', () => {
  it('marks the active tab selected and calls onChange for another tab', () => {
    const onChange = vi.fn();
    render(<TabBar tabs={tabs} active="chart" onChange={onChange} />);
    expect(screen.getByRole('tab', { name: /Chart/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Patients/ })).toHaveAttribute('aria-selected', 'false');
    fireEvent.click(screen.getByRole('tab', { name: /Patients/ }));
    expect(onChange).toHaveBeenCalledWith('patients');
  });

  it('shows a badge and includes it in the accessible name', () => {
    render(<TabBar tabs={tabs} active="chart" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: /Rechecks.*3/ })).toBeInTheDocument();
  });

  it('arrow keys move between tabs', () => {
    const onChange = vi.fn();
    render(<TabBar tabs={tabs} active="chart" onChange={onChange} />);
    const chart = screen.getByRole('tab', { name: /Chart/ });
    chart.focus();
    fireEvent.keyDown(chart, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('patients');
  });
});

describe('TabBar feel', () => {
  it('the active tab has the filled icon; the others are outlines', () => {
    render(<TabBar tabs={tabs} active="patients" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: /Patients/ }).querySelector('svg')).toHaveAttribute('data-filled', 'true');
    expect(screen.getByRole('tab', { name: /Chart/ }).querySelector('svg')).not.toHaveAttribute('data-filled');
  });

  it('plays the selection haptic on a tab change, not on re-tapping the active tab', () => {
    vi.mocked(hapticSelection).mockClear();
    render(<TabBar tabs={tabs} active="chart" onChange={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: /Chart/ }));
    expect(hapticSelection).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('tab', { name: /Settings/ }));
    expect(hapticSelection).toHaveBeenCalledTimes(1);
  });
});
