import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

/** What the visitor is about to do; each action has its own full sentence in the catalog. */
export type LegalAction = 'signingUp' | 'continuing' | 'creatingAccount' | 'signingIn' | 'activating';

/** Pass these (not string literals) from extracted screens: the lint treats a literal prop as UI text. */
export const LEGAL_ACTION = {
  signingUp: 'signingUp',
  continuing: 'continuing',
  creatingAccount: 'creatingAccount',
  signingIn: 'signingIn',
  activating: 'activating',
} as const satisfies Record<LegalAction, LegalAction>;

/**
 * Small print saying the legal documents are English-only. Rendered for
 * non-English languages only, once per surface that links to them.
 */
export const EnglishGoverns: React.FC<{ className?: string }> = ({ className }) => {
  const { t, i18n } = useTranslation('auth');
  if (i18n.resolvedLanguage === 'en') return null;
  return <p className={`login-legal${className ? ` ${className}` : ''}`}>{t('legal.englishGoverns')}</p>;
};

/**
 * "By <action> you agree to…" — how people accept the Terms (no checkbox).
 * Sits right next to the button it describes; clicking that button records
 * the acceptance (utils/terms.ts).
 */
export const LegalNotice: React.FC<{ action: LegalAction; className?: string; withEnglishNote?: boolean }> = ({
  action,
  className,
  withEnglishNote = true,
}) => {
  const { t } = useTranslation('auth');
  return (
    <>
      <p className={`login-legal${className ? ` ${className}` : ''}`}>
        <Trans
          t={t}
          i18nKey={`legal.notice.${action}`}
          values={{ terms: t('legal.terms'), privacy: t('legal.privacy'), dpa: t('legal.dpa') }}
          components={{
            terms: <a href="/terms" target="_blank" rel="noopener" />,
            privacy: <a href="/privacy" target="_blank" rel="noopener" />,
            dpa: <a href="/dpa" target="_blank" rel="noopener" />,
          }}
        />
      </p>
      {withEnglishNote && <EnglishGoverns />}
    </>
  );
};
