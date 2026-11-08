import { describe, expect, it } from 'vitest';
import { RARITIES } from '../src/data';
import {
  advance,
  advanceChunked,
  approxEq,
  baseDamage,
  cardBaseDamage,
  cardStatPower,
  Decimal,
  effectiveDamage,
  fightingXpPerSecond,
  levelCap,
  newOwnedCard,
  xpToNextLevel,
  type GameState,
  type OwnedCard,
} from '../src/game';
import { bareState, constantRng, freshState, plainContent as content, withDps } from './helpers';

const rng = constantRng(0.5);
const rules = content.cardRules;
const mossy = content.dungeons[0]!;
const ember = content.dungeons[1]!;
const trial = content.trials[0]!;

/** Lifetime XP of a card: every level it has passed plus the XP held toward the next. */
function totalXp(owned: OwnedCard): Decimal {
  let sum = owned.xp;
  for (let level = 1; level < owned.level; level++) sum = sum.add(xpToNextLevel(content, level));
  return sum;
}

/** A game whose fighting main is `cardId` at the given rank (owned fresh). */
function leadWith(
  cardId: string,
  patch: Partial<OwnedCard> = {},
  state: GameState = freshState(),
): GameState {
  state.cards.owned[cardId] = { ...newOwnedCard(), ...patch };
  state.cards.loadouts.fighting = { main: cardId, supports: [null, null, null] };
  return state;
}

describe('base damage by rarity (DESIGN.md §5)', () => {
  it('follows the health ratios: 1, 1.5, 2.25, 3.5, 5, 7, 10 times the Common value', () => {
    const common = rules.baseDamage.common;
    expect(common.gt(0)).toBe(true);
    const ratios = [1, 1.5, 2.25, 3.5, 5, 7, 10];
    RARITIES.forEach((rarity, i) => {
      expect(approxEq(rules.baseDamage[rarity], common.mul(ratios[i]!))).toBe(true);
    });
  });

  it('has the same ratios as base health', () => {
    for (const rarity of RARITIES) {
      const damageRatio = rules.baseDamage[rarity].div(rules.baseDamage.common);
      const healthRatio = rules.health[rarity].div(rules.health.common);
      expect(approxEq(damageRatio, healthRatio)).toBe(true);
    }
  });
});

describe('fighting damage comes from the main card', () => {
  it('is the Common base damage for a fresh Ember Squire (Bronze ★1 Lv 1)', () => {
    const state = freshState();
    expect(baseDamage(state, content).eq(rules.baseDamage.common)).toBe(true);
    expect(effectiveDamage(state, content).eq(rules.baseDamage.common)).toBe(true);
  });

  it('follows the rarity of whichever card leads', () => {
    const rare = leadWith('shield_warden');
    expect(baseDamage(rare, content).eq(rules.baseDamage.rare)).toBe(true);
    const legendary = leadWith('dawnblade_regent');
    expect(baseDamage(legendary, content).eq(rules.baseDamage.legendary)).toBe(true);
  });

  it('grows with level, stars and tier through the base-stat power', () => {
    const owned = { ...newOwnedCard(), level: 11, stars: 3, tier: 'silver' as const };
    const state = leadWith('ember_squire', owned);
    const power = cardStatPower(content, owned);
    expect(power).toBeGreaterThan(1.5);
    expect(approxEq(baseDamage(state, content), rules.baseDamage.common.mul(power))).toBe(true);
    expect(
      approxEq(cardBaseDamage(content, 'ember_squire', owned), rules.baseDamage.common.mul(power)),
    ).toBe(true);
  });

  it('counts the level bump once: the pipeline adds nothing extra for a main with no damage bonus', () => {
    const owned = { ...newOwnedCard(), level: 11 };
    const state = leadWith('ember_squire', owned);
    const expected = rules.baseDamage.common.mul(1 + rules.power.perLevel * 10);
    expect(approxEq(effectiveDamage(state, content), expected)).toBe(true);
  });

  it('ignores support cards in the base damage, which a support only changes through its bonus', () => {
    const state = leadWith('ember_squire');
    state.cards.owned['shield_warden'] = newOwnedCard();
    state.cards.loadouts.fighting.supports = ['shield_warden', null, null];
    expect(baseDamage(state, content).eq(rules.baseDamage.common)).toBe(true);
  });

  it('keeps a small bare-hands damage when no card leads', () => {
    const state = bareState();
    expect(baseDamage(state, content).eq(content.combat.unarmedDamage)).toBe(true);
    expect(content.combat.unarmedDamage.lte(rules.baseDamage.common)).toBe(true);
  });

  it('falls back to bare hands for an unknown main card', () => {
    const state = bareState();
    state.cards.loadouts.fighting = { main: 'not_a_card', supports: [null, null, null] };
    expect(baseDamage(state, content).eq(content.combat.unarmedDamage)).toBe(true);
  });
});

describe('card XP from fighting time (DESIGN.md §5)', () => {
  it('pays per second fought, scaled by the dungeon tier like the kill XP', () => {
    const perSecond = fightingXpPerSecond(content, mossy);
    expect(perSecond.eq(rules.xp.perSecond)).toBe(true);
    const deeper = fightingXpPerSecond(content, ember);
    expect(approxEq(deeper, rules.xp.perSecond.mul(rules.xp.tierGrowth.pow(ember.tier - 1)))).toBe(
      true,
    );
  });

  it('gives every fighting card in the loadout XP for each second of a fight with no kill', () => {
    const state = freshState();
    state.cards.owned['shield_warden'] = newOwnedCard();
    state.cards.loadouts.fighting.supports = ['shield_warden', null, null];
    const { state: after, report } = advance(state, content, 100_000, rng);
    expect(report.bossKills).toBe(0);
    const expected = rules.xp.perSecond.mul(100);
    for (const id of ['ember_squire', 'shield_warden']) {
      expect(approxEq(totalXp(after.cards.owned[id]!), expected)).toBe(true);
    }
  });

  it('gives nothing to cards outside the fighting loadout', () => {
    const state = freshState();
    state.cards.owned['storm_duelist'] = newOwnedCard();
    const { state: after } = advance(state, content, 60_000, rng);
    expect(totalXp(after.cards.owned['storm_duelist']!).eq(0)).toBe(true);
  });

  it('adds the per-kill bonus on top of the time', () => {
    // A kill every 3 s: three kills in 10 s, with the time still fought.
    const strong = withDps(mossy.boss.hp.div(3));
    const { state: after, report } = advance(freshState(), strong, 10_000, rng);
    expect(report.bossKills).toBe(3);
    const expected = rules.xp.perSecond.mul(10).add(rules.xp.perKill.mul(3));
    expect(approxEq(totalXp(after.cards.owned['ember_squire']!), expected)).toBe(true);
  });

  it('does not pay while the loadout is knocked out', () => {
    const state = freshState();
    state.combat.knockoutSeconds = 30;
    state.combat.loadoutDamage = new Decimal(1e6);
    const rest = advance(state, content, 20_000, rng).state;
    expect(totalXp(rest.cards.owned['ember_squire']!).eq(0)).toBe(true);
    expect(rest.combat.knockoutSeconds).toBeCloseTo(10);
    // 10 s of knockout left, then 15 s of fighting.
    const back = advance(rest, content, 25_000, rng).state;
    expect(approxEq(totalXp(back.cards.owned['ember_squire']!), rules.xp.perSecond.mul(15))).toBe(
      true,
    );
  });

  it('does not pay when nothing is being fought', () => {
    const state = freshState();
    state.activeDungeonId = null;
    const after = advance(state, content, 60_000, rng).state;
    expect(totalXp(after.cards.owned['ember_squire']!).eq(0)).toBe(true);
  });

  it('pays in the special dungeon too', () => {
    const state = freshState();
    state.clearedDungeons = [ember.id];
    state.activeDungeonId = trial.id;
    const after = advance(state, content, 20_000, rng).state;
    expect(totalXp(after.cards.owned['ember_squire']!).gt(0)).toBe(true);
    expect(approxEq(totalXp(after.cards.owned['ember_squire']!), rules.xp.perSecond.mul(20))).toBe(
      true,
    );
  });

  it('is the same offline (one long step) as online (many small ones)', () => {
    const start = freshState();
    const long = advance(start, content, 600_000, rng).state;
    const short = advanceChunked(start, content, 600_000, rng, 250).state;
    const a = long.cards.owned['ember_squire']!;
    const b = short.cards.owned['ember_squire']!;
    expect(a.level).toBe(b.level);
    expect(approxEq(totalXp(a), totalXp(b))).toBe(true);
    expect(a.level).toBeGreaterThan(1);
  });

  it('leaves production cards on XP per unit harvested', () => {
    const state = freshState();
    const after = advance(state, content, 60_000, rng).state;
    // Oak makes 1 gem/s: the Feller earns perUnit.logging per gem, whatever the fights do.
    const feller = totalXp(after.cards.owned['apprentice_feller']!);
    expect(feller.gte(rules.xp.perUnit.logging.mul(60))).toBe(true);
  });
});

describe('level caps by tier only (DESIGN.md §5)', () => {
  it('is 20 / 40 / 60 / 80 for Bronze, Silver, Gold and Prismatic', () => {
    expect(levelCap(content, { tier: 'bronze', stars: 1 })).toBe(20);
    expect(levelCap(content, { tier: 'silver', stars: 1 })).toBe(40);
    expect(levelCap(content, { tier: 'gold', stars: 1 })).toBe(60);
    expect(levelCap(content, { tier: 'prismatic', stars: 1 })).toBe(80);
  });

  it('does not grow with stars', () => {
    for (const tier of ['bronze', 'silver', 'gold', 'prismatic'] as const) {
      const caps = [1, 2, 3, 4, 5, 6].map((stars) => levelCap(content, { tier, stars }));
      expect(new Set(caps).size).toBe(1);
    }
  });

  it('stops a card at its tier cap whatever its stars', () => {
    const state = leadWith('ember_squire', { level: 20, stars: 6, xp: new Decimal(5) });
    const after = advance(state, content, 120_000, rng).state;
    const squire = after.cards.owned['ember_squire']!;
    expect(squire.level).toBe(20);
    expect(squire.xp.eq(0)).toBe(true);
  });
});
