import React from 'react';
import { useTranslation } from 'react-i18next';
import { confirmDialog, friendlyError } from './ui/dialogs';
import { isNativeApp } from '../native/platform';
import { Sheet } from '../ios/Sheet';
import { useModalFocus } from '../hooks/useModalFocus';
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
 * Reuses the AI-settings modal chrome; in the iOS app it is an iOS sheet
 * (Close / Save in its bar, Delete at the end of the form).
 */
export const ReportTemplatesModal: React.FC<ReportTemplatesModalProps> = ({
  open,
  onClose,
  store,
  draftBody = '',
}) => {
  const { t } = useTranslation('library');
  const asSheet = isNativeApp();
  const modalRef = useModalFocus(open && !asSheet);
  // null = editing a new, not-yet-saved template.
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [name, setName] = React.useState('');
  const [body, setBody] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const nameRef = React.useRef<HTMLInputElement>(null);
  // What's saved (or the starting draft): edits against it are unsaved and
  // must not be dropped silently by closing, picking another template or
  // starting a new one.
  const [baseline, setBaseline] = React.useState({ name: '', body: '' });
  const dirty = name !== baseline.name || body !== baseline.body;
  const dirtyRef = React.useRef(dirty);
  dirtyRef.current = dirty;
  const confirmDiscard = React.useCallback(async () => !dirtyRef.current || confirmDialog({
    title: t('ios.sheets.discard.title', { ns: 'common' }),
    confirmLabel: t('ios.sheets.discard.discard', { ns: 'common' }),
    cancelLabel: t('ios.sheets.discard.keep', { ns: 'common' }),
    danger: true,
  }), [t]);
  const busyRef = React.useRef(false);
  const requestClose = React.useCallback(async () => {
    if (busyRef.current) return; // not mid-save
    if (await confirmDiscard()) onClose();
  }, [confirmDiscard, onClose]);
  busyRef.current = busy;

  // Re-seed each open: start on a fresh draft (prefilled from the
  // current report so "save what I just wrote" is one click away).
  React.useEffect(() => {
    if (open) {
      setSelectedId(null);
      setName('');
      setBody(draftBody);
      setBaseline({ name: '', body: draftBody });
      setError('');
      nameRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    if (!open || asSheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void requestClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, requestClose, asSheet]);

  if (!open) return null;

  const pick = async (tpl: ReportTemplate) => {
    if (tpl.id === selectedId || !(await confirmDiscard())) return;
    setSelectedId(tpl.id);
    setName(tpl.name);
    setBody(tpl.body);
    setBaseline({ name: tpl.name, body: tpl.body });
    setError('');
  };

  const clearToNew = () => {
    setSelectedId(null);
    setName('');
    setBody('');
    setBaseline({ name: '', body: '' });
    setError('');
    nameRef.current?.focus();
  };
  const startNew = async () => {
    if (await confirmDiscard()) clearToNew();
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
      // What was saved; anything typed during the save stays (and is unsaved).
      setName((n) => (n === name ? name.trim() : n));
      setBaseline({ name: name.trim(), body });
    } catch (e) {
      setError(friendlyError(e, t('templates.saveFailed')));
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
      clearToNew();
    } catch (e) {
      setError(friendlyError(e, t('templates.deleteFailed')));
    } finally {
      setBusy(false);
    }
  };

  const templatesBody = (
    <>
      <section className="ai-settings-section">
        <div className="report-templates__list-head">
          <span className="patient-form__label">{t('templates.saved')}</span>
          <button type="button" className="diagram-view__action" onClick={() => void startNew()} disabled={busy}>
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
                  onClick={() => void pick(tpl)}
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
    </>
  );

  if (asSheet) {
    return (
      <Sheet
        open
        onClose={onClose}
        title={t('templates.title')}
        cancelLabel={t('actions.close', { ns: 'common' })}
        doneLabel={busy ? t('templates.saving') : selectedId ? t('templates.saveChanges') : t('templates.saveTemplate')}
        onDone={() => void handleSave()}
        doneDisabled={busy}
        confirmDismiss={confirmDiscard}
      >
        <div className="ios-settings-page">
          {templatesBody}
          {selectedId && (
            <div className="ios-settings-page__actions">
              <button
                type="button"
                className="diagram-view__action diagram-view__action--danger"
                onClick={handleDelete}
                disabled={busy}
              >
                {t('actions.delete', { ns: 'common' })}
              </button>
            </div>
          )}
        </div>
      </Sheet>
    );
  }

  return (
    <div className="ai-settings-overlay" onClick={() => void requestClose()} role="dialog" aria-modal="true" aria-label={t('templates.aria')}>
      <div className="ai-settings-modal" ref={modalRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <header className="ai-settings-header">
          <h2>{t('templates.title')}</h2>
          <button type="button" className="pdf-preview-close" onClick={() => void requestClose()} aria-label={t('actions.close', { ns: 'common' })}>
            ×
          </button>
        </header>
        <div className="ai-settings-body">
          {templatesBody}
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
          <button type="button" className="diagram-view__action" onClick={() => void requestClose()} disabled={busy}>
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
