import React from 'react';
import { supabase } from '../utils/supabaseClient';
import { DEFAULT_EZYVET_MAP, effectiveMap, type PimsFieldMap, type SourceKey } from '../utils/pims/mapping';

/**
 * The vet's saved ezyVet field map (profiles.pims_field_map). Only the
 * keys the vet changed are stored, so a later change to the defaults
 * still applies to the rest. Without an account it lives in memory.
 */
export interface UsePimsFieldMapReturn {
  /** Saved choices over the defaults. */
  map: Record<SourceKey, string | null>;
  /** Replace the saved map with the merge of the saved map and `next`. */
  save: (next: PimsFieldMap) => Promise<void>;
  /** Forget all saved choices (back to the defaults). */
  reset: () => Promise<void>;
}

function asSaved(value: unknown): PimsFieldMap | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out: PimsFieldMap = {};
  for (const key of Object.keys(DEFAULT_EZYVET_MAP) as SourceKey[]) {
    const v = (value as Record<string, unknown>)[key];
    if (typeof v === 'string' || v === null) out[key] = v;
  }
  return out;
}

export function usePimsFieldMap(): UsePimsFieldMapReturn {
  const [saved, setSaved] = React.useState<PimsFieldMap | null>(null);
  const savedRef = React.useRef(saved);
  savedRef.current = saved;
  const [userId, setUserId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const { data: s } = await supabase!.auth.getSession();
      const uid = s.session?.user.id ?? null;
      if (cancelled || !uid) return;
      setUserId(uid);
      const { data, error } = await supabase!.from('profiles').select('pims_field_map').eq('id', uid).maybeSingle();
      if (cancelled || error) return; // column missing (migration not run): defaults
      setSaved(asSaved((data as { pims_field_map?: unknown } | null)?.pims_field_map));
    })();
    return () => { cancelled = true; };
  }, []);

  const write = React.useCallback(async (next: PimsFieldMap | null) => {
    savedRef.current = next;
    setSaved(next);
    if (supabase && userId) {
      const { error } = await supabase.from('profiles').update({ pims_field_map: next }).eq('id', userId);
      if (error) throw new Error(error.message);
    }
  }, [userId]);

  const save = React.useCallback((next: PimsFieldMap) => write({ ...savedRef.current, ...next }), [write]);
  const reset = React.useCallback(() => write(null), [write]);
  const map = React.useMemo(() => effectiveMap(saved), [saved]);

  return { map, save, reset };
}
