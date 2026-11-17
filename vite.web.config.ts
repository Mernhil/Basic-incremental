import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// The phone / browser build (DESIGN.md §2 Web build): the same renderer as the desktop app, as a
// static site in out-web/. Relative base so it works from any address or folder.
const { version } = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as {
  version: string;
};

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  define: {
    __BI_DEV_BUILD__: JSON.stringify(false),
    __BI_WEB_VERSION__: JSON.stringify(version),
  },
  build: {
    outDir: resolve(__dirname, 'out-web'),
    emptyOutDir: true,
  },
});
