import React from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { invokeFunction } from '../utils/edgeFunctions';
import { errorText } from '../utils/apiErrors';
import { usePracticeLanguage } from '../hooks/usePracticeLanguage';
import { useModalFocus } from '../hooks/useModalFocus';
import { isNativeApp } from '../native/platform';
import { Sheet } from '../ios/Sheet';
import { toast, confirmDialog } from './ui/dialogs';

interface OwnerReportEmailModalProps {
  open: boolean;
  validatePdf?: () => Promise<boolean>;
  onClose: () => void;
  chartId: string;
  practiceId: string;
  practiceName: string;
  /** The chart's saved owner email (the server sends to that, not this). */
  toEmail: string;
  patientName: string;
  ownerName: string;
  /** The report PDF already generated for the preview. */
  getPdf: () => { blob: Blob; filename: string } | null;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Email the owner report to the pet owner. Subject and message default to
 * the practice's client language (it's the owner who reads them); the PDF
 * is attached and goes to the owner email saved on the chart.
 */
export const OwnerReportEmailModal: React.FC<OwnerReportEmailModalProps> = ({
  open, onClose, chartId, practiceId, practiceName, toEmail, patientName, ownerName, getPdf, validatePdf,
}) => {
  const { t } = useTranslation('reportui');
  const { language, loaded } = usePracticeLanguage(practiceId || null, open);
  const [subject, setSubject] = React.useState('');
  const [bodyText, setBodyText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const native = isNativeApp();
  const mounted = React.useRef(true);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const sending = React.useRef(false);
  const confirming = React.useRef(false);
  const current = React.useRef({ open, chartId, getPdf, toEmail, subject, bodyText });
  current.current = { open, chartId, getPdf, toEmail, subject, bodyText };
  const modalRef = useModalFocus(open && !native);
  const filename = open ? getPdf()?.filename ?? '' : '';

  React.useEffect(() => {
    if (!open || !loaded) return;
    const ct = i18n.getFixedT(language, 'client');
    const vars = {
      pet: patientName.trim() || ct('reminder.fallback.pet'),
      owner: ownerName.trim() || ct('reminder.fallback.owner'),
      practice: practiceName.trim() || ct('reminder.fallback.practice'),
    };
    setSubject(ct('ownerReportEmail.subject', vars));
    setBodyText(ct('ownerReportEmail.body', vars));
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loaded, language]);

  React.useEffect(() => {
    if (!open || native) return;
    // Capture phase + stop: this composer sits on top of the Documents
    // dialog, and one Escape closed both (even mid-send).
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || confirming.current) return;
      e.stopImmediatePropagation();
      if (!busy) onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose, native, busy]);

  if (!open && !native) return null;

  const send = async () => {
    if (sending.current || !open || !loaded || !subject.trim() || !bodyText.trim()) return;
    const pdf = getPdf();
    if (!pdf) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      confirming.current = true;
      const confirmed = await confirmDialog({
        title: t('email.confirmTitle'),
        message: t('email.confirmMessage', { email: toEmail, filename: pdf.filename }),
        confirmLabel: t('email.send'),
      });
      confirming.current = false;
      const stillCurrent = () => mounted.current && current.current.open &&
        current.current.chartId === chartId && current.current.toEmail === toEmail &&
        current.current.subject === subject && current.current.bodyText === bodyText &&
        current.current.getPdf()?.blob === pdf.blob;
      if (!confirmed || !stillCurrent()) return;
      const pdfBase64 = await blobToBase64(pdf.blob);
      if (validatePdf && !(await validatePdf())) return;
      if (!stillCurrent()) return;
      const res = await invokeFunction<{ to?: string }>('send-owner-report', {
        chartId, subject, body: bodyText, filename: pdf.filename, pdfBase64, expectedRecipient: toEmail,
      });
      if (!mounted.current || current.current.chartId !== chartId) return;
      toast(t('email.sent', { email: res?.to || toEmail }), { kind: 'success' });
      onClose();
    } catch (e) {
      if (!mounted.current || !current.current.open || current.current.chartId !== chartId) return;
      setError(errorText(e, t('email.sendFailed')));
    } finally {
      confirming.current = false;
      sending.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const canSend = loaded && !busy && !!subject.trim() && !!bodyText.trim();

  if (native) {
    return (
      <Sheet
        open={open}
        onClose={onClose}
        title={t('email.title')}
        cancelLabel={t('actions.cancel', { ns: 'common' })}
        doneLabel={busy ? t('composer.sending', { ns: 'reminders' }) : t('email.send')}
        onDone={() => void send()}
        doneDisabled={!canSend}
        confirmDismiss={async () => !busy}
        className="reminder-sheet"
      >
        <div className="ios-form">
          <div className="ios-form-group">
            <label className="ios-field">
              <span className="ios-field__label">{t('composer.to', { ns: 'reminders' })}</span>
              <input type="email" className="ios-field__input" value={toEmail} readOnly aria-readonly="true" />
            </label>
            <label className="ios-field">
              <span className="ios-field__label">{t('composer.subject', { ns: 'reminders' })}</span>
              <input type="text" className="ios-field__input" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </label>
            <label className="ios-field ios-field--stacked">
              <span className="ios-field__label">{t('composer.message', { ns: 'reminders' })}</span>
              <textarea className="ios-field__input reminder__body" value={bodyText} onChange={(e) => setBodyText(e.target.value)} />
            </label>
          </div>
          <p className="ios-form-footer">{t('email.attachment', { filename })}</p>
          {error && <p className="ios-form-error" role="alert">{error}</p>}
        </div>
      </Sheet>
    );
  }

  return (
    <div className="ai-settings-overlay" onClick={() => !busy && onClose()} role="dialog" aria-modal="true" aria-label={t('email.title')}>
      <div className="ai-settings-modal" ref={modalRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <header className="ai-settings-header">
          <h2>{t('email.title')}</h2>
          <button type="button" className="pdf-preview-close" onClick={onClose} disabled={busy} aria-label={t('actions.close', { ns: 'common' })}>×</button>
        </header>
        <div className="ai-settings-body">
          <label className="patient-form__label">
            {t('composer.to', { ns: 'reminders' })}
            <input type="email" className="patient-form__input" value={toEmail} readOnly aria-readonly="true" />
            <span className="patient-form__hint">{t('email.toHint')}</span>
          </label>
          <label className="patient-form__label" style={{ marginTop: '0.75rem' }}>
            {t('composer.subject', { ns: 'reminders' })}
            <input type="text" className="patient-form__input" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label className="patient-form__label" style={{ marginTop: '0.75rem' }}>
            {t('composer.message', { ns: 'reminders' })}
            <textarea className="patient-form__textarea reminder__body" value={bodyText} onChange={(e) => setBodyText(e.target.value)} />
          </label>
          <p className="patient-form__hint">{t('email.attachment', { filename })}</p>
          {error && <div className="login-error" role="alert">{error}</div>}
        </div>
        <footer className="ai-settings-footer">
          <button type="button" className="diagram-view__action" onClick={onClose} disabled={busy}>{t('actions.cancel', { ns: 'common' })}</button>
          <button type="button" className="entry-grid__button entry-grid__button--topbar" onClick={send} disabled={!canSend}>
            {busy ? t('composer.sending', { ns: 'reminders' }) : t('email.send')}
          </button>
        </footer>
      </div>
    </div>
  );
};
