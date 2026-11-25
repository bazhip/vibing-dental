import React from 'react';
import { useTranslation } from 'react-i18next';
import { documentationUrl } from '../help/openDocumentation';
import { useReportTemplates } from '../hooks/useReportTemplates';
import type { PlaceholderValues } from '../utils/ownerReportConfig';
import { fillTreatmentTemplate, treatmentTemplateFields } from '../utils/treatmentTemplateFields';
import { ReportTemplatesModal } from './ReportTemplatesModal';
import { TemplatePicker } from './TemplatePicker';
import { confirmDialog, toast } from './ui/dialogs';

interface Props {
  kind: 'radiology' | 'ct';
  value: string;
  templateId?: string;
  chartFields?: PlaceholderValues;
  practiceId?: string;
  readOnly?: boolean;
  onApply: (body: string, id: string) => void;
}

/** Saved-template picker for the radiographic and CT report editors. */
export function ImagingReportTemplates({ kind, value, templateId, chartFields, practiceId = '', readOnly = false, onApply }: Props) {
  const { t, i18n } = useTranslation(['app', 'library', 'visitDocumentation']);
  const store = useReportTemplates(practiceId, kind);
  const guide = documentationUrl(i18n.resolvedLanguage ?? i18n.language, 'imaging');
  const [editor, setEditor] = React.useState(false);
  const selectedId = store.templates.find(template => template.id === templateId)?.id
    ?? (value.trim() ? store.templates.find(template => template.body === value && !treatmentTemplateFields(template.body).length)?.id : undefined);
  const live = React.useRef({ value, readOnly, chartFields, onApply });
  live.current = { value, readOnly, chartFields, onApply };
  const mounted = React.useRef(false);
  const applying = React.useRef(false);
  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const apply = async (id: string) => {
    if (id === selectedId || live.current.readOnly || applying.current) return;
    const template = store.templates.find(item => item.id === id);
    if (!template) return;
    const original = live.current.value;
    applying.current = true;
    try {
      if (original.trim() && !(await confirmDialog({
        title: t(kind === 'ct' ? 'imagingTemplates.replaceTitleCt' : 'imagingTemplates.replaceTitleRadiology'),
        message: t('imagingTemplates.replaceMessage'),
        confirmLabel: t('imagingTemplates.replace'),
      }))) return;
      if (!mounted.current || live.current.readOnly || live.current.value !== original) return;
      live.current.onApply(fillTreatmentTemplate(template.body, live.current.chartFields), id);
    } finally {
      applying.current = false;
    }
  };

  return <>
    <TemplatePicker label={t('library:templates.saved')}
      choices={store.templates.map(template => ({ id: template.id, label: template.name.trim() || t('imagingTemplates.untitled') }))}
      activeId={selectedId} disabled={readOnly} onSelect={id => void apply(id)}
      status={!store.loaded || !store.templates.length
        ? <p className="visit-documentation__helper">{t(store.loaded ? 'imagingTemplates.none' : 'imagingTemplates.loading')}</p> : undefined}
      help={{ label: t('visitDocumentation:consultation.templates.help'), href: guide }}
      actions={<button type="button" className="diagram-view__action" onClick={() => setEditor(true)} aria-haspopup="dialog"
        title={t('imagingTemplates.manageTitle')}>{t('visitDocumentation:consultation.templates.manage')}</button>} />
    <ReportTemplatesModal kind={kind} open={editor} onClose={() => setEditor(false)} store={store} draftBody={value}
      initialTemplateId={selectedId}
      onCreated={template => toast(t('imagingTemplates.saved', { name: template.name }), { kind: 'success' })} />
  </>;
}
