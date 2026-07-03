import React from 'react';
import { PatientInfo, Species, Logo } from '../types';
import { CodeField } from './CodeField';

interface PatientFormProps {
  patientInfo: PatientInfo;
  species: Species;
  logo: Logo;
  onPatientInfoChange: (field: keyof PatientInfo, value: string) => void;
  onSpeciesChange: (species: Species) => void;
  onLogoChange: (logo: Logo) => void;
}

/**
 * Form component for patient information entry. Loading a saved chart PDF
 * lives in the top-of-app ChartMenu now, not in this card.
 */
export const PatientForm: React.FC<PatientFormProps> = ({
  patientInfo,
  species,
  logo,
  onPatientInfoChange,
  onSpeciesChange,
  onLogoChange,
}) => {
  const handleInputChange = (field: keyof PatientInfo) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    onPatientInfoChange(field, event.target.value);
  };

  const handleSpeciesClick = (selectedSpecies: Species) => {
    onSpeciesChange(selectedSpecies);
  };

  const handleLogoClick = (selectedLogo: Logo) => {
    onLogoChange(selectedLogo);
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

      {logo === 'vca' && (
        <div className="patient-form__row">
          <label className="patient-form__label">
            Doctor
            <input
              type="text"
              className="patient-form__input"
              placeholder="Doctor name"
              value={patientInfo.doctor}
              onChange={handleInputChange('doctor')}
            />
          </label>

          <label className="patient-form__label">
            Tech
            <input
              type="text"
              className="patient-form__input"
              placeholder="Tech name"
              value={patientInfo.tech}
              onChange={handleInputChange('tech')}
            />
          </label>
        </div>
      )}

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
        <div
          className="patient-form__species"
          role="radiogroup"
          aria-label="Species"
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
            🐱 Kitten
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
            🐶 Puppy
          </button>
        </div>

        <div
          className="patient-form__species"
          role="radiogroup"
          aria-label="Logo"
        >
          <button
            type="button"
            role="radio"
            aria-checked={logo === 'socal'}
            className={`species-tab ${logo === 'socal' ? 'species-tab--active' : ''}`}
            onClick={() => handleLogoClick('socal')}
          >
            SoCal Tooth Ops
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={logo === 'vca'}
            className={`species-tab ${logo === 'vca' ? 'species-tab--active' : ''}`}
            onClick={() => handleLogoClick('vca')}
          >
            VCA
          </button>
        </div>
      </div>
    </div>
  );
};
