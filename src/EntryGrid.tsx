import React, { useState } from 'react';
import { PatientInfo, Species, Logo } from './types';
import { PatientForm, DentalGrid } from './components';
import { useDentalData } from './hooks/useDentalData';
import { generateDentalChartPDF } from './utils/pdfGenerator';
import './components/EntryGrid.css';

/**
 * Main container component for dental chart entry
 * Manages patient information, dental data, and PDF generation
 */
const EntryGrid: React.FC = () => {
  // Patient information state
  const [patientInfo, setPatientInfo] = useState<PatientInfo>({
    patientName: '',
    patientNumber: '',
    date: new Date().toISOString().split('T')[0], // Default to today's date
    complaint: '',
  });

  // Species selection state
  const [species, setSpecies] = useState<Species>('feline');

  // Logo selection state
  const [logo, setLogo] = useState<Logo>('vca');

  // Dental data management via custom hook
  const { toothData, setToothDataDirectly, switchSpecies } = useDentalData(species);

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
   * Switches the grid to show only relevant teeth
   */
  const handleSpeciesChange = (newSpecies: Species) => {
    setSpecies(newSpecies);
    switchSpecies(newSpecies);
  };

  /**
   * Generates and downloads the dental chart PDF
   */
  const handleGenerateChart = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    try {
      await generateDentalChartPDF(patientInfo, toothData, species, logo);
    } catch (error) {
      alert('Failed to generate dental chart. Please try again.');
      console.error(error);
    }
  };

  return (
    <div className="entry-grid-container">
      <form className="entry-grid-form" onSubmit={handleGenerateChart}>
        <PatientForm
          patientInfo={patientInfo}
          species={species}
          logo={logo}
          onPatientInfoChange={handlePatientInfoChange}
          onSpeciesChange={handleSpeciesChange}
          onLogoChange={setLogo}
        />

        <DentalGrid
          toothData={toothData}
          onToothDataChange={setToothDataDirectly}
        />

        <div className="entry-grid__submit">
          <button type="submit" className="entry-grid__button">
            📄 Generate Chart
          </button>
        </div>
      </form>
    </div>
  );
};

export default EntryGrid;
