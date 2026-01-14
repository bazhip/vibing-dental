import React from 'react';
import { PatientInfo, Species } from '../types';

interface PatientFormProps {
  patientInfo: PatientInfo;
  species: Species;
  onPatientInfoChange: (field: keyof PatientInfo, value: string) => void;
  onSpeciesChange: (species: Species) => void;
}

/**
 * Form component for patient information entry
 */
export const PatientForm: React.FC<PatientFormProps> = ({
  patientInfo,
  species,
  onPatientInfoChange,
  onSpeciesChange,
}) => {
  const handleInputChange = (field: keyof PatientInfo) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    onPatientInfoChange(field, event.target.value);
  };

  const handleSpeciesClick = (selectedSpecies: Species) => {
    onSpeciesChange(selectedSpecies);
  };

  return (
    <div className="patient-form">
      <h2 className="patient-form__section-title">Patient Information</h2>

      <div className="patient-form__row">
        <label className="patient-form__label">
          Patient Name
          <input
            type="text"
            className="patient-form__input"
            placeholder="Enter patient name"
            value={patientInfo.patientName}
            onChange={handleInputChange('patientName')}
          />
        </label>

        <label className="patient-form__label">
          Patient Number
          <input
            type="text"
            className="patient-form__input"
            placeholder="Enter patient ID"
            value={patientInfo.patientNumber}
            onChange={handleInputChange('patientNumber')}
          />
        </label>

        <label className="patient-form__label">
          Date
          <input
            type="date"
            className="patient-form__input"
            value={patientInfo.date}
            onChange={handleInputChange('date')}
          />
        </label>
      </div>

      <div className="patient-form__row">
        <label className="patient-form__label">
          Chief Complaint
          <textarea
            className="patient-form__textarea"
            placeholder="Enter chief complaint or reason for visit"
            value={patientInfo.complaint}
            onChange={handleInputChange('complaint')}
          />
        </label>
      </div>

      <div className="patient-form__species">
        <button
          type="button"
          className={`species-tab ${species === 'feline' ? 'species-tab--active' : ''}`}
          onClick={() => handleSpeciesClick('feline')}
        >
          🐱 Feline
        </button>

        <button
          type="button"
          className={`species-tab ${species === 'canine' ? 'species-tab--active' : ''}`}
          onClick={() => handleSpeciesClick('canine')}
        >
          🐶 Canine
        </button>
      </div>
    </div>
  );
};
