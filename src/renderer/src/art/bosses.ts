/**
 * Bosses and the Crystal Sentinel in pixel art (DESIGN.md 13, approved for the beta): 160 x 172
 * sprites drawn with the Brave Frontier technique, a soft aura in the boss colour instead of a white
 * sticker outline, and idle effects. The body barely moves (a one-pixel bob); the life is in the
 * effects, which loop on their own clocks:
 *
 * - Root Warden: spores drift up out of the moss, a leaf falls now and then.
 * - Cinder Lich: the crown and the skull staff burn, embers rise off the robe.
 * - Glacier Colossus: snow falls, frost mist puffs at the fists.
 * - Crystal Sentinel: sparkle motes; its four shards bob and light up as the attempt's score passes
 *   25, 50, 75 and 100%.
 *
 * Under reduced motion each boss shows one still frame.
 */
import type { BOSS_ARTS } from '../../../data';
import {
  defineLive,
  liveCanvas,
  liveMarkup,
  loadPixels,
  seeded,
  type LiveLayer,
} from './pixel/live';
import { rgbOf } from './pixel/raster';
import { sprite, spriteImage } from './pixel/sprites';
import { BOSS_LOOK, BOSS_VB, SHARD_POS, sentinelLevel } from './vector/bosses';

export { sentinelLevel };

export type BossArt = (typeof BOSS_ARTS)[number];

const [BX, BY, BW, BH] = BOSS_VB;
const FLAME = ['#fffbe0', '#ffe25a', '#ff9a2a', '#e8401e', '#8a1a12'];

interface Speck {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  kind: 'flame' | 'ember' | 'spore' | 'leaf' | 'snow' | 'mist' | 'spark';
}

function bossLayer(art: BossArt) {
  return async (host: HTMLElement, seed: number): Promise<LiveLayer> => {
    const level = Number(host.dataset['level'] ?? 0);
    const look = BOSS_LOOK[art];
    const [body, lit, dim] = await Promise.all([
      loadPixels(sprite(`boss-${art}`)!.url),
      loadPixels(sprite('boss-shard-lit')!.url),
      loadPixels(sprite('boss-shard-dim')!.url),
    ]);
    const main = host.querySelector<HTMLCanvasElement>('.bi-boss__main')!;
    const glowC = host.querySelector<HTMLCanvasElement>('.bi-boss__aura')!;
    const ctx = main.getContext('2d')!;
    const glow = glowC.getContext('2d')!;
    const W = main.width;
    const H = main.height;
    const R = seeded(seed);
    const stillImg = host.closest('svg.bi-boss')?.querySelector('.bi-boss__still');
    let ps: Speck[] = [];
    let t = 0;
    const spawn = (dt: number): void => {
      const add = (p: Omit<Speck, 'life'>): void => void ps.push({ ...p, life: 0 });
      // spawn chances are per second; a speck lives a second or two
      if (look.fx === 'fire') {
        for (const [x, y, w] of [
          [80, 6, 26],
          [126, 12, 14],
        ] as const)
          for (let k = 0; k < 3; k++)
            if (R() < 0.9 * dt * 12)
              add({
                x: x + (R() - 0.5) * w,
                y: y + R() * 4,
                vx: (R() - 0.5) * 6,
                vy: -18 - R() * 22,
                max: 0.35 + R() * 0.45,
                kind: 'flame',
              });
        if (R() < 3 * dt)
          add({
            x: 60 + R() * 70,
            y: 40 + R() * 80,
            vx: (R() - 0.5) * 8,
            vy: -12 - R() * 10,
            max: 1.2 + R(),
            kind: 'ember',
          });
      }
      if (look.fx === 'spores') {
        if (R() < 6 * dt)
          add({
            x: 40 + R() * 80,
            y: 60 + R() * 70,
            vx: (R() - 0.5) * 6,
            vy: -8 - R() * 8,
            max: 1.5 + R() * 1.5,
            kind: 'spore',
          });
        if (R() < 1 * dt)
          add({
            x: 20 + R() * 120,
            y: 20,
            vx: 8 + R() * 6,
            vy: 10 + R() * 6,
            max: 3,
            kind: 'leaf',
          });
      }
      if (look.fx === 'snow') {
        if (R() < 8 * dt)
          add({ x: R() * 160, y: -10, vx: -3 + R() * 2, vy: 14 + R() * 10, max: 6, kind: 'snow' });
        if (R() < 2 * dt)
          add({
            x: (R() < 0.5 ? 20 : 140) + (R() - 0.5) * 20,
            y: 130,
            vx: (R() - 0.5) * 10,
            vy: -4,
            max: 1.2,
            kind: 'mist',
          });
      }
      if (look.fx === 'motes' && R() < 4 * dt)
        add({ x: 30 + R() * 100, y: 10 + R() * 150, vx: 0, vy: -4, max: 1 + R(), kind: 'spark' });
      for (const p of ps) {
        p.life += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.kind === 'leaf') p.vx = 8 + Math.sin(t * 2 + p.y * 0.1) * 10;
      }
      ps = ps.filter((p) => p.life < p.max && p.y < 170);
    };
    return {
      step(dt, clock) {
        t = clock;
        // advance in small steps so specks spawn evenly
        for (let left = dt; left > 0; left -= 1 / 12) spawn(Math.min(left, 1 / 12));
      },
      draw() {
        const img = ctx.createImageData(W, H);
        const d = img.data;
        const plot = (x: number, y: number, c: readonly number[] | string): void => {
          const xi = Math.round(x);
          const yi = Math.round(y - BY);
          if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
          const v = typeof c === 'string' ? rgbOf(c) : c;
          const i = (yi * W + xi) * 4;
          d[i] = v[0]!;
          d[i + 1] = v[1]!;
          d[i + 2] = v[2]!;
          d[i + 3] = 255;
        };
        const blit = (src: ImageData, ox: number, oy: number): void => {
          for (let j = 0; j < src.height; j++)
            for (let i = 0; i < src.width; i++) {
              const s = (j * src.width + i) * 4;
              if (src.data[s + 3]! < 128) continue;
              const x = i + ox;
              const y = j + oy;
              if (x < 0 || y < 0 || x >= W || y >= H) continue;
              const o = (y * W + x) * 4;
              for (let k = 0; k < 4; k++) d[o + k] = src.data[s + k]!;
            }
        };
        if (art === 'crystal_sentinel')
          SHARD_POS.forEach(([x, y], k) => {
            // shards bob on their own cycles, two pixels at most; lit ones from the score
            const bob = Math.round(Math.sin(t * 2 + k) * 2);
            blit(k < level ? lit : dim, x, y + bob - BY);
          });
        // the body: a one-pixel breathing bob (the Sentinel floats two pixels)
        const bob =
          art === 'crystal_sentinel'
            ? Math.round(Math.sin(t * 1.6) * 2)
            : Math.floor(t * 1.6) % 2
              ? -1
              : 0;
        blit(body, 0, bob);
        for (const p of ps) {
          const a = p.life / p.max;
          if (p.kind === 'flame') {
            const c = FLAME[Math.min(4, Math.floor(a * 5))]!;
            plot(p.x, p.y, c);
            if (a < 0.5) {
              plot(p.x, p.y + 1, FLAME[Math.min(4, Math.floor(a * 5) + 1)]!);
              plot(p.x + 1, p.y + 1, c);
            }
          }
          if (p.kind === 'ember')
            plot(p.x, p.y, Math.floor(t * 12 + p.x) % 2 ? '#ffe25a' : '#ff9a2a');
          if (p.kind === 'spore') plot(p.x, p.y, a < 0.6 ? '#f4ffb0' : '#a0d040');
          if (p.kind === 'leaf') {
            plot(p.x, p.y, '#62ac3a');
            plot(p.x + 1, p.y, '#8ed64c');
            plot(p.x, p.y + 1, '#407e28');
          }
          if (p.kind === 'snow') {
            plot(p.x, p.y, '#ffffff');
            if (Math.floor(p.y) % 9 === 0) {
              plot(p.x - 1, p.y, '#c4eaff');
              plot(p.x + 1, p.y, '#c4eaff');
            }
          }
          if (p.kind === 'mist')
            for (let k = 0; k < 3 - Math.floor(a * 3); k++) plot(p.x + k * 2, p.y - k, '#c4eaff');
          if (p.kind === 'spark') {
            plot(p.x, p.y, '#ffffff');
            if (a < 0.5)
              for (const [dx, dy] of [
                [-1, 0],
                [1, 0],
                [0, -1],
                [0, 1],
              ] as const)
                plot(p.x + dx, p.y + dy, '#ffc8f4');
          }
        }
        ctx.putImageData(img, 0, 0);
        // the live figure bobs, so the still copy underneath must go once it draws
        stillImg?.setAttribute('visibility', 'hidden');
        // the soft aura: the same figure in the boss colour, blurred behind it, gently pulsing
        glow.clearRect(0, 0, W, H);
        glow.globalAlpha = 0.55 + 0.2 * Math.sin(t * 2.2);
        glow.drawImage(main, 0, 0);
        glow.globalCompositeOperation = 'source-in';
        glow.fillStyle = look.glow;
        glow.fillRect(0, 0, W, H);
        glow.globalCompositeOperation = 'source-over';
        glow.globalAlpha = 1;
      },
    };
  };
}
for (const art of ['root_warden', 'cinder_lich', 'glacier_colossus', 'crystal_sentinel'] as const)
  defineLive(`boss-${art}`, bossLayer(art));

/**
 * The boss as markup placed at (x, y, w, h) in the caller's units: the still sprite (so it shows
 * at once), then the live layer with the aura and idle effects on top.
 */
function bossMarkup(
  art: BossArt,
  level: number,
  x: number,
  y: number,
  w: number,
  h: number,
): string {
  const s = sprite(`boss-${art}`);
  if (!s) return '';
  const inner =
    liveCanvas('bi-boss__aura', s.w, s.h, 'filter:blur(4px)') +
    liveCanvas('bi-boss__main', s.w, s.h);
  const lv = Math.max(0, Math.min(4, Math.floor(level)));
  return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${BOSS_VB.join(' ')}" overflow="visible" class="bi-boss">${spriteImage(`boss-${art}`, BX, BY, BW, BH, 'bi-boss__still')}${liveMarkup(`boss-${art}`, BX, BY, BW, BH, inner, 3 + lv).replace('class="bi-px-live"', `class="bi-px-live" data-level="${lv}"`)}</svg>`;
}

/** The boss for the 100 x 100 portrait box (dungeons page: viewBox "-6 -8 112 112"). */
export function bossArt(art: BossArt, level = 0): string {
  return bossMarkup(art, level, -6, -8, 112, 112);
}

/** Boss art placed in the card item box (200 x 240), centred. */
export const bossInItemBox = (art: BossArt, level = 0): string =>
  `<g class="bi-item bi-item--boss">${bossMarkup(art, level, -6.4, 9.8, 212.8, 212.8)}</g>`;
