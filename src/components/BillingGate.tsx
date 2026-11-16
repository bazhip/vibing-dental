import React from 'react';
import { Trans, useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { AccountLanguage } from '../i18n/AccountLanguage';
import { supabase, cloudEnabled } from '../utils/supabaseClient';
import { PLANS, PlanKey, CONTACT_EMAIL, TRIAL_DAYS, planByKey, PAID_SIGNUP, formatPlanPrice } from '../constants/plans';
import {
  BillingInfo,
  ACCESS_STATUSES,
  fetchBilling,
  startCheckout,
} from '../hooks/useBilling';
import { isNativeApp } from '../native/platform';
import { readBillingCache, saveBillingCache } from '../native/billingCache';
import { getSessionTolerant } from '../native/offlineSession';
import { InactivePlan } from './InactivePlan';
import { SignOutLink } from './SignOutLink';
import './BillingGate.css';

interface BillingGateProps {
  children: React.ReactNode;
}

/**
 * Stands between sign-in and the charting app. Billing never locks anyone
 * out of their charts and never deletes anything: a subscription that
 * lapsed (cancelled, failed payment, unpaid…) just drops the practice to
 * the free plan, and its owner can subscribe again from Practice settings.
 * The only screen here is for accounts that never subscribed, and only
 * when paid signup is on: owners choose a plan, members are told to ask
 * their owner.
 *
 * Handles the round-trip back from Checkout too: ?billing=success polls
 * until the webhook lands, ?billing=canceled just clears the flag.
 * Admins and standalone mode bypass the gate entirely.
 *
 * In the iOS app nothing is sold: every no-access outcome shows the
 * neutral InactivePlan screen instead of checkout/portal/member screens,
 * and the last successful check is cached so the app opens offline for
 * up to 7 days (see native/billingCache).
 */
export const BillingGate: React.FC<BillingGateProps> = ({ children }) => {
  const { t } = useTranslation('billing');
  const params = new URLSearchParams(window.location.search);
  const [finalizing, setFinalizing] = React.useState(params.get('billing') === 'success');
  const [info, setInfo] = React.useState<BillingInfo | null>(null);
  const [loadError, setLoadError] = React.useState('');
  const [isAdmin, setIsAdmin] = React.useState<boolean | null>(null);
  const [selected, setSelected] = React.useState<PlanKey | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const clearBillingParam = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('billing');
    window.history.replaceState({}, '', url.toString());
  };

  React.useEffect(() => {
    if (!cloudEnabled || !supabase) return;
    let cancelled = false;
    if (new URLSearchParams(window.location.search).get('billing') === 'canceled') clearBillingParam();
    // Its user id keys the app's billing cache. Offline with an expired
    // access token getSession() can't refresh, so fall back to the stored
    // session (app only — see native/offlineSession).
    const userId = getSessionTolerant(supabase).then(({ session }) => {
      if (!cancelled) setIsAdmin(session?.user.app_metadata?.role === 'admin');
      return session?.user.id ?? '';
    });
    fetchBilling()
      .then((b) => {
        if (cancelled) return;
        // No user id, nothing to key the cache to: skip it rather than
        // save an entry no one can read back.
        if (isNativeApp()) void userId.then((id) => id && saveBillingCache(b, Date.now(), id));
        setInfo(b);
        setSelected(b.intendedPlan ?? null);
      })
      .catch(async (e) => {
        if (cancelled) return;
        // App offline: go on this user's last known status if it's recent
        // enough.
        const cached = isNativeApp() ? readBillingCache(Date.now(), await userId) : null;
        if (cancelled) return;
        if (cached) {
          setInfo(cached);
          return;
        }
        setLoadError(e instanceof Error ? e.message : i18n.t('gate.checkFailed', { ns: 'billing' }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Back from Checkout — the webhook usually lands within a few seconds;
  // poll until the practice row shows it, then let them in.
  React.useEffect(() => {
    if (!finalizing || !cloudEnabled) return;
    let cancelled = false;
    let tries = 0;
    const tick = async () => {
      tries += 1;
      try {
        const b = await fetchBilling();
        if (cancelled) return;
        if (ACCESS_STATUSES.includes(b.status)) {
          setInfo(b);
          setFinalizing(false);
          clearBillingParam();
          return;
        }
      } catch {
        /* transient — keep polling */
      }
      if (tries >= 24) {
        // ~1 minute without the webhook: fail open into the chooser with
        // a note rather than spinning forever.
        setFinalizing(false);
        clearBillingParam();
        setError(i18n.t('gate.slowConfirm', { ns: 'billing' }));
        return;
      }
      window.setTimeout(tick, 2500);
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [finalizing]);

  if (!cloudEnabled) return <>{children}</>;

  // Blocking screens replace the chart, which owns the account's language.
  const blocking = (screen: React.ReactNode) => (
    <>
      <AccountLanguage />
      {screen}
    </>
  );

  if (finalizing) {
    return blocking(
      <div className="billing-gate">
        <div className="billing-gate__panel billing-gate__panel--narrow">
          <h1>{t('gate.settingUpTitle')}</h1>
          <p className="billing-gate__sub">{t('gate.settingUpSub')}</p>
          <div className="billing-gate__spinner" aria-label={t('gate.loading')} />
        </div>
      </div>
    );
  }

  // Admins manage the product; never lock them out.
  if (isAdmin) return <>{children}</>;

  if (loadError) {
    return blocking(
      <div className="billing-gate">
        <div className="billing-gate__panel billing-gate__panel--narrow">
          <h1>{t('gate.checkFailedTitle')}</h1>
          <p className="billing-gate__sub">{loadError}</p>
          <button type="button" className="billing-gate__cta" onClick={() => window.location.reload()}>
            {t('gate.tryAgain')}
          </button>
          <SignOutLink />
        </div>
      </div>
    );
  }

  if (!info || isAdmin === null) return blocking(null);

  if (ACCESS_STATUSES.includes(info.status)) {
    return <>{children}</>;
  }

  // A lapsed subscription (cancelled, failed payment, unpaid, …) is the
  // free plan, never a lock-out: straight in, with free-plan limits from
  // useProfile and the way back in Practice settings. Same for accounts
  // that never subscribed while paid signup is off.
  if (info.status !== 'none' || !PAID_SIGNUP) {
    return <>{children}</>;
  }

  // Never subscribed, paid signup on, from here.
  // The app sells nothing and links to no billing — one neutral screen.
  if (isNativeApp()) return <InactivePlan />;

  // Members can't subscribe — point them at the owner.
  if (info.role !== 'owner') {
    return blocking(
      <div className="billing-gate">
        <div className="billing-gate__panel billing-gate__panel--narrow">
          <h1>{t('gate.memberTitle', { practice: info.practice?.name || t('gate.yourPractice') })}</h1>
          <p className="billing-gate__sub">
            <Trans
              t={t}
              i18nKey="gate.memberNone"
              values={{ owner: info.ownerEmail || t('gate.yourOwner') }}
              components={{ strong: <strong /> }}
            />
          </p>
          <SignOutLink />
        </div>
      </div>
    );
  }

  const chosen = selected ? planByKey(selected) : undefined;

  const subscribe = async () => {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      await startCheckout(selected); // navigates away on success
    } catch (e) {
      setError(e instanceof Error ? e.message : t('gate.checkoutFailed'));
      setBusy(false);
    }
  };

  return blocking(
    <div className="billing-gate">
      <div className="billing-gate__panel">
        <h1>{t('gate.chooseTitle')}</h1>
        <p className="billing-gate__sub">{t('gate.trialSub', { days: TRIAL_DAYS })}</p>

        <div className="billing-gate__plans">
          {PLANS.map((p) => (
            <button
              key={p.key}
              type="button"
              className={selected === p.key ? 'billing-plan billing-plan--on' : 'billing-plan'}
              aria-pressed={selected === p.key}
              onClick={() => setSelected(p.key)}
              disabled={busy}
            >
              <span className="billing-plan__name">{p.name}</span>
              <span className="billing-plan__price">
                {formatPlanPrice(p.priceMonthly)}
                <span className="billing-plan__per">{t('perMonth')}</span>
              </span>
              <span className="billing-plan__tagline">{p.tagline}</span>
              <ul className="billing-plan__features">
                {p.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </button>
          ))}
        </div>

        {error && <div className="login-error" role="alert">{error}</div>}

        <button type="button" className="billing-gate__cta" onClick={subscribe} disabled={busy || !selected}>
          {busy
            ? t('gate.openingCheckout')
            : chosen
            ? t('gate.startTrial', { days: TRIAL_DAYS, price: formatPlanPrice(chosen.priceMonthly) })
            : t('gate.pickPlan')}
        </button>

        <p className="billing-gate__contact">
          <Trans t={t} i18nKey="gate.larger" components={{ a: <a href={`mailto:${CONTACT_EMAIL}?subject=ToothOps%20larger%20plan`} /> }} />
        </p>
        <SignOutLink />
      </div>
    </div>
  );
};
