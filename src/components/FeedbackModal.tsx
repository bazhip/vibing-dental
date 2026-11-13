import React from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../utils/supabaseClient';
import { useModalFocus } from '../hooks/useModalFocus';
import { useBackdropDismiss } from '../hooks/useBackdropDismiss';
import { toast } from './ui/dialogs';
import { useStackScreenOptions } from '../ios/Stack';

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
   *  tab, with Send in the navigation bar. Default: the dialog. */
  presentation?: 'modal' | 'screen';
}

const KIND_OPTIONS: { id: FeedbackKind; label: string }[] = [
  { id: 'bug', label: 'Something’s wrong' },
  { id: 'idea', label: 'Idea' },
  { id: 'other', label: 'Other' },
];

export async function sendFeedback(payload: {
  kind: FeedbackKind;
  message: string;
  transcript?: string;
  section?: string;
}): Promise<void> {
  if (!supabase) throw new Error('Feedback needs an account.');
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

export const FeedbackModal: React.FC<FeedbackModalProps> = ({ onClose, section, transcript, initialKind = 'bug', presentation = 'modal' }) => {
  const asScreen = presentation === 'screen';
  const modalRef = useModalFocus<HTMLFormElement>(!asScreen);
  const backdrop = useBackdropDismiss(onClose);
  const [kind, setKind] = React.useState<FeedbackKind>(initialKind);
  const [message, setMessage] = React.useState('');
  const [attach, setAttach] = React.useState(!!transcript?.trim());
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (asScreen) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || sending) return;
      e.stopImmediatePropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose, sending, asScreen]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!message.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      await sendFeedback({ kind, message: message.trim(), transcript: attach ? transcript : undefined, section });
      toast('Thanks! Your feedback was sent.', { kind: 'success' });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t send. Please try again.');
      setSending(false);
    }
  };

  const feedbackBody = (
    <>
      <div className="feedback-modal__kinds" role="radiogroup" aria-label="Type of feedback">
        {KIND_OPTIONS.map((k) => (
          <button
            key={k.id}
            type="button"
            role="radio"
            aria-checked={kind === k.id}
            className={`feedback-modal__kind${kind === k.id ? ' feedback-modal__kind--on' : ''}`}
            onClick={() => setKind(k.id)}
          >
            {k.label}
          </button>
        ))}
      </div>
      <label className="patient-form__label">
        {kind === 'bug' ? 'What happened?' : kind === 'idea' ? 'What would help?' : 'Your message'}
        <textarea
          className="patient-form__input feedback-modal__message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          maxLength={5000}
          autoFocus
          placeholder={kind === 'bug' ? 'What you did, what you expected, what happened instead…' : ''}
        />
      </label>
      {transcript?.trim() && (
        <label className="feedback-modal__attach">
          <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} />
          Include my dictation transcript
        </label>
      )}
      <p className="feedback-modal__note">Goes straight to the ToothOps developer, who’ll reply to your email.</p>
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

  return ReactDOM.createPortal(
    <div className="ai-settings-overlay feedback-overlay" {...backdrop} role="dialog" aria-modal="true" aria-label="Send feedback">
      <form className="ai-settings-modal feedback-modal" ref={modalRef} tabIndex={-1} onSubmit={submit}>
        <header className="ai-settings-header">
          <h2>Send feedback</h2>
          <button type="button" className="pdf-preview-close" onClick={onClose} aria-label="Close" disabled={sending}>×</button>
        </header>
        <div className="ai-settings-body">
          {feedbackBody}
        </div>
        <footer className="ai-settings-footer">
          <button type="button" className="diagram-view__action" onClick={onClose} disabled={sending}>Cancel</button>
          <button type="submit" className="entry-grid__button entry-grid__button--topbar" disabled={sending || !message.trim()}>
            {sending ? 'Sending…' : 'Send'}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  );
};

/** Send in the navigation bar of the pushed Feedback screen. */
function ScreenSendButton({ disabled, sending, onSend }: { disabled: boolean; sending: boolean; onSend: () => void }) {
  useStackScreenOptions({
    trailing: (
      <button type="button" className="ios-glass-button ios-glass-button--prominent" onClick={onSend} disabled={disabled}>
        {sending ? 'Sending…' : 'Send'}
      </button>
    ),
  });
  return null;
}
