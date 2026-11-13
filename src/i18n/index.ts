import i18n, { type BackendModule } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { NAMESPACES } from './config';

type Catalog = Record<string, unknown>;
const parse = (path: string) => path.match(/\/locales\/([^/]+)\/([^/]+)\.json$/)?.slice(1) as [string, string] | undefined;

// Catalogs live at src/locales/<lng>/<ns>.json. English is bundled, and so is
// every language's `report` namespace: owner reports are rendered in any report
// language synchronously (getFixedT in ownerReportI18n), and they are small.
const bundled = import.meta.glob(['../locales/en/*.json', '../locales/*/report.json'], {
  eager: true,
  import: 'default',
}) as Record<string, Catalog>;

// Everything else is fetched as its own chunk the first time a language is used.
const lazy = import.meta.glob(['../locales/*/*.json', '!../locales/en/*.json', '!../locales/*/report.json'], {
  import: 'default',
}) as Record<string, () => Promise<Catalog>>;
/** Lazy catalog loaders keyed `lng/ns`. Exported so tests can stub a failing or slow chunk. */
export const catalogLoaders: Record<string, () => Promise<Catalog>> = {};
for (const [path, load] of Object.entries(lazy)) {
  const m = parse(path);
  if (m) catalogLoaders[`${m[0]}/${m[1]}`] = load;
}

const resources: Record<string, Record<string, Catalog>> = {};
for (const [path, catalog] of Object.entries(bundled)) {
  const m = parse(path);
  if (m) (resources[m[0]] ??= {})[m[1]] = catalog;
}

const lazyCatalogs: BackendModule = {
  type: 'backend',
  init() {},
  read(lng, ns, callback) {
    const load = catalogLoaders[`${lng}/${ns}`];
    // Unknown language/namespace pairs (e.g. the pseudo-locale) resolve empty.
    if (!load) return callback(null, {});
    load().then(
      (catalog) => callback(null, catalog),
      (err) => callback(err, false),
    );
  },
};

i18n
  .use(lazyCatalogs)
  .use(initReactI18next)
  .init({
    resources,
    partialBundledLanguages: true,
    // English is bundled, so init completes synchronously and t() works at once.
    initAsync: false,
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

/** Fetches the namespaces of `lng` not yet loaded and resolves whether all are now
 *  present. Await it before changeLanguage so the switch happens in one render; on
 *  `false` (e.g. offline) keep the current language. Uses reloadResources because
 *  i18next does not re-queue a pair that failed, so a later call really refetches. */
export async function loadLanguage(lng: string): Promise<boolean> {
  const missing = () =>
    Object.keys(catalogLoaders)
      .filter((k) => k.startsWith(`${lng}/`))
      .map((k) => k.slice(lng.length + 1))
      .filter((ns) => !i18n.hasResourceBundle(lng, ns));
  const todo = missing();
  if (todo.length) await new Promise<void>((resolve) => void i18n.reloadResources(lng, todo, () => resolve()));
  return missing().length === 0;
}

export default i18n;
