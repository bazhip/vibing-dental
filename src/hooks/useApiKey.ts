import React from 'react';
import { readString, writeString, removeKey } from '../utils/storage';

/**
 * BYOK API keys, persisted to localStorage. Generic so the same hook
 * powers both the Anthropic and Deepgram entries — they share the same
 * cross-instance / cross-tab sync mechanism (custom event + native
 * `storage` event).
 *
 * Why the sync mechanism: every component that calls a Persisted-key
 * hook gets its own `useState`. Without an event, the modal could save
 * a key and the topbar mic button would still see the old empty state
 * because its own `useState` never gets re-run.
 *
 * No encryption — same threat model as everything else in this client
 * app (animal records, single-tenant, runs in the user's own browser).
 */

const STORAGE_VERSION = 1;
const SYNC_EVENT_PREFIX = 'vibing-dental:key-change:';

export interface PersistedKey {
  value: string;
  setValue: (next: string) => void;
  has: boolean;
}

function usePersistedKey(storageKey: string): PersistedKey {
  const fullStorageKey = `vibing-dental.${storageKey}.v${STORAGE_VERSION}`;
  const eventName = SYNC_EVENT_PREFIX + storageKey;

  const [value, setValueState] = React.useState<string>(
    () => readString(storageKey, STORAGE_VERSION, '')
  );

  React.useEffect(() => {
    const onSync = (e: Event) => {
      const next = (e as CustomEvent<string>).detail ?? '';
      setValueState(next);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === fullStorageKey) setValueState(e.newValue ?? '');
    };
    window.addEventListener(eventName, onSync);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(eventName, onSync);
      window.removeEventListener('storage', onStorage);
    };
  }, [eventName, fullStorageKey]);

  const setValue = React.useCallback((next: string) => {
    const trimmed = next.trim();
    setValueState(trimmed);
    if (trimmed) writeString(storageKey, STORAGE_VERSION, trimmed);
    else removeKey(storageKey, STORAGE_VERSION);
    window.dispatchEvent(new CustomEvent<string>(eventName, { detail: trimmed }));
  }, [storageKey, eventName]);

  return { value, setValue, has: value.length > 0 };
}

/** Anthropic API key (used by aiAutofill for Claude tool-use extraction). */
export function useApiKey(): {
  apiKey: string;
  setApiKey: (value: string) => void;
  hasApiKey: boolean;
} {
  const k = usePersistedKey('anthropic-api-key');
  return { apiKey: k.value, setApiKey: k.setValue, hasApiKey: k.has };
}

/** Deepgram API key (used by deepgramVoice for high-accuracy STT with
 *  diarization). Optional — when unset, voice capture falls back to the
 *  browser-native Web Speech API. */
export function useDeepgramKey(): {
  deepgramKey: string;
  setDeepgramKey: (value: string) => void;
  hasDeepgramKey: boolean;
} {
  const k = usePersistedKey('deepgram-api-key');
  return { deepgramKey: k.value, setDeepgramKey: k.setValue, hasDeepgramKey: k.has };
}
