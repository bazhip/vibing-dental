// Builds the Chrome extension into build-extension/. Not part of `npm run build`.
//   node scripts/build-extension.mjs                 dev build (unpacked): allows http://localhost:5173
//   node scripts/build-extension.mjs --store <dir>   store build into <dir>: toothops.app only
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const storeAt = process.argv.indexOf('--store');
const store = storeAt >= 0;
const out = store ? process.argv[storeAt + 1] : 'build-extension';
if (!out) throw new Error('--store needs an output directory');
const LANGS = ['en', 'fr', 'de', 'it', 'es', 'hu', 'ro', 'zh', 'ar', 'pl'];
const DEV_ONLY_MATCH = 'http://localhost:5173/*';

// src/extension/version.ts reads this at build time.
process.env.VITE_EXTENSION_VERSION = pkg.version;
// src/extension/protocol.ts: the store build leaves the local dev origin out of ALLOWED_ORIGINS.
process.env.VITE_PIMS_STORE_BUILD = store ? '1' : '';

rmSync(out, { recursive: true, force: true });

const common = { configFile: false, logLevel: 'warn', publicDir: false };
const lib = (entry, formats, name, fileName, emptyOutDir) => ({
  ...common,
  build: { outDir: out, emptyOutDir, minify: false, lib: { entry, formats, name, fileName: () => fileName } },
});

await build(lib('src/extension/ezyvet/page.ts', ['iife'], 'ToothopsEzyvet', 'ezyvet-page.js', false));
await build(lib('src/extension/pims/page.ts', ['iife'], 'ToothopsPims', 'pims-page.js', false));
await build(lib('src/extension/background.ts', ['es'], undefined, 'background.js', false));
// The side panel: a React app (ES modules) with its own HTML entry, written as sidepanel.html +
// assets/. Vite loads .env from the repo root, so VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are
// inlined; without them the panel says the build isn't connected to ToothOps.
await build({
  ...common,
  root: resolve('src/extension/sidepanel'),
  envDir: resolve('.'),
  base: './',
  plugins: [react()],
  build: {
    outDir: resolve(out),
    emptyOutDir: false,
    // The panel bundles the i18n catalogs and the Supabase client; size is not a concern here.
    chunkSizeWarningLimit: 4096,
    rollupOptions: { input: resolve('src/extension/sidepanel/sidepanel.html') },
  },
});

const manifest = JSON.parse(readFileSync('src/extension/manifest.json', 'utf8'));
manifest.version = pkg.version;
if (store) {
  manifest.externally_connectable.matches = manifest.externally_connectable.matches.filter((m) => m !== DEV_ONLY_MATCH);
}
writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');

cpSync('src/extension/icons', `${out}/icons`, { recursive: true });

for (const lng of LANGS) {
  const { extension } = JSON.parse(readFileSync(`src/locales/${lng}/pims.json`, 'utf8'));
  const dir = `${out}/_locales/${lng === 'zh' ? 'zh_CN' : lng}`;
  mkdirSync(dir, { recursive: true });
  const messages = {
    extName: { message: extension.name },
    extDescription: { message: extension.description },
  };
  writeFileSync(`${dir}/messages.json`, JSON.stringify(messages, null, 2) + '\n');
}
console.log(`Built ${out} (version ${pkg.version}${store ? ', store build' : ''})`);
