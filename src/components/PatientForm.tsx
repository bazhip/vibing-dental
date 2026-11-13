import React from 'react';
import { useTranslation } from 'react-i18next';
import { localDateISO } from '../utils/localDate';
import { PatientInfo, Species } from '../types';
import { CodeField } from './CodeField';
import { isNativeApp } from '../native/platform';
import { FormField, FormGroup, Segmented } from '../ios/Form';

interface PatientFormProps {
  patientInfo: PatientInfo;
  species: Species;
  onPatientInfoChange: (field: keyof PatientInfo, value: string) => void;
  onSpeciesChange: (species: Species) => void;
  /** Personal chart setting: leave out the Recheck due field. */
  hideRecheck?: boolean;
  /** Open this page's settings. */
  onCustomize?: () => void;
}

/**
 * Form component for patient information entry. Loading a saved chart PDF
 * lives in the top-of-app ChartMenu now, not in this card.
 */
// The app's grouped rows: element and label ids (not text).
const GROUP_ROW = 'div' as const;
const SPECIES_LABEL_ID = 'species-group-label';
const DENTITION_LABEL_ID = 'dentition-group-label';

export const PatientForm: React.FC<PatientFormProps> = ({
  patientInfo,
  species,
  onPatientInfoChange,
  onSpeciesChange,
  hideRecheck = false,
  onCustomize,
}) => {
  const { t } = useTranslation('forms');
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
  const native = isNativeApp();
  // Quick-pick: common recheck intervals, counted from the visit date
  // (falling back to today). Selecting one fills the date field; it can
  // still be hand-adjusted after.
  const recallQuick = (
    <select
      className="patient-form__input patient-form__recall-quick"
      value=""
      aria-label={t('patient.recheckQuick')}
      onChange={(e) => {
        const days = Number(e.target.value);
        if (!days) return;
        const base = patientInfo.date ? new Date(`${patientInfo.date}T12:00:00`) : new Date();
        base.setDate(base.getDate() + days);
        onPatientInfoChange('recallDate', localDateISO(base));
      }}
    >
      <option value="">{native ? t('ios.form.addInterval', { ns: 'chart' }) : t('patient.intervalPlaceholder')}</option>
      <option value="7">{t('patient.intervals.week1')}</option>
      <option value="14">{t('patient.intervals.weeks2')}</option>
      <option value="30">{t('patient.intervals.month1')}</option>
      <option value="90">{t('patient.intervals.months3')}</option>
      <option value="182">{t('patient.intervals.months6')}</option>
      <option value="365">{t('patient.intervals.year1')}</option>
    </select>
  );

  // The iOS app: the same fields as inset-grouped label/value rows, and
  // segmented controls for species and dentition.
  if (native) {
    const speciesOptions = [
      { value: 'canine' as const, label: t('patient.canine') },
      { value: 'feline' as const, label: t('patient.feline') },
    ];
    const dentitionOptions = [
      { value: 'permanent' as const, label: t('patient.permanent') },
      { value: 'deciduous' as const, label: t('patient.deciduous') },
    ];
    return (
      <div className="patient-form patient-form--ios">
        {/* Customize is in the Chart bar's More menu in the app. */}
        <div className="patient-form__header">
          <h2 className="patient-form__section-title">{t('patient.title')}</h2>
        </div>
        <FormGroup header={t('ios.form.patient', { ns: 'chart' })}>
          <FormField label={<>{t('patient.name')} <span className="patient-form__req" aria-hidden="true">*</span></>}>
            <input
              type="text"
              className="patient-form__input"
              placeholder={t('patient.namePlaceholder')}
              data-tour="patient-name"
              value={patientInfo.patientName}
              onChange={handleInputChange('patientName')}
            />
          </FormField>
          <FormField label={t('patient.number')}>
            <input
              type="text"
              className="patient-form__input"
              placeholder={t('patient.numberPlaceholder')}
              value={patientInfo.patientNumber}
              onChange={handleInputChange('patientNumber')}
            />
          </FormField>
          <FormField label={t('patient.date')}>
            <input type="date" className="patient-form__input" value={patientInfo.date} onChange={handleInputChange('date')} />
          </FormField>
          <FormField as={GROUP_ROW} label={<span id={SPECIES_LABEL_ID}>{t('patient.species')}</span>}>
            <Segmented
              labelledBy={SPECIES_LABEL_ID}
              options={speciesOptions}
              value={base}
              onChange={handleBaseChange}
            />
          </FormField>
          <FormField as={GROUP_ROW} label={<span id={DENTITION_LABEL_ID}>{t('patient.dentition')}</span>}>
            <Segmented
              labelledBy={DENTITION_LABEL_ID}
              options={dentitionOptions}
              value={dentition}
              onChange={handleDentitionChange}
            />
          </FormField>
        </FormGroup>

        <FormGroup header={t('ios.form.owner', { ns: 'chart' })}>
          <FormField label={t('patient.ownerName')}>
            <input
              type="text"
              className="patient-form__input"
              placeholder={t('patient.ownerNamePlaceholder')}
              autoComplete="off"
              value={patientInfo.ownerName ?? ''}
              onChange={handleInputChange('ownerName')}
            />
          </FormField>
          <FormField label={t('patient.ownerPhone')}>
            <input
              type="tel"
              className="patient-form__input"
              placeholder={t('patient.ownerPhonePlaceholder')}
              autoComplete="off"
              value={patientInfo.ownerPhone ?? ''}
              onChange={handleInputChange('ownerPhone')}
            />
          </FormField>
          <FormField label={t('patient.ownerEmail')}>
            <input
              type="email"
              className="patient-form__input"
              placeholder={hideRecheck ? t('patient.ownerEmailOptional') : t('patient.ownerEmailReminders')}
              autoComplete="off"
              value={patientInfo.ownerEmail ?? ''}
              onChange={handleInputChange('ownerEmail')}
            />
          </FormField>
        </FormGroup>

        <FormGroup header={t('ios.form.visit', { ns: 'chart' })}>
          <FormField label={t('patient.tech')}>
            <input
              type="text"
              className="patient-form__input"
              placeholder={t('patient.techPlaceholder')}
              value={patientInfo.tech}
              onChange={handleInputChange('tech')}
            />
          </FormField>
          {!hideRecheck && (
            <FormField as={GROUP_ROW} label={t('patient.recheck')}>
              <span className="patient-form__recall">
                <input
                  type="date"
                  className="patient-form__input"
                  aria-label={t('patient.recheck')}
                  value={patientInfo.recallDate ?? ''}
                  onChange={handleInputChange('recallDate')}
                />
                {recallQuick}
              </span>
            </FormField>
          )}
        </FormGroup>

        <FormGroup header={t('ios.form.complaint', { ns: 'chart' })}>
          <div className="ios-field ios-field--stacked ios-field--bare">
            <CodeField
              multiline
              className="patient-form__textarea"
              aria-label={t('patient.complaint')}
              placeholder={t('patient.complaintPlaceholder')}
              value={patientInfo.complaint}
              onChange={(value) => onPatientInfoChange('complaint', value)}
            />
          </div>
        </FormGroup>
      </div>
    );
  }

  return (
    <div className="patient-form">
      <div className="patient-form__header">
        <h2 className="patient-form__section-title">{t('patient.title')}</h2>
        {onCustomize && (
          <button type="button" className="diagram-view__action" onClick={onCustomize} title={t('patient.customizeTitle')}>
            {t('patient.customize')}
          </button>
        )}
      </div>

      {/* SoCal carries Patient Name + Number; VCA carries Doctor + Tech.
          Both pairs are kept on PatientInfo so values survive a logo flip. */}
      <div className="patient-form__row">
        <label className="patient-form__label">
          {/* Needed to SAVE (the library finds charts by name), but not
              `required`: the whole chart is one form whose submit button
              is Preview PDF, and native validation was blocking nameless
              previews. attemptSave in EntryGrid enforces the name. */}
          <span>{t('patient.name')} <span className="patient-form__req" aria-hidden="true">*</span></span>
          <input
            type="text"
            className="patient-form__input"
            data-tour="patient-name"
            placeholder={t('patient.namePlaceholder')}
            value={patientInfo.patientName}
            onChange={handleInputChange('patientName')}
          />
        </label>

        <label className="patient-form__label">
          {t('patient.number')}
          <input
            type="text"
            className="patient-form__input"
            placeholder={t('patient.numberPlaceholder')}
            value={patientInfo.patientNumber}
            onChange={handleInputChange('patientNumber')}
          />
        </label>

        <label className="patient-form__label">
          {t('patient.date')}
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
          {t('patient.ownerName')}
          <input
            type="text"
            className="patient-form__input"
            placeholder={t('patient.ownerNamePlaceholder')}
            autoComplete="off"
            value={patientInfo.ownerName ?? ''}
            onChange={handleInputChange('ownerName')}
          />
        </label>
        <label className="patient-form__label">
          {t('patient.ownerPhone')}
          <input
            type="tel"
            className="patient-form__input"
            placeholder={t('patient.ownerPhonePlaceholder')}
            autoComplete="off"
            value={patientInfo.ownerPhone ?? ''}
            onChange={handleInputChange('ownerPhone')}
          />
        </label>

        <label className="patient-form__label">
          {t('patient.ownerEmail')}
          <input
            type="email"
            className="patient-form__input"
            placeholder={hideRecheck ? t('patient.ownerEmailOptional') : t('patient.ownerEmailReminders')}
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
          {t('patient.tech')}
          <input
            type="text"
            className="patient-form__input"
            placeholder={t('patient.techPlaceholder')}
            value={patientInfo.tech}
            onChange={handleInputChange('tech')}
          />
        </label>

        {!hideRecheck && (
        <label className="patient-form__label">
          {t('patient.recheck')}
          <span className="patient-form__recall">
            <input
              type="date"
              className="patient-form__input"
              value={patientInfo.recallDate ?? ''}
              onChange={handleInputChange('recallDate')}
            />
            {recallQuick}
          </span>
        </label>
        )}
      </div>

      <div className="patient-form__row">
        <label className="patient-form__label">
          {t('patient.complaint')}
          <CodeField
            multiline
            className="patient-form__textarea"
            placeholder={t('patient.complaintPlaceholder')}
            value={patientInfo.complaint}
            onChange={(value) => onPatientInfoChange('complaint', value)}
          />
        </label>
      </div>

      <div className="patient-form__selectors">
        <div className="patient-form__selector">
          <span className="patient-form__selector-label" id="species-group-label">
            {t('patient.species')}
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
              {t('patient.canine')}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={base === 'feline'}
              className={`species-tab ${base === 'feline' ? 'species-tab--active' : ''}`}
              onClick={() => handleBaseChange('feline')}
            >
              {t('patient.feline')}
            </button>
          </div>
        </div>

        <div className="patient-form__selector">
          <span className="patient-form__selector-label" id="dentition-group-label">
            {t('patient.dentition')}
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
              {t('patient.permanent')}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={dentition === 'deciduous'}
              className={`species-tab ${dentition === 'deciduous' ? 'species-tab--active' : ''}`}
              onClick={() => handleDentitionChange('deciduous')}
            >
              {t('patient.deciduous')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
