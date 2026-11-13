/**
 * Form controls and Dynamic Type.
 *
 * The shared touch rule in EntryGrid.css pins every input to 16px
 * !important (so iOS doesn't zoom on focus). On the website it stays. In the
 * app the controls must keep growing with the user's text size instead:
 * html.native-ios overrides it with max(16px, 1em) — never under 16px, so
 * still no focus zoom.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/components/EntryGrid.css', 'utf8');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));

describe('touch form-control font size', () => {
  it('the website keeps 16px !important on input, select, textarea', () => {
    const web = rules.find((r) => /^(\/\*[\s\S]*?\*\/\s*)?input:not/.test(r.sel) && !r.sel.includes('native-ios'));
    expect(web?.body).toMatch(/font-size:\s*16px !important/);
    expect(web?.sel).toMatch(/\bselect\b/);
    expect(web?.sel).toMatch(/\btextarea\b/);
  });

  it('the app scales them with Dynamic Type (max(16px, 1em))', () => {
    const app = rules.find((r) => r.sel.includes('html.native-ios input:not') && /font-size/.test(r.body));
    expect(app?.body).toMatch(/font-size:\s*max\(16px,\s*1em\)\s*!important/);
    for (const el of ['select', 'textarea']) expect(app?.sel).toMatch(new RegExp(`html\\.native-ios ${el}\\b`));
    // Same exclusions as the web rule, so checkboxes, ranges etc. are untouched.
    for (const type of ['checkbox', 'radio', 'range', 'file', 'color']) expect(app?.sel).toContain(`:not([type='${type}'])`);
  });
});
