import { PDFDocument, PDFHexString } from 'pdf-lib';
import download from 'downloadjs';
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
  drawTreatmentReportField,
  drawDiagramAt,
  drawFooter,
  drawCodesLegend,
  collectUsedCodesByPage,
  measureExamRowsIn,
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

  // Codes are needed before the diagrams draw: each page's diagram
  // centers vertically in the space left over by its codes legend.
  const usedByPage = collectUsedCodesByPage({
    patientInfo,
    toothData,
    preCommentTexts:  preDiagram.state.comments.map((c)  => c.text),
    postCommentTexts: postDiagram.state.comments.map((c) => c.text),
  });
  // Legend top is 6.55in when present; otherwise the region runs to just
  // above the footer rule.
  const diagramBottomIn = (codes: unknown[]) => (codes.length > 0 ? 6.45 : 8.0);

  await drawLogoAndHeader(pdfDoc, page1, logo, species, doctorLine, techLine, regular, bold);

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
  const patientBottomIn = drawPatientInfoBox(page1, patientInfo, regular, bold, complaintMaxLines);
  const examBodyTopIn = Math.max(EXAM_TABLE_YTOP_IN, patientBottomIn + 0.07 + bandIn);
  const examBottomIn = drawExamSection(page1, patientInfo.exam, regular, bold, examBodyTopIn);

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
  drawToothGrid(page1, { ...grids.maxilla,  yTopIn: maxillaTopIn },  toothData, regular, bold, 'Maxillary Arch',  missingTriadans);
  drawToothGrid(page1, { ...grids.mandible, yTopIn: mandibleTopIn }, toothData, regular, bold, 'Mandibular Arch', missingTriadans);
  await drawDiagramAt(
    pdfDoc, DIAGRAM_SLOTS[species][0], preDiagram.png,
    diagramBottomIn(usedByPage.page1)
  );
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
  await drawDiagramAt(
    pdfDoc, postSlot, postDiagram.png,
    diagramBottomIn(usedByPage.page2)
  );
  drawTreatmentReportField(page2, patientInfo.treatmentReport, regular, bold);
  drawFooter(page2, regular, bold, 2, 2, generatedAt, identityLine);

  // ---- Codes-used legends (both pages) -----------------------------------
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
