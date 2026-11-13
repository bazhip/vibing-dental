import React from 'react';
import { useTranslation } from 'react-i18next';
import { signOutAndSweep } from '../utils/signOutAndSweep';
import './BillingGate.css';

/** The billing screens' sign-out: the same full sign-out as the app menu
 *  (deliberate, sweeps the local chart and the billing cache). */
export const SignOutLink: React.FC = () => {
  const { t } = useTranslation();
  return (
    <button type="button" className="billing-gate__signout" onClick={() => void signOutAndSweep()}>
      {t('actions.signOut')}
    </button>
  );
};
