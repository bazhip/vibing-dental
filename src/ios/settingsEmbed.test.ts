/**
 * Chart settings → the custom anesthesia editor, a web form embedded in a
 * list cell. Its fieldsets are separated by a hairline on the fieldset's top
 * edge; a fieldset legend normally sits on that edge, so the line ran
 * through "Your fields". Floating the legend takes it off the edge.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/ios/settings.css', 'utf8');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim(), body: m[2] }));
const body = (sel: string) => rules.filter((r) => r.sel === sel).map((r) => r.body).join('\n');

describe('embedded anesthesia editor', () => {
  it('floats the legend off the separator line', () => {
    expect(body('html.native-ios .ios-cell-embed legend')).toMatch(/float:\s*left/);
    expect(body('html.native-ios .ios-cell-embed .chart-settings__note')).toMatch(/clear:\s*left/);
  });

  it('has no dashed web button: Add is a plain tinted 44pt button', () => {
    const add = body('html.native-ios .ios-cell-embed .anesthesia-drug__add');
    expect(add).toMatch(/border:\s*0/);
    expect(add).toMatch(/min-height:\s*44px/);
    expect(add).toMatch(/color:\s*var\(--ios-tint\)/);
  });
});
