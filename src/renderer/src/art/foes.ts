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

export const FOE_W = 160;
export const FOE_H = 172;

/** Whether a foe picture (still and idle strip) exists for this sprite id. */
export const hasFoeSprite = (id: string | undefined): boolean =>
  !!id && !!sprite(`foe-${id}`) && !!strip(`foe-${id}`);

type FxKind = 'sea' | 'angel' | 'void';
/** The bosses with an aura and an idle effect layer. */
const FX: Readonly<Record<string, { glow: string; kind: FxKind }>> = {
  abyssal_anchor_leviathan: { glow: '#3fd0c8', kind: 'sea' },
  sanctuary_archangel: { glow: '#ffe9a0', kind: 'angel' },
  faceless_void_reaper: { glow: '#9a5cff', kind: 'void' },
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

/**
 * The foe's picture as HTML at `scale` CSS px per art pixel (a whole number of device pixels, the
 * caller picks it: `stage/arena.ts`). Empty when the sprite does not exist.
 */
export function foeHtml(id: string, scale: number): string {
  const s = strip(`foe-${id}`);
  if (!s) return '';
  const w = FOE_W * scale;
  const h = FOE_H * scale;
  const fx = FX[id];
  if (!fx) {
    return `<div class="bi-px-anim bi-foe" data-sprite="foe-${id}" aria-hidden="true" style="width:${w}px;height:${h}px;${stripStyle(s)}"></div>`;
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
