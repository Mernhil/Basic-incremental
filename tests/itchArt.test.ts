import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/data';
import { MANIFEST } from '../src/renderer/src/art/pixel/manifest';

const content = loadContent();

/** Every picture the roster names: normal enemies, mini-bosses and the bosses without vector art. */
function spriteIds(): string[] {
  const ids: string[] = [];
  for (const d of content.allDungeons) {
    for (const e of d.enemies) if (e.sprite) ids.push(e.sprite);
    if (d.miniBoss.sprite) ids.push(d.miniBoss.sprite);
    if (d.boss.sprite) ids.push(d.boss.sprite);
  }
  return ids;
}

describe('the enemy roster art (ASSET_RULES §5)', () => {
  it('gives every sprite id a still and an idle strip on the boss canvas', () => {
    for (const id of spriteIds()) {
      const still = MANIFEST[`foe-${id}`];
      const strip = MANIFEST[`foe-${id}-anim`];
      expect(still, id).toMatchObject({ w: 160, h: 172 });
      expect(strip, id).toBeDefined();
      expect(strip!.w % 160, id).toBe(0);
      expect(still!.animated?.frames, id).toBe(strip!.w / 160);
    }
  });

  it('covers every enemy, mini-boss and boss', () => {
    const without: string[] = [];
    for (const d of content.allDungeons) {
      for (const e of d.enemies) if (!e.sprite) without.push(e.id);
      if (!d.miniBoss.sprite) without.push(d.miniBoss.id);
      if (!d.boss.sprite && !d.boss.art) without.push(d.boss.id);
    }
    expect(without).toEqual([]);
  });

  it('keeps a mini-boss out of the normal enemies and gives each dungeon its own', () => {
    const minis = content.allDungeons.map((d) => d.miniBoss.id);
    expect(new Set(minis).size).toBe(minis.length);
    for (const d of content.allDungeons) {
      expect(d.enemies.some((e) => e.id === d.miniBoss.id)).toBe(false);
    }
  });
});

describe('the Money coins, crystals and achievement badges', () => {
  it('draws every coin of the ladder with a still and a spin strip', () => {
    for (const c of content.coins) {
      expect(MANIFEST[`money-${c.id}`], c.id).toMatchObject({ w: 16, h: 16 });
      expect(MANIFEST[`money-${c.id}`]!.animated?.frames, c.id).toBe(5);
    }
  });

  it('draws both crystals with an 8-frame loop', () => {
    for (const id of ['res-summon', 'res-glamour']) {
      expect(MANIFEST[id]).toMatchObject({ w: 32, h: 32 });
      expect(MANIFEST[id]!.animated?.frames).toBe(8);
    }
  });

  it('draws a badge in every style for every achievement, and the two locked bases', () => {
    for (const a of content.achievements) {
      for (const style of ['a', 'b', 'c', 'd', 'e']) {
        expect(MANIFEST[`badge-${style}-${a.id}`], `${style} ${a.id}`).toMatchObject({
          w: 32,
          h: 32,
        });
      }
    }
    expect(MANIFEST['badge-locked-round']).toBeDefined();
    expect(MANIFEST['badge-locked-octagon']).toBeDefined();
  });
});

describe('the credits', () => {
  it('lists the packs, required credits first, with a licence each', () => {
    const list = content.credits;
    const firstOptional = list.findIndex((c) => !c.creditRequired);
    expect(firstOptional).toBeGreaterThan(0);
    expect(list.slice(firstOptional).every((c) => !c.creditRequired)).toBe(true);
    expect(list.filter((c) => c.creditRequired).every((c) => c.author === 'elie automata')).toBe(
      true,
    );
    expect(new Set(list.map((c) => c.id)).size).toBe(list.length);
  });
});
