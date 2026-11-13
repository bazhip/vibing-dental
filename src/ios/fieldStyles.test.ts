/**
 * Three surfaces share the `.ios-field` row name: the chart's forms
 * (Form.tsx / Form.css), the sheets and sign-in screens (sheets.css, rows
 * inside .ios-form-group) and, formerly, Chart settings' text inputs. Every
 * stylesheet is loaded at once in the app, so a bare `html.native-ios
 * .ios-field` rule outside Form.css restyles the chart's rows too (it
 * right-aligned the Exam labels and dropped its segmented controls under
 * them). Only Form.css may style bare rows; sheets scope theirs.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? cssFiles(join(dir, e.name)) : e.name.endsWith('.css') ? [join(dir, e.name)] : [],
  );
}
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
/** [selector, body] for every rule (at-rule bodies are flattened). */
function rules(css: string): { sel: string; body: string }[] {
  return [...strip(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
}
/** The row and the parts the chart's FormField renders. */
const FIELD = /\.ios-field(?:__label|__control|--stacked|--bare)?(?![\w-])/;

describe('.ios-field row styles stay on their own surface', () => {
  it('outside Form.css, every .ios-field selector is scoped to a sheet form group', () => {
    const leaks: string[] = [];
    for (const file of cssFiles('src')) {
      // Form.css owns the chart's rows; chart.css styles them for the chart.
      if (file.endsWith(join('ios', 'Form.css')) || file.endsWith(join('chart', 'chart.css'))) continue;
      for (const { sel } of rules(readFileSync(file, 'utf8'))) {
        for (const one of sel.split(',').map((s) => s.trim())) {
          if (FIELD.test(one) && !one.includes('.ios-form-group')) leaks.push(`${file}: ${one}`);
        }
      }
    }
    expect(leaks).toEqual([]);
  });

  it('only rows holding a text field wrap; switches stay trailing', () => {
    const sheet = rules(readFileSync('src/ios/sheets.css', 'utf8'));
    const wrapping = sheet.filter((r) => FIELD.test(r.sel) && /flex-wrap:\s*wrap/.test(r.body));
    expect(wrapping.length).toBeGreaterThan(0);
    for (const r of wrapping) expect(r.sel).toMatch(/:has\([^)]*\.ios-field__input/);
    // The 9em basis that makes a row wrap goes to text fields only, never to
    // any control span.
    for (const r of sheet.filter((x) => /flex:\s*1 1 9em/.test(x.body))) {
      for (const one of r.sel.split(',')) {
        if (one.includes('.ios-field__control')) expect(one).toMatch(/:has\(/);
      }
    }
  });
});
