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
      <div className="patient-form__row">
        <label className="patient-form__label">
          Patient Name:
          <input
            type="text"
            className="patient-form__input"
            value={patientInfo.patientName}
            onChange={handleInputChange('patientName')}
          />
        </label>

        <label className="patient-form__label">
          Patient Number:
          <input
            type="text"
            className="patient-form__input"
            value={patientInfo.patientNumber}
            onChange={handleInputChange('patientNumber')}
          />
        </label>
      </div>

      <div className="patient-form__row">
        <label className="patient-form__label">
          Date:
          <input
            type="text"
            className="patient-form__input"
            value={patientInfo.date}
            onChange={handleInputChange('date')}
          />
        </label>

        <label className="patient-form__label">
          Tech:
          <input
            type="text"
            className="patient-form__input"
            value={patientInfo.tech}
            onChange={handleInputChange('tech')}
          />
        </label>
      </div>

      <div className="patient-form__row">
        <label className="patient-form__label">
          Complaint:
          <textarea
            className="patient-form__textarea"
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
          Feline
        </label>

        <label className="patient-form__radio-label">
          <input
            type="radio"
            value="canine"
            checked={species === 'canine'}
            onChange={handleSpeciesChange}
          />
          Canine
        </label>
      </div>
    </div>
  );
};
