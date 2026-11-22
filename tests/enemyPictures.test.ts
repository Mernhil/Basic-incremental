import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/data';
// the DOM-free sprite lookups (art/foes.ts and art/bosses.ts use these same two calls)
import { sprite, strip } from '../src/renderer/src/art/pixel/sprites';

const hasFoeSprite = (id: string | undefined): boolean =>
  !!id && !!sprite(`foe-${id}`) && !!strip(`foe-${id}`);
const hasBossSprite = (art: string): boolean => !!sprite(`boss-${art}`);

const content = loadContent({ unreleased: true });

/** The picture id the duel card tries for an enemy (mirrors `setFoeArt` in stage/arena.ts). */
function picture(
  dungeon: (typeof content.allDungeons)[number],
  enemy: { sprite?: string },
  isBoss: boolean,
) {
  const art = dungeon.boss.art;
  if (isBoss && art && hasBossSprite(art)) return 'boss-art';
  const sprite = isBoss ? (dungeon.boss.sprite ?? art) : enemy.sprite;
  return hasFoeSprite(sprite) ? 'picture' : 'placeholder';
}

const PLACEHOLDERS = new Set([
  'root_warden',
  'cinder_lich',
  'ice_sorceress',
  'glacier_colossus',
  'gothic_corsair',
  'golden_cross_novice_priestess',
  'shadow_slime',
]);

describe('enemy pictures: a picture or the placeholder, never nothing', () => {
  it('has the pack figure the placeholder is cut from', () => {
    expect(hasFoeSprite('hooded_rogue_assassin')).toBe(true);
  });

  it('resolves every enemy, mini-boss and boss, and exactly the seven are placeholders', () => {
    const got = new Set<string>();
    for (const d of content.allDungeons) {
      const list = [
        ...d.enemies.map((e) => ({ id: e.id, sprite: e.sprite, boss: false })),
        { id: d.miniBoss.id, sprite: d.miniBoss.sprite, boss: false },
        { id: d.boss.id, sprite: d.boss.sprite, boss: true },
      ];
      for (const e of list) {
        const p = picture(d, e, e.boss);
        expect(['boss-art', 'picture', 'placeholder'], e.id).toContain(p);
        if (p === 'placeholder') got.add(e.sprite ?? d.boss.art ?? e.id);
      }
    }
    expect(got).toEqual(PLACEHOLDERS);
  });
});
