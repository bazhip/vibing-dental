import React from 'react';
import { Trans, useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { formatDateTime } from '../i18n/format';
import { AccountLanguage } from '../i18n/AccountLanguage';
import { supabase, cloudEnabled } from '../utils/supabaseClient';
import { PLANS, PlanKey, CONTACT_EMAIL, TRIAL_DAYS, planByKey, PAID_SIGNUP, formatPlanPrice } from '../constants/plans';
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
        if (!cancelled) setLoadError(e instanceof Error ? e.message : i18n.t('gate.checkFailed', { ns: 'billing' }));
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
      <Trans
        t={t}
        i18nKey={info.role === 'owner' ? 'gate.freezeOwner' : 'gate.freezeMember'}
        values={{ date: formatDateTime(deleteAt, i18n.language, { year: 'numeric', month: 'numeric', day: 'numeric' }) }}
        components={{ strong: <strong /> }}
      />
    </p>
  ) : null;

  // Members can't fix it — point them at the owner.
  if (info.role !== 'owner') {
    return blocking(
      <div className="billing-gate">
        <div className="billing-gate__panel billing-gate__panel--narrow">
          <h1>{t('gate.memberTitle', { practice: info.practice?.name || t('gate.yourPractice') })}</h1>
          <p className="billing-gate__sub">
            <Trans
              t={t}
              i18nKey={info.status === 'past_due' ? 'gate.memberPastDue' : info.status === 'none' ? 'gate.memberNone' : 'gate.memberEnded'}
              values={{ owner: info.ownerEmail || t('gate.yourOwner') }}
              components={{ strong: <strong /> }}
            />
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
    return blocking(
      <div className="billing-gate">
        <div className="billing-gate__panel billing-gate__panel--narrow">
          <h1>{t('gate.failedTitle')}</h1>
          <p className="billing-gate__sub">{t('gate.failedBody')}</p>
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
                setError(e instanceof Error ? e.message : t('gate.portalFailed'));
                setBusy(false);
              });
            }}
          >
            {busy ? t('gate.opening') : t('gate.updateCard')}
          </button>
          <p className="billing-gate__contact">
            <Trans t={t} i18nKey="gate.trouble" components={{ a: <a href={`mailto:${CONTACT_EMAIL}?subject=ToothOps%20billing`} /> }} />
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
        <p className="billing-gate__sub">
          {info.status === 'none' ? t('gate.trialSub', { days: TRIAL_DAYS }) : t('gate.endedSub')}
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

const SignOutLink: React.FC = () => {
  const { t } = useTranslation('billing');
  return (
    <button
      type="button"
      className="billing-gate__signout"
      onClick={() => supabase?.auth.signOut()}
    >
      {t('gate.signOut')}
    </button>
  );
};
