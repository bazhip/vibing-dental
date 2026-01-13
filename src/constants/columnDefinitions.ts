import { ColumnDefinition } from '../types';

/**
 * Column definitions for the dental data grid
 */
export const GRID_COLUMNS: ColumnDefinition[] = [
  { key: 'tooth', name: 'Tooth', editable: false, width: 60, frozen: true },
  { key: 'triadan', name: 'Triadan', editable: false, width: 70, frozen: true },
  { key: 'mobility', name: 'Mobility', editable: true, width: 85 },
  { key: 'recession', name: 'Recession', editable: true, width: 85 },
  { key: 'pocket', name: 'Pocket', editable: true, width: 70 },
  { key: 'furcation', name: 'Furcation', editable: true, width: 90 },
  { key: 'hyperplasia', name: 'Hyperplasia', editable: true, width: 110 },
  { key: 'calculus', name: 'Calculus', editable: true, width: 85 },
  { key: 'gingivitis', name: 'Gingivitis', editable: true, width: 90 },
  { key: 'pdstate', name: 'PD State', editable: true, width: 85 },
];

/**
 * Minimum height for the data grid
 */
export const GRID_MIN_HEIGHT = 1000;

/**
 * Total number of rows in the grid
 */
export const GRID_ROW_COUNT = 43;
