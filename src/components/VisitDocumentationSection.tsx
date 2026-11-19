import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClinicalDictationSource, PatientInfo } from '../types';
import { consultationChoices, consultationLayoutFor, EMPTY_CONSULTATION_LIBRARY, isConsultationStarter, type ConsultationLibrary } from '../utils/consultationTemplates';
import { documentationUrl } from '../help/openDocumentation';
import { formatDateTime } from '../i18n/format';
import { VISIT_DOCUMENT_MAX_LENGTH, VISIT_DOCUMENT_TEMPLATES, visitDocumentField, type VisitDocumentKind } from '../utils/visitDocumentation';
import { SectionHeader } from './SectionHeader';
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
  consultation?: {
    library: ConsultationLibrary;
    historical?: boolean;
    gpExamEnabled?: boolean;
    onExam?: () => void;
    onTemplates?: () => void;
    sources?: ClinicalDictationSource[];
  };
}

/** Source-only forms: generated clinical/client reports keep their existing owners. */
export function VisitDocumentationSection({ kind, patientInfo, onChange, readOnly, onReview, reviewLabel, children, dictation, consultation }: VisitDocumentationSectionProps) {
  const { t, i18n } = useTranslation('visitDocumentation');
  const id = useId();
  const isConsultation = kind === 'consultation';
  const language = i18n.resolvedLanguage ?? i18n.language;
  const library = consultation?.library ?? EMPTY_CONSULTATION_LIBRARY;
  const layout = consultationLayoutFor(patientInfo, library, readOnly || consultation?.historical);
  const choices = consultationChoices(library);
  const savedVersion = !choices.some(choice => choice.id === layout.id && choice.name === layout.name
    && choice.fields.every((field, index) => layout.fields[index] === field));
  const layoutName = (option: typeof layout) =>
    isConsultationStarter(option.id) ? t(`consultation.templates.starters.${option.id}`) : option.name;
  const update = (patch: Partial<PatientInfo>) => {
    if (!readOnly) onChange(patch);
  };
  const renderField = (field: ReturnType<typeof visitDocumentField>) => {
    const locked = readOnly || (isConsultation && field.id.startsWith('gp') && !consultation?.gpExamEnabled);
    return (
      <div className="visit-documentation__field" key={field.id}>
        <div className="visit-documentation__field-head">
          <label className="patient-form__label" htmlFor={`${id}-${field.id}`}>{t(field.labelKey)}</label>
        </div>
        <p className="visit-documentation__helper" id={`${id}-${field.id}-help`}>{t(field.helperKey)}</p>
        <div className="refine-field">
          <textarea id={`${id}-${field.id}`} className="patient-form__textarea" rows={field.id === 'gpPhysicalExam' && !isConsultation ? 6 : 3}
            aria-describedby={`${id}-${field.id}-help`} maxLength={VISIT_DOCUMENT_MAX_LENGTH}
            value={patientInfo[field.id] ?? ''} readOnly={locked}
            onChange={event => { if (!locked) update({ [field.id]: event.target.value }); }} />
          <RefineTextAction value={patientInfo[field.id] ?? ''} readOnly={locked} maxLength={VISIT_DOCUMENT_MAX_LENGTH}
            onApply={text => { if (!locked) update({ [field.id]: text }); }} />
        </div>
      </div>
    );
  };
  const review = onReview && (
    <button type="button" className={isConsultation ? 'entry-grid__button visit-documentation__review' : 'entry-grid__button entry-grid__button--topbar visit-documentation__review'}
      onClick={onReview} aria-haspopup="dialog">{reviewLabel ?? t(`${kind}.review`)}</button>
  );
  const consultFields = layout.fields.filter(field =>
    !field.startsWith('gp') || (consultation?.gpExamEnabled && !readOnly) || patientInfo[field]?.trim());
  return (
    <section className={`patient-form visit-documentation visit-documentation--${kind}`} aria-labelledby={`${id}-title`}>
      <div id={`${id}-title`}>
        <SectionHeader title={t(`${kind}.title`)} titleAction={isConsultation ? review : dictation}
          actions={isConsultation ? undefined : review}>
          {t(`${kind}.purpose`)}
        </SectionHeader>
      </div>
      {isConsultation && <>
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
                      if (!selected) update({ consultationLayout: { id: choice.id, name: choice.name, fields: [...choice.fields] } });
                    }}>{layoutName(choice)}</button>;
                })}
              </div>}
          </div>
          <div className="visit-documentation__tools">
            {consultation?.onTemplates && <button type="button" className="diagram-view__action"
              onClick={consultation.onTemplates} aria-haspopup="dialog">{t('consultation.templates.manage')}</button>}
            <a className="visit-documentation__guide" href={documentationUrl(language, 'consultation')}
              target="_blank" rel="noopener noreferrer">{t('consultation.guide')}</a>
          </div>
        </div>
        {(dictation || consultation?.onExam) && <div className="visit-documentation__sources">
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
        {(isConsultation ? consultFields.map(visitDocumentField) : VISIT_DOCUMENT_TEMPLATES[kind].fields).map(renderField)}
      </div>
      {kind === 'discharge' && <p className="visit-documentation__helper visit-documentation__notice">{t('sourceNotice')}</p>}
      {children}
    </section>
  );
}
