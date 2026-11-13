import React from 'react';
import { useTranslation } from 'react-i18next';
import { SignOutLink } from './SignOutLink';
import './BillingGate.css';

/**
 * What the iOS app shows in place of BillingGate's checkout, portal and
 * member screens when the practice has no active plan. Deliberately
 * neutral: no prices, plans, links or buttons besides sign out (the app
 * sells nothing — App Store 3.1.1).
 */
export const InactivePlan: React.FC = () => {
  const { t } = useTranslation('account');
  return (
    <div className="billing-gate">
      <div className="billing-gate__panel billing-gate__panel--narrow">
        <h1>{t('plan.inactive.title')}</h1>
        <p className="billing-gate__sub">{t('plan.inactive.manage')}</p>
        <SignOutLink />
      </div>
    </div>
  );
};
