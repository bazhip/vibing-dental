import { dayBounds } from './shared';
import { identifyPims } from './hosts';
import type { AdapterContext } from './types';
import type { ObservedAppointment, SyncFailure, SyncIdentity, SyncSource, SyncTicket } from '../../utils/pims/sync';

export type ConfiguredCapture = { items: ObservedAppointment[]; failures: SyncFailure[] };
export type ConfiguredSyncOptions = { userConfirmed?: boolean };
export const CONFIGURED_SYNC_IDS = ['ezyvet', 'daysmart', 'instinct', 'pulse', 'shepherd'] as const;
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200
  && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
const instant = (value: unknown): value is string => typeof value === 'string' && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
const fail = (code: string): never => { throw { code }; };

/** Session material stays in memory and is never part of the captured identity. */
export function instinctSession(context: AdapterContext): { endpoint: string; token: string; fingerprint: string } {
  try {
    const state: unknown = JSON.parse(context.sessionStorage.getItem('instinct:user-state') ?? 'null');
    if (!state || typeof state !== 'object' || !('value' in state) || !state.value || typeof state.value !== 'object') return fail('identity_changed');
    const value = state.value as Record<string, unknown>, practice = value.practice;
    if (typeof value.accessToken !== 'string' || !value.accessToken.trim() || !practice || typeof practice !== 'object' || Array.isArray(practice)) return fail('identity_changed');
    const apiUrl = (practice as Record<string, unknown>).apiUrl;
    if (typeof apiUrl !== 'string') return fail('identity_changed');
    const endpoint = new URL(apiUrl);
    // URL.port erases an explicitly written default :443; require a plain hostname authority too.
    const authority = /^https:\/\/([^/?#]+)/.exec(apiUrl)?.[1];
    if (authority !== endpoint.hostname || identifyPims(endpoint.href) !== 'instinct' || endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.port || endpoint.search || endpoint.hash) return fail('identity_changed');
    return { endpoint: endpoint.href, token: value.accessToken, fingerprint: JSON.stringify([value.accessToken, apiUrl, practice]) };
  } catch { return fail('identity_changed'); }
}

/** Configured identity is user-confirmed. It is deliberately not an observed provider clinic identity. */
export function configuredSyncSource(context: AdapterContext, expected: SyncIdentity,
  read: (date: string, check: () => void) => Promise<ConfiguredCapture>, options?: ConfiguredSyncOptions): SyncSource {
  const binding = { ...expected }, confirmed = options?.userConfirmed === true;
  const initialDoc = context.doc, initialRoot = initialDoc.documentElement, initialUrl = context.url.href;
  let invalid = false, originalSession: string | undefined;
  const session = (): string => {
    if (invalid) return fail('identity_changed');
    try {
      const current = context.currentUrl?.() ?? context.url;
      if (!confirmed || !CONFIGURED_SYNC_IDS.some(provider => provider === binding.provider)
        || current.href !== initialUrl || current.origin !== binding.origin || identifyPims(current.href) !== binding.provider
        || current.port || context.doc !== initialDoc || context.doc.documentElement !== initialRoot
        || !id(binding.tenant_id) || !Number.isSafeInteger(binding.connection_revision) || binding.connection_revision < 1) return fail('identity_changed');
      let token: string | null;
      if (binding.provider === 'instinct') token = instinctSession(context).fingerprint;
      else if (binding.provider === 'daysmart') token = context.localStorage.getItem('Vetter-Token');
      else if (binding.provider === 'shepherd') {
        const state: unknown = JSON.parse(context.sessionStorage.getItem('baasic-auth-token-pav2') ?? 'null');
        if (!state || typeof state !== 'object' || !('token' in state) || typeof state.token !== 'string') return fail('identity_changed');
        const user = context.sessionStorage.getItem('baasic-user-info-pav2');
        token = JSON.stringify([state.token, user]);
        if (!state.token.trim()) return fail('identity_changed');
      } else if (binding.provider === 'pulse') token = context.doc.querySelector<HTMLInputElement>('input[name="__RequestVerificationToken"]')?.value ?? null;
      else {
        // ezyVet's HttpOnly login and active clinic are not observable here. Page continuity and
        // available cookie changes are guards, not claims of independently observed clinic/session identity.
        token = `page:${context.doc.cookie}`;
      }
      if (typeof token !== 'string' || !token.trim() || token.length > 65536) return fail('identity_changed');
      if (originalSession !== undefined && token !== originalSession) return fail('identity_changed');
      originalSession = token;
      return token;
    } catch { invalid = true; return fail('identity_changed'); }
  };
  // Snapshot before asynchronous work; later restoration cannot revive an observed discontinuity.
  try { session(); } catch { invalid = true; }
  const invalidate = () => { invalid = true; };
  const view = initialDoc.defaultView;
  for (const event of ['pagehide', 'popstate', 'hashchange']) view?.addEventListener(event, invalidate, { once: true });
  (view as (Window & { navigation?: EventTarget }) | null)?.navigation?.addEventListener('navigate', invalidate, { once: true });
  const dispose = () => {
    invalidate();
    for (const event of ['pagehide', 'popstate', 'hashchange']) view?.removeEventListener(event, invalidate);
    (view as (Window & { navigation?: EventTarget }) | null)?.navigation?.removeEventListener('navigate', invalidate);
  };
  const check = (ticket: SyncTicket) => {
    session();
    const bounds = ticket?.scope && dayBounds(ticket.scope.requested_date);
    if (!ticket || ticket.state !== 'capturing' || ticket.connection_revision !== binding.connection_revision
      || !Number.isSafeInteger(ticket.generation) || ticket.generation < 1 || !bounds || !instant(ticket.started_at)
      || !instant(ticket.expires_at) || Date.now() >= Date.parse(ticket.expires_at) || Date.parse(ticket.started_at) > Date.now()
      || Date.parse(ticket.scope.window_start) !== Date.parse(bounds.start) || Date.parse(ticket.scope.window_end) !== Date.parse(bounds.end)
      || ticket.scope.timezone !== Intl.DateTimeFormat().resolvedOptions().timeZone) return fail('stale_run');
  };
  return {
    dispose,
    readIdentity: async () => { session(); return { ...binding }; },
    capture: async ticket => {
      check(ticket);
      let result: ConfiguredCapture;
      try { result = await read(ticket.scope.requested_date, () => check(ticket)); }
      catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'identity_changed') invalid = true;
        throw error;
      }
      check(ticket);
      if (!result || !Array.isArray(result.items) || result.items.length > 2000 || !Array.isArray(result.failures) || result.failures.length > 2000) return fail('invalid_capture');
      const seen = new Set<string>(), items: ObservedAppointment[] = [];
      for (const row of result.items) {
        if (!row || !id(row.appointment_id) || !id(row.patient_id) || !id(row.clinician_id) || seen.has(row.appointment_id)
          || row.encounter_id !== null && !id(row.encounter_id) || !instant(row.starts_at)
          || row.ends_at !== null && (!instant(row.ends_at) || Date.parse(row.ends_at) <= Date.parse(row.starts_at))
          || !['active', 'cancelled', 'deleted', 'unknown'].includes(row.status)) return fail('invalid_capture');
        seen.add(row.appointment_id);
        if (Date.parse(row.starts_at) >= Date.parse(ticket.scope.window_start) && Date.parse(row.starts_at) < Date.parse(ticket.scope.window_end)) {
          items.push({ appointment_id: row.appointment_id, patient_id: row.patient_id, clinician_id: row.clinician_id,
            encounter_id: row.encounter_id, starts_at: row.starts_at, ends_at: row.ends_at, status: row.status });
        }
      }
      const failures: SyncFailure[] = result.failures.map(failure => {
        if (!failure || failure.appointment_id !== null && (!id(failure.appointment_id) || seen.has(failure.appointment_id))
          || !['read_failed', 'identity_missing', 'unsupported'].includes(failure.code)) return fail('invalid_capture');
        return { appointment_id: failure.appointment_id, code: failure.code };
      });
      check(ticket);
      return { protocol: 1, generation: ticket.generation, captured_at: new Date().toISOString(), identity: { ...binding },
        scope: { ...ticket.scope }, completeness: failures.length ? 'partial' : 'unknown', items, failures };
    },
  };
}
