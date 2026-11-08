/**
 * Motion for the two new Uniques (twin daggers, bronze hammer), sprites in the game bundle.
 * No card owns them yet, so nothing imports this file and they are not in `EVOLUTIONS` (DESIGN §12). It runs
 * the same effect code as Flameblade and Soul Reaper (`evolutions.ts`): cel flames licking off the
 * blade edges on a spine fitted to the sprite, drifting wisps and hard embers, on the same live-layer
 * loop (hard pixels on the item grid, a soft glow behind, about a fifth of the effect in front).
 *
 * - Twin daggers: violet soul-fire off both blades, wisps rising between them.
 * - Bronze hammer: forge heat off the head, orange embers and a slow metal glint over the studs.
 *
 * `draftUniqueArt(id, spriteUrl)` returns markup like `evolutionArt`.
 */
import { INK } from './kit';
import { ITEM_BOX } from './items';
import {
  defineLive,
  harden,
  liveCanvas,
  liveMarkup,
  loadPixels,
  seeded,
  type LiveLayer,
} from './pixel/live';
import { makeBlade } from './vector/items';
import { edgeFire, soulWisps, type Effect } from './evolutions';

export type DraftUnique = 'twin_daggers' | 'bronze_hammer';

const VIOLET = ['#5a1aa0', '#a64dff', '#e0a8ff', '#ffffff'] as const;
const FORGE = ['#6a2c0e', '#c4601c', '#f0a040', '#fff0b0'] as const;
const PALETTE: Record<DraftUnique, readonly string[]> = {
  twin_daggers: [INK, ...VIOLET],
  bronze_hammer: [INK, ...FORGE, '#ffffff'],
};

// blade paths in the 200 x 240 item box (2 units per sprite pixel), read off the sprites
const GEO = {
  dagger_left: makeBlade(
    [
      [84, 104],
      [100, 76],
      [120, 44],
      [136, 18],
    ],
    (s) => 10 * Math.pow(1 - s, 0.7) + 1.5,
  ),
  dagger_right: makeBlade(
    [
      [152, 144],
      [160, 120],
      [172, 92],
      [184, 60],
    ],
    (s) => 9 * Math.pow(1 - s, 0.7) + 1.5,
  ),
  // the hammer head's upper edge, left to right
  hammer_head: makeBlade(
    [
      [92, 82],
      [120, 58],
      [150, 42],
      [186, 36],
    ],
    () => 12,
  ),
};

/** A slow bright glint travelling over the bronze studs and edges of the hammer head. */
function hammerGlint(): Effect {
  let t = 0;
  return {
    step(_back, _front, dt) {
      t += dt;
    },
    specks(plot, clock) {
      const k = (clock * 0.55) % 1;
      const x = 96 + k * 96;
      const y = 78 - k * 40;
      const ph = Math.floor(((clock * 8) % 12) / 3);
      if (ph > 2) return;
      const c = '#ffffff';
      plot(x, y, c);
      if (ph === 1) {
        plot(x - 2, y, c);
        plot(x + 2, y, c);
        plot(x, y - 2, c);
        plot(x, y + 2, c);
      }
      void t;
    },
  };
}

function effectsFor(id: DraftUnique, R: () => number): Effect[] {
  if (id === 'twin_daggers')
    return [
      edgeFire(GEO.dagger_left, R, VIOLET, false),
      edgeFire(GEO.dagger_right, R, VIOLET, false),
      soulWisps(R),
    ];
  return [edgeFire(GEO.hammer_head, R, FORGE, true), hammerGlint()];
}

function layerFor(id: DraftUnique) {
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
        let dt = pending * 0.6;
        pending = 0;
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
        front.putImageData(img, 0, 0);
        glow.clearRect(0, 0, W, H);
        glow.drawImage(backC!, 0, 0);
        glow.drawImage(frontC!, 0, 0);
      },
    };
  };
}

for (const id of ['twin_daggers', 'bronze_hammer'] as const)
  defineLive(`draft-evo-${id}`, layerFor(id));

/** The unique in the 200 x 240 item box, its sprite from `spriteUrl` (100 x 120), with live motion. */
export async function draftUniqueArt(id: DraftUnique, spriteUrl: string): Promise<string> {
  await loadPixels(spriteUrl); // warm the cache; the layer itself only needs the canvases
  const inner =
    liveCanvas('bi-evo__glow', 100, 120, 'filter:blur(3px);opacity:.65') +
    liveCanvas('bi-evo__back', 100, 120) +
    `<img src="${spriteUrl}" alt="" style="position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated"/>` +
    liveCanvas('bi-evo__front', 100, 120);
  return `<g class="bi-item bi-evo">${liveMarkup(`draft-evo-${id}`, 0, 0, ITEM_BOX.w, ITEM_BOX.h, inner, 7)}</g>`;
}
