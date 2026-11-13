/**
 * App-only color sweep guard.
 *
 * The iOS app follows system light/dark mode through the tokens in
 * src/ios/tokens.css, which only exist under html.native-ios. So every
 * color in the stylesheets the app renders must be either
 *   - the fallback of a var(--token, <literal>) — the website, where the
 *     token is unset, keeps the literal pixel for pixel;
 *   - inside an html.native-ios rule (app-only by construction); or
 *   - on the allow-list below: artwork, print and PDF-preview surfaces
 *     that stay light (or dark) in both schemes on purpose.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const SWEPT_FILES = [
  '../components/EntryGrid.css',
  '../styles/boards.css',
  '../components/Login.css',
  '../components/BillingGate.css',
  '../components/AccountSurfaces.css',
  '../components/OwnerReportTemplatesModal.css',
  '../components/ui/dialogs.css',
  '../index.css',
  '../App.css',
];

/** Selectors whose colors deliberately don't follow the scheme. */
const ALLOW: { re: RegExp; reason: string }[] = [
  { re: /^@media print/, reason: 'print output is always on white paper' },
  { re: /\.tooth-diagram|\.tooth-group|\.tooth-tooltip|\.tooth-number/, reason: 'diagram artwork stays light, like the PDF it prints into' },
  { re: /\.tooth-chart__swatch/, reason: 'legend swatches repeat the diagram artwork colors' },
  { re: /\.diagram-comment|\.diagram-view__color/, reason: 'diagram sticky notes and pen colors are part of the artwork' },
  { re: /\.pdf-pages-preview__page|\.pdf-preview-iframe/, reason: 'PDF pages render on paper white over a neutral well' },
  { re: /logo-preview/, reason: 'logo previews show the logo on the PDF\'s paper white' },
  { re: /\.pdf-style-swatch/, reason: 'PDF color choices show the literal color that will print' },
  { re: /\.imaging__thumb/, reason: 'radiographs sit on near-black in both schemes' },
  { re: /\.login-google/, reason: "Google's sign-in button branding (light button is allowed on dark)" },
];

// ---- tiny CSS walker ------------------------------------------------------

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

type Decl = { stack: string[]; prop: string; value: string; line: number };

function declarations(css: string): Decl[] {
  const s = stripComments(css);
  const out: Decl[] = [];
  const stack: string[] = [];
  let start = 0;
  let quote: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === quote && s[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '{') {
      stack.push(s.slice(start, i).trim().replace(/\s+/g, ' '));
      start = i + 1;
    } else if (c === ';' || c === '}') {
      const text = s.slice(start, i);
      const m = /^\s*([-\w]+)\s*:/.exec(text);
      if (m && stack.length) {
        out.push({
          stack: [...stack],
          prop: m[1].toLowerCase(),
          value: text.slice(m[0].length),
          line: s.slice(0, start).split('\n').length,
        });
      }
      if (c === '}') stack.pop();
      start = i + 1;
    }
  }
  return out;
}

const COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\([^()]*\)|\b(?:white|black)\b/g;

/** Is offset `idx` inside the fallback (after the first comma) of a var()? */
function inVarFallback(value: string, idx: number): boolean {
  const frames: { isVar: boolean; comma: boolean }[] = [];
  for (let i = 0; i < idx; i++) {
    const c = value[i];
    if (c === '(') frames.push({ isVar: /var$/.test(value.slice(Math.max(0, i - 3), i)), comma: false });
    else if (c === ')') frames.pop();
    else if (c === ',' && frames.length) frames[frames.length - 1].comma = true;
  }
  return frames.some((f) => f.isVar && f.comma);
}

/** Is offset `idx` inside a url(...) (data-URI artwork)? */
function inUrl(value: string, idx: number): boolean {
  const open = value.lastIndexOf('url(', idx);
  return open !== -1 && value.indexOf(')', open) > idx;
}

function bareColors(file: string): string[] {
  const problems: string[] = [];
  for (const d of declarations(read(file))) {
    if (d.stack.some((p) => /html\.native-ios/.test(p))) continue;
    if (d.stack.some((p) => ALLOW.some((a) => a.re.test(p)))) continue;
    if (d.prop.startsWith('--') && !/color/.test(d.prop)) continue; // layout vars
    const re = new RegExp(COLOR.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(d.value))) {
      if (inUrl(d.value, m.index) || inVarFallback(d.value, m.index)) continue;
      problems.push(`${file.replace('../', '')}:${d.line} ${d.stack.join(' > ')} { ${d.prop}: ${m[0]} }`);
    }
  }
  return problems;
}

describe('app-only color sweep', () => {
  for (const file of SWEPT_FILES) {
    it(`${file.replace('../', '')} has no bare color literals`, () => {
      expect(bareColors(file)).toEqual([]);
    });
  }

  it('the walker catches a bare literal and accepts a fallback', () => {
    // Guards the guard: a broken parser would pass every file.
    expect(declarations('.a{color:#fff}').length).toBe(1);
    expect(inVarFallback('var(--x, #fff)', 9)).toBe(true);
    expect(inVarFallback('#fff', 0)).toBe(false);
    expect(inVarFallback('color-mix(in srgb, var(--p) 8%, white)', 32)).toBe(false);
  });
});

describe('iOS tokens', () => {
  let tokens = '';
  beforeAll(() => { tokens = read('./tokens.css'); });
  const REQUIRED = [
    '--ios-bg', '--ios-bg-grouped', '--ios-bg-elevated', '--ios-cell', '--ios-label',
    '--ios-label-2', '--ios-label-3', '--ios-separator', '--ios-fill', '--ios-tint',
    '--ios-danger', '--ios-bar-material', '--ios-font',
    '--ios-text-large-title', '--ios-text-title1', '--ios-text-title2', '--ios-text-title3',
    '--ios-text-headline', '--ios-text-body', '--ios-text-callout', '--ios-text-subheadline',
    '--ios-text-footnote', '--ios-text-caption1', '--ios-text-caption2',
  ];

  it('every rule is scoped to the app (html.native-ios), so the website is untouched', () => {
    const s = stripComments(tokens);
    const preludes = [...s.matchAll(/([^{};]+)\{/g)].map((m) => m[1].trim());
    const selectors = preludes.filter((p) => !p.startsWith('@'));
    expect(selectors.length).toBeGreaterThan(0);
    for (const sel of selectors) {
      for (const part of sel.split(',')) {
        expect(part.trim(), sel).toMatch(/^html\.native-ios\b/);
      }
    }
  });

  it('defines every required token for light mode', () => {
    const light = declarations(tokens).filter(
      (d) => d.stack.length === 1 && /^html\.native-ios$/.test(d.stack[0])
    ).map((d) => d.prop);
    for (const t of REQUIRED) expect(light, t).toContain(t);
  });

  it('redefines the colors for dark mode', () => {
    const dark = declarations(tokens).filter(
      (d) => d.stack[0] === '@media (prefers-color-scheme: dark)'
    ).map((d) => d.prop);
    for (const t of REQUIRED.filter((x) => !x.startsWith('--ios-text') && x !== '--ios-font')) {
      expect(dark, t).toContain(t);
    }
  });

  it('honours Reduce Transparency, Increase Contrast and Reduce Motion', () => {
    expect(tokens).toMatch(/@media \(prefers-reduced-transparency: reduce\)/);
    expect(tokens).toMatch(/@media \(prefers-contrast: more\)/);
    expect(tokens).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });

  // ---- contrast of small secondary text --------------------------------
  const hexRgb = (h: string) => {
    const m = /^#([0-9a-f]{6})$/i.exec(h.trim());
    if (!m) throw new Error(`expected an opaque hex color, got ${h}`);
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const lum = (h: string) => {
    const [r, g, b] = hexRgb(h).map((c) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const tokenSet = (pred: (stack: string[]) => boolean) =>
    Object.fromEntries(
      declarations(tokens).filter((d) => pred(d.stack)).map((d) => [d.prop, d.value.trim()])
    ) as Record<string, string>;
  const SURFACES = ['--ios-bg', '--ios-bg-grouped', '--ios-bg-elevated', '--ios-cell', '--ios-cell-alt'];

  it('muted (small secondary) text meets WCAG AA on every surface, light and dark', () => {
    const light = tokenSet((st) => st.length === 1 && st[0] === 'html.native-ios');
    const dark = { ...light, ...tokenSet((st) => st[0] === '@media (prefers-color-scheme: dark)') };
    for (const [scheme, set] of [['light', light], ['dark', dark]] as const) {
      for (const bg of SURFACES) {
        const r = contrast(set['--ios-label-muted'], set[bg]);
        expect(r, `${scheme} --ios-label-muted on ${bg} (${set[bg]}) = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    // The theme's muted text uses it, not the translucent secondaryLabel.
    expect(light['--text-muted']).toBe('var(--ios-label-muted)');
  });

  it('Reduce Motion keeps indeterminate spinners turning (slowed), not frozen', () => {
    const rm = declarations(tokens).filter(
      (d) => d.stack[0] === '@media (prefers-reduced-motion: reduce)' && /spinner/.test(d.stack[1] ?? '')
    );
    const sel = rm[0]?.stack[1] ?? '';
    expect(sel).toMatch(/\.app-loading__spinner/);
    expect(sel).toMatch(/\.billing-gate__spinner/);
    const props = Object.fromEntries(rm.map((d) => [d.prop, d.value.trim()]));
    expect(props['animation-iteration-count']).toBe('infinite !important');
    expect(props['animation-duration']).toBe('2.4s !important');
  });
});

