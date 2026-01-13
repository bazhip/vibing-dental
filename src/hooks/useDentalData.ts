import { useState, useCallback } from 'react';
import { ToothData } from '../types';
import { INITIAL_TOOTH_DATA } from '../constants';

/**
 * Custom hook for managing dental chart data
 * Provides state and update handlers for tooth data
 */
export function useDentalData() {
  const [toothData, setToothData] = useState<ToothData[]>(INITIAL_TOOTH_DATA);

  /**
   * Updates tooth data when cells are edited in the grid
   * @param fromRow - Starting row index
   * @param toRow - Ending row index
   * @param updated - Object containing the updated field values
   */
  const updateToothData = useCallback(
    (fromRow: number, toRow: number, updated: Partial<ToothData>) => {
      setToothData((prevData) => {
        const newData = [...prevData];

        for (let i = fromRow; i <= toRow; i++) {
          newData[i] = { ...newData[i], ...updated };
        }

        return newData;
      });
    },
    []
  );

  /**
   * Resets all tooth data to initial state
   */
  const resetToothData = useCallback(() => {
    setToothData(INITIAL_TOOTH_DATA);
  }, []);

  /**
   * Sets tooth data directly (for react-data-grid v7 onRowsChange)
   */
  const setToothDataDirectly = useCallback((rows: ToothData[]) => {
    setToothData(rows);
  }, []);

  return {
    toothData,
    updateToothData,
    setToothDataDirectly,
    resetToothData,
  };
}
