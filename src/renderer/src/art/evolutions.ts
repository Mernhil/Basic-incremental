/**
 * Unique evolutions (DESIGN.md §12): at ★6 some cards show a unique item in place of the generic
 * one. Each is a baked card-item sprite (the approved card-item treatment) with its own motion in
 * the approved effects style: hard pixels on the item's grid with a soft glow behind.
 *
 * - Flameblade (Ember Squire's sword): fire licks off both edges with drifting highs and lows,
 *   embers rise off the blade.
 * - Rootbloom Staff (Grove Keeper's staff): a ribbon of leaves spirals round the braid, wind gusts
 *   carry falling leaves with a little swirl, pollen rises from the bloom, the four earth crystals
 *   bob on their own slow cycles.
 * - Soul Reaper (stored for later): soul fire along the blade and wisps rising behind it.
 *
 * Most of each effect sits behind the item, about a fifth in front. Under reduced motion it shows
 * a still frame.
 */
import { INK } from './kit';
import {
  defineLive,
  harden,
  liveCanvas,
  liveMarkup,
  loadPixels,
  seeded,
  type LiveLayer,
} from './pixel/live';
import { sprite } from './pixel/sprites';
import { ITEM_BOX } from './items';
import { EVOLUTIONS, EVOLUTION_GEO, ROOTBLOOM_CRYSTALS, type Evolution } from './vector/items';

export { EVOLUTIONS, type Evolution };

type Ctx = CanvasRenderingContext2D;
interface Blade {
  spine: [number, number][];
  nor: [number, number][];
  ws: number[];
  tip: [number, number];
}

const FIRE = ['#ff3b2e', '#ff8a1f', '#ffd23a', '#fff6c8'] as const;
const HOT = [
  ['#ff3b2e', '#ff8a1f', '#ffd23a', '#fff6c8'],
  ['#e8261f', '#ff6a1a', '#ffc12e', '#fff1b0'],
  ['#ff5a2e', '#ffa22a', '#ffe25a', '#ffffff'],
] as const;
const SOUL = ['#5a1aa0', '#a64dff', '#e0a8ff', '#ffffff'] as const;
const LEAVES = ['#5fd35a', '#8fe06a', '#3fa84a', '#c8e05a'] as const;
const WIND = '#3fb8ff';
const POLLEN = '#fff6a0';
export const FRONT_SHARE = 0.22;

/** Everything an evolution's effect may draw: the hardening pass snaps to these. */
const PALETTE: Record<Evolution, readonly string[]> = {
  flameblade: [INK, ...HOT.flat(), '#ffffff'],
  soul_reaper: [INK, ...SOUL],
  rootbloom_staff: [INK, ...LEAVES, '#1f8a3e', '#2a7a2e', WIND, POLLEN, '#ffffff'],
};

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  t: number;
  m: number;
  fr?: boolean;
  asp?: number;
  wob?: number;
  lean?: number;
  v?: number;
  hue?: number;
  ang?: number;
  rot?: number;
  vr?: number;
  c?: string;
  ph?: number;
}

/** A gust profile along the blade: uneven, drifting highs and lows. */
const gust = (sv: number, t: number): number => {
  const v =
    0.5 +
    0.28 * Math.sin(sv * 11 + t * 1.1) +
    0.2 * Math.sin(sv * 23 - t * 1.9) +
    0.14 * Math.sin(sv * 5 + t * 0.55);
  return Math.max(0.12, Math.min(1.4, v * 1.35 - 0.1));
};

function edgePoint(
  geo: Blade,
  s: number,
  side: number,
  out = 0,
): { x: number; y: number; nx: number; ny: number } {
  const i = Math.round(s * (geo.spine.length - 1));
  const n = geo.nor[i]!;
  const w = geo.ws[i]! + out;
  const c = geo.spine[i]!;
  return { x: c[0] + n[0] * w * side, y: c[1] + n[1] * w * side, nx: n[0] * side, ny: n[1] * side };
}

/** A cel flame tongue: round base, pointed tip that wobbles; variant 1 forks, 2 curls. */
function tongue(ctx: Ctx, p: P, scale: number): void {
  const r = Math.max(0.4, p.r * scale);
  const h = r * (p.asp ?? 2.2);
  const wb = p.wob ?? 0;
  const lean = (p.lean ?? 0) * r;
  const curl = p.v === 2 ? r * 0.9 : 0;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.ang ?? 0);
  ctx.beginPath();
  ctx.moveTo(lean + curl, -h);
  if (p.v === 1) {
    ctx.quadraticCurveTo(lean * 0.5 + r * 0.25, -h * 0.55, lean * 0.4 + r * 0.05, -h * 0.62);
    ctx.quadraticCurveTo(lean * 0.6 + r * 0.5, -h * 0.9, lean + r * 0.55, -h * 0.82);
  }
  ctx.bezierCurveTo(r * (0.95 + wb), -h * 0.5, r * 1.12, -h * 0.06, r * 0.62, r * 0.42);
  ctx.quadraticCurveTo(0, r * 1.08, -r * 0.62, r * 0.42);
  ctx.bezierCurveTo(-r * 1.12, -h * 0.06, -r * (0.85 - wb), -h * 0.52, lean + curl, -h);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function celFlames(
  ctx: Ctx,
  ps: P[],
  R: () => number,
  pal: readonly string[] | null,
  outline = 2.2,
): void {
  for (const p of ps) {
    if (p.asp === undefined) {
      p.asp = 0.9 + Math.pow(R(), 0.7) * 2.4;
      p.wob = (R() - 0.5) * 0.5;
      p.lean = (R() - 0.5) * 0.9;
      p.v = R() < 0.2 ? 1 : R() < 0.2 ? 2 : 0;
      p.hue = Math.floor(R() * 3);
      p.r *= Math.exp((R() - 0.5) * 0.7);
    }
    p.ang = Math.atan2(p.vy, p.vx) + Math.PI / 2;
  }
  ctx.fillStyle = INK;
  for (const p of ps) tongue(ctx, p, 1 + outline / Math.max(1, p.r));
  for (let k = 0; k < 4; k++)
    for (const p of ps) {
      const cols = pal ?? HOT[p.hue ?? 0]!;
      const heat = Math.max(0, 1 - p.t * 0.9);
      const sc = [1, 0.78, 0.52, 0.26][k]! * (k ? Math.pow(heat, k * 0.5) : 1);
      if (sc * p.r < 0.4) continue;
      ctx.fillStyle = cols[k]!;
      tongue(ctx, p, sc);
    }
}

function celLeaves(ctx: Ctx, ps: P[]): void {
  for (const p of ps) {
    const r = Math.max(0.6, p.r) * 1.3;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot ?? p.x * 0.07 + p.y * 0.05);
    ctx.beginPath();
    ctx.moveTo(-r * 1.6, 0);
    ctx.quadraticCurveTo(0, -r * 1.05, r * 1.6, 0);
    ctx.quadraticCurveTo(0, r * 1.05, -r * 1.6, 0);
    ctx.closePath();
    ctx.fillStyle = p.c ?? LEAVES[0];
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

/** One effect on an item-box geometry: steps in item units, draws onto back and front. */
export interface Effect {
  step(back: Ctx, front: Ctx, dt: number): void;
  /** Hard-pixel extras drawn after hardening (embers, pollen specks, crystals). */
  specks?(plot: (x: number, y: number, c: string) => void, t: number): void;
}

export function edgeFire(
  geo: Blade,
  R: () => number,
  pal: readonly string[] | null,
  embers: boolean,
): Effect {
  let ps: P[] = [];
  let em: P[] = [];
  let T = 0;
  const rr = (a: number, b: number): number => a + R() * (b - a);
  return {
    step(back, front, dt) {
      T += dt;
      for (let i = 0; i < 160 * dt; i++) {
        const s = rr(0.06, 0.92);
        const side = R() < 0.5 ? -1 : 1;
        const g = gust(s + (side > 0 ? 0.37 : 0), T);
        if (R() > g / 1.4) continue;
        const e = edgePoint(geo, s, side, 1);
        const fr = R() < FRONT_SHARE;
        ps.push({
          x: e.x,
          y: e.y,
          vx: e.nx * 6 + rr(-3, 3),
          vy: -rr(12, 20) * (0.4 + g * g),
          r: rr(3.2, 5.5) * (0.55 + g * 0.55) * (fr ? 0.65 : 1),
          t: 0,
          m: rr(0.28, 0.45) * (0.5 + g * g * 0.9) * (fr ? 0.7 : 1),
          fr,
        });
      }
      for (const p of ps) {
        p.t += dt / p.m;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.r *= 1 - dt * 0.9;
      }
      ps = ps.filter((p) => p.t < 1);
      celFlames(
        back,
        ps.filter((p) => !p.fr),
        R,
        pal,
      );
      celFlames(
        front,
        ps.filter((p) => p.fr),
        R,
        pal,
        1.8,
      );
      if (embers) {
        if (R() < 5 * dt) {
          const e = edgePoint(geo, rr(0.2, 0.95), R() < 0.5 ? -1 : 1, 4);
          em.push({
            x: e.x,
            y: e.y,
            vx: rr(-8, 8),
            vy: rr(-34, -18),
            r: 1,
            t: 0,
            m: rr(1, 2),
            ph: rr(0, 6),
          });
        }
        for (const p of em) {
          p.t += dt / p.m;
          p.x += (p.vx + Math.sin(p.t * 9 + (p.ph ?? 0)) * 9) * dt;
          p.y += p.vy * dt;
        }
        em = em.filter((p) => p.t < 1);
      }
    },
    specks(plot, t) {
      // embers: single hard specks flickering yellow / orange, a 2 x 2 core while young
      for (const p of em) {
        const c = Math.floor(t * 12 + p.x) % 2 ? FIRE[2] : FIRE[1];
        plot(p.x, p.y, p.t > 0.8 ? FIRE[0] : c);
        if (p.t < 0.4) plot(p.x + 2, p.y, c);
      }
    },
  };
}

function spiralWrap(geo: Blade, R: () => number): Effect {
  let ps: { ph0: number; t: number; m: number; r: number; spin: number; c: string }[] = [];
  let ph = 0;
  let cd = 0;
  return {
    step(back, front, dt) {
      ph += dt * 2.4;
      cd -= dt;
      if (cd <= 0) {
        cd = 0.12 + R() * 0.1;
        ps.push({
          ph0: ph + (R() - 0.5) * 0.8,
          t: 0,
          m: 1.8 + R() * 0.6,
          r: 3.2 + R() * 1.2,
          spin: R() * 2 - 1,
          c: LEAVES[Math.floor(R() * 4)]!,
        });
      }
      const bk: P[] = [];
      const fr: P[] = [];
      for (const p of ps) {
        p.t += dt / p.m;
        const i = Math.round(p.t * (geo.spine.length - 1));
        const ang = p.ph0 + p.t * 14;
        const c = geo.spine[Math.min(i, geo.spine.length - 1)]!;
        const n = geo.nor[Math.min(i, geo.nor.length - 1)]!;
        const w = (geo.ws[Math.min(i, geo.ws.length - 1)]! + 6) * Math.sin(ang);
        const q: P = {
          x: c[0] + n[0] * w,
          y: c[1] + n[1] * w,
          vx: 0,
          vy: 0,
          r: p.r * (1 - p.t * 0.4),
          t: p.t,
          m: 1,
          rot: ang * 0.6 + p.spin * 2,
          c: p.c,
        };
        (Math.cos(ang) > 0 ? fr : bk).push(q);
      }
      ps = ps.filter((p) => p.t < 1);
      celLeaves(back, bk);
      celLeaves(front, fr);
    },
  };
}

export function soulWisps(R: () => number): Effect {
  let ps: P[] = [];
  return {
    step(back, _front, dt) {
      if (R() < 1.6 * dt)
        ps.push({
          x: 30 + R() * 160,
          y: 150 + R() * 70,
          vx: R() * 8 - 4,
          vy: -12 - R() * 10,
          r: 3.5 + R() * 2,
          t: 0,
          m: 1.6 + R(),
        });
      for (const p of ps) {
        p.t += dt / p.m;
        p.x += (p.vx + Math.sin(p.t * 8) * 6) * dt;
        p.y += p.vy * dt;
      }
      ps = ps.filter((p) => p.t < 1);
      celFlames(back, ps, R, SOUL, 1.8);
    },
  };
}

/** Falling leaves on a gusting wind, with a small swirl stroke where the wind blows. */
function windLeaves(R: () => number): Effect {
  let ps: P[] = [];
  let sw: { x: number; y: number; dir: number; t: number; m: number; s: number }[] = [];
  let t = 0;
  let cd = 0;
  return {
    step(back, front, dt) {
      t += dt;
      const wind =
        10 * Math.sin(t * 0.7) +
        14 * Math.max(0, Math.sin(t * 0.37)) ** 3 * (Math.sin(t * 2.3) > 0 ? 1 : -1);
      cd -= dt;
      if (cd <= 0) {
        cd = 0.25 + R() * 0.25;
        ps.push({
          x: 50 + R() * 110,
          y: 10 + R() * 60,
          vx: 0,
          vy: 8 + R() * 6,
          r: 2.8 + R() * 1.2,
          rot: R() * 6,
          vr: R() * 3 - 1.5,
          t: 0,
          m: 4 + R() * 2,
          c: LEAVES[Math.floor(R() * 4)]!,
          ph: R() * 6,
        });
      }
      if (R() < (Math.abs(wind) > 12 ? 1.6 : 0.5) * dt)
        sw.push({
          x: wind > 0 ? R() * 70 - 10 : 140 + R() * 70,
          y: 30 + R() * 190,
          dir: wind >= 0 ? 1 : -1,
          t: 0,
          m: 1.2 + R() * 0.6,
          s: 0.7 + R() * 0.5,
        });
      for (const p of ps) {
        p.t += dt / p.m;
        p.vx += (wind - p.vx) * dt * 1.2;
        p.x += (p.vx + Math.sin(t * 2 + (p.ph ?? 0)) * 6) * dt;
        p.y += p.vy * dt;
        p.rot = (p.rot ?? 0) + ((p.vr ?? 0) + p.vx * 0.04) * dt;
      }
      ps = ps.filter((p) => p.t < 1 && p.y < 250 && p.x > -20 && p.x < 220);
      // falling leaves pass in front of the staff
      celLeaves(front, ps);
      for (const w of sw) {
        w.t += dt / w.m;
        w.x += w.dir * 34 * dt;
      }
      sw = sw.filter((w) => w.t < 1);
      for (const w of sw) {
        // the swirl thins and breaks up as it passes, never fades (whole strokes only)
        if (w.t > 0.85) continue;
        back.save();
        back.translate(w.x, w.y);
        back.scale(w.dir * w.s, w.s);
        back.lineCap = 'round';
        const curl = (): void => {
          back.beginPath();
          back.moveTo(-18 + w.t * 14, 2);
          back.quadraticCurveTo(-4, 4, 4, 0);
          back.arc(4, -4, 4, Math.PI / 2, -Math.PI * 1.2, true);
        };
        back.strokeStyle = INK;
        back.lineWidth = 3.6;
        curl();
        back.stroke();
        back.strokeStyle = WIND;
        back.lineWidth = 1.8;
        curl();
        back.stroke();
        back.restore();
      }
    },
  };
}

function pollen(R: () => number): Effect {
  let ps: P[] = [];
  return {
    step(_back, _front, dt) {
      if (R() < 2.4 * dt)
        ps.push({
          x: 104 + R() * 28 - 14,
          y: 70 + R() * 16 - 8,
          vx: R() * 16 - 8,
          vy: -8 - R() * 8,
          r: 1,
          t: 0,
          m: 1.6 + R(),
        });
      for (const p of ps) {
        p.t += dt / p.m;
        p.x += (p.vx + Math.sin(p.t * 7) * 5) * dt;
        p.y += p.vy * dt;
      }
      ps = ps.filter((p) => p.t < 1);
    },
    specks(plot) {
      // pollen: a 2 x 2 speck that shrinks to one pixel before it goes
      for (const p of ps) {
        plot(p.x, p.y, POLLEN);
        if (p.t < 0.6) {
          plot(p.x + 2, p.y, POLLEN);
          plot(p.x, p.y + 2, POLLEN);
          plot(p.x + 2, p.y + 2, POLLEN);
        }
      }
    },
  };
}

function effectsFor(id: Evolution, R: () => number): Effect[] {
  const geo = EVOLUTION_GEO[id] as unknown as Blade;
  if (id === 'flameblade') return [edgeFire(geo, R, null, true)];
  if (id === 'soul_reaper') return [edgeFire(geo, R, SOUL, false), soulWisps(R)];
  return [spiralWrap(geo, R), windLeaves(R), pollen(R)];
}

function evolutionLayer(id: Evolution) {
  return async (host: HTMLElement, seed: number): Promise<LiveLayer> => {
    const [glowC, backC, frontC] = ['glow', 'back', 'front'].map((k) =>
      host.querySelector<HTMLCanvasElement>(`.bi-evo__${k}`)!,
    );
    const glow = glowC!.getContext('2d')!;
    const back = backC!.getContext('2d', { willReadFrequently: true })!;
    const front = frontC!.getContext('2d', { willReadFrequently: true })!;
    const W = backC!.width;
    const H = backC!.height;
    const k = W / ITEM_BOX.w;
    const R = seeded(seed);
    const fxs = effectsFor(id, R);
    const crystals =
      id === 'rootbloom_staff'
        ? await Promise.all(
            ROOTBLOOM_CRYSTALS.map((_, i) =>
              loadPixels(sprite(`evo-rootbloom_staff-crystal${i}`)!.url),
            ),
          )
        : [];
    const scratch = document.createElement('canvas').getContext('2d')!;
    let pending = 0;
    let t = 0;
    return {
      step(dt, clock) {
        pending += dt;
        t = clock;
      },
      draw() {
        for (const c of [back, front]) {
          c.setTransform(k, 0, 0, k, 0, 0);
          c.clearRect(0, 0, ITEM_BOX.w, ITEM_BOX.h);
        }
        // effects are slow and calm: simulate at 0.6x real time, in small steps
        let dt = pending * 0.6;
        pending = 0;
        // only the last sub-step paints; earlier ones advance the simulation off screen
        while (dt > 0) {
          const s = Math.min(dt, 1 / 30);
          dt -= s;
          const final = dt <= 0;
          for (const f of fxs) f.step(final ? back : scratch, final ? front : scratch, s);
        }
        for (const c of [back, front]) c.setTransform(1, 0, 0, 1, 0, 0);
        harden(back, PALETTE[id]);
        harden(front, PALETTE[id]);
        const img = front.getImageData(0, 0, W, H);
        const plot = (x: number, y: number, c: string): void => {
          const i = Math.round(x * k);
          const j = Math.round(y * k);
          if (i < 0 || j < 0 || i >= W || j >= H) return;
          const o = (j * W + i) * 4;
          img.data[o] = parseInt(c.slice(1, 3), 16);
          img.data[o + 1] = parseInt(c.slice(3, 5), 16);
          img.data[o + 2] = parseInt(c.slice(5, 7), 16);
          img.data[o + 3] = 255;
        };
        for (const f of fxs) f.specks?.(plot, t);
        // Rootbloom: the earth crystals float, each on its own slow cycle, one pixel at a time
        crystals.forEach((c, i) => {
          const [cx, cy] = ROOTBLOOM_CRYSTALS[i]!;
          const bob = Math.round(Math.sin(t * (1.1 + i * 0.23) + i * 1.7) * 1.5);
          const ox = Math.round(cx * k) - (c.width >> 1);
          const oy = Math.round(cy * k) - (c.height >> 1) + bob;
          for (let j = 0; j < c.height; j++)
            for (let ii = 0; ii < c.width; ii++) {
              const s = (j * c.width + ii) * 4;
              if (c.data[s + 3]! < 128) continue;
              const x = ox + ii;
              const y = oy + j;
              if (x < 0 || y < 0 || x >= W || y >= H) continue;
              const o = (y * W + x) * 4;
              for (let q = 0; q < 4; q++) img.data[o + q] = c.data[s + q]!;
            }
        });
        front.putImageData(img, 0, 0);
        glow.clearRect(0, 0, W, H);
        glow.drawImage(backC!, 0, 0);
        glow.drawImage(frontC!, 0, 0);
      },
    };
  };
}
for (const id of EVOLUTIONS) defineLive(`evo-${id}`, evolutionLayer(id));

/**
 * A unique evolution in the 200 x 240 item box: drop-in for a card's `item` markup. It carries no
 * traced outline, so the card's element effect stays off while the evolution plays its own motion.
 */
export function evolutionArt(id: Evolution): string {
  const s = sprite(`evo-${id}`);
  if (!s) return '';
  const inner =
    liveCanvas('bi-evo__glow', s.w, s.h, 'filter:blur(3px);opacity:.65') +
    liveCanvas('bi-evo__back', s.w, s.h) +
    `<img src="${s.url}" alt="" style="position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated"/>` +
    liveCanvas('bi-evo__front', s.w, s.h);
  return `<g class="bi-item bi-evo">${liveMarkup(`evo-${id}`, 0, 0, ITEM_BOX.w, ITEM_BOX.h, inner, 7)}</g>`;
}
