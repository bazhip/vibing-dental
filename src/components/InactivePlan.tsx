import React from 'react';
import { supabase } from '../utils/supabaseClient';
import './BillingGate.css';

/**
 * What the iOS app shows in place of BillingGate's checkout, portal and
 * member screens when the practice has no active plan. Deliberately
 * neutral: no prices, plans, links or buttons besides sign out (the app
 * sells nothing — App Store 3.1.1).
 */
export const InactivePlan: React.FC = () => (
  <div className="billing-gate">
    <div className="billing-gate__panel billing-gate__panel--narrow">
      <h1>Your plan isn't active</h1>
      <p className="billing-gate__sub">Manage it at toothops.app.</p>
      <button type="button" className="billing-gate__signout" onClick={() => supabase?.auth.signOut()}>
        Sign out
      </button>
    </div>
  </div>
);
