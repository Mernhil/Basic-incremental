/**
 * Live pixel layers: the parts of the pixel art that move (frame shine, holo, evolution motion,
 * boss idle effects). Art functions return plain markup; a moving part is a `<foreignObject>`
 * holding a `.bi-px-live` box whose canvases one shared loop redraws on the sprite's own grid, in
 * whole pixels, at a capped frame rate, only while on screen and with the window visible.
 * Under reduced motion each layer draws one chosen still frame and never ticks (DESIGN.md 13).
 */
import { rnd } from '../kit';
import { rgbOf } from './raster';

export interface LiveLayer {
  /** Advance the simulation by dt seconds (t is the layer's own clock). */
  step(dt: number, t: number): void;
  /** Paint the current state. */
  draw(): void;
}
type Factory = (host: HTMLElement, seed: number) => Promise<LiveLayer> | LiveLayer;

const FPS = 12;
const kinds = new Map<string, Factory>();
const states = new WeakMap<HTMLElement, { layer?: LiveLayer; t: number; visible: boolean }>();
let raf = 0;
let last = 0;
let idleSince = 0;
let observer: IntersectionObserver | null = null;

export const reducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

/** Registers how a kind of live layer is built. */
export function defineLive(kind: string, factory: Factory): void {
  kinds.set(kind, factory);
}

/**
 * Markup for a live layer at (x, y, w, h) in the caller's SVG units. `inner` is the HTML inside the
 * box (canvases, a still image); the factory finds its canvases there.
 */
export function liveMarkup(
  kind: string,
  x: number,
  y: number,
  w: number,
  h: number,
  inner: string,
  seed = 1,
): string {
  ensureLoop();
  return `<foreignObject x="${x}" y="${y}" width="${w}" height="${h}" style="overflow:visible;pointer-events:none"><div xmlns="http://www.w3.org/1999/xhtml" class="bi-px-live" data-live="${kind}" data-seed="${seed}" style="position:relative;width:${w}px;height:${h}px">${inner}</div></foreignObject>`;
}

/** A canvas filling its live box, on a native grid of gw x gh pixels. */
export const liveCanvas = (cls: string, gw: number, gh: number, style = ''): string =>
  `<canvas class="${cls}" width="${gw}" height="${gh}" style="position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;${style}"></canvas>`;

function adopt(el: HTMLElement): void {
  const kind = el.dataset['live'] ?? '';
  const make = kinds.get(kind);
  const st = { t: 0, visible: true } as { layer?: LiveLayer; t: number; visible: boolean };
  states.set(el, st);
  if (!make) return;
  if (typeof IntersectionObserver !== 'undefined') {
    observer ??= new IntersectionObserver((entries) => {
      for (const e of entries) {
        const s = states.get(e.target as HTMLElement);
        if (s) s.visible = e.isIntersecting;
      }
    });
    observer.observe(el);
  }
  void Promise.resolve(make(el, Number(el.dataset['seed'] ?? 1))).then((layer) => {
    st.layer = layer;
    if (reducedMotion()) {
      // a calm, readable still: let the effect build up, then draw once
      for (let i = 0; i < 24; i++) layer.step(1 / FPS, (st.t += 1 / FPS));
    }
    layer.draw();
  });
}

function tick(now: number): void {
  raf = 0;
  if (typeof document === 'undefined') return;
  const els = document.querySelectorAll<HTMLElement>('.bi-px-live');
  if (els.length) idleSince = now;
  else if (now - idleSince > 10000) return;
  if (now - last >= 1000 / FPS && !document.hidden) {
    const dt = Math.min(0.25, (now - last) / 1000 || 1 / FPS);
    last = now;
    const still = reducedMotion();
    for (const el of els) {
      const st = states.get(el);
      if (!st) {
        adopt(el);
        continue;
      }
      if (still || !st.layer || !st.visible) continue;
      st.t += dt;
      st.layer.step(dt, st.t);
      st.layer.draw();
    }
  }
  raf = requestAnimationFrame(tick);
}

function ensureLoop(): void {
  if (typeof requestAnimationFrame === 'undefined' || raf) return;
  idleSince = performance.now();
  raf = requestAnimationFrame(tick);
}

// ---- helpers for layers ----

const pixelCache = new Map<string, Promise<ImageData>>();
/** The RGBA pixels of a baked sprite (decoded once, shared). */
export function loadPixels(url: string): Promise<ImageData> {
  let p = pixelCache.get(url);
  if (!p) {
    p = (async () => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, c.width, c.height);
    })();
    pixelCache.set(url, p);
  }
  return p;
}

/**
 * Hard pixels for an effect drawn with canvas paths: alpha snaps to on/off and every colour to the
 * nearest colour of the effect's own palette, so effects keep the clean-pixel rule (no AA fringe).
 */
export function harden(ctx: CanvasRenderingContext2D, palette: readonly string[]): void {
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const pal = palette.map(rgbOf);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3]! < 64) {
      d[i + 3] = 0;
      continue;
    }
    const r = d[i]!;
    const g = d[i + 1]!;
    const b = d[i + 2]!;
    let best = pal[0]!;
    let bd = Infinity;
    for (const p of pal) {
      const e = (p[0] - r) ** 2 * 0.3 + (p[1] - g) ** 2 * 0.59 + (p[2] - b) ** 2 * 0.11;
      if (e < bd) {
        bd = e;
        best = p;
      }
    }
    d[i] = best[0];
    d[i + 1] = best[1];
    d[i + 2] = best[2];
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

/** A seeded random source per layer, so stills and screenshots are stable. */
export const seeded = (seed: number): (() => number) => rnd(seed);
