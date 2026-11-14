import { describe, expect, it } from 'vitest';
import {
  createSaveText,
  CURRENT_SAVE_VERSION,
  MIGRATIONS,
  newOwnedCard,
  readSave,
} from '../src/game';
import { content, newGame } from './helpers';

type Raw = {
  cards: {
    owned: Record<
      string,
      {
        tier: string;
        stars: number;
        level: number;
        xp: string;
        starFill: number;
        enhancements: string[];
      }
    >;
    loadouts: { fighting: { main: string | null; supports: (string | null)[] } };
    wishlist: string[];
  };
  heirlooms: { shards: Record<string, number>; trees: Record<string, string[]>; pity: number };
};

const heirloom = (stars: number, level: number, xp = '0', enhancements: string[] = []) => ({
  tier: 'heirloom',
  stars,
  level,
  xp,
  starFill: 0,
  enhancements,
});

const save = (owned: Raw['cards']['owned'], extra: Partial<Raw> = {}) => ({
  cards: {
    owned,
    loadouts: { fighting: { main: null, supports: [null, null, null] } },
    wishlist: [],
  },
  heirlooms: { shards: {}, trees: {}, pity: 0 },
  ...extra,
});

/** v31 -> v32: the Dragon batch, 22 Heirlooms become 11 (DESIGN.md §5 Heirlooms). */
describe('v31 -> v32 (22 Heirlooms become 11)', () => {
  it('is format 32', () => {
    expect(CURRENT_SAVE_VERSION).toBeGreaterThanOrEqual(32);
  });

  it('gives a removed Heirloom to the kept one of its type when that one is not owned', () => {
    const out = MIGRATIONS[31]!(save({ nightfall: heirloom(4, 90, '12', ['edge']) })) as Raw;
    expect(out.cards.owned['nightfall']).toBeUndefined();
    expect(out.cards.owned['solaris']).toMatchObject({
      tier: 'heirloom',
      stars: 4,
      level: 90,
      xp: '12',
    });
    // the removed card's enhancement options belong to it, not to the kept card
    expect(out.cards.owned['solaris']!.enhancements).toEqual([]);
  });

  it('keeps the higher stars and level when both are owned, the rest become shards', () => {
    const out = MIGRATIONS[31]!(
      save(
        { grimhowl: heirloom(2, 100), kingsoath: heirloom(5, 40) },
        {
          heirlooms: {
            shards: { kingsoath: 7, grimhowl: 3 },
            trees: { kingsoath: ['root'] },
            pity: 5,
          },
        },
      ),
    ) as Raw;
    expect(out.cards.owned['kingsoath']).toBeUndefined();
    expect(out.cards.owned['grimhowl']).toMatchObject({ stars: 5, level: 100 });
    // the lower one (★2) is worth its unlock (30) and ★2 (10); plus 7 + 3 held
    expect(out.heirlooms.shards).toEqual({ grimhowl: 30 + 10 + 7 + 3 });
    expect(out.heirlooms.trees).toEqual({});
    expect(out.heirlooms.pity).toBe(5);
  });

  it('moves shards of a removed Heirloom to the kept one and renames loadouts and wishlist', () => {
    const state = save(
      { rotfeller: heirloom(1, 1) },
      {
        heirlooms: { shards: { rotfeller: 12 }, trees: {}, pity: 0 },
      },
    );
    state.cards.loadouts.fighting.main = 'rotfeller';
    state.cards.wishlist = ['rotfeller', 'elderwarden'];
    const out = MIGRATIONS[31]!(state) as Raw;
    expect(out.heirlooms.shards).toEqual({ elderwarden: 12 });
    expect(out.cards.loadouts.fighting.main).toBe('elderwarden');
    expect(out.cards.wishlist).toEqual(['elderwarden', 'elderwarden']);
  });

  it('maps every removed Heirloom to the kept Heirloom of its own type', () => {
    const removed = [
      'nightfall',
      'kingsoath',
      'lumen_fang',
      'abyss_thorn',
      'doomrider',
      'worldforge',
      'umbral_string',
      'lifebloom',
      'graceharvest',
      'deepmaw',
      'rotfeller',
    ];
    const out = MIGRATIONS[31]!(
      save(Object.fromEntries(removed.map((id) => [id, heirloom(1, 1)]))),
    ) as Raw;
    const kept = Object.keys(out.cards.owned);
    expect(kept).toHaveLength(11);
    const types = kept.map((id) => content.cardById.get(id)!.item.kind);
    expect(new Set(types).size).toBe(11);
    for (const id of kept) expect(content.cardById.get(id)?.heirloom, id).toBe(true);
  });

  it('leaves a save without a removed Heirloom as it is', () => {
    const state = save({ solaris: heirloom(3, 50) });
    expect(MIGRATIONS[31]!(state)).toEqual(state);
  });

  it('loads through the real reader: the kept Heirloom is owned and the removed one is gone', () => {
    const game = newGame();
    game.cards.owned['solaris'] = { ...newOwnedCard(), tier: 'heirloom', stars: 2, level: 10 };
    const text = createSaveText(game, 1);
    const env = JSON.parse(text);
    env.version = 31;
    env.state.cards.owned['nightfall'] = heirloom(6, 140);
    const { state } = readSave(JSON.stringify(env), content);
    expect(state.cards.owned['nightfall']).toBeUndefined();
    expect(state.cards.owned['solaris']).toMatchObject({ tier: 'heirloom', stars: 6, level: 140 });
    // ★2 was the lower: its unlock and ★2 became shards, spent on its stars at the next gain
    expect(state.heirlooms.shards['solaris']).toBe(40);
  });
});
