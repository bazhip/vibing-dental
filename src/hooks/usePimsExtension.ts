import { useEffect, useState } from 'react';
import { compatibleExtension } from '../extension/protocol';
import { extensionAvailable, ping } from '../utils/pims/extensionBridge';
import { pimsRolloutEnabled } from '../utils/pims/rollout';

export function usePimsExtension(practiceEnabled: boolean): boolean {
  const enabled = pimsRolloutEnabled() && practiceEnabled && extensionAvailable();
  const [compatible, setCompatible] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setCompatible(false);
      return;
    }
    let active = true;
    let sequence = 0;
    const probe = async () => {
      const request = ++sequence;
      let available = false;
      try {
        available = extensionAvailable() && compatibleExtension(await ping());
      } catch {
        available = false;
      }
      if (active && request === sequence) setCompatible(available);
    };
    const visible = () => {
      if (document.visibilityState === 'visible') void probe();
    };
    void probe();
    window.addEventListener('focus', probe);
    document.addEventListener('visibilitychange', visible);
    return () => {
      active = false;
      window.removeEventListener('focus', probe);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [enabled]);

  return enabled && compatible;
}
