/// <reference types="chrome" />
import { useEffect, useRef } from 'react';

/** Events often come in bursts (focus + visibility, several tab updates while a page loads). */
export const TAB_CHANGE_DEBOUNCE_MS = 300;

const EZYVET_URL = /^https:\/\/([a-z0-9-]+\.)*ezyvet\.com\//i;

/**
 * Calls `onChange` (debounced) when the active tab changes, an ezyVet tab finishes loading, or the
 * panel gains focus or becomes visible (the vet may have switched consults inside ezyVet meanwhile).
 *
 * A finished load counts only for `ezyvetTabId` (the tab the last inspect used) when it is known,
 * or for a tab Chrome reports with an ezyVet URL (the host permission lets it show those). With
 * neither known, any finished load counts. No `tabs` permission is needed: the callback only re-runs
 * inspect, which finds the ezyVet tab itself.
 */
export function useActiveTabChange(onChange: () => void, ezyvetTabId: number | null = null): void {
  const latest = useRef(onChange);
  latest.current = onChange;
  const tabId = useRef(ezyvetTabId);
  tabId.current = ezyvetTabId;
  useEffect(() => {
    const tabs = typeof chrome === 'undefined' ? undefined : chrome.tabs;
    let timer: number | undefined;
    const fire = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => latest.current(), TAB_CHANGE_DEBOUNCE_MS);
    };
    const activated = () => fire();
    const updated = (id: number, info: { status?: string }, tab?: { url?: string }) => {
      if (info.status !== 'complete') return;
      const isEzyvet = !!tab?.url && EZYVET_URL.test(tab.url);
      const known = tabId.current;
      if (known != null ? id === known || isEzyvet : isEzyvet || !tab?.url) fire();
    };
    const visible = () => { if (document.visibilityState === 'visible') fire(); };
    window.addEventListener('focus', activated);
    document.addEventListener('visibilitychange', visible);
    tabs?.onActivated?.addListener(activated);
    tabs?.onUpdated?.addListener(updated);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', activated);
      document.removeEventListener('visibilitychange', visible);
      tabs?.onActivated?.removeListener(activated);
      tabs?.onUpdated?.removeListener(updated);
    };
  }, []);
}
