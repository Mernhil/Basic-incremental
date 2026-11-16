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

  it('the next tier beats the tier below, both fresh and both at ★6 and their level cap', () => {
    for (const kind of kinds) {
      for (let i = 0; i < 5; i++) {
        const tier = RANK_TIERS[i]!;
        const next = RANK_TIERS[i + 1]!;
        const low = content.cards.find((c) => c.item.kind === kind && c.tier === tier)!;
        const high = content.cards.find(
          (c) => c.item.kind === kind && c.tier === next && !c.heirloomName,
        )!;
        const pairs: [OwnedCard, OwnedCard, string][] = [
          [newOwnedCard(tier), newOwnedCard(next), 'fresh'],
          [
            { ...newOwnedCard(tier), stars: 6, level: levelCap(content, { tier, stars: 6 }) },
            { ...newOwnedCard(next), stars: 6, level: levelCap(content, { tier: next, stars: 6 }) },
            'maxed',
          ],
        ];
        for (const [a0, b0, what] of pairs) {
          const a = cardStatsFor(content, low.id, a0)!;
          const b = cardStatsFor(content, high.id, b0)!;
          const label = `${kind} ${tier} to ${next} ${what}`;
          expect(b.output.gt(a.output), `${label} damage`).toBe(true);
          expect(b.health!.gt(a.health!), `${label} health`).toBe(true);
        }
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
