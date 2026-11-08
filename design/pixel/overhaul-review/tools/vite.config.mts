// Vite config for the overhaul-review capture harness (design only, never shipped).
// The harness imports the real renderer art modules read-only, so captures match the game.
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const repo = resolve(import.meta.dirname, '..', '..', '..', '..');

export default defineConfig({
  root: import.meta.dirname,
  logLevel: 'warn',
  server: { port: 5199, strictPort: false, fs: { allow: [repo] } },
});
