/// <reference types="chrome" />
import { useEffect, useRef } from 'react';

/**
 * Calls `onChange` when the active tab changes or a tab finishes loading. These events need no
 * `tabs` permission because no URL is read: the callback only re-runs inspect, which finds the
 * ezyVet tab itself.
 */
export function useActiveTabChange(onChange: () => void): void {
  const latest = useRef(onChange);
  latest.current = onChange;
  useEffect(() => {
    const tabs = typeof chrome === 'undefined' ? undefined : chrome.tabs;
    if (!tabs?.onActivated || !tabs.onUpdated) return;
    const activated = () => latest.current();
    const updated = (_id: number, info: { status?: string }) => {
      if (info.status === 'complete') latest.current();
    };
    tabs.onActivated.addListener(activated);
    tabs.onUpdated.addListener(updated);
    return () => {
      tabs.onActivated.removeListener(activated);
      tabs.onUpdated.removeListener(updated);
    };
  }, []);
}
