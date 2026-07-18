import React from 'react';
import { supabase } from '../utils/supabaseClient';
import { useReminderTemplate, fillTemplate } from '../hooks/useReminderTemplate';

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
  const { template, loaded } = useReminderTemplate(practiceId, open);
  const [to, setTo] = React.useState('');
  const [subject, setSubject] = React.useState('');
  const [bodyText, setBodyText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [sent, setSent] = React.useState(false);

  // Prefill once the template has loaded (or when reopened).
  React.useEffect(() => {
    if (!open || !loaded) return;
    const vars = { patient: patientName, owner: ownerName, practice: practiceName, recheckDate };
    setTo(toEmail);
    setSubject(fillTemplate(template.subject, vars));
    setBodyText(fillTemplate(template.body, vars));
    setError('');
    setSent(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loaded]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

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
      setError(e instanceof Error ? e.message : 'Could not send the reminder.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ai-settings-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Send recheck reminder">
      <div className="ai-settings-modal" onClick={(e) => e.stopPropagation()}>
        <header className="ai-settings-header">
          <h2>Send recheck reminder</h2>
          <button type="button" className="pdf-preview-close" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="ai-settings-body">
          {!loaded ? (
            <p className="practice-logo-empty">Loading…</p>
          ) : (
            <>
              <label className="patient-form__label">
                To
                <input
                  type="email"
                  className="patient-form__input"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="owner@example.com"
                />
              </label>
              <label className="patient-form__label" style={{ marginTop: '0.75rem' }}>
                Subject
                <input
                  type="text"
                  className="patient-form__input"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </label>
              <label className="patient-form__label" style={{ marginTop: '0.75rem' }}>
                Message
                <textarea
                  className="patient-form__textarea reminder__body"
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                />
              </label>
              {error && <div className="login-error" role="alert">{error}</div>}
              {sent && <div className="login-notice" role="status">Reminder sent.</div>}
            </>
          )}
        </div>
        <footer className="ai-settings-footer">
          <button type="button" className="diagram-view__action" onClick={onClose} disabled={busy}>Cancel</button>
          <button
            type="button"
            className="entry-grid__button entry-grid__button--topbar"
            onClick={send}
            disabled={busy || !loaded}
          >
            {busy ? 'Sending…' : 'Send reminder'}
          </button>
        </footer>
      </div>
    </div>
  );
};
