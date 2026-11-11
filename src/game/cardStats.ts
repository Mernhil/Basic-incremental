import { burstStats, averageDamage, critFactor, critStats } from './combat';
import type { Content } from '../data';
import { cardBaseDamage, cardEffectModifiers, cardHealth } from './cards';
import { Decimal } from './num';
import { harvestCrit } from './production';
import { newOwnedCard, type GameState } from './state';
import { activeWorkers, producerJob, workerPower } from './workers';

/**
 * The numbers every card shows (DESIGN.md §5 Show the stats): what the card is worth on its own,
 * at its current rank, without the account's bonuses, so any two cards compare fairly.
 */
export interface CardStats {
  kind: 'fighting' | 'worker';
  /** Fighting: average damage per second (hits, signature attacks and crits at their expected
   *  value) as the main card. Worker: its power, the multiplier it gives its place. */
  output: Decimal;
  /** Fighting: the card's health in the loadout pool. Null for a worker (it takes no hits). */
  health: Decimal | null;
  /** Seconds between hits (fighting) or strikes (worker). */
  hitSeconds: number;
  critChance: number;
  critDamage: Decimal;
}

/** How a card's numbers sit against the card it would replace; each is a fraction (0.12 = +12%). */
export interface CardCompare {
  /** The card compared against: the equipped main (fighting) or the card working the place. */
  againstId: string;
  output: number;
  health: number | null;
}

/** Stats of an owned card at its rank, or of a fresh one (Wood ★1 Lv 1) when not owned. */
export function cardStats(state: GameState, content: Content, cardId: string): CardStats | null {
  const card = content.cardById.get(cardId);
  if (!card) return null;
  const owned = state.cards.owned[cardId] ?? newOwnedCard();
  const mods = cardEffectModifiers(content, cardId, 'main', owned);
  if (card.job === 'fighting') {
    const burst = burstStats(content, 'fighting', mods);
    const crit = critStats(content, mods);
    const dps = averageDamage(cardBaseDamage(content, cardId, owned), burst).mul(critFactor(crit));
    return {
      kind: 'fighting',
      output: dps,
      health: cardHealth(content, cardId, owned),
      hitSeconds: burst.interval,
      critChance: crit.chance,
      critDamage: crit.damage,
    };
  }
  const burst = burstStats(content, card.job, mods);
  const crit = harvestCrit(content, card.job, mods);
  return {
    kind: 'worker',
    output: new Decimal(workerPower(content, cardId, owned)),
    health: null,
    hitSeconds: burst.interval,
    critChance: crit.chance,
    critDamage: crit.damage,
  };
}

/** The card a card is compared with: the main fighting card, or for a worker the first card of its
 *  job working a place (in place order), unless that is the card itself. */
function comparedWith(state: GameState, content: Content, cardId: string): string | null {
  const card = content.cardById.get(cardId);
  if (!card) return null;
  if (card.job === 'fighting') return state.cards.loadouts.fighting.main;
  for (const [place, ids] of Object.entries(activeWorkers(state, content))) {
    if (producerJob(content, place) === card.job && ids[0]) return ids[0];
  }
  return null;
}

/** The compare line's numbers; null when there is nothing to compare with or the card is that card. */
export function compareStats(
  state: GameState,
  content: Content,
  cardId: string,
): CardCompare | null {
  const against = comparedWith(state, content, cardId);
  if (!against || against === cardId || !state.cards.owned[against]) return null;
  const mine = cardStats(state, content, cardId);
  const theirs = cardStats(state, content, against);
  if (!mine || !theirs) return null;
  const ratio = (a: Decimal, b: Decimal): number => (b.lte(0) ? 0 : a.div(b).sub(1).toNumber());
  return {
    againstId: against,
    output: ratio(mine.output, theirs.output),
    health: mine.health && theirs.health ? ratio(mine.health, theirs.health) : null,
  };
}
