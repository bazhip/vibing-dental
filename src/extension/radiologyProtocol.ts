import { identifyRadiology, isRadiologyAutofillRequest, isRadiologyAutofillResult } from './pims/radiologyAutofill';
import type { RadiologyAutofillRequest, RadiologyAutofillResult, RadiologyProvider } from './pims/radiologyAutofill';

export type RadiologyTarget = { tabId: number; provider: RadiologyProvider; origin: string; title: string };
export type RadiologyRequest = { operation: 'list' }
  | (RadiologyAutofillRequest & { tabId: number });
export type RadiologyResponse = RadiologyAutofillResult | { state: 'targets'; targets: RadiologyTarget[] };

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const tabId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
export function isRadiologyRequest(value: unknown): value is RadiologyRequest {
  return record(value) && (value.operation === 'list' || tabId(value.tabId) && isRadiologyAutofillRequest(value));
}
export function isRadiologyResponse(value: unknown): value is RadiologyResponse {
  if (!record(value)) return false;
  if (value.state !== 'targets') return isRadiologyAutofillResult(value);
  if (!Array.isArray(value.targets) || value.targets.length > 100) return false;
  const ids = new Set<number>();
  return value.targets.every((target: unknown) => {
    if (!record(target) || !tabId(target.tabId) || ids.has(target.tabId) || typeof target.title !== 'string'
      || target.title.length > 500 || typeof target.origin !== 'string') return false;
    try {
      if (new URL(target.origin).origin !== target.origin || identifyRadiology(`${target.origin}/request-consult`) !== target.provider) return false;
    } catch { return false; }
    ids.add(target.tabId);
    return true;
  });
}
