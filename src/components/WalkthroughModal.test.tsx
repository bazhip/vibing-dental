import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ on: false }));
vi.mock('../native/platform', () => ({ isNativeApp: () => native.on }));

import { WalkthroughModal, buildSteps } from './WalkthroughModal';

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
  it('first run covers three tasks and leaves the full tour available', () => {
    native.on = false;
    render(<WalkthroughModal open firstRun aiEnabled onClose={() => {}} />);
    const text = walk();
    expect(text).toContain('1 of 3');
    expect(text).toContain('Identify the patient');
    expect(text).toContain('Record a finding');
    expect(text).toContain('Review the output');
    expect(text).not.toContain('The nine sections');
    expect(buildSteps(true)).toHaveLength(12);
  });

  it('can switch from the full tour to the shorter first-run path', () => {
    native.on = false;
    const { rerender } = render(<WalkthroughModal open onClose={() => {}} />);
    walk();
    rerender(<WalkthroughModal open firstRun onClose={() => {}} />);
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
  });

  it('targets both charting views and the current export control', () => {
    expect(buildSteps().find((step) => step.id === 'grid')?.target).toBe('.dental-grid, .tooth-chart');
    expect(buildSteps().find((step) => step.id === 'pdf')?.target).toBe('.visit-export__button');
  });

  it('points Practice settings at the workspace destination', () => {
    expect(buildSteps().find((step) => step.id === 'settings')?.target).toBe('[data-tour="practice-settings"]');
  });

  it('on the website keeps its keyboard-and-mouse copy', () => {
    native.on = false;
    render(<WalkthroughModal open onClose={() => {}} />);
    const text = walk();
    expect(text).toContain('Undo with ⌘Z');
    expect(text).toContain('Patients');
    expect(text).toContain('The nine sections');
    expect(text).toContain('Equine');
    expect(text).toContain('Help → Getting started');
    expect(text).toContain('Visit actions');
    expect(text).toContain('1 of 11');
  });

  it('in the app speaks touch and points at the app chrome', () => {
    native.on = true;
    render(<WalkthroughModal open onClose={() => {}} />);
    const text = walk();
    expect(text).not.toMatch(/click|⌘|Tab moves|Enter moves|dropdown|My charts|download/i);
    expect(text).toContain('Tap the chart’s title to jump between sections');
    expect(text).toContain('Share the PDF');
    expect(screen.getByRole('button', { name: 'Get charting' })).toBeInTheDocument();
  });
});
