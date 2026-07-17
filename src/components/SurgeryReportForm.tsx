import React from 'react';
import { useReportTemplates } from '../hooks/useReportTemplates';
import { ReportTemplatesModal } from './ReportTemplatesModal';

interface SurgeryReportFormProps {
  value: string;
  onChange: (value: string) => void;
  /** False in trial mode — templates live in the per-user cloud store,
   *  which needs an account. */
  cloudActive?: boolean;
}

export const SurgeryReportForm: React.FC<SurgeryReportFormProps> = ({
  value,
  onChange,
  cloudActive = true,
}) => {
  const store = useReportTemplates();
  const templatesOn = store.enabled && cloudActive;
  const [manageOpen, setManageOpen] = React.useState(false);

  // Inserting appends (with a blank line) rather than replacing — a
  // visit often stacks several procedures, and appending can never
  // destroy typed text.
  const insertTemplate = (id: string) => {
    const t = store.templates.find((x) => x.id === id);
    if (!t) return;
    const existing = value.trimEnd();
    onChange(existing ? `${existing}\n\n${t.body}` : t.body);
  };

  const saveCurrentAsTemplate = async () => {
    const name = window.prompt(
      'Name this template (it labels it in the insert menu):',
      ''
    );
    if (name === null) return;
    if (!name.trim()) {
      alert('The template needs a name.');
      return;
    }
    try {
      await store.create(name.trim(), value);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not save the template.');
    }
  };

  return (
    <div className="patient-form">
      <div className="patient-form__header surgery-report__header">
        <h2 className="patient-form__section-title">Treatment &amp; Surgery Report</h2>
        {templatesOn && (
          <div className="surgery-report__template-bar">
            <select
              className="surgery-report__template-select"
              aria-label="Insert a report template"
              value=""
              disabled={!store.loaded || store.templates.length === 0}
              onChange={(e) => {
                if (e.target.value) insertTemplate(e.target.value);
                e.target.value = '';
              }}
            >
              <option value="" disabled>
                {!store.loaded
                  ? 'Loading templates…'
                  : store.templates.length === 0
                  ? 'No templates yet'
                  : 'Insert template…'}
              </option>
              {store.templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name.trim() || 'Untitled'}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="diagram-view__action"
              onClick={saveCurrentAsTemplate}
              disabled={!value.trim()}
              title="Save the current report text as a reusable template"
            >
              Save as template
            </button>
            <button
              type="button"
              className="diagram-view__action"
              onClick={() => setManageOpen(true)}
            >
              Edit templates
            </button>
          </div>
        )}
      </div>
      <textarea
        className="patient-form__textarea surgery-report__textarea"
        placeholder="Treatment and surgery details..."
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
