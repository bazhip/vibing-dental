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

  // The one Species value carries both axes; the UI splits them into a
  // species picker (feline/canine) and a dentition picker (permanent/
  // deciduous) so neither list is a four-way combo.
  const base: 'feline' | 'canine' = species.startsWith('canine') ? 'canine' : 'feline';
  const dentition: 'permanent' | 'deciduous' = species.endsWith('deciduous') ? 'deciduous' : 'permanent';
  const combine = (b: 'feline' | 'canine', d: 'permanent' | 'deciduous'): Species =>
    (d === 'deciduous' ? `${b}-deciduous` : b) as Species;

  const handleBaseChange = (b: 'feline' | 'canine') => onSpeciesChange(combine(b, dentition));
  const handleDentitionChange = (d: 'permanent' | 'deciduous') => onSpeciesChange(combine(base, d));

  return (
    <div className="patient-form">
      <div className="patient-form__header">
        <h2 className="patient-form__section-title">Patient Information</h2>
      </div>

      {/* SoCal carries Patient Name + Number; VCA carries Doctor + Tech.
          Both pairs are kept on PatientInfo so values survive a logo flip. */}
      <div className="patient-form__row">
        <label className="patient-form__label">
          {/* Needed to SAVE (the library finds charts by name), but not
              `required`: the whole chart is one form whose submit button
              is Preview PDF, and native validation was blocking nameless
              previews. attemptSave in EntryGrid enforces the name. */}
          <span>Patient Name <span className="patient-form__req" aria-hidden="true">*</span></span>
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

      {/* Pet owner (client) — sits right under the pet's identity, above
          the per-procedure fields. Searchable in My charts. */}
      <div className="patient-form__row">
        <label className="patient-form__label">
          Owner name
          <input
            type="text"
            className="patient-form__input"
            placeholder="Pet owner / client"
            autoComplete="off"
            value={patientInfo.ownerName ?? ''}
            onChange={handleInputChange('ownerName')}
          />
        </label>
        <label className="patient-form__label">
          Owner phone
          <input
            type="tel"
            className="patient-form__input"
            placeholder="Contact number"
            autoComplete="off"
            value={patientInfo.ownerPhone ?? ''}
            onChange={handleInputChange('ownerPhone')}
          />
        </label>

        <label className="patient-form__label">
          Owner email
          <input
            type="email"
            className="patient-form__input"
            placeholder="For recheck reminders"
            autoComplete="off"
            value={patientInfo.ownerEmail ?? ''}
            onChange={handleInputChange('ownerEmail')}
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
          Recheck due
          <span className="patient-form__recall">
            <input
              type="date"
              className="patient-form__input"
              value={patientInfo.recallDate ?? ''}
              onChange={handleInputChange('recallDate')}
            />
            {/* Quick-pick: common recheck intervals, counted from the
                visit date (falling back to today). Selecting one fills
                the date field; it can still be hand-adjusted after. */}
            <select
              className="patient-form__input patient-form__recall-quick"
              value=""
              aria-label="Set the recheck date a common interval after the visit date"
              onChange={(e) => {
                const days = Number(e.target.value);
                if (!days) return;
                const base = patientInfo.date ? new Date(`${patientInfo.date}T12:00:00`) : new Date();
                base.setDate(base.getDate() + days);
                onPatientInfoChange('recallDate', base.toISOString().split('T')[0]);
              }}
            >
              <option value="">+ interval</option>
              <option value="7">1 week</option>
              <option value="14">2 weeks</option>
              <option value="30">1 month</option>
              <option value="90">3 months</option>
              <option value="182">6 months</option>
              <option value="365">1 year</option>
            </select>
          </span>
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
            {/* Canine first — it's also the default species. */}
            <button
              type="button"
              role="radio"
              aria-checked={base === 'canine'}
              className={`species-tab ${base === 'canine' ? 'species-tab--active' : ''}`}
              onClick={() => handleBaseChange('canine')}
            >
              Canine
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={base === 'feline'}
              className={`species-tab ${base === 'feline' ? 'species-tab--active' : ''}`}
              onClick={() => handleBaseChange('feline')}
            >
              Feline
            </button>
          </div>
        </div>

        <div className="patient-form__selector">
          <span className="patient-form__selector-label" id="dentition-group-label">
            Dentition
          </span>
          <div
            className="patient-form__species"
            role="radiogroup"
            aria-labelledby="dentition-group-label"
          >
            <button
              type="button"
              role="radio"
              aria-checked={dentition === 'permanent'}
              className={`species-tab ${dentition === 'permanent' ? 'species-tab--active' : ''}`}
              onClick={() => handleDentitionChange('permanent')}
            >
              Permanent
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={dentition === 'deciduous'}
              className={`species-tab ${dentition === 'deciduous' ? 'species-tab--active' : ''}`}
              onClick={() => handleDentitionChange('deciduous')}
            >
              Deciduous
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
