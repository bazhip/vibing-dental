import { useId, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClinicalDictationSource, PatientInfo } from '../types';
import { changeConsultationLayout, consultationChoices, consultationSectionKey, consultationVisitSections, consultationLayoutFor, dischargeLayoutFor, EMPTY_CONSULTATION_LIBRARY, EMPTY_DISCHARGE_LIBRARY, isConsultationStarter, type ConsultationLibrary, type ConsultationSection } from '../utils/consultationTemplates';
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

/** Source-only forms: generated clinical/client reports keep their existing owners. */
export function VisitDocumentationSection({ kind, patientInfo, onChange, readOnly, onReview, reviewLabel, children, dictation, consultation, discharge }: VisitDocumentationSectionProps) {
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
  const savedVersion = !choices.some(choice => choice.id === layout.id && choice.name === layout.name
    && JSON.stringify(choice.fields) === JSON.stringify(layout.fields)
    && JSON.stringify(choice.sections) === JSON.stringify(layout.sections)
    && choice.instructions === layout.instructions && choice.detail === layout.detail);
  const layoutName = (option: typeof layout) =>
    isDischarge && option.id === 'discharge-v1' ? t('discharge.templates.starter') : isConsultationStarter(option.id) ? t(`consultation.templates.starters.${option.id}`) : option.name;
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
    return (
      <div className={section?.level === 2 ? 'visit-documentation__field visit-documentation__field--subsection' : 'visit-documentation__field'} key={field.id}>
        <div className="visit-documentation__field-head">
          <label className="patient-form__label" htmlFor={`${id}-${field.id}`}>{label}</label>
        </div>
        {helper && <p className="visit-documentation__helper" id={`${id}-${field.id}-help`}>{helper}</p>}
        {field.id === 'consultationCurrentMedications' && medicationTools}
        <div className="refine-field">
          <textarea id={`${id}-${field.id}`} ref={field.id === 'consultationCurrentMedications' ? currentMedicationsInput : undefined} className="patient-form__textarea" rows={field.id === 'gpPhysicalExam' && !isConsultation ? 6 : 3}
            aria-describedby={helper ? `${id}-${field.id}-help` : undefined} maxLength={VISIT_DOCUMENT_MAX_LENGTH}
            value={value} readOnly={locked}
            onSelect={field.id === 'consultationCurrentMedications' ? event => {
              const input = event.currentTarget;
              const selection = input.value.slice(input.selectionStart, input.selectionEnd).trim();
              setSelectedDrug(selection.length <= 100 && !selection.includes('\n') ? selection : '');
            } : undefined}
            onChange={event => { if (!locked) update({ [field.id]: event.target.value }); }} />
          <RefineTextAction value={value} readOnly={locked}
            maxLength={VISIT_DOCUMENT_MAX_LENGTH}
            onApply={text => { if (!locked) update({ [field.id]: text }); }} />
        </div>
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
        {(isConsultation || (isDischarge && (discharge || patientInfo.dischargeLayout)) ? consultationVisitSections(patientInfo, layout, templateKind) : VISIT_DOCUMENT_TEMPLATES[kind].fields).map(renderField)}
      </div>
      {kind === 'discharge' && <p className="visit-documentation__helper visit-documentation__notice">{t('sourceNotice')}</p>}
      {children}
    </section>
  );
}
