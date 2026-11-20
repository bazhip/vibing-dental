import { PLACEHOLDERS, placeholderTitle, type PlaceholderKey } from '../utils/ownerReportConfig';
import { treatmentCodeSuggestions, treatmentTemplateFields } from '../utils/treatmentTemplateFields';
import { RefineTextAction, RefineTextContext } from './RefineTextAction';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { confirmDialog, friendlyError } from './ui/dialogs';
import { isNativeApp } from '../native/platform';
import { Sheet } from '../ios/Sheet';
import { useModalFocus } from '../hooks/useModalFocus';
import { ReportTemplate, UseReportTemplatesReturn } from '../hooks/useReportTemplates';
import './VisitDocumentationSection.css';

interface ReportTemplatesModalProps {
  open: boolean;
  onClose: () => void;
  store: UseReportTemplatesReturn;
  /** Prefill for a new template (the current report text, if any). */
  draftBody?: string;
  createOnly?: boolean;
  aiEnabled?: boolean;
  onCreated?: (template: ReportTemplate) => void;
  initialTemplateId?: string | null;
  onLeaveGuardChange?: (guard: (() => Promise<boolean>) | null) => void;
}

/**
 * Editor for the practice's saved report templates: pick one from the
 * list (or start a new one), edit its name and text, save or delete.
 * Reuses the AI-settings modal chrome; in the iOS app it is an iOS sheet
 * (Close / Save in its bar).
 */
export const ReportTemplatesModal: React.FC<ReportTemplatesModalProps> = ({
  open,
  onClose,
  store,
  draftBody = '',
  createOnly = false,
  aiEnabled,
  onCreated,
  initialTemplateId = null,
  onLeaveGuardChange,
}) => {
  const { t } = useTranslation(['library', 'visitDocumentation']);
  const refinement = React.useContext(RefineTextContext);
  const refineEnabled = aiEnabled ?? refinement.enabled;
  const asSheet = isNativeApp();
  const modalRef = useModalFocus(open && !asSheet);
  // null = editing a new, not-yet-saved template.
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [name, setName] = React.useState('');
  const [body, setBody] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const nameRef = React.useRef<HTMLInputElement>(null);
  const instructionsId = React.useId();
  const codeMenuId = React.useId();
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = React.useState<number | null>(null);
  const [highlight, setHighlight] = React.useState(-1);
  const suggestions = treatmentCodeSuggestions(body, caret);
  const addCode = (code: PlaceholderKey, start: number, end: number) => {
    const token = `{${code}}`;
    const next = start + token.length;
    setBody(text => text.slice(0, start) + token + text.slice(end));
    setCaret(null);
    setHighlight(-1);
    requestAnimationFrame(() => {
      bodyRef.current?.focus();
      bodyRef.current?.setSelectionRange(next, next);
    });
  };
  // What's saved (or the starting draft): edits against it are unsaved and
  // must not be dropped silently by closing, picking another template or
  // starting a new one.
  const [baseline, setBaseline] = React.useState({ name: '', body: '' });
  const dirty = name !== baseline.name || body !== baseline.body;
  const dirtyRef = React.useRef(dirty);
  dirtyRef.current = dirty;
  const busyRef = React.useRef(false);
  busyRef.current = busy;
  const confirmationPending = React.useRef(false);
  const current = React.useRef({ open, name, body });
  current.current = { open, name, body };
  const confirmDiscard = React.useCallback(async () => {
    if (busyRef.current || confirmationPending.current) return false;
    if (!dirtyRef.current) return true;
    const snapshot = current.current;
    confirmationPending.current = true;
    try {
      const confirmed = await confirmDialog({
        title: t('ios.sheets.discard.title', { ns: 'common' }),
        confirmLabel: t('ios.sheets.discard.discard', { ns: 'common' }),
        cancelLabel: t('ios.sheets.discard.keep', { ns: 'common' }),
        danger: true,
      });
      return confirmed && current.current.open && !busyRef.current &&
        current.current.name === snapshot.name && current.current.body === snapshot.body;
    } finally {
      confirmationPending.current = false;
    }
  }, [t]);
  const requestClose = React.useCallback(async () => {
    if (await confirmDiscard()) onClose();
  }, [confirmDiscard, onClose]);

  React.useEffect(() => {
    if (!open) return;
    onLeaveGuardChange?.(confirmDiscard);
    return () => onLeaveGuardChange?.(null);
  }, [open, confirmDiscard, onLeaveGuardChange]);

  React.useEffect(() => {
    if (!open || (!dirty && !busy)) return;
    const preventLoss = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventLoss);
    return () => window.removeEventListener('beforeunload', preventLoss);
  }, [open, dirty, busy]);

  // Re-seed each open: start on a fresh draft (prefilled from the
  // current report so "save what I just wrote" is one click away).
  React.useEffect(() => {
    if (open) {
      const initial = createOnly ? undefined : store.templates.find((tpl) => tpl.id === initialTemplateId);
      setSelectedId(initial?.id ?? null);
      setName(initial?.name ?? '');
      setBody(initial?.body ?? draftBody);
      setBaseline({ name: initial?.name ?? '', body: initial?.body ?? draftBody });
      setError('');
      setCaret(null);
      setHighlight(-1);
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
    if (busyRef.current) return;
    if (!name.trim()) {
      setError(t('templates.nameRequired'));
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      if (selectedId) {
        await store.update(selectedId, name.trim(), body);
      } else {
        const created = await store.create(name.trim(), body);
        if (createOnly) {
          onCreated?.(created);
          onClose();
          return;
        }
        setSelectedId(created.id);
      }
      // What was saved; anything typed during the save stays (and is unsaved).
      setName((n) => (n === name ? name.trim() : n));
      setBaseline({ name: name.trim(), body });
    } catch (e) {
      setError(friendlyError(e, t('templates.saveFailed')));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId || busyRef.current) return;
    if (!(await confirmDialog({
      title: t('templates.deleteTitle', { name: name.trim() || t('templates.untitled') }),
      message: t('templates.deleteMessage'),
      confirmLabel: t('templates.deleteConfirm'),
      danger: true,
    }))) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      await store.remove(selectedId);
      clearToNew();
    } catch (e) {
      setError(friendlyError(e, t('templates.deleteFailed')));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const fields = treatmentTemplateFields(body);
  const templatesBody = (
    <>
      {!createOnly && <section className="ai-settings-section">
        <div className="treatment-templates__list-head">
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
          <ul className="treatment-templates__list">
            {store.templates.map((tpl) => (
              <li key={tpl.id}>
                <button
                  type="button"
                  className={
                    tpl.id === selectedId
                      ? 'treatment-templates__item treatment-templates__item--active'
                      : 'treatment-templates__item'
                  }
                  aria-pressed={tpl.id === selectedId}
                  onClick={() => void pick(tpl)}
                  disabled={busy}
                >
                  {tpl.name.trim() || t('templates.untitled')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>}

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
        {selectedId && <div className="consultation-library__tools consultation-library__tools--discharge">
          <details key={selectedId}>
            <summary>{t('visitDocumentation:consultation.templates.options')}</summary>
            <div className="consultation-library__menu consultation-library__menu--discharge">
              <button type="button" className="consultation-library__delete" onClick={handleDelete} disabled={busy}>
                {t('actions.delete', { ns: 'common' })}
              </button>
            </div>
          </details>
        </div>}
        <label htmlFor={`${instructionsId}-editor`} className="patient-form__label" style={{ marginTop: '0.75rem' }}>
          {t('templates.bodyLabel')}
        </label>
        <div className="refine-field">
          <textarea
            id={`${instructionsId}-editor`}
            ref={bodyRef}
            className="patient-form__textarea treatment-templates__body"
            aria-describedby={instructionsId}
            aria-controls={suggestions ? codeMenuId : undefined}
            placeholder={t('templates.bodyPlaceholder')}
            value={body}
            onChange={event => {
              setBody(event.target.value);
              setCaret(event.target.selectionStart);
              setHighlight(-1);
            }}
            onClick={() => { setCaret(null); setHighlight(-1); }}
            onBlur={event => {
              if (!(event.relatedTarget instanceof HTMLElement) || !document.getElementById(codeMenuId)?.contains(event.relatedTarget)) {
                setCaret(null);
                setHighlight(-1);
              }
            }}
            onKeyDown={event => {
              if (!suggestions) return;
              const { codes, start, end } = suggestions;
              if (event.key === 'Escape') {
                event.stopPropagation();
                setCaret(null);
                setHighlight(-1);
              } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                setHighlight(index => event.key === 'ArrowDown' ? (index + 1) % codes.length : index <= 0 ? codes.length - 1 : index - 1);
              } else if (event.key === 'Enter' && codes[highlight]) {
                event.preventDefault();
                addCode(codes[highlight], start, end);
              } else if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                setCaret(null);
                setHighlight(-1);
              }
            }}
          />
          {refineEnabled && <RefineTextAction value={body} onApply={setBody} enabled={aiEnabled}
          scopeKey={JSON.stringify([selectedId, name])} readOnly={busy} />}
        </div>
        {suggestions && <ul id={codeMenuId} className="treatment-templates__code-menu" aria-label={t('templates.chartCodes')}
          onBlur={event => {
            if (event.relatedTarget !== bodyRef.current && !event.currentTarget.contains(event.relatedTarget)) setCaret(null);
          }}
          onKeyDown={event => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            setCaret(null);
            setHighlight(-1);
            bodyRef.current?.focus();
          }}>
          {suggestions.codes.map((code, index) => (
            <li key={code}>
              <button type="button" className={index === highlight ? 'treatment-templates__code--highlight' : undefined}
                onMouseDown={event => event.preventDefault()}
                onClick={() => addCode(code, suggestions.start, suggestions.end)}>
                <code>{`{${code}}`}</code> <span>{placeholderTitle(code)}</span>
              </button>
            </li>
          ))}
        </ul>}
        <div id={instructionsId} className="treatment-templates__field-help">
          <div>
            <strong className="patient-form__hint">{t('templates.chartCodes')}</strong>
            <p className="patient-form__hint">{t('templates.chartCodeHelp')}</p>
            <ul className="treatment-templates__code-guide">
              {PLACEHOLDERS.map(code => <li key={code}>
                <button type="button" className="diagram-view__action" title={placeholderTitle(code)}
                  onClick={() => {
                    const input = bodyRef.current;
                    addCode(code, input?.selectionStart ?? body.length, input?.selectionEnd ?? body.length);
                  }}>
                  <code>{`{${code}}`}</code>
                </button>
                <span className="patient-form__hint">{placeholderTitle(code)}</span>
              </li>)}
            </ul>
          </div>
          {fields.length > 0 && <div>
            <span className="patient-form__hint">{t('templates.fieldsInTemplate')}</span>
            <ul className="treatment-templates__fields">
              {fields.map(field => <li key={field}><code>{`{${field}}`}</code></li>)}
            </ul>
          </div>}
        </div>

      </section>

      {error && <div className="login-error" role="alert">{error}</div>}
    </>
  );

  if (asSheet) {
    return (
      <Sheet
        open
        onClose={onClose}
        title={t(createOnly ? 'templates.new' : 'templates.title')}
        cancelLabel={t('actions.close', { ns: 'common' })}
        doneLabel={busy ? t('templates.saving') : selectedId ? t('templates.saveChanges') : t('templates.saveTemplate')}
        onDone={() => void handleSave()}
        doneDisabled={busy}
        confirmDismiss={confirmDiscard}
      >
        <div className="ios-settings-page">
          {templatesBody}
        </div>
      </Sheet>
    );
  }

  return (
    <div className="ai-settings-overlay" onClick={() => void requestClose()} role="dialog" aria-modal="true" aria-label={t(createOnly ? 'templates.new' : 'templates.aria')}>
      <div className="ai-settings-modal" ref={modalRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <header className="ai-settings-header">
          <h2>{t(createOnly ? 'templates.new' : 'templates.title')}</h2>
          <button type="button" className="pdf-preview-close" onClick={() => void requestClose()} aria-label={t('actions.close', { ns: 'common' })}>
            ×
          </button>
        </header>
        <div className="ai-settings-body">
          {templatesBody}
        </div>
        <footer className="ai-settings-footer">
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
