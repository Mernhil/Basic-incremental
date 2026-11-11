import { describe, expect, it } from 'vitest';
import {
  activeBonds,
  advance,
  advanceChunked,
  applyProductionPreset,
  assignWorker,
  bondCodex,
  checkBonds,
  collectModifiers,
  collectTrip,
  computeStat,
  expeditionSlots,
  newOwnedCard,
  pickDungeon,
  recallTrip,
  saveProductionPreset,
  setLoadoutSlot,
  settleBonds,
  simulateOffline,
  startTrip,
  tripRewards,
  type GameState,
} from '../src/game';
import { bareState, constantRng, content } from './helpers';

const rng = constantRng(0.5);

function own(state: GameState, ...ids: string[]): GameState {
  for (const id of ids) state.cards.owned[id] = newOwnedCard();
  // a high account level, so the loadout cost cap fits any card
  state.account.level = 40;
  return state;
}

function equip(state: GameState, ...ids: string[]): GameState {
  let s = state;
  ids.forEach((id, i) => {
    const r = setLoadoutSlot(s, content, 'fighting', i === 0 ? 'main' : i - 1, id);
    if (!r.ok) throw new Error(`equip ${id}: ${r.reason}`);
    s = r.state;
  });
  return s;
}

describe('bonds', () => {
  const pair = ['ember_squire', 'dawnblade_regent'];

  it('is active only while both cards are in the fighting loadout, through modifiers', () => {
    let s = own(bareState(), ...pair);
    s = equip(s, pair[0]!);
    expect(activeBonds(s, content)).toEqual([]);
    s = equip(s, ...pair);
    expect(activeBonds(s, content).map((b) => b.id)).toEqual(['oath_of_dawn']);
    const fill = computeStat('burst.fill', 1, collectModifiers(s, content), { job: 'fighting' });
    expect(fill.applied.some((m) => m.source.kind === 'bond')).toBe(true);
  });

  it('is discovered once, shown as a silhouette until then', () => {
    let s = equip(own(bareState(), ...pair), ...pair);
    expect(bondCodex(s, content).every((e) => !e.discovered && e.name === null)).toBe(true);
    expect(bondCodex(s, content)[0]!.cards).toBeNull();
    s = checkBonds(s, content);
    expect(s.discoveredBonds).toEqual(['oath_of_dawn']);
    const codex = bondCodex(s, content);
    expect(codex[0]).toMatchObject({ discovered: true, active: true, name: 'Oath of Dawn' });
    expect(codex[1]!.cards).toBeNull();
    expect(settleBonds(s, content)).toEqual([]);
  });

  it('is found by the tick however time is split', () => {
    const s = equip(own(bareState(), ...pair), ...pair);
    const one = advance(s, content, 5000, rng).state;
    const many = advanceChunked(s, content, 5000, rng, 16).state;
    expect(one.discoveredBonds).toEqual(['oath_of_dawn']);
    expect(many.discoveredBonds).toEqual(one.discoveredBonds);
  });

  it('pairs workers of one job at any of their places', () => {
    let s = own(bareState(), 'apprentice_feller', 'elder_treant');
    s.production.unlockedTrees = ['ironbark', 'moonwillow'];
    for (const [place, card] of [
      ['ironbark', 'apprentice_feller'],
      ['moonwillow', 'elder_treant'],
    ] as const) {
      const r = assignWorker(s, content, place, card);
      expect(r.ok).toBe(true);
      if (r.ok) s = r.state;
    }
    expect(activeBonds(s, content).map((b) => b.id)).toEqual(['old_growth']);
  });
});

describe('dungeon presets', () => {
  function ready(): GameState {
    const s = own(bareState(), 'ember_squire', 'dawnblade_regent');
    s.clearedDungeons = ['mossy_cellar'];
    return s;
  }

  it('remembers the loadout of the dungeon being left and puts it back', () => {
    let s = ready();
    const a = pickDungeon(s, content, 'mossy_cellar');
    expect(a.ok && a.preset).toBe('none');
    s = equip((a as { state: GameState }).state, 'ember_squire');
    const b = pickDungeon(s, content, 'ember_crypt');
    expect(b.ok && b.preset).toBe('none');
    s = equip((b as { state: GameState }).state, 'dawnblade_regent');
    expect(s.cards.loadouts.fighting.main).toBe('dawnblade_regent');
    const back = pickDungeon(s, content, 'mossy_cellar');
    expect(back.ok && back.preset).toBe('applied');
    expect((back as { state: GameState }).state.cards.loadouts.fighting.main).toBe('ember_squire');
    expect((back as { state: GameState }).state.presets.dungeons['ember_crypt']!.main).toBe(
      'dawnblade_regent',
    );
  });

  it('empties the slot of a remembered card that is away', () => {
    let s = ready();
    s.presets.dungeons['mossy_cellar'] = {
      main: 'ember_squire',
      supports: ['dawnblade_regent', null, null],
    };
    s.clearedDungeons = ['mossy_cellar', 'ember_crypt'];
    s.activeDungeonId = null;
    s = (pickDungeon(s, content, 'ember_crypt') as { state: GameState }).state;
    s.expeditions.trips.push({
      cardId: 'dawnblade_regent',
      placeId: 'mossy_outskirts',
      hours: 1,
      elapsedSeconds: 0,
    });
    const r = pickDungeon(s, content, 'mossy_cellar');
    expect(r.ok && r.preset).toBe('applied');
    const loadout = (r as { state: GameState }).state.cards.loadouts.fighting;
    expect(loadout.main).toBe('ember_squire');
    expect(loadout.supports).toEqual([null, null, null]);
  });

  it('refuses a locked dungeon', () => {
    expect(pickDungeon(ready(), content, 'frostspire_vault')).toEqual({
      ok: false,
      reason: 'locked',
    });
  });
});

describe('production presets', () => {
  function working(): GameState {
    let s = own(bareState(), 'apprentice_feller', 'elder_treant');
    s.production.unlockedTrees = ['ironbark', 'moonwillow'];
    for (const [place, card] of [
      ['ironbark', 'apprentice_feller'],
      ['moonwillow', 'elder_treant'],
    ] as const) {
      const r = assignWorker(s, content, place, card);
      if (r.ok) s = r.state;
    }
    return s;
  }

  it('saves the job’s workers and puts them back', () => {
    let s = working();
    const saved = saveProductionPreset(s, content, 'logging', 1, 'Fast');
    expect(saved.ok).toBe(true);
    s = (saved as { state: GameState }).state;
    expect(s.presets.production.logging[1]).toMatchObject({ name: 'Fast' });
    s.production.workers = {};
    const applied = applyProductionPreset(s, content, 'logging', 1);
    expect(applied.ok && applied.missing).toBe(0);
    expect((applied as { state: GameState }).state.production.workers).toEqual({
      ironbark: ['apprentice_feller'],
      moonwillow: ['elder_treant'],
    });
  });

  it('flags what does not fit and leaves the other job alone', () => {
    let s = working();
    s = (saveProductionPreset(s, content, 'logging', 0) as { state: GameState }).state;
    s.production.unlockedTrees = ['ironbark'];
    s.production.workers['copper_quarry'] = ['cave_digger'];
    const applied = applyProductionPreset(s, content, 'logging', 0);
    expect(applied.ok && applied.missing).toBe(1);
    expect((applied as { state: GameState }).state.production.workers['copper_quarry']).toEqual([
      'cave_digger',
    ]);
    expect(applyProductionPreset(s, content, 'mining', 2)).toEqual({ ok: false, reason: 'empty' });
    expect(saveProductionPreset(bareState(), content, 'mining', 0)).toEqual({
      ok: false,
      reason: 'empty',
    });
  });
});

describe('expeditions', () => {
  function ready(): GameState {
    const s = own(bareState(), 'ember_squire', 'dawnblade_regent', 'apprentice_feller');
    s.clearedDungeons = ['mossy_cellar'];
    return s;
  }
  const trip = (s: GameState, card: string, hours = 1): GameState => {
    const r = startTrip(s, content, card, 'mossy_outskirts', hours);
    if (!r.ok) throw new Error(r.reason);
    return r.state;
  };

  it('has one slot and starts with the rules of DESIGN', () => {
    const s = ready();
    expect(expeditionSlots(s, content)).toBe(1);
    expect(startTrip(s, content, 'ember_squire', 'ember_catacombs', 1)).toEqual({
      ok: false,
      reason: 'locked',
    });
    expect(startTrip(s, content, 'ember_squire', 'mossy_outskirts', 2)).toEqual({
      ok: false,
      reason: 'bad-length',
    });
    expect(startTrip(s, content, 'dawnblade_regent', 'mossy_outskirts', 99)).toEqual({
      ok: false,
      reason: 'bad-length',
    });
    const away = trip(s, 'ember_squire');
    expect(startTrip(away, content, 'dawnblade_regent', 'mossy_outskirts', 1)).toEqual({
      ok: false,
      reason: 'no-slot',
    });
    expect(startTrip(away, content, 'ember_squire', 'mossy_outskirts', 1)).toEqual({
      ok: false,
      reason: 'on-trip',
    });
  });

  it('keeps cards in a loadout or at work at home, and cards away out of both', () => {
    const s = ready();
    const equipped = equip(s, 'ember_squire');
    expect(startTrip(equipped, content, 'ember_squire', 'mossy_outskirts', 1)).toEqual({
      ok: false,
      reason: 'in-loadout',
    });
    const worker = assignWorker(
      Object.assign(s, { production: { ...s.production, unlockedTrees: ['oak'] } }),
      content,
      'oak',
      'apprentice_feller',
    );
    expect(worker.ok).toBe(true);
    expect(
      startTrip(
        (worker as { state: GameState }).state,
        content,
        'apprentice_feller',
        'mossy_outskirts',
        1,
      ),
    ).toEqual({ ok: false, reason: 'at-work' });

    const away = trip(s, 'ember_squire');
    const r = setLoadoutSlot(away, content, 'fighting', 'main', 'ember_squire');
    expect(r).toEqual({ ok: false, reason: 'on-expedition' });
    const w = assignWorker(trip(s, 'apprentice_feller'), content, 'oak', 'apprentice_feller');
    expect(w).toEqual({ ok: false, reason: 'on-expedition' });
  });

  it('runs as a timer, split-independent, and pays on collect; recall pays nothing', () => {
    const s = trip(ready(), 'ember_squire');
    expect(collectTrip(s, content, 'ember_squire')).toEqual({ ok: false, reason: 'not-done' });
    const half = advance(s, content, 1_800_000, rng).state;
    expect(half.expeditions.trips[0]!.elapsedSeconds).toBeCloseTo(1800);
    const chunked = advanceChunked(s, content, 3_600_000, rng, 997).state;
    const whole = advance(s, content, 3_600_000, rng).state;
    expect(chunked.expeditions.trips[0]!.elapsedSeconds).toBeCloseTo(3600);
    const done = collectTrip(whole, content, 'ember_squire');
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.state.expeditions).toMatchObject({ trips: [], completed: 1 });
    expect(done.state.resources['moss_core']!.toNumber()).toBe(
      (s.resources['moss_core']?.toNumber() ?? 0) + (done.rewards.doubled ? 2 : 1),
    );
    expect(collectTrip(chunked, content, 'ember_squire').ok).toBe(true);

    const recalled = recallTrip(s, 'ember_squire');
    expect(recalled.ok && recalled.state.expeditions.trips).toEqual([]);
    expect(recalled.ok && recalled.state.expeditions.completed).toBe(0);
  });

  it('doubles everything for a matching element', () => {
    const s = ready();
    const nature = (id: string): number => (content.cardById.get(id)!.element === 'nature' ? 1 : 0);
    const matching = nature('apprentice_feller') ? 'apprentice_feller' : 'ember_squire';
    const other = matching === 'apprentice_feller' ? 'ember_squire' : 'apprentice_feller';
    const place = content.expeditions.places.find((p) => p.id === 'mossy_outskirts')!;
    expect(place.element).toBe('nature');
    const t = (card: string) => ({ cardId: card, placeId: place.id, hours: 4, elapsedSeconds: 0 });
    const a = tripRewards(s, content, t(matching));
    const b = tripRewards(s, content, t(other));
    expect(a.doubled).toBe(true);
    expect(b.doubled).toBe(false);
    expect(a.materials['moss_core']).toBe(2 * b.materials['moss_core']!);
    expect(a.cardXp.div(b.cardXp).toNumber()).toBeCloseTo(2);
  });

  it('runs through the whole time away, outside the offline cap', () => {
    const s = trip(ready(), 'ember_squire', 8);
    const hours = 20;
    const { state } = simulateOffline(s, content, 0, hours * 3_600_000, rng);
    expect(state.expeditions.trips[0]!.elapsedSeconds).toBeCloseTo(8 * 3600);
    const shorter = trip(ready(), 'ember_squire', 8);
    const part = simulateOffline(shorter, content, 0, 10 * 3_600_000, rng).state;
    expect(part.expeditions.trips[0]!.elapsedSeconds).toBeCloseTo(8 * 3600);
  });

  it('gets a slot from the account tree keystone and the Starlight shop', () => {
    const s = ready();
    s.prestige.shop['travel_pack'] = 1;
    expect(expeditionSlots(s, content)).toBe(2);
  });
});
