import type { SupabaseClient } from '@supabase/supabase-js';
import { FREE_BETA } from '../../constants/plans';

/** The Send to ezyVet rule, shared by the web app (useProfile) and the side panel: the practice's
 *  admin-set flag (practices.pims_send_enabled), on for everyone during the free beta. */
export function pimsSendAllowed(practiceFlag: boolean): boolean {
  return FREE_BETA || practiceFlag;
}

/**
 * Is sending on for this user's practice? Reads profiles.practice_id, then the practice's flag
 * (no practice = flag off). Null when either read fails: the caller treats that as off and offers a
 * retry. During the free beta nothing is read.
 */
export async function loadPimsSendAllowed(client: SupabaseClient, userId: string): Promise<boolean | null> {
  if (pimsSendAllowed(false)) return true;
  try {
    const { data: profile, error } = await client.from('profiles').select('practice_id').eq('id', userId).maybeSingle();
    if (error) return null;
    const practiceId = (profile as { practice_id?: string | null } | null)?.practice_id;
    if (!practiceId) return false;
    const { data: practice, error: practiceError } = await client
      .from('practices')
      .select('pims_send_enabled')
      .eq('id', practiceId)
      .maybeSingle();
    if (practiceError) return null;
    return !!(practice as { pims_send_enabled?: boolean } | null)?.pims_send_enabled;
  } catch {
    return null;
  }
}
