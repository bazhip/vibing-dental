import { useId, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClinicalDictationSource, PatientInfo } from '../types';
import { NOTE_IMAGES_ID, noteTemplateSections, canConfigureNoteInput, changeConsultationLayout, consultationChoices, consultationSectionKey, consultationSections, consultationStarterNameKey, consultationVisitSections, consultationLayoutFor, dischargeLayoutFor, dischargeStarterNameKey, EMPTY_CONSULTATION_LIBRARY, EMPTY_DISCHARGE_LIBRARY, type ConsultationLibrary, type ConsultationSection } from '../utils/consultationTemplates';
import { documentationUrl } from '../help/openDocumentation';
import { formatDate, formatDateTime } from '../i18n/format';
import { VISIT_DOCUMENT_MAX_LENGTH, VISIT_DOCUMENT_TEMPLATES, type VisitDocumentKind } from '../utils/visitDocumentation';
import { SectionHeader } from './SectionHeader';
import { DrugReferenceLookup } from './DrugReferenceLookup';
import type { PreviousMedicationList } from '../utils/consultationMedicationHistory';
import { RefineTextAction } from './RefineTextAction';
import './VisitDocumentationSection.css';

export interface VisitDocumentationSectionProps {
  kind: VisitDocumentKind;
  patientInfo: PatientInfo;
  onChange: (patch: Partial<PatientInfo>) => void;
  readOnly?: boolean;
  renderImages?: (field: { label?: string; guidance?: string }) => React.ReactNode;
  onReview?: () => void;
  reviewLabel?: string;
  children?: ReactNode;
  dictation?: ReactNode;
  discharge?: { library: ConsultationLibrary; historical?: boolean; onTemplates?: () => void };
  consultation?: {
    library: ConsultationLibrary;
    historical?: boolean;
    onExam?: () => void;
    onTemplates?: () => void;
    sources?: ClinicalDictationSource[];
    previousMedicationList?: PreviousMedicationList;
    onCopyMedicationList?: () => void;
  };
}

function VisitChoiceField({ id, describedBy, options, type, value, readOnly, onChange }: {
  id: string;
  describedBy?: string;
  options: readonly string[];
  type: 'radio' | 'multiselect';
  value: string;
  readOnly?: boolean;
  onChange: (next: string) => void;
}) {
  const { t } = useTranslation('visitDocumentation');
  const single = type === 'radio';
  const lines = value ? value.split(/\r\n|\n|\r/u) : [];
  const recordedText = single
    ? !!value && !options.includes(value)
    : lines.some(line => !options.includes(line));
  const selectionDisabled = readOnly || (single && recordedText);

  return <>
    <fieldset className="visit-documentation__option-group" disabled={selectionDisabled}
      aria-labelledby={`${id}-label`} aria-describedby={describedBy}>
      {options.map(option => {
        const checked = single ? value === option : lines.includes(option);
        const next = single ? option : checked
          ? lines.filter(line => line !== option).join('\n')
          : [value, option].filter(Boolean).join('\n');
        return <label className="choice-row visit-documentation__option" key={option}>
          <input type={single ? 'radio' : 'checkbox'} name={id} checked={checked}
            disabled={next.length > VISIT_DOCUMENT_MAX_LENGTH}
            onChange={() => { if (!selectionDisabled && next.length <= VISIT_DOCUMENT_MAX_LENGTH) onChange(next); }} />
          <span dir="auto">{option}</span>
        </label>;
      })}
    </fieldset>
    {recordedText && <div className="visit-documentation__recorded-text">
      <label htmlFor={`${id}-recorded`} id={`${id}-recorded-label`} className="patient-form__label">{t('consultation.templates.builder.recordedText')}</label>
      <textarea id={`${id}-recorded`} className="patient-form__textarea" rows={3} dir="auto"
        value={value} maxLength={VISIT_DOCUMENT_MAX_LENGTH} readOnly={readOnly}
        aria-labelledby={`${id}-label ${id}-recorded-label`}
        aria-describedby={single && !readOnly ? `${id}-recorded-help` : undefined}
        onChange={event => { if (!readOnly) onChange(event.target.value); }} />
      {single && !readOnly && <p className="visit-documentation__helper" id={`${id}-recorded-help`}>
        {t('consultation.templates.builder.choiceLegacyHelp')}
      </p>}
    </div>}
    {single && !readOnly && !!value && !recordedText &&
      <button type="button" className="diagram-view__action" onClick={() => onChange('')}>
        {t('consultation.templates.builder.clearSelection')}
      </button>}
  </>;
}

/** Source-only forms: generated clinical/client reports keep their existing owners. */
export function VisitDocumentationSection({ kind, patientInfo, onChange, readOnly, renderImages, onReview, reviewLabel, children, dictation, consultation, discharge }: VisitDocumentationSectionProps) {
  const { t, i18n } = useTranslation('visitDocumentation');
  const id = useId();
  const [selectedDrug, setSelectedDrug] = useState('');
  const currentMedicationsInput = useRef<HTMLTextAreaElement>(null);
  const isConsultation = kind === 'consultation';
  const language = i18n.resolvedLanguage ?? i18n.language;
  const isDischarge = kind === 'discharge';
  const templateKind = isDischarge ? 'discharge' : 'consultation';
  const library = isDischarge ? discharge?.library ?? EMPTY_DISCHARGE_LIBRARY : consultation?.library ?? EMPTY_CONSULTATION_LIBRARY;
  const layout = isDischarge ? dischargeLayoutFor(patientInfo, library, readOnly || discharge?.historical)
    : consultationLayoutFor(patientInfo, library, readOnly || consultation?.historical);
  const choices = consultationChoices(library, templateKind);
  const hasLayout = isConsultation || (isDischarge && (discharge || patientInfo.dischargeLayout));
  const activeFields = hasLayout ? noteTemplateSections(layout, templateKind) : VISIT_DOCUMENT_TEMPLATES[kind].fields;
  const retainedFields = hasLayout ? consultationVisitSections(patientInfo, layout, templateKind).slice(consultationSections(layout).length) : [];
  const savedVersion = !choices.some(choice => choice.id === layout.id && choice.name === layout.name
    && JSON.stringify(choice.fields) === JSON.stringify(layout.fields)
    && JSON.stringify(choice.sections) === JSON.stringify(layout.sections)
    && JSON.stringify(choice.imagePlacement) === JSON.stringify(layout.imagePlacement)
    && choice.instructions === layout.instructions && choice.detail === layout.detail);
  const layoutName = (option: typeof layout) => {
    const starterKey = isDischarge ? dischargeStarterNameKey(option) : consultationStarterNameKey(option);
    return starterKey ? t(starterKey) : option.name;
  };
  const update = (patch: Partial<PatientInfo>) => {
    if (!readOnly) onChange(patch);
  };
  const previousMedicationList = consultation?.previousMedicationList;
  const medicationTools = <div className="visit-documentation__medication-tools">
    <DrugReferenceLookup selectedName={selectedDrug} />
    {previousMedicationList && <details className="visit-documentation__transcripts">
      <summary>{t('consultation.medications.previous', { date: formatDate(previousMedicationList.date, 'medium', language) })}</summary>
      {previousMedicationList.current && <p>{previousMedicationList.current}</p>}
      {previousMedicationList.decisions && <>
        <span className="patient-form__label">{t('fields.consultationMedicationPlan.label')}</span>
        <p>{previousMedicationList.decisions}</p>
      </>}
      <p className="visit-documentation__helper">{t('consultation.medications.verify')}</p>
      {consultation?.onCopyMedicationList && !patientInfo.consultationCurrentMedications?.trim() && (
        <button type="button" className="diagram-view__action" onClick={() => {
          consultation.onCopyMedicationList?.();
          currentMedicationsInput.current?.focus();
        }}>{t('consultation.medications.copy')}</button>
      )}
    </details>}
  </div>;
  const renderField = (field: ConsultationSection | typeof VISIT_DOCUMENT_TEMPLATES.discharge.fields[number] | typeof VISIT_DOCUMENT_TEMPLATES['gp-exam']['fields'][number]) => {
    const section: ConsultationSection | undefined = 'labelKey' in field ? undefined : field;
    const key = section && consultationSectionKey(section);
    const label = section?.label || ('labelKey' in field ? t(field.labelKey) : key ? t(`${key}.label`) : t('consultation.templates.builder.customSection'));
    const helper = section?.guidance || ('helperKey' in field ? t(field.helperKey) : key ? t(`${key}.helper`) : '');
    const value = patientInfo[field.id] ?? '';
    const locked = readOnly;
    const fieldId = `${id}-${field.id}`;
    const describedBy = helper ? `${fieldId}-help` : undefined;
    const inputType = section && canConfigureNoteInput(section.id, templateKind) ? section.inputType : undefined;
    const options = section?.options;
    const choiceType = options?.length && (inputType === 'radio' || inputType === 'multiselect') ? inputType : undefined;
    const shortInput = inputType === 'shortText' && !/[\r\n]/u.test(value);
    const updateField = (text: string) => update({ [field.id]: text });
    return (
      <div className={section?.level === 2 ? 'visit-documentation__field visit-documentation__field--subsection' : 'visit-documentation__field'} key={field.id}>
        <div className="visit-documentation__field-head">
          {choiceType
            ? <span className="patient-form__label" id={`${fieldId}-label`}>{label}</span>
            : <label className="patient-form__label" htmlFor={fieldId}>{label}</label>}
        </div>
        {helper && <p className="visit-documentation__helper" id={describedBy}>{helper}</p>}
        {field.id === 'consultationCurrentMedications' && medicationTools}
        {choiceType && options ? <VisitChoiceField id={fieldId} describedBy={describedBy} options={options} type={choiceType}
          value={value} readOnly={locked} onChange={updateField} />
          : shortInput ? <input type="text" id={fieldId} className="patient-form__input visit-documentation__short-text"
            value={value} readOnly={locked} dir="auto" aria-describedby={describedBy} maxLength={VISIT_DOCUMENT_MAX_LENGTH}
            onChange={event => updateField(event.target.value)} />
          : <div className="refine-field">
            <textarea id={fieldId} ref={field.id === 'consultationCurrentMedications' ? currentMedicationsInput : undefined} className="patient-form__textarea" rows={field.id === 'gpPhysicalExam' && !isConsultation ? 6 : 3}
              aria-describedby={describedBy} maxLength={VISIT_DOCUMENT_MAX_LENGTH}
              value={value} readOnly={locked}
              onSelect={field.id === 'consultationCurrentMedications' ? event => {
                const input = event.currentTarget;
                const selection = input.value.slice(input.selectionStart, input.selectionEnd).trim();
                setSelectedDrug(selection.length <= 100 && !selection.includes('\n') ? selection : '');
              } : undefined}
              onChange={event => updateField(event.target.value)} />
            <RefineTextAction value={value} readOnly={locked}
              maxLength={VISIT_DOCUMENT_MAX_LENGTH}
              onApply={updateField} />
          </div>}
        {!locked && section?.suggestedText && !value.trim() && <details className="visit-documentation__transcripts">
          <summary>{t('consultation.templates.builder.suggestedText')}</summary>
          <p dir="auto">{section.suggestedText}</p>
          <button className="diagram-view__action" type="button"
            onClick={() => update({ [field.id]: section.suggestedText })}>{t('consultation.templates.builder.useSuggested')}</button>
        </details>}
      </div>
    );
  };
  const review = onReview && (
    <button type="button" className={isConsultation ? 'entry-grid__button visit-documentation__review' : 'entry-grid__button entry-grid__button--topbar visit-documentation__review'}
      onClick={onReview} aria-haspopup="dialog">{reviewLabel ?? t(`${kind}.review`)}</button>
  );
  return (
    <section className={`patient-form visit-documentation visit-documentation--${kind}`} aria-labelledby={`${id}-title`}>
      <div id={`${id}-title`}>
        <SectionHeader title={t(`${kind}.title`)} titleAction={isConsultation ? review : dictation}
          actions={isConsultation ? undefined : review}>
          {t(`${kind}.purpose`)}
        </SectionHeader>
      </div>
      {(isConsultation || discharge) && <>
        <div className="visit-documentation__toolbar">
          <div className="visit-documentation__template">
            <span id={`${id}-template`} className="patient-form__label">{t('consultation.templates.label')}</span>
            {readOnly
              ? <span className="visit-documentation__selected">{layoutName(layout)}</span>
              : <div className={`visit-documentation__choices${choices.length > 6 ? ' visit-documentation__choices--scroll' : ''}`}
                  role="group" aria-labelledby={`${id}-template`}>
                {savedVersion && <button type="button" className="diagram-view__action" aria-pressed="true">
                  {t('consultation.templates.saved', { name: layoutName(layout) })}
                </button>}
                {choices.map(choice => {
                  const selected = !savedVersion && choice.id === layout.id;
                  return <button key={choice.id} type="button" className="diagram-view__action" aria-pressed={selected} dir="auto"
                    onClick={() => {
                      if (!selected) update(changeConsultationLayout(patientInfo, layout, choice, templateKind));
                    }}>{layoutName(choice)}</button>;
                })}
              </div>}
          </div>
          <div className="visit-documentation__tools">
            {(consultation?.onTemplates || discharge?.onTemplates) && <button type="button" className="diagram-view__action"
              onClick={consultation?.onTemplates ?? discharge?.onTemplates} aria-haspopup="dialog">{t('consultation.templates.manage')}</button>}
            <a className="visit-documentation__guide" href={documentationUrl(language, isDischarge ? 'discharge' : 'consultation')}
              target="_blank" rel="noopener noreferrer">{t(isDischarge ? 'discharge.templates.help' : 'consultation.guide')}</a>
          </div>
        </div>
        {isConsultation && (dictation || consultation?.onExam) && <div className="visit-documentation__sources">
          {dictation}
          {consultation?.onExam && <button className="diagram-view__action" type="button"
            onClick={consultation.onExam}>{t('consultation.openExam')}</button>}
        </div>}
      </>}
      {kind === 'discharge' && <div className="visit-documentation__recap">
        <h3>{t('treatmentRecap')}</h3>
        <p>{patientInfo.treatmentReport?.trim() ? patientInfo.treatmentReport : t('noTreatment')}</p>
      </div>}
      {isConsultation && !!consultation?.sources?.length && <details className="visit-documentation__transcripts">
        <summary>{t('consultation.transcripts')}</summary>
        <ul>
          {consultation.sources.map(source => <li key={source.id}>
            <details>
              <summary>{formatDateTime(source.recordedAt, language)}</summary>
              <p dir="auto">{source.transcript}</p>
            </details>
          </li>)}
        </ul>
      </details>}
      <div className="visit-documentation__fields">
        {activeFields.map(field => field.id === NOTE_IMAGES_ID
          ? renderImages && <div className="visit-documentation__images" key={field.id}>{renderImages(field)}</div>
          : renderField({ ...field, id: field.id }))}
      </div>
      {retainedFields.length > 0 && <details key={layout.id} className="visit-documentation__transcripts visit-documentation__retained">
        <summary>{t('consultation.templates.builder.fieldsFromOtherTemplates')}</summary>
        <div className="visit-documentation__fields">{retainedFields.map(renderField)}</div>
      </details>}
      {kind === 'discharge' && <p className="visit-documentation__helper visit-documentation__notice">{t('sourceNotice')}</p>}
      {children}
    </section>
  );
}
