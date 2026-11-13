// User-facing edge-function errors: a stable `code` per message, plus the
// English `error` text older clients still show as-is.
//
// The client maps `code` to `common:errors.api.<code>` (src/utils/apiErrors.ts)
// and shows it in the user's language; `params` fill the placeholders. The
// English catalog strings must equal these texts exactly —
// src/utils/apiErrors.test.ts checks every code. Pure module (no Deno APIs)
// so that test can import it.
//
// Not coded: developer-only replies (method not allowed, bad json, missing
// userId, unknown action, forbidden) and the catch-all 500 with a raw
// exception message — the client wraps those as "Something went wrong
// (details: …)" in other languages.

type Params = Record<string, string | number>;

const plural = (n: number, word: string) => `${word}${n === 1 ? '' : 's'}`;

export const API_ERRORS = {
  unauthorized: () => 'unauthorized',

  // team-api
  already_member: () => 'They’re already a member of this practice.',
  invite_failed: (p: { detail: string }) => `Couldn't send the invite: ${p.detail}`,
  practice_name_required: () => 'Give the practice a name.',
  already_owner: () => 'You already own a practice.',
  invite_invalid: () => 'This invite link isn’t valid. Ask the practice to send a new one.',
  invite_wrong_account: () => 'This invite was sent to a different account. Sign in with the invited email.',
  invite_expired: () => 'This invite has expired. Ask the practice to send a new one.',
  practice_gone: () => 'That practice no longer exists.',
  email_required: () => 'Enter an email.',
  not_owner: () => 'Only a practice owner can add members.',
  not_owner_resend: () => 'Only a practice owner can resend invites.',
  not_owner_remove: () => 'Only a practice owner can remove members.',
  not_owner_roles: () => 'Only a practice owner can change roles.',
  not_owner_transfer: () => 'Only a practice owner can transfer ownership.',
  not_owner_report_templates: () => 'Only a practice owner can change the owner report templates.',
  seat_limit_individual: () => 'Your Individual plan is single-user — switch to a Practice plan (up to 5 people) to add your team.',
  seat_limit: () => 'Practice plans include up to 5 team members — contact us about a larger plan.',
  not_on_team: () => 'That person is not on the team.',
  account_not_found: () => 'Could not find that account.',
  account_already_active: () => 'That account is already active — no invite to resend.',
  remove_primary_owner: () => 'Transfer ownership before removing the primary owner.',
  demote_primary_owner: () => 'Transfer primary ownership before demoting this owner.',
  report_config_not_object: () => 'Owner report settings must be an object.',
  report_config_no_templates: () => 'Owner report settings need a templates list.',
  report_config_too_large: () => 'Those owner report settings are too large (50 KB max) — shorten some text or remove a template.',
  report_config_stale: () => 'These templates were changed on another device or tab since you opened them. Close this window, reload the page, and make your changes again.',
  not_in_practice: () => 'You’re not in a practice.',
  not_primary_owner: () => 'Only the primary owner can delete the practice.',
  confirm_delete_word: () => 'Type DELETE exactly to confirm.',
  confirm_practice_name: () => 'Type the practice name exactly to confirm.',
  confirm_email: () => 'Type your email exactly to confirm.',
  admin_not_deletable: () => 'Admin accounts can’t be deleted from here.',
  owner_has_members: (p: { name: string; count: number }) =>
    `You’re the primary owner of “${p.name}”, which has ${p.count} other ${plural(p.count, 'member')}. Transfer ownership or delete the practice first.`,
  owner_has_members_unnamed: (p: { count: number }) =>
    `You’re the primary owner of your practice, which has ${p.count} other ${plural(p.count, 'member')}. Transfer ownership or delete the practice first.`,

  // billing-api
  billing_not_configured: () => 'Billing is not configured yet (STRIPE_API_KEY missing).',
  plan_required: () => 'Pick a plan first.',
  not_owner_subscription: () => 'Only a practice owner can manage the subscription.',
  comped: () => 'This practice has complimentary access — no subscription needed.',
  already_subscribed: () => 'This practice already has a subscription — use Manage billing instead.',
  no_practice: () => 'No practice to manage yet.',
  not_owner_billing: () => 'Only a practice owner can manage billing.',
  no_stripe_customer: () => 'This practice has no Stripe subscription.',
  not_owner_plan: () => 'Only a practice owner can change the plan.',
  no_subscription: () => 'No subscription to change — subscribe first.',
  // count = seats on the target plan (drives the plural); members = team size.
  team_too_large: (p: { members: number; count: number; plan: string }) =>
    `Your team has ${p.members} members — remove members first or keep a Practice plan (${p.count} ${plural(p.count, 'seat')} on ${p.plan}).`,
  subscription_no_items: () => 'Subscription has no items — contact support.',

  // send-reminder
  chart_required: () => 'A saved chart is required to send a reminder.',
  subject_and_message_required: () => 'Subject and message are required.',
  chart_gone: () => 'That chart no longer exists.',
  chart_forbidden: () => 'You do not have access to that chart.',
  no_owner_email: () => 'This patient has no owner email. Add one on the chart, then send.',
  message_too_long: () => 'That message is too long.',
  daily_reminder_limit: () => 'Daily reminder limit reached (100). Try again tomorrow.',
  email_not_configured: () => 'Email is not configured.',
  email_failed: (p: { detail: string }) => `Email failed: ${p.detail}`,

  // ai-autofill
  ai_not_configured: () => 'AI is not configured yet.',
  request_too_large: () => 'Request too large.',
  unsupported_request: () => 'Unsupported request.',
  ai_rate_limit: () => 'Slow down a moment — too many AI requests in the last minute.',
  ai_daily_limit: () => 'Daily AI limit reached. It resets within 24 hours.',
  ai_failed: (p: { detail: string }) => `AI request failed: ${p.detail}`,
  ai_unreadable: () => 'AI returned an unreadable response.',

  // deepgram-token
  dictation_rate_limit: () => 'Too many dictation sessions started this hour — try again shortly.',
  voice_not_configured: () => 'Voice transcription is not configured yet.',
  voice_token_failed: (p: { detail: string }) => `Could not mint a transcription token: ${p.detail}`,
  voice_unreadable: () => 'Deepgram returned an unreadable response.',
  voice_no_token: () => 'Deepgram did not return a token.',
} satisfies Record<string, (p: never) => string>;

export type ApiErrorCode = keyof typeof API_ERRORS;
type ParamsOf<C extends ApiErrorCode> = Parameters<(typeof API_ERRORS)[C]>;

export type ApiErrorBody = {
  error: string;
  code: ApiErrorCode;
  params?: Params;
};

/** `{ error, code, params? }` for a JSON error reply. */
export function apiError<C extends ApiErrorCode>(code: C, ...args: ParamsOf<C>): ApiErrorBody {
  const p = args[0] as Params | undefined;
  const build = API_ERRORS[code] as (p?: Params) => string;
  return p ? { error: build(p), code, params: p } : { error: build(), code };
}
