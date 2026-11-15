// Builds the extension in store mode and zips it for the Chrome Web Store. The store build
// leaves out the local dev origin (manifest and background code). The store rejects manifests
// that contain `key`, so it is removed from the zipped copy; build-extension/ keeps it for dev.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

const zip = resolve('build-extension.zip');
const stage = mkdtempSync(join(tmpdir(), 'toothops-ext-'));
try {
  execFileSync('node', ['scripts/build-extension.mjs', '--store', stage], { stdio: 'inherit' });
  const mPath = join(stage, 'manifest.json');
  const manifest = JSON.parse(readFileSync(mPath, 'utf8'));
  delete manifest.key;
  writeFileSync(mPath, JSON.stringify(manifest, null, 2) + '\n');
  // Our own code must not mention localhost at all. The side panel bundle also carries
  // supabase-js, whose auth code names localhost (its default server URL and WebAuthn host
  // checks), so every other text file is checked for the dev origin itself.
  const STRICT = ['manifest.json', 'background.js', 'ezyvet-page.js'];
  const files = readdirSync(stage, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.(js|mjs|html|css|json)$/.test(e.name))
    .map((e) => relative(stage, join(e.parentPath, e.name)));
  for (const f of STRICT) if (!files.includes(f)) throw new Error(`store build: ${f} is missing`);
  if (!files.includes('sidepanel.html')) throw new Error('store build: sidepanel.html is missing');
  for (const f of files) {
    const text = readFileSync(join(stage, f), 'utf8');
    if (STRICT.includes(f) ? text.includes('localhost') : /localhost:5173/.test(text)) {
      throw new Error(`store build: ${f} mentions localhost`);
    }
  }
  rmSync(zip, { force: true });
  execFileSync('zip', ['-r', '-X', '-q', zip, '.'], { cwd: stage, stdio: 'inherit' });
} finally {
  rmSync(stage, { recursive: true, force: true });
}
console.log(`Wrote ${zip} (store build, manifest key removed)`);
