import React, { useState } from 'react';
import { PatientInfo, Species } from './types';
import { PatientForm, DentalGrid } from './components';
import { useDentalData } from './hooks/useDentalData';
import { generateDentalChartPDF } from './utils/pdfGenerator';

/**
 * Main container component for dental chart entry
 * Manages patient information, dental data, and PDF generation
 */
const EntryGrid: React.FC = () => {
  // Patient information state
  const [patientInfo, setPatientInfo] = useState<PatientInfo>({
    patientName: '',
    patientNumber: '',
    date: '',
    tech: '',
    complaint: '',
  });

  // Species selection state
  const [species, setSpecies] = useState<Species>('feline');

  // Dental data management via custom hook
  const { toothData, setToothDataDirectly } = useDentalData();

  /**
   * Updates a specific field in patient information
   */
  const handlePatientInfoChange = (
    field: keyof PatientInfo,
    value: string
  ) => {
    setPatientInfo((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  /**
   * Handles species selection change
   */
  const handleSpeciesChange = (newSpecies: Species) => {
    setSpecies(newSpecies);
  };

  /**
   * Generates and downloads the dental chart PDF
   */
  const handleGenerateChart = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    try {
      await generateDentalChartPDF(patientInfo, toothData, species);
    } catch (error) {
      alert('Failed to generate dental chart. Please try again.');
      console.error(error);
    }
  };

  return (
    <div className="entry-grid-container">
      <form onSubmit={handleGenerateChart}>
        <PatientForm
          patientInfo={patientInfo}
          species={species}
          onPatientInfoChange={handlePatientInfoChange}
          onSpeciesChange={handleSpeciesChange}
        />

        <DentalGrid
          toothData={toothData}
          onToothDataChange={setToothDataDirectly}
        />

        <div className="entry-grid__submit">
          <button type="submit" className="entry-grid__button">
            Generate Chart
          </button>
        </div>
      </form>
    </div>
  );
};

export default EntryGrid;
