import React from 'react';
import { supabase } from '../utils/supabaseClient';
import { DEFAULT_EZYVET_MAP, effectiveMap, type EffectiveFieldMap, type PimsFieldMap } from '../utils/pims/mapping';

/**
 * The vet's saved ezyVet field map (profiles.pims_field_map). Only the
 * keys the vet changed are stored, so a later change to the defaults
 * still applies to the rest. Without an account it lives in memory.
 */
export interface UsePimsFieldMapReturn {
  /** Saved choices over the defaults. */
  map: EffectiveFieldMap;
  /** Replace the saved map with the merge of the saved map and `next`. */
  save: (next: PimsFieldMap) => Promise<void>;
  /** Forget all saved choices (back to the defaults). */
  reset: () => Promise<void>;
}

const SAVED_KEYS = [...Object.keys(DEFAULT_EZYVET_MAP), 'editedNote'] as (keyof PimsFieldMap)[];

function asSaved(value: unknown): PimsFieldMap | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out: PimsFieldMap = {};
  for (const key of SAVED_KEYS) {
    const v = (value as Record<string, unknown>)[key];
    if (typeof v === 'string' || v === null) out[key] = v;
  }
  return out;
}

export function usePimsFieldMap(): UsePimsFieldMapReturn {
  const [saved, setSaved] = React.useState<PimsFieldMap | null>(null);
  const savedRef = React.useRef(saved);
  savedRef.current = saved;
  const userIdRef = React.useRef<string | null>(null);
  // Settles once the stored map has been read (or can't be). Writes wait for it, so a save made
  // while loading merges into the stored map instead of overwriting it.
  const loadedRef = React.useRef<Promise<void>>(Promise.resolve());

  React.useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    loadedRef.current = (async () => {
      try {
        const { data: s } = await supabase!.auth.getSession();
        const uid = s.session?.user.id ?? null;
        if (cancelled || !uid) return;
        userIdRef.current = uid;
        const { data, error } = await supabase!.from('profiles').select('pims_field_map').eq('id', uid).maybeSingle();
        if (cancelled || error) return; // column missing (migration not run): defaults
        const loaded = asSaved((data as { pims_field_map?: unknown } | null)?.pims_field_map);
        savedRef.current = loaded;
        setSaved(loaded);
      } catch { /* unreadable: defaults */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const write = React.useCallback(async (next: PimsFieldMap | null) => {
    savedRef.current = next;
    setSaved(next);
    const uid = userIdRef.current;
    if (supabase && uid) {
      const { error } = await supabase.from('profiles').update({ pims_field_map: next }).eq('id', uid);
      if (error) throw new Error(error.message);
    }
  }, []);

  const save = React.useCallback(async (next: PimsFieldMap) => {
    await loadedRef.current;
    await write({ ...savedRef.current, ...next });
  }, [write]);
  const reset = React.useCallback(async () => {
    await loadedRef.current;
    await write(null);
  }, [write]);
  const map = React.useMemo(() => effectiveMap(saved), [saved]);

  return { map, save, reset };
}
