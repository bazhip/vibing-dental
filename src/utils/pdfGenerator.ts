import { PDFDocument, PDFHexString } from 'pdf-lib';
import { safeFont } from './pdf/safeFont';
import download from 'downloadjs';
import i18n, { loadLanguage } from '../i18n';
import { isAppLanguage, type AppLanguage } from '../i18n/config';
import {
  ToothData,
  PatientInfo,
  Species,
  Logo,
} from '../types';
import { TOOTH_GRID_LAYOUTS, TOOTH_DATA_ROWS } from '../constants/chartLayout';
import {
  ACTIVE,
  applyPdfStyle,
  resolvePdfStyle,
  FONT_MAP,
  PDF_STYLES,
  DEFAULT_PDF_STYLE_ID,
  type CommentStyle,
} from './pdf/styles';
import {
  PAGE_WIDTH_PT,
  PAGE_HEIGHT_PT,
  DIAGRAM_SLOTS,
  LEGEND_BOXES_BY_PAGE,
  PATIENT_INFO_BOX,
  EXAM_TABLE_YTOP_IN,
} from './pdf/layout';
import { formatGeneratedAt, CARD_BAND_PT } from './pdf/draw';
import {
  drawLogoAndHeader,
  drawPatientInfoBox,
  drawExamSection,
  drawToothGrid,
  drawNerveBlockTable,
  treatmentCardText,
  drawTreatmentReportField,
  drawDiagramAt,
  drawFooter,
  drawCodesLegend,
  collectUsedCodesByPage,
  measureExamRowsIn,
  codesLegendCols,
  codesLegendHeightIn,
  compactExamGeometry,
  drawImagePage,
  IMAGES_PER_PAGE,
  type PdfImage,
} from './pdf/sections';
import {
  parseDentalChartPDF,
  DIAGRAM_STATE_FIELD,
  type DiagramState,
  type ParsedChart,
  type StashedState,
} from './pdf/parser';

/**
 * Top-level orchestrator for the dental-chart PDF.
 *
 * Build pipeline:
 *   buildDentalChartPDFBytes(...)
 *     → applyPdfStyle()           # mutate PALETTE / ACTIVE in pdf/styles
 *     → embedFonts()              # sans / serif / mono per the active style
 *     → drawLogoAndHeader, drawPatientInfoBox, drawExamSection,
 *       drawToothGrid × 2, drawDiagramAt, drawFooter   # page 1
 *     → drawNerveBlockTable, drawDiagramAt,
 *       drawTreatmentReportField, drawFooter           # page 2
 *     → drawCodesLegend × 2
 *     → drawImagePage × ceil(images / 4)                 # optional
 *     → stash full chart state in a hidden form field for round-trip
 *     → return raw bytes
 *
 * `generateDentalChartPDF` wraps that with a filename + browser download.
 *
 * Re-exports keep the existing public API of this file stable so
 * `import { ... } from '../utils/pdfGenerator'` keeps working from
 * `EntryGrid.tsx` and `PdfPreviewModal.tsx`.
 */

// Re-exports for callers that still go through this file.
export { PDF_STYLES, DEFAULT_PDF_STYLE_ID, parseDentalChartPDF };
export type { CommentStyle, DiagramState, ParsedChart, PdfImage };

// DiagramExport is the runtime payload the orchestrator needs per arch:
// the raw PNG (already rasterized from the SVG) plus the JSON-serializable
// state (marks / comments / strokes) we round-trip through the stash.
export interface DiagramExport {
  state: DiagramState;
  png: Uint8Array;
}

/** Practice identity from the signed-in profile: the doctor line under
 *  the logo, an optional uploaded logo, and the practice name (drawn as
 *  a text wordmark when no logo is uploaded). Absent fields fall back to
 *  template defaults, so standalone mode keeps its current output. */
export interface PdfBranding {
  doctorName?: string;
  logoUrl?: string;
  practiceName?: string;
}

/** Page-1 layout switches. `includeGrid: false` drops the two arch
 *  grids (for practices mirroring grid findings onto the Diagnosis
 *  diagram): the exam card and codes legend move into a narrow right
 *  column and the diagram takes everything to their left. The grid data
 *  still round-trips through the hidden stash either way. */
export interface PdfLayoutOptions {
  includeGrid?: boolean;
  /** Chart images to append after page 2, IMAGES_PER_PAGE to a page.
   *  Empty / absent → no image pages. Not round-tripped through the
   *  stash: the images live in cloud storage with the chart. */
  images?: PdfImage[];
  /** Nerve block rows the person hides (chart settings) — left out of
   *  the table when empty. */
  hiddenBlocks?: readonly string[];
  /** Language the document's labels print in (headings, legends, column
   *  headers, code definitions). Typed text prints as stored. Default 'en'. */
  lng?: AppLanguage;
}

/** Build the PDF as raw bytes — the entry point for both the download
 *  path and the live preview iframe. The `styleId` selects one of the
 *  presets defined in `pdf/styles.ts`. */
export async function buildDentalChartPDFBytes(
  patientInfo: PatientInfo,
  toothData: ToothData[],
  species: Species,
  logo: Logo,
  preDiagram: DiagramExport,
  postDiagram: DiagramExport,
  styleId: string = DEFAULT_PDF_STYLE_ID,
  branding: PdfBranding = {},
  layoutOptions: PdfLayoutOptions = {}
): Promise<Uint8Array> {
  const includeGrid = layoutOptions.includeGrid ?? true;
  const lng: AppLanguage = layoutOptions.lng ?? 'en';
  // English is bundled; other catalogs load on first use. If that fails
  // (offline), labels fall back to English rather than failing the PDF.
  if (lng !== 'en') await loadLanguage(lng);
  const t = i18n.getFixedT(lng, 'pdf');
  const images = layoutOptions.images ?? [];
  const imagePageCount = Math.ceil(images.length / IMAGES_PER_PAGE);
  const totalPages = 2 + imagePageCount;
  const style = resolvePdfStyle(styleId);
  applyPdfStyle(style);

  const pdfDoc = await PDFDocument.create();
  const page1 = pdfDoc.addPage([PAGE_WIDTH_PT, PAGE_HEIGHT_PT]);
  const page2 = pdfDoc.addPage([PAGE_WIDTH_PT, PAGE_HEIGHT_PT]);
  const form  = pdfDoc.getForm();

  const fontIds = FONT_MAP[ACTIVE.fontFamilyKey];
  // Safe fonts: unsupported characters (emoji, arrows…) are replaced or
  // dropped instead of failing the whole PDF.
  const regular = safeFont(await pdfDoc.embedFont(fontIds.regular));
  const bold    = safeFont(await pdfDoc.embedFont(fontIds.bold));

  const generatedAt = formatGeneratedAt(new Date());

  // Every page of the record carries the patient identity in its footer —
  // a page separated from the chart must stay attributable.
  const identityLine = [
    patientInfo.patientName,
    patientInfo.patientNumber && t('footer.pid', { id: patientInfo.patientNumber }),
    patientInfo.date,
  ]
    .filter(Boolean)
    .join('  ·  ');

  // ---- Page 1 ------------------------------------------------------------
  // Doctor line: the signed-in profile wins; otherwise fall back to the
  // template behavior (VCA shows the typed doctor field, SoCal its house
  // line).
  // Practice profile first, then the doctor typed on this chart. Never a
  // hard-coded name — that printed one specific doctor on every
  // practice's PDFs when no profile name was set.
  const doctorLine = branding.doctorName?.trim() || patientInfo.doctor?.trim() || '';
  const techLine = patientInfo.tech;

  // Codes are needed before the diagrams draw: each page's diagram
  // centers vertically in the space left over by its codes legend.
  const usedByPage = collectUsedCodesByPage({
    patientInfo,
    toothData,
    preCommentTexts:  preDiagram.state.comments.map((c)  => c.text),
    postCommentTexts: postDiagram.state.comments.map((c) => c.text),
  });
  // Each legend shrinks to its codes and sits on the footer rule; the
  // diagram above it takes whatever height that leaves.
  const legendBottomIn = 8.10;
  const legendBox = (i: 0 | 1, codes: unknown[]) => {
    const base = LEGEND_BOXES_BY_PAGE[i];
    const heightIn = Math.min(base.heightIn, codesLegendHeightIn(codes.length, codesLegendCols(codes.length)));
    return { ...base, yTopIn: legendBottomIn - heightIn, heightIn };
  };
  const diagramBottomIn = (i: 0 | 1, codes: unknown[]) =>
    codes.length > 0 ? legendBox(i, codes).yTopIn - 0.10 : 8.0;

  const headerBottomIn = await drawLogoAndHeader(
    pdfDoc, page1, logo, species, doctorLine, techLine, regular, bold,
    branding.logoUrl, branding.practiceName, lng
  );

  // Page 1's right column is a chain: the patient card grows with the
  // chief complaint, the exam card starts below it, and the arch grids
  // fill whatever is left. Budget the complaint's line cap first so the
  // chain always fits above the footer.
  const grids = TOOTH_GRID_LAYOUTS[species];
  const bandIn = CARD_BAND_PT / 72;
  const tableHIn = grids.maxilla.rowHeightIn * (2 + TOOTH_DATA_ROWS.length);
  const cardHIn = bandIn + tableHIn;
  const bottomLimitIn = 8.05; // footer rule sits at 8.10
  const examRowsIn = measureExamRowsIn(patientInfo.exam, regular);
  const belowPatientIn =
    0.07 + (bandIn + examRowsIn) + 3 * 0.08 + 2 * cardHIn;
  const patientBottomMaxIn = bottomLimitIn - belowPatientIn;
  const fixedPatientRowsIn =
    PATIENT_INFO_BOX.rowDateIn + PATIENT_INFO_BOX.rowPatientIn + PATIENT_INFO_BOX.rowIdIn;
  const complaintMaxLines = Math.max(
    1,
    Math.floor(
      ((patientBottomMaxIn - PATIENT_INFO_BOX.yTopIn + 0.20 - bandIn - fixedPatientRowsIn) * 72 - 10) / 11.5
    )
  );
  const patientBottomIn = drawPatientInfoBox(page1, patientInfo, regular, bold, complaintMaxLines, lng);
  // The diagram slot is wide enough to pass under the patient card
  // (card left edge 3.65in < slot right edge ~5in), and a tall uploaded
  // logo can push the header block below the slot's default top — start
  // the diagram below BOTH so it never overlaps either, shrinking to
  // whatever region remains.
  const baseSlot1 = DIAGRAM_SLOTS[species][0];
  const minTop1In = Math.max(
    baseSlot1.yTopIn,
    headerBottomIn + 0.12,
    patientBottomIn + 0.12
  );

  if (includeGrid) {
    const examBodyTopIn = Math.max(EXAM_TABLE_YTOP_IN, patientBottomIn + 0.07 + bandIn);
    const examBottomIn = drawExamSection(page1, patientInfo.exam, regular, bold, examBodyTopIn, undefined, lng);

    // The arch grids fill the column below the exam card dynamically:
    // whatever height the exam takes, the remaining space is split into
    // three even gaps — exam→maxilla, maxilla→mandible, mandible→page
    // bottom — instead of leaving a fixed dead zone when findings are
    // short.
    const gapIn = Math.max(
      0.08,
      (bottomLimitIn - examBottomIn - 2 * cardHIn) / 3
    );
    const maxillaTopIn = examBottomIn + gapIn + bandIn;
    const mandibleTopIn = maxillaTopIn + tableHIn + gapIn + bandIn;
    // Teeth marked missing on the Diagnosis diagram get their grid column
    // washed in the clinical red tint — same signal as the app's
    // crossed-out row.
    const missingTriadans = new Set(
      Object.entries(preDiagram.state.marks)
        .filter(([, mark]) => mark === 'missing')
        .map(([triadan]) => Number(triadan))
    );
    drawToothGrid(page1, { ...grids.maxilla,  yTopIn: maxillaTopIn },  toothData, regular, bold, t('grid.maxilla'),  missingTriadans, lng);
    drawToothGrid(page1, { ...grids.mandible, yTopIn: mandibleTopIn }, toothData, regular, bold, t('grid.mandible'), missingTriadans, lng);
    await drawDiagramAt(
      pdfDoc, { ...baseSlot1, yTopIn: minTop1In }, preDiagram.png,
      diagramBottomIn(0, usedByPage.page1)
    );
    drawCodesLegend(page1, legendBox(0, usedByPage.page1), usedByPage.page1, bold, regular, 3, lng);
  } else {
    // No grids: the diagram is the page. Exam card + codes legend stack
    // in a narrow right column; the diagram fills everything left of it
    // from below the header to the footer.
    const colXIn = 7.55;
    const colWIn = 10.60 - colXIn; // right edge matches the footer rule
    const examGeo = compactExamGeometry(colXIn, colWIn);
    // Card top lines up with the diagram's top.
    const examBodyTopIn = minTop1In + bandIn;
    const examBottomIn = drawExamSection(page1, patientInfo.exam, regular, bold, examBodyTopIn, examGeo, lng);
    const codes = usedByPage.page1;
    if (codes.length > 0) {
      const topIn = examBottomIn + 0.15;
      const heightIn = Math.min(bottomLimitIn - topIn, codesLegendHeightIn(codes.length, 1));
      drawCodesLegend(page1, { xIn: colXIn, yTopIn: topIn, widthIn: colWIn, heightIn }, codes, bold, regular, 1, lng);
    }
    await drawDiagramAt(
      pdfDoc,
      { ...baseSlot1, yTopIn: minTop1In, columnWidthIn: colXIn - 0.15 - baseSlot1.xIn, maxWidthIn: colXIn - 0.25 - baseSlot1.xIn },
      preDiagram.png,
      8.0
    );
  }
  drawFooter(page1, regular, bold, 1, totalPages, generatedAt, identityLine, lng);

  // ---- Page 2 ------------------------------------------------------------
  // The nerve-block table grows to fit a long "Other" note; push the diagram
  // beneath it (keeping its bottom fixed above the codes legend) so the two
  // never overlap.
  const nbBottomIn = drawNerveBlockTable(page2, patientInfo.nerveBlocks, bold, regular, logo === 'vca', layoutOptions.hiddenBlocks ?? [], patientInfo.customAnesthesia, lng);
  const baseSlot = DIAGRAM_SLOTS[species][1];
  const minTopIn = nbBottomIn + 0.15;
  const postSlot =
    minTopIn > baseSlot.yTopIn
      ? {
          ...baseSlot,
          yTopIn: minTopIn,
          heightIn: Math.max(2.2, baseSlot.yTopIn + baseSlot.heightIn - minTopIn),
        }
      : baseSlot;
  await drawDiagramAt(
    pdfDoc, postSlot, postDiagram.png,
    diagramBottomIn(1, usedByPage.page2)
  );
  drawTreatmentReportField(page2, treatmentCardText(patientInfo.treatmentReport, patientInfo.radiographicFindings, lng), regular, bold, lng);
  drawFooter(page2, regular, bold, 2, totalPages, generatedAt, identityLine, lng);

  // ---- Page-2 codes-used legend (page 1 drew its own above) ------------
  drawCodesLegend(page2, legendBox(1, usedByPage.page2), usedByPage.page2, bold, regular, 3, lng);

  // ---- Image pages (optional) ------------------------------------------
  for (let p = 0; p < imagePageCount; p++) {
    const page = pdfDoc.addPage([PAGE_WIDTH_PT, PAGE_HEIGHT_PT]);
    const start = p * IMAGES_PER_PAGE;
    await drawImagePage(
      pdfDoc, page, images.slice(start, start + IMAGES_PER_PAGE), start, images.length, regular, bold, lng
    );
    drawFooter(page, regular, bold, 3 + p, totalPages, generatedAt, identityLine, lng);
  }

  // ---- Hidden round-trip stash -------------------------------------------
  // The visible PDF is a static print artifact — every value lives only
  // in this JSON payload, which the parser uses to rehydrate the webapp
  // when the PDF is uploaded back in.
  const stateJson = JSON.stringify({
    pre:  preDiagram.state,
    post: postDiagram.state,
    nerveBlocks: patientInfo.nerveBlocks,
    exam:        patientInfo.exam,
    patientInfo,
    toothData,
    species,
    logo,
  } satisfies StashedState);
  // Bypass PDFTextField.setText / addToPage. Both eagerly call pdf-lib's
  // defaultTextFieldAppearanceProvider → utf16Decode, which stack-overflows
  // on long strings or surrogate-pair unicode (emojis in comment text).
  // We write the value directly onto the AcroForm field; parseDentalChartPDF
  // still reads it back via form.getTextField(...).getText(). No widget
  // annotation is needed because the field is invisible by design.
  const stateField = form.createTextField(DIAGRAM_STATE_FIELD);
  stateField.acroField.setValue(PDFHexString.fromText(stateJson));

  return await pdfDoc.save({ updateFieldAppearances: false });
}

/** Build the PDF + trigger a browser download. Filename derived from
 *  patient info. The original public entry point — kept for the existing
 *  "Generate Chart" submit button. */
export async function generateDentalChartPDF(
  patientInfo: PatientInfo,
  toothData: ToothData[],
  species: Species,
  logo: Logo,
  preDiagram: DiagramExport,
  postDiagram: DiagramExport,
  styleId: string = DEFAULT_PDF_STYLE_ID,
  branding: PdfBranding = {},
  layoutOptions: PdfLayoutOptions = {}
): Promise<void> {
  const lng = isAppLanguage(i18n.language) ? i18n.language : 'en';
  const pdfBytes = await buildDentalChartPDFBytes(
    patientInfo, toothData, species, logo, preDiagram, postDiagram, styleId, branding, { lng, ...layoutOptions }
  );
  const sanitize = (str: string) => str.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const filename = `${sanitize(patientInfo.patientName)}_${sanitize(patientInfo.patientNumber)}_${patientInfo.date}.pdf`;
  download(pdfBytes, filename, 'application/pdf');
}
