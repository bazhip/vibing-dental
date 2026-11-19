import { SectionHeader } from './SectionHeader';
import { RefineTextAction } from './RefineTextAction';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { confirmDialog, promptDialog, toast } from './ui/dialogs';
import { useReportTemplates } from '../hooks/useReportTemplates';
import { ReportTemplatesModal } from './ReportTemplatesModal';

import type { PlaceholderValues } from '../utils/ownerReportConfig';
import { fillTreatmentTemplate, treatmentChartFieldValue, treatmentTemplateFields } from '../utils/treatmentTemplateFields';

interface SurgeryReportFormProps {
  value: string;
  onChange: (value: string) => void;
  templateId?: string;
  chartFields?: PlaceholderValues;
  onApplyTemplate?: (value: string, id: string) => void;
  /** False in trial mode — templates live in the per-user cloud store,
   *  which needs an account. */
  cloudActive?: boolean;
  /** Stamp new templates with the practice so teammates share them. */
  practiceId?: string;
  /** Lock visit text while leaving shared template management available. */
  readOnly?: boolean;
}

export const SurgeryReportForm: React.FC<SurgeryReportFormProps> = ({
  value,
  onChange,
  templateId,
  chartFields,
  onApplyTemplate,
  cloudActive = true,
  practiceId = '',
  readOnly = false,
}) => {
  const { t } = useTranslation(['forms', 'library']);
  const store = useReportTemplates(practiceId);
  const templatesOn = store.enabled && cloudActive;
  const [templateEditor, setTemplateEditor] = React.useState<'manage' | 'new' | null>(null);
  const selectedId = value.trim()
    ? templateId ?? store.templates.find(template => template.body === value && !treatmentTemplateFields(template.body).length)?.id
    : undefined;
  const live = React.useRef({ value, readOnly, onChange, onApplyTemplate, templatesOn });
  live.current = { value, readOnly, onChange, onApplyTemplate, templatesOn };
  const mounted = React.useRef(false);
  const filling = React.useRef(false);
  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const applyTemplate = async (id: string) => {
    if (id === selectedId || live.current.readOnly || !live.current.templatesOn || filling.current) return;
    const template = store.templates.find((item) => item.id === id);
    if (!template) return;

    const original = live.current.value;
    const fields = treatmentTemplateFields(template.body);
    const values = new Map<string, string>();
    const canApply = () => mounted.current && !live.current.readOnly && live.current.templatesOn && live.current.value === original;
    filling.current = true;
    try {
      if (original.trim() && !(await confirmDialog({
        title: t('report.replaceTemplateTitle'),
        message: t('report.replaceTemplateMessage'),
        confirmLabel: t('report.replaceTemplate'),
      }))) return;
      for (const field of fields) {
        if (!canApply()) return;
        const recorded = treatmentChartFieldValue(field, chartFields);
        if (recorded) {
          values.set(field, recorded);
          continue;
        }
        const answer = await promptDialog({
          title: t('report.fillField'),
          label: field,
          confirmLabel: t('report.fieldContinue'),
          validate: (text) => text.trim() ? null : t('report.fieldRequired'),
        });
        if (answer === null) return;
        values.set(field, answer.trim());
      }
      if (!canApply()) return;
      const body = fillTreatmentTemplate(template.body, values);
      if (live.current.onApplyTemplate) live.current.onApplyTemplate(body, id);
      else live.current.onChange(body);
    } finally {
      filling.current = false;
    }
  };

  return (
    <div className="patient-form">
      <SectionHeader title={t('report.title')} onCustomize={templatesOn ? () => setTemplateEditor('manage') : undefined} customizeTitle={t('report.customizeTitle')} />
      {templatesOn && <div className="surgery-report__tools">
        <span className="patient-form__label surgery-report__templates-label">{t('library:templates.saved')}</span>
        <div className="surgery-report__actions">
          <button type="button" className="diagram-view__action" onClick={() => setTemplateEditor('new')} disabled={readOnly || !store.loaded}>
            <span aria-hidden="true">+</span>{' '}{t('report.newTemplate')}
          </button>
        </div>
        {!store.loaded || !store.templates.length
          ? <p className="patient-form__hint surgery-report__templates-empty">{t(store.loaded ? 'report.none' : 'report.loading')}</p>
          : <ul className="surgery-report__templates" aria-label={t('library:templates.saved')}>
              {store.templates.map(template => (
                <li key={template.id}>
                  <button type="button" className="diagram-view__action" disabled={readOnly}
                    aria-pressed={selectedId === template.id} onClick={() => void applyTemplate(template.id)}>
                    {template.name.trim() || t('report.untitled')}
                  </button>
                </li>
              ))}
            </ul>}
      </div>}
      <div className="refine-field">
        <textarea
          className="patient-form__textarea surgery-report__textarea"
          aria-label={t('report.textareaAria')}
          placeholder={t('report.placeholder')}
          value={value}
          disabled={readOnly}
          onChange={(e) => { if (!readOnly) onChange(e.target.value); }}
        />
        <RefineTextAction value={value} onApply={onChange} readOnly={readOnly} />
      </div>

      {templatesOn && (
        <ReportTemplatesModal
          open={templateEditor !== null}
          createOnly={templateEditor === 'new'}
          onClose={() => setTemplateEditor(null)}
          onCreated={(template) => toast(t('report.saved', { name: template.name }), { kind: 'success' })}
          store={store}
          draftBody={templateEditor === 'manage' ? value : undefined}
        />
      )}
    </div>
  );
};
