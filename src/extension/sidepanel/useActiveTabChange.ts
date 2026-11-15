/// <reference types="chrome" />
import { useEffect, useRef } from 'react';

/**
 * Calls `onChange` when the active tab changes, a tab finishes loading, or the panel gains focus
 * or becomes visible (the vet may have switched consults inside ezyVet meanwhile). Tab events need no
 * `tabs` permission because no URL is read: the callback only re-runs inspect, which finds the
 * ezyVet tab itself.
 */
export function useActiveTabChange(onChange: () => void): void {
  const latest = useRef(onChange);
  latest.current = onChange;
  useEffect(() => {
    const tabs = typeof chrome === 'undefined' ? undefined : chrome.tabs;
    const activated = () => latest.current();
    const updated = (_id: number, info: { status?: string }) => {
      if (info.status === 'complete') latest.current();
    };
    const visible = () => { if (document.visibilityState === 'visible') latest.current(); };
    window.addEventListener('focus', activated);
    document.addEventListener('visibilitychange', visible);
    tabs?.onActivated?.addListener(activated);
    tabs?.onUpdated?.addListener(updated);
    return () => {
      window.removeEventListener('focus', activated);
      document.removeEventListener('visibilitychange', visible);
      tabs?.onActivated?.removeListener(activated);
      tabs?.onUpdated?.removeListener(updated);
    };
  }, []);
}
