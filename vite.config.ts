/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Vercel's project settings predate the Vite migration and serve the
    // CRA-era directory; keep emitting there rather than `dist`.
    outDir: 'build',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    // Agent worktrees live under .claude/ — never run their copies.
    exclude: [...configDefaults.exclude, '.claude/**'],
    // Edge functions import Standard Webhooks from esm.sh (Deno); tests use the npm copy.
    alias: { 'https://esm.sh/standardwebhooks@1.0.0': 'standardwebhooks' },
  },
});
