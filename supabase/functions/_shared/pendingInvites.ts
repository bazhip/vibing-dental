// Helpers for team invites to accounts that were never activated
// (invited, but the person hasn't set a password yet).

// deno-lint-ignore no-explicit-any
type Admin = any;

/** Only send people back to our own app (no open redirects in emails). */
export function safeAppUrl(redirectTo?: string): string {
  const fallback = 'https://toothops.app/';
  if (!redirectTo) return fallback;
  try {
    const u = new URL(redirectTo);
    const okHost = u.hostname === 'toothops.app' || u.hostname === 'localhost' || u.hostname === '127.0.0.1' ||
      /^vibing-dental[a-z0-9-]*\.vercel\.app$/.test(u.hostname);
    return okHost ? `${u.origin}${u.pathname}` : fallback;
  } catch {
    return fallback;
  }
}


/** An auth user by email, paging past listUsers' 1000-per-page cap (the
 *  first page alone missed everyone after the first 1000 accounts). */
export async function findAuthUserByEmail(admin: Admin, email: string) {
  const want = email.trim().toLowerCase();
  const PER_PAGE = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw new Error(error.message);
    const batch = data?.users ?? [];
    // deno-lint-ignore no-explicit-any
    const hit = batch.find((u: any) => (u.email ?? '').toLowerCase() === want);
    if (hit) return hit;
    if (batch.length < PER_PAGE) return null;
  }
}

/** Never activated: no confirmed email and never signed in. */
// deno-lint-ignore no-explicit-any
export const isPendingAccount = (u: any) => !!u && !u.email_confirmed_at && !u.last_sign_in_at;

/** A fresh set-password link for a pending account. Invite links only mint
 *  for brand-new accounts, so this is a recovery link: it verifies the email
 *  and lands on the app's set-password screen (`invite=1` shows the invite
 *  wording). The account is kept — no delete-and-recreate. */
export async function freshInviteLink(admin: Admin, email: string, appUrl: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${appUrl}?invite=1` },
  });
  if (error || !data?.properties?.action_link) return null;
  return data.properties.action_link as string;
}

// app_metadata updates merge key by key: a key is removed only by sending
// null, never by leaving it out. The existing keys are spread in as well,
// so nothing else (role: admin…) can be lost either way.

/** Mark a pending invite revoked (removed from the team before activating),
 *  so invite-reminders stops emailing them. Nothing is deleted. */
// deno-lint-ignore no-explicit-any
export async function markInviteRevoked(admin: Admin, user: any) {
  await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...(user?.app_metadata ?? {}), invite_revoked_at: new Date().toISOString() },
  });
}

/** A fresh invite went out: start the invite over. Clears the revoked mark
 *  and the reminder/expiry state, so invite-reminders treats it as new —
 *  without this, a link resent after the final reminder was followed by
 *  the expiry job deleting the account. */
// deno-lint-ignore no-explicit-any
export async function resetInviteState(admin: Admin, user: any) {
  await admin.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...(user?.app_metadata ?? {}),
      invite_revoked_at: null,
      invite_reminders: null,
      invite_reminded_at: null,
      invite_expires_at: null,
    },
  });
}
