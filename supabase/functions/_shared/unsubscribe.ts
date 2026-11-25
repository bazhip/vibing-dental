// Signed unsubscribe tokens for product-update emails. A token is
// `<userId>.<signature>`; the signature is an HMAC of the user id keyed from the
// project's service-role key, so links can't be forged and need no new secret.

const enc = new TextEncoder();

const b64url = (bytes: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function key(secret: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const derived = await crypto.subtle.sign('HMAC', base, enc.encode('toothops-unsubscribe-v1'));
  return crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function unsubscribeToken(userId: string, secret: string): Promise<string> {
  return `${userId}.${b64url(await crypto.subtle.sign('HMAC', await key(secret), enc.encode(userId)))}`;
}

/** The user id a token was issued for, or null when it is malformed or forged. */
export async function verifyUnsubscribeToken(token: string, secret: string): Promise<string | null> {
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const userId = token.slice(0, dot);
  if (!UUID.test(userId)) return null;
  const expected = await unsubscribeToken(userId, secret);
  if (expected.length !== token.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0 ? userId : null;
}
