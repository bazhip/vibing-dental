import React from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { confirmDialog, toast } from './ui/dialogs';
import { useTeam } from '../hooks/useTeam';
import { useReminderTemplate } from '../hooks/useReminderTemplate';
import { useModalFocus } from '../hooks/useModalFocus';
import { useStackLeaveGuard, useStackScreenOptions } from '../ios/Stack';

/** The tokens the reminder template understands (literal, never translated). */
const PLACEHOLDERS = ['{{patient}}', '{{owner}}', '{{practice}}', '{{recheck_date}}'];

interface RemindersModalProps {
  open: boolean;
  onClose: () => void;
  /** 'screen': the body only, as a pushed screen in the iOS app's Settings
   *  tab — Save sits in the navigation bar while there are edits, and Back
   *  asks before discarding them. Default: the dialog. */
  presentation?: 'modal' | 'screen';
}

/**
 * Recheck-reminder settings for the practice: the email template sent to
 * pet owners and whether/when it goes out automatically. Owners edit it;
 * members see it read-only. Sending a reminder for a specific patient
 * happens from My charts.
 */
export const RemindersModal: React.FC<RemindersModalProps> = ({ open, onClose, presentation = 'modal' }) => {
  const { t } = useTranslation('reminders');
  const asScreen = presentation === 'screen';
  const team = useTeam(open);
  const reminder = useReminderTemplate(team.practice?.id ?? '', open, team.role === 'owner');

  const [subject, setSubject] = React.useState('');
  const [body, setBody] = React.useState('');
  const [auto, setAuto] = React.useState(false);
  const [lead, setLead] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [note, setNote] = React.useState('');
  const modalRef = useModalFocus(open && !asScreen);

  React.useEffect(() => {
    if (reminder.loaded) {
      setSubject(reminder.template.subject);
      setBody(reminder.template.body);
      setAuto(reminder.template.auto);
      setLead(reminder.template.leadDays);
    }
  }, [reminder.loaded, reminder.template]);

  const dirty =
    reminder.loaded &&
    (subject !== reminder.template.subject || body !== reminder.template.body ||
      auto !== reminder.template.auto || lead !== reminder.template.leadDays);

  const confirmDiscard = () => confirmDialog({
    title: t('settings.discard.title'),
    message: t('settings.discard.message'),
    confirmLabel: t('settings.discard.confirm'),
    cancelLabel: t('settings.discard.cancel'),
    danger: true,
  });

  // Closing with unsaved template edits asks first (Done, Escape, backdrop).
  const requestClose = React.useCallback(async () => {
    if (dirty && !(await confirmDiscard())) return;
    onClose();
  }, [dirty, onClose, t]);

  // As a pushed screen: Save in the navigation bar while there are edits
  // (owners only); Back asks before discarding them.
  const saveRef = React.useRef<() => Promise<void>>(async () => {});
  const canSave = team.role === 'owner' && dirty;
  useStackLeaveGuard(asScreen ? async () => !dirty || (await confirmDiscard()) : null);
  useStackScreenOptions({
    trailing: asScreen
      ? canSave ? (
          <button type="button" className="ios-glass-button ios-glass-button--prominent" onClick={() => void saveRef.current()} disabled={busy}>
            {t('actions.save', { ns: 'common' })}
          </button>
        ) : null
      : undefined,
  });

  React.useEffect(() => {
    if (!open || asScreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void requestClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, requestClose, asScreen]);

  if (!open) return null;

  const isOwner = team.role === 'owner';

  const save = async () => {
    setBusy(true);
    setError('');
    setNote('');
    try {
      await reminder.save({ subject, body, auto, leadDays: lead });
      toast(t('settings.saved'), { kind: 'success' });
      // The screen stays; the dialog closes.
      if (!asScreen) onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  saveRef.current = save;

  const remindersBody = (
    <>
      <section className="ai-settings-section">
        <p className="ai-settings-blurb">
          {t('settings.blurb')}
          {' '}{PLACEHOLDERS.map((p, i) => <React.Fragment key={p}><code>{p}</code>{i < PLACEHOLDERS.length - 1 ? ' ' : '.'}</React.Fragment>)}
          {' '}{asScreen ? t('reminders.sendFrom', { ns: 'settings' }) : <Trans t={t} i18nKey="settings.blurbTail" components={{ strong: <strong /> }} />}
        </p>

        {!team.loaded ? (
          <p className="practice-logo-empty">{t('settings.loading')}</p>
        ) : !team.practice ? (
          <p className="practice-logo-empty">{asScreen ? t('reminders.settingUp', { ns: 'settings' }) : t('settings.notSetUp')}</p>
        ) : !isOwner ? (
          <p className="practice-logo-empty">{t('settings.ownerOnly')}</p>
        ) : (
          <>
            <label className="patient-form__label" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
              {t('settings.auto')}
            </label>
            <label className="patient-form__label" style={{ marginTop: '0.6rem' }}>
              {t('settings.send')}
              <select
                className="patient-form__input"
                value={lead}
                onChange={(e) => setLead(Number(e.target.value))}
                disabled={!auto}
              >
                <option value={0}>{t('settings.lead.onDate')}</option>
                <option value={3}>{t('settings.lead.days3')}</option>
                <option value={7}>{t('settings.lead.week1')}</option>
                <option value={14}>{t('settings.lead.weeks2')}</option>
                <option value={30}>{t('settings.lead.month1')}</option>
              </select>
            </label>
            <label className="patient-form__label" style={{ marginTop: '0.6rem' }}>
              {t('settings.subject')}
              <input className="patient-form__input" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </label>
            <label className="patient-form__label" style={{ marginTop: '0.6rem' }}>
              {t('settings.message')}
              <textarea className="patient-form__textarea reminder__body" value={body} onChange={(e) => setBody(e.target.value)} />
            </label>

          </>
        )}

        {error && <div className="login-error" role="alert">{error}</div>}
        {note && <div className="login-notice" role="status">{note}</div>}
      </section>
    </>
  );

  if (asScreen) return <div className="ai-settings-body ios-settings-page">{remindersBody}</div>;

  return (
    <div
      className="ai-settings-overlay"
      onMouseDown={(e) => { (e.currentTarget as HTMLElement).dataset.downOnBackdrop = String(e.target === e.currentTarget); }}
      onClick={(e) => { if (e.target === e.currentTarget && (e.currentTarget as HTMLElement).dataset.downOnBackdrop === 'true') void requestClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={t('settings.aria')}
    >
      <div className="ai-settings-modal" ref={modalRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <header className="ai-settings-header">
          <h2>{t('settings.title')}</h2>
          <button type="button" className="pdf-preview-close" onClick={onClose} aria-label={t('actions.close', { ns: 'common' })}>
            ×
          </button>
        </header>
        <div className="ai-settings-body">
          {remindersBody}
        </div>
        <footer className="ai-settings-footer">
          {isOwner && dirty ? (
            <>
              <button type="button" className="diagram-view__action" onClick={() => void requestClose()} disabled={busy}>
                {t('actions.cancel', { ns: 'common' })}
              </button>
              <button type="button" className="entry-grid__button entry-grid__button--topbar" onClick={save} disabled={busy}>
                {busy ? t('settings.saving') : t('actions.save', { ns: 'common' })}
              </button>
            </>
          ) : (
            <button type="button" className="entry-grid__button entry-grid__button--topbar" onClick={onClose} disabled={busy}>
              {t('settings.done')}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
};
