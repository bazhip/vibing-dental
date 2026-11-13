import i18n from '../i18n';
import { supabase } from './supabaseClient';
import { LocalizedError, apiErrorFromBody } from './apiErrors';

type ErrorBody = { error?: unknown; code?: unknown; params?: unknown };

/**
 * Call an edge function. Throws ApiError for a coded error reply, a plain
 * Error with the raw text otherwise.
 */
export async function invokeFunction<T = Record<string, unknown>>(name: string, body: object): Promise<T> {
  if (!supabase) throw new LocalizedError(i18n.t('sync.cloudNotConfigured', { ns: 'app' }));
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const context = (error as { context?: Response }).context;
    let detail: ErrorBody | null = null;
    try {
      detail = await context?.json();
    } catch { /* not JSON — use the transport message */ }
    if (detail && typeof detail.error === 'string' && detail.error) throw apiErrorFromBody(detail, context?.status);
    throw new Error(error.message);
  }
  if (data && typeof data === 'object' && typeof (data as ErrorBody).error === 'string' && (data as ErrorBody).error) {
    throw apiErrorFromBody(data as ErrorBody);
  }
  return data as T;
}
