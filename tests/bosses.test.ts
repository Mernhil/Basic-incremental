import { describe, expect, it } from 'vitest';
import { BOSS_ARTS, loadContent } from '../src/data';
import {
  BOSS_LOOK,
  bossVector,
  sentinelLevel,
  shardVector,
} from '../src/renderer/src/art/vector/bosses';
import { sprite } from '../src/renderer/src/art/pixel/sprites';

const content = loadContent();

describe('pixel bosses (DESIGN.md §12)', () => {
  it('draws every boss art, and every dungeon boss and trial target names one', () => {
    for (const art of BOSS_ARTS) expect(bossVector(art).length).toBeGreaterThan(500);
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

  it('bakes each boss at 160 x 172 with a soft aura colour and an idle effect, no sticker ring', () => {
    for (const art of BOSS_ARTS) {
      expect(sprite(`boss-${art}`)).toMatchObject({ w: 160, h: 172 });
      expect(BOSS_LOOK[art].glow).toMatch(/^#[0-9a-f]{6}$/);
      expect(bossVector(art)).not.toContain('stroke="#fff" stroke-width="9"');
    }
    expect(BOSS_LOOK.cinder_lich.fx).toBe('fire');
    expect(BOSS_LOOK.glacier_colossus.fx).toBe('snow');
  });

  it('lights one Crystal Sentinel shard per score step: 25, 50, 75 and 100%', () => {
    expect([0, 0.24, 0.25, 0.5, 0.74, 0.75, 0.99, 1].map(sentinelLevel)).toEqual([
      0, 0, 1, 2, 2, 3, 3, 4,
    ]);
    expect(shardVector(true)).not.toEqual(shardVector(false));
    expect(sprite('boss-shard-lit')).toBeDefined();
    expect(sprite('boss-shard-dim')).toBeDefined();
  });
});
