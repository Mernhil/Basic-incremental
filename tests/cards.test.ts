import { describe, expect, it } from 'vitest';
import {
  addCard,
  advance,
  advanceChunked,
  approxEq,
  slotRates,
  cardCollection,
  cardEffectModifiers,
  cardHealth,
  cardInfo,
  cardModifiers,
  cardPower,
  CARD_LEVEL_STEP_MS,
  collectModifiers,
  createSaveText,
  Decimal,
  buildTeam,
  emptyCardLoadout,
  fightingXpPerKill,
  levelCap,
  loadoutCostCap,
  loadoutInfo,
  loadoutProblem,
  MIGRATIONS,
  migrateState,
  newOwnedCard,
  productionXpPerUnit,
  readSave,
  serializeState,
  setLoadout,
  setLoadoutSlot,
  simulateOffline,
  starUp,
  starUpCheck,
  xpToNextLevel,
  type CardResult,
  type GameState,
  type Modifier,
  type OwnedCard,
} from '../src/game';
import { bareState, constantRng, plainContent, freshState, withDps } from './helpers';

/** The rules counted here in small units: a worker's XP is 1 a Oak Gem and 2 a Copper Gem, as the
 *  tests were written (the shipped per-unit XP is tuning, DESIGN.md §5). */
const content = {
  ...plainContent,
  cardRules: {
    ...plainContent.cardRules,
    xp: {
      ...plainContent.cardRules.xp,
      perUnit: { logging: new Decimal(1), mining: new Decimal(2) },
    },
  },
};
/** The card's power at level 11: ten small level bumps. */
const lv11Power = 1 + 10 * content.cardRules.power.perLevel;

const rng = constantRng(0.5);

function ok(result: CardResult): GameState {
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
  return result.state;
}

function own(state: GameState, id: string, card: Partial<OwnedCard> = {}): GameState {
  state.cards.owned[id] = { ...newOwnedCard(), ...card };
  return state;
}

function give(state: GameState, resource: string, amount: number): GameState {
  state.resources[resource] = new Decimal(amount);
  return state;
}

describe('a new game (DESIGN.md §5)', () => {
  it('owns the three Common cards at Wood ★1 Lv 1, each leading its job', () => {
    const state = freshState();
    expect(Object.keys(state.cards.owned).sort()).toEqual([
      'apprentice_feller',
      'cave_digger',
      'ember_squire',
    ]);
    for (const owned of Object.values(state.cards.owned)) {
      expect(owned).toMatchObject({ tier: 'wood', stars: 1, level: 1, starFill: 0 });
      expect(owned.xp.eq(0)).toBe(true);
    }
    expect(state.cards.loadouts.fighting).toEqual({
      slots: ['ember_squire', null, null, null],
    });
    // the logging and mining start cards are workers on the first tree and mine (DESIGN.md §4)
    expect(state.camp.forest).toEqual([{ material: null, card: 'apprentice_feller' }]);
    expect(state.camp.cave).toEqual([{ material: null, card: 'cave_digger' }]);
    expect(state.cards.shards).toBe(0);
  });
});

describe('levels (DESIGN.md §5)', () => {
  it('caps levels by tier only: 20 / 40 / 60 / 80 / 100 / 120 / 140, whatever the stars', () => {
    expect(levelCap(content, { tier: 'wood', stars: 1 })).toBe(20);
    expect(levelCap(content, { tier: 'wood', stars: 6 })).toBe(20);
    expect(levelCap(content, { tier: 'bronze', stars: 1 })).toBe(40);
    expect(levelCap(content, { tier: 'silver', stars: 3 })).toBe(60);
    expect(levelCap(content, { tier: 'gold', stars: 6 })).toBe(80);
    expect(levelCap(content, { tier: 'prismatic', stars: 1 })).toBe(100);
    expect(levelCap(content, { tier: 'mythic', stars: 1 })).toBe(120);
    expect(levelCap(content, { tier: 'heirloom', stars: 1 })).toBe(140);
  });

  it('follows the XP curve from data', () => {
    const { base, growth } = content.cardRules.xpCurve;
    expect(xpToNextLevel(content, 1).eq(base)).toBe(true);
    expect(approxEq(xpToNextLevel(content, 5), base.mul(growth.pow(4)))).toBe(true);
  });

  it('gives a worker XP per unit its place harvested, and only workers', () => {
    let state = own(bareState(), 'grove_keeper');
    state.camp.forest = [{ material: 'oak', card: 'apprentice_feller' }];
    // the Feller's own ability (+20% card XP) counts at its place
    const perUnit = productionXpPerUnit(
      content,
      'logging',
      collectModifiers(state, content),
      'oak',
    );
    expect(perUnit.toNumber()).toBeCloseTo(content.cardRules.xp.perUnit.logging.toNumber() * 1.2);
    state = advance(state, content, 5000, rng).state; // 5 Oak Gem, no level-up yet
    expect(approxEq(state.cards.owned['apprentice_feller']!.xp, perUnit.mul(5))).toBe(true);
    expect(state.cards.owned['grove_keeper']!.xp.eq(0)).toBe(true); // owned, not working
    expect(state.cards.owned['cave_digger']!.xp.eq(0)).toBe(true); // not working
  });

  it('levels up on whole seconds of play time and reports it', () => {
    const state = bareState();
    state.camp.forest = [{ material: 'oak', card: 'apprentice_feller' }];
    // 10 XP is due after 8.33 s of Oak (1.2 XP per unit with its own +20%, 1 unit per second),
    // so the level comes on the 9 s boundary.
    let { state: after, report } = advance(state, content, 8_500, rng);
    expect(after.cards.owned['apprentice_feller']!.level).toBe(1);
    expect(report.cardLevels).toEqual({});
    ({ state: after, report } = advance(after, content, 500, rng));
    expect(after.cards.owned['apprentice_feller']!.level).toBe(2);
    expect(report.cardLevels).toEqual({ apprentice_feller: { from: 1, to: 2 } });
    expect(after.stats.playTimeMs % CARD_LEVEL_STEP_MS).toBe(0);
  });

  it('gives fighting cards XP per boss kill (on top of the time fought), more in harder dungeons', () => {
    const [mossy, ember, frost] = content.dungeons;
    const perKill = fightingXpPerKill(content, mossy!);
    expect(perKill.eq(content.cardRules.xp.perKill)).toBe(true);
    const growth = content.cardRules.xp.tierGrowth;
    expect(fightingXpPerKill(content, ember!).eq(perKill.mul(growth))).toBe(true);
    expect(fightingXpPerKill(content, frost!).eq(perKill.mul(growth.pow(2)))).toBe(true);

    const state = bareState();
    state.cards.loadouts.fighting.slots[0] = 'ember_squire';
    // The first boss falls in exactly 12 s: its HP over 12 is the damage per second.
    const hp = content.dungeons[0]!.boss.hp.toNumber();
    const { state: after, report } = advance(state, withDps(hp / 12), 12_000, constantRng(0.9));
    expect(report.bossKills).toBe(1);
    const squire = after.cards.owned['ember_squire']!;
    // 12 s fought at perSecond XP and perKill XP on the kill, spent level by level on the curve.
    const xp = content.cardRules.xp;
    let left = xp.perSecond.toNumber() * 12 + xp.perKill.toNumber();
    let level = 1;
    const cost = (l: number) =>
      content.cardRules.xpCurve.base.toNumber() *
      content.cardRules.xpCurve.growth.toNumber() ** (l - 1);
    while (left >= cost(level)) left -= cost(level++);
    expect(squire.level).toBe(level);
    expect(squire.xp.toNumber()).toBeCloseTo(left, 6);
  });

  it('stops XP at the level cap until a tier-up raises it', () => {
    const state = own(bareState(), 'apprentice_feller', { level: 20 });
    state.camp.forest = [{ material: 'oak', card: 'apprentice_feller' }];
    const after = advance(state, content, 60_000, rng).state;
    expect(after.cards.owned['apprentice_feller']).toMatchObject({ level: 20 });
    expect(after.cards.owned['apprentice_feller']!.xp.eq(0)).toBe(true);
  });

  it('gives XP while offline exactly like the live game loop', () => {
    const start = freshState();
    // A Mossy Cellar kill per ~4 min.
    const strong = withDps(content.dungeons[0]!.boss.hp.toNumber() / 240);
    const offline = simulateOffline(start, strong, 0, 3_600_000, rng);
    const live = advanceChunked(start, strong, 3_600_000, rng, 1000).state;
    expect(offline.summary!.cardLevels['apprentice_feller']).toEqual({
      from: 1,
      to: live.cards.owned['apprentice_feller']!.level,
    });
    expect(offline.summary!.cardLevels['ember_squire']!.to).toBeGreaterThan(1);
    for (const [id, card] of Object.entries(live.cards.owned)) {
      const other = offline.state.cards.owned[id]!;
      expect(other.level).toBe(card.level);
      expect(approxEq(other.xp, card.xp)).toBe(true);
    }
    for (const id of ['oak_gem', 'copper_gem', 'moss_sigil']) {
      expect(approxEq(offline.state.resources[id]!, live.resources[id]!)).toBe(true);
    }
    expect(offline.summary!.bossKills).toBe(live.stats.bossKills);
  });
});

describe('card effects through the modifier pipeline (DESIGN.md §14, §5)', () => {
  /** The first team card's own burst numbers (the duel gives each card its own ability). */
  const team = (state: GameState) =>
    buildTeam(state, content, collectModifiers(state, content), null);
  const fighting = (state: GameState) => {
    const lead = team(state)[0]!;
    return {
      interval: lead.interval,
      fill: lead.fill,
      power: lead.hit.gt(0) ? lead.signature.div(lead.hit) : new Decimal(0),
    };
  };

  it('gives a card its ability in any slot, for itself only', () => {
    let state = own(own(bareState(), 'ember_squire'), 'storm_duelist');
    state.account.level = 2; // cost cap 8: Squire 2 + Duelist 5 fit
    expect(fighting(state).interval).toBe(1); // no card: 1 s
    state = ok(setLoadoutSlot(state, content, 'fighting', 0, 'ember_squire'));
    state = ok(setLoadoutSlot(state, content, 'fighting', 2, 'storm_duelist'));
    const [squire, duelist] = team(state);
    expect([squire!.interval, squire!.fill]).toEqual([1, 1]); // the Squire is steady
    expect([duelist!.interval, duelist!.fill]).toEqual([0.5, 2]); // the Duelist, in slot 3, is fast
    // no ability is in the team's modifiers: it is the card's own in the duel
    const mods = collectModifiers(state, content);
    expect(mods.some((m) => m.source.kind === 'card' && m.stat.startsWith('burst.'))).toBe(false);
  });

  it('gives Dawnblade Regent heavy hits and a ×15 signature attack', () => {
    const state = own(bareState(), 'dawnblade_regent');
    state.cards.loadouts.fighting.slots[0] = 'dawnblade_regent';
    expect(fighting(state).interval).toBe(2);
    expect(fighting(state).power.toNumber()).toBeCloseTo(15);
  });

  it('has every loadout card give the team its bonus, whatever its slot', () => {
    let state = own(bareState(), 'storm_duelist');
    state.cards.loadouts.fighting.slots[0] = 'ember_squire';
    const bonuses = (s: GameState) =>
      collectModifiers(s, content)
        .filter((m) => m.source.kind === 'card' && m.stat === 'combat.damage')
        .map((m) => [m.source.id, m.value.toNumber()])
        .sort();
    expect(bonuses(state)).toEqual([['ember_squire', 4]]); // the first card gives its bonus too
    state.account.level = 2; // cost cap 8: Squire 2 + Duelist 5 fit
    state = ok(setLoadoutSlot(state, content, 'fighting', 1, 'storm_duelist'));
    expect(bonuses(state)).toEqual([
      ['ember_squire', 4],
      ['storm_duelist', 10],
    ]);
    state = ok(setLoadoutSlot(state, content, 'fighting', 0, 'storm_duelist')); // swap
    expect(state.cards.loadouts.fighting).toEqual({
      slots: ['storm_duelist', 'ember_squire', null, null],
    });
    expect(bonuses(state)).toEqual([
      ['ember_squire', 4],
      ['storm_duelist', 10],
    ]); // the order only sets left to right
    expect(team(state).map((c) => c.id)).toEqual(['storm_duelist', 'ember_squire']);
    expect(fighting(state).interval).toBe(0.5); // the Duelist, now first, hits every 0.5 s
  });

  it('scales bonuses with level, stars and tier, with a big step at ★6 and per tier', () => {
    const at = (card: Partial<OwnedCard>) => cardPower(content, { ...newOwnedCard(), ...card });
    expect(at({})).toBe(1);
    expect(at({ level: 11 })).toBeCloseTo(lv11Power);
    expect(at({ stars: 6 }) - at({ stars: 5 })).toBeGreaterThan(
      at({ stars: 5 }) - at({ stars: 4 }) * 2,
    );
    // the tier step comes with the card's levels: a Silver card has it once past Lv 40
    expect(at({ tier: 'silver' })).toBe(1);
    expect(at({ tier: 'silver', level: 60 }) / at({ tier: 'wood', level: 60 })).toBeCloseTo(1.5);
    expect(at({ tier: 'prismatic', stars: 6, level: 100 })).toBeGreaterThan(10);

    const lv11 = { ...newOwnedCard(), level: 11 };
    const bonus = cardEffectModifiers(content, 'storm_duelist', 'team', lv11);
    expect(bonus[0]!.value.toNumber()).toBeCloseTo(10 * lv11Power); // +10% damage at the level-11 power
    const main = cardEffectModifiers(content, 'storm_duelist', 'ability', lv11);
    // The fill ×2 is a `mult` that stays fixed; main growth adds +2% fill. Damage grows through
    // the card's base damage instead (DESIGN.md §5), so there is no damage percent here.
    expect(main.find((m) => m.stat === 'burst.fill' && m.kind === 'mult')!.value.eq(2)).toBe(true);
    const growth = main.filter((m) => m.kind === 'percent');
    expect(growth.map((m) => [m.stat, Math.round(m.value.toNumber() * 1000) / 1000])).toEqual([
      ['burst.fill', Math.round(10 * (lv11Power - 1) * 1000) / 1000],
    ]);
  });

  it('gives each card health by its tier, scaled by its power', () => {
    const base = newOwnedCard();
    const { wood, prismatic: legendary } = content.cardRules.health;
    expect(cardHealth(content, 'ember_squire', base).eq(wood)).toBe(true);
    // Weapon identities (DESIGN.md §5): the greatsword's health factor is 1.05.
    expect(cardHealth(content, 'dawnblade_regent', base).toNumber()).toBeCloseTo(
      legendary.toNumber() * 1.05,
    );
    const lv11 = { ...base, level: 11 };
    expect(cardHealth(content, 'ember_squire', lv11).toNumber()).toBeCloseTo(
      wood.toNumber() * lv11Power,
    );
    expect(cardHealth(content, 'nope', base).eq(0)).toBe(true);
  });

  it('makes a levelled worker raise its slot’s output', () => {
    const state = own(bareState(), 'apprentice_feller', { level: 11 });
    expect(slotRates(state, content)).toEqual([]);
    state.camp.forest = [{ material: 'oak', card: 'apprentice_feller' }];
    expect(slotRates(state, content)[0]!.rate.toNumber()).toBeCloseTo(lv11Power);
  });

  it('lists nothing for cards in the wrong job or not owned', () => {
    const state = bareState();
    state.cards.loadouts.fighting.slots[0] = 'apprentice_feller'; // a logging card
    state.camp.forest = [{ material: 'oak', card: 'moonwood_dryad' }]; // not owned
    expect(cardModifiers(state, content)).toEqual([]);
  });
});

describe('loadouts (DESIGN.md §5)', () => {
  it('has a cost cap of 6 at account level 1, read through loadout.costCap', () => {
    const state = freshState();
    expect(loadoutCostCap(state, content, 'fighting')).toBe(6);
    const raise: Modifier = {
      stat: 'loadout.costCap',
      kind: 'flat',
      value: new Decimal(2),
      scope: { job: 'fighting' },
      source: { kind: 'skill', id: 'test' },
    };
    expect(loadoutCostCap(state, content, 'fighting', [raise])).toBe(8);
    // only the fighting loadout has a cost cap: logging and mining cards are workers
    expect(loadoutInfo(state, content, 'fighting')).toEqual({
      job: 'fighting',
      slots: ['ember_squire', null, null, null],
      cost: 2,
      cap: 6,
      nextRise: { by: 2, level: 2 },
    });
  });

  it('checks job, ownership, duplicates, slots and the cost cap', () => {
    const state = own(freshState(), 'storm_duelist');
    const set = (slot: number, id: string | null) =>
      setLoadoutSlot(state, content, 'fighting', slot, id);
    expect(set(0, 'nope')).toEqual({ ok: false, reason: 'unknown' });
    expect(set(0, 'dawnblade_regent')).toEqual({ ok: false, reason: 'not-owned' });
    expect(set(0, 'apprentice_feller')).toEqual({ ok: false, reason: 'wrong-job' });
    expect(set(4, 'storm_duelist')).toEqual({ ok: false, reason: 'invalid-slot' });
    expect(set(-1, 'storm_duelist')).toEqual({ ok: false, reason: 'invalid-slot' });
    // Squire 2 + Duelist 5 = 7 does not fit the starting cap of 6; at account level 2 (cap 8) it does.
    expect(set(1, 'storm_duelist')).toEqual({ ok: false, reason: 'over-cost-cap' });
    const roomy = own(freshState(), 'storm_duelist');
    roomy.account.level = 2;
    ok(setLoadoutSlot(roomy, content, 'fighting', 1, 'storm_duelist'));
    expect(
      setLoadout(state, content, 'fighting', {
        slots: ['storm_duelist', 'storm_duelist', null, null],
      }),
    ).toEqual({ ok: false, reason: 'duplicate' });
    expect(loadoutProblem(state, content, 'fighting', { slots: [null, null, null] })).toBe(
      'invalid-slot',
    );
    // A card alone must fit too.
    const heavy = own(freshState(), 'dawnblade_regent');
    expect(setLoadoutSlot(heavy, content, 'fighting', 0, 'dawnblade_regent')).toEqual({
      ok: false,
      reason: 'over-cost-cap',
    });
  });

  it('drags: swaps two filled slots, and refuses a drop the rules refuse without changing anything', () => {
    let state = own(freshState(), 'storm_duelist');
    state.account.level = 2; // cap 8: Squire 2 + Duelist 5 fit
    state = ok(setLoadoutSlot(state, content, 'fighting', 0, 'ember_squire'));
    state = ok(setLoadoutSlot(state, content, 'fighting', 3, 'storm_duelist'));
    // drag the Squire (slot 0) onto the Duelist (slot 3): they swap in one step
    state = ok(setLoadoutSlot(state, content, 'fighting', 3, 'ember_squire'));
    expect(state.cards.loadouts.fighting.slots).toEqual([
      'storm_duelist',
      null,
      null,
      'ember_squire',
    ]);
    // drag onto an empty slot: it moves
    state = ok(setLoadoutSlot(state, content, 'fighting', 1, 'storm_duelist'));
    expect(state.cards.loadouts.fighting.slots).toEqual([
      null,
      'storm_duelist',
      null,
      'ember_squire',
    ]);
    // a card from the picker dropped on a filled slot replaces it; over the cap it is refused
    const heavy = own(state, 'dawnblade_regent');
    expect(setLoadoutSlot(heavy, content, 'fighting', 1, 'dawnblade_regent')).toEqual({
      ok: false,
      reason: 'over-cost-cap',
    });
    expect(heavy.cards.loadouts.fighting.slots).toEqual([
      null,
      'storm_duelist',
      null,
      'ember_squire',
    ]);
  });

  it('moves a card already in the loadout and clears slots', () => {
    let state = own(freshState(), 'storm_duelist');
    state.account.level = 2; // room for Squire 2 + Duelist 5
    state = ok(setLoadoutSlot(state, content, 'fighting', 0, 'storm_duelist'));
    state = ok(setLoadoutSlot(state, content, 'fighting', 2, 'storm_duelist'));
    expect(state.cards.loadouts.fighting.slots).toEqual([null, null, 'storm_duelist', null]);
    state = ok(setLoadoutSlot(state, content, 'fighting', 2, null));
    expect(state.cards.loadouts.fighting.slots[2]).toBeNull();
    state = ok(setLoadout(state, content, 'fighting', emptyCardLoadout()));
    expect(state.cards.loadouts.fighting).toEqual(emptyCardLoadout());
  });
});

describe('star-up, and no tier-up (DESIGN.md §5 No tier-ups)', () => {
  it('lists what a star-up needs: the star bar fill, nothing else', () => {
    const state = own(freshState(), 'ember_squire', { level: 12 });
    const check = starUpCheck(state, content, 'ember_squire')!;
    expect(check.available).toBe(true);
    expect(check.to).toEqual({ tier: 'wood', stars: 2 });
    expect(check.met).toBe(false);
    expect(
      check.requirements.map((r) => [
        r.kind,
        r.resource,
        r.have.toNumber(),
        r.need.toNumber(),
        r.met,
      ]),
    ).toEqual([['starFill', undefined, 0, 1, false]]);
    expect(starUp(state, content, 'ember_squire')).toEqual({ ok: false, reason: 'requirements' });
    expect(starUpCheck(state, content, 'storm_duelist')).toBeNull();
    expect(starUp(state, content, 'storm_duelist')).toEqual({ ok: false, reason: 'not-owned' });
    expect(starUp(state, content, 'nope')).toEqual({ ok: false, reason: 'unknown' });
  });

  it('spends the fill and keeps the level; the cap stays', () => {
    const need = 1; // one copy a star, at every tier
    const state = own(freshState(), 'ember_squire', { level: 20, starFill: need + 2 });
    const after = ok(starUp(state, content, 'ember_squire'));
    expect(after.cards.owned['ember_squire']).toMatchObject({ stars: 2, level: 20, starFill: 2 });
    expect(cardInfo(after, content, 'ember_squire')!.levelCap).toBe(20); // stars do not raise it
    expect(state.cards.owned['ember_squire']!.stars).toBe(1); // pure
  });

  it('has no star-up at ★6', () => {
    const state = own(freshState(), 'ember_squire', { stars: 6 });
    expect(starUpCheck(state, content, 'ember_squire')).toMatchObject({
      available: false,
      to: null,
    });
    expect(starUp(state, content, 'ember_squire')).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('a star costs one copy at every tier, an Heirloom has no star bar', () => {
    for (const id of [
      'ember_squire',
      'brass_vanguard',
      'storm_duelist',
      'dawnblade_regent',
      'core_titan',
    ]) {
      const card = content.cardById.get(id)!;
      const state = own(freshState(), id, { tier: card.tier });
      expect(starUpCheck(state, content, id)!.requirements[0]!.need.toNumber(), id).toBe(1);
    }
    const heirloom = own(freshState(), 'solaris', { tier: 'heirloom' });
    expect(starUpCheck(heirloom, content, 'solaris')!.available).toBe(false);
  });

  it('has no tier-up: the card rules hold no tier-up price and a card keeps its tier', () => {
    expect('tierUp' in content.cardRules).toBe(false);
    // a maxed Wood card with everything in hand stays Wood
    let state = own(freshState(), 'ember_squire', { stars: 6, level: 20 });
    for (const r of ['money', 'moss_core', 'iron_gem', 'ironbark_gem']) state = give(state, r, 1e9);
    expect(cardInfo(state, content, 'ember_squire')!.rank).toEqual({ tier: 'wood', stars: 6 });
    expect(cardInfo(state, content, 'ember_squire')!.maxRank).toBe(true);
    expect('tierUp' in cardInfo(state, content, 'ember_squire')!).toBe(false);
  });
});

describe('gaining cards (DESIGN.md §5)', () => {
  it('adds a new card, then duplicates into the star bar, then shards at ★6', () => {
    let result = addCard(freshState(), content, 'dawnblade_regent')!;
    expect(result.gain).toEqual({ kind: 'new' });
    // a card arrives at its own tier (DESIGN.md §5 No tier-ups): the Prismatic greatsword is Prismatic
    expect(result.state.cards.owned['dawnblade_regent']).toMatchObject({
      tier: 'prismatic',
      stars: 1,
      level: 1,
    });
    expect(
      addCard(freshState(), content, 'core_titan')!.state.cards.owned['core_titan']!.tier,
    ).toBe('mythic');
    expect(
      addCard(freshState(), content, 'silver_cavalier')!.state.cards.owned['silver_cavalier'],
    ).toMatchObject({ tier: 'silver', stars: 1, level: 1 });
    result = addCard(result.state, content, 'dawnblade_regent')!;
    expect(result.gain).toEqual({ kind: 'duplicate', duplicates: 1 });
    const maxed = own(result.state, 'dawnblade_regent', { stars: 6 });
    result = addCard(maxed, content, 'dawnblade_regent')!;
    expect(result.gain).toEqual({ kind: 'shards', shards: 8 }); // Prismatic
    expect(result.state.cards.shards).toBe(8);
    expect(addCard(freshState(), content, 'nope')).toBeNull();
  });

  it('gives shards by tier as in DESIGN.md §5', () => {
    expect(content.cardRules.shards).toEqual({
      wood: 1,
      bronze: 1,
      silver: 2,
      gold: 4,
      prismatic: 8,
      mythic: 25, // T6: the Mythic and the Void side alike
    });
  });
});

describe('views for the Cards page', () => {
  it('describes owned and unowned cards', () => {
    const state = freshState();
    const squire = cardInfo(state, content, 'ember_squire')!;
    expect(squire).toMatchObject({
      rank: { tier: 'wood', stars: 1 },
      levelCap: 20,
      power: 1,
      cost: 2,
      slot: { job: 'fighting', slot: 0 },
      maxRank: false,
    });
    expect(squire.xpToNext!.eq(10)).toBe(true);
    expect(squire.teamModifiers.map((m) => m.stat)).toEqual(['combat.damage']);
    const regent = cardInfo(state, content, 'dawnblade_regent')!;
    expect(regent).toMatchObject({ owned: null, rank: null, slot: null, cost: 9, starUp: null });
    // not owned: previewed fresh at its own tier (Prismatic), where its ability has already grown
    expect(regent.abilityModifiers.map((m) => m.stat).slice(0, 2)).toEqual([
      'burst.interval',
      'burst.power',
    ]);
    expect(cardInfo(state, content, 'nope')).toBeNull();
    // 144 ladder cards (22 of them Leviathan) and the 22 Heirloom cards.
    expect(cardCollection(state, content).map((c) => c.card.id)).toHaveLength(166);
    expect(cardCollection(state, content, 'mining').map((c) => c.card.id)).toEqual([
      'cave_digger',
      'gem_cutter',
      'geode_golem',
      'core_titan',
      'pebble_prospector',
      'prism_delver',
      'lodestone_seer',
      // the Heirloom-candidate pickaxes follow, in cards.json order (DESIGN.md §5)
      'azure_delver',
      'emerald_seer',
      'ruby_gnawer',
      'void_burrower',
      'amber_gnawer',
      // then the Dragon Heirloom pickaxe, the Leviathan T6 pickaxes (batch 2) and its Heirloom
      'heartdelver',
      'reef_prospector',
      'trench_burrower',
      'prismstrike',
    ]);
  });
});

describe('saving cards (save format v5)', () => {
  it('round-trips the collection, loadouts and shards', () => {
    const state = own(freshState(), 'storm_duelist', {
      tier: 'gold',
      stars: 3,
      level: 55,
      xp: new Decimal('123.5'),
      starFill: 4,
    });
    state.cards.loadouts.fighting.slots[2] = 'storm_duelist';
    state.cards.shards = 17;
    const loaded = readSave(createSaveText(state, 1), content).state;
    expect(serializeState(loaded)).toEqual(serializeState(state));
    expect(loaded.cards.owned['storm_duelist']!.xp.eq('123.5')).toBe(true);
  });

  it('drops unknown cards, clamps levels and empties invalid loadout slots', () => {
    const text = createSaveText(freshState(), 1);
    const envelope = JSON.parse(text);
    const cards = envelope.state.cards;
    cards.owned['removed_card'] = {
      tier: 'bronze',
      stars: 1,
      level: 1,
      xp: '0',
      starFill: 0,
      enhancements: [],
    };
    cards.owned['ember_squire'].level = 99;
    cards.owned['ember_squire'].xp = '5';
    cards.loadouts.fighting = {
      slots: ['removed_card', 'ember_squire', 'ember_squire', 'apprentice_feller'],
    };
    cards.loadouts.mining = { slots: ['gem_cutter'] }; // an old loadout: dropped
    const loaded = readSave(JSON.stringify(envelope), content).state;
    expect(loaded.cards.owned['removed_card']).toBeUndefined();
    expect(loaded.cards.owned['ember_squire']).toMatchObject({ level: 20 });
    expect(loaded.cards.owned['ember_squire']!.xp.eq(0)).toBe(true);
    expect(loaded.cards.loadouts.fighting).toEqual({
      slots: [null, 'ember_squire', null, null],
    });
    expect(Object.keys(loaded.cards.loadouts)).toEqual(['fighting']);
  });

  it('migrates a v4 save: the three Commons, each leading its job', () => {
    const v4 = {
      resources: { oak_gem: '12' },
      cosmetics: {
        loadout: {
          slots: {},
          cards: { example_fighting_main: { border: { id: 'ember_crown', level: 1 } } },
        },
        owned: {},
      },
    };
    const migrated = migrateState(v4, 4, 5, MIGRATIONS) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(migrated['cards']).toEqual({
      owned: {
        ember_squire: { tier: 'bronze', stars: 1, level: 1, xp: '0', duplicates: 0 },
        apprentice_feller: { tier: 'bronze', stars: 1, level: 1, xp: '0', duplicates: 0 },
        cave_digger: { tier: 'bronze', stars: 1, level: 1, xp: '0', duplicates: 0 },
      },
      loadouts: {
        fighting: { main: 'ember_squire', supports: [null, null, null] },
        logging: { main: 'apprentice_feller', supports: [null, null, null] },
        mining: { main: 'cave_digger', supports: [null, null, null] },
      },
      shards: 0,
    });
    expect(migrated['cosmetics'].loadout.cards).toEqual({
      dawnblade_regent: { border: { id: 'ember_crown', level: 1 } },
    });
    expect(v4.cosmetics.loadout.cards).toHaveProperty('example_fighting_main'); // not mutated
  });

  it('loads a real v4 save file into the same cards as a new game', () => {
    const v4 = JSON.parse(createSaveText(freshState(), 1));
    delete v4.state.cards;
    v4.version = 4;
    const loaded = readSave(JSON.stringify(v4), content).state;
    // an old save has no positions: its lone card is placed in the front row
    const fresh = freshState();
    fresh.cards.loadouts.fighting.slots = [null, 'ember_squire', null, null];
    expect(serializeState(loaded).cards).toEqual(serializeState(fresh).cards);
  });
});
