import React from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../utils/supabaseClient';
import { useReminderTemplate, fillTemplate } from '../hooks/useReminderTemplate';
import { useModalFocus } from '../hooks/useModalFocus';
import { isNativeApp } from '../native/platform';
import { Sheet } from '../ios/Sheet';
import { chooseDialog } from './ui/dialogs';

interface ReminderModalProps {
  open: boolean;
  onClose: () => void;
  practiceId: string;
  practiceName: string;
  chartId: string;
  toEmail: string;
  patientName: string;
  ownerName: string;
  recheckDate: string;
}

/**
 * Editable recheck-reminder composer. Prefills To / Subject / Body from
 * the practice template (placeholders filled with this patient's details),
 * lets the user tweak everything, then sends via the send-reminder edge
 * function (Resend).
 */
export const ReminderModal: React.FC<ReminderModalProps> = ({
  open,
  onClose,
  practiceId,
  practiceName,
  chartId,
  toEmail,
  patientName,
  ownerName,
  recheckDate,
}) => {
  const { t } = useTranslation('reminders');
  const { template, loaded } = useReminderTemplate(practiceId, open);
  const [to, setTo] = React.useState('');
  const [subject, setSubject] = React.useState('');
  const [bodyText, setBodyText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [sent, setSent] = React.useState(false);
  // iOS app: a compose sheet (Cancel / Send, swipe down asks before
  // discarding edits); the sheet handles focus and Escape.
  const native = isNativeApp();
  const modalRef = useModalFocus(open && !native);
  const prefilled = React.useRef({ subject: '', body: '' });

  // Prefill once the template has loaded (or when reopened).
  React.useEffect(() => {
    if (!open || !loaded) return;
    const vars = { patient: patientName, owner: ownerName, practice: practiceName, recheckDate };
    setTo(toEmail);
    const filled = { subject: fillTemplate(template.subject, vars), body: fillTemplate(template.body, vars) };
    prefilled.current = filled;
    setSubject(filled.subject);
    setBodyText(filled.body);
    setError('');
    setSent(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loaded]);

  React.useEffect(() => {
    if (!open || native) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, native]);

  if (!open && !native) return null;

  const send = async () => {
    setBusy(true);
    setError('');
    try {
      const { data, error: fnErr } = await supabase!.functions.invoke('send-reminder', {
        body: { to: to.trim(), subject, body: bodyText, chartId },
      });
      if (fnErr) {
        let msg = fnErr.message;
        try {
          const d = await (fnErr as { context?: Response }).context?.json();
          if (d?.error) msg = d.error;
        } catch { /* keep msg */ }
        throw new Error(msg);
      }
      if (data && (data as { error?: string }).error) throw new Error((data as { error: string }).error);
      setSent(true);
      setTimeout(onClose, 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('composer.sendFailed'));
    } finally {
      setBusy(false);
    }
  };

  if (native) {
    const dirty = !sent && (subject !== prefilled.current.subject || bodyText !== prefilled.current.body);
    return (
      <Sheet
        open={open}
        onClose={onClose}
        title={t('composer.title')}
        cancelLabel={t('actions.cancel', { ns: 'common' })}
        doneLabel={busy ? t('ios.sheets.sendingBusy', { ns: 'common' }) : t('ios.sheets.reminder.send', { ns: 'common' })}
        onDone={() => void send()}
        doneDisabled={busy || !loaded || sent}
        confirmDismiss={async () =>
          // Not while sending: the result would land on a closed sheet.
          !busy &&
          (!dirty ||
            (await chooseDialog({
              title: t('ios.sheets.discard.title', { ns: 'common' }),
              choices: [{ value: 'discard', label: t('ios.sheets.discard.discard', { ns: 'common' }), destructive: true }],
              cancelLabel: t('ios.sheets.discard.keep', { ns: 'common' }),
            })) === 'discard')
        }
        className="reminder-sheet"
      >
        {!loaded ? (
          <p className="ios-empty">{t('composer.loading')}</p>
        ) : (
          <div className="ios-form">
            <div className="ios-form-group">
              <label className="ios-field">
                <span className="ios-field__label">{t('composer.to')}</span>
                <input type="email" className="ios-field__input" value={to} readOnly aria-readonly="true" />
              </label>
              <label className="ios-field">
                <span className="ios-field__label">{t('composer.subject')}</span>
                <input type="text" className="ios-field__input" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </label>
              <label className="ios-field ios-field--stacked">
                <span className="ios-field__label">{t('composer.message')}</span>
                <textarea className="ios-field__input reminder__body" value={bodyText} onChange={(e) => setBodyText(e.target.value)} />
              </label>
            </div>
            <p className="ios-form-footer">{t('composer.toHint')}</p>
            {error && <p className="ios-form-error" role="alert">{error}</p>}
            {sent && <p className="ios-form-notice" role="status">{t('composer.sent')}</p>}
          </div>
        )}
      </Sheet>
    );
  }

  return (
    <div className="ai-settings-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={t('composer.aria')}>
      <div className="ai-settings-modal" ref={modalRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <header className="ai-settings-header">
          <h2>{t('composer.title')}</h2>
          <button type="button" className="pdf-preview-close" onClick={onClose} aria-label={t('actions.close', { ns: 'common' })}>×</button>
        </header>
        <div className="ai-settings-body">
          {!loaded ? (
            <p className="practice-logo-empty">{t('composer.loading')}</p>
          ) : (
            <>
              <label className="patient-form__label">
                {t('composer.to')}
                <input
                  type="email"
                  className="patient-form__input"
                  value={to}
                  readOnly
                  aria-readonly="true"
                  title={t('composer.toTitle')}
                />
                <span className="patient-form__hint">
                  {t('composer.toHint')}
                </span>
              </label>
              <label className="patient-form__label" style={{ marginTop: '0.75rem' }}>
                {t('composer.subject')}
                <input
                  type="text"
                  className="patient-form__input"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </label>
              <label className="patient-form__label" style={{ marginTop: '0.75rem' }}>
                {t('composer.message')}
                <textarea
                  className="patient-form__textarea reminder__body"
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                />
              </label>
              {error && <div className="login-error" role="alert">{error}</div>}
              {sent && <div className="login-notice" role="status">{t('composer.sent')}</div>}
            </>
          )}
        </div>
        <footer className="ai-settings-footer">
          <button type="button" className="diagram-view__action" onClick={onClose} disabled={busy}>{t('actions.cancel', { ns: 'common' })}</button>
          <button
            type="button"
            className="entry-grid__button entry-grid__button--topbar"
            onClick={send}
            disabled={busy || !loaded}
          >
            {busy ? t('composer.sending') : t('composer.send')}
          </button>
        </footer>
      </div>
    </div>
  );
};
