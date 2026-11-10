import { describe, expect, it } from 'vitest';
import {
  ascend,
  ascensionPreview,
  bossAttackDps,
  bossMaxHp,
  buyStarlightItem,
  collectModifiers,
  createSaveText,
  CURRENT_SAVE_VERSION,
  Decimal,
  MIGRATIONS,
  readSave,
  starlightGain,
  starlightShop,
  type GameState,
} from '../src/game';
import { content, freshState } from './helpers';

const STAR = content.prestige.currency;

/** A run that harvested `oak` Oak Gems (tier 1) and `grotto` Grotto Gems (tier 3). */
function runWith(oak: number, grotto = 0): GameState {
  const state = freshState();
  state.mastery.harvested['oak_gem'] = new Decimal(oak);
  if (grotto) state.mastery.harvested['grotto_gem'] = new Decimal(grotto);
  return state;
}

/** Expected gain straight from the data: floor((points / divisor) ^ exponent). */
function expectedGain(points: number): number {
  const g = content.prestige.gain;
  return Math.floor(Math.pow(points / g.divisor.toNumber(), g.exponent));
}

/** A run far enough along to ascend, with things that reset and things that persist. */
function progressedRun(): GameState {
  const state = runWith(1e9, 1e7);
  state.resources['oak_gem'] = new Decimal(5000);
  state.resources['summon_crystal'] = new Decimal(40);
  state.resources['moss_core'] = new Decimal(7);
  state.production.mineLevels = { copper_quarry: 30 };
  state.production.unlockedTrees = ['ironbark'];
  state.clearedDungeons = ['mossy_cellar'];
  state.combat.kills = { mossy_cellar: 120 };
  state.combat.loadoutDamage = new Decimal(50);
  state.bursts.logging = { gauge: 12, timer: 0.5 };
  state.bossHp = new Decimal(123);
  state.cards.owned['ember_squire']!.level = 15;
  state.portals['card_portal'] = { pity: 33, pulls: 50, pityHits: 0 };
  state.cosmetics.owned['holo_hex'] = { level: 1, copies: 0 };
  state.mastery.gemTiers = { oak_gem: 3 };
  state.mastery.bossTiers = { mossy_cellar: 2 };
  state.legacySkins = ['legacy-staff-01'];
  state.weaponSkins = { staff: 'legacy-staff-01' };
  return state;
}

describe('Starlight gain (DESIGN.md §9)', () => {
  it('is 0 for a new game, which cannot ascend yet', () => {
    const preview = ascensionPreview(freshState(), content);
    expect(preview.gain.toNumber()).toBe(0);
    expect(preview.canAscend).toBe(false);
    expect(preview.minimum).toBe(content.prestige.gain.minimum);
  });

  it('comes from the gems harvested this run, weighted by gem tier', () => {
    const weights = content.prestige.gain.tierWeights.map((w) => w.toNumber());
    const points = 1e7 * weights[0]! + 1e5 * weights[2]!;
    expect(starlightGain(runWith(1e7, 1e5), content).toNumber()).toBe(expectedGain(points));
  });

  it('counts only this run: gems harvested before the last ascension do not count', () => {
    const state = runWith(1e6);
    state.prestige.runStart['oak_gem'] = new Decimal(1e6);
    expect(starlightGain(state, content).toNumber()).toBe(0);
  });

  it('can be raised through prestige.gain', () => {
    const g = content.prestige.gain;
    const raw = Math.pow(1e8 / g.divisor.toNumber(), g.exponent);
    const doubled = starlightGain(runWith(1e8), content, [
      {
        stat: 'prestige.gain',
        kind: 'mult',
        value: new Decimal(2),
        source: { kind: 'skill', id: 'test' },
      },
    ]);
    // The modifier applies before rounding down.
    expect(doubled.toNumber()).toBe(Math.floor(raw * 2));
  });
});

describe('ascension preview', () => {
  it('lists what resets and what persists, and the gain', () => {
    const preview = ascensionPreview(progressedRun(), content);
    expect(preview.canAscend).toBe(true);
    expect(preview.resets).toEqual(
      expect.arrayContaining(['mine_levels', 'tree_levels', 'resources', 'tile_stages']),
    );
    expect(preview.persists).toEqual(
      expect.arrayContaining([
        'cards',
        'cosmetics',
        'unlocks',
        'mastery',
        'medals',
        'portal_pity',
        'crystals',
        'starlight',
      ]),
    );
    expect(preview.gain.toNumber()).toBe(expectedGain(1e9 + 1e7 * 100));
    expect(preview.rewards).toEqual(['gilded_plate']);
  });
});

describe('ascend', () => {
  it('refuses while the gain is below the minimum', () => {
    expect(ascend(runWith(10), content)).toEqual({ ok: false, reason: 'too-early' });
  });

  it('resets mine and tree levels, resources, gauges and the fight', () => {
    const before = progressedRun();
    const result = ascend(before, content);
    if (!result.ok) throw new Error(result.reason);
    const s = result.state;
    expect(s.production.mineLevels).toEqual({});
    expect(s.production.treeLevels).toEqual({});
    for (const [id, amount] of Object.entries(s.resources)) {
      const kind = content.resourceById.get(id)!.kind;
      if (kind === 'prestige' || kind === 'crystal') continue;
      // Gems, Money and Cores start over (Money from its starting amount).
      const start = content.resourceById.get(id)!.startAmount?.toNumber() ?? 0;
      expect(amount.toNumber(), id).toBe(start);
    }
    expect(s.bursts.logging).toEqual({ gauge: 0, timer: 0 });
    expect(s.bossHp).toBeNull();
    expect(s.combat.loadoutDamage.toNumber()).toBe(0);
    expect(s.prestigeCount).toBe(1);
  });

  it('keeps the premium crystals, and sends Money back to its starting amount (DESIGN.md §3)', () => {
    const before = progressedRun();
    before.resources['money'] = new Decimal('4e9');
    before.resources['glamour_crystal'] = new Decimal(75);
    const result = ascend(before, content);
    if (!result.ok) throw new Error(result.reason);
    const s = result.state;
    expect(s.resources['summon_crystal']!.toNumber()).toBe(40);
    expect(s.resources['glamour_crystal']!.toNumber()).toBe(75);
    expect(s.resources['money']!.eq(content.resourceById.get('money')!.startAmount!)).toBe(true);
    expect(s.resources['moss_core']!.toNumber()).toBe(0);
    expect(s.resources['frost_sigil']!.toNumber()).toBe(0); // a material now, so it starts over
  });

  it('keeps the owned legacy weapon skins and the one worn', () => {
    const result = ascend(progressedRun(), content);
    if (!result.ok) throw new Error(result.reason);
    expect(result.state.legacySkins).toEqual(['legacy-staff-01']);
    expect(result.state.weaponSkins).toEqual({ staff: 'legacy-staff-01' });
  });

  it('keeps cards, cosmetics, unlocks, mastery, medals and pity', () => {
    const before = progressedRun();
    const result = ascend(before, content);
    if (!result.ok) throw new Error(result.reason);
    const s = result.state;
    expect(s.combat.kills).toEqual({ mossy_cellar: 120 });
    expect(s.cards.owned['ember_squire']!.level).toBe(15);
    expect(s.cards.loadouts).toEqual(before.cards.loadouts);
    expect(s.cosmetics.owned['holo_hex']).toBeDefined();
    expect(s.production.unlockedTrees).toEqual(['ironbark']);
    expect(s.clearedDungeons).toEqual(['mossy_cellar']);
    expect(s.mastery).toEqual(before.mastery);
    expect(s.portals).toEqual(before.portals);
  });

  it('pays the Starlight, starts a new run and adds up over ascensions', () => {
    const before = progressedRun();
    const gain = ascensionPreview(before, content).gain;
    const first = ascend(before, content);
    if (!first.ok) throw new Error(first.reason);
    expect(first.gained.eq(gain)).toBe(true);
    expect(first.state.resources[STAR]!.eq(gain)).toBe(true);
    expect(first.state.prestige.starlightEarned.eq(gain)).toBe(true);
    // The new run starts from the lifetime totals, so nothing counts yet.
    expect(ascensionPreview(first.state, content).gain.toNumber()).toBe(0);

    const second = first.state;
    second.mastery.harvested['oak_gem'] = second.mastery.harvested['oak_gem']!.add(1e9);
    const again = ascend(second, content);
    if (!again.ok) throw new Error(again.reason);
    expect(again.state.prestigeCount).toBe(2);
    expect(again.state.resources[STAR]!.eq(gain.add(again.gained))).toBe(true);
  });

  it('grants the prestige cosmetics of that ascension; a duplicate becomes a copy', () => {
    const before = progressedRun();
    const first = ascend(before, content);
    if (!first.ok) throw new Error(first.reason);
    expect(first.cosmetics).toEqual(['gilded_plate']);
    expect(first.state.cosmetics.owned['gilded_plate']).toEqual({ level: 1, copies: 0 });

    const owning = progressedRun();
    owning.cosmetics.owned['gilded_plate'] = { level: 1, copies: 0 };
    const dupe = ascend(owning, content);
    if (!dupe.ok) throw new Error(dupe.reason);
    expect(dupe.state.cosmetics.owned['gilded_plate']).toEqual({ level: 1, copies: 1 });
  });
});

describe('Starlight shop', () => {
  const rich = (n: number): GameState => {
    const state = freshState();
    state.resources[STAR] = new Decimal(n);
    return state;
  };

  it('lists every item with its level, price and next bonus', () => {
    const shop = starlightShop(rich(0), content);
    expect(shop.map((i) => i.item.id)).toEqual(content.prestige.shop.map((i) => i.id));
    const first = shop[0]!;
    expect(first.level).toBe(0);
    expect(first.price!.amount.eq(content.prestige.shop[0]!.cost.base)).toBe(true);
    expect(first.affordable).toBe(false);
  });

  it('buys a level for Starlight; its bonus is a prestige modifier that grows per level', () => {
    const item = content.prestige.shop.find((i) => i.id === 'starforged_edge')!;
    const result = buyStarlightItem(rich(1000), content, item.id);
    if (!result.ok) throw new Error(result.reason);
    expect(result.state.prestige.shop[item.id]).toBe(1);
    const spent = new Decimal(1000).sub(result.state.resources[STAR]!);
    expect(spent.eq(item.cost.base)).toBe(true);
    const twice = buyStarlightItem(result.state, content, item.id);
    if (!twice.ok) throw new Error(twice.reason);
    const mods = collectModifiers(twice.state, content).filter((m) => m.source.kind === 'prestige');
    expect(mods).toHaveLength(1);
    expect(mods[0]!.source.id).toBe(item.id);
    expect(mods[0]!.value.toNumber()).toBe(item.perLevel[0]!.value.toNumber() * 2);
  });

  it('refuses unknown items, unaffordable levels and levels past the max', () => {
    expect(buyStarlightItem(rich(1000), content, 'nope')).toEqual({ ok: false, reason: 'unknown' });
    expect(buyStarlightItem(rich(0), content, 'long_night')).toEqual({
      ok: false,
      reason: 'unaffordable',
    });
    const maxed = rich(1e9);
    maxed.prestige.shop['long_night'] = content.prestige.shop.find(
      (i) => i.id === 'long_night',
    )!.maxLevel;
    expect(buyStarlightItem(maxed, content, 'long_night')).toEqual({ ok: false, reason: 'maxed' });
    expect(starlightShop(maxed, content).find((i) => i.item.id === 'long_night')!.price).toBeNull();
  });

  it('keeps shop levels through ascension', () => {
    const state = progressedRun();
    state.prestige.shop['starlit_groves'] = 3;
    const result = ascend(state, content);
    if (!result.ok) throw new Error(result.reason);
    expect(result.state.prestige.shop['starlit_groves']).toBe(3);
  });
});

describe('bosses grow with prestige (DESIGN.md §9, §6)', () => {
  it('scales HP and attack slowly by the prestige count', () => {
    const d = content.dungeons[0]!;
    const growth = 1 + d.boss.hpScalingPerPrestige;
    expect(bossMaxHp(d, 2).toNumber()).toBeCloseTo(d.boss.hp.toNumber() * growth ** 2, 6);
    expect(bossAttackDps(d, 2, []).toNumber()).toBeCloseTo(
      (d.boss.attack.damage.toNumber() * growth ** 2) / d.boss.attack.intervalSeconds,
      9,
    );
  });
});

describe('saving prestige (save format v10)', () => {
  it('round-trips the run start, shop levels and Starlight earned', () => {
    const state = progressedRun();
    state.prestige.shop['starlit_veins'] = 2;
    state.prestige.runStart['oak_gem'] = new Decimal(500);
    state.prestige.starlightEarned = new Decimal(77);
    const loaded = readSave(createSaveText(state, 1), content).state;
    expect(loaded.prestige.shop).toEqual({ starlit_veins: 2 });
    expect(loaded.prestige.runStart['oak_gem']!.toNumber()).toBe(500);
    expect(loaded.prestige.starlightEarned.toNumber()).toBe(77);
  });

  it('migrates v9 -> v10: no ascension yet, the whole history is this run', () => {
    expect(CURRENT_SAVE_VERSION).toBeGreaterThanOrEqual(10);
    expect(MIGRATIONS[9]!({ resources: {} })).toEqual({
      resources: {},
      prestige: { runStart: {}, shop: {}, starlightEarned: '0' },
    });
  });
});
