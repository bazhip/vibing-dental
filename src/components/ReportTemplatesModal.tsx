import React from 'react';
import { ReportTemplate, UseReportTemplatesReturn } from '../hooks/useReportTemplates';

interface ReportTemplatesModalProps {
  open: boolean;
  onClose: () => void;
  store: UseReportTemplatesReturn;
  /** Prefill for a new template (the current report text, if any). */
  draftBody?: string;
}

/**
 * Editor for the practice's saved report templates: pick one from the
 * list (or start a new one), edit its name and text, save or delete.
 * Reuses the AI-settings modal chrome.
 */
export const ReportTemplatesModal: React.FC<ReportTemplatesModalProps> = ({
  open,
  onClose,
  store,
  draftBody = '',
}) => {
  // null = editing a new, not-yet-saved template.
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [name, setName] = React.useState('');
  const [body, setBody] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const nameRef = React.useRef<HTMLInputElement>(null);

  // Re-seed each open: start on a fresh draft (prefilled from the
  // current report so "save what I just wrote" is one click away).
  React.useEffect(() => {
    if (open) {
      setSelectedId(null);
      setName('');
      setBody(draftBody);
      setError('');
      nameRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const pick = (t: ReportTemplate) => {
    setSelectedId(t.id);
    setName(t.name);
    setBody(t.body);
    setError('');
  };

  const startNew = () => {
    setSelectedId(null);
    setName('');
    setBody('');
    setError('');
    nameRef.current?.focus();
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Give the template a name — it labels it in the insert menu.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (selectedId) {
        await store.update(selectedId, name.trim(), body);
      } else {
        const created = await store.create(name.trim(), body);
        setSelectedId(created.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the template.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    if (!window.confirm(`Delete the template "${name.trim() || 'Untitled'}"? This cannot be undone.`)) return;
    setBusy(true);
    setError('');
    try {
      await store.remove(selectedId);
      startNew();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the template.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ai-settings-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Report templates">
      <div className="ai-settings-modal" onClick={(e) => e.stopPropagation()}>
        <header className="ai-settings-header">
          <h2>Report templates</h2>
          <button type="button" className="pdf-preview-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="ai-settings-body">
          <section className="ai-settings-section">
            <div className="report-templates__list-head">
              <span className="patient-form__label">Saved templates</span>
              <button type="button" className="diagram-view__action" onClick={startNew} disabled={busy}>
                New template
              </button>
            </div>
            {store.templates.length === 0 ? (
              <p className="practice-logo-empty">
                No templates yet — write one below and save it, or use
                "Save as template" on the Treatment Report section.
              </p>
            ) : (
              <ul className="report-templates__list">
                {store.templates.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className={
                        t.id === selectedId
                          ? 'report-templates__item report-templates__item--active'
                          : 'report-templates__item'
                      }
                      onClick={() => pick(t)}
                      disabled={busy}
                    >
                      {t.name.trim() || 'Untitled'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="ai-settings-section">
            <label className="patient-form__label">
              Template name
              <input
                ref={nameRef}
                type="text"
                className="patient-form__input"
                placeholder="e.g. Routine cleaning (feline)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="patient-form__label" style={{ marginTop: '0.75rem' }}>
              Report text
              <textarea
                className="patient-form__textarea report-templates__body"
                placeholder="The report text inserted into Treatment & Surgery Report…"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </label>
          </section>

          {error && <div className="login-error" role="alert">{error}</div>}
        </div>
        <footer className="ai-settings-footer">
          {selectedId && (
            <button
              type="button"
              className="diagram-view__action diagram-view__action--danger"
              onClick={handleDelete}
              disabled={busy}
            >
              Delete
            </button>
          )}
          <button type="button" className="diagram-view__action" onClick={onClose} disabled={busy}>
            Close
          </button>
          <button
            type="button"
            className="entry-grid__button entry-grid__button--topbar"
            onClick={handleSave}
            disabled={busy}
          >
            {busy ? 'Saving…' : selectedId ? 'Save changes' : 'Save template'}
          </button>
        </footer>
      </div>
    </div>
  );
};
