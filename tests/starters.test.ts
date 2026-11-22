import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/data';
import {
  addCard,
  breakSeal,
  cardBaseDamage,
  cardCost,
  cardHealth,
  cardPower,
  claimStarter,
  createInitialState,
  createSaveText,
  Decimal,
  endlessReached,
  floorCount,
  loadoutProblem,
  newOwnedCard,
  nextSealCost,
  nightmareClears,
  readSave,
  setLoadoutSlot,
  skipStarter,
  starterChoices,
  starterPickDue,
  starterUnlockDue,
  starterUnlocks,
  strengthTier,
  type GameState,
} from '../src/game';

const content = loadContent();
const START = ['ember_squire', 'apprentice_feller', 'cave_digger'];
const [D1, D2] = content.dungeons;
const EARTH = 'verdant_smith'; // hammer, tank
const FIRE = 'moon_reaver'; // sword, dps
const WATER = 'tide_oracle'; // staff, support
const LIGHT = 'seraph_lancer'; // lance
const DARK = 'royal_impaler'; // spear, dps

function withCores(amounts: Record<string, number>) {
  const state = createInitialState(content);
  for (const [id, n] of Object.entries(amounts)) state.resources[id] = new Decimal(n);
  return state;
}

function progressOf(state: GameState, dungeonId: string) {
  return (state.combat.floors[dungeonId] ??= {
    difficulty: 'normal',
    autoChallenge: true,
    tiers: {},
  });
}

/** Marks a dungeon's Nightmare boss as beaten. */
function clearNightmare(state: GameState, dungeonId: string): void {
  const d = content.dungeons.find((x) => x.id === dungeonId)!;
  const best = floorCount(d, 'nightmare');
  progressOf(state, dungeonId).tiers.nightmare = { floor: best, best };
}

/** Reaches the endless depths of a dungeon. */
function reachEndless(state: GameState, dungeonId: string): void {
  progressOf(state, dungeonId).tiers.endless = { floor: 1, best: 1 };
}

const claim = (state: GameState, id: string): GameState => {
  const r = claimStarter(state, content, id);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};

/** DESIGN.md §2 Starter weapon. */
describe('the starter pick', () => {
  it('offers the three base starters to a new game, which still owns its start cards', () => {
    const state = createInitialState(content);
    expect(starterPickDue(state, content)).toBe(true);
    expect(starterChoices(state, content).map((c) => c.id)).toEqual([EARTH, FIRE, WATER]);
    expect(starterChoices(state, content).map((c) => c.item.kind)).toEqual([
      'hammer',
      'sword',
      'staff',
    ]);
    expect(Object.keys(state.cards.owned).sort()).toEqual([...START].sort());
    expect(state.starter).toEqual({ done: false, skippable: false });
  });

  it('gives the card sealed, takes a free slot, and keeps the start cards', () => {
    const state = createInitialState(content);
    const next = claim(state, EARTH);
    const owned = next.cards.owned[EARTH]!;
    expect(owned).toMatchObject({ tier: 'mythic', stars: 1, level: 1, seal: 0 });
    for (const id of START) expect(next.cards.owned[id]).toBeDefined();
    expect(next.cards.loadouts.fighting.slots).toContain(EARTH);
    expect(next.starter.done).toBe(true);
    expect(starterPickDue(next, content)).toBe(false);
    expect(loadoutProblem(next, content, 'fighting', next.cards.loadouts.fighting)).toBeNull();
    expect(state.cards.owned[EARTH]).toBeUndefined();
  });

  it('refuses a special starter at the start, an owned card and a card that is not a starter', () => {
    const state = createInitialState(content);
    expect(claimStarter(state, content, LIGHT)).toEqual({ ok: false, reason: 'not-due' });
    expect(claimStarter(state, content, 'ember_squire')).toEqual({ ok: false, reason: 'unknown' });
    expect(claimStarter(state, content, 'nope')).toEqual({ ok: false, reason: 'unknown' });
    const next = claim(state, WATER);
    expect(claimStarter(next, content, WATER)).toEqual({ ok: false, reason: 'owned' });
    // the pick is taken: nothing more is due until a dungeon is cleared
    expect(claimStarter(next, content, EARTH)).toEqual({ ok: false, reason: 'not-due' });
  });

  it('never offers a starter the player already owns', () => {
    const state = createInitialState(content);
    state.cards.owned[FIRE] = newOwnedCard('mythic');
    expect(starterChoices(state, content).map((c) => c.id)).not.toContain(FIRE);
    expect(claimStarter(state, content, FIRE)).toEqual({ ok: false, reason: 'owned' });
  });

  it('may be turned down only where the save is old enough to skip', () => {
    const fresh = createInitialState(content);
    expect(skipStarter(fresh)).toEqual({ ok: false, reason: 'not-due' });
    fresh.starter.skippable = true;
    const r = skipStarter(fresh);
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.starter.done).toBe(true);
  });
});

describe('the unlocks', () => {
  it('opens one more base starter for each dungeon cleared on Nightmare, the player choosing', () => {
    let state = claim(createInitialState(content), FIRE);
    expect(starterUnlockDue(state, content)).toBe(false);
    clearNightmare(state, D1!.id);
    expect(nightmareClears(state, content)).toBe(1);
    expect(starterUnlockDue(state, content)).toBe(true);
    expect(starterChoices(state, content).map((c) => c.id)).toEqual([EARTH, WATER]);
    state = claim(state, WATER);
    expect(starterUnlockDue(state, content)).toBe(false);
    clearNightmare(state, D2!.id);
    expect(starterChoices(state, content).map((c) => c.id)).toEqual([EARTH]);
    state = claim(state, EARTH);
    // all three base starters are owned; a third clear opens nothing more
    clearNightmare(state, content.dungeons[2]!.id);
    expect(starterUnlocks(state, content)).toEqual({ base: 0, special: 0 });
  });

  it('opens a special starter for the first and the second dungeon reached in the endless', () => {
    let state = claim(createInitialState(content), FIRE);
    // clearing Nightmare is not reaching the endless depths
    clearNightmare(state, D1!.id);
    state = claim(state, EARTH);
    expect(endlessReached(state, content)).toBe(0);
    expect(starterUnlocks(state, content).special).toBe(0);
    reachEndless(state, D1!.id);
    expect(starterChoices(state, content).map((c) => c.id)).toEqual([LIGHT, DARK]);
    state = claim(state, DARK); // the player chose dark first
    expect(state.cards.owned[DARK]).toMatchObject({ tier: 'mythic', seal: 0 });
    expect(starterUnlockDue(state, content)).toBe(false);
    reachEndless(state, D2!.id);
    expect(starterChoices(state, content).map((c) => c.id)).toEqual([LIGHT]);
    state = claim(state, LIGHT);
    expect(starterUnlocks(state, content)).toEqual({ base: 0, special: 0 });
  });

  it('gives every unlock sealed, and a save that earned several finds them all open at once', () => {
    const state = claim(createInitialState(content), FIRE);
    clearNightmare(state, D1!.id);
    clearNightmare(state, D2!.id);
    reachEndless(state, D1!.id);
    expect(starterUnlocks(state, content)).toEqual({ base: 2, special: 1 });
    const next = claim(state, EARTH);
    expect(next.cards.owned[EARTH]!.seal).toBe(0);
  });

  it('puts an unlock in the loadout only when no starter is there already', () => {
    const state = claim(createInitialState(content), FIRE);
    clearNightmare(state, D1!.id);
    const next = claim(state, EARTH);
    const slots = next.cards.loadouts.fighting.slots;
    expect(slots).toContain(FIRE);
    expect(slots).not.toContain(EARTH);
  });

  it('a save that turned the pick down is offered only what Nightmare earned', () => {
    const state = createInitialState(content);
    state.starter = { done: true, skippable: true };
    expect(starterUnlocks(state, content)).toEqual({ base: 0, special: 0 });
    clearNightmare(state, D1!.id);
    expect(starterUnlocks(state, content).base).toBe(1);
  });
});

describe('one starter a team', () => {
  const twoStarters = () => {
    let state = claim(createInitialState(content), FIRE);
    clearNightmare(state, D1!.id);
    state = claim(state, EARTH);
    return state;
  };

  it('refuses a loadout with two starters, and the slot swap with a second one', () => {
    const state = twoStarters();
    const slots = [...state.cards.loadouts.fighting.slots];
    const free = slots.indexOf(null);
    expect(free).toBeGreaterThanOrEqual(0);
    slots[free] = EARTH;
    expect(loadoutProblem(state, content, 'fighting', { slots })).toBe('too-many-starters');
    const r = setLoadoutSlot(state, content, 'fighting', free as 0 | 1 | 2 | 3, EARTH);
    expect(r).toEqual({ ok: false, reason: 'too-many-starters' });
  });

  it('lets a starter replace the starter that was in the team', () => {
    const state = twoStarters();
    const at = state.cards.loadouts.fighting.slots.indexOf(FIRE);
    const r = setLoadoutSlot(state, content, 'fighting', at as 0 | 1 | 2 | 3, EARTH);
    expect(r.ok).toBe(true);
  });
});

describe('the seals', () => {
  const picked = (id = FIRE) =>
    claim(withCores({ moss_core: 100, cinder_core: 100, frost_core: 100, storm_core: 100 }), id);

  it('has four light steps, each paid in the Cores of the first four dungeons', () => {
    const costs = content.starters.seals.map((s) => s.cost.map((c) => c.resource));
    expect(costs).toEqual([['moss_core'], ['cinder_core'], ['frost_core'], ['storm_core']]);
    expect(content.starters.seals.map((s) => s.tier)).toEqual([
      'silver',
      'gold',
      'prismatic',
      'mythic',
    ]);
    expect(content.starters.unsealedTier).toBe('heirloom');
  });

  it('fights as a Wood card while sealed', () => {
    const owned = picked().cards.owned[FIRE]!;
    const wood = newOwnedCard('wood');
    expect(strengthTier(content, owned)).toBe('wood');
    // the Wood base times the sword's factor: what a Wood sword of the same level and stars hits
    const rules = content.cardRules;
    expect(cardBaseDamage(content, FIRE, owned).toString()).toBe(
      rules.baseDamage.wood.mul(rules.weapons.sword!.damage).toString(),
    );
    expect(cardHealth(content, FIRE, owned).toString()).toBe(
      rules.health.wood.mul(rules.weapons.sword!.health).toString(),
    );
    expect(cardPower(content, owned)).toBe(cardPower(content, wood));
    expect(cardCost(content, FIRE, owned)).toBe(content.cardRules.cost.wood);
    expect(cardCost(content, FIRE)).toBe(content.cardRules.cost.mythic);
  });

  it('breaks one seal at a time, paying the Cores, and is an Heirloom strength after the last', () => {
    let state = picked();
    const tiers: string[] = [];
    let spent = new Decimal(0);
    for (let i = 0; i < content.starters.seals.length; i++) {
      const cost = nextSealCost(state, content, FIRE)!;
      expect(cost).toHaveLength(1);
      const before = state.resources[cost[0]!.resource]!;
      const r = breakSeal(state, content, FIRE);
      if (!r.ok) throw new Error(r.reason);
      expect(r.state.resources[cost[0]!.resource]!.toString()).toBe(
        before.sub(cost[0]!.amount).toString(),
      );
      spent = spent.add(cost[0]!.amount);
      state = r.state;
      tiers.push(strengthTier(content, state.cards.owned[FIRE]!));
    }
    expect(tiers).toEqual(['silver', 'gold', 'prismatic', 'heirloom']);
    const owned = state.cards.owned[FIRE]!;
    expect(owned.seal).toBe(content.starters.seals.length);
    expect(owned.tier).toBe('mythic'); // still its own T6 card
    expect(nextSealCost(state, content, FIRE)).toBeNull();
    expect(breakSeal(state, content, FIRE)).toEqual({ ok: false, reason: 'not-sealed' });
    expect(spent.lt(40)).toBe(true); // light: under 40 Cores in all
  });

  it('matches an Heirloom of the same weapon type once unsealed', () => {
    for (const [id, kind] of [
      [FIRE, 'sword'],
      [EARTH, 'hammer'],
    ] as const) {
      let state = picked(id);
      while (nextSealCost(state, content, id)) {
        const r = breakSeal(state, content, id);
        if (!r.ok) throw new Error(r.reason);
        state = r.state;
      }
      const heirloom = content.cards.find((c) => c.heirloom && c.item.kind === kind)!;
      const owned = state.cards.owned[id]!;
      const same = newOwnedCard('heirloom');
      expect(cardBaseDamage(content, id, owned).toString()).toBe(
        cardBaseDamage(content, heirloom.id, same).toString(),
      );
      expect(cardHealth(content, id, owned).toString()).toBe(
        cardHealth(content, heirloom.id, same).toString(),
      );
      expect(cardPower(content, owned)).toBe(cardPower(content, same));
    }
  });

  it('refuses a seal the Cores do not pay for, and a card that is not sealed', () => {
    const state = claim(createInitialState(content), EARTH);
    expect(breakSeal(state, content, EARTH)).toEqual({ ok: false, reason: 'unaffordable' });
    expect(breakSeal(state, content, 'ember_squire')).toEqual({ ok: false, reason: 'not-sealed' });
  });

  it('is stronger with every seal', () => {
    let state = picked(WATER);
    let last = new Decimal(0);
    for (let i = 0; i <= content.starters.seals.length; i++) {
      const dmg = cardBaseDamage(content, WATER, state.cards.owned[WATER]!);
      expect(dmg.gt(last)).toBe(true);
      last = dmg;
      const r = breakSeal(state, content, WATER);
      if (!r.ok) break;
      state = r.state;
    }
  });
});

describe('a copy of the starter', () => {
  it('is a star on the same card, and the seals stay', () => {
    const state = claim(createInitialState(content), EARTH);
    const gained = addCard(state, content, EARTH)!;
    expect(gained.gain.kind).toBe('duplicate');
    expect(gained.state.cards.owned[EARTH]).toMatchObject({ starFill: 1, seal: 0 });
  });
});

describe('the starter in a save', () => {
  it('keeps its seals, its unsealed state and the pick through a save and load', () => {
    const p = claim(withCores({ moss_core: 10 }), WATER);
    const b = breakSeal(p, content, WATER);
    if (!b.ok) throw new Error(b.reason);
    const back = readSave(createSaveText(b.state, 1_000), content).state;
    expect(back.cards.owned[WATER]!.seal).toBe(1);
    expect(back.starter.done).toBe(true);
    b.state.cards.owned[WATER]!.seal = content.starters.seals.length;
    const again = readSave(createSaveText(b.state, 1_000), content).state;
    expect(again.cards.owned[WATER]!.seal).toBe(content.starters.seals.length);
  });

  it('drops a seal on a card that is not a starter, or past the last step', () => {
    const state = createInitialState(content);
    state.cards.owned['ember_squire']!.seal = 1;
    state.cards.owned[FIRE] = { ...newOwnedCard('mythic'), seal: 9 };
    const back = readSave(createSaveText(state, 1_000), content).state;
    expect(back.cards.owned['ember_squire']!.seal).toBeUndefined();
    expect(back.cards.owned[FIRE]!.seal).toBeUndefined();
  });
});
