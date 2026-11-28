import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { THEME_COLOR, serviceWorkerSource, webCacheName, webManifest } from './scripts/lib/webApp';

// The phone / browser build (DESIGN.md §2 Web build): the same renderer as the desktop app, as a
// static site in out-web/. Relative base so it works from any address or folder.
const { version } = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as {
  version: string;
};

const outDir = resolve(__dirname, 'out-web');

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

/** The home-screen app: manifest, iOS tags in index.html, and the offline service worker (web build only, never the desktop one). */
function homeScreenApp(): Plugin {
  return {
    name: 'bi-home-screen-app',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'link', attrs: { rel: 'manifest', href: './manifest.webmanifest' }, injectTo: 'head' },
      {
        tag: 'link',
        attrs: { rel: 'apple-touch-icon', href: './apple-touch-icon.png' },
        injectTo: 'head',
      },
      { tag: 'meta', attrs: { name: 'theme-color', content: THEME_COLOR }, injectTo: 'head' },
      {
        tag: 'meta',
        attrs: { name: 'mobile-web-app-capable', content: 'yes' },
        injectTo: 'head',
      },
      {
        tag: 'meta',
        attrs: { name: 'apple-mobile-web-app-capable', content: 'yes' },
        injectTo: 'head',
      },
      {
        tag: 'meta',
        attrs: { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        injectTo: 'head',
      },
      {
        tag: 'meta',
        attrs: { name: 'apple-mobile-web-app-title', content: 'Basic Incremental' },
        injectTo: 'head',
      },
      {
        tag: 'meta',
        attrs: { name: 'format-detection', content: 'telephone=no' },
        injectTo: 'head',
      },
    ],
    closeBundle() {
      writeFileSync(
        join(outDir, 'manifest.webmanifest'),
        JSON.stringify(webManifest(version), null, 2),
      );
      const files = listFiles(outDir)
        .map((f) => relative(outDir, f).replaceAll(sep, '/'))
        .filter((f) => f !== 'sw.js')
        .sort();
      const urls = ['./', ...files.map((f) => `./${f}`)];
      writeFileSync(join(outDir, 'sw.js'), serviceWorkerSource(webCacheName(version, files), urls));
    },
  };
}

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  publicDir: resolve(__dirname, 'web-app/public'),
  plugins: [homeScreenApp()],
  define: {
    __BI_DEV_BUILD__: JSON.stringify(false),
    __BI_WEB_VERSION__: JSON.stringify(version),
  },
  build: {
    outDir,
    emptyOutDir: true,
  },
});
