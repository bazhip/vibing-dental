import React from 'react';
import { useTranslation } from 'react-i18next';
import { confirmDialog } from './ui/dialogs';
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
  const { t } = useTranslation('library');
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

  const pick = (tpl: ReportTemplate) => {
    setSelectedId(tpl.id);
    setName(tpl.name);
    setBody(tpl.body);
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
      setError(t('templates.nameRequired'));
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
      setError(e instanceof Error ? e.message : t('templates.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    if (!(await confirmDialog({
      title: t('templates.deleteTitle', { name: name.trim() || t('templates.untitled') }),
      message: t('templates.deleteMessage'),
      confirmLabel: t('templates.deleteConfirm'),
      danger: true,
    }))) return;
    setBusy(true);
    setError('');
    try {
      await store.remove(selectedId);
      startNew();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('templates.deleteFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ai-settings-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={t('templates.aria')}>
      <div className="ai-settings-modal" onClick={(e) => e.stopPropagation()}>
        <header className="ai-settings-header">
          <h2>{t('templates.title')}</h2>
          <button type="button" className="pdf-preview-close" onClick={onClose} aria-label={t('actions.close', { ns: 'common' })}>
            ×
          </button>
        </header>
        <div className="ai-settings-body">
          <section className="ai-settings-section">
            <div className="report-templates__list-head">
              <span className="patient-form__label">{t('templates.saved')}</span>
              <button type="button" className="diagram-view__action" onClick={startNew} disabled={busy}>
                {t('templates.new')}
              </button>
            </div>
            {store.templates.length === 0 ? (
              <p className="practice-logo-empty">
                {t('templates.empty')}
              </p>
            ) : (
              <ul className="report-templates__list">
                {store.templates.map((tpl) => (
                  <li key={tpl.id}>
                    <button
                      type="button"
                      className={
                        tpl.id === selectedId
                          ? 'report-templates__item report-templates__item--active'
                          : 'report-templates__item'
                      }
                      onClick={() => pick(tpl)}
                      disabled={busy}
                    >
                      {tpl.name.trim() || t('templates.untitled')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="ai-settings-section">
            <label className="patient-form__label">
              {t('templates.nameLabel')}
              <input
                ref={nameRef}
                type="text"
                className="patient-form__input"
                placeholder={t('templates.namePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="patient-form__label" style={{ marginTop: '0.75rem' }}>
              {t('templates.bodyLabel')}
              <textarea
                className="patient-form__textarea report-templates__body"
                placeholder={t('templates.bodyPlaceholder')}
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
              {t('actions.delete', { ns: 'common' })}
            </button>
          )}
          <button type="button" className="diagram-view__action" onClick={onClose} disabled={busy}>
            {t('actions.close', { ns: 'common' })}
          </button>
          <button
            type="button"
            className="entry-grid__button entry-grid__button--topbar"
            onClick={handleSave}
            disabled={busy}
          >
            {busy ? t('templates.saving') : selectedId ? t('templates.saveChanges') : t('templates.saveTemplate')}
          </button>
        </footer>
      </div>
    </div>
  );
};
