// Builds the extension and zips it for the Chrome Web Store. The store rejects
// manifests that contain `key`, so it is removed from the zipped copy only.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

execFileSync('node', ['scripts/build-extension.mjs'], { stdio: 'inherit' });

const zip = resolve('build-extension.zip');
const stage = mkdtempSync(join(tmpdir(), 'toothops-ext-'));
try {
  cpSync('build-extension', stage, { recursive: true });
  const mPath = join(stage, 'manifest.json');
  const manifest = JSON.parse(readFileSync(mPath, 'utf8'));
  delete manifest.key;
  writeFileSync(mPath, JSON.stringify(manifest, null, 2) + '\n');
  rmSync(zip, { force: true });
  execFileSync('zip', ['-r', '-X', '-q', zip, '.'], { cwd: stage, stdio: 'inherit' });
} finally {
  rmSync(stage, { recursive: true, force: true });
}
console.log(`Wrote ${zip} (manifest key removed)`);
