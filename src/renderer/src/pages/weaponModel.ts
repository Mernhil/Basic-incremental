import type { Content } from '../../../data';
import { MAX_STARS } from '../../../data';
import {
  cardStatsFor,
  itemName,
  tierLabel,
  type CardInfo,
  type CardStats,
  type OwnedCard,
} from '../../../game';
import { COPY } from '../copy';
import { fmt } from '../settings/numberFormat';
import type { StatChange, WeaponView } from './cardsModel';

/**
 * The weapon panel's view model (DESIGN.md §5, §11): turns a card's game info (level, XP, star
 * bar) into the plain data the panel draws. There is no tier-up (DESIGN.md §5 No tier-ups). No rules here: every number comes from
 * `cardInfo` and the content.
 */

/**
 * What an upgrade changes for a card, as real numbers (the same `cardStats` numbers as the Cards
 * detail's tiles, so they never disagree): damage per second and health now → after, each with its
 * gain. A worker has no health; its output stands in for the damage.
 */
function changes(now: CardStats | null, after: CardStats | null, fighting: boolean): StatChange[] {
  if (!now || !after) return [];
  const gain = (a: { toNumber(): number }, b: { toNumber(): number }): string => {
    const x = a.toNumber();
    if (!(x > 0)) return '';
    const pct = Math.round((b.toNumber() / x - 1) * 100);
    return pct > 0 ? `+${pct}%` : '';
  };
  const rows: StatChange[] = [
    {
      label: fighting ? COPY.cards.stats.damage : COPY.cards.stats.output,
      now: fmt(now.output),
      after: fmt(after.output),
      gain: gain(now.output, after.output),
    },
  ];
  if (now.health && after.health) {
    rows.push({
      label: COPY.cards.stats.health,
      now: fmt(now.health),
      after: fmt(after.health),
      gain: gain(now.health, after.health),
    });
  }
  return rows;
}

/** The weapon panel's data for an owned card; null when the card is not owned. */
export function weaponView(content: Content, info: CardInfo): WeaponView | null {
  const { owned, rank, card } = info;
  if (!owned || !rank) return null;
  const cap = info.levelCap ?? owned.level;
  const atCap = owned.level >= cap;
  const need = info.xpToNext;
  const xp =
    atCap || !need || need.lte(0) ? 1 : Math.min(1, Math.max(0, owned.xp.div(need).toNumber()));
  const multipliers = content.cardRules.power.starMultiplier;
  const multiplierAt = (stars: number): number => (stars <= 1 ? 1 : (multipliers[stars - 2] ?? 1));

  const bar = info.starBar;
  const starBar: WeaponView['starBar'] = bar
    ? {
        fill: bar.fill,
        need: bar.need,
        gauge: bar.gauge,
        ready: bar.ready,
        text: COPY.weapon.starLine(bar.fill, bar.need, owned.stars + 1),
        title: COPY.weapon.starTitle(bar.fill, bar.need, owned.stars + 1),
        impact: COPY.weapon.impact(multiplierAt(owned.stars), multiplierAt(owned.stars + 1)),
        dust:
          info.starDust && info.starDust.cost > 0 && info.starDust.have > 0
            ? {
                ...info.starDust,
                affordable: info.starDust.have >= info.starDust.cost,
                label: COPY.weapon.dustStar(
                  owned.stars + 1,
                  info.starDust.cost,
                  info.starDust.have,
                ),
              }
            : null,
      }
    : null;

  // what the next star changes (the same level and tier)
  const fighting = card.job === 'fighting';
  const starAfter: OwnedCard = { ...owned, stars: owned.stars + 1 };
  const starStats =
    owned.stars >= MAX_STARS
      ? []
      : changes(
          cardStatsFor(content, card.id, owned),
          cardStatsFor(content, card.id, starAfter),
          fighting,
        );

  // A card never changes tier (DESIGN.md §5 No tier-ups): the panel has no tier-up step, only a
  // note under the stars.
  const tierName = tierLabel(rank.tier, card.side);
  const endNote =
    rank.tier === 'heirloom'
      ? // An Heirloom card: its stars come from the gate's shards.
        rank.stars >= MAX_STARS
        ? COPY.weapon.fullyUpgraded
        : COPY.weapon.heirloomStars
      : COPY.weapon.fixedTier(tierName);

  return {
    weapon: itemName(content, card.item.kind, rank.tier, card.side, card),
    tier: rank.tier,
    tierName,
    level: owned.level,
    cap,
    atCap,
    xp,
    xpNow: atCap || !need ? '' : fmt(owned.xp.floor()),
    xpNeed: atCap || !need ? '' : fmt(need.floor()),
    stars: owned.stars,
    starStats,
    starBar: owned.stars >= MAX_STARS ? null : starBar,
    endNote,
  };
}
