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

  const handleSpeciesChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onSpeciesChange(event.target.value as Species);
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
      </div>

      <div className="patient-form__row">
        <label className="patient-form__label">
          Date
          <input
            type="date"
            className="patient-form__input"
            value={patientInfo.date}
            onChange={handleInputChange('date')}
          />
        </label>

        <label className="patient-form__label">
          Technician
          <input
            type="text"
            className="patient-form__input"
            placeholder="Enter technician name"
            value={patientInfo.tech}
            onChange={handleInputChange('tech')}
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
        <label className="patient-form__radio-label">
          <input
            type="radio"
            value="feline"
            checked={species === 'feline'}
            onChange={handleSpeciesChange}
          />
          🐱 Feline
        </label>

        <label className="patient-form__radio-label">
          <input
            type="radio"
            value="canine"
            checked={species === 'canine'}
            onChange={handleSpeciesChange}
          />
          🐶 Canine
        </label>
      </div>
    </div>
  );
};
