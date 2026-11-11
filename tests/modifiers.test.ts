import { describe, expect, it } from 'vitest';
import { validateContent, type RawContent } from '../src/data';
import {
  Decimal,
  OFFLINE_CAP_MS,
  advance,
  approxEq,
  bossMaxHp,
  collectModifiers,
  computeStat,
  effectiveDrops,
  equip,
  offlineCapMs,
  scopeMatches,
  simulateOffline,
  type Modifier,
} from '../src/game';
import resources from '../src/data/content/resources.json';
import trees from '../src/data/content/trees.json';
import mines from '../src/data/content/mines.json';
import production from '../src/data/content/production.json';
import cards from '../src/data/content/cards.json';
import cardRules from '../src/data/content/cardRules.json';
import dungeons from '../src/data/content/dungeons.json';
import trials from '../src/data/content/trials.json';
import combat from '../src/data/content/combat.json';
import cosmetics from '../src/data/content/cosmetics.json';
import portals from '../src/data/content/portals.json';
import rarities from '../src/data/content/rarities.json';
import wearRules from '../src/data/content/wearRules.json';
import sets from '../src/data/content/sets.json';
import progression from '../src/data/content/progression.json';
import enhancements from '../src/data/content/enhancements.json';
import account from '../src/data/content/account.json';
import achievements from '../src/data/content/achievements.json';
import cosmeticRules from '../src/data/content/cosmeticRules.json';
import prestige from '../src/data/content/prestige.json';
import upgrades from '../src/data/content/upgrades.json';
import training from '../src/data/content/training.json';
import coins from '../src/data/content/coins.json';
import weaponSkins from '../src/data/content/weaponSkins.json';
import items from '../src/data/content/items.json';
import { constantRng, content, freshState } from './helpers';

const mod = (
  stat: Modifier['stat'],
  kind: Modifier['kind'],
  value: string,
  scope?: Modifier['scope'],
): Modifier => ({
  stat,
  kind,
  value: new Decimal(value),
  scope,
  source: { kind: 'skill', id: `test_${kind}_${value}` },
});

describe('computeStat', () => {
  it('returns the base when nothing applies', () => {
    const r = computeStat('combat.damage', 10, []);
    expect(r.value.eq(10)).toBe(true);
    expect(r.applied).toEqual([]);
  });

  it('applies flat, then summed percent, then each mult', () => {
    const mods = [
      mod('combat.damage', 'mult', '2'),
      mod('combat.damage', 'percent', '10'),
      mod('combat.damage', 'flat', '5'),
      mod('combat.damage', 'percent', '40'),
      mod('combat.damage', 'mult', '1.5'),
    ];
    // (10 + 5) * (1 + 0.5) * 2 * 1.5 = 67.5
    const r = computeStat('combat.damage', 10, mods);
    expect(approxEq(r.value, 67.5)).toBe(true);
    expect(r.applied.map((m) => m.kind)).toEqual(['flat', 'percent', 'percent', 'mult', 'mult']);
  });

  it('is independent of the order modifiers are listed in', () => {
    const mods = [
      mod('production.rate', 'flat', '3'),
      mod('production.rate', 'percent', '25'),
      mod('production.rate', 'mult', '3'),
    ];
    const a = computeStat('production.rate', 2, mods).value;
    const b = computeStat('production.rate', 2, [...mods].reverse()).value;
    expect(a.eq(b)).toBe(true);
  });

  it('lets set replace the value, then floors and caps clamp it (cap wins)', () => {
    expect(computeStat('combat.damage', 10, [mod('combat.damage', 'set', '3')]).value.eq(3)).toBe(
      true,
    );
    const clamp = [
      mod('combat.damage', 'min', '20'),
      mod('combat.damage', 'min', '25'),
      mod('combat.damage', 'max', '22'),
    ];
    expect(computeStat('combat.damage', 10, clamp).value.eq(22)).toBe(true);
    expect(computeStat('combat.damage', 10, clamp.slice(0, 2)).value.eq(25)).toBe(true);
  });

  it('ignores other stats and non-matching scopes', () => {
    const mods = [
      mod('production.rate', 'flat', '100'),
      mod('combat.damage', 'flat', '1', { dungeon: 'other' }),
      mod('combat.damage', 'flat', '2', { dungeon: 'mossy_cellar' }),
    ];
    const r = computeStat('combat.damage', 0, mods, { dungeon: 'mossy_cellar' });
    expect(r.value.eq(2)).toBe(true);
  });

  it('handles very large numbers', () => {
    const r = computeStat('combat.damage', '1e300', [mod('combat.damage', 'mult', '1e300')]);
    expect(r.value.eq('1e600')).toBe(true);
  });
});

describe('scopeMatches', () => {
  it('needs every scoped key to match', () => {
    expect(scopeMatches(undefined, {})).toBe(true);
    expect(scopeMatches({ job: 'mining' }, { job: 'mining', producer: 'x' })).toBe(true);
    expect(scopeMatches({ job: 'mining', producer: 'y' }, { job: 'mining', producer: 'x' })).toBe(
      false,
    );
    expect(scopeMatches({ job: 'mining' }, {})).toBe(false);
  });
});

describe('collectModifiers', () => {
  it('gives owned-item buffs whether or not the item is worn', () => {
    const state = freshState();
    state.cosmetics.owned['gilded_plate'] = { level: 1, copies: 1 };
    const mods = collectModifiers(state, content);
    expect(mods.some((m) => m.source.kind === 'cosmetic' && m.source.id === 'gilded_plate')).toBe(
      true,
    );
  });

  it('gives a set bonus only when the whole set is equipped', () => {
    let state = freshState();
    const items = content.cosmetics.filter((c) => c.set === 'gilded_tradition');
    for (const c of items) state.cosmetics.owned[c.id] = { level: 1, copies: 1 };
    const setMods = (s: typeof state) =>
      collectModifiers(s, content).filter((m) => m.source.kind === 'set');
    expect(setMods(state)).toEqual([]);

    for (const c of items) {
      state = {
        ...state,
        cosmetics: {
          ...state.cosmetics,
          loadout: equip(content, state.cosmetics.loadout, c.slot, { id: c.id, level: 1 }),
        },
      };
    }
    const bonus = setMods(state);
    expect(bonus.length).toBe(content.setById.get('gilded_tradition')!.modifiers.length);
    expect(bonus.every((m) => m.source.id === 'gilded_tradition')).toBe(true);
  });
});

describe('game numbers go through the pipeline', () => {
  it('owned production buffs raise production', () => {
    const base = advance(freshState(), content, 1000, constantRng(0.5)).state;
    const buffed = freshState();
    buffed.cosmetics.owned['aurora_veil'] = { level: 1, copies: 1 }; // +1% production
    const after = advance(buffed, content, 1000, constantRng(0.5)).state;
    const wood = 'oak_gem';
    expect(approxEq(after.resources[wood]!, base.resources[wood]!.mul(1.01))).toBe(true);
  });

  it('boss HP, drops and the offline cap read their modifiers', () => {
    const dungeon = content.dungeons[0]!;
    const hp = bossMaxHp(dungeon, [mod('combat.bossHp', 'mult', '0.5')]);
    expect(hp.eq(dungeon.boss.hp.div(2))).toBe(true);

    const drops = effectiveDrops(
      dungeon,
      [
        mod('drops.rareChance', 'set', '5'),
        mod('drops.pityThreshold', 'mult', '0'),
        mod('drops.currencyAmount', 'mult', '3'),
      ],
      content,
    );
    expect(drops.rare.chance).toBe(1);
    expect(drops.rare.pityThreshold).toBe(1);
    drops.currencies.forEach((c, i) => {
      expect(c.min).toBe(dungeon.drops.currencies[i]!.min * 3);
      expect(c.max).toBe(dungeon.drops.currencies[i]!.max * 3);
    });

    expect(offlineCapMs(freshState(), content)).toBe(OFFLINE_CAP_MS);
  });

  it('offline summary reports the cap that applied', () => {
    const result = simulateOffline(freshState(), content, 0, OFFLINE_CAP_MS * 2, constantRng(0.5));
    expect(result.summary!.capMs).toBe(OFFLINE_CAP_MS);
    expect(result.summary!.capped).toBe(true);
  });
});

describe('modifier data is validated', () => {
  const raw = (): RawContent =>
    structuredClone({
      resources,
      trees,
      mines,
      production,
      cards,
      cardRules,
      dungeons,
      trials,
      combat,
      cosmetics,
      portals,
      rarities,
      wearRules,
      sets,
      progression,
      enhancements,
      account,
      achievements,
      cosmeticRules,
      prestige,
      upgrades,
      training,
      coins,
      weaponSkins,
      items,
    });
  const issues = (input: RawContent): string[] => {
    try {
      validateContent(input);
      return [];
    } catch (error) {
      return (error as { issues: string[] }).issues;
    }
  };
  type RawCosmetic = { ownedModifiers: unknown[]; set: string | null };

  it('rejects unknown stats and kinds', () => {
    const input = raw();
    const list = input.cosmetics as RawCosmetic[];
    list[0]!.ownedModifiers = [{ stat: 'damage', kind: 'percent', value: '1' }];
    list[1]!.ownedModifiers = [{ stat: 'combat.damage', kind: 'double', value: '1' }];
    const found = issues(input);
    expect(found.some((i) => i.includes('[0] › ownedModifiers › [0] › stat'))).toBe(true);
    expect(found.some((i) => i.includes('[1] › ownedModifiers › [0] › kind'))).toBe(true);
  });

  it('rejects scopes that name things that do not exist', () => {
    const input = raw();
    (input.sets as { modifiers: unknown[] }[])[1]!.modifiers = [
      { stat: 'combat.damage', kind: 'flat', value: '1', scope: { dungeon: 'nope' } },
    ];
    expect(issues(input)).toContain(
      'sets.json › [1] › modifiers › [0] › scope › dungeon: unknown dungeon "nope"',
    );
  });

  it('rejects cosmetics in a set missing from sets.json', () => {
    const input = raw();
    (input.cosmetics as RawCosmetic[])[0]!.set = 'ghost_set';
    expect(issues(input).some((i) => i.includes('unknown set "ghost_set"'))).toBe(true);
  });
});
