import { describe, expect, it } from 'vitest';
import {
  advance,
  copyLoadoutToDummy,
  Decimal,
  dummyReadout,
  newOwnedCard,
  readSave,
  createSaveText,
  setDummyCard,
  setDummyDamage,
  type GameState,
} from '../src/game';
import { bareState, constantRng, content, freshState } from './helpers';

/**
 * The Training ground's test dummy (DESIGN.md section 2 Test dummies): endless health, the damage
 * the player sets, a team of the player's choosing, no rewards.
 */
function two(): GameState {
  const s = freshState();
  s.cards.owned['dawnblade_regent'] = newOwnedCard();
  return s;
}

describe('test dummies', () => {
  it('starts with the default damage and nobody on trial', () => {
    const s = freshState();
    expect(s.dummy.damage.eq(content.dummy.defaultDamage)).toBe(true);
    expect(s.dummy.team).toEqual([null, null, null, null]);
  });

  it('puts fighting cards on trial, once each, and refuses the rest', () => {
    let s = two();
    const r = setDummyCard(s, content, 1, 'ember_squire');
    if (!r.ok) throw new Error(r.reason);
    s = r.state;
    const moved = setDummyCard(s, content, 3, 'ember_squire');
    if (!moved.ok) throw new Error(moved.reason);
    expect(moved.state.dummy.team).toEqual([null, null, null, 'ember_squire']);
    expect(setDummyCard(s, content, 4, 'ember_squire')).toEqual({ ok: false, reason: 'unknown' });
    expect(setDummyCard(s, content, 0, 'nope')).toEqual({ ok: false, reason: 'unknown' });
    expect(setDummyCard(s, content, 0, 'apprentice_feller')).toEqual({
      ok: false,
      reason: 'not-fighting',
    });
    expect(setDummyCard(s, content, 0, 'storm_duelist')).toEqual({
      ok: false,
      reason: 'not-owned',
    });
    const cleared = setDummyCard(s, content, 1, null);
    expect(cleared.ok && cleared.state.dummy.team).toEqual([null, null, null, null]);
  });

  it('shows the team’s damage per second and how long it stands against the damage set', () => {
    let s = two();
    s = copyLoadoutToDummy(s);
    expect(s.dummy.team).toEqual(s.cards.loadouts.fighting.slots);
    const plain = dummyReadout(s, content);
    expect(plain.cards).toBe(1);
    expect(plain.dps.gt(0)).toBe(true);
    expect(plain.health.gt(0)).toBe(true);
    const hit = setDummyDamage(s, content, plain.health.div(10));
    if (!hit.ok) throw new Error(hit.reason);
    expect(dummyReadout(hit.state, content).secondsStanding).toBeCloseTo(10);
    const none = setDummyDamage(s, content, new Decimal(0));
    expect(none.ok && dummyReadout(none.state, content).secondsStanding).toBeNull();
  });

  it('a stronger team deals more', () => {
    let s = two();
    s = ((): GameState => {
      const r = setDummyCard(s, content, 0, 'ember_squire');
      return r.ok ? r.state : s;
    })();
    const one = dummyReadout(s, content).dps;
    const r = setDummyCard(s, content, 1, 'dawnblade_regent');
    if (!r.ok) throw new Error(r.reason);
    expect(dummyReadout(r.state, content).dps.gt(one)).toBe(true);
  });

  it('an empty trial team is bare hands, and the real loadout is never touched', () => {
    const s = freshState();
    const before = [...s.cards.loadouts.fighting.slots];
    const readout = dummyReadout(s, content);
    expect(readout.cards).toBe(0);
    expect(readout.dps.gt(0)).toBe(true);
    expect(s.cards.loadouts.fighting.slots).toEqual(before);
  });

  it('clamps the damage set to 0 and the most the data allows', () => {
    const s = freshState();
    const low = setDummyDamage(s, content, new Decimal(-5));
    expect(low.ok && low.state.dummy.damage.eq(0)).toBe(true);
    const high = setDummyDamage(s, content, new Decimal('1e300'));
    expect(high.ok && high.state.dummy.damage.eq(content.dummy.maxDamage)).toBe(true);
    expect(setDummyDamage(s, content, new Decimal(NaN))).toEqual({
      ok: false,
      reason: 'invalid-damage',
    });
  });

  it('gives no rewards: a trial changes nothing in the game while time passes', () => {
    const s = bareState();
    const r = setDummyDamage(s, content, new Decimal(1e9));
    if (!r.ok) throw new Error(r.reason);
    const after = advance(r.state, content, 5000, constantRng(0.5)).state;
    const control = advance(s, content, 5000, constantRng(0.5)).state;
    expect(after.resources).toEqual(control.resources);
    expect(after.cards.owned).toEqual(control.cards.owned);
  });

  it('is saved and read back, dropping a card that is not owned or not a fighter', () => {
    let s = two();
    const set = setDummyCard(s, content, 2, 'dawnblade_regent');
    if (!set.ok) throw new Error(set.reason);
    const dmg = setDummyDamage(set.state, content, new Decimal(250));
    if (!dmg.ok) throw new Error(dmg.reason);
    s = dmg.state;
    const loaded = readSave(createSaveText(s, 1), content).state;
    expect(loaded.dummy.damage.toNumber()).toBe(250);
    expect(loaded.dummy.team).toEqual([null, null, 'dawnblade_regent', null]);
    const json = JSON.parse(createSaveText(s, 1));
    json.state.dummy.team = ['apprentice_feller', 'gone', 'dawnblade_regent', 'dawnblade_regent'];
    const back = readSave(JSON.stringify(json), content).state;
    expect(back.dummy.team).toEqual([null, null, 'dawnblade_regent', null]);
  });
});
