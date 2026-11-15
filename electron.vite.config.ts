import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';

// the local dev build (scripts/dist-dev.mjs) is the only thing that sets BI_DEV_BUILD=1. It builds
// into out-dev/ (never out/) and bakes the flag in, which turns the dev cheats on in a packaged
// app. Every public build leaves it false, so Vite drops the cheats from the bundle.
const devBuild = process.env['BI_DEV_BUILD'] === '1';
const outRoot = devBuild ? 'out-dev' : 'out';
const define = { __BI_DEV_BUILD__: JSON.stringify(devBuild) };

export default defineConfig({
  main: {
    define,
    build: {
      outDir: resolve(__dirname, outRoot, 'main'),
      rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } },
    },
  },
  preload: {
    build: {
      outDir: resolve(__dirname, outRoot, 'preload'),
      rollupOptions: { input: { index: resolve(__dirname, 'src/preload/index.ts') } },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    define,
    build: {
      outDir: resolve(__dirname, outRoot, 'renderer'),
      rollupOptions: { input: { index: resolve(__dirname, 'src/renderer/index.html') } },
    },
  },
});
