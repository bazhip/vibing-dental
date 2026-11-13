import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ on: false }));
vi.mock('../native/platform', () => ({ isNativeApp: () => native.on }));

import { WalkthroughModal } from './WalkthroughModal';

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
