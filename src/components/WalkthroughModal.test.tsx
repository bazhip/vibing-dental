import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ on: false }));
vi.mock('../native/platform', () => ({ isNativeApp: () => native.on }));

import { buildSteps, WalkthroughModal } from './WalkthroughModal';

beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
});

/** Every step's title and body, clicking through to the end. */
function walk(): string {
  const seen: string[] = [];
  for (let n = 0; n < 20; n++) {
    seen.push(document.querySelector('.tour__pop')?.textContent ?? '');
    const next = screen.queryByRole('button', { name: /^(Next|Get charting)$/ });
    if (!next || next.textContent === 'Get charting') break;
    fireEvent.click(next);
  }
  return seen.join('\n');
}

describe('WalkthroughModal', () => {
  it('on the website keeps its keyboard-and-mouse copy', () => {
    native.on = false;
    render(<WalkthroughModal open onClose={() => {}} />);
    const text = walk();
    expect(text).toContain('Undo with ⌘Z');
    expect(text).toContain('My charts');
    expect(text).toContain('1 of 12');
    expect(text).toContain('By tooth');
    expect(text).toContain('Make it yours');
    expect(text).toContain('Photos & radiographs');
    expect(text).not.toContain('The eight sections');
  });

  it('in the app speaks touch and points at the app chrome', () => {
    native.on = true;
    render(<WalkthroughModal open onClose={() => {}} />);
    const text = walk();
    expect(text).not.toMatch(/click|⌘|Tab moves|Enter moves|dropdown|My charts|download/i);
    expect(text).toContain('Tap the chart’s title to jump between sections');
    expect(text).toContain('Share the PDF');
    expect(text).toContain('By tooth');
    expect(text).toContain('Make it yours');
    expect(text).toContain('More menu');
    expect(text).toContain('Photos & radiographs');
    expect(screen.getByRole('button', { name: 'Get charting' })).toBeInTheDocument();
  });

  it('covers the main workflows and anchors charting in either view', () => {
    const steps = buildSteps();
    expect(steps.map(({ id }) => id)).toEqual([
      'welcome', 'sections', 'patient', 'grid', 'byTooth', 'customize',
      'diagrams', 'images', 'treatment', 'library', 'settings', 'pdf',
    ]);
    expect(steps.find(({ id }) => id === 'grid')?.target).toBe('.dental-grid, .tooth-chart');
    expect(steps.find(({ id }) => id === 'byTooth')).toMatchObject({ section: 'charting', target: '.charting-view-switch' });
    expect(steps.find(({ id }) => id === 'images')?.section).toBe('imaging');
    expect(steps.find(({ id }) => id === 'treatment')?.target).toBe('.surgery-report__header');
    expect(steps.some(({ id }) => id === 'dictate')).toBe(false);
    expect(buildSteps(true).filter(({ id }) => id === 'dictate')).toHaveLength(1);
  });

  it.each([false, true])('only introduces owner reports when enabled (native: %s)', (app) => {
    native.on = app;
    const onNavigate = vi.fn();
    const { rerender } = render(<WalkthroughModal open onClose={() => {}} onNavigate={onNavigate} />);
    expect(walk()).not.toContain('A report for home');
    expect(onNavigate).not.toHaveBeenCalledWith('owner-report');
    rerender(<WalkthroughModal open={false} onClose={() => {}} ownerReportEnabled />);
    rerender(<WalkthroughModal open onClose={() => {}} ownerReportEnabled aiEnabled onNavigate={onNavigate} />);
    const text = walk();
    expect(text).toContain('A report for home');
    expect(text).toContain('Dictate');
    expect(text).toContain('1 of 14');
    expect(onNavigate).toHaveBeenCalledWith('owner-report');
  });
});
