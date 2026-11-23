import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/data';
import { MANIFEST } from '../src/renderer/src/art/pixel/manifest';

const content = loadContent();

/** Every picture the roster names: normal enemies, mini-bosses and the bosses without vector art. */
function spriteIds(): string[] {
  const ids: string[] = [];
  for (const d of content.allDungeons) {
    for (const e of d.enemies) if (e.sprite) ids.push(e.sprite);
    for (const m of d.miniBosses) if (m.sprite) ids.push(m.sprite);
    if (d.boss.sprite) ids.push(d.boss.sprite);
  }
  return ids;
}

describe('the enemy roster art (ASSET_RULES §5)', () => {
  it('gives every sprite id a still on the boss canvas and no idle strip', () => {
    // every enemy picture is a still drawn by us now; no asset-pack idle strip is left
    for (const id of spriteIds()) {
      expect(MANIFEST[`foe-${id}`], id).toMatchObject({ w: 160, h: 172 });
      expect(MANIFEST[`foe-${id}-anim`], id).toBeUndefined();
      expect(MANIFEST[`foe-${id}`]!.animated, id).toBeUndefined();
    }
    expect(
      Object.keys(MANIFEST).filter((k) => k.startsWith('foe-') && k.endsWith('-anim')),
    ).toEqual([]);
  });

  it('covers every enemy, mini-boss and boss', () => {
    const without: string[] = [];
    for (const d of content.allDungeons) {
      for (const e of d.enemies) if (!e.sprite) without.push(e.id);
      for (const m of d.miniBosses) if (!m.sprite) without.push(m.id);
      if (!d.boss.sprite && !d.boss.art) without.push(d.boss.id);
    }
    expect(without).toEqual([]);
  });

  it('keeps the removed pack pictures out', () => {
    expect(MANIFEST['foe-bloodroot_black']).toBeUndefined();
    expect(MANIFEST['foe-woodland_stalker_wolf']).toBeUndefined();
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
  it('lists the packs still used, with a licence each', () => {
    const list = content.credits;
    // the asset pack with a required credit is out of the game; the rest ask for none
    expect(list.filter((c) => c.creditRequired)).toEqual([]);
    expect(new Set(list.map((c) => c.id)).size).toBe(list.length);
  });
});
