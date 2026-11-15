import { describe, expect, it } from 'vitest';
import { cardInfo, cardStats, levelCap, newOwnedCard } from '../src/game';
import { weaponView } from '../src/renderer/src/pages/weaponModel';
import { fmt } from '../src/renderer/src/settings/numberFormat';
import { content, freshState } from './helpers';

/** DESIGN.md §5 Weapon panel: each upgrade lists what it changes, with the Cards detail's numbers. */
describe('what the weapon panel upgrades change', () => {
  const view = () => {
    const state = freshState();
    state.cards.owned['ember_squire']!.level = 20; // at its level cap
    const info = cardInfo(state, content, 'ember_squire')!;
    return { state, w: weaponView(content, info)! };
  };

  it('lists damage and health now → after for the next star, with the gain', () => {
    const { state, w } = view();
    const now = cardStats(state, content, 'ember_squire')!;
    expect(w.starStats.map((r) => r.label)).toEqual(['Damage / s', 'Health']);
    expect(w.starStats[0]!.now).toBe(fmt(now.output));
    expect(w.starStats[1]!.now).toBe(fmt(now.health!));
    expect(w.starStats[0]!.gain).toMatch(/^\+\d+%$/);
    expect(w.starStats[0]!.after).not.toBe(w.starStats[0]!.now);
  });

  it('lists damage, health, level cap and look for the tier-up', () => {
    const state = freshState();
    state.cards.owned['storm_duelist'] = { ...newOwnedCard(), stars: 6, level: 20 };
    const info = cardInfo(state, content, 'storm_duelist')!;
    const w = weaponView(content, info)!;
    expect(w.tierUp).not.toBeNull();
    const rows = w.tierUp!.stats;
    expect(rows.map((r) => r.label)).toEqual(['Damage / s', 'Health', 'Level cap', 'Look']);
    const cap = rows.find((r) => r.label === 'Level cap')!;
    expect(cap.now).toBe(String(info.levelCap));
    expect(cap.after).toBe(String(levelCap(content, info.tierUp!.to!)));
  });

  it('lists no star change at ★6', () => {
    const state = freshState();
    state.cards.owned['ember_squire']!.stars = 6;
    expect(weaponView(content, cardInfo(state, content, 'ember_squire')!)!.starStats).toEqual([]);
  });
});
