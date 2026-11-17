import { supabase } from './supabaseClient';
import { LocalizedError } from './apiErrors';
import i18n from '../i18n';

const pending = new Map<string, Promise<string>>();
/** The database owns sequencing; retries for the same patient return the same number. */
export function reservePatientNumber(patientId: string, practiceId: string): Promise<string> {
  const key = JSON.stringify([practiceId, patientId]);
  const existing = pending.get(key);
  if (existing) return existing;
  const request = (async () => {
    if (!supabase) throw new LocalizedError(i18n.t('sync.patientNumberFailed', { ns: 'app' }));
    const { data, error } = await supabase.rpc('reserve_patient_number', {
      p_patient_id: patientId, p_practice_id: practiceId || null,
    });
    if (error || typeof data !== 'string' || !/^\d+$/.test(data)) {
      throw new LocalizedError(i18n.t('sync.patientNumberFailed', { ns: 'app' }));
    }
    return data;
  })();
  pending.set(key, request);
  void request.finally(() => pending.delete(key)).catch(() => {});
  return request;
}
