import React from 'react';
import { readString, writeString, removeKey } from '../utils/storage';

/**
 * BYOK (bring-your-own-key) Anthropic API key, persisted to localStorage.
 * No encryption — same threat model as everything else in this client app
 * (animal records, single-tenant, runs in the user's own browser). The
 * value is also exposed via React state so components re-render when it
 * changes via the Settings modal.
 */
const STORAGE_KEY = 'anthropic-api-key';
const STORAGE_VERSION = 1;

export function useApiKey(): {
  apiKey: string;
  setApiKey: (value: string) => void;
  hasApiKey: boolean;
} {
  const [apiKey, setApiKeyState] = React.useState<string>(
    () => readString(STORAGE_KEY, STORAGE_VERSION, '')
  );

  const setApiKey = React.useCallback((value: string) => {
    const trimmed = value.trim();
    setApiKeyState(trimmed);
    if (trimmed) writeString(STORAGE_KEY, STORAGE_VERSION, trimmed);
    else removeKey(STORAGE_KEY, STORAGE_VERSION);
  }, []);

  return {
    apiKey,
    setApiKey,
    hasApiKey: apiKey.length > 0,
  };
}
