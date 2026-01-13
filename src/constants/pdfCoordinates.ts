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
 * PDF is landscape: 792 x 612 points
 * Input boxes are in center, after the label column
 */
export const PATIENT_INFO_COORDINATES = {
  date: { x: 330, y: 583 },
  name: { x: 330, y: 571 },
  number: { x: 330, y: 559 },
  complaint: { x: 330, y: 547 },
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
 * Common spacing values - all table cells are the same size
 */
const CELL_WIDTH = 27;  // Column spacing
const CELL_HEIGHT = 11; // Row spacing (negative because rows go down)

/**
 * Feline tooth regions (30 teeth total)
 * Lower table is SPLIT into 3 sections with gaps
 * Left: 409,408,407 | Middle: 404,403,402,401,301,302,303,304 | Right: 307,308,309
 */
export const FELINE_TOOTH_REGIONS: ToothRegion[] = [
  {
    // Upper right (109→101): continuous section
    startIndex: 0,
    count: 8,
    startX: 540,
    startY: 250,
    xSpacing: -CELL_WIDTH,
    ySpacing: -CELL_HEIGHT,
    reverse: true,
  },
  {
    // Lower right - LEFT SECTION (409,408,407)
    // Data array indices 12,13,14 (407,408,409) rendered in reverse
    startIndex: 12,
    count: 3,
    startX: 400,
    startY: 125,
    xSpacing: -CELL_WIDTH,
    ySpacing: -CELL_HEIGHT,
    reverse: true,
  },
  {
    // Lower right - MIDDLE SECTION (404,403,402,401)
    // Data array indices 8,9,10,11 (401,402,403,404) rendered in reverse
    startIndex: 8,
    count: 4,
    startX: 540,
    startY: 125 ,
    xSpacing: -CELL_WIDTH,
    ySpacing: -CELL_HEIGHT,
    reverse: true,
  },
  {
    // Upper left (201→209): continuous section
    startIndex: 15,
    count: 8,
    startX: 560,
    startY: 250,
    xSpacing: CELL_WIDTH,
    ySpacing: -CELL_HEIGHT,
    reverse: false,
  },
  {
    // Lower left - MIDDLE SECTION (301,302,303,304)
    // Data array indices 23,24,25,26 rendered forward
    startIndex: 23,
    count: 4,
    startX: 560,
    startY: 125,
    xSpacing: CELL_WIDTH,
    ySpacing: -CELL_HEIGHT,
    reverse: false,
  },
  {
    // Lower left - RIGHT SECTION (307,308,309)
    // Data array indices 27,28,29 rendered forward
    startIndex: 27,
    count: 3,
    startX: 700,
    startY: 125,
    xSpacing: CELL_WIDTH,
    ySpacing: -CELL_HEIGHT,
    reverse: false,
  },
];

/**
 * Canine tooth regions (42 teeth total)
 */
export const CANINE_TOOTH_REGIONS: ToothRegion[] = [
  {
    // Upper right (110→101)
    startIndex: 0,
    count: 10,
    startX: 540,
    startY: 250,
    xSpacing: -CELL_WIDTH,
    ySpacing: -CELL_HEIGHT,
    reverse: true,
  },
  {
    // Lower right (411→401)
    startIndex: 10,
    count: 11,
    startX: 540,
    startY: 125,
    xSpacing: -CELL_WIDTH,
    ySpacing: -CELL_HEIGHT,
    reverse: true,
  },
  {
    // Upper left (201→210)
    startIndex: 21,
    count: 10,
    startX: 560,
    startY: 250,
    xSpacing: CELL_WIDTH,
    ySpacing: -CELL_HEIGHT,
    reverse: false,
  },
  {
    // Lower left (301→311)
    startIndex: 31,
    count: 11,
    startX: 560,
    startY: 125,
    xSpacing: CELL_WIDTH,
    ySpacing: -CELL_HEIGHT,
    reverse: false,
  },
];

/**
 * Legacy export - defaults to canine for backward compatibility
 */
export const TOOTH_REGIONS = CANINE_TOOTH_REGIONS;
