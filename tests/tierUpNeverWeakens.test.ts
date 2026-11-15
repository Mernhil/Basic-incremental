import { describe, expect, it } from 'vitest';
import { RANK_TIERS } from '../src/data';
import {
  cardPower,
  cardStatsFor,
  cardTopTier,
  levelCap,
  newOwnedCard,
  type OwnedCard,
} from '../src/game';
import { cardInfo } from '../src/game';
import { weaponView } from '../src/renderer/src/pages/weaponModel';
import { loadContent } from '../src/data';
import { freshState } from './helpers';

const content = loadContent();

/** DESIGN.md §5: a tier-up that restarts a ★6 card at ★1 never makes it weaker. */
describe('a tier-up never lowers a card', () => {
  const fighting = content.cards.filter((c) => c.job === 'fighting' && !c.heirloom);

  it('keeps damage, health and card power at every tier step of every fighting card', () => {
    for (const card of fighting) {
      const top = cardTopTier(content, card.id);
      const from = RANK_TIERS.indexOf('wood');
      const to = RANK_TIERS.indexOf(top);
      for (let i = from; i < to; i++) {
        const tier = RANK_TIERS[i]!;
        const next = RANK_TIERS[i + 1]!;
        const level = levelCap(content, { tier, stars: 6 });
        const now: OwnedCard = { ...newOwnedCard(), tier, stars: 6, level };
        const after: OwnedCard = { ...newOwnedCard(), tier: next, stars: 1, level };
        const a = cardStatsFor(content, card.id, now)!;
        const b = cardStatsFor(content, card.id, after)!;
        const label = `${card.id} ${tier} to ${next}`;
        expect(b.output.gte(a.output.mul(0.9999)), `${label} damage`).toBe(true);
        expect(b.health!.gte(a.health!.mul(0.9999)), `${label} health`).toBe(true);
        expect(cardPower(content, after), `${label} power`).toBeGreaterThanOrEqual(
          cardPower(content, now) - 1e-9,
        );
      }
    }
  });

  it('never lists a loss for an upgrade in the Weapon panel', () => {
    const state = freshState();
    for (const card of fighting.slice(0, 60)) {
      const tier = card.rarity === 'common' ? 'wood' : 'wood';
      state.cards.owned[card.id] = { ...newOwnedCard(), tier, stars: 6, level: 20 };
      const w = weaponView(content, cardInfo(state, content, card.id)!)!;
      for (const row of [...w.starStats, ...(w.tierUp?.stats ?? [])]) {
        if (!row.gain && /^\d/.test(row.now) && row.label !== 'Level cap') {
          expect(
            Number(row.after.replace(/[^\d.]/g, '')),
            `${card.id} ${row.label}`,
          ).toBeGreaterThanOrEqual(0);
        }
        expect(row.gain.startsWith('-'), `${card.id} ${row.label}`).toBe(false);
      }
    }
  });
});
