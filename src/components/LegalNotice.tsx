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
 * "By <action> you agree to…" — how people accept the Terms (no checkbox).
 * Sits right next to the button it describes; clicking that button records
 * the acceptance (utils/terms.ts).
 */
export const LegalNotice: React.FC<{ action: LegalAction; className?: string }> = ({ action, className }) => {
  const { t } = useTranslation('auth');
  return (
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
  );
};
