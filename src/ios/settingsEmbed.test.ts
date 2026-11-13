/**
 * Chart settings → the custom anesthesia editor, a web form embedded in a
 * list cell. Its fieldsets are separated by a hairline on the fieldset's top
 * edge; a fieldset legend sits on that edge, so the line ran through
 * "Your fields" (and WebKit won't float a legend off it). The hairline is
 * now the upper fieldset's bottom edge.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/ios/settings.css', 'utf8');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim(), body: m[2] }));
const body = (sel: string) => rules.filter((r) => r.sel === sel).map((r) => r.body).join('\n');

describe('embedded anesthesia editor', () => {
  it('draws the separator on the upper fieldset’s bottom edge, never a top edge', () => {
    expect(body('html.native-ios .ios-cell-embed .chart-settings__field:not(:last-of-type)')).toMatch(/box-shadow:\s*inset 0 -0\.5px 0/);
    const adjacent = body('html.native-ios .ios-cell-embed .chart-settings__field + .chart-settings__field');
    expect(adjacent).not.toMatch(/box-shadow|border-top/);
  });

  it('has no dashed web button: Add is a plain tinted 44pt button', () => {
    const add = body('html.native-ios .ios-cell-embed .anesthesia-drug__add');
    expect(add).toMatch(/border:\s*0/);
    expect(add).toMatch(/min-height:\s*44px/);
    expect(add).toMatch(/color:\s*var\(--ios-tint\)/);
  });
});
