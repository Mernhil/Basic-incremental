import type { Content, Rank } from '../../../data';
import {
  SUPPORT_SLOTS,
  cardCollection,
  cardEnhancements,
  cardInfo,
  chooseEnhancement,
  resetEnhancements,
  collectModifiers,
  levelCap,
  loadoutInfo,
  weaponLookRarity,
  setLoadoutSlot,
  starUp,
  tierUp,
  type CardFailure,
  type CardInfo,
  type GameState,
  type OwnedCard,
  type TierUp,
  type Requirement as GameRequirement,
  type UpgradeCheck,
} from '../../../game';
import { fmt } from '../settings/numberFormat';
import { COPY } from '../copy';
import { itemArt } from '../art/items';
import { cardFaceOf } from './cardFaceModel';
import { starChartView } from './skillsModel';
import { weaponView } from './weaponModel';
import type {
  CardEntry,
  CardsModel,
  Job,
  ModelResult,
  Requirement,
  UpgradeStep,
} from './cardsModel';

/** Maps the card logic (src/game/cards.ts) onto the Cards page's view model. */

const TIER_NAMES: Record<Rank['tier'], string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  prismatic: 'Prismatic',
  unique: 'Unique',
};
const BASE_RANK: Rank = { tier: 'bronze', stars: 1 };
/** Placeholder emblems until the graphics overhaul brings per-card art (see ui/card.ts). */
const JOB_EMBLEM: Record<Job, string> = { fighting: 'blade', logging: 'axe', mining: 'pick' };

/**
 * `art` draws a card's item (the renderer passes one that shows unique ★6 evolutions); without
 * it the plain item is drawn.
 */
export function createCardsModel(
  content: Content,
  art?: (cardId: string, owned: OwnedCard | null) => string,
): CardsModel {
  const resName = (id: string): string => content.resourceById.get(id)?.name ?? id;

  const reason = (r: CardFailure | string): string =>
    (COPY.cards.reasons as Record<string, string>)[r] ?? COPY.cards.reasons.unknown;
  const wrap = (
    result: { ok: true; state: GameState; tierUps?: TierUp[] } | { ok: false; reason: CardFailure },
  ): ModelResult => (result.ok ? result : { ok: false, reason: reason(result.reason) });

  function requirement(r: GameRequirement): Requirement {
    const have = fmt(r.have);
    const need = fmt(r.need);
    if (r.kind === 'level')
      return {
        label: COPY.cards.req.level,
        met: r.met,
        value: COPY.cards.req.levelValue(have, need),
      };
    if (r.kind === 'starFill')
      return { label: COPY.cards.req.starBar, met: r.met, value: COPY.cards.req.of(have, need) };
    return { label: resName(r.resource ?? ''), met: r.met, value: COPY.cards.req.of(have, need) };
  }

  function priceText(check: UpgradeCheck): string {
    return check.requirements
      .filter((r) => r.kind !== 'level')
      .map((r) =>
        r.kind === 'starFill'
          ? COPY.cards.req.copies(r.need.toNumber())
          : `${fmt(r.need)} ${resName(r.resource ?? '')}`,
      )
      .join(', ');
  }

  /** The star-up (fill only) or tier-up (level cap, Money, materials) of a card, if it has one. */
  function step(kind: 'star' | 'tier', check: UpgradeCheck | null): UpgradeStep | null {
    if (!check?.available || !check.to) return null;
    const tierName = TIER_NAMES[check.to.tier];
    const multiplier = content.cardRules.power.starMultiplier[check.to.stars - 2] ?? 1;
    return {
      kind,
      title:
        kind === 'star'
          ? COPY.cards.nextStar(check.to.stars, tierName)
          : COPY.cards.nextTier(tierName, check.to.stars),
      note:
        kind === 'star'
          ? COPY.cards.starNote(multiplier)
          : COPY.cards.tierNote(tierName, levelCap(content, check.to)),
      requirements: check.requirements.map(requirement),
      action: (kind === 'star' ? COPY.cards.addStar : COPY.cards.tierUp)(priceText(check)),
      ready: check.met,
    };
  }

  function entry(info: CardInfo): CardEntry {
    const { card, owned } = info;
    const rank = info.rank ?? BASE_RANK;
    const cap = info.levelCap ?? levelCap(content, rank);
    const level = owned?.level ?? 1;
    const xp =
      owned && info.xpToNext && info.xpToNext.gt(0)
        ? Math.min(1, Math.max(0, owned.xp.div(info.xpToNext).toNumber()))
        : owned
          ? 1
          : 0;
    return {
      id: card.id,
      name: card.name,
      job: card.job,
      rarity: card.rarity,
      emblem: JOB_EMBLEM[card.job],
      item:
        art?.(card.id, owned) ?? itemArt(card.item.kind, weaponLookRarity(card.rarity, rank.tier)),
      element: card.element,
      owned: owned !== null,
      rank,
      level,
      cap,
      xp,
      duplicates: owned?.starFill ?? 0,
      cost: info.cost,
      mainAbility: card.main.description,
      supportEffect: card.support.description,
      face: cardFaceOf(content, info),
      role: info.slot
        ? { job: info.slot.job, slot: info.slot.slot === 'main' ? 'main' : 'support' }
        : null,
      next: owned ? step('star', info.starUp) : null,
      tier: owned ? step('tier', info.tierUp) : null,
      weapon: weaponView(content, info),
    };
  }

  const all = (state: GameState): CardInfo[] =>
    cardCollection(state, content, undefined, collectModifiers(state, content));

  return {
    entries: (state) => all(state).map(entry),
    entry(state, id) {
      const info = cardInfo(state, content, id);
      return info ? entry(info) : null;
    },
    loadout(state, job) {
      const lo = loadoutInfo(state, content, job);
      return { job, slots: [lo.main, ...lo.supports], cost: lo.cost, cap: lo.cap };
    },
    shards: (state) => String(state.cards.shards),
    signature(state) {
      return JSON.stringify([
        Object.entries(state.cards.owned).map(([id, o]) => [
          id,
          o.tier,
          o.stars,
          o.level,
          o.starFill,
          o.enhancements,
        ]),
        state.cards.loadouts,
        state.cards.shards,
        // readiness changes with resources; it moves badges and the ready filter
        all(state).map((i) => [Boolean(i.starUp?.met), Boolean(i.tierUp?.met)]),
      ]);
    },
    setMain(state, id) {
      const card = content.cardById.get(id);
      if (!card) return { ok: false, reason: reason('unknown') };
      return wrap(setLoadoutSlot(state, content, card.job, 'main', id));
    },
    addSupport(state, id) {
      const card = content.cardById.get(id);
      if (!card) return { ok: false, reason: reason('unknown') };
      const supports = state.cards.loadouts[card.job].supports;
      const free = supports.findIndex((s) => s === null);
      if (free < 0 || free >= SUPPORT_SLOTS) return { ok: false, reason: COPY.cards.reasons.full };
      return wrap(setLoadoutSlot(state, content, card.job, free as 0 | 1 | 2, id));
    },
    remove(state, id) {
      const info = cardInfo(state, content, id);
      if (!info?.slot) return { ok: false, reason: reason('invalid-slot') };
      return wrap(setLoadoutSlot(state, content, info.slot.job, info.slot.slot, null));
    },
    upgrade(state, id, kind) {
      if (!cardInfo(state, content, id)) return { ok: false, reason: reason('unknown') };
      return wrap(kind === 'star' ? starUp(state, content, id) : tierUp(state, content, id));
    },
    chart(state, id) {
      const info = cardEnhancements(state, content, id);
      return info ? starChartView(info) : null;
    },
    enhance(state, id, optionId) {
      const result = chooseEnhancement(state, content, id, optionId);
      return result.ok ? result : { ok: false, reason: COPY.enhance.reasons[result.reason] };
    },
    resetEnhancements(state, id) {
      if (!state.cards.owned[id]) return { ok: false, reason: COPY.enhance.reasons['not-owned'] };
      return { ok: true, state: resetEnhancements(state, content, id) };
    },
  };
}
