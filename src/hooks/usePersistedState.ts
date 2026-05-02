import { useState, useEffect, useRef } from 'react';
import { readJson, writeJson } from '../utils/storage';

/**
 * useState that mirrors its value into localStorage via the unified storage
 * util — survives a page refresh without having to re-enter chart data.
 *
 * Storage failures (private mode, quota exhausted, parse errors on stale
 * data) are swallowed inside `storage.ts` and the hook falls back to the
 * provided initial value.
 */
export function usePersistedState<T>(
  key: string,
  version: number,
  initial: T | (() => T)
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const fallback = typeof initial === 'function' ? (initial as () => T)() : initial;
    return readJson<T>(key, version, fallback);
  });

  // Skip the first effect tick so we don't re-write the just-loaded value
  // back to localStorage on every mount.
  const firstWriteSkipped = useRef(false);
  useEffect(() => {
    if (!firstWriteSkipped.current) {
      firstWriteSkipped.current = true;
      return;
    }
    writeJson(key, version, value);
  }, [key, version, value]);

  return [value, setValue];
}
