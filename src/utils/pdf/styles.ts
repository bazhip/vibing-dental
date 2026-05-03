import { StandardFonts, rgb } from 'pdf-lib';

/**
 * PDF design system — palette + font choices + section/table rendering
 * variants. Each `PdfStyle` is a complete preset; `applyPdfStyle()`
 * mutates the live `PALETTE` and `ACTIVE` objects so the rest of the
 * generator can reference them as globals without prop-drilling style
 * down through every draw helper.
 *
 * The mutate-globals pattern is intentional: it lets us swap presets
 * cheaply between `buildDentalChartPDFBytes` calls (the preview modal
 * regenerates on every style change) without rewriting the whole draw
 * pipeline to thread a `style` parameter through ~20 helpers.
 *
 * If we ever want to render two PDFs side-by-side in the same process,
 * we'd refactor to thread the style explicitly.
 */

export type Palette = {
  primary: ReturnType<typeof rgb>;
  primaryDark: ReturnType<typeof rgb>;
  primaryTint: ReturnType<typeof rgb>;
  ink: ReturnType<typeof rgb>;
  text: ReturnType<typeof rgb>;
  muted: ReturnType<typeof rgb>;
  border: ReturnType<typeof rgb>;
  borderStrong: ReturnType<typeof rgb>;
  rowAlt: ReturnType<typeof rgb>;
  cellGray: ReturnType<typeof rgb>;
  white: ReturnType<typeof rgb>;
};

export type SectionTitleVariant =
  | 'hairline'
  | 'uppercase'
  | 'block'
  | 'serif'
  | 'underline-only';

export type TableHeaderVariant =
  | 'light'
  | 'dark'
  | 'underline-only'
  | 'none';

export type FontFamilyKey = 'sans' | 'serif' | 'mono';

export interface CommentStyle {
  bg: string;          // CSS hex, used by both the in-app comment overlay and svgToPng
  border: string;
  labelColor: string;
  textColor: string;
}

export interface PdfStyle {
  id: string;
  name: string;
  description: string;
  palette: Palette;
  fontFamily: FontFamilyKey;
  sectionTitle: SectionTitleVariant;
  tableHeader: TableHeaderVariant;
  comment: CommentStyle;
}

// ----- Live (mutable) style state ------------------------------------------

/** Live palette — mutated by `applyPdfStyle()`. Default is the
 *  Aperture preset; rest of the generator reads `PALETTE.primary` etc. */
export const PALETTE: Palette = {
  primary:      rgb(0.00, 0.48, 1.00),
  primaryDark:  rgb(0.00, 0.36, 0.80),
  primaryTint:  rgb(0.96, 0.97, 0.99),
  ink:          rgb(0.07, 0.08, 0.10),
  text:         rgb(0.21, 0.22, 0.27),
  muted:        rgb(0.44, 0.46, 0.51),
  border:       rgb(0.91, 0.92, 0.94),
  borderStrong: rgb(0.78, 0.80, 0.83),
  rowAlt:       rgb(0.97, 0.98, 0.99),
  cellGray:     rgb(0.96, 0.97, 0.98),
  white:        rgb(1, 1, 1),
};

/** Non-color style state (font + variant ids + comment colors). */
export const ACTIVE: {
  fontFamilyKey: FontFamilyKey;
  sectionTitleVariant: SectionTitleVariant;
  tableHeaderVariant: TableHeaderVariant;
  comment: CommentStyle;
} = {
  fontFamilyKey:        'sans',
  sectionTitleVariant:  'hairline',
  tableHeaderVariant:   'light',
  comment: { bg: '#f5f7fa', border: '#c7cdd6', labelColor: '#1d1d1f', textColor: '#1d1d1f' },
};

export function applyPdfStyle(style: PdfStyle): void {
  Object.assign(PALETTE, style.palette);
  ACTIVE.fontFamilyKey       = style.fontFamily;
  ACTIVE.sectionTitleVariant = style.sectionTitle;
  ACTIVE.tableHeaderVariant  = style.tableHeader;
  ACTIVE.comment             = style.comment;
}

export const FONT_MAP: Record<FontFamilyKey, { regular: StandardFonts; bold: StandardFonts }> = {
  sans:  { regular: StandardFonts.Helvetica,  bold: StandardFonts.HelveticaBold  },
  serif: { regular: StandardFonts.TimesRoman, bold: StandardFonts.TimesRomanBold },
  mono:  { regular: StandardFonts.Courier,    bold: StandardFonts.CourierBold    },
};

// ----- Palette presets -----------------------------------------------------
// One palette per theme id. Naming mirrors the BOARDS list so a theme,
// its UI tokens, and its PDF preset all share the same id.

const APERTURE: Palette = {
  primary:      rgb(0.00, 0.48, 1.00),  // Apple system blue
  primaryDark:  rgb(0.00, 0.36, 0.80),
  primaryTint:  rgb(0.96, 0.97, 0.99),
  ink:          rgb(0.07, 0.08, 0.10),
  text:         rgb(0.21, 0.22, 0.27),
  muted:        rgb(0.44, 0.46, 0.51),
  border:       rgb(0.91, 0.92, 0.94),
  borderStrong: rgb(0.78, 0.80, 0.83),
  rowAlt:       rgb(0.97, 0.98, 0.99),
  cellGray:     rgb(0.96, 0.97, 0.98),
  white:        rgb(1, 1, 1),
};

const LEDGER: Palette = {
  primary:      rgb(0.39, 0.27, 0.93),  // violet 600
  primaryDark:  rgb(0.31, 0.21, 0.78),
  primaryTint:  rgb(0.96, 0.95, 1.00),
  ink:          rgb(0.04, 0.05, 0.07),
  text:         rgb(0.18, 0.19, 0.24),
  muted:        rgb(0.43, 0.45, 0.50),
  border:       rgb(0.89, 0.90, 0.93),
  borderStrong: rgb(0.74, 0.76, 0.80),
  rowAlt:       rgb(0.98, 0.98, 0.99),
  cellGray:     rgb(0.96, 0.96, 0.98),
  white:        rgb(1, 1, 1),
};

const ORACLE: Palette = {
  primary:      rgb(0.36, 0.36, 1.00),  // electric indigo
  primaryDark:  rgb(0.27, 0.27, 0.86),
  primaryTint:  rgb(0.94, 0.94, 1.00),
  ink:          rgb(0.05, 0.05, 0.07),
  text:         rgb(0.13, 0.14, 0.18),
  muted:        rgb(0.40, 0.42, 0.49),
  border:       rgb(0.84, 0.85, 0.89),
  borderStrong: rgb(0.62, 0.64, 0.70),
  rowAlt:       rgb(0.97, 0.97, 0.98),
  cellGray:     rgb(0.95, 0.95, 0.97),
  white:        rgb(1, 1, 1),
};

const FOLIO: Palette = {
  primary:      rgb(0.34, 0.18, 0.07),  // sepia ink
  primaryDark:  rgb(0.20, 0.11, 0.04),
  primaryTint:  rgb(0.98, 0.97, 0.92),
  ink:          rgb(0.10, 0.07, 0.05),
  text:         rgb(0.22, 0.18, 0.14),
  muted:        rgb(0.46, 0.40, 0.32),
  border:       rgb(0.86, 0.83, 0.74),
  borderStrong: rgb(0.66, 0.62, 0.51),
  rowAlt:       rgb(0.97, 0.96, 0.91),
  cellGray:     rgb(0.96, 0.94, 0.87),
  white:        rgb(0.99, 0.98, 0.95),
};

const CONCRETE: Palette = {
  primary:      rgb(0.91, 0.27, 0.20),  // signal red
  primaryDark:  rgb(0.74, 0.16, 0.10),
  primaryTint:  rgb(1.00, 0.95, 0.94),
  ink:          rgb(0, 0, 0),
  text:         rgb(0, 0, 0),
  muted:        rgb(0.30, 0.30, 0.30),
  border:       rgb(0, 0, 0),
  borderStrong: rgb(0, 0, 0),
  rowAlt:       rgb(0.94, 0.94, 0.94),
  cellGray:     rgb(0.90, 0.90, 0.90),
  white:        rgb(1, 1, 1),
};

const ATRIUM: Palette = {
  primary:      rgb(0.62, 0.42, 0.10),  // muted ochre
  primaryDark:  rgb(0.48, 0.32, 0.07),
  primaryTint:  rgb(0.98, 0.96, 0.91),
  ink:          rgb(0.16, 0.15, 0.14),
  text:         rgb(0.27, 0.25, 0.23),
  muted:        rgb(0.50, 0.47, 0.44),
  border:       rgb(0.86, 0.83, 0.78),
  borderStrong: rgb(0.65, 0.60, 0.54),
  rowAlt:       rgb(0.97, 0.96, 0.93),
  cellGray:     rgb(0.95, 0.94, 0.91),
  white:        rgb(0.99, 0.98, 0.96),
};

const PULSE: Palette = {
  primary:      rgb(0.05, 0.42, 0.71),  // medical blue
  primaryDark:  rgb(0.03, 0.30, 0.55),
  primaryTint:  rgb(0.93, 0.96, 1.00),
  ink:          rgb(0.05, 0.10, 0.18),
  text:         rgb(0.18, 0.23, 0.31),
  muted:        rgb(0.39, 0.46, 0.55),
  border:       rgb(0.85, 0.88, 0.93),
  borderStrong: rgb(0.62, 0.68, 0.76),
  rowAlt:       rgb(0.97, 0.98, 0.99),
  cellGray:     rgb(0.95, 0.96, 0.98),
  white:        rgb(1, 1, 1),
};

const BAUHAUS: Palette = {
  primary:      rgb(0.86, 0.16, 0.16),  // bauhaus red
  primaryDark:  rgb(0.65, 0.10, 0.10),
  primaryTint:  rgb(0.98, 0.96, 0.92),  // bone
  ink:          rgb(0.05, 0.05, 0.05),
  text:         rgb(0.10, 0.10, 0.10),
  muted:        rgb(0.30, 0.30, 0.30),
  border:       rgb(0.05, 0.05, 0.05),
  borderStrong: rgb(0, 0, 0),
  rowAlt:       rgb(0.96, 0.94, 0.88),
  cellGray:     rgb(0.92, 0.91, 0.85),
  white:        rgb(0.99, 0.98, 0.94),
};

const VAPOR: Palette = {
  primary:      rgb(0.93, 0.27, 0.74),  // magenta
  primaryDark:  rgb(0.74, 0.18, 0.58),
  primaryTint:  rgb(0.98, 0.93, 0.97),
  ink:          rgb(0.06, 0.05, 0.10),
  text:         rgb(0.16, 0.14, 0.22),
  muted:        rgb(0.40, 0.36, 0.50),
  border:       rgb(0.84, 0.80, 0.90),
  borderStrong: rgb(0.60, 0.55, 0.70),
  rowAlt:       rgb(0.97, 0.95, 0.99),
  cellGray:     rgb(0.95, 0.93, 0.98),
  white:        rgb(1, 1, 1),
};

const ALMANAC: Palette = {
  primary:      rgb(0.45, 0.10, 0.10),  // maroon
  primaryDark:  rgb(0.32, 0.06, 0.06),
  primaryTint:  rgb(0.99, 0.96, 0.93),
  ink:          rgb(0.12, 0.08, 0.06),
  text:         rgb(0.22, 0.16, 0.12),
  muted:        rgb(0.45, 0.36, 0.28),
  border:       rgb(0.78, 0.72, 0.62),
  borderStrong: rgb(0.55, 0.48, 0.38),
  rowAlt:       rgb(0.97, 0.94, 0.88),
  cellGray:     rgb(0.95, 0.91, 0.84),
  white:        rgb(0.99, 0.96, 0.91),
};

// ----- Style presets -------------------------------------------------------
// Every preset is also a board id in BoardSwitcher.tsx — keep them aligned.

export const PDF_STYLES: PdfStyle[] = [
  {
    id: 'aperture',
    name: 'Aperture',
    description: 'Premium Apple-luxe — soft cool greys, system blue, generous spacing.',
    palette: APERTURE, fontFamily: 'sans',
    sectionTitle: 'hairline', tableHeader: 'light',
    comment: { bg: '#f5f7fa', border: '#c7cdd6', labelColor: '#1d1d1f', textColor: '#1d1d1f' },
  },
  {
    id: 'ledger',
    name: 'Ledger',
    description: 'Stripe-grade SaaS minimal — monochrome with one violet accent.',
    palette: LEDGER, fontFamily: 'sans',
    sectionTitle: 'hairline', tableHeader: 'light',
    comment: { bg: '#f7f7f9', border: '#d4d4dc', labelColor: '#0a0b0f', textColor: '#1f2030' },
  },
  {
    id: 'oracle',
    name: 'Oracle',
    description: 'Linear-style — uppercase tracked titles, dense, electric indigo.',
    palette: ORACLE, fontFamily: 'sans',
    sectionTitle: 'uppercase', tableHeader: 'dark',
    comment: { bg: '#f0f0fa', border: '#5b5bd6', labelColor: '#1e1e4d', textColor: '#1e1e4d' },
  },
  {
    id: 'folio',
    name: 'Folio',
    description: 'Editorial print — Times serif throughout, sepia + cream paper.',
    palette: FOLIO, fontFamily: 'serif',
    sectionTitle: 'serif', tableHeader: 'underline-only',
    comment: { bg: '#fdf6e3', border: '#8a6f33', labelColor: '#5b3d11', textColor: '#3a2a14' },
  },
  {
    id: 'concrete',
    name: 'Concrete',
    description: 'Brutalist mono — Courier, hard 1pt rules, signal-red accent.',
    palette: CONCRETE, fontFamily: 'mono',
    sectionTitle: 'uppercase', tableHeader: 'dark',
    comment: { bg: '#ffffff', border: '#000000', labelColor: '#000000', textColor: '#000000' },
  },
  {
    id: 'atrium',
    name: 'Atrium',
    description: 'Japandi minimal — sand + charcoal + ochre, hairline only.',
    palette: ATRIUM, fontFamily: 'sans',
    sectionTitle: 'underline-only', tableHeader: 'none',
    comment: { bg: '#f5f1e8', border: '#a89172', labelColor: '#3d342a', textColor: '#3d342a' },
  },
  {
    id: 'pulse',
    name: 'Pulse',
    description: 'Hospital-clinical — cool blue, dense data, block headers.',
    palette: PULSE, fontFamily: 'sans',
    sectionTitle: 'block', tableHeader: 'dark',
    comment: { bg: '#ecf3fa', border: '#1565a8', labelColor: '#0d3b6e', textColor: '#0d3b6e' },
  },
  {
    id: 'bauhaus',
    name: 'Bauhaus',
    description: 'Modernist — bone background, bauhaus red, hard 1pt rules.',
    palette: BAUHAUS, fontFamily: 'sans',
    sectionTitle: 'block', tableHeader: 'dark',
    comment: { bg: '#fbf8ed', border: '#dc2828', labelColor: '#0a0a0a', textColor: '#0a0a0a' },
  },
  {
    id: 'vapor',
    name: 'Vapor',
    description: 'Cyberpunk neon — magenta accent on lavender-tinted paper.',
    palette: VAPOR, fontFamily: 'sans',
    sectionTitle: 'uppercase', tableHeader: 'dark',
    comment: { bg: '#faf0f7', border: '#ed44bd', labelColor: '#5d1845', textColor: '#3d0d2c' },
  },
  {
    id: 'almanac',
    name: 'Almanac',
    description: 'Vintage apothecary — Times serif, maroon, parchment paper.',
    palette: ALMANAC, fontFamily: 'serif',
    sectionTitle: 'serif', tableHeader: 'underline-only',
    comment: { bg: '#faf3e6', border: '#8a322a', labelColor: '#3d130d', textColor: '#3d130d' },
  },
];

export const DEFAULT_PDF_STYLE_ID = 'aperture';
