import React from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { supabase } from '../utils/supabaseClient';
import { useModalFocus } from '../hooks/useModalFocus';
import { useBackdropDismiss } from '../hooks/useBackdropDismiss';
import { chooseDialog, toast } from './ui/dialogs';
import { useStackScreenOptions } from '../ios/Stack';
import { Sheet } from '../ios/Sheet';
import { isNativeApp } from '../native/platform';

/**
 * "Send feedback" — a short web form that emails the ToothOps owner (the
 * send-feedback edge function), with the sender as Reply-To. Opened from
 * the settings menu, or from the voice panel with the dictation
 * transcript offered as an attachment.
 */

export type FeedbackKind = 'bug' | 'idea' | 'other';

export interface FeedbackModalProps {
  onClose: () => void;
  /** Page on screen when opened — sent as context. */
  section?: string;
  /** Dictation transcript to offer attaching (voice panel). */
  transcript?: string;
  initialKind?: FeedbackKind;
  /** 'screen': the body only, as a pushed screen in the iOS app's Settings
   *  tab, with Send in the navigation bar. 'sheet': an iOS compose sheet
   *  (Cancel / Send), the app's default (dictation panel). Default on the
   *  website: the dialog. */
  presentation?: 'modal' | 'screen' | 'sheet';
}

const KIND_IDS: FeedbackKind[] = ['bug', 'idea', 'other'];

export async function sendFeedback(payload: {
  kind: FeedbackKind;
  message: string;
  transcript?: string;
  section?: string;
}): Promise<void> {
  if (!supabase) throw new Error(i18n.t('feedback.needsAccount', { ns: 'settings' }));
  const { data, error } = await supabase.functions.invoke('send-feedback', {
    body: {
      kind: payload.kind,
      message: payload.message,
      transcript: payload.transcript ?? '',
      context: {
        section: payload.section ?? '',
        url: window.location.href,
        userAgent: navigator.userAgent,
        screen: `${window.innerWidth}×${window.innerHeight}`,
      },
    },
  });
  if (error) {
    let msg = error.message;
    try {
      const detail = await (error as { context?: Response }).context?.json();
      if (detail?.error) msg = detail.error;
    } catch { /* keep msg */ }
    throw new Error(msg);
  }
  if (data && (data as { error?: string }).error) throw new Error((data as { error: string }).error);
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({ onClose, section, transcript, initialKind = 'bug', presentation }) => {
  const shown = presentation ?? (isNativeApp() ? 'sheet' : 'modal');
  const asScreen = shown === 'screen';
  const asModal = shown === 'modal';
  const { t } = useTranslation('settings');
  const modalRef = useModalFocus<HTMLFormElement>(asModal);
  const backdrop = useBackdropDismiss(onClose);
  const [kind, setKind] = React.useState<FeedbackKind>(initialKind);
  const [message, setMessage] = React.useState('');
  const [attach, setAttach] = React.useState(!!transcript?.trim());
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    // The sheet handles Escape itself.
    if (!asModal) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || sending) return;
      e.stopImmediatePropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose, sending, asModal]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!message.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      await sendFeedback({ kind, message: message.trim(), transcript: attach ? transcript : undefined, section });
      toast(t('feedback.sent'), { kind: 'success' });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('feedback.sendFailed'));
      setSending(false);
    }
  };

  const feedbackBody = (
    <>
      <div className="feedback-modal__kinds" role="radiogroup" aria-label={t('feedback.kindsAria')}>
        {KIND_IDS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={kind === id}
            className={`feedback-modal__kind${kind === id ? ' feedback-modal__kind--on' : ''}`}
            onClick={() => setKind(id)}
          >
            {t(`feedback.kinds.${id}`)}
          </button>
        ))}
      </div>
      <label className="patient-form__label">
        {kind === 'bug' ? t('feedback.promptBug') : kind === 'idea' ? t('feedback.promptIdea') : t('feedback.promptOther')}
        <textarea
          className="patient-form__input feedback-modal__message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          maxLength={5000}
          autoFocus
          placeholder={kind === 'bug' ? t('feedback.bugPlaceholder') : ''}
        />
      </label>
      {transcript?.trim() && (
        <label className="feedback-modal__attach">
          <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} />
          {t('feedback.attach')}
        </label>
      )}
      <p className="feedback-modal__note">{t('feedback.note')}</p>
      {error && <p className="login-error" role="alert">{error}</p>}
    </>
  );

  if (asScreen) {
    return (
      <form className="ai-settings-body ios-settings-page feedback-modal feedback-modal--screen" onSubmit={submit}>
        {feedbackBody}
        <ScreenSendButton disabled={sending || !message.trim()} sending={sending} onSend={() => void submit()} />
      </form>
    );
  }

  if (shown === 'sheet') {
    return (
      <Sheet
        open
        onClose={onClose}
        title={t('ios.settings.feedback', { ns: 'common' })}
        cancelLabel={t('actions.cancel', { ns: 'common' })}
        doneLabel={sending ? t('ios.sheets.sendingBusy', { ns: 'common' }) : t('ios.sheets.reminder.send', { ns: 'common' })}
        onDone={() => void submit()}
        doneDisabled={sending || !message.trim()}
        confirmDismiss={async () =>
          // Not while sending: the result would land on a closed sheet.
          !sending &&
          (!message.trim() ||
            (await chooseDialog({
              title: t('ios.sheets.discard.title', { ns: 'common' }),
              choices: [{ value: 'discard', label: t('ios.sheets.discard.discard', { ns: 'common' }), destructive: true }],
              cancelLabel: t('ios.sheets.discard.keep', { ns: 'common' }),
            })) === 'discard')
        }
        className="feedback-sheet"
      >
        <form className="ai-settings-body ios-settings-page feedback-modal feedback-modal--screen" onSubmit={submit}>
          {feedbackBody}
        </form>
      </Sheet>
    );
  }

  return ReactDOM.createPortal(
    <div className="ai-settings-overlay feedback-overlay" {...backdrop} role="dialog" aria-modal="true" aria-label={t('feedback.title')}>
      <form className="ai-settings-modal feedback-modal" ref={modalRef} tabIndex={-1} onSubmit={submit}>
        <header className="ai-settings-header">
          <h2>{t('feedback.title')}</h2>
          <button type="button" className="pdf-preview-close" onClick={onClose} aria-label={t('actions.close', { ns: 'common' })} disabled={sending}>×</button>
        </header>
        <div className="ai-settings-body">
          {feedbackBody}
        </div>
        <footer className="ai-settings-footer">
          <button type="button" className="diagram-view__action" onClick={onClose} disabled={sending}>{t('actions.cancel', { ns: 'common' })}</button>
          <button type="submit" className="entry-grid__button entry-grid__button--topbar" disabled={sending || !message.trim()}>
            {sending ? t('feedback.sending') : t('feedback.send')}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  );
};

/** Send in the navigation bar of the pushed Feedback screen. */
function ScreenSendButton({ disabled, sending, onSend }: { disabled: boolean; sending: boolean; onSend: () => void }) {
  const { t } = useTranslation('settings');
  useStackScreenOptions({
    trailing: (
      <button type="button" className="ios-glass-button ios-glass-button--prominent" onClick={onSend} disabled={disabled}>
        {sending ? t('feedback.sending') : t('feedback.send')}
      </button>
    ),
  });
  return null;
}
