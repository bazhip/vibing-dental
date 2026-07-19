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
    setToothDataDirectly,
    switchSpecies,
  };
}
