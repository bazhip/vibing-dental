/**
 * The sheet bar at accessibility text sizes: the primary (trailing) action
 * must not truncate — the title gives way first, and the secondary
 * (leading) action truncates at its cap. Bar buttons stop growing at 23pt,
 * as UIKit bar items do.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/ios/ios.css', 'utf8');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim(), body: m[2] }));
const barRules = (side: 'leading' | 'trailing') =>
  rules.filter((r) => r.sel.includes('.ios-sheet__bar') && r.sel.includes(`.ios-sheet__bar-${side}`) && r.sel.includes('.ios-glass-button'));
const maxWidth = (side: 'leading' | 'trailing') =>
  barRules(side).flatMap((r) => [...r.body.matchAll(/max-width:\s*([^;]+);/g)].map((m) => m[1].trim())).pop();

describe('sheet bar buttons', () => {
  it('caps the button text at 23px', () => {
    expect(barRules('trailing').some((r) => /font-size:\s*min\(var\(--ios-text-body\),\s*23px\)/.test(r.body))).toBe(true);
  });

  it('truncates the leading (secondary) action at its cap', () => {
    expect(maxWidth('leading')).toBe('min(32vw, 11em)');
  });

  it('gives the trailing (primary) action everything beside the leading cap', () => {
    expect(maxWidth('trailing')).toBe('calc(68vw - 64px)');
  });
});
