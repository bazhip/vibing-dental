/**
 * Type definitions for the Dental Charting Application
 */

/**
 * Represents a single tooth in the dental chart
 */
export interface ToothData {
  tooth: string;
  triadan: number;
  mobility?: string;
  recession?: string;
  pocket?: string;
  furcation?: string;
  hyperplasia?: string;
  calculus?: string;
  gingivitis?: string;
  pdstate?: string;
}

/**
 * Patient information
 */
export interface PatientInfo {
  patientName: string;
  patientNumber: string;
  date: string;
  complaint: string;
}

/**
 * Species type for dental charts
 */
export type Species = 'feline' | 'canine';

/**
 * Logo/Organization type for PDF templates
 */
export type Logo = 'vca' | 'socal';

/**
 * Column definition for the data grid
 */
export interface ColumnDefinition {
  key: keyof ToothData;
  name: string;
  editable: boolean;
  width?: number;
  frozen?: boolean;
}

/**
 * Field names that can be edited in the dental chart
 */
export type DentalField =
  | 'mobility'
  | 'recession'
  | 'pocket'
  | 'furcation'
  | 'hyperplasia'
  | 'calculus'
  | 'gingivitis'
  | 'pdstate';

/**
 * Coordinate position for PDF text placement
 */
export interface Coordinate {
  x: number;
  y: number;
}

/**
 * Spacing configuration for PDF generation
 */
export interface PDFSpacing {
  xSpacing: number;
  ySpacing: number;
}

/**
 * Region configuration for tooth layout in PDF
 */
export interface ToothRegion {
  startIndex: number;
  count: number;
  startX: number;
  startY: number;
  xSpacing: number;
  ySpacing: number;
  reverse?: boolean;
}
