import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { PatientInfo } from '../types';
import { VISIT_DOCUMENT_MAX_LENGTH, VISIT_DOCUMENT_TEMPLATES, type VisitDocumentKind } from '../utils/visitDocumentation';
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
}

/** Source-only forms: generated clinical/client reports keep their existing owners. */
export function VisitDocumentationSection({ kind, patientInfo, onChange, readOnly, onReview, reviewLabel, children, dictation }: VisitDocumentationSectionProps) {
  const { t } = useTranslation('visitDocumentation');
  const id = useId();
  const template = VISIT_DOCUMENT_TEMPLATES[kind];
  return (
    <section className={`patient-form visit-documentation${kind === 'gp-exam' ? ' visit-documentation--gp-exam' : ''}`} aria-labelledby={`${id}-title`}>
      <div id={`${id}-title`}>
        <SectionHeader title={t(`${kind}.title`)} titleAction={dictation}
          actions={onReview && <button type="button" className="entry-grid__button entry-grid__button--topbar visit-documentation__review" onClick={onReview}>{reviewLabel ?? t(`${kind}.review`)}</button>}>
          {t(`${kind}.purpose`)}
        </SectionHeader>
      </div>
      {kind === 'discharge' && <div className="visit-documentation__recap">
        <h3>{t('treatmentRecap')}</h3>
        <p>{patientInfo.treatmentReport?.trim() ? patientInfo.treatmentReport : t('noTreatment')}</p>
      </div>}
      <div className="visit-documentation__fields">
        {template.fields.map(field => <div className="visit-documentation__field" key={field.id}>
          <div className="visit-documentation__field-head">
            <label className="patient-form__label" htmlFor={`${id}-${field.id}`}>{t(field.labelKey)}</label>
          </div>
          <p className="visit-documentation__helper" id={`${id}-${field.id}-help`}>{t(field.helperKey)}</p>
          <div className="refine-field">
            <textarea id={`${id}-${field.id}`} className="patient-form__textarea" rows={field.id === 'gpPhysicalExam' ? 6 : 3}
              aria-describedby={`${id}-${field.id}-help`} maxLength={VISIT_DOCUMENT_MAX_LENGTH}
              value={patientInfo[field.id] ?? ''} readOnly={readOnly}
              onChange={event => { if (!readOnly) onChange({ [field.id]: event.target.value }); }} />
              <RefineTextAction value={patientInfo[field.id] ?? ''} readOnly={readOnly} maxLength={VISIT_DOCUMENT_MAX_LENGTH}
                onApply={text => onChange({ [field.id]: text })} />
          </div>
        </div>)}
      </div>
      {kind === 'discharge' && <p className="visit-documentation__helper visit-documentation__notice">{t('sourceNotice')}</p>}
      {children}
    </section>
  );
}
