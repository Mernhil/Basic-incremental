import type { Content, Rank } from '../../../data';
import {
  SUPPORT_SLOTS,
  cardCollection,
  cardInfo,
  collectModifiers,
  formatDecimal,
  levelCap,
  loadoutInfo,
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
import { COPY } from '../copy';
import { itemArt } from '../art/items';
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
    const have = formatDecimal(r.have);
    const need = formatDecimal(r.need);
    if (r.kind === 'level')
      return {
        label: COPY.cards.req.level,
        met: r.met,
        value: COPY.cards.req.levelValue(have, need),
      };
    if (r.kind === 'duplicates')
      return { label: COPY.cards.req.duplicate, met: r.met, value: COPY.cards.req.of(have, need) };
    return { label: resName(r.resource ?? ''), met: r.met, value: COPY.cards.req.of(have, need) };
  }

  function priceText(check: UpgradeCheck): string {
    return check.requirements
      .filter((r) => r.kind !== 'level')
      .map((r) =>
        r.kind === 'duplicates'
          ? COPY.cards.req.duplicates(r.need.toNumber())
          : `${formatDecimal(r.need)} ${resName(r.resource ?? '')}`,
      )
      .join(', ');
  }

  function step(info: CardInfo): UpgradeStep | null {
    const star = info.starUp;
    const tier = info.tierUp;
    const check = star?.available ? star : tier?.available ? tier : null;
    if (!check || !check.to) return null;
    const kind = check === star ? 'star' : 'tier';
    const cap = levelCap(content, check.to);
    const tierName = TIER_NAMES[check.to.tier];
    return {
      kind,
      title:
        kind === 'star'
          ? COPY.cards.nextStar(check.to.stars, tierName)
          : COPY.cards.nextTier(tierName),
      note:
        kind === 'star'
          ? check.to.stars === 6
            ? COPY.cards.starSixNote(cap)
            : COPY.cards.starNote(cap)
          : COPY.cards.tierNote(tierName, cap),
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
      item: art?.(card.id, owned) ?? itemArt(card.item.kind, card.rarity),
      element: card.element,
      owned: owned !== null,
      rank,
      level,
      cap,
      xp,
      duplicates: owned?.duplicates ?? 0,
      cost: info.cost,
      mainAbility: card.main.description,
      supportEffect: card.support.description,
      stats: [
        { label: COPY.cards.level, value: `${level}/${cap}` },
        { label: COPY.cards.cost, value: String(info.cost) },
      ],
      role: info.slot
        ? { job: info.slot.job, slot: info.slot.slot === 'main' ? 'main' : 'support' }
        : null,
      next: owned ? step(info) : null,
    };
  }

  const all = (state: GameState): CardInfo[] =>
    cardCollection(state, content, undefined, collectModifiers(state, content));

  return {
    entries: (state) => all(state).map(entry),
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
          o.duplicates,
        ]),
        state.cards.loadouts,
        state.cards.shards,
        // readiness changes with resources; it moves badges and the ready filter
        all(state).map((i) => Boolean(i.starUp?.met || i.tierUp?.met)),
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
    upgrade(state, id) {
      const info = cardInfo(state, content, id);
      if (!info) return { ok: false, reason: reason('unknown') };
      if (info.starUp?.available) return wrap(starUp(state, content, id));
      if (info.tierUp?.available) return wrap(tierUp(state, content, id));
      return { ok: false, reason: reason('unavailable') };
    },
  };
}
