import React from 'react';
import DataGrid from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import { ToothData } from '../types';
import { GRID_COLUMNS, GRID_MIN_HEIGHT } from '../constants';

interface DentalGridProps {
  toothData: ToothData[];
  onToothDataChange: (rows: ToothData[]) => void;
}

/**
 * Data grid component for dental chart entry
 */
export const DentalGrid: React.FC<DentalGridProps> = ({
  toothData,
  onToothDataChange,
}) => {
  return (
    <div className="dental-grid">
      <DataGrid
        columns={GRID_COLUMNS as any}
        rows={toothData}
        onRowsChange={onToothDataChange}
        style={{ height: GRID_MIN_HEIGHT }}
      />
    </div>
  );
};
