import React from 'react';
import { PatientInfo, Species } from '../types';
import { CodeField } from './CodeField';

interface PatientFormProps {
  patientInfo: PatientInfo;
  species: Species;
  onPatientInfoChange: (field: keyof PatientInfo, value: string) => void;
  onSpeciesChange: (species: Species) => void;
}

/**
 * Form component for patient information entry. Loading a saved chart PDF
 * lives in the top-of-app ChartMenu now, not in this card.
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
      <div className="patient-form__header">
        <h2 className="patient-form__section-title">Patient Information</h2>
      </div>

      {/* SoCal carries Patient Name + Number; VCA carries Doctor + Tech.
          Both pairs are kept on PatientInfo so values survive a logo flip. */}
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
            placeholder="Enter patient number"
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

      {/* Doctor name comes from the practice profile (set at signup / in
          Practice settings) and is embedded in the PDF automatically —
          only the per-procedure tech is entered here. */}
      <div className="patient-form__row">
        <label className="patient-form__label">
          Tech
          <input
            type="text"
            className="patient-form__input"
            placeholder="Tech name (optional)"
            value={patientInfo.tech}
            onChange={handleInputChange('tech')}
          />
        </label>

        <label className="patient-form__label">
          Recall due
          <input
            type="date"
            className="patient-form__input"
            value={patientInfo.recallDate}
            onChange={handleInputChange('recallDate')}
          />
          <span className="patient-form__hint">Next dental recheck — shown in My charts.</span>
        </label>
      </div>

      <div className="patient-form__row">
        <label className="patient-form__label">
          Chief Complaint
          <CodeField
            multiline
            className="patient-form__textarea"
            placeholder="Enter chief complaint or reason for visit"
            value={patientInfo.complaint}
            onChange={(value) => onPatientInfoChange('complaint', value)}
          />
        </label>
      </div>

      <div className="patient-form__selectors">
        <div className="patient-form__selector">
        <span className="patient-form__selector-label" id="species-group-label">
          Species
        </span>
        <div
          className="patient-form__species"
          role="radiogroup"
          aria-labelledby="species-group-label"
        >
          <button
            type="button"
            role="radio"
            aria-checked={species === 'feline'}
            className={`species-tab ${species === 'feline' ? 'species-tab--active' : ''}`}
            onClick={() => handleSpeciesClick('feline')}
          >
            🐱 Feline
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={species === 'feline-deciduous'}
            className={`species-tab ${species === 'feline-deciduous' ? 'species-tab--active' : ''}`}
            onClick={() => handleSpeciesClick('feline-deciduous')}
          >
            🐱 Feline (Deciduous)
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={species === 'canine'}
            className={`species-tab ${species === 'canine' ? 'species-tab--active' : ''}`}
            onClick={() => handleSpeciesClick('canine')}
          >
            🐶 Canine
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={species === 'canine-deciduous'}
            className={`species-tab ${species === 'canine-deciduous' ? 'species-tab--active' : ''}`}
            onClick={() => handleSpeciesClick('canine-deciduous')}
          >
            🐶 Canine (Deciduous)
          </button>
        </div>
        </div>
      </div>
    </div>
  );
};
