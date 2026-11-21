import { documentationUrl } from '../help/openDocumentation';
import { TemplatePicker } from './TemplatePicker';
import { SectionHeader } from './SectionHeader';
import { RefineTextAction } from './RefineTextAction';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { confirmDialog, toast } from './ui/dialogs';
import { useReportTemplates } from '../hooks/useReportTemplates';
import { ReportTemplatesModal } from './ReportTemplatesModal';
import './VisitDocumentationSection.css';

import type { PlaceholderValues } from '../utils/ownerReportConfig';
import { fillTreatmentTemplate, treatmentTemplateFields } from '../utils/treatmentTemplateFields';

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
  const { t, i18n } = useTranslation(['forms', 'library', 'visitDocumentation']);
  const store = useReportTemplates(practiceId);
  const templatesGuide = documentationUrl(i18n.resolvedLanguage ?? i18n.language, 'treatment');
  const templatesOn = store.enabled && cloudActive;
  const [templateEditor, setTemplateEditor] = React.useState<'manage' | 'new' | null>(null);
  const selectedId = store.templates.find(template => template.id === templateId)?.id
    ?? (value.trim() ? store.templates.find(template => template.body === value && !treatmentTemplateFields(template.body).length)?.id : undefined);
  const live = React.useRef({ value, readOnly, onChange, onApplyTemplate, templatesOn, chartFields });
  live.current = { value, readOnly, onChange, onApplyTemplate, templatesOn, chartFields };
  const mounted = React.useRef(false);
  const applying = React.useRef(false);
  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const applyTemplate = async (id: string) => {
    if (id === selectedId || live.current.readOnly || !live.current.templatesOn || applying.current) return;
    const template = store.templates.find((item) => item.id === id);
    if (!template) return;

    const original = live.current.value;
    applying.current = true;
    try {
      if (original.trim() && !(await confirmDialog({
        title: t('report.replaceTemplateTitle'),
        message: t('report.replaceTemplateMessage'),
        confirmLabel: t('report.replaceTemplate'),
      }))) return;
      if (!mounted.current || live.current.readOnly || !live.current.templatesOn || live.current.value !== original) return;
      const body = fillTreatmentTemplate(template.body, live.current.chartFields);
      if (live.current.onApplyTemplate) live.current.onApplyTemplate(body, id);
      else live.current.onChange(body);
    } finally {
      applying.current = false;
    }
  };

  return (
    <div className="patient-form" data-tour="treatment">
      <SectionHeader title={t('report.title')} />
      {templatesOn && <TemplatePicker label={t('library:templates.saved')}
        choices={store.templates.map(template => ({ id: template.id, label: template.name.trim() || t('report.untitled') }))}
        activeId={selectedId} disabled={readOnly} onSelect={id => void applyTemplate(id)}
        status={!store.loaded || !store.templates.length
          ? <p className="visit-documentation__helper">{t(store.loaded ? 'report.none' : 'report.loading')}</p> : undefined}
        help={{
          label: t('visitDocumentation:consultation.templates.help'),
          href: templatesGuide,
        }}
        actions={<>
          <button type="button" className="diagram-view__action" onClick={() => setTemplateEditor('new')}
            aria-haspopup="dialog" disabled={readOnly || !store.loaded}>
            <span aria-hidden="true">+</span>{' '}{t('report.newTemplate')}
          </button>
          <button type="button" className="diagram-view__action" onClick={() => setTemplateEditor('manage')}
            aria-haspopup="dialog" title={t('report.customizeTitle')}>{t('visitDocumentation:consultation.templates.manage')}</button>
        </>}
      />}
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
          initialTemplateId={selectedId}
        />
      )}
    </div>
  );
};
