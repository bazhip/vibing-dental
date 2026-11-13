// Run a TypeScript script through Vite's module runner, so app modules that
// use Vite features (import.meta.glob in src/i18n) load outside the app.
//   node scripts/vite-run.mjs scripts/replay-transcript.ts [args…]
import { runnerImport } from 'vite';

const [script, ...rest] = process.argv.slice(2);
if (!script) {
  console.error('usage: node scripts/vite-run.mjs <script.ts> [args…]');
  process.exit(1);
}
process.argv = [process.argv[0], script, ...rest];
await runnerImport(script);
