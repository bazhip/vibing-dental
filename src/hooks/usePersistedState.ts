import { useState, useEffect, useRef } from 'react';

/**
 * useState that mirrors its value into localStorage, so a page refresh
 * doesn't lose the user's in-progress chart. Falls back gracefully when
 * localStorage is unavailable (private browsing) or the saved value
 * fails to parse.
 *
 * Storage is debounced lightly via the natural React batch — every
 * setState triggers an effect that writes once.
 */
export function usePersistedState<T>(
  key: string,
  initial: T | (() => T)
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) return JSON.parse(raw) as T;
    } catch {
      // ignore parse / quota errors, fall through to default
    }
    return typeof initial === 'function' ? (initial as () => T)() : initial;
  });

  // Avoid writing on the initial mount when nothing has changed — saves
  // an unnecessary localStorage round-trip per key per session.
  const firstWriteSkipped = useRef(false);
  useEffect(() => {
    if (!firstWriteSkipped.current) {
      firstWriteSkipped.current = true;
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, [key, value]);

  return [value, setValue];
}
