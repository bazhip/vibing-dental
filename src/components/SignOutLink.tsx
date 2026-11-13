import React from 'react';
import { signOutAndSweep } from '../utils/signOutAndSweep';
import './BillingGate.css';

/** The billing screens' sign-out: the same full sign-out as the app menu
 *  (deliberate, sweeps the local chart and the billing cache). */
export const SignOutLink: React.FC = () => (
  <button type="button" className="billing-gate__signout" onClick={() => void signOutAndSweep()}>
    Sign out
  </button>
);
