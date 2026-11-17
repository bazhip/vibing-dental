import React from 'react';
import { useTranslation } from 'react-i18next';
import type { FailCode, ResultRow } from '../../hooks/usePimsSend';

/** A per-field failure. Codes that are also whole-send refusals get a per-field text, which says
 *  to check ezyVet instead of trying again (trying again would resend the fields already written). */
const rowErrorKey = (code: FailCode) =>
  code === 'extension_error' || code === 'not_writable' || code === 'patient_changed'
    ? (`pims:errors.item_${code}` as const)
    : (`pims:errors.${code}` as const);

/** The "copy diagnostic report" link. */
export const DiagnosticLink: React.FC<{ onCopy: () => void }> = ({ onCopy }) => {
  const { t } = useTranslation(['pims']);
  return (
    <button type="button" className="pims-dialog__link" onClick={onCopy}>
      {t('pims:actions.copyDiagnostic')}
    </button>
  );
};

interface SendResultsProps {
  rows: ResultRow[];
  stampFailed: boolean;
  /** Pre-formatted "sent on" date, or null when unknown. */
  sentOn: string | null;
  onCopyDiagnostic: () => void;
}

/** What happened to each field, plus the diagnostic link. */
export const SendResults: React.FC<SendResultsProps> = ({ rows, stampFailed, sentOn, onCopyDiagnostic }) => {
  const { t } = useTranslation(['pims']);
  const heading = React.useRef<HTMLHeadingElement>(null);
  const summaryId = React.useId();
  React.useEffect(() => { heading.current?.focus(); }, []);
  const saved = rows.filter((row) => row.code === null).length;
  return (
    <>
      <h3 ref={heading} tabIndex={-1} aria-describedby={summaryId} className="pims-dialog__subtitle">{t('pims:results.title')}</h3>
      <p id={summaryId} role="status" aria-live="polite" aria-atomic="true">
        {t('pims:results.summary', { saved, attention: rows.length - saved })}
      </p>
      <ul className="pims-dialog__results">
        {rows.map((r, i) => (
          <li key={`${r.fieldTitle}-${i}`} className={r.code ? 'pims-dialog__result--failed' : 'pims-dialog__result--ok'}>
            <strong>{r.fieldTitle}</strong>
            {r.code
              ? <span>{t(rowErrorKey(r.code))}</span>
              : <span><span aria-hidden="true">✓ </span>{t('pims:results.saved')}</span>}
          </li>
        ))}
      </ul>
      {stampFailed && <p className="login-error" role="alert">{t('pims:results.stampFailed')}</p>}
      {sentOn && <p className="patient-form__hint">{t('pims:dialog.sentOn', { date: sentOn })}</p>}
      <DiagnosticLink onCopy={onCopyDiagnostic} />
    </>
  );
};
