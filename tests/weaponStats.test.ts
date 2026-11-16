import { describe, expect, it } from 'vitest';
import { cardInfo, cardStats, newOwnedCard } from '../src/game';
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

  it('lists no tier-up: the panel has only the note that the tier is for good', () => {
    const state = freshState();
    state.cards.owned['storm_duelist'] = { ...newOwnedCard('gold'), stars: 6, level: 80 };
    const info = cardInfo(state, content, 'storm_duelist')!;
    const w = weaponView(content, info)!;
    expect('tierUp' in w).toBe(false);
    expect(w.tierName).toBe('Gold');
    expect(w.endNote).toBe('A Gold weapon, for good. Weapons of other tiers come from Summon.');
  });

  it('lists no star change at ★6', () => {
    const state = freshState();
    state.cards.owned['ember_squire']!.stars = 6;
    expect(weaponView(content, cardInfo(state, content, 'ember_squire')!)!.starStats).toEqual([]);
  });
});
