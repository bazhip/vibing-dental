import { SectionHeader } from './SectionHeader';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { promptDialog, toast, friendlyDetail } from './ui/dialogs';
import { useReportTemplates } from '../hooks/useReportTemplates';
import { ReportTemplatesModal } from './ReportTemplatesModal';

interface SurgeryReportFormProps {
  value: string;
  onChange: (value: string) => void;
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
  cloudActive = true,
  practiceId = '',
  readOnly = false,
}) => {
  const { t } = useTranslation('forms');
  const store = useReportTemplates(practiceId);
  const templatesOn = store.enabled && cloudActive;
  const [manageOpen, setManageOpen] = React.useState(false);

  // Inserting appends (with a blank line) rather than replacing — a
  // visit often stacks several procedures, and appending can never
  // destroy typed text.
  const insertTemplate = (id: string) => {
    if (readOnly) return;
    const tpl = store.templates.find((x) => x.id === id);
    if (!tpl) return;
    const existing = value.trimEnd();
    onChange(existing ? `${existing}\n\n${tpl.body}` : tpl.body);
  };

  // Saving the report as a practice template doesn't change the chart, so
  // it works on a locked chart too.
  const saveCurrentAsTemplate = async () => {
    const name = await promptDialog({
      title: t('report.dialog.title'),
      message: t('report.dialog.message'),
      label: t('report.dialog.label'),
      placeholder: t('report.dialog.placeholder'),
      confirmLabel: t('report.dialog.confirm'),
      validate: (v) => (v.trim() ? null : t('report.dialog.nameRequired')),
    });
    if (name === null) return;
    try {
      await store.create(name.trim(), value);
      toast(t('report.saved', { name: name.trim() }), { kind: 'success' });
    } catch (e) {
      toast(t('report.saveFailed', { error: friendlyDetail(e) }), { kind: 'error' });
    }
  };

  return (
    <div className="patient-form">
      <SectionHeader title={t('report.title')} onCustomize={templatesOn ? () => setManageOpen(true) : undefined} customizeTitle={t('report.customizeTitle')} />
      {templatesOn && (
        <div className="surgery-report__template-bar">
          <select
            className="surgery-report__template-select"
            aria-label={t('report.insertAria')}
            value=""
            disabled={!store.loaded || store.templates.length === 0}
            onChange={(e) => {
              if (e.target.value) insertTemplate(e.target.value);
              e.target.value = '';
            }}
          >
            <option value="" disabled>
              {!store.loaded
                ? t('report.loading')
                : store.templates.length === 0
                ? t('report.none')
                : t('report.insert')}
            </option>
            {store.templates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name.trim() || t('report.untitled')}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="diagram-view__action"
            onClick={saveCurrentAsTemplate}
            disabled={!value.trim()}
            title={t('report.saveTitle')}
            data-lock-exempt
          >
            {t('report.save')}
          </button>

        </div>
      )}
      <textarea
        className="patient-form__textarea surgery-report__textarea"
        aria-label={t('report.textareaAria')}
        placeholder={t('report.placeholder')}
        value={value}
        readOnly={readOnly}
        onChange={(e) => { if (!readOnly) onChange(e.target.value); }}
      />

      {templatesOn && (
        <ReportTemplatesModal
          open={manageOpen}
          onClose={() => setManageOpen(false)}
          store={store}
          draftBody={value}
        />
      )}
    </div>
  );
};
