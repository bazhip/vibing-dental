// Standard Webhooks signature check for Supabase Auth hooks (send-auth-email).
// Kept apart from the handler so vitest can test it: vite.config.ts aliases
// the esm.sh URL to the npm `standardwebhooks` package (a dev dependency).

import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';

export type HookVerification = { ok: true; payload: unknown } | { ok: false; message: string };

/**
 * Verifies `rawBody` against the webhook-id / webhook-timestamp /
 * webhook-signature headers with the hook secret from the dashboard
 * (`v1,whsec_<base64>`). Never throws.
 */
export function verifyHook(rawBody: string, headers: Record<string, string>, secret: string): HookVerification {
  const key = (secret ?? '').replace(/^v1,whsec_/, '');
  if (!key) return { ok: false, message: 'hook secret not configured' };
  try {
    return { ok: true, payload: new Webhook(key).verify(rawBody, headers) };
  } catch {
    return { ok: false, message: 'invalid signature' };
  }
}
