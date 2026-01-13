import { ToothRegion, DentalField } from '../types';

/**
 * Text size for dental field entries in PDF
 */
export const PDF_TEXT_SIZE = 9;

/**
 * Text size for patient information headers
 */
export const PDF_HEADER_TEXT_SIZE = 20;

/**
 * Text size for secondary patient information
 */
export const PDF_SECONDARY_TEXT_SIZE = 12;

/**
 * Coordinates for patient information fields
 */
export const PATIENT_INFO_COORDINATES = {
  name: { x: 50, y: 560 },
  number: { x: 50, y: 500 },
  date: { x: 330, y: 585 },
  tech: { x: 330, y: 560 },
  complaint: { x: 330, y: 545 },
};

/**
 * Y-axis offsets for each dental field type
 * Maps field names to their vertical position offset
 */
export const FIELD_Y_OFFSETS: Record<DentalField, number> = {
  mobility: 0,
  recession: 1,
  pocket: 2,
  furcation: 3,
  hyperplasia: 4,
  calculus: 5,
  gingivitis: 6,
  pdstate: 7,
};

/**
 * Configuration for each tooth region in the PDF
 * Quadrants are laid out as follows:
 * - Region 1: Upper right (101-110)
 * - Region 2: Lower right (401-411)
 * - Region 3: Upper left (201-210)
 * - Region 4: Lower left (301-311)
 */
export const TOOTH_REGIONS: ToothRegion[] = [
  {
    // Upper right quadrant (101-110)
    startIndex: 0,
    count: 10,
    startX: 540,
    startY: 250,
    xSpacing: -19.8,
    ySpacing: -11.4,
    reverse: false,
  },
  {
    // Lower right quadrant (401-411)
    startIndex: 10,
    count: 11,
    startX: 540,
    startY: 125,
    xSpacing: -19.8,
    ySpacing: -11,
    reverse: false,
  },
  {
    // Upper left quadrant (201-210)
    startIndex: 21,
    count: 10,
    startX: 560,
    startY: 250,
    xSpacing: -19.8,
    ySpacing: -11.4,
    reverse: true,
  },
  {
    // Lower left quadrant (301-311)
    startIndex: 31,
    count: 11,
    startX: 560,
    startY: 125,
    xSpacing: -19.8,
    ySpacing: -11,
    reverse: true,
  },
];
