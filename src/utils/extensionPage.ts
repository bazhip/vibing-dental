/** True in the Chrome extension's own pages (the ezyVet side panel). */
export function isExtensionPage(protocol: string | undefined = globalThis.location?.protocol): boolean {
  return protocol === 'chrome-extension:';
}
