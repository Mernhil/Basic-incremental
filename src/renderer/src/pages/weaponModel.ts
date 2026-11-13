import type { Content } from '../../../data';
import { MAX_STARS } from '../../../data';
import { itemName, lookTier, tierLabel, type CardInfo } from '../../../game';
import { COPY } from '../copy';
import { fmt } from '../settings/numberFormat';
import type { CostChip, WeaponView } from './cardsModel';

/**
 * The weapon panel's view model (DESIGN.md §5, §11): turns a card's game info (level, XP, star
 * bar, tier-up check) into the plain data the panel draws. No rules here: every number comes from
 * `cardInfo` and the content, and the order of the prices is the order of `cardRules.tierUp`.
 */

/** The weapon panel's data for an owned card; null when the card is not owned. */
export function weaponView(content: Content, info: CardInfo): WeaponView | null {
  const { owned, rank, card } = info;
  if (!owned || !rank) return null;
  const cap = info.levelCap ?? owned.level;
  const atCap = owned.level >= cap;
  const need = info.xpToNext;
  const xp =
    atCap || !need || need.lte(0) ? 1 : Math.min(1, Math.max(0, owned.xp.div(need).toNumber()));
  const resName = (id: string): string => content.resourceById.get(id)?.name ?? id;
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

  const check = info.tierUp;
  let tierUp: WeaponView['tierUp'] = null;
  let endNote: string | null = null;
  if (check?.available && check.to) {
    const toName = tierLabel(check.to.tier, card.rarity);
    const heirloom = check.to.tier === 'heirloom';
    const costs: CostChip[] = check.requirements
      .filter((r) => r.kind === 'resource')
      .map((r) => ({
        id: r.resource ?? '',
        name: resName(r.resource ?? ''),
        have: fmt(r.have),
        need: fmt(r.need),
        met: r.met,
      }));
    const levelMet = check.requirements.every((r) => r.kind !== 'level' || r.met);
    const starsMet = check.requirements.every((r) => r.kind !== 'stars' || r.met);
    const phase = !levelMet ? 'leveling' : check.met ? 'ready' : 'short';
    const missing = costs.filter((c) => !c.met).map((c) => c.name);
    tierUp = {
      toTier: check.to.tier,
      toName,
      heirloom,
      phase,
      lead: atCap ? COPY.weapon.costs : COPY.weapon.reach(cap),
      costs,
      action: heirloom
        ? COPY.weapon.reveal(itemName(content, card.item.kind, 'heirloom', card.rarity, card))
        : COPY.weapon.tierUpTo(toName),
      ready: check.met,
      missing: phase === 'short' ? COPY.weapon.missing(missing.join(', ')) : '',
      levelMet,
      starsMet,
      blocker: check.met
        ? ''
        : !starsMet
          ? COPY.weapon.needsStars(MAX_STARS)
          : !levelMet
            ? COPY.weapon.needsLevel(cap)
            : missing.length === 1
              ? COPY.weapon.needsCosts(missing[0] ?? '')
              : COPY.weapon.needsMany(missing.length),
    };
  } else if (rank.tier === 'heirloom') {
    // An Heirloom card (DESIGN.md §5): no tier-up; its stars come from the gate's shards.
    endNote = rank.stars >= MAX_STARS ? COPY.weapon.fullyUpgraded : COPY.weapon.heirloomStars;
  } else if (rank.tier === 'mythic') {
    endNote = COPY.weapon.topLadder(tierLabel(rank.tier, card.rarity));
  } else {
    endNote = COPY.weapon.topEnd(tierLabel(rank.tier, card.rarity));
  }

  return {
    weapon: itemName(content, card.item.kind, lookTier(card.rarity, rank.tier), card.rarity, card),
    tier: rank.tier,
    tierName: tierLabel(rank.tier, card.rarity),
    level: owned.level,
    cap,
    atCap,
    xp,
    xpNow: atCap || !need ? '' : fmt(owned.xp.floor()),
    xpNeed: atCap || !need ? '' : fmt(need.floor()),
    stars: owned.stars,
    starBar: owned.stars >= MAX_STARS ? null : starBar,
    tierUp,
    endNote,
  };
}
