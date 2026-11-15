import { describe, expect, it } from 'vitest';
import { backdropOf } from '../src/game';
import { sprite, strip } from '../src/renderer/src/art/pixel/sprites';
import { kitName } from '../src/renderer/src/art/frame';
import { BACKDROP, BACKDROP_MOTION, SeaSim, backdropLayers } from '../src/renderer/src/art/seaSim';
import { content } from './helpers';

const DRAGON = [
  'solaris',
  'grimhowl',
  'skypiercer',
  'sunrider',
  'nightsting',
  'grave_anvil',
  'starweaver',
  'soulwell',
  'last_breath',
  'heartdelver',
  'elderwarden',
];

/** DESIGN §5 Heirloom backdrops: the backdrop follows the card's batch and rarity. */
describe('Heirloom backdrops', () => {
  it('gives Dragon Heirlooms the hero (mythic) or villain (void) picture, static', () => {
    for (const id of DRAGON) {
      const c = content.cardById.get(id)!;
      expect(c.heirloom, id).toBe(true);
      expect(c.batch, id).toBeUndefined();
      const bd = backdropOf(content, id, c.rarity);
      expect(bd, id).toEqual({ bg: c.rarity === 'mythic' ? 'bg-hero' : 'bg-villain' });
    }
    expect(DRAGON.some((id) => content.cardById.get(id)!.rarity === 'mythic')).toBe(true);
    expect(DRAGON.some((id) => content.cardById.get(id)!.rarity === 'void')).toBe(true);
  });

  it('gives Leviathan Heirlooms the moving sea with its front layer', () => {
    const lev = content.cards.filter((c) => c.heirloom && c.batch === 'leviathan');
    expect(lev).toHaveLength(11);
    for (const c of lev)
      expect(backdropOf(content, c.id, c.rarity)).toEqual({
        bg: 'bg-sea',
        front: 'bg-sea-front',
        motion: 'sea',
      });
  });

  it('plays the villain backdrop as a 40-frame strip', () => {
    expect(strip('bg-villain')).toMatchObject({ frames: 40, w: 136, h: 160 });
    expect(strip('bg-hero')).toBeUndefined();
  });

  it('has none for other rarities', () => {
    expect(backdropOf(content, 'solaris', 'gold')).toBeNull();
  });

  it('has every picture, fish and windowed kit baked at its approved size', () => {
    for (const n of ['bg-hero', 'bg-villain', 'bg-sea', 'bg-sea-front'])
      expect(sprite(n), n).toMatchObject({ w: BACKDROP.w, h: BACKDROP.h });
    for (let i = 0; i < 64; i++) expect(sprite(`bgfish-r${i}`)).toMatchObject({ w: 32, h: 32 });
    for (let i = 0; i < 16; i++) expect(sprite(`bgbig-b${i}`)).toMatchObject({ w: 64, h: 64 });
    for (const b of content.batches) {
      expect(sprite(kitName('heirloom', b.kit, true))).toMatchObject({ w: 212, h: 256 });
      expect(kitName('mythic', b.kit, true)).toBe(b.kit); // T6 keeps the painted window
    }
  });
});

/** The motion is vaulted (switched off), the pictures stay. */
describe('backdrop motion switch', () => {
  it('is off: stills only, no strip, fish or front layer', () => {
    expect(BACKDROP_MOTION).toBe(false);
    const sea = { bg: 'bg-sea', front: 'bg-sea-front', motion: 'sea' as const };
    expect(backdropLayers(sea)).toEqual({ bg: 'bg-sea', strip: false, swim: false });
    expect(backdropLayers({ bg: 'bg-villain' })).toEqual({
      bg: 'bg-villain',
      strip: false,
      swim: false,
    });
  });

  it('brings the motion back when switched on', () => {
    const sea = { bg: 'bg-sea', front: 'bg-sea-front', motion: 'sea' as const };
    expect(backdropLayers(sea, true)).toEqual({
      bg: 'bg-sea',
      front: 'bg-sea-front',
      strip: true,
      swim: true,
    });
    expect(backdropLayers({ bg: 'bg-villain' }, true)).toMatchObject({ strip: true, swim: false });
  });
});

/** A fixed seed, so the vaulted motion's tests never flake. */
const seeded =
  (seed = 12345) =>
  () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

describe('SeaSim (the vaulted Leviathan motion)', () => {
  const run = (secs: number, rand = () => 0.5) => {
    const sim = new SeaSim(rand);
    const seen = { big: 0, maxSmall: 0, firstBig: -1, bubbles: 0 };
    let bubbles = 0;
    for (let t = 0; t < secs * 30; t++) {
      const before = sim.bubbles.length;
      sim.step(1 / 30);
      if (sim.bubbles.length > before) bubbles++;
      const bigNow = sim.fish.filter((f) => f.big).length;
      if (bigNow && seen.firstBig < 0) seen.firstBig = sim.t;
      seen.maxSmall = Math.max(seen.maxSmall, sim.fish.filter((f) => !f.big).length);
      for (const f of sim.fish) {
        if (f.big) {
          expect(f.speed).toBe(9);
          expect(f.y).toBeGreaterThanOrEqual(30);
          expect(f.y).toBeLessThanOrEqual(90);
        } else {
          expect(f.speed).toBeGreaterThanOrEqual(12);
          expect(f.speed).toBeLessThanOrEqual(18);
          expect(f.y).toBeGreaterThanOrEqual(8);
          expect(f.y).toBeLessThanOrEqual(88);
        }
      }
    }
    seen.bubbles = bubbles;
    return { sim, seen };
  };

  it('sends the first big fish after about 3 s, at most 2 small ones, a bubble every 1.6 s', () => {
    const { seen } = run(15, seeded());
    expect(seen.firstBig).toBeGreaterThan(2.9);
    expect(seen.firstBig).toBeLessThan(3.2);
    expect(seen.maxSmall).toBeLessThanOrEqual(2);
    expect(seen.bubbles).toBe(9); // 15 / 1.6, none has left the box yet
  });

  it('keeps fish and bubbles bounded and removes them once they leave the box', () => {
    const { sim } = run(300, seeded(7));
    for (const f of sim.fish) expect(f.x).toBeLessThan(BACKDROP.w + 4);
    for (const b of sim.bubbles) expect(b.y).toBeGreaterThan(-4);
    expect(sim.fish.length).toBeLessThanOrEqual(3);
  });
});
