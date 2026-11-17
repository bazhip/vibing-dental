import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MobileSectionMenu } from './MobileSectionMenu';

const sections = [
  { id: 'patient', label: 'Patient', content: <div /> },
  { id: 'exam', label: 'Exam', content: <div /> },
];

describe('MobileSectionMenu', () => {
  it('returns keyboard focus to the trigger on Escape', () => {
    render(<MobileSectionMenu sections={sections} activeId="patient" onSelect={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /Patient/ });
    fireEvent.click(trigger);
    screen.getByRole('button', { name: /Exam/ }).focus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('returns focus before selecting, preserving an intentional content focus move', () => {
    const onSelect = vi.fn(() => screen.getByRole('heading').focus());
    render(<><h2 tabIndex={-1}>Exam details</h2><MobileSectionMenu sections={sections} activeId="patient" onSelect={onSelect} /></>);
    fireEvent.click(screen.getByRole('button', { name: /Patient/ }));
    const item = screen.getByRole('button', { name: /Exam/ });
    item.focus();
    fireEvent.click(item);
    expect(onSelect).toHaveBeenCalledWith('exam');
    expect(screen.getByRole('heading')).toHaveFocus();
  });

  it('does not leave focus on the removed selected item', () => {
    render(<MobileSectionMenu sections={sections} activeId="patient" onSelect={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /Patient/ });
    fireEvent.click(trigger);
    const item = screen.getByRole('button', { name: /Exam/ });
    item.focus();
    fireEvent.click(item);
    expect(trigger).toHaveFocus();
  });

  it('fits below the trigger and recomputes after viewport changes', () => {
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ bottom: 600 } as DOMRect);
    vi.stubGlobal('innerHeight', 800);
    render(<MobileSectionMenu sections={sections} activeId="patient" onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Patient/ }));
    expect(screen.getByRole('list')).toHaveStyle({ maxHeight: '188px' });
    vi.stubGlobal('innerHeight', 700);
    fireEvent(window, new Event('resize'));
    expect(screen.getByRole('list')).toHaveStyle({ maxHeight: '88px' });
    rect.mockRestore();
    vi.unstubAllGlobals();
  });
});
