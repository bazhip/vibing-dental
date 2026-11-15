// Builds the extension in store mode and zips it for the Chrome Web Store. The store build
// leaves out the local dev origin (manifest and background code). The store rejects manifests
// that contain `key`, so it is removed from the zipped copy; build-extension/ keeps it for dev.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const zip = resolve('build-extension.zip');
const stage = mkdtempSync(join(tmpdir(), 'toothops-ext-'));
try {
  execFileSync('node', ['scripts/build-extension.mjs', '--store', stage], { stdio: 'inherit' });
  const mPath = join(stage, 'manifest.json');
  const manifest = JSON.parse(readFileSync(mPath, 'utf8'));
  delete manifest.key;
  writeFileSync(mPath, JSON.stringify(manifest, null, 2) + '\n');
  for (const f of ['manifest.json', 'background.js', 'ezyvet-page.js']) {
    if (readFileSync(join(stage, f), 'utf8').includes('localhost')) throw new Error(`store build: ${f} mentions localhost`);
  }
  rmSync(zip, { force: true });
  execFileSync('zip', ['-r', '-X', '-q', zip, '.'], { cwd: stage, stdio: 'inherit' });
} finally {
  rmSync(stage, { recursive: true, force: true });
}
console.log(`Wrote ${zip} (store build, manifest key removed)`);
