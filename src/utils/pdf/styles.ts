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

/** Live palette — mutated by `applyPdfStyle()`. Default is the slate
 *  "clinical" preset; rest of the generator reads `PALETTE.primary` etc. */
export const PALETTE: Palette = {
  primary:      rgb(0.06, 0.09, 0.16),
  primaryDark:  rgb(0.06, 0.09, 0.16),
  primaryTint:  rgb(0.97, 0.98, 0.99),
  ink:          rgb(0.06, 0.09, 0.16),
  text:         rgb(0.20, 0.25, 0.33),
  muted:        rgb(0.39, 0.45, 0.55),
  border:       rgb(0.89, 0.91, 0.94),
  borderStrong: rgb(0.74, 0.78, 0.82),
  rowAlt:       rgb(0.98, 0.99, 0.99),
  cellGray:     rgb(0.97, 0.98, 0.99),
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
  comment: { bg: '#fffaf0', border: '#f6e05e', labelColor: '#744210', textColor: '#2d3748' },
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

const SLATE: Palette = {
  primary:      rgb(0.06, 0.09, 0.16),
  primaryDark:  rgb(0.06, 0.09, 0.16),
  primaryTint:  rgb(0.97, 0.98, 0.99),
  ink:          rgb(0.06, 0.09, 0.16),
  text:         rgb(0.20, 0.25, 0.33),
  muted:        rgb(0.39, 0.45, 0.55),
  border:       rgb(0.89, 0.91, 0.94),
  borderStrong: rgb(0.74, 0.78, 0.82),
  rowAlt:       rgb(0.98, 0.99, 0.99),
  cellGray:     rgb(0.97, 0.98, 0.99),
  white:        rgb(1, 1, 1),
};

const INDIGO: Palette = {
  ...SLATE,
  primary:     rgb(0.31, 0.27, 0.90),
  primaryDark: rgb(0.24, 0.21, 0.71),
  primaryTint: rgb(0.93, 0.94, 1.00),
};

const NAVY: Palette = {
  ...SLATE,
  primary:     rgb(0.07, 0.18, 0.42),
  primaryDark: rgb(0.05, 0.13, 0.31),
  primaryTint: rgb(0.95, 0.97, 1.00),
};

const FOREST: Palette = {
  ...SLATE,
  primary:     rgb(0.04, 0.32, 0.20),
  primaryDark: rgb(0.03, 0.24, 0.15),
  primaryTint: rgb(0.94, 0.97, 0.95),
};

const BURGUNDY: Palette = {
  ...SLATE,
  primary:     rgb(0.42, 0.06, 0.13),
  primaryDark: rgb(0.32, 0.04, 0.10),
  primaryTint: rgb(1.00, 0.96, 0.96),
};

const PAPER: Palette = {
  ...SLATE,
  primary:      rgb(0.34, 0.18, 0.07),  // sepia ink
  primaryDark:  rgb(0.20, 0.11, 0.04),
  primaryTint:  rgb(0.98, 0.97, 0.92),
  border:       rgb(0.86, 0.83, 0.74),
  borderStrong: rgb(0.66, 0.62, 0.51),
  rowAlt:       rgb(0.97, 0.96, 0.91),
  cellGray:     rgb(0.96, 0.94, 0.87),
};

const MONO: Palette = {
  ...SLATE,
  primary:      rgb(0, 0, 0),
  primaryDark:  rgb(0, 0, 0),
  primaryTint:  rgb(0.96, 0.96, 0.96),
  border:       rgb(0, 0, 0),
  borderStrong: rgb(0, 0, 0),
  rowAlt:       rgb(0.95, 0.95, 0.95),
  cellGray:     rgb(0.92, 0.92, 0.92),
};

// ----- Style presets -------------------------------------------------------

export const PDF_STYLES: PdfStyle[] = [
  {
    id: 'clinical',
    name: 'Clinical',
    description: 'Slate, hairlines, mixed-case headings — current default.',
    palette: SLATE, fontFamily: 'sans',
    sectionTitle: 'hairline', tableHeader: 'light',
    comment: { bg: '#fffaf0', border: '#f6e05e', labelColor: '#744210', textColor: '#2d3748' },
  },
  {
    id: 'corporate',
    name: 'Corporate',
    description: 'Filled navy header bars with white text — enterprise SaaS look.',
    palette: NAVY, fontFamily: 'sans',
    sectionTitle: 'block', tableHeader: 'dark',
    comment: { bg: '#eef4ff', border: '#1d3a76', labelColor: '#0a2351', textColor: '#0a2351' },
  },
  {
    id: 'editorial',
    name: 'Editorial',
    description: 'Serif throughout — Times — sepia accents on cream paper.',
    palette: PAPER, fontFamily: 'serif',
    sectionTitle: 'serif', tableHeader: 'underline-only',
    comment: { bg: '#fdf6e3', border: '#8a6f33', labelColor: '#5b3d11', textColor: '#3a2a14' },
  },
  {
    id: 'mono',
    name: 'Monochrome',
    description: 'Pure black on white. Courier mono. Hard borders.',
    palette: MONO, fontFamily: 'mono',
    sectionTitle: 'uppercase', tableHeader: 'dark',
    comment: { bg: '#ffffff', border: '#000000', labelColor: '#000000', textColor: '#000000' },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Almost no chrome. Just text and the lightest hairlines.',
    palette: SLATE, fontFamily: 'sans',
    sectionTitle: 'underline-only', tableHeader: 'none',
    comment: { bg: '#ffffff', border: '#cbd5e1', labelColor: '#475569', textColor: '#1e293b' },
  },
  {
    id: 'indigo',
    name: 'Indigo Pro',
    description: 'Earlier indigo brand, uppercase tracked-out section titles.',
    palette: INDIGO, fontFamily: 'sans',
    sectionTitle: 'uppercase', tableHeader: 'dark',
    comment: { bg: '#eef2ff', border: '#4f46e5', labelColor: '#312e81', textColor: '#312e81' },
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Deep green accents on cool gray, soft block headers.',
    palette: FOREST, fontFamily: 'sans',
    sectionTitle: 'block', tableHeader: 'light',
    comment: { bg: '#f0fdf4', border: '#15803d', labelColor: '#14532d', textColor: '#14532d' },
  },
  {
    id: 'burgundy',
    name: 'Burgundy',
    description: 'Old-world maroon accents, serif body, stately.',
    palette: BURGUNDY, fontFamily: 'serif',
    sectionTitle: 'serif', tableHeader: 'dark',
    comment: { bg: '#fef2f2', border: '#7f1d1d', labelColor: '#5b0e0e', textColor: '#3f0808' },
  },
];

export const DEFAULT_PDF_STYLE_ID = 'clinical';
