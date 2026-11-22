import { describe, expect, it } from 'vitest';
import {
  Decimal,
  newOwnedCard,
  readSave,
  createSaveText,
  setDummyCard,
  setDummyDamage,
  type GameState,
} from '../src/game';
import { content, freshState } from './helpers';

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

  it('one starter weapon at most on the trial team', () => {
    const s = freshState();
    const starters = content.starters.base;
    s.cards.owned[starters[0]!] = newOwnedCard();
    s.cards.owned[starters[1]!] = newOwnedCard();
    const one = setDummyCard(s, content, 0, starters[0]!);
    if (!one.ok) throw new Error(one.reason);
    expect(setDummyCard(one.state, content, 1, starters[1]!)).toEqual({
      ok: false,
      reason: 'too-many-starters',
    });
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
