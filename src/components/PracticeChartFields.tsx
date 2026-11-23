import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { PracticeChartFieldAnswer } from '../types';
import type { SharedPracticeField } from '../utils/practiceChartFields';
import { isChoiceInput } from '../utils/consultationTemplates';
import { VISIT_DOCUMENT_MAX_LENGTH } from '../utils/visitDocumentation';
import { VisitChoiceField } from './VisitChoiceField';
import { RefineTextAction } from './RefineTextAction';

export function PracticeChartFields({ fields, answers, readOnly, onChange, inline = false }: {
  fields: readonly SharedPracticeField[];
  answers: readonly PracticeChartFieldAnswer[];
  readOnly: boolean;
  inline?: boolean;
  onChange: (field: SharedPracticeField, value: string) => void;
}) {
  const { t } = useTranslation('visitDocumentation');
  const id = useId();
  const configured = readOnly && !inline ? [] : fields;
  const rows = [...configured.map(field => answers.find(answer => answer.field.id === field.id)?.field ?? field),
    ...answers.filter(answer => !configured.some(field => field.id === answer.field.id)).map(answer => answer.field)];
  if (!rows.length) return null;
  const inputs = rows.map(field => {
    const fieldId = `${id}-${field.id}`;
    const describedBy = field.guidance ? `${fieldId}-help` : undefined;
    const value = answers.find(answer => answer.field.id === field.id)?.value ?? '';
    const choice = isChoiceInput(field.inputType) && field.options?.length;
    const update = (next: string) => { if (!readOnly) onChange(field, next); };
    return <div key={field.id} className="visit-documentation__field">
      {choice
        ? <span id={`${fieldId}-label`} className="patient-form__label" dir="auto">{field.label}</span>
        : <label htmlFor={fieldId} className="patient-form__label" dir="auto">{field.label}</label>}
      {field.guidance && <p className="visit-documentation__helper" dir="auto" id={describedBy}>{field.guidance}</p>}
      {isChoiceInput(field.inputType) && field.options?.length
        ? <VisitChoiceField type={field.inputType} id={fieldId} describedBy={describedBy} options={field.options}
          value={value} readOnly={readOnly} onChange={update} />
        : field.inputType === 'shortText' && !/[\r\n]/u.test(value)
          ? <input type="text" className="patient-form__input" dir="auto" id={fieldId} aria-describedby={describedBy}
            readOnly={readOnly} maxLength={VISIT_DOCUMENT_MAX_LENGTH} value={value} onChange={event => update(event.target.value)} />
          : <div className="refine-field">
            <textarea className="patient-form__textarea" dir="auto" id={fieldId} aria-describedby={describedBy}
              readOnly={readOnly} rows={3} maxLength={VISIT_DOCUMENT_MAX_LENGTH} value={value} onChange={event => update(event.target.value)} />
            <RefineTextAction value={value} readOnly={readOnly} maxLength={VISIT_DOCUMENT_MAX_LENGTH} onApply={update} />
          </div>}
    </div>;
  });
  if (inline) return <>{inputs}</>;
  return <section className="patient-form visit-documentation practice-field-editor" aria-labelledby={id}>
    <h3 id={id} className="patient-form__section-title">{t('consultation.templates.builder.practiceFields')}</h3>
    <div className="visit-documentation__fields">{inputs}</div>
  </section>;
}
