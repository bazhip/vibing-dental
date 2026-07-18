import React from 'react';
import { useTeam } from '../hooks/useTeam';
import { useReminderTemplate } from '../hooks/useReminderTemplate';
import { useModalFocus } from '../hooks/useModalFocus';

interface RemindersModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Recheck-reminder settings for the practice: the email template sent to
 * pet owners and whether/when it goes out automatically. Owners edit it;
 * members see it read-only. Sending a reminder for a specific patient
 * happens from My charts.
 */
export const RemindersModal: React.FC<RemindersModalProps> = ({ open, onClose }) => {
  const team = useTeam(open);
  const reminder = useReminderTemplate(team.practice?.id ?? '', open);

  const [subject, setSubject] = React.useState('');
  const [body, setBody] = React.useState('');
  const [auto, setAuto] = React.useState(false);
  const [lead, setLead] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [note, setNote] = React.useState('');
  const modalRef = useModalFocus(open);

  React.useEffect(() => {
    if (reminder.loaded) {
      setSubject(reminder.template.subject);
      setBody(reminder.template.body);
      setAuto(reminder.template.auto);
      setLead(reminder.template.leadDays);
    }
  }, [reminder.loaded, reminder.template]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isOwner = team.role === 'owner';

  const save = async () => {
    setBusy(true);
    setError('');
    setNote('');
    try {
      await reminder.save({ subject, body, auto, leadDays: lead });
      setNote('Reminder settings saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the reminder settings.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ai-settings-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Recheck reminders">
      <div className="ai-settings-modal" ref={modalRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <header className="ai-settings-header">
          <h2>Recheck reminders</h2>
          <button type="button" className="pdf-preview-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="ai-settings-body">
          <section className="ai-settings-section">
            <p className="ai-settings-blurb">
              Email the pet owner when a recheck is due. Placeholders:
              {' '}<code>{'{{patient}}'}</code> <code>{'{{owner}}'}</code>{' '}
              <code>{'{{practice}}'}</code> <code>{'{{recheck_date}}'}</code>.
              {' '}Send a reminder for one patient from <strong>My charts</strong>.
            </p>

            {!team.loaded ? (
              <p className="practice-logo-empty">Loading…</p>
            ) : !team.practice ? (
              <p className="practice-logo-empty">Your practice is being set up — reload in a moment.</p>
            ) : !isOwner ? (
              <p className="practice-logo-empty">Only a practice owner can change the reminder template.</p>
            ) : (
              <>
                <label className="patient-form__label" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                  <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
                  Automatically email owners
                </label>
                <label className="patient-form__label" style={{ marginTop: '0.6rem' }}>
                  Send
                  <select
                    className="patient-form__input"
                    value={lead}
                    onChange={(e) => setLead(Number(e.target.value))}
                    disabled={!auto}
                  >
                    <option value={0}>On the recheck date</option>
                    <option value={3}>3 days before</option>
                    <option value={7}>1 week before</option>
                    <option value={14}>2 weeks before</option>
                    <option value={30}>1 month before</option>
                  </select>
                </label>
                <label className="patient-form__label" style={{ marginTop: '0.6rem' }}>
                  Subject
                  <input className="patient-form__input" value={subject} onChange={(e) => setSubject(e.target.value)} />
                </label>
                <label className="patient-form__label" style={{ marginTop: '0.6rem' }}>
                  Message
                  <textarea className="patient-form__textarea reminder__body" value={body} onChange={(e) => setBody(e.target.value)} />
                </label>
                <div className="practice-logo-actions" style={{ marginTop: '0.6rem' }}>
                  <button type="button" className="diagram-view__action" disabled={busy} onClick={save}>
                    Save reminder settings
                  </button>
                </div>
              </>
            )}

            {error && <div className="login-error" role="alert">{error}</div>}
            {note && <div className="login-notice" role="status">{note}</div>}
          </section>
        </div>
        <footer className="ai-settings-footer">
          <button type="button" className="entry-grid__button entry-grid__button--topbar" onClick={onClose} disabled={busy}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
};
