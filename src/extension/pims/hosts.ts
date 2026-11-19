import type { PimsId } from './types';

const DOMAINS: Record<string, PimsId> = {
  'ezyvet.com': 'ezyvet',
  'vettersoftware.com': 'daysmart',
  'instinctvet.cloud': 'instinct',
  'instinctvet.com': 'instinct',
  'evetpractice.com': 'pulse',
  'rhapsody.vet': 'rhapsody',
  'shepherd.vet': 'shepherd',
  'vetspire.com': 'vetspire',
};

export const PIMS_HOST_PERMISSIONS = Object.keys(DOMAINS).map((domain) => `https://*.${domain}/*`);

export function identifyPims(value: string): PimsId | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const domain = Object.keys(DOMAINS).find((candidate) => url.hostname === candidate || url.hostname.endsWith(`.${candidate}`));
    return domain ? DOMAINS[domain] : null;
  } catch {
    return null;
  }
}
