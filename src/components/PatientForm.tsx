import { RefineTextAction } from './RefineTextAction';
import { isGeneratedPatientNumber, patientNumberOf } from '../utils/patientIds';
import { SectionHeader } from './SectionHeader';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { PATIENT_LAYOUT_FIELDS, type OptionalPatientField, type PatientLayoutField } from '../utils/chartSettings';
import { localDateISO } from '../utils/localDate';
import { PatientInfo, Species } from '../types';
import { CodeField } from './CodeField';
import { isNativeApp } from '../native/platform';
import { combineSpecies, hasDeciduousChart, speciesBase, speciesDentition, type Dentition, type SpeciesBase } from '../utils/species';
import { FormField, FormGroup, Segmented } from '../ios/Form';
import { PracticeChartFields } from './PracticeChartFields';
import { defaultPatientLayout, PATIENT_BUILTIN_FIELDS, patientDefaultGroup, type PatientBuiltinField, type PatientLayout } from '../utils/patientLayout';
import type { SharedPracticeField } from '../utils/practiceChartFields';

interface PatientFormProps {
  patientInfo: PatientInfo;
  species: Species;
  onPatientInfoChange: (field: keyof PatientInfo, value: string) => void;
  onSpeciesChange: (species: Species) => void;
  /** Personal chart setting: leave out the Recheck due field. */
  hideRecheck?: boolean;
  hiddenFields?: OptionalPatientField[];
  fieldOrder?: readonly PatientLayoutField[];
  layout?: PatientLayout;
  onLayoutFieldChange?: (field: SharedPracticeField, value: string) => void;
  /** Open this page's settings. */
  onCustomize?: () => void;
  onReviewHistory?: () => void;
  readOnly?: boolean;
}

/**
 * Form component for patient information entry. Loading a saved chart PDF
 * lives in the top-of-app ChartMenu now, not in this card.
 */
// The app's grouped rows: element and label ids (not text).
const GROUP_ROW = 'div' as const;
const SPECIES_LABEL_ID = 'species-group-label';
const DENTITION_LABEL_ID = 'dentition-group-label';
const OTHER_SPECIES = ['equine', 'rabbit'] as const;
const AUTO_DIRECTION = 'auto';

export const PatientForm: React.FC<PatientFormProps> = ({
  patientInfo,
  species,
  onPatientInfoChange,
  onSpeciesChange,
  hideRecheck = false,
  hiddenFields = [],
  fieldOrder = PATIENT_LAYOUT_FIELDS,
  layout,
  onLayoutFieldChange,
  onCustomize,
  onReviewHistory,
  readOnly = false,
}) => {
  const { t } = useTranslation('forms');
  const historyAction = onReviewHistory && (
    <button type="button" className="diagram-view__action patient-form__history" aria-haspopup="dialog" onClick={onReviewHistory}>
      {t('patientRecord.open', { ns: 'media' })}
    </button>
  );
  const numberHintId = React.useId();
  const complaintId = React.useId();
  const ownerHasInfo = !!(patientInfo.ownerName?.trim() || patientInfo.ownerPhone?.trim() || patientInfo.ownerEmail?.trim());
  const [ownerExpanded, setOwnerExpanded] = React.useState(ownerHasInfo);
  React.useEffect(() => { if (ownerHasInfo) setOwnerExpanded(true); }, [ownerHasInfo]);
  const visibleFields = Object.fromEntries(
    (['ownerName', 'ownerPhone', 'ownerEmail', 'tech'] as OptionalPatientField[]).map((field) => [field, !hiddenFields.includes(field) || !!patientInfo[field]?.trim()])
  );
  const ownerFields = fieldOrder.filter((field): field is 'ownerName' | 'ownerPhone' | 'ownerEmail' =>
    field !== 'tech' && field !== 'recallDate' && visibleFields[field]);
  const showRecheck = !hideRecheck || !!patientInfo.recallDate?.trim();
  const visitFields = fieldOrder.filter(field => field === 'tech' ? visibleFields.tech : field === 'recallDate' && showRecheck);
  const handleInputChange = (field: keyof PatientInfo) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    onPatientInfoChange(field, event.target.value);
  };

  // The one Species value carries both axes; the UI splits them into a
  // species picker (canine/feline/Other) and a dentition picker
  // (permanent/deciduous) so neither list is a combo of every pair.
  const patientLayoutInput = (field: OptionalPatientField) => {
    const contact = field === 'ownerPhone' || field === 'ownerEmail';
    const placeholder = field === 'ownerEmail'
      ? t(hideRecheck ? 'patient.ownerEmailOptional' : 'patient.ownerEmailReminders')
      : t(`patient.${field}Placeholder`);
    return <input dir={contact ? 'ltr' : 'auto'}
      type={field === 'ownerPhone' ? 'tel' : field === 'ownerEmail' ? 'email' : 'text'}
      className="patient-form__input" placeholder={placeholder} autoComplete={field === 'tech' ? undefined : 'off'}
      value={patientInfo[field] ?? ''} onChange={handleInputChange(field)} />;
  };

  const base = speciesBase(species);
  const dentition = speciesDentition(species);
  const deciduousOk = hasDeciduousChart(base);

  const handleBaseChange = (b: SpeciesBase) => onSpeciesChange(combineSpecies(b, dentition));
  const handleDentitionChange = (d: Dentition) => onSpeciesChange(combineSpecies(base, d));
  const native = isNativeApp();
  const otherSelected = base === 'equine' || base === 'rabbit';
  // Keep the browser/OS select for keyboard navigation and the native phone
  // picker. Its transparent surface covers the complete visible control.
  const otherPicker = (
    <span className={`species-tab patient-form__other${otherSelected ? ' species-tab--active' : ''}`}>
      <span aria-hidden="true">{otherSelected ? t('patient.otherSelected', { species: t(`patient.${base}`) }) : t('patient.other')}</span>
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <select
        className="patient-form__other-select"
        aria-label={t('patient.otherSpecies')}
        value={otherSelected ? base : ''}
        onChange={e => handleBaseChange(e.target.value as 'equine' | 'rabbit')}
      >
        <option value="" disabled>{t('patient.other')}</option>
        {OTHER_SPECIES.map(value => <option key={value} value={value}>{t(`patient.${value}`)}</option>)}
      </select>
    </span>
  );
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

  const speciesOptions = [
    { value: 'canine' as const, label: t('patient.canine') },
    { value: 'feline' as const, label: t('patient.feline') },
  ];
  const dentitionOptions = [
    { value: 'permanent' as const, label: t('patient.permanent') },
    { value: 'deciduous' as const, label: t('patient.deciduous'), disabled: !deciduousOk },
  ];
  const nativeFields: Partial<Record<PatientBuiltinField, React.ReactNode>> = {
    patientName: (<FormField label={<>{t('patient.name')} <span className="patient-form__req" aria-hidden="true">*</span></>}>
        <input dir="auto"
          type="text"
          className="patient-form__input"
          placeholder={t('patient.namePlaceholder')}
          data-tour="patient-name"
          value={patientInfo.patientName}
          onChange={handleInputChange('patientName')}
        />
      </FormField>),
    patientNumber: (<FormField label={t('patient.number')}>
        <input dir="auto"
          type="text"
          className="patient-form__input"
          placeholder={patientInfo.patientId && !patientInfo.generatedPatientNumber ? t('patient.numberPending') : t('patient.numberPlaceholder')}
          value={patientInfo.patientNumber}
          aria-describedby={isGeneratedPatientNumber(patientInfo) ? numberHintId : undefined}
          onChange={handleInputChange('patientNumber')}
          onBlur={() => { if (!patientInfo.patientNumber.trim() && patientInfo.generatedPatientNumber) onPatientInfoChange('patientNumber', patientNumberOf(patientInfo)); }}
        />
        {isGeneratedPatientNumber(patientInfo) && <span id={numberHintId} aria-hidden="true" className="patient-form__hint">{t('patient.autoGenerated')}</span>}
      </FormField>),
    date: (<FormField label={t('patient.date')}>
        <input dir="ltr" type="date" className="patient-form__input" value={patientInfo.date} onChange={handleInputChange('date')} />
      </FormField>),
    species: (<FormField as={GROUP_ROW} stacked className="patient-form__choice-row" label={<span id={SPECIES_LABEL_ID}>{t('patient.species')}</span>}>
        <div className="patient-form__species-controls">
          <Segmented
            labelledBy={SPECIES_LABEL_ID}
            options={speciesOptions}
            value={base}
            onChange={handleBaseChange}
          />
          {otherPicker}
        </div>
      </FormField>),
    dentition: (<FormField as={GROUP_ROW} stacked className="patient-form__choice-row" label={<span id={DENTITION_LABEL_ID}>{t('patient.dentition')}</span>}>
        <Segmented
          labelledBy={DENTITION_LABEL_ID}
          options={dentitionOptions}
          value={dentition}
          onChange={handleDentitionChange}
        />
      </FormField>),
    complaint: (<div className="ios-field ios-field--stacked ios-field--bare">
        <div className="refine-field">
          <CodeField
            multiline
            className="patient-form__textarea"
            aria-label={t('patient.complaint')}
            placeholder={t('patient.complaintPlaceholder')}
            value={patientInfo.complaint}
            onChange={(value) => onPatientInfoChange('complaint', value)}
          />
          <RefineTextAction value={patientInfo.complaint ?? ''} readOnly={readOnly} onApply={text => onPatientInfoChange('complaint', text)} />
        </div>
      </div>),
  };
  const webFields: Partial<Record<PatientBuiltinField, React.ReactNode>> = {
    patientName: (<label className="patient-form__label">
      {/* Needed to SAVE (the library finds charts by name), but not
          `required`: the whole chart is one form whose submit button
          is Preview PDF, and native validation was blocking nameless
          previews. attemptSave in EntryGrid enforces the name. */}
      <span>{t('patient.name')} <span className="patient-form__req" aria-hidden="true">*</span></span>
      <input dir="auto"
        type="text"
        className="patient-form__input"
        data-tour="patient-name"
        placeholder={t('patient.namePlaceholder')}
        value={patientInfo.patientName}
        onChange={handleInputChange('patientName')}
      />

        </label>),
    patientNumber: (<label className="patient-form__label">
      {t('patient.number')}
      <input dir="auto"
        type="text"
        className="patient-form__input"
        placeholder={patientInfo.patientId && !patientInfo.generatedPatientNumber ? t('patient.numberPending') : t('patient.numberPlaceholder')}
        value={patientInfo.patientNumber}
          aria-describedby={isGeneratedPatientNumber(patientInfo) ? numberHintId : undefined}
        onChange={handleInputChange('patientNumber')}
          onBlur={() => { if (!patientInfo.patientNumber.trim() && patientInfo.generatedPatientNumber) onPatientInfoChange('patientNumber', patientNumberOf(patientInfo)); }}
      />
      {isGeneratedPatientNumber(patientInfo) && <span id={numberHintId} aria-hidden="true" className="patient-form__hint">{t('patient.autoGenerated')}</span>}
        </label>),
    species: (<div className="patient-form__selector">
      <span className="patient-form__selector-label" id="species-group-label">
        {t('patient.species')}
      </span>
      <div className="patient-form__species patient-form__species-controls">
        <div className="patient-form__common-species" role="radiogroup" aria-labelledby="species-group-label">
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
        {otherPicker}
      </div>
        </div>),
    dentition: (<div className="patient-form__selector">
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
          // Horse and rabbit charts contain adult teeth only.
          disabled={!deciduousOk}
          onClick={() => handleDentitionChange('deciduous')}
        >
          {t('patient.deciduous')}
        </button>
      </div>
        </div>),
    date: (<label className="patient-form__label">
      {t('patient.date')}
      <input dir="ltr"
        type="date"
        className="patient-form__input"
        value={patientInfo.date}
        onChange={handleInputChange('date')}
      />
        </label>),
    complaint: (<div className="patient-form__complaint">
      <label className="patient-form__label" htmlFor={complaintId}>
        {t('patient.complaint')}
      </label>
      <div className="refine-field">
        <CodeField
          id={complaintId}
          multiline
          className="patient-form__textarea"
          placeholder={t('patient.complaintPlaceholder')}
          value={patientInfo.complaint}
          onChange={(value) => onPatientInfoChange('complaint', value)}
        />
        <RefineTextAction value={patientInfo.complaint ?? ''} readOnly={readOnly} onApply={text => onPatientInfoChange('complaint', text)} />
      </div>
        </div>),
  };


  if (layout || patientInfo.practiceChartFields?.some(answer => answer.origin === 'patientLayout')) {
    const answers = patientInfo.practiceChartFields?.filter(answer => answer.origin === 'patientLayout') ?? [];
    const activeLayout = layout ?? defaultPatientLayout(fieldOrder, [...hiddenFields, ...(hideRecheck ? ['recallDate'] : [])]);
    const { sections, customFields } = activeLayout;
    const placed = new Set(sections.flatMap(section => section.fields));
    const recorded = [
      ...PATIENT_BUILTIN_FIELDS.filter(field => !placed.has(field) && field !== 'species' && field !== 'dentition' && !!patientInfo[field]?.trim()),
      ...answers.filter(answer => !placed.has(answer.field.id)).map(answer => answer.field.id),
    ];
    const fields = native ? nativeFields : webFields;
    const renderField = (id: string) => {
      const builtIn = PATIENT_BUILTIN_FIELDS.find(field => field === id);
      if (builtIn && fields[builtIn]) return fields[builtIn];
      if (builtIn === 'recallDate') {
        const control = <span className="patient-form__recall">
          <input dir="ltr" type="date" className="patient-form__input" aria-label={t('patient.recheck')}
            value={patientInfo.recallDate ?? ''} onChange={handleInputChange('recallDate')} />{recallQuick}
        </span>;
        return native ? <FormField as={GROUP_ROW} stacked label={t('patient.recheck')}>{control}</FormField>
          : <label className="patient-form__label">{t('patient.recheck')}{control}</label>;
      }
      if (builtIn === 'ownerName' || builtIn === 'ownerPhone' || builtIn === 'ownerEmail' || builtIn === 'tech') {
        return native ? <FormField label={t(`patient.${builtIn}`)}>{patientLayoutInput(builtIn)}</FormField>
          : <label className="patient-form__label">{t(`patient.${builtIn}`)}{patientLayoutInput(builtIn)}</label>;
      }
      const answer = answers.find(item => item.field.id === id);
      const field = customFields.find(item => item.id === id) ?? answer?.field;
      return field && <PracticeChartFields inline fields={[field]} answers={answer ? [answer] : []}
        readOnly={readOnly} onChange={(definition, value) => onLayoutFieldChange?.(definition, value)} />;
    };
    const renderSection = (id: string, title: string, ids: string[]) => {
      if (!ids.length) return null;
      const children = ids.map(field => <React.Fragment key={field}>{renderField(field)}</React.Fragment>);
      return native ? <FormGroup key={id} header={title}>{children}</FormGroup>
        : <section key={id} className="patient-form__group" aria-label={title}>
          <h3 dir={AUTO_DIRECTION}>{title}</h3>
          <div className="patient-form__layout-grid">{children}</div>
        </section>;
    };
    const recordedGroup = renderSection('recorded', t('patient.layout.recorded'), recorded);
    const pageTitle = t('sections.patient', { ns: 'app' });
    return <div className={native ? 'patient-form patient-form--ios' : 'patient-form'}>
      {native ? <><h2 className="patient-form__section-title">{pageTitle}</h2>{historyAction}</>
        : <SectionHeader title={pageTitle} actions={historyAction} onCustomize={readOnly ? undefined : onCustomize}
          customizeTitle={t('patient.customizeTitle')} />}
      <fieldset className="sidebar-layout__fieldset" disabled={readOnly}>
        {sections.map(section => {
          const group = patientDefaultGroup(section.id);
          return renderSection(section.id, section.label ?? (group === 'identityGroup' ? t('patient.title') : group ? t(`patient.${group}`) : ''), section.fields);
        })}
        {recordedGroup}
      </fieldset>
    </div>;
  }

  // The iOS app: the same fields as inset-grouped label/value rows, and
  // segmented controls for species and dentition.
  if (native) {
    return (
      <div className="patient-form patient-form--ios">
        {/* Customize is in the Chart bar's More menu in the app. */}
        <div className="patient-form__header">
          <h2 className="patient-form__section-title">{t('patient.title')}</h2>
        </div>
        {historyAction}
        <fieldset className="sidebar-layout__fieldset" disabled={readOnly}>
        <FormGroup header={t('ios.form.patient', { ns: 'chart' })}>
          {nativeFields.patientName}
          {nativeFields.patientNumber}
          {nativeFields.date}
          {nativeFields.species}
          {nativeFields.dentition}
        </FormGroup>

        {ownerFields.length > 0 && <FormGroup header={t('ios.form.owner', { ns: 'chart' })}>
          {ownerFields.map(field => <FormField key={field} label={t(`patient.${field}`)}>{patientLayoutInput(field)}</FormField>)}
        </FormGroup>}

        <FormGroup header={t('ios.form.visit', { ns: 'chart' })}>
          {visitFields.map(field => field === 'tech'
            ? <FormField key={field} label={t('patient.tech')}>{patientLayoutInput(field)}</FormField>
            : <FormField key={field} as={GROUP_ROW} stacked label={t('patient.recheck')}>
              <span className="patient-form__recall">
                <input dir="ltr" type="date" className="patient-form__input"
                  aria-label={t('patient.recheck')} value={patientInfo.recallDate ?? ''} onChange={handleInputChange('recallDate')} />
                {recallQuick}
              </span>
            </FormField>)}
        </FormGroup>

        <FormGroup header={t('ios.form.complaint', { ns: 'chart' })}>
          {nativeFields.complaint}
        </FormGroup>
        </fieldset>
      </div>
    );
  }

  return (
    <div className="patient-form">
      <SectionHeader title={t('patient.title')} actions={historyAction} onCustomize={readOnly ? undefined : onCustomize} customizeTitle={t('patient.customizeTitle')} />

      <fieldset className="sidebar-layout__fieldset" disabled={readOnly}>
      <section className="patient-form__group" aria-label={t('patient.identityGroup')}>
      {/* SoCal carries Patient Name + Number; VCA carries Doctor + Tech.
          Both pairs are kept on PatientInfo so values survive a logo flip. */}
      <div className="patient-form__row">
        {webFields.patientName}

        {webFields.patientNumber}


      </div>

      <div className="patient-form__selectors">
        {webFields.species}

        {webFields.dentition}
      </div>      </section>
      {(visibleFields.ownerName || visibleFields.ownerPhone || visibleFields.ownerEmail) && (
        <details className="patient-form__group patient-form__owner" open={ownerExpanded} onToggle={(event) => setOwnerExpanded(event.currentTarget.open)}>
          <summary>{t('patient.ownerGroup')}</summary>
      {/* Pet owner (client) — sits right under the pet's identity, above
          the per-procedure fields. Searchable in My charts. */}
      <div className="patient-form__row">
        {ownerFields.map(field => <label key={field} className="patient-form__label">
          {t(`patient.${field}`)}
          {patientLayoutInput(field)}
        </label>)}
      </div>

        </details>
      )}
      <section className="patient-form__group" aria-labelledby="visit-details-heading">
        <h3 id="visit-details-heading">{t('patient.visitGroup')}</h3>
      <div className="patient-form__row">
        {webFields.date}
        {visitFields.map(field => field === 'tech'
          ? <label key={field} className="patient-form__label">
            {t('patient.tech')}{patientLayoutInput(field)}
          </label>
          : <label key={field} className="patient-form__label">
            {t('patient.recheck')}
            <span className="patient-form__recall">
              <input dir="ltr" type="date" className="patient-form__input"
                value={patientInfo.recallDate ?? ''} onChange={handleInputChange('recallDate')} />
              {recallQuick}
            </span>
          </label>)}
      </div>

      <div className="patient-form__row">
        {webFields.complaint}
      </div>

      </section>
      </fieldset>
    </div>
  );
};
