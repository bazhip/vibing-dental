/**
 * Accessibility text sizes (AX3, 40pt body) — guards for what the full-app
 * audit found clipped or overlapping:
 * - list rows: the chevron / checkmark / switch dropped to a line of its own;
 * - chart section headings: Grid / By tooth ran over "Charting";
 * - the charting grid: fixed-size cells clipped tooth numbers and headings;
 * - the Settings account avatar: initials spilled out of the 40pt circle.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

function rules(file: string) {
  const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
}
const body = (file: string, sel: string) => rules(file).filter((r) => r.sel === sel).map((r) => r.body).join('\n');

describe('accessibility text sizes', () => {
  it('a list row’s text never takes the accessory’s place', () => {
    expect(body('src/ios/ios.css', ':where(html.native-ios) .ios-row__text')).toMatch(/flex:\s*1 1 min\(10em,\s*calc\(100% - 64px\)\)/);
  });

  it('chart section headings take their own width, so the row wraps', () => {
    const b = body('src/ios/chart/chart.css', 'html.native-ios .ios-chart-screen :is(.dental-grid__title, .patient-form__section-title)');
    expect(b).toMatch(/flex:\s*1 1 auto/);
    expect(b).not.toMatch(/flex:\s*1 1 0/);
  });

  it('the charting grid caps its text so fixed cells don’t clip it', () => {
    expect(body('src/ios/chart/chart.css', 'html.native-ios .ios-chart-screen .dental-grid .rdg')).toMatch(/font-size:\s*min\(0\.875rem,\s*18px\)/);
    expect(
      body('src/ios/chart/chart.css', 'html.native-ios .ios-chart-screen .dental-grid :is(.rdg-header-row, .rdg-header-row .rdg-cell, .dental-grid__root-label)'),
    ).toMatch(/font-size:\s*min\(0\.7rem,\s*14px\)/);
  });

  it('the account avatar’s initials stay inside their circle', () => {
    expect(body('src/ios/settings.css', 'html.native-ios .ios-settings__avatar')).toMatch(/min\(var\(--ios-text-subheadline\),\s*17px\)/);
  });
});
