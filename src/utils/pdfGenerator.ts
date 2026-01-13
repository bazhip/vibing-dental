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

  page.drawText(complaint, {
    x: PATIENT_INFO_COORDINATES.complaint.x,
    y: PATIENT_INFO_COORDINATES.complaint.y,
    size: PDF_SECONDARY_TEXT_SIZE,
    font,
  });
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
