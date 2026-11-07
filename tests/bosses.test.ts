import { describe, expect, it } from 'vitest';
import { BOSS_ARTS, loadContent } from '../src/data';
import { bossArt, bossInItemBox, sentinelLevel } from '../src/renderer/src/art/bosses';

const content = loadContent();

describe('sticker bosses (DESIGN.md 13)', () => {
  it('draws every boss art, and every dungeon boss and trial target names one', () => {
    for (const art of BOSS_ARTS) expect(bossArt(art).length).toBeGreaterThan(500);
    expect(content.dungeons.map((d) => d.boss.art)).toEqual([
      'root_warden',
      'cinder_lich',
      'glacier_colossus',
    ]);
    expect(content.trials[0]!.target).toMatchObject({
      name: 'Crystal Sentinel',
      art: 'crystal_sentinel',
    });
  });

  it('wraps each figure in a thick white sticker outline', () => {
    expect(bossArt('root_warden')).toContain('stroke="#fff" stroke-width="9"');
  });

  it('lights one Crystal Sentinel shard per score step: 25, 50, 75 and 100%', () => {
    expect([0, 0.24, 0.25, 0.5, 0.74, 0.75, 0.99, 1].map(sentinelLevel)).toEqual([
      0, 0, 1, 2, 2, 3, 3, 4,
    ]);
    const lit = (level: number) =>
      (bossArt('crystal_sentinel', level).match(/#ff9cf2/g) ?? []).length;
    expect(lit(4)).toBeGreaterThan(lit(2));
    expect(lit(2)).toBeGreaterThan(lit(0));
  });

  it('fits a boss into the card item box', () => {
    expect(bossInItemBox('cinder_lich')).toMatch(
      /^<g transform="translate\(5 25\) scale\(1\.9\)">/,
    );
  });
});
