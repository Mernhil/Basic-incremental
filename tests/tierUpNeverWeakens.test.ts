import { describe, expect, it } from 'vitest';
import { RANK_TIERS, loadContent } from '../src/data';
import { cardInfo, cardStatsFor, levelCap, newOwnedCard, type OwnedCard } from '../src/game';
import { weaponView } from '../src/renderer/src/pages/weaponModel';
import { freshState } from './helpers';

const content = loadContent();

/**
 * DESIGN.md §5 Tier matters: a card never changes tier, so the tiers are compared between cards.
 * The next tier's card, fresh, is never weaker than this tier's card at ★6 and its level cap.
 */
describe('a higher tier is always worth having', () => {
  const kinds = [
    ...new Set(content.cards.filter((c) => c.job === 'fighting').map((c) => c.item.kind)),
  ];

  it('a fresh card of the next tier at the same level beats a ★6 card of the tier below', () => {
    for (const kind of kinds) {
      for (let i = 0; i < 5; i++) {
        const tier = RANK_TIERS[i]!;
        const next = RANK_TIERS[i + 1]!;
        const low = content.cards.find((c) => c.item.kind === kind && c.tier === tier)!;
        const high = content.cards.find(
          (c) => c.item.kind === kind && c.tier === next && !c.heirloomName,
        )!;
        const level = levelCap(content, { tier, stars: 6 });
        const now: OwnedCard = { ...newOwnedCard(tier), stars: 6, level };
        const after: OwnedCard = { ...newOwnedCard(next), stars: 1, level };
        const a = cardStatsFor(content, low.id, now)!;
        const b = cardStatsFor(content, high.id, after)!;
        const label = `${kind} ${tier} to ${next}`;
        expect(b.output.gte(a.output.mul(0.9999)), `${label} damage`).toBe(true);
        expect(b.health!.gte(a.health!.mul(0.9999)), `${label} health`).toBe(true);
      }
    }
  });

  it('never lists a loss for a star in the Weapon panel', () => {
    const state = freshState();
    for (const card of content.cards
      .filter((c) => c.job === 'fighting' && !c.heirloom)
      .slice(0, 60)) {
      state.cards.owned[card.id] = { ...newOwnedCard(card.tier), stars: 3, level: 20 };
      const w = weaponView(content, cardInfo(state, content, card.id)!)!;
      expect(w.starStats.length, card.id).toBeGreaterThan(0);
      for (const row of w.starStats) {
        expect(row.gain.startsWith('-'), `${card.id} ${row.label}`).toBe(false);
      }
    }
  });
});
