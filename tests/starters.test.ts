import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/data';
import {
  addCard,
  breakSeal,
  cardBaseDamage,
  cardCost,
  cardHealth,
  cardPower,
  createInitialState,
  createSaveText,
  Decimal,
  loadoutProblem,
  newOwnedCard,
  nextSealCost,
  pickStarter,
  readSave,
  skipStarter,
  starterChoices,
  starterPickDue,
  strengthTier,
} from '../src/game';

const content = loadContent();
const START = ['ember_squire', 'apprentice_feller', 'cave_digger'];

function withCores(amounts: Record<string, number>) {
  const state = createInitialState(content);
  for (const [id, n] of Object.entries(amounts)) state.resources[id] = new Decimal(n);
  return state;
}

/** DESIGN.md §2 Starter weapon. */
describe('the starter pick', () => {
  it('offers the four starters to a new game, which still owns its start cards', () => {
    const state = createInitialState(content);
    expect(starterPickDue(state, content)).toBe(true);
    expect(starterChoices(state, content).map((c) => c.heirloomName)).toEqual([
      'Crimsonfall',
      'Jadecleaver',
      'Sunweaver',
      'Tideseer',
    ]);
    expect(Object.keys(state.cards.owned).sort()).toEqual([...START].sort());
    expect(state.starter).toEqual({ done: false, skippable: false });
  });

  it('gives the card sealed, takes a free slot, and keeps the start cards', () => {
    const state = createInitialState(content);
    const r = pickStarter(state, content, 'dawn_archer');
    if (!r.ok) throw new Error(r.reason);
    const owned = r.state.cards.owned['dawn_archer']!;
    expect(owned).toMatchObject({ tier: 'mythic', stars: 1, level: 1, seal: 0 });
    for (const id of START) expect(r.state.cards.owned[id]).toBeDefined();
    expect(r.state.cards.loadouts.fighting.slots).toContain('dawn_archer');
    expect(r.state.starter.done).toBe(true);
    expect(starterPickDue(r.state, content)).toBe(false);
    expect(
      loadoutProblem(r.state, content, 'fighting', r.state.cards.loadouts.fighting),
    ).toBeNull();
    expect(state.cards.owned['dawn_archer']).toBeUndefined();
  });

  it('refuses a second pick, an unknown card and a card that is not a starter', () => {
    const state = createInitialState(content);
    const r = pickStarter(state, content, 'tide_oracle');
    if (!r.ok) throw new Error(r.reason);
    expect(pickStarter(r.state, content, 'jade_regent')).toEqual({
      ok: false,
      reason: 'already-picked',
    });
    expect(pickStarter(state, content, 'ember_squire')).toEqual({ ok: false, reason: 'unknown' });
    expect(pickStarter(state, content, 'nope')).toEqual({ ok: false, reason: 'unknown' });
  });

  it('never offers or takes a starter the player already owns', () => {
    const state = createInitialState(content);
    state.cards.owned['moon_reaver'] = newOwnedCard('mythic');
    expect(starterChoices(state, content).map((c) => c.id)).not.toContain('moon_reaver');
    expect(pickStarter(state, content, 'moon_reaver')).toEqual({ ok: false, reason: 'owned' });
  });

  it('may be turned down only where the save is old enough to skip', () => {
    const fresh = createInitialState(content);
    expect(skipStarter(fresh)).toEqual({ ok: false, reason: 'already-picked' });
    fresh.starter.skippable = true;
    const r = skipStarter(fresh);
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.starter.done).toBe(true);
  });
});

describe('the seals', () => {
  const picked = (id = 'moon_reaver') => {
    const state = withCores({ moss_core: 100, cinder_core: 100, frost_core: 100, storm_core: 100 });
    const r = pickStarter(state, content, id);
    if (!r.ok) throw new Error(r.reason);
    return r.state;
  };

  it('has four light steps, each paid in the Cores of the first four dungeons', () => {
    const costs = content.starters.seals.map((s) => s.cost.map((c) => c.resource));
    expect(costs).toEqual([['moss_core'], ['cinder_core'], ['frost_core'], ['storm_core']]);
    expect(content.starters.seals.map((s) => s.tier)).toEqual([
      'silver',
      'gold',
      'prismatic',
      'mythic',
    ]);
  });

  it('fights as a Wood card while sealed, and as the whole T6 card once unsealed', () => {
    const owned = picked().cards.owned['moon_reaver']!;
    const wood = newOwnedCard('wood');
    const t6 = newOwnedCard('mythic');
    expect(strengthTier(content, owned)).toBe('wood');
    // the Wood base times the sword's factor: what a Wood sword of the same level and stars hits
    const rules = content.cardRules;
    expect(cardBaseDamage(content, 'moon_reaver', owned).toString()).toBe(
      rules.baseDamage.wood.mul(rules.weapons.sword!.damage).toString(),
    );
    expect(cardHealth(content, 'moon_reaver', owned).toString()).toBe(
      rules.health.wood.mul(rules.weapons.sword!.health).toString(),
    );
    expect(
      cardBaseDamage(content, 'moon_reaver', owned).lt(cardBaseDamage(content, 'moon_reaver', t6)),
    ).toBe(true);
    expect(cardPower(content, owned)).toBe(cardPower(content, wood));
    expect(cardCost(content, 'moon_reaver', owned)).toBe(content.cardRules.cost.wood);
    expect(cardCost(content, 'moon_reaver')).toBe(content.cardRules.cost.mythic);
  });

  it('breaks one seal at a time, paying the Cores, and is the T6 card after the last', () => {
    let state = picked();
    const tiers: string[] = [];
    let spent = new Decimal(0);
    for (let i = 0; i < content.starters.seals.length; i++) {
      const cost = nextSealCost(state, content, 'moon_reaver')!;
      expect(cost).toHaveLength(1);
      const before = state.resources[cost[0]!.resource]!;
      const r = breakSeal(state, content, 'moon_reaver');
      if (!r.ok) throw new Error(r.reason);
      expect(r.state.resources[cost[0]!.resource]!.toString()).toBe(
        before.sub(cost[0]!.amount).toString(),
      );
      spent = spent.add(cost[0]!.amount);
      state = r.state;
      tiers.push(strengthTier(content, state.cards.owned['moon_reaver']!));
    }
    expect(tiers).toEqual(['silver', 'gold', 'prismatic', 'mythic']);
    const owned = state.cards.owned['moon_reaver']!;
    expect(owned.seal).toBeUndefined();
    expect(cardBaseDamage(content, 'moon_reaver', owned).toString()).toBe(
      cardBaseDamage(content, 'moon_reaver', newOwnedCard('mythic')).toString(),
    );
    expect(nextSealCost(state, content, 'moon_reaver')).toBeNull();
    expect(breakSeal(state, content, 'moon_reaver')).toEqual({ ok: false, reason: 'not-sealed' });
    expect(spent.lt(40)).toBe(true); // light: under 40 Cores in all
  });

  it('refuses a seal the Cores do not pay for, and a card that is not sealed', () => {
    const state = createInitialState(content);
    const r = pickStarter(state, content, 'jade_regent');
    if (!r.ok) throw new Error(r.reason);
    expect(breakSeal(r.state, content, 'jade_regent')).toEqual({
      ok: false,
      reason: 'unaffordable',
    });
    expect(breakSeal(r.state, content, 'ember_squire')).toEqual({
      ok: false,
      reason: 'not-sealed',
    });
  });

  it('is stronger with every seal', () => {
    let state = picked('tide_oracle');
    let last = new Decimal(0);
    for (let i = 0; i <= content.starters.seals.length; i++) {
      const dmg = cardBaseDamage(content, 'tide_oracle', state.cards.owned['tide_oracle']!);
      expect(dmg.gt(last)).toBe(true);
      last = dmg;
      const r = breakSeal(state, content, 'tide_oracle');
      if (!r.ok) break;
      state = r.state;
    }
  });
});

describe('a copy of the starter', () => {
  it('is a star on the same card, and the seals stay', () => {
    const state = createInitialState(content);
    const r = pickStarter(state, content, 'dawn_archer');
    if (!r.ok) throw new Error(r.reason);
    const gained = addCard(r.state, content, 'dawn_archer')!;
    expect(gained.gain.kind).toBe('duplicate');
    expect(gained.state.cards.owned['dawn_archer']).toMatchObject({ starFill: 1, seal: 0 });
  });
});

describe('the starter in a save', () => {
  it('keeps its seals and the pick through a save and load', () => {
    const state = withCores({ moss_core: 10 });
    const p = pickStarter(state, content, 'dawn_archer');
    if (!p.ok) throw new Error(p.reason);
    const b = breakSeal(p.state, content, 'dawn_archer');
    if (!b.ok) throw new Error(b.reason);
    const back = readSave(createSaveText(b.state, 1_000), content).state;
    expect(back.cards.owned['dawn_archer']!.seal).toBe(1);
    expect(back.starter.done).toBe(true);
  });

  it('drops a seal on a card that is not a starter, or past the last step', () => {
    const state = createInitialState(content);
    state.cards.owned['ember_squire']!.seal = 1;
    state.cards.owned['moon_reaver'] = { ...newOwnedCard('mythic'), seal: 9 };
    const back = readSave(createSaveText(state, 1_000), content).state;
    expect(back.cards.owned['ember_squire']!.seal).toBeUndefined();
    expect(back.cards.owned['moon_reaver']!.seal).toBeUndefined();
  });
});
