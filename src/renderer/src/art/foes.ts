/**
 * Enemy, mini-boss and boss pictures cut from the asset packs (ASSET_RULES.md section 5): each is
 * a 160 x 172 canvas (the boss canvas, feet on one ground line) with a still `foe-<id>` and an
 * idle strip `foe-<id>-anim`, made by `scripts/art/cut-pack.py`.
 *
 * - A plain enemy plays its strip with CSS `steps()` (`art/pixel/animate.ts`): no loop, no canvas.
 * - The three new bosses (Abyssal Anchor Leviathan, Sanctuary Archangel, Faceless Void Reaper) get
 *   what the approved bosses have: a soft aura in the boss colour and an idle effect layer drawn
 *   on the sprite's own grid by the shared live loop (`art/pixel/live.ts`): bubbles and drips,
 *   feathers and light motes, void wisps. The body stays the pack's idle loop.
 * Under reduced motion both show the still.
 */
import {
  defineLive,
  liveCanvas,
  liveMarkup,
  loadPixels,
  reducedMotion,
  seeded,
} from './pixel/live';
import type { LiveLayer } from './pixel/live';
import { FRAME_MS, stripStyle } from './pixel/animate';
import { spriteImage, sprite, strip } from './pixel/sprites';
import { FONT } from './pixelFont';
import ZOOM from './foeZoom.json';
import FIT from './foeFit.json';

export const FOE_W = 160;
export const FOE_H = 172;
/** The row the feet stand on in the canvas (scripts/art/cut-pack.py), the origin of a zoom. */
const FOE_GROUND = 166;

/**
 * Whether a foe picture exists for this sprite id: the still, with an idle strip beside it for the
 * pack enemies. The newer approved pictures are stills only (no idle loop, shown as one frame).
 */
export const hasFoeSprite = (id: string | undefined): boolean => !!id && !!sprite(`foe-${id}`);

type FxKind = 'sea' | 'angel' | 'void';
/** The bosses with an aura and an idle effect layer. */
const FX: Readonly<Record<string, { glow: string; kind: FxKind }>> = {
  abyssal_anchor_leviathan: { glow: '#3fd0c8', kind: 'sea' },
  sanctuary_archangel: { glow: '#ffe9a0', kind: 'angel' },
  faceless_void_reaper: { glow: '#9a5cff', kind: 'void' },
};

/**
 * The whole-number zoom a small pack enemy is drawn at (1 for the rest), so every enemy fills its
 * card about as much as the 120 px bodies do. Made by `scripts/art/foe-zoom.py`.
 */
export const foeZoom = (id: string): number =>
  FX[id] ? 1 : ((ZOOM as Record<string, number>)[id] ?? 1);

/**
 * The whole-art-pixel nudge [dx, dy] that centres a still picture and stands it on the ground line
 * (feet at row 166; a floating ice wisp hangs a little higher). Measured from each picture's own
 * opaque box, so the file stays exactly as approved. Pictures not listed are already placed.
 */
export const foeFit = (id: string): readonly [number, number] =>
  (FIT as Record<string, [number, number]>)[id] ?? [0, 0];

const zoomStyle = (id: string): string => {
  const z = foeZoom(id);
  return z > 1 ? `transform:scale(${z});transform-origin:50% ${(FOE_GROUND / FOE_H) * 100}%;` : '';
};

interface Speck {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  kind: 'bubble' | 'drip' | 'feather' | 'mote' | 'wisp';
  phase: number;
}

const WISP = ['#e6ccff', '#b88cff', '#7a42d8', '#3a1a80'];

function foeLayer() {
  return async (host: HTMLElement, seed: number): Promise<LiveLayer> => {
    const id = host.dataset['foe'] ?? '';
    const fx = FX[id]!;
    const s = strip(`foe-${id}`)!;
    const pixels = await loadPixels(s.url);
    const main = host.querySelector<HTMLCanvasElement>('.bi-foe__main')!;
    const glowC = host.querySelector<HTMLCanvasElement>('.bi-foe__aura')!;
    const ctx = main.getContext('2d')!;
    const glow = glowC.getContext('2d')!;
    const R = seeded(seed);
    const still = host.closest('svg.bi-foe')?.querySelector('.bi-foe__still');
    let ps: Speck[] = [];
    let t = 0;
    const calm = reducedMotion();
    const add = (p: Omit<Speck, 'life' | 'phase'>): void =>
      void ps.push({ ...p, life: 0, phase: R() * 6.28 });
    const spawn = (dt: number): void => {
      if (fx.kind === 'sea') {
        if (R() < 5 * dt)
          add({
            x: 30 + R() * 100,
            y: 150 + R() * 14,
            vx: 0,
            vy: -16 - R() * 14,
            max: 1.6 + R(),
            kind: 'bubble',
          });
        if (R() < 4 * dt)
          add({
            x: 40 + R() * 80,
            y: 120 + R() * 30,
            vx: 0,
            vy: 30 + R() * 16,
            max: 0.55,
            kind: 'drip',
          });
      }
      if (fx.kind === 'angel') {
        if (R() < 2.2 * dt)
          add({
            x: 14 + R() * 132,
            y: 6 + R() * 30,
            vx: 0,
            vy: 9 + R() * 8,
            max: 5,
            kind: 'feather',
          });
        if (R() < 4 * dt)
          add({ x: 30 + R() * 100, y: 30 + R() * 130, vx: 0, vy: -4, max: 1 + R(), kind: 'mote' });
      }
      if (fx.kind === 'void' && R() < 6 * dt)
        add({
          x: 40 + R() * 80,
          y: 110 + R() * 56,
          vx: 0,
          vy: -12 - R() * 14,
          max: 1.5 + R() * 1.2,
          kind: 'wisp',
        });
      for (const p of ps) {
        p.life += dt;
        p.y += p.vy * dt;
        p.x +=
          (p.kind === 'drip' ? 0 : Math.sin(t * 2.2 + p.phase) * (p.kind === 'feather' ? 14 : 5)) *
          dt;
      }
      ps = ps.filter((p) => p.life < p.max && p.y < 172 && p.y > -4);
    };
    const dot = (x: number, y: number, w: number, h: number, c: string): void => {
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x), Math.round(y), w, h);
    };
    return {
      step(dt, clock) {
        t = clock;
        for (let left = dt; left > 0; left -= 1 / 12) spawn(Math.min(left, 1 / 12));
      },
      draw() {
        const frame = calm ? 0 : Math.floor((t * 1000) / FRAME_MS) % s.frames;
        ctx.clearRect(0, 0, FOE_W, FOE_H);
        ctx.putImageData(pixels, -frame * FOE_W, 0, frame * FOE_W, 0, FOE_W, FOE_H);
        for (const p of ps) {
          const a = p.life / p.max;
          if (p.kind === 'bubble') {
            dot(p.x, p.y, 2, 2, a < 0.7 ? '#bff4ff' : '#ffffff');
            dot(p.x, p.y, 1, 1, '#ffffff');
          } else if (p.kind === 'drip') dot(p.x, p.y, 1, 2, '#5cc8ff');
          else if (p.kind === 'feather') {
            dot(p.x, p.y, 3, 1, '#fff6e0');
            dot(p.x + 1, p.y + 1, 2, 1, '#e8d7a8');
          } else if (p.kind === 'mote') {
            dot(p.x, p.y, 1, 1, a < 0.5 ? '#fff3b0' : '#ffd860');
            if (a < 0.4) {
              dot(p.x - 1, p.y, 1, 1, '#ffe9a0');
              dot(p.x + 1, p.y, 1, 1, '#ffe9a0');
              dot(p.x, p.y - 1, 1, 1, '#ffe9a0');
              dot(p.x, p.y + 1, 1, 1, '#ffe9a0');
            }
          } else dot(p.x, p.y, 2, 2, WISP[Math.min(3, Math.floor(a * 4))]!);
        }
        still?.setAttribute('visibility', 'hidden');
        glow.clearRect(0, 0, FOE_W, FOE_H);
        glow.globalAlpha = 0.55 + 0.2 * Math.sin(t * 2.2);
        glow.drawImage(main, 0, 0);
        glow.globalCompositeOperation = 'source-in';
        glow.fillStyle = fx.glow;
        glow.fillRect(0, 0, FOE_W, FOE_H);
        glow.globalCompositeOperation = 'source-over';
        glow.globalAlpha = 1;
      },
    };
  };
}
defineLive('foe-fx', foeLayer());

/** The figure the placeholder fills in: an existing humanoid pack picture (its still, no new art). */
const PLACEHOLDER_BODY = 'foe-hooded_rogue_assassin';
const PLACEHOLDER_FILL = [0x3a, 0x40, 0x5e] as const;
const PLACEHOLDER_MARK = '#d2d8f4';
/** Where the question mark sits on the 160 x 172 canvas: left column, top row, art pixels per cell. */
const MARK = { x: 65, y: 62, cell: 6 };

/**
 * The picture shown for an enemy that has none ("picture to come"): the silhouette of an existing
 * pack figure filled with one dark colour, a question mark from the pixel font on it, on the same
 * 160 x 172 canvas and ground line as the real pictures. An enemy gets its own picture back by
 * dropping `hand/foe-<id>.png` and `foe-<id>-anim.png` in `art/pixel/` and baking
 * (`scripts/art/bake-pixels.mjs`): `foeHtml` uses the strip as soon as it exists.
 */
export function placeholderHtml(scale: number): string {
  const body = sprite(PLACEHOLDER_BODY);
  if (!body) return '';
  const [r, g, b] = PLACEHOLDER_FILL.map((v) => (v / 255).toFixed(3));
  const rows = FONT['?']!;
  let marks = '';
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '#')
        marks += `<rect x="${MARK.x + x * MARK.cell}" y="${MARK.y + y * MARK.cell}" width="${MARK.cell}" height="${MARK.cell}"/>`;
    }),
  );
  return `<svg class="bi-foe bi-foe--placeholder" width="${FOE_W * scale}" height="${FOE_H * scale}" viewBox="0 0 ${FOE_W} ${FOE_H}" overflow="visible" aria-hidden="true" focusable="false"><filter id="bi-foe-ph" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 0 0 0 1 0"/></filter><g filter="url(#bi-foe-ph)">${spriteImage(PLACEHOLDER_BODY, 0, 0, FOE_W, FOE_H)}</g><g fill="${PLACEHOLDER_MARK}" shape-rendering="crispEdges">${marks}</g></svg>`;
}

/**
 * The foe's picture as HTML at `scale` CSS px per art pixel (a whole number of device pixels, the
 * caller picks it: `stage/arena.ts`). The placeholder when the enemy has no picture.
 */
export function foeHtml(id: string, scale: number): string {
  const s = strip(`foe-${id}`);
  const still = sprite(`foe-${id}`);
  if (!s && !still) return placeholderHtml(scale);
  const w = FOE_W * scale;
  const h = FOE_H * scale;
  if (!s) {
    // a still picture: one frame, drawn like the strip but with no animation
    const [dx, dy] = foeFit(id);
    const zoom = dx || dy ? `transform:translate(${dx * scale}px,${dy * scale}px);` : '';
    return `<div class="bi-foe" data-sprite="foe-${id}" aria-hidden="true" style="width:${w}px;height:${h}px;${zoom}background-image:url(${still!.url});background-size:100% 100%;background-repeat:no-repeat;image-rendering:pixelated"></div>`;
  }
  const fx = FX[id];
  if (!fx) {
    const zoom = zoomStyle(id);
    return `<div class="bi-px-anim bi-foe" data-sprite="foe-${id}" aria-hidden="true" style="width:${w}px;height:${h}px;${zoom}${stripStyle(s)}"></div>`;
  }
  const inner =
    liveCanvas('bi-foe__aura', FOE_W, FOE_H, 'filter:blur(4px)') +
    liveCanvas('bi-foe__main', FOE_W, FOE_H);
  const live = liveMarkup('foe-fx', 0, 0, FOE_W, FOE_H, inner, 7).replace(
    'class="bi-px-live"',
    `class="bi-px-live" data-foe="${id}"`,
  );
  return `<svg class="bi-foe bi-foe--fx" width="${w}" height="${h}" viewBox="0 0 ${FOE_W} ${FOE_H}" overflow="visible" aria-hidden="true" focusable="false">${spriteImage(`foe-${id}`, 0, 0, FOE_W, FOE_H, 'bi-foe__still')}${live}</svg>`;
}
