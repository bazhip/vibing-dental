import { EXTENSION_VERSION } from '../version';
import { createPageBridge } from './bridge';
import { adapterFor } from './registry';
import type { AdapterContext } from './types';

export type ToothopsPims = ReturnType<typeof createPageBridge>;

declare global {
  interface Window {
    __toothopsPims?: ToothopsPims;
  }
}

function contextNow(): AdapterContext {
  return {
    doc: document, url: new URL(location.href), currentUrl: () => new URL(location.href),
    fetch: window.fetch.bind(window), localStorage: window.localStorage, sessionStorage: window.sessionStorage,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

if (window.__toothopsPims?.version !== EXTENSION_VERSION || !window.__toothopsPims.providerSync || !window.__toothopsPims.physicalExam) {
  window.__toothopsPims = createPageBridge(() => adapterFor(location.href), contextNow);
}
