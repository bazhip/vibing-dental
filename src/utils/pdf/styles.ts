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
 *
 * The preset list is deliberately small and clinical: this document goes
 * into medical records and gets handed to pet owners. Every preset must
 * read as a professional chart first — the differences are restrained
 * (accent hue, header treatment, one serif option), not costumes.
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
  /** Clinical signal red — abnormal findings. Print-safe, not alarm red. */
  danger: ReturnType<typeof rgb>;
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

const CLINICAL_DANGER = rgb(0.698, 0.235, 0.165); // #B23C2A

// ----- Palette presets -----------------------------------------------------

/** Clinic Teal — the app's own identity on paper. Default. */
const CLINIC: Palette = {
  primary:      rgb(0.047, 0.420, 0.388),  // #0C6B63
  primaryDark:  rgb(0.035, 0.314, 0.286),
  primaryTint:  rgb(0.937, 0.965, 0.961),
  ink:          rgb(0.106, 0.153, 0.200),  // #1B2733
  text:         rgb(0.133, 0.188, 0.235),
  muted:        rgb(0.333, 0.404, 0.478),
  border:       rgb(0.886, 0.906, 0.922),
  borderStrong: rgb(0.773, 0.816, 0.847),
  rowAlt:       rgb(0.969, 0.976, 0.980),
  cellGray:     rgb(0.933, 0.949, 0.953),
  white:        rgb(1, 1, 1),
  danger:       CLINICAL_DANGER,
};

/** Classic Blue — traditional medical-records blue. */
const CLASSIC_BLUE: Palette = {
  primary:      rgb(0.122, 0.361, 0.588),  // #1F5C96
  primaryDark:  rgb(0.078, 0.247, 0.412),
  primaryTint:  rgb(0.937, 0.961, 0.980),
  ink:          rgb(0.059, 0.118, 0.180),
  text:         rgb(0.122, 0.180, 0.239),
  muted:        rgb(0.298, 0.380, 0.478),
  border:       rgb(0.867, 0.898, 0.925),
  borderStrong: rgb(0.725, 0.780, 0.831),
  rowAlt:       rgb(0.965, 0.976, 0.984),
  cellGray:     rgb(0.925, 0.945, 0.961),
  white:        rgb(1, 1, 1),
  danger:       CLINICAL_DANGER,
};

/** Slate — pure graphite neutrals; survives black-and-white printing. */
const SLATE: Palette = {
  primary:      rgb(0.247, 0.294, 0.345),  // #3F4B58
  primaryDark:  rgb(0.169, 0.200, 0.239),
  primaryTint:  rgb(0.945, 0.953, 0.961),
  ink:          rgb(0.078, 0.094, 0.114),
  text:         rgb(0.149, 0.173, 0.200),
  muted:        rgb(0.353, 0.392, 0.431),
  border:       rgb(0.882, 0.894, 0.910),
  borderStrong: rgb(0.765, 0.788, 0.816),
  rowAlt:       rgb(0.969, 0.973, 0.976),
  cellGray:     rgb(0.937, 0.945, 0.953),
  white:        rgb(1, 1, 1),
  danger:       CLINICAL_DANGER,
};

/** Iris — quiet indigo, compact tracked headers. */
const IRIS: Palette = {
  primary:      rgb(0.290, 0.310, 0.640),  // #4A4FA3
  primaryDark:  rgb(0.212, 0.227, 0.502),
  primaryTint:  rgb(0.945, 0.945, 0.976),
  ink:          rgb(0.075, 0.086, 0.157),
  text:         rgb(0.137, 0.149, 0.227),
  muted:        rgb(0.337, 0.357, 0.459),
  border:       rgb(0.886, 0.890, 0.925),
  borderStrong: rgb(0.761, 0.769, 0.839),
  rowAlt:       rgb(0.969, 0.969, 0.984),
  cellGray:     rgb(0.937, 0.937, 0.965),
  white:        rgb(1, 1, 1),
  danger:       CLINICAL_DANGER,
};

/** Journal — serif print classic; deep red accents on warm paper. */
const JOURNAL: Palette = {
  primary:      rgb(0.431, 0.173, 0.149),  // #6E2C26
  primaryDark:  rgb(0.322, 0.122, 0.106),
  primaryTint:  rgb(0.980, 0.957, 0.941),
  ink:          rgb(0.141, 0.082, 0.071),
  text:         rgb(0.200, 0.133, 0.114),
  muted:        rgb(0.420, 0.333, 0.282),
  border:       rgb(0.894, 0.855, 0.820),
  borderStrong: rgb(0.780, 0.714, 0.659),
  rowAlt:       rgb(0.973, 0.957, 0.937),
  cellGray:     rgb(0.945, 0.918, 0.886),
  white:        rgb(0.996, 0.988, 0.976),
  danger:       rgb(0.561, 0.184, 0.149),
};

// ----- Live (mutable) style state ------------------------------------------

/** Live palette — mutated by `applyPdfStyle()`. Default is the
 *  Clinic Teal preset; rest of the generator reads `PALETTE.primary` etc. */
export const PALETTE: Palette = { ...CLINIC };

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
  comment: { bg: '#f2f7f6', border: '#9dbfba', labelColor: '#0c4a44', textColor: '#1b2733' },
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

// ----- Style presets -------------------------------------------------------

export const PDF_STYLES: PdfStyle[] = [
  {
    id: 'clinic',
    name: 'Clinic Teal',
    description: 'Matches the app — teal accents on charcoal, clean hairlines.',
    palette: CLINIC, fontFamily: 'sans',
    sectionTitle: 'hairline', tableHeader: 'light',
    comment: { bg: '#f2f7f6', border: '#9dbfba', labelColor: '#0c4a44', textColor: '#1b2733' },
  },
  {
    id: 'classic-blue',
    name: 'Classic Blue',
    description: 'Traditional medical-records blue with solid section headers.',
    palette: CLASSIC_BLUE, fontFamily: 'sans',
    sectionTitle: 'block', tableHeader: 'dark',
    comment: { bg: '#eff5fa', border: '#8fb2d1', labelColor: '#143f69', textColor: '#1f2e3d' },
  },
  {
    id: 'slate',
    name: 'Slate',
    description: 'Neutral graphite — prints crisply in black and white.',
    palette: SLATE, fontFamily: 'sans',
    sectionTitle: 'hairline', tableHeader: 'light',
    comment: { bg: '#f3f4f6', border: '#aab3bd', labelColor: '#22272e', textColor: '#262c33' },
  },
  {
    id: 'iris',
    name: 'Iris',
    description: 'Quiet indigo accents with compact uppercase headers.',
    palette: IRIS, fontFamily: 'sans',
    sectionTitle: 'uppercase', tableHeader: 'dark',
    comment: { bg: '#f1f1f9', border: '#a2a5cf', labelColor: '#2f3374', textColor: '#23263a' },
  },
  {
    id: 'journal',
    name: 'Journal',
    description: 'Serif print classic — deep red accents on warm paper.',
    palette: JOURNAL, fontFamily: 'serif',
    sectionTitle: 'serif', tableHeader: 'underline-only',
    comment: { bg: '#faf4ef', border: '#b58f7e', labelColor: '#521f1b', textColor: '#33221d' },
  },
];

export const DEFAULT_PDF_STYLE_ID = 'clinic';
