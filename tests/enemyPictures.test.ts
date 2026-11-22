import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/data';
// the DOM-free sprite lookups (art/foes.ts and art/bosses.ts use these same two calls)
import { sprite } from '../src/renderer/src/art/pixel/sprites';

const hasFoeSprite = (id: string | undefined): boolean => !!id && !!sprite(`foe-${id}`);
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

/** No enemy shows the placeholder today; it stays for an enemy whose picture is removed. */
const PLACEHOLDERS = new Set<string>();

/** The thirteen approved pictures: enemy id -> picture id (stills, art/foes.ts). */
const NEW_PICTURES: Record<string, string> = {
  moss_slime: 'moss_slime',
  bramble_beast: 'bramble_beast',
  frost_imp: 'frost_imp',
  ice_wisp: 'ice_wisp',
  gale_harpy: 'storm_harpy',
  spark_wisp: 'drowned_deckhand',
  lantern_moth: 'lantern_moth',
  gilded_acolyte: 'gilded_acolyte',
  shade_mote: 'shade_mote',
  rift_maw: 'rift_maw',
  cinder_lich: 'cinder_lich',
  root_warden: 'root_warden',
  glacier_colossus: 'glacier_colossus',
};

describe('enemy pictures: a picture or the placeholder, never nothing', () => {
  it('has the pack figure the placeholder is cut from', () => {
    expect(hasFoeSprite('hooded_rogue_assassin')).toBe(true);
  });

  it('resolves every enemy, mini-boss and boss; no enemy resolves to the placeholder', () => {
    const got = new Set<string>();
    const mapped: Record<string, string> = {};
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
        else mapped[e.id] = e.sprite ?? d.boss.art ?? '';
      }
    }
    expect(got).toEqual(PLACEHOLDERS);
    for (const [id, pic] of Object.entries(NEW_PICTURES)) {
      expect(mapped[id], id).toBe(pic);
      expect(sprite(`foe-${pic}`), pic).toMatchObject({ w: 160, h: 172 });
    }
  });

  it('an enemy with no picture resolves to the placeholder', () => {
    const d = content.allDungeons[0]!;
    expect(picture(d, { sprite: 'no_such_picture' }, false)).toBe('placeholder');
    expect(picture(d, { sprite: undefined }, false)).toBe('placeholder');
  });

  it('shows the Spark Wisp as the Drowned Deckhand, with its id unchanged', () => {
    const names = content.allDungeons
      .flatMap((d) => d.enemies)
      .filter((e) => e.id === 'spark_wisp');
    expect(names.map((e) => e.name)).toEqual(['Drowned Deckhand']);
  });
});
