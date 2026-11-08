import type { Rng } from '../../../game';
import type { BASE_EFFECTS } from './registry';
import { attackSheet, pixelTick, preloadNumerals } from '../art/cosmetics';
import { pixelUnit } from '../ui/pixelFit';
import './effects.css';

/**
 * Hit effects keyed by the ids cosmetic data uses (see registry.ts), drawn in pixel art (DESIGN.md
 * 13, approved for the beta): hard pixels on a coarse grid with a soft glow behind. Each hit gets
 * its own small canvas inside the stage, plays a few timed frames and removes itself.
 *
 * - Slash: one thin brush stroke, straight with a slight curve, a near-white core in a coloured
 *   stroke, re-rolled every hit (angle, length, thickness, bend, offset) and centred on the target.
 *   It snaps in, holds, then thins from the back and breaks into dashes.
 * - Impact (heavy hit, used by bows and pickaxes): a white star flash, a coloured burst and ring,
 *   the ring thins and breaks into segments while square chips fly out and shrink.
 *
 * Colours follow the equipped attack cosmetic (`--bi-attack-edge`, `--bi-attack-particle`). Hits
 * are skipped under reduced motion; tick numbers still show.
 */

type EffectId = (typeof BASE_EFFECTS)[number];

export interface HitOptions {
  rng: Rng;
  /** Element that flinches or thuds when hit (the boss emblem). */
  target?: Element | null;
}

const MAX_LIVE_HITS = 6;
const MAX_LIVE_TICKS = 10;
const INK = '#1a1020';
/**
 * Rendered CSS pixels per hit pixel: about the size of the card item's pixels. `pixelUnit` turns it
 * into stage units snapped to a whole number of device pixels (DESIGN.md §12 Clean pixels).
 */
const PX_WANT = 2;

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function layer(stage: HTMLElement): HTMLElement {
  let fx = stage.querySelector<HTMLElement>(':scope > .bi-fx-layer');
  if (!fx) {
    fx = document.createElement('div');
    fx.className = 'bi-fx-layer';
    stage.append(fx);
  }
  return fx;
}

function react(target: Element | null | undefined, cls: string): void {
  if (!target) return;
  target.classList.remove(cls);
  void (target as HTMLElement).getBoundingClientRect(); // restart the animation
  target.classList.add(cls);
}

const between = (rng: Rng, min: number, max: number): number => min + rng() * (max - min);

/** A CSS colour as '#rrggbb' (falls back when it cannot be read). */
function cssHex(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toLowerCase();
  const m = /rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(v);
  return m
    ? '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')
    : fallback;
}

interface Painter {
  /** Grid size in pixels. */
  w: number;
  h: number;
  set(x: number, y: number, c: string): void;
}
/** One frame of a hit: paints on the grid; returns false when the hit is over. */
type Frame = (p: Painter, ms: number) => boolean;

/** Spawns a pixel hit: a glow canvas and a hard-pixel canvas, ticked until the frame says done. */
function spawnHit(stage: HTMLElement, frame: Frame): void {
  const fx = layer(stage);
  while (fx.querySelectorAll('.bi-fx').length >= MAX_LIVE_HITS)
    fx.querySelector('.bi-fx')?.remove();
  const box = document.createElement('div');
  box.className = 'bi-fx bi-fx--px';
  const PX = pixelUnit(stage, PX_WANT);
  const w = Math.max(8, Math.ceil(stage.clientWidth / PX));
  const h = Math.max(8, Math.ceil(stage.clientHeight / PX));
  const mk = (style: string): HTMLCanvasElement => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.style.cssText = `position:absolute;left:0;top:0;width:${w * PX}px;height:${h * PX}px;image-rendering:pixelated;${style}`;
    return c;
  };
  const glow = mk('filter:blur(3px);opacity:.75');
  const hard = mk('');
  box.append(glow, hard);
  fx.append(box);
  const ctx = hard.getContext('2d')!;
  const gctx = glow.getContext('2d')!;
  const start = performance.now();
  const tick = (now: number): void => {
    if (!box.isConnected) return;
    const img = ctx.createImageData(w, h);
    const d = img.data;
    const painter: Painter = {
      w,
      h,
      set(x, y, c) {
        const xi = Math.round(x);
        const yi = Math.round(y);
        if (xi < 0 || yi < 0 || xi >= w || yi >= h) return;
        const i = (yi * w + xi) * 4;
        d[i] = parseInt(c.slice(1, 3), 16);
        d[i + 1] = parseInt(c.slice(3, 5), 16);
        d[i + 2] = parseInt(c.slice(5, 7), 16);
        d[i + 3] = 255;
      },
    };
    const alive = frame(painter, now - start);
    ctx.putImageData(img, 0, 0);
    gctx.clearRect(0, 0, w, h);
    gctx.drawImage(hard, 0, 0);
    if (alive) requestAnimationFrame(tick);
    else box.remove();
  };
  requestAnimationFrame(tick);
}

/** A filled disc of pixels. */
function disc(p: Painter, cx: number, cy: number, r: number, c: string): void {
  for (let y = Math.floor(cy - r); y <= cy + r; y++)
    for (let x = Math.floor(cx - r); x <= cx + r; x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) p.set(x, y, c);
}

/**
 * The thin slash: frames by time. 0-40 ms a thin bright line (the snap), 40-200 ms the full stroke
 * (held), then it thins from the back end and breaks into dashes until 420 ms.
 */
function slash(stage: HTMLElement, rng: Rng, chips: boolean): void {
  const edge = cssHex(stage, '--bi-attack-edge', '#ffd23a');
  const spark = cssHex(stage, '--bi-attack-particle', '#fff6d6');
  const PX = pixelUnit(stage, PX_WANT);
  const W = stage.clientWidth / PX;
  const H = stage.clientHeight / PX;
  const a = between(rng, -0.95, -0.15);
  const len = Math.min(W, H) * between(rng, 0.75, 0.95);
  const th = between(rng, 1.6, 2.4);
  const bend = (rng() < 0.5 ? -1 : 1) * len * between(rng, 0.06, 0.12);
  const cx = W / 2 + between(rng, -W * 0.06, W * 0.06);
  const cy = H / 2 + between(rng, -H * 0.06, H * 0.06);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const nx = -uy;
  const ny = ux;
  const N = Math.ceil(len * 1.5);
  const bits = Array.from({ length: chips ? 5 : 4 }, () => ({
    a: rng() * Math.PI * 2,
    v: between(rng, 10, 18),
    s: chips ? 2 : 1,
  }));
  spawnHit(stage, (p, ms) => {
    if (ms > 420) return false;
    const grow = Math.min(1, ms / 40);
    // after the hold, the back end eats forward and gaps open: dry-brush dashes
    const eat = ms < 200 ? 0 : (ms - 200) / 220;
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      if (s > grow || s < eat * 0.9) continue;
      if (eat > 0.15 && Math.floor(s * 22 + eat * 7) % 3 === 0) continue;
      const taper = Math.sin(Math.PI * s);
      const w = ms < 40 ? 0.5 : th * taper * (1 - eat * 0.6);
      const off = Math.sin(Math.PI * s) * bend;
      const x = cx + ux * len * (s - 0.5) + nx * off;
      const y = cy + uy * len * (s - 0.5) + ny * off;
      // ink edge, coloured body, white core (one-pixel layers)
      for (let k = -Math.ceil(w) - 1; k <= Math.ceil(w) + 1; k++) {
        const ak = Math.abs(k);
        const c =
          w >= 1 && ak <= w * 0.45
            ? '#ffffff'
            : ak <= Math.max(w, 0.5)
              ? edge
              : ak <= w + 1
                ? INK
                : '';
        if (c) p.set(x + nx * k, y + ny * k, c);
      }
    }
    // sparks or chips fly off the middle and shrink
    if (ms > 60)
      for (const b of bits) {
        const t = (ms - 60) / 360;
        const r = b.v * t * 2.2;
        const x = cx + Math.cos(b.a) * r;
        const y = cy + Math.sin(b.a) * r;
        const size = t < 0.5 ? b.s : b.s - 1;
        if (size >= 1) disc(p, x, y, size * 0.6, chips ? '#a08060' : spark);
        else p.set(x, y, spark);
      }
    return true;
  });
}

/**
 * The impact hit: a white 8-point star (held a little longer for punch), a coloured burst and ring,
 * the ring thins and breaks into segments, square chips fly out and shrink.
 */
function impact(stage: HTMLElement, rng: Rng): void {
  const edge = cssHex(stage, '--bi-attack-edge', '#ffd23a');
  const spark = cssHex(stage, '--bi-attack-particle', '#fff3d0');
  const PX = pixelUnit(stage, PX_WANT);
  const W = stage.clientWidth / PX;
  const H = stage.clientHeight / PX;
  const cx = W / 2 + between(rng, -W * 0.08, W * 0.08);
  const cy = H / 2 + between(rng, -H * 0.08, H * 0.08);
  const R = Math.min(W, H) * 0.28;
  const rot = rng() * Math.PI;
  const chips = Array.from({ length: 6 }, (_, i) => ({
    a: (i / 6) * Math.PI * 2 + rng(),
    v: between(rng, 0.7, 1.1),
  }));
  spawnHit(stage, (p, ms) => {
    if (ms > 480) return false;
    if (ms < 90) {
      // frame 1: the star flash
      for (let k = 0; k < 8; k++) {
        const a = rot + (k * Math.PI) / 4;
        const L = R * (k % 2 ? 0.45 : 0.8);
        for (let s = 0; s <= L; s++) p.set(cx + Math.cos(a) * s, cy + Math.sin(a) * s, '#ffffff');
      }
      disc(p, cx, cy, 2, '#ffffff');
      return true;
    }
    const t = (ms - 90) / 390;
    // burst core shrinks away
    if (t < 0.35) {
      disc(p, cx, cy, R * 0.45 * (1 - t * 2), edge);
      disc(p, cx, cy, R * 0.25 * (1 - t * 2.5), '#ffffff');
    }
    // the ring grows, thins and breaks into segments
    const rr = R * (0.5 + t * 0.9);
    const thick = t < 0.4 ? 2 : 1;
    const steps = Math.ceil(rr * 7);
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      if (t > 0.35 && Math.floor((a / (Math.PI * 2)) * 12) % 2 === 0) continue;
      if (t > 0.7 && Math.floor((a / (Math.PI * 2)) * 24) % 2 === 0) continue;
      for (let k = 0; k < thick; k++)
        p.set(cx + Math.cos(a) * (rr + k), cy + Math.sin(a) * (rr + k), edge);
    }
    // square chips fly and shrink
    for (const c of chips) {
      const d = R * (0.4 + t * 1.6 * c.v);
      const size = t < 0.4 ? 2 : t < 0.75 ? 1 : 0;
      const x = cx + Math.cos(c.a) * d;
      const y = cy + Math.sin(c.a) * d;
      for (let j = 0; j <= size; j++) for (let i = 0; i <= size; i++) p.set(x + i, y + j, spark);
    }
    return true;
  });
}

const effects: Record<EffectId, (stage: HTMLElement, opts: HitOptions) => void> = {
  'slash-sparks': (stage, { rng, target }) => {
    slash(stage, rng, false);
    react(target, 'bi-react-flinch');
  },
  'slash-chips': (stage, { rng, target }) => {
    slash(stage, rng, true);
    react(target, 'bi-react-flinch');
  },
  'heavy-hit': (stage, { rng, target }) => {
    impact(stage, rng);
    react(target, 'bi-react-thud');
  },
  // 'rise' is a tick style; see showTick.
  rise: () => undefined,
};

/**
 * A baked pixel slash (beta-batch attack cosmetics, `px-slash-<style>-<level>`): the four drawn
 * frames (snap, held hit, thinning, break) on the target, re-rolled every hit by mirroring and a
 * small offset (whole-pixel transforms only, so the pixels stay square), with a soft glow copy
 * behind as the approved effects style.
 */
function pixelSlash(stage: HTMLElement, effectId: string, rng: Rng): boolean {
  const sheet = attackSheet(effectId);
  if (!sheet) return false;
  const fx = layer(stage);
  while (fx.querySelectorAll('.bi-fx').length >= MAX_LIVE_HITS)
    fx.querySelector('.bi-fx')?.remove();
  const PX = pixelUnit(stage, PX_WANT);
  const size = sheet.size * PX;
  const box = document.createElement('div');
  box.className = 'bi-fx bi-fx--sheet';
  const dx = Math.round(between(rng, -0.06, 0.06) * stage.clientWidth);
  const dy = Math.round(between(rng, -0.06, 0.06) * stage.clientHeight);
  const sx = rng() < 0.5 ? -1 : 1;
  const sy = rng() < 0.25 ? -1 : 1;
  const cell = (style: string): HTMLElement => {
    const el = document.createElement('i');
    el.style.cssText =
      `position:absolute;left:calc(50% - ${size / 2}px + ${dx}px);top:calc(50% - ${size / 2}px + ${dy}px);` +
      `width:${size}px;height:${size}px;background:url("${sheet.sprite.url}") 0 0/${size * sheet.frames}px ${size}px no-repeat;` +
      `image-rendering:pixelated;transform:scale(${sx},${sy});${style}`;
    return el;
  };
  const glow = cell('filter:blur(3px);opacity:.7');
  const hard = cell('');
  box.append(glow, hard);
  fx.append(box);
  let t = 0;
  sheet.durations.forEach((d, i) => {
    window.setTimeout(() => {
      const pos = `${-i * size}px 0`;
      glow.style.backgroundPosition = pos;
      hard.style.backgroundPosition = pos;
    }, t);
    t += d;
  });
  window.setTimeout(() => box.remove(), t);
  return true;
}

/** Plays one hit of an attack effect. Skipped entirely with reduced motion. */
export function playHit(effectId: string, stage: HTMLElement, opts: HitOptions): void {
  if (prefersReducedMotion()) return;
  if (pixelSlash(stage, effectId, opts.rng)) {
    react(opts.target, 'bi-react-flinch');
    return;
  }
  const effect = effects[effectId as EffectId];
  if (!effect) throw new Error(`Unknown effect "${effectId}"`);
  effect(stage, opts);
}

let numeralsReady: Promise<void> | undefined;

/** Shows one floating damage or gain number. */
export function showTick(
  stage: HTMLElement,
  text: string,
  opts: { rng: Rng; crit?: boolean },
): void {
  const fx = layer(stage);
  const live = fx.querySelectorAll('.bi-tick');
  if (live.length >= MAX_LIVE_TICKS) live[0]?.remove();
  const tick = document.createElement('span');
  tick.className = `bi-tick${opts.crit ? ' bi-tick--crit' : ''}`;
  tick.style.setProperty('--x', `${between(opts.rng, 12, 64).toFixed(1)}%`);
  // a pixel tick style (beta-batch tick cosmetics) names itself in --bi-tick-px
  numeralsReady ??= preloadNumerals().catch(() => undefined);
  const px = getComputedStyle(stage).getPropertyValue('--bi-tick-px').trim();
  const cv = px ? pixelTick(px, text) : undefined;
  if (cv) {
    tick.classList.add('bi-tick--px');
    // whole device pixels per numeral pixel (DESIGN.md §12), 2 CSS px (3 for a crit) wanted
    const unit = pixelUnit(stage, opts.crit ? 3 : 2);
    cv.style.cssText = `display:block;width:${cv.width * unit}px;height:${cv.height * unit}px;image-rendering:pixelated`;
    tick.append(cv);
  } else tick.textContent = text;
  tick.setAttribute('aria-hidden', 'true');
  fx.append(tick);
  window.setTimeout(() => tick.remove(), 1150);
}
