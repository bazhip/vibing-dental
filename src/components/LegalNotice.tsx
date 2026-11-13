import React from 'react';
import { useTranslation } from 'react-i18next';

/** What the visitor is about to do; the notice reads "By <phrase> you agree to…". */
export type LegalAction = 'signingUp' | 'continuing' | 'creatingAccount' | 'signingIn' | 'activating';

/** Pass these (not string literals) from extracted screens: the lint treats a literal prop as UI text. */
export const LEGAL_ACTION = {
  signingUp: 'signingUp',
  continuing: 'continuing',
  creatingAccount: 'creatingAccount',
  signingIn: 'signingIn',
  activating: 'activating',
} as const satisfies Record<LegalAction, LegalAction>;

// The sentence itself is legal text and stays English until the legal pages are
// translated (plan 3); only the document names are localized.
const PHRASE: Record<LegalAction, string> = {
  signingUp: 'signing up',
  continuing: 'continuing',
  creatingAccount: 'creating an account',
  signingIn: 'signing in',
  activating: 'activating your account',
};

/**
 * "By <action> you agree to…" — how people accept the Terms (no checkbox).
 * Sits right next to the button it describes; clicking that button records
 * the acceptance (utils/terms.ts).
 */
export const LegalNotice: React.FC<{ action: LegalAction; className?: string }> = ({ action, className }) => {
  const { t } = useTranslation('auth');
  return (
    <p className={`login-legal${className ? ` ${className}` : ''}`}>
      {`By ${PHRASE[action]} you agree to the`}{' '}
      <a href="/terms" target="_blank" rel="noopener">{t('legal.terms')}</a>,{' '}
      <a href="/privacy" target="_blank" rel="noopener">{t('legal.privacy')}</a> and{' '}
      <a href="/dpa" target="_blank" rel="noopener">{t('legal.dpa')}</a>.
    </p>
  );
};
