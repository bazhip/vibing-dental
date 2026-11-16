/// <reference types="chrome" />
import { createTransport, type PimsTransport } from '../../utils/pims/extensionBridge';

/** The side panel talking to its own background worker (`chrome.runtime.onMessage`): the same
 *  requests and timeouts as the web page's `externalTransport`, without an extension id. */
export const internalTransport: PimsTransport = createTransport(() => {
  const rt = typeof chrome === 'undefined' ? undefined : chrome.runtime;
  if (!rt?.sendMessage) return undefined;
  return {
    sendMessage: (message, callback) => rt.sendMessage(message, callback),
    get lastError() {
      return rt.lastError;
    },
  };
});
