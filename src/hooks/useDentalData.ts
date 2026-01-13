import { useState, useCallback } from 'react';
import { ToothData, Species } from '../types';
import { getInitialToothData } from '../constants';

/**
 * Custom hook for managing dental chart data
 * Provides state and update handlers for tooth data
 */
export function useDentalData(initialSpecies: Species = 'feline') {
  const [toothData, setToothData] = useState<ToothData[]>(
    getInitialToothData(initialSpecies)
  );

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
   * Resets tooth data to initial state for a specific species
   */
  const resetToothData = useCallback((species: Species) => {
    setToothData(getInitialToothData(species));
  }, []);

  /**
   * Sets tooth data directly (for react-data-grid v7 onRowsChange)
   */
  const setToothDataDirectly = useCallback((rows: ToothData[]) => {
    setToothData(rows);
  }, []);

  /**
   * Switch species and reset tooth data
   */
  const switchSpecies = useCallback((species: Species) => {
    setToothData(getInitialToothData(species));
  }, []);

  return {
    toothData,
    updateToothData,
    setToothDataDirectly,
    resetToothData,
    switchSpecies,
  };
}
