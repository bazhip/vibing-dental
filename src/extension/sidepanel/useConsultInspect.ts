import { useCallback, useEffect, useRef, useState } from 'react';
import type { InspectResult } from '../protocol';
import { internalTransport } from './internalTransport';
import { useActiveTabChange } from './useActiveTabChange';

/** What the active ezyVet tab shows now (null = unknown or no extension answer). Re-inspected on
 *  mount and whenever the active tab changes. */
export function useConsultInspect(enabled: boolean): InspectResult | null {
  const [info, setInfo] = useState<InspectResult | null>(null);
  const latest = useRef(0);
  const refresh = useCallback(() => {
    const id = ++latest.current;
    // Only the newest answer counts: an older inspect may come back after a newer one.
    internalTransport.inspect().then(
      (r) => { if (id === latest.current) setInfo(r); },
      () => { if (id === latest.current) setInfo(null); },
    );
  }, []);
  useEffect(() => {
    if (enabled) refresh();
    else setInfo(null);
  }, [enabled, refresh]);
  useActiveTabChange(() => {
    if (enabled) refresh();
  });
  return info;
}
