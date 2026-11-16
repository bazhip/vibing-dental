import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../utils/supabaseClient';
import { loadPimsSendAllowed } from '../../utils/pims/sendFlag';

/** Whether the signed-in user's practice may send to ezyVet: 'error' (the lookup failed) counts as
 *  off until `retry` succeeds. */
export type PimsSendFlag = 'loading' | 'on' | 'off' | 'error';

export function usePimsSendFlag(userId: string | null): { flag: PimsSendFlag; retry: () => void } {
  const [flag, setFlag] = useState<PimsSendFlag>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!userId || !supabase) { setFlag('off'); return; }
    let cancelled = false;
    setFlag('loading');
    void loadPimsSendAllowed(supabase, userId).then((on) => {
      if (!cancelled) setFlag(on === null ? 'error' : on ? 'on' : 'off');
    });
    return () => { cancelled = true; };
  }, [userId, attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { flag, retry };
}
