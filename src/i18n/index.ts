import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { NAMESPACES } from './config';

// Catalogs live at src/locales/<lng>/<ns>.json and are bundled eagerly.
const modules = import.meta.glob('../locales/*/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, Record<string, unknown>>;

const resources: Record<string, Record<string, Record<string, unknown>>> = {};
for (const [path, catalog] of Object.entries(modules)) {
  const match = path.match(/\/locales\/([^/]+)\/([^/]+)\.json$/);
  if (!match) continue;
  const [, lng, ns] = match;
  (resources[lng] ??= {})[ns] = catalog;
}

i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  ns: [...NAMESPACES],
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  returnNull: false,
  saveMissing: true,
  missingKeyHandler: (lngs, ns, key) => {
    if (import.meta.env.DEV) {
      console.error(`[i18n] missing key "${ns}:${key}" for ${lngs.join(', ')}`);
    }
  },
});

export default i18n;
