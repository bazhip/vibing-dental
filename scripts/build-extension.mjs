// Builds the Chrome extension into build-extension/. Not part of `npm run build`.
import { build } from 'vite';
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const out = 'build-extension';
const LANGS = ['en', 'fr', 'de', 'it', 'es'];

// src/extension/version.ts reads this at build time.
process.env.VITE_EXTENSION_VERSION = pkg.version;

rmSync(out, { recursive: true, force: true });

const common = { configFile: false, logLevel: 'warn', publicDir: false };
const lib = (entry, formats, name, fileName, emptyOutDir) => ({
  ...common,
  build: { outDir: out, emptyOutDir, minify: false, lib: { entry, formats, name, fileName: () => fileName } },
});

await build(lib('src/extension/ezyvet/page.ts', ['iife'], 'ToothopsEzyvet', 'ezyvet-page.js', false));
await build(lib('src/extension/background.ts', ['es'], undefined, 'background.js', false));

const manifest = JSON.parse(readFileSync('src/extension/manifest.json', 'utf8'));
manifest.version = pkg.version;
writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');

for (const lng of LANGS) {
  const { extension } = JSON.parse(readFileSync(`src/locales/${lng}/pims.json`, 'utf8'));
  const dir = `${out}/_locales/${lng}`;
  mkdirSync(dir, { recursive: true });
  const messages = {
    extName: { message: extension.name },
    extDescription: { message: extension.description },
  };
  writeFileSync(`${dir}/messages.json`, JSON.stringify(messages, null, 2) + '\n');
}
console.log(`Built ${out} (version ${pkg.version})`);
