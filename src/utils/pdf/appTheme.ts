import { rgb } from 'pdf-lib';

/**
 * Bridge between the app's design tokens (CSS custom properties in
 * `src/styles/themes.css`) and the PDF's default palette.
 *
 * The default "Clinic Teal" PDF preset doesn't hardcode its colors —
 * at export time it reads the live tokens off `document.documentElement`,
 * so re-theming the app in themes.css automatically re-themes the PDF.
 * Static fallbacks (kept in sync as of the teal/ink system) cover
 * non-browser environments (tests) and older browsers.
 */

type RGB = ReturnType<typeof rgb>;

function hexToRgb(hex: string): RGB | null {
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function cssVar(name: string): string {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name);
  } catch {
    return '';
  }
}

export interface AppTokenColors {
  primary: RGB;
  primaryDark: RGB;
  ink: RGB;
  text: RGB;
  muted: RGB;
  border: RGB;
  borderStrong: RGB;
  danger: RGB;
  dangerTint: RGB;
}

const FALLBACKS: Record<keyof AppTokenColors, string> = {
  primary:      '#0c6b63',
  primaryDark:  '#095049',
  ink:          '#1b2733',
  text:         '#17232e',
  muted:        '#55677a',
  border:       '#e2e7eb',
  borderStrong: '#c5d0d8',
  danger:       '#b23c2a',
  dangerTint:   '#faf1ef',
};

const TOKEN_VARS: Record<keyof AppTokenColors, string> = {
  primary:      '--primary',
  primaryDark:  '--primary-end',
  ink:          '--ink',
  text:         '--text',
  muted:        '--text-muted',
  border:       '--border',
  borderStrong: '--border-strong',
  danger:       '--danger',
  dangerTint:   '--danger-tint',
};

/** Resolve the app tokens, falling back per-token when a var is missing
 *  or isn't a parseable hex color. */
export function readAppTokens(): AppTokenColors {
  const out = {} as AppTokenColors;
  for (const key of Object.keys(TOKEN_VARS) as Array<keyof AppTokenColors>) {
    out[key] = hexToRgb(cssVar(TOKEN_VARS[key])) ?? (hexToRgb(FALLBACKS[key]) as RGB);
  }
  return out;
}
