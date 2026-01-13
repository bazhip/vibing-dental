import { PDFDocument, PDFFont, PDFPage, StandardFonts } from 'pdf-lib';
import download from 'downloadjs';
import { ToothData, PatientInfo, Species, DentalField } from '../types';
import {
  PDF_TEXT_SIZE,
  PDF_HEADER_TEXT_SIZE,
  PDF_SECONDARY_TEXT_SIZE,
  PATIENT_INFO_COORDINATES,
  FIELD_Y_OFFSETS,
  TOOTH_REGIONS,
} from '../constants';

/**
 * Dental fields that can be rendered in the PDF
 */
const DENTAL_FIELDS: DentalField[] = [
  'mobility',
  'recession',
  'pocket',
  'furcation',
  'hyperplasia',
  'calculus',
  'gingivitis',
  'pdstate',
];

/**
 * Wraps and renders multi-line text to fit within a specified width
 * Automatically scales font size if text is too long
 */
function renderWrappedText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  initialFontSize: number,
  maxLines: number = 3
): void {
  if (!text || text.trim() === '') return;

  let fontSize = initialFontSize;
  let lines: string[] = [];

  // Try progressively smaller font sizes until text fits
  while (fontSize >= 8) {
    lines = [];
    const words = text.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const textWidth = font.widthOfTextAtSize(testLine, fontSize);

      if (textWidth > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    // If text fits within maxLines, we're done
    if (lines.length <= maxLines) break;

    // Otherwise, try smaller font
    fontSize -= 1;
  }

  // Truncate to maxLines if still too long
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    // Add ellipsis to last line if truncated
    const lastLine = lines[maxLines - 1];
    const ellipsis = '...';
    const availableWidth = maxWidth - font.widthOfTextAtSize(ellipsis, fontSize);

    let truncated = lastLine;
    while (font.widthOfTextAtSize(truncated, fontSize) > availableWidth && truncated.length > 0) {
      truncated = truncated.slice(0, -1);
    }
    lines[maxLines - 1] = truncated + ellipsis;
  }

  // Render each line
  const lineHeight = fontSize * 1.2;
  lines.forEach((line, index) => {
    page.drawText(line, {
      x,
      y: y - (index * lineHeight),
      size: fontSize,
      font,
    });
  });
}

/**
 * Renders patient information on the PDF page
 */
function renderPatientInfo(
  page: PDFPage,
  font: PDFFont,
  patientInfo: PatientInfo
): void {
  const { patientName, patientNumber, date, tech, complaint } = patientInfo;

  // Main patient information (larger text)
  page.drawText(patientName, {
    x: PATIENT_INFO_COORDINATES.name.x,
    y: PATIENT_INFO_COORDINATES.name.y,
    size: PDF_HEADER_TEXT_SIZE,
    font,
  });

  page.drawText(patientNumber, {
    x: PATIENT_INFO_COORDINATES.number.x,
    y: PATIENT_INFO_COORDINATES.number.y,
    size: PDF_HEADER_TEXT_SIZE,
    font,
  });

  // Secondary information (smaller text)
  page.drawText(date, {
    x: PATIENT_INFO_COORDINATES.date.x,
    y: PATIENT_INFO_COORDINATES.date.y,
    size: PDF_SECONDARY_TEXT_SIZE,
    font,
  });

  page.drawText(tech, {
    x: PATIENT_INFO_COORDINATES.tech.x,
    y: PATIENT_INFO_COORDINATES.tech.y,
    size: PDF_SECONDARY_TEXT_SIZE,
    font,
  });

  // Render complaint with text wrapping and auto-scaling
  renderWrappedText(
    page,
    font,
    complaint,
    PATIENT_INFO_COORDINATES.complaint.x,
    PATIENT_INFO_COORDINATES.complaint.y,
    250, // Maximum width for complaint box
    PDF_SECONDARY_TEXT_SIZE,
    3 // Maximum 3 lines
  );
}

/**
 * Renders a single dental field value at the specified coordinates
 */
function renderFieldValue(
  page: PDFPage,
  font: PDFFont,
  value: string,
  x: number,
  y: number
): void {
  page.drawText(value, {
    x,
    y,
    size: PDF_TEXT_SIZE,
    font,
  });
}

/**
 * Renders dental data for a specific tooth region
 * This replaces the 4 duplicated for-loops in the original code
 */
function renderToothRegion(
  page: PDFPage,
  font: PDFFont,
  toothData: ToothData[],
  regionConfig: typeof TOOTH_REGIONS[0]
): void {
  const {
    startIndex,
    count,
    startX,
    startY,
    xSpacing,
    ySpacing,
    reverse,
  } = regionConfig;

  for (let i = 0; i < count; i++) {
    const toothIndex = startIndex + i;
    const tooth = toothData[toothIndex];

    if (!tooth) continue;

    // Calculate X position (reverse direction for left side quadrants)
    const xPosition = reverse
      ? startX - xSpacing * i
      : startX + xSpacing * i;

    // Render each dental field for this tooth
    DENTAL_FIELDS.forEach((field) => {
      const value = tooth[field];
      if (value) {
        const yOffset = FIELD_Y_OFFSETS[field];
        const yPosition = startY + ySpacing * yOffset;

        renderFieldValue(page, font, value, xPosition, yPosition);
      }
    });
  }
}

/**
 * Renders all dental data on the PDF
 */
function renderDentalData(
  page: PDFPage,
  font: PDFFont,
  toothData: ToothData[]
): void {
  TOOTH_REGIONS.forEach((region) => {
    renderToothRegion(page, font, toothData, region);
  });
}

/**
 * Generates and downloads a dental chart PDF
 */
export async function generateDentalChartPDF(
  patientInfo: PatientInfo,
  toothData: ToothData[],
  species: Species
): Promise<void> {
  try {
    // Fetch the appropriate template PDF based on species
    const templateUrl = `${species}_chart.pdf`;
    const existingPdfBytes = await fetch(templateUrl).then((res) =>
      res.arrayBuffer()
    );

    // Load the PDF and embed font
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Get the first page
    const pages = pdfDoc.getPages();
    const firstPage = pages[0];

    // Render patient information
    renderPatientInfo(firstPage, helveticaFont, patientInfo);

    // Render dental data
    renderDentalData(firstPage, helveticaFont, toothData);

    // Save and download the PDF
    const pdfBytes = await pdfDoc.save();
    download(pdfBytes, 'chart.pdf', 'application/pdf');
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error('Failed to generate dental chart PDF');
  }
}
