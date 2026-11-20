/** Change only the app's existing static system cache breakpoint. */
export function reviewSystemCache(system: unknown, enabled: boolean): unknown {
  if (!enabled || !Array.isArray(system) || system.length !== 1) return system;
  const block = system[0];
  if (block?.type !== 'text' || typeof block.text !== 'string' || block.cache_control?.type !== 'ephemeral'
      || block.cache_control.ttl !== undefined) return system;
  return [{ ...block, cache_control: { ...block.cache_control, ttl: '1h' } }];
}

interface DictationRequest {
  userId: string;
  practiceId: string | null;
  model: string;
  raw: string;
}

interface CapturedResponse {
  body: string | null;
  headers: Headers;
  status: number;
}

interface Entry {
  response: Promise<CapturedResponse>;
  expiresAt: number;
}

const MAX_REPLAY_CHARS = 128 * 1024;

/** One isolate shares work across concurrent calls and short retries. This
 * stores only hashed request identities and bounded, short-lived responses.
 * Call after authentication and request validation. */
export function createDictationRequestReuse(ttlMs = 10_000, maxEntries = 64) {
  const entries = new Map<string, Entry>();
  const encoder = new TextEncoder();

  return async (request: DictationRequest, run: () => Promise<Response>): Promise<Response> => {
    const { userId, practiceId, model, raw } = request;
    const identity = encoder.encode(JSON.stringify([userId, practiceId, model, raw]));
    const digest = await crypto.subtle.digest('SHA-256', identity);
    const key = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    let entry = entries.get(key);
    if (entry && entry.expiresAt <= Date.now()) {
      entries.delete(key);
      entry = undefined;
    }
    if (!entry) {
      if (entries.size >= maxEntries) return run();
      const response = Promise.resolve().then(run).then(async upstream => ({
        body: upstream.body ? await upstream.text() : null,
        headers: upstream.headers,
        status: upstream.status,
      }));
      const pending = { response, expiresAt: Infinity };
      entry = pending;
      entries.set(key, pending);
      const remove = () => { if (entries.get(key) === pending) entries.delete(key); };
      void response.then(result => {
        if (result.status < 200 || result.status >= 300 || (result.body?.length ?? 0) > MAX_REPLAY_CHARS) {
          remove();
          return;
        }
        pending.expiresAt = Date.now() + ttlMs;
        setTimeout(remove, ttlMs);
      }, remove);
    }
    // A fresh body is required for each caller, including those that joined
    // while the upstream request was pending.
    const { body, status, headers } = await entry.response;
    return new Response(body, { status, headers });
  };
}
