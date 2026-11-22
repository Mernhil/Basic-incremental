import { averageDamage, burstStats, critFactor, critStats, hitDamage } from './combat';
import type { Content } from '../data';
import { cardBaseDamage, cardEffectModifiers, cardHealth, loadoutCards } from './cards';
import { Decimal } from './num';
import { newOwnedCard, type GameState, type OwnedCard } from './state';
import { placeJob, slotWorkers } from './camp';
import { workerPower } from './workers';

/**
 * The numbers every card shows (DESIGN.md §5 Show the stats): what the card is worth on its own,
 * at its current rank, without the account's bonuses, so any two cards compare fairly.
 */
export interface CardStats {
  kind: 'fighting' | 'worker';
  /** Fighting: average damage per second (hits, signature attacks and crits at their expected
   *  value) as a team card. Worker: its power, the multiplier it gives its place. */
  output: Decimal;
  /** Fighting: the card's health in the loadout pool. Null for a worker (it takes no hits). */
  health: Decimal | null;
  /** Seconds between hits (fighting) or strikes (worker). */
  hitSeconds: number;
  critChance: number;
  critDamage: Decimal;
  /** Fighting: damage of one hit (before crits); zero for a worker. */
  hit: Decimal;
}

/** How a card's numbers sit against the card it would replace; each is a fraction (0.12 = +12%). */
export interface CardCompare {
  /** The card compared against: the weakest other card of the loadout (fighting) or the card
   *  working the place. */
  againstId: string;
  output: number;
  health: number | null;
}

/** Stats of an owned card at its rank, or of a fresh one (Wood ★1 Lv 1) when not owned. */
export function cardStats(state: GameState, content: Content, cardId: string): CardStats | null {
  return cardStatsFor(content, cardId, state.cards.owned[cardId] ?? newOwnedCard());
}

/** The same numbers for a card at any rank `owned` describes (the Weapon panel's "after" of a
 *  star or a tier-up, DESIGN.md §5 Weapon panel). */
export function cardStatsFor(content: Content, cardId: string, owned: OwnedCard): CardStats | null {
  const card = content.cardById.get(cardId);
  if (!card) return null;
  const mods = cardEffectModifiers(content, cardId, 'ability', owned);
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
      hit: hitDamage(cardBaseDamage(content, cardId, owned), burst),
    };
  }
  const burst = burstStats(content, card.job, mods);
  return {
    kind: 'worker',
    output: new Decimal(workerPower(content, cardId, owned)),
    health: null,
    hitSeconds: burst.interval,
    critChance: 0,
    critDamage: new Decimal(1),
    hit: new Decimal(0),
  };
}

/** The card a card is compared with: the weakest other card of the fighting loadout (by damage per
 *  second), or for a worker the first card of its job working a place (in place order), unless
 *  that is the card itself. */
function comparedWith(state: GameState, content: Content, cardId: string): string | null {
  const card = content.cardById.get(cardId);
  if (!card) return null;
  if (card.job === 'fighting') {
    let weakest: string | null = null;
    let least: Decimal | null = null;
    for (const id of loadoutCards(state.cards.loadouts.fighting)) {
      if (id === cardId || !state.cards.owned[id]) continue;
      const output = cardStats(state, content, id)?.output;
      if (output && (least === null || output.lt(least))) {
        weakest = id;
        least = output;
      }
    }
    return weakest;
  }
  return slotWorkers(state, content).find((w) => placeJob(w.place) === card.job)?.card ?? null;
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
