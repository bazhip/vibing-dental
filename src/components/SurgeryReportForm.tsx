import React from 'react';
import { useTranslation } from 'react-i18next';
import { promptDialog, toast, friendlyError } from './ui/dialogs';
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
}

export const SurgeryReportForm: React.FC<SurgeryReportFormProps> = ({
  value,
  onChange,
  cloudActive = true,
  practiceId = '',
}) => {
  const { t } = useTranslation('forms');
  const store = useReportTemplates(practiceId);
  const templatesOn = store.enabled && cloudActive;
  const [manageOpen, setManageOpen] = React.useState(false);

  // Inserting appends (with a blank line) rather than replacing — a
  // visit often stacks several procedures, and appending can never
  // destroy typed text.
  const insertTemplate = (id: string) => {
    const tpl = store.templates.find((x) => x.id === id);
    if (!tpl) return;
    const existing = value.trimEnd();
    onChange(existing ? `${existing}\n\n${tpl.body}` : tpl.body);
  };

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
      toast(t('report.saveFailed', { error: friendlyError(e) }), { kind: 'error' });
    }
  };

  return (
    <div className="patient-form">
      <div className="patient-form__header surgery-report__header">
        <h2 className="patient-form__section-title">{t('report.title')}</h2>
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
            >
              {t('report.save')}
            </button>
            <button
              type="button"
              className="diagram-view__action"
              onClick={() => setManageOpen(true)}
            >
              {t('report.edit')}
            </button>
          </div>
        )}
      </div>
      <textarea
        className="patient-form__textarea surgery-report__textarea"
        aria-label={t('report.textareaAria')}
        placeholder={t('report.placeholder')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
