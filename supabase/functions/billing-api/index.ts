// Billing API — Stripe subscriptions for practices.
//
// verify_jwt ON: the gateway checks the JWT, then this function
// re-resolves the caller. User actions (get_billing / checkout / portal /
// change_plan) are gated on practice ownership; admin actions
// (admin_setup / admin_overview) require app_metadata.role === 'admin',
// same as admin-api.
//
// The practice row is the billing anchor: stripe_customer_id /
// stripe_subscription_id / subscription_status / billing_period_end live
// on practices, and the stripe-webhook function keeps them current.
// Products and prices are created lazily in Stripe by lookup_key, so no
// dashboard setup is required beyond the STRIPE_API_KEY secret.

import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@18.5.0';

type Json = Record<string, unknown>;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: Json, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

// Mirror of src/constants/plans.ts — keep in sync. Amounts in cents.
const PLANS: Record<string, { name: string; amount: number; tier: 'basic' | 'pro'; accountType: 'individual' | 'practice'; seats: number }> = {
  individual_basic: { name: 'ToothOps Individual', amount: 2000, tier: 'basic', accountType: 'individual', seats: 1 },
  individual_pro: { name: 'ToothOps Individual Pro', amount: 4000, tier: 'pro', accountType: 'individual', seats: 1 },
  practice_basic: { name: 'ToothOps Practice', amount: 6000, tier: 'basic', accountType: 'practice', seats: 5 },
  practice_pro: { name: 'ToothOps Practice Pro', amount: 12000, tier: 'pro', accountType: 'practice', seats: 5 },
};
const TRIAL_DAYS = 14;

/** Statuses under which the Stripe subscription is still alive — no new
 *  checkout allowed; fix it via the billing portal instead. */
const LIVE_SUB_STATUSES = ['active', 'trialing', 'past_due'];

/** Find the price for a plan by lookup_key, creating product + price on
 *  first use. Idempotent — lookup keys are unique per Stripe account. */
async function ensurePrice(stripe: Stripe, planKey: string): Promise<string> {
  const def = PLANS[planKey];
  if (!def) throw new Error(`unknown plan: ${planKey}`);
  const existing = await stripe.prices.list({ lookup_keys: [planKey], active: true, limit: 1 });
  if (existing.data[0]) return existing.data[0].id;
  const product = await stripe.products.create({
    name: def.name,
    metadata: { plan_key: planKey },
  });
  const price = await stripe.prices.create({
    product: product.id,
    currency: 'usd',
    unit_amount: def.amount,
    recurring: { interval: 'month' },
    lookup_key: planKey,
    metadata: { plan_key: planKey },
  });
  return price.id;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: callerData } = await admin.auth.getUser(token);
  const caller = callerData?.user;
  if (!caller) return json({ error: 'unauthorized' }, 401);

  const stripeKey = Deno.env.get('STRIPE_API_KEY');
  if (!stripeKey) return json({ error: 'Billing is not configured yet (STRIPE_API_KEY missing).' }, 503);
  const stripe = new Stripe(stripeKey, { httpClient: Stripe.createFetchHttpClient() });

  let body: Json;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  const action = body.action as string;
  const planKey = typeof body.plan === 'string' ? body.plan : '';
  // Where Stripe sends the browser back — the caller's app origin+path,
  // same pattern as team-api's redirectTo.
  const returnUrl = typeof body.returnUrl === 'string' && /^https?:\/\//.test(body.returnUrl)
    ? body.returnUrl
    : (req.headers.get('Origin') ?? 'https://toothops.app');

  const isAdmin = caller.app_metadata?.role === 'admin';

  type PracticeRow = {
    id: string; name: string; owner: string; plan: string | null;
    account_type: string | null; stripe_customer_id: string | null;
    stripe_subscription_id: string | null; subscription_status: string | null;
    billing_period_end: string | null; frozen_at: string | null;
  };
  const PRACTICE_COLS = 'id, name, owner, plan, account_type, stripe_customer_id, stripe_subscription_id, subscription_status, billing_period_end, frozen_at';

  /** The caller's practice + role, or nulls when they have neither
   *  membership nor an owned practice yet. */
  const myPractice = async (): Promise<{ practice: PracticeRow | null; role: string | null }> => {
    const { data: mem } = await admin
      .from('practice_members')
      .select('practice_id, role')
      .eq('user_id', caller.id)
      .limit(1);
    const row = mem?.[0];
    if (row) {
      const { data: prac } = await admin.from('practices').select(PRACTICE_COLS).eq('id', row.practice_id).maybeSingle();
      return { practice: (prac as PracticeRow) ?? null, role: row.role as string };
    }
    // Legacy solo accounts may own a practice without a membership row.
    const { data: owned } = await admin.from('practices').select(PRACTICE_COLS).eq('owner', caller.id).maybeSingle();
    return { practice: (owned as PracticeRow) ?? null, role: owned ? 'owner' : null };
  };

  /** Practice-or-create: subscribing anchors billing on a practice row,
   *  so make one from the signup profile if the account is still solo.
   *  Mirrors team-api's create_practice. */
  const ensurePractice = async (): Promise<{ practice: PracticeRow; role: string }> => {
    const found = await myPractice();
    if (found.practice) return { practice: found.practice, role: found.role ?? 'owner' };
    const { data: prof } = await admin.from('profiles').select('practice_name').eq('id', caller.id).maybeSingle();
    const name = (prof?.practice_name ?? '').trim() || (caller.email ?? 'My practice');
    const { data: prac, error } = await admin
      .from('practices')
      .insert({ name, owner: caller.id })
      .select(PRACTICE_COLS)
      .single();
    if (error) throw error;
    await admin.from('practice_members').insert({ practice_id: prac.id, user_id: caller.id, role: 'owner' });
    await admin.from('profiles').upsert({ id: caller.id, practice_id: prac.id });
    return { practice: prac as PracticeRow, role: 'owner' };
  };

  try {
    switch (action) {
      case 'get_billing': {
        const { practice, role } = await myPractice();
        if (!practice) {
          // Not subscribed and no practice yet — the gate offers plans;
          // checkout will create the practice.
          return json({
            practice: null,
            role: 'owner',
            plan: 'basic',
            accountType: 'individual',
            status: 'none',
            periodEnd: null,
            frozenAt: null,
            seats: 1,
            memberCount: 1,
            hasStripe: false,
            ownerEmail: caller.email ?? '',
            // What they picked at signup, so the gate can preselect it.
            intendedPlan: `${caller.user_metadata?.account_type === 'practice' ? 'practice' : 'individual'}_${caller.user_metadata?.plan === 'pro' ? 'pro' : 'basic'}`,
          });
        }
        const { count } = await admin
          .from('practice_members')
          .select('user_id', { count: 'exact', head: true })
          .eq('practice_id', practice.id);
        const { data: ownerUser } = await admin.auth.admin.getUserById(practice.owner);
        const accountType = practice.account_type === 'practice' ? 'practice' : 'individual';
        return json({
          practice: { id: practice.id, name: practice.name },
          role: role ?? 'member',
          plan: practice.plan === 'pro' ? 'pro' : 'basic',
          accountType,
          status: practice.subscription_status ?? 'none',
          periodEnd: practice.billing_period_end,
          frozenAt: practice.frozen_at,
          seats: accountType === 'practice' ? 5 : 1,
          memberCount: count ?? 1,
          hasStripe: !!practice.stripe_subscription_id,
          ownerEmail: ownerUser?.user?.email ?? '',
          intendedPlan: `${caller.user_metadata?.account_type === 'practice' ? 'practice' : 'individual'}_${caller.user_metadata?.plan === 'pro' ? 'pro' : 'basic'}`,
        });
      }

      case 'checkout': {
        const def = PLANS[planKey];
        if (!def) return json({ error: 'Pick a plan first.' }, 400);
        const { practice, role } = await ensurePractice();
        if (role !== 'owner') return json({ error: 'Only a practice owner can manage the subscription.' }, 403);
        if (practice.subscription_status === 'comped') {
          return json({ error: 'This practice has complimentary access — no subscription needed.' }, 400);
        }
        if (LIVE_SUB_STATUSES.includes(practice.subscription_status ?? '') && practice.stripe_subscription_id) {
          return json({ error: 'This practice already has a subscription — use Manage billing instead.' }, 400);
        }

        let customerId = practice.stripe_customer_id ?? '';
        if (!customerId) {
          const customer = await stripe.customers.create({
            email: caller.email ?? undefined,
            name: practice.name || undefined,
            metadata: { practice_id: practice.id },
          });
          customerId = customer.id;
          await admin.from('practices').update({ stripe_customer_id: customerId }).eq('id', practice.id);
        }

        const priceId = await ensurePrice(stripe, planKey);
        // The free trial is once per practice — resubscribing after a
        // cancellation or freeze bills immediately.
        const hadSubBefore = !!practice.stripe_subscription_id;
        const session = await stripe.checkout.sessions.create({
          mode: 'subscription',
          customer: customerId,
          line_items: [{ price: priceId, quantity: 1 }],
          subscription_data: {
            ...(hadSubBefore ? {} : { trial_period_days: TRIAL_DAYS }),
            metadata: { practice_id: practice.id, plan_key: planKey },
          },
          metadata: { practice_id: practice.id, plan_key: planKey },
          allow_promotion_codes: true,
          success_url: `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}billing=success`,
          cancel_url: `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}billing=canceled`,
        });
        return json({ url: session.url });
      }

      case 'portal': {
        const { practice, role } = await myPractice();
        if (!practice) return json({ error: 'No practice to manage yet.' }, 400);
        if (role !== 'owner') return json({ error: 'Only a practice owner can manage billing.' }, 403);
        if (!practice.stripe_customer_id) return json({ error: 'This practice has no Stripe subscription.' }, 400);
        try {
          const session = await stripe.billingPortal.sessions.create({
            customer: practice.stripe_customer_id,
            return_url: returnUrl,
          });
          return json({ url: session.url });
        } catch (e) {
          // No default portal configuration yet (fresh Stripe account) —
          // create a minimal one and retry once.
          const msg = e instanceof Error ? e.message : String(e);
          if (!/configuration/i.test(msg)) throw e;
          const config = await stripe.billingPortal.configurations.create({
            business_profile: { headline: 'ToothOps Charting' },
            features: {
              invoice_history: { enabled: true },
              payment_method_update: { enabled: true },
              customer_update: { enabled: true, allowed_updates: ['email', 'address'] },
              subscription_cancel: { enabled: true, mode: 'at_period_end' },
            },
          });
          const session = await stripe.billingPortal.sessions.create({
            customer: practice.stripe_customer_id,
            return_url: returnUrl,
            configuration: config.id,
          });
          return json({ url: session.url });
        }
      }

      case 'change_plan': {
        const def = PLANS[planKey];
        if (!def) return json({ error: 'Pick a plan first.' }, 400);
        const { practice, role } = await myPractice();
        if (!practice) return json({ error: 'No practice to manage yet.' }, 400);
        if (role !== 'owner') return json({ error: 'Only a practice owner can change the plan.' }, 403);
        if (!practice.stripe_subscription_id) return json({ error: 'No subscription to change — subscribe first.' }, 400);
        // Downgrading to a solo plan with a team would strand members.
        const { count } = await admin
          .from('practice_members')
          .select('user_id', { count: 'exact', head: true })
          .eq('practice_id', practice.id);
        if ((count ?? 1) > def.seats) {
          return json({ error: `Your team has ${count} members — remove members first or keep a Practice plan (${def.seats} seat${def.seats === 1 ? '' : 's'} on ${def.name}).` }, 400);
        }
        const sub = await stripe.subscriptions.retrieve(practice.stripe_subscription_id);
        const item = sub.items.data[0];
        if (!item) return json({ error: 'Subscription has no items — contact support.' }, 500);
        const priceId = await ensurePrice(stripe, planKey);
        await stripe.subscriptions.update(sub.id, {
          items: [{ id: item.id, price: priceId }],
          proration_behavior: 'create_prorations',
          metadata: { practice_id: practice.id, plan_key: planKey },
        });
        // The webhook confirms, but reflect the change immediately so the
        // UI doesn't lag behind the click.
        await admin.from('practices').update({ plan: def.tier, account_type: def.accountType }).eq('id', practice.id);
        return json({ ok: true });
      }

      // ---------------------------------------------------- admin actions
      case 'admin_setup': {
        if (!isAdmin) return json({ error: 'forbidden' }, 403);
        const prices: Record<string, string> = {};
        for (const key of Object.keys(PLANS)) prices[key] = await ensurePrice(stripe, key);
        // Point Stripe at the webhook function (public — it verifies each
        // event by re-fetching it from Stripe's API).
        const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/stripe-webhook`;
        const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
        let endpoint = endpoints.data.find((e) => e.url === webhookUrl);
        let createdWebhook = false;
        if (!endpoint) {
          endpoint = await stripe.webhookEndpoints.create({
            url: webhookUrl,
            enabled_events: [
              'checkout.session.completed',
              'customer.subscription.created',
              'customer.subscription.updated',
              'customer.subscription.deleted',
            ],
          });
          createdWebhook = true;
        }
        return json({ ok: true, prices, webhookUrl, createdWebhook, livemode: !stripeKey.startsWith('sk_test') && !stripeKey.startsWith('rk_test') });
      }

      case 'admin_overview': {
        if (!isAdmin) return json({ error: 'forbidden' }, 403);
        const { data: pracs } = await admin
          .from('practices')
          .select('id, name, stripe_customer_id, subscription_status');
        const byCustomer = new Map((pracs ?? []).filter((p) => p.stripe_customer_id).map((p) => [p.stripe_customer_id as string, p]));
        const subs = await stripe.subscriptions.list({ status: 'all', limit: 100 });
        let mrrCents = 0;
        const rows = [];
        for (const s of subs.data) {
          if (['canceled', 'incomplete_expired'].includes(s.status)) continue;
          const item = s.items.data[0];
          const amount = item?.price?.unit_amount ?? 0;
          if (['active', 'past_due'].includes(s.status)) mrrCents += amount;
          const prac = byCustomer.get(typeof s.customer === 'string' ? s.customer : s.customer?.id ?? '');
          const periodEnd = (s as unknown as { current_period_end?: number }).current_period_end
            ?? (item as unknown as { current_period_end?: number })?.current_period_end ?? null;
          rows.push({
            practiceName: prac?.name ?? '(unlinked customer)',
            planKey: item?.price?.lookup_key ?? '',
            status: s.status,
            amountUsd: amount / 100,
            periodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
            cancelAtPeriodEnd: s.cancel_at_period_end,
          });
        }
        const compedCount = (pracs ?? []).filter((p) => p.subscription_status === 'comped').length;
        return json({ subscriptions: rows, mrrUsd: mrrCents / 100, compedCount });
      }

      default:
        return json({ error: `unknown action: ${action}` }, 400);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
