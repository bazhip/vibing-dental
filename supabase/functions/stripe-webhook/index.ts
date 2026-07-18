// Stripe webhook — keeps practices' subscription state current.
//
// Deployed with verify_jwt OFF (Stripe can't send a Supabase JWT).
// Instead of a signing secret, each event is verified by re-fetching it
// from Stripe's API by id with the server key: the incoming POST only
// nominates an event id, and everything we act on comes from Stripe's
// own copy — a forged payload can at worst make us re-read real state.
//
// Handled events (the endpoint is created by billing-api admin_setup):
//   checkout.session.completed        → attach the new subscription
//   customer.subscription.created/updated/deleted → sync status + plan
// Payment failures arrive as subscription.updated (status past_due).
//
// Freeze lifecycle: any non-paying status (past_due, canceled, unpaid,
// …) stamps frozen_at; the app locks the practice out but keeps its
// data. Recovering to active/trialing clears the stamp. The daily
// purge_lapsed_practices() cron deletes practices frozen for 30+ days.

import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@18.5.0';

// Mirror of src/constants/plans.ts / billing-api — keep in sync.
const PLANS: Record<string, { tier: 'basic' | 'pro'; accountType: 'individual' | 'practice' }> = {
  individual_basic: { tier: 'basic', accountType: 'individual' },
  individual_pro: { tier: 'pro', accountType: 'individual' },
  practice_basic: { tier: 'basic', accountType: 'practice' },
  practice_pro: { tier: 'pro', accountType: 'practice' },
};

const json = (b: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const stripeKey = Deno.env.get('STRIPE_API_KEY');
  if (!stripeKey) return json({ error: 'not configured' }, 503);
  const stripe = new Stripe(stripeKey, { httpClient: Stripe.createFetchHttpClient() });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  let eventId = '';
  try {
    const body = await req.json();
    if (typeof body?.id === 'string' && body.id.startsWith('evt_')) eventId = body.id;
  } catch {
    /* fall through to the 400 below */
  }
  if (!eventId) return json({ error: 'no event id' }, 400);

  // The trusted copy.
  let event: Stripe.Event;
  try {
    event = await stripe.events.retrieve(eventId);
  } catch {
    return json({ error: 'unknown event' }, 400);
  }

  // Statuses that stop access — they start the 30-day freeze clock.
  const FROZEN_STATUSES = ['past_due', 'canceled', 'unpaid', 'incomplete_expired', 'paused'];

  /** Write a subscription's state onto its practice row. */
  const apply = async (sub: Stripe.Subscription) => {
    const item = sub.items?.data?.[0];
    const lookupKey = item?.price?.lookup_key ?? sub.metadata?.plan_key ?? '';
    const def = PLANS[lookupKey];
    // current_period_end lives on the subscription pre-2025 API versions
    // and on the item after.
    const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end
      ?? (item as unknown as { current_period_end?: number })?.current_period_end ?? null;
    const update: Record<string, unknown> = {
      stripe_subscription_id: sub.id,
      subscription_status: sub.status,
      billing_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    };
    if (def) {
      update.plan = def.tier;
      update.account_type = def.accountType;
    }
    // Freeze bookkeeping: paying again clears the clock; entering a
    // non-paying status starts it (but never restarts an already-running
    // one — the 30 days count from the FIRST failure).
    if (['active', 'trialing'].includes(sub.status)) update.frozen_at = null;

    const practiceId = sub.metadata?.practice_id ?? '';
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? '';
    let matched = false;
    if (practiceId) {
      const { data } = await admin.from('practices').update(update).eq('id', practiceId).select('id');
      matched = !!data?.length;
      // Late-linking: checkout created the customer before the webhook —
      // make sure the practice row knows its customer id too.
      if (matched && customerId) {
        await admin.from('practices').update({ stripe_customer_id: customerId }).eq('id', practiceId);
      }
    }
    if (!matched && customerId) {
      const { data } = await admin.from('practices').update(update).eq('stripe_customer_id', customerId).select('id');
      matched = !!data?.length;
    }
    if (matched && FROZEN_STATUSES.includes(sub.status)) {
      // Only stamp practices whose clock isn't already running.
      let q = admin.from('practices').update({ frozen_at: new Date().toISOString() }).is('frozen_at', null);
      q = practiceId ? q.eq('id', practiceId) : q.eq('stripe_customer_id', customerId);
      await q;
    }
  };

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          if (!sub.metadata?.practice_id && session.metadata?.practice_id) {
            sub.metadata = { ...sub.metadata, practice_id: session.metadata.practice_id };
          }
          await apply(sub);
        }
        return json({ received: true });
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await apply(event.data.object as Stripe.Subscription);
        return json({ received: true });
      }
      default:
        // Not ours — acknowledge so Stripe stops retrying.
        return json({ received: true, ignored: event.type });
    }
  } catch (e) {
    // Non-2xx → Stripe retries with backoff, which is what we want for
    // transient DB failures.
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
