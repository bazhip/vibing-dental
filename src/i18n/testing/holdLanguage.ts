// Test helper: makes a language's lazy catalogs load only when released, to
// simulate slow chunk downloads. Call `restoreLoaders` in afterEach.
import i18n, { catalogLoaders } from '../index';

const real = { ...catalogLoaders };

/** Drops `lng`'s loaded catalogs and gates its loaders; resolve with `release()`. */
export function holdLanguage(lng: string): { release: () => void } {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  for (const key of Object.keys(real).filter((k) => k.startsWith(`${lng}/`))) {
    const ns = key.slice(lng.length + 1);
    i18n.removeResourceBundle(lng, ns);
    catalogLoaders[key] = async () => {
      await gate;
      return real[key]();
    };
  }
  return { release };
}

/** Puts the real loaders back (bundles reload on next use). */
export function restoreLoaders(): void {
  Object.assign(catalogLoaders, real);
}
