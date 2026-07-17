import { PDFDocument, PDFHexString } from 'pdf-lib';
import download from 'downloadjs';
import {
  ToothData,
  PatientInfo,
  Species,
  Logo,
} from '../types';
import { TOOTH_GRID_LAYOUTS } from '../constants/chartLayout';
import {
  ACTIVE,
  applyPdfStyle,
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
} from './pdf/layout';
import { formatGeneratedAt } from './pdf/draw';
import {
  drawLogoAndHeader,
  drawPatientInfoBox,
  drawExamSection,
  drawToothGrid,
  drawNerveBlockTable,
  drawTreatmentReportField,
  drawDiagramAt,
  drawFooter,
  drawCodesLegend,
  collectUsedCodesByPage,
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
export type { CommentStyle, DiagramState, ParsedChart };

// DiagramExport is the runtime payload the orchestrator needs per arch:
// the raw PNG (already rasterized from the SVG) plus the JSON-serializable
// state (marks / comments / strokes) we round-trip through the stash.
export interface DiagramExport {
  state: DiagramState;
  png: Uint8Array;
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
  styleId: string = DEFAULT_PDF_STYLE_ID
): Promise<Uint8Array> {
  const style = PDF_STYLES.find((s) => s.id === styleId) ?? PDF_STYLES[0];
  applyPdfStyle(style);

  const pdfDoc = await PDFDocument.create();
  const page1 = pdfDoc.addPage([PAGE_WIDTH_PT, PAGE_HEIGHT_PT]);
  const page2 = pdfDoc.addPage([PAGE_WIDTH_PT, PAGE_HEIGHT_PT]);
  const form  = pdfDoc.getForm();

  const fontIds = FONT_MAP[ACTIVE.fontFamilyKey];
  const regular = await pdfDoc.embedFont(fontIds.regular);
  const bold    = await pdfDoc.embedFont(fontIds.bold);

  const generatedAt = formatGeneratedAt(new Date());

  // Every page of the record carries the patient identity in its footer —
  // a page separated from the chart must stay attributable.
  const identityLine = [
    patientInfo.patientName,
    patientInfo.patientNumber && `PID ${patientInfo.patientNumber}`,
    patientInfo.date,
  ]
    .filter(Boolean)
    .join('  ·  ');

  // ---- Page 1 ------------------------------------------------------------
  // SoCal's doctor line is the practice's signature; VCA's reflects whatever
  // the user typed in the webapp.
  const doctorLine =
    logo === 'vca'
      ? (patientInfo.doctor || 'Dr. Margaret Smith, DVM, DAVDC')
      : 'Margaret Smith, DVM, DAVDC';
  const techLine = logo === 'vca' ? patientInfo.tech : '';

  await drawLogoAndHeader(pdfDoc, page1, logo, species, doctorLine, techLine, regular, bold);
  drawPatientInfoBox(page1, patientInfo, regular, bold);
  drawExamSection(page1, patientInfo.exam, regular, bold);
  drawToothGrid(page1, TOOTH_GRID_LAYOUTS[species].maxilla,  toothData, regular, bold, 'Maxillary Arch');
  drawToothGrid(page1, TOOTH_GRID_LAYOUTS[species].mandible, toothData, regular, bold, 'Mandibular Arch');
  await drawDiagramAt(pdfDoc, DIAGRAM_SLOTS[species][0], preDiagram.png);
  drawFooter(page1, regular, bold, 1, 2, generatedAt, identityLine);

  // ---- Page 2 ------------------------------------------------------------
  // The nerve-block table grows to fit a long "Other" note; push the diagram
  // beneath it (keeping its bottom fixed above the codes legend) so the two
  // never overlap.
  const nbBottomIn = drawNerveBlockTable(page2, patientInfo.nerveBlocks, bold, regular, logo === 'vca');
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
  await drawDiagramAt(pdfDoc, postSlot, postDiagram.png);
  drawTreatmentReportField(page2, patientInfo.treatmentReport, regular, bold);
  drawFooter(page2, regular, bold, 2, 2, generatedAt, identityLine);

  // ---- Codes-used legends (both pages) -----------------------------------
  const usedByPage = collectUsedCodesByPage({
    patientInfo,
    toothData,
    preCommentTexts:  preDiagram.state.comments.map((c)  => c.text),
    postCommentTexts: postDiagram.state.comments.map((c) => c.text),
  });
  const pageCodes = [usedByPage.page1, usedByPage.page2];
  for (let i = 0; i < 2; i++) {
    drawCodesLegend(pdfDoc.getPage(i), LEGEND_BOXES_BY_PAGE[i], pageCodes[i], bold, regular);
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
  styleId: string = DEFAULT_PDF_STYLE_ID
): Promise<void> {
  const pdfBytes = await buildDentalChartPDFBytes(
    patientInfo, toothData, species, logo, preDiagram, postDiagram, styleId
  );
  const sanitize = (str: string) => str.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const filename = `${sanitize(patientInfo.patientName)}_${sanitize(patientInfo.patientNumber)}_${patientInfo.date}.pdf`;
  download(pdfBytes, filename, 'application/pdf');
}
