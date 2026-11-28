import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { phoneViewportContent } from '../src/renderer/src/web/phoneViewport';
import { isActionTarget } from '../src/renderer/src/web/touchRules';
import { serviceWorkerSource, webManifest, webCacheName } from '../scripts/lib/webApp';

describe('phone viewport (DESIGN.md: iPhone web app, landscape on the 1920 x 1080 design)', () => {
  it('fits the design height in a wider-than-16:9 landscape screen', () => {
    // iPhone 15: 852 x 393 -> 1080 high, 1080 * 852 / 393 wide
    const c = phoneViewportContent({ long: 852, short: 393, portrait: false });
    expect(c).toContain(`width=${Math.round((1080 * 852) / 393)}`);
    expect(c).toContain('viewport-fit=cover');
    expect(c).toContain('user-scalable=no');
  });
  it('keeps 1920 wide on a screen narrower than 16:9 (the layout flexes taller)', () => {
    expect(phoneViewportContent({ long: 1024, short: 768, portrait: false })).toContain(
      'width=1920,',
    );
  });
  it('is exactly 1920 wide on a 16:9 screen', () => {
    expect(phoneViewportContent({ long: 1280, short: 720, portrait: false })).toContain(
      'width=1920,',
    );
  });
  it('uses the device width in portrait, for the turn-sideways screen', () => {
    expect(phoneViewportContent({ long: 852, short: 393, portrait: true })).toContain(
      'width=device-width',
    );
  });
  it('survives a zero-sized screen', () => {
    expect(phoneViewportContent({ long: 0, short: 0, portrait: false })).toContain('width=1920,');
  });
});

describe('touch rules', () => {
  it('knows which elements already do something on tap', () => {
    expect(isActionTarget('BUTTON', null)).toBe(true);
    expect(isActionTarget('A', null)).toBe(true);
    expect(isActionTarget('DIV', 'button')).toBe(true);
    expect(isActionTarget('DIV', 'tab')).toBe(true);
    expect(isActionTarget('SPAN', null)).toBe(false);
    expect(isActionTarget('DIV', null)).toBe(false);
  });
});

describe('web app files', () => {
  it('writes a standalone landscape manifest', () => {
    const m = webManifest('0.10.0');
    expect(m.name).toBe('Basic Incremental');
    expect(m.display).toBe('fullscreen');
    expect(m.orientation).toBe('landscape');
    expect(m.start_url).toBe('./');
    expect(m.icons.map((i) => i.sizes)).toContain('192x192');
    expect(m.icons.map((i) => i.sizes)).toContain('512x512');
  });

  it('names the cache by version and file list, so a new build is a new cache', () => {
    const a = webCacheName('0.10.0', ['index.html', 'a.js']);
    expect(webCacheName('0.10.0', ['index.html', 'a.js'])).toBe(a);
    expect(webCacheName('0.10.0', ['index.html', 'b.js'])).not.toBe(a);
    expect(webCacheName('0.10.1', ['index.html', 'a.js'])).not.toBe(a);
  });

  const run = (cacheName: string, files: string[]) => {
    const listeners: Record<string, (e: unknown) => void> = {};
    const stores = new Map<string, Map<string, string>>();
    const caches = {
      open: async (n: string) => {
        if (!stores.has(n)) stores.set(n, new Map());
        const s = stores.get(n)!;
        return {
          addAll: async (urls: string[]) =>
            urls.forEach((u) => s.set(new URL(u, 'https://x.test/game/').href, `body:${u}`)),
          put: async (r: { url: string }, v: string) => void s.set(r.url, v),
          match: async (r: string | { url: string }) =>
            s.get(typeof r === 'string' ? r : r.url) ?? undefined,
        };
      },
      keys: async () => [...stores.keys()],
      delete: async (n: string) => stores.delete(n),
      match: async (r: string | { url: string }) => {
        for (const s of stores.values()) {
          const v = s.get(typeof r === 'string' ? r : r.url);
          if (v !== undefined) return v;
        }
        return undefined;
      },
    };
    const self = {
      addEventListener: (t: string, fn: (e: unknown) => void) => (listeners[t] = fn),
      location: { origin: 'https://x.test' },
      registration: { scope: 'https://x.test/game/' },
      clients: { claim: async () => undefined },
    };
    runInNewContext(serviceWorkerSource(cacheName, files), { self, caches, URL, Promise });
    const wait = async (type: string): Promise<void> => {
      let p: Promise<unknown> = Promise.resolve();
      (listeners[type] as (e: unknown) => void)({ waitUntil: (x: Promise<unknown>) => (p = x) });
      await p;
    };
    return { stores, wait, listeners };
  };

  it('installs by caching every file and, once active, removes old caches', async () => {
    const sw = run('bi-new', ['./', 'index.html']);
    sw.stores.set('bi-old', new Map());
    await sw.wait('install');
    expect([...sw.stores.get('bi-new')!.keys()]).toEqual([
      'https://x.test/game/',
      'https://x.test/game/index.html',
    ]);
    await sw.wait('activate');
    expect([...sw.stores.keys()]).toEqual(['bi-new']);
  });

  it('answers a page request from the cache, and a navigation with index.html when offline', async () => {
    const sw = run('bi-new', ['./index.html']);
    await sw.wait('install');
    let answer: Promise<unknown> | undefined;
    sw.listeners.fetch!({
      request: { url: 'https://x.test/game/index.html', method: 'GET', mode: 'navigate' },
      respondWith: (p: Promise<unknown>) => (answer = p),
    });
    expect(await answer).toBe('body:./index.html');
  });
});
