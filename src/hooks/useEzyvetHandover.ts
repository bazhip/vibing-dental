import React from 'react';
import i18n from '../i18n';
import { toastWhenReady as toast } from '../components/ui/dialogs';
import type { TakePendingResult } from '../extension/protocol';
import {
  consumeFromEzyvet,
  stashPatient,
  takeStashedPatient,
  type HandoverPatient,
} from '../utils/pims/ezyvetHandover';

export type EzyvetHandoverOptions = {
  enabled: boolean;
  getUserId: () => Promise<string | null>;
  take: () => Promise<TakePendingResult | null>;
  startNewPatient: () => Promise<boolean>;
  startVisitFromChart: (chartId: string) => Promise<boolean>;
  fillPatient: (p: HandoverPatient) => void;
};

/**
 * Picks up a patient chosen in the ToothOps for ezyVet side panel (see
 * src/utils/pims/ezyvetHandover.ts) and starts the chart: a new visit when
 * the patient has charts, otherwise a new patient. "New patient" reloads the
 * page, so the patient is stashed first and filled in on the next load.
 * Runs once per page load, as soon as `enabled`.
 */
export function useEzyvetHandover(opts: EzyvetHandoverOptions): void {
  const optsRef = React.useRef(opts);
  optsRef.current = opts;
  const ranRef = React.useRef(false);

  React.useEffect(() => {
    if (!opts.enabled || ranRef.current) return;
    ranRef.current = true;
    const o = optsRef.current;
    const t = i18n.getFixedT(null, 'pims');

    const stashed = takeStashedPatient();
    if (stashed) {
      o.fillPatient(stashed);
      toast(t('handover.filled'), { kind: 'success' });
      return;
    }
    if (!consumeFromEzyvet()) return;

    void (async () => {
      let res: TakePendingResult | null = null;
      try {
        res = await o.take();
      } catch {
        res = null;
      }
      const handover = res?.handover;
      if (!handover) {
        toast(t('handover.failed'), { kind: 'error' });
        return;
      }
      const userId = await o.getUserId().catch(() => null);
      if (handover.userId !== userId) {
        toast(t('handover.otherUser'), { kind: 'error' });
        return;
      }
      try {
        if (handover.latestChartId) {
          if (await o.startVisitFromChart(handover.latestChartId)) toast(t('handover.filled'), { kind: 'success' });
          return;
        }
        stashPatient(handover);
        // On true the page reloads and the next run fills from the stash.
        if (!(await o.startNewPatient())) takeStashedPatient();
      } catch {
        takeStashedPatient();
        toast(t('handover.failed'), { kind: 'error' });
      }
    })();
  }, [opts.enabled]);
}
