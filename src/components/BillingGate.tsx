import React from 'react';
import { supabase, cloudEnabled } from '../utils/supabaseClient';
import { PLANS, PlanKey, CONTACT_EMAIL, TRIAL_DAYS, planByKey, PAID_SIGNUP } from '../constants/plans';
import {
  BillingInfo,
  ACCESS_STATUSES,
  deletionDate,
  fetchBilling,
  startCheckout,
  openBillingPortal,
} from '../hooks/useBilling';
import './BillingGate.css';

interface BillingGateProps {
  children: React.ReactNode;
}

/**
 * Stands between sign-in and the charting app: renders its children only
 * when the caller's practice has an active subscription (or trial or
 * comp). Anything else — including a failed payment — freezes the
 * account: the owner gets the recovery path (fix the card via the
 * portal, or resubscribe), members get a note to nudge their owner, and
 * both see the 30-day keep-your-data deadline before the purge.
 *
 * Handles the round-trip back from Checkout too: ?billing=success polls
 * until the webhook lands, ?billing=canceled just clears the flag.
 * Admins and standalone mode bypass the gate entirely.
 */
export const BillingGate: React.FC<BillingGateProps> = ({ children }) => {
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
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setIsAdmin(data.session?.user.app_metadata?.role === 'admin');
    });
    fetchBilling()
      .then((b) => {
        if (cancelled) return;
        setInfo(b);
        setSelected(b.intendedPlan ?? null);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Could not check your subscription.');
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
        setError('Payment went through but the confirmation is taking longer than usual — reload in a minute, or contact us if this persists.');
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

  if (finalizing) {
    return (
      <div className="billing-gate">
        <div className="billing-gate__panel billing-gate__panel--narrow">
          <h1>Setting up your subscription…</h1>
          <p className="billing-gate__sub">Payment confirmed — unlocking your account now.</p>
          <div className="billing-gate__spinner" aria-label="Loading" />
        </div>
      </div>
    );
  }

  // Admins manage the product; never lock them out.
  if (isAdmin) return <>{children}</>;

  if (loadError) {
    return (
      <div className="billing-gate">
        <div className="billing-gate__panel billing-gate__panel--narrow">
          <h1>Couldn't check your subscription</h1>
          <p className="billing-gate__sub">{loadError}</p>
          <button type="button" className="billing-gate__cta" onClick={() => window.location.reload()}>
            Try again
          </button>
          <SignOutLink />
        </div>
      </div>
    );
  }

  if (!info || isAdmin === null) return null;

  if (ACCESS_STATUSES.includes(info.status)) {
    return <>{children}</>;
  }

  // Paid signup is off: never-subscribed accounts ARE the free plan —
  // straight in (single-user + no-image limits come from useProfile).
  // Lapsed paid subscriptions still hit the recovery paths below.
  if (!PAID_SIGNUP && info.status === 'none') {
    return <>{children}</>;
  }

  // Frozen or never-subscribed from here on. Data survives 30 days from
  // the freeze; say so wherever we block someone.
  const deleteAt = deletionDate(info);
  const freezeNote = deleteAt ? (
    <p className="billing-gate__freeze" role="alert">
      Your charts and account are frozen, not gone — they're kept safe until{' '}
      <strong>{deleteAt.toLocaleDateString()}</strong>
      {info.role === 'owner' ? ', then deleted permanently. Reactivate before then and everything is exactly as you left it.' : ', then deleted permanently.'}
    </p>
  ) : null;

  // Members can't fix it — point them at the owner.
  if (info.role !== 'owner') {
    return (
      <div className="billing-gate">
        <div className="billing-gate__panel billing-gate__panel--narrow">
          <h1>{info.practice?.name || 'Your practice'} needs a subscription</h1>
          <p className="billing-gate__sub">
            {info.status === 'past_due'
              ? 'The practice’s last payment didn’t go through.'
              : info.status === 'none'
              ? 'The practice’s subscription hasn’t been set up yet.'
              : 'The practice’s subscription has ended.'}{' '}
            Ask <strong>{info.ownerEmail || 'your practice owner'}</strong> to sort the billing — you'll be back in the
            moment they do.
          </p>
          {freezeNote}
          <SignOutLink />
        </div>
      </div>
    );
  }

  // A failed payment keeps the subscription alive in Stripe — the fix is
  // a new card in the portal, not a new checkout.
  if (info.status === 'past_due' && info.hasStripe) {
    return (
      <div className="billing-gate">
        <div className="billing-gate__panel billing-gate__panel--narrow">
          <h1>Payment failed</h1>
          <p className="billing-gate__sub">
            Your last payment didn't go through — usually an expired or canceled card. Update your payment method and
            you're straight back in; Stripe retries automatically once the card works.
          </p>
          {freezeNote}
          {error && <div className="login-error" role="alert">{error}</div>}
          <button
            type="button"
            className="billing-gate__cta"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError('');
              openBillingPortal().catch((e) => {
                setError(e instanceof Error ? e.message : 'Could not open the billing portal.');
                setBusy(false);
              });
            }}
          >
            {busy ? 'Opening…' : 'Update payment method'}
          </button>
          <p className="billing-gate__contact">
            Trouble with billing? <a href={`mailto:${CONTACT_EMAIL}?subject=ToothOps%20billing`}>Contact us</a>.
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
      setError(e instanceof Error ? e.message : 'Could not start checkout.');
      setBusy(false);
    }
  };

  return (
    <div className="billing-gate">
      <div className="billing-gate__panel">
        <h1>Choose your plan</h1>
        <p className="billing-gate__sub">
          {info.status === 'none'
            ? `Every plan starts with a ${TRIAL_DAYS}-day free trial — cancel anytime.`
            : 'Your subscription has ended — pick a plan to get back to your charts.'}
        </p>
        {freezeNote}

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
                ${p.priceMonthly}
                <span className="billing-plan__per">/mo</span>
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
            ? 'Opening checkout…'
            : chosen
            ? `Start ${TRIAL_DAYS}-day free trial — then $${chosen.priceMonthly}/mo`
            : 'Pick a plan above'}
        </button>

        <p className="billing-gate__contact">
          More than 5 team members, or a multi-location group?{' '}
          <a href={`mailto:${CONTACT_EMAIL}?subject=ToothOps%20larger%20plan`}>Contact us</a> for custom pricing.
        </p>
        <SignOutLink />
      </div>
    </div>
  );
};

const SignOutLink: React.FC = () => (
  <button
    type="button"
    className="billing-gate__signout"
    onClick={() => supabase?.auth.signOut()}
  >
    Sign out
  </button>
);
