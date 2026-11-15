// IIFE entry injected into the ezyVet tab (world MAIN). Installs the page API once per version.
import { EXTENSION_VERSION } from '../version';
import { diagnostics, listFields, status } from './read';
import { write } from './write';

export type ToothopsEzyvet = {
  version: string;
  status: typeof status;
  listFields: typeof listFields;
  write: typeof write;
  diagnostics: typeof diagnostics;
};

declare global {
  interface Window {
    __toothopsEzyvet?: ToothopsEzyvet;
  }
}

if (window.__toothopsEzyvet?.version !== EXTENSION_VERSION) {
  window.__toothopsEzyvet = { version: EXTENSION_VERSION, status, listFields, write, diagnostics };
}
