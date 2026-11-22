import { cardStyle } from '../../../data';
import { type Content, type Rank } from '../../../data';
import {
  LOADOUT_SLOTS,
  cardCollection,
  cardEnhancements,
  cardInfo,
  chooseEnhancement,
  resetEnhancements,
  setCardSkin,
  levelCap,
  loadoutInfo,
  setLoadoutSlot,
  starUp,
  openCardSkill,
  starUpWithDust,
  type CardFailure,
  type CardInfo,
  type GameState,
  type OwnedCard,
  type TierUp,
  type Requirement as GameRequirement,
  type UpgradeCheck,
  TIER_LABELS,
  cardDisplayName,
} from '../../../game';
import { fmt } from '../settings/numberFormat';
import { amountText } from '../settings/coins';
import { COPY, starPercent } from '../copy';
import { statTiles } from './statsModel';
import { cardTierArt } from '../art/items';
import { skinPickerView } from './cardSkinsModel';
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

const TIER_NAMES: Record<Rank['tier'], string> = TIER_LABELS;
const BASE_RANK: Rank = { tier: 'wood', stars: 1 };
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
  const placeName = (id: string): string =>
    content.treeById.get(id)?.name ?? content.mineById.get(id)?.name ?? id;
  /** Only fighting cards go in a loadout; logging and mining cards work on the Production page. */
  const fighting = (id: string): boolean => content.cardById.get(id)?.job === 'fighting';

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
    if (r.kind === 'stars')
      return { label: COPY.cards.req.stars, met: r.met, value: `★${have} / ★${need}` };
    if (r.kind === 'starFill')
      return {
        label: COPY.cards.req.starBar,
        met: r.met,
        value: `${starPercent(r.have.toNumber(), r.need.toNumber())}%`,
        title: COPY.cards.req.of(have, need),
      };
    return { label: resName(r.resource ?? ''), met: r.met, value: COPY.cards.req.of(have, need) };
  }

  function priceText(check: UpgradeCheck): string {
    return check.requirements
      .filter((r) => r.kind !== 'level' && r.kind !== 'stars')
      .map((r) =>
        r.kind === 'starFill'
          ? COPY.cards.req.copies(r.need.toNumber())
          : amountText(content, r.resource ?? '', r.need),
      )
      .join(', ');
  }

  /** The star-up (the star bar's fill only) of a card, if it has one. */
  function step(check: UpgradeCheck | null): UpgradeStep | null {
    if (!check?.available || !check.to) return null;
    const tierName = TIER_NAMES[check.to.tier];
    const multiplier = content.cardRules.power.starMultiplier[check.to.stars - 2] ?? 1;
    return {
      kind: 'star',
      title: COPY.cards.nextStar(check.to.stars, tierName),
      note: COPY.cards.starNote(multiplier),
      requirements: check.requirements.map(requirement),
      action: COPY.cards.addStar(priceText(check)),
      ready: check.met,
    };
  }

  function entry(info: CardInfo, state: GameState): CardEntry {
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
      name: cardDisplayName(content, card),
      heirloom: Boolean(card.heirloom),
      job: card.job,
      rarity: cardStyle(card),
      emblem: JOB_EMBLEM[card.job],
      itemKind: card.item.kind,
      itemType: content.itemTypeByKind.get(card.item.kind)?.noun ?? card.item.kind,
      item: art?.(card.id, owned) ?? cardTierArt(card),
      element: card.element,
      owned: owned !== null,
      rank,
      level,
      cap,
      xp,
      duplicates: owned?.starFill ?? 0,
      cost: info.cost,
      combatRole: card.job === 'fighting' ? card.role : null,
      ability: card.job === 'fighting' ? card.ability.description : card.worker.description,
      teamBonus: card.job === 'fighting' ? card.teamBonus.description : '',
      workplace: info.workplace ? placeName(info.workplace) : null,
      face: cardFaceOf(content, info),
      role: info.slot ? { job: info.slot.job, slot: info.slot.slot } : null,
      next: owned ? step(info.starUp) : null,
      weapon: weaponView(content, info),
      stats: statTiles(content, state, card.id),
    };
  }

  const all = (state: GameState): CardInfo[] => cardCollection(state, content, undefined);

  return {
    entries: (state) => all(state).map((i) => entry(i, state)),
    entry(state, id) {
      const info = cardInfo(state, content, id);
      return info ? entry(info, state) : null;
    },
    loadout(state, job) {
      const lo = loadoutInfo(state, content, job);
      return { job, slots: lo.slots, cost: lo.cost, cap: lo.cap, nextRise: lo.nextRise };
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
        state.camp,
        state.cardSkins,
        state.legacySkins,
        state.cards.shards,
        // readiness changes with resources; it moves badges and the ready filter
        all(state).map((i) => Boolean(i.starUp?.met)),
      ]);
    },
    addToLoadout(state, id) {
      if (!content.cardById.has(id)) return { ok: false, reason: reason('unknown') };
      if (!fighting(id)) return { ok: false, reason: reason('wrong-job') };
      const free = state.cards.loadouts.fighting.slots.findIndex((s) => s === null);
      if (free < 0 || free >= LOADOUT_SLOTS) return { ok: false, reason: COPY.cards.reasons.full };
      return wrap(setLoadoutSlot(state, content, 'fighting', free, id));
    },
    place(state, slot, id) {
      if (!content.cardById.has(id)) return { ok: false, reason: reason('unknown') };
      if (!fighting(id)) return { ok: false, reason: reason('wrong-job') };
      return wrap(setLoadoutSlot(state, content, 'fighting', slot, id));
    },
    remove(state, id) {
      const info = cardInfo(state, content, id);
      if (!info?.slot) return { ok: false, reason: reason('invalid-slot') };
      return wrap(setLoadoutSlot(state, content, info.slot.job, info.slot.slot, null));
    },
    upgrade(state, id, kind) {
      if (!cardInfo(state, content, id)) return { ok: false, reason: reason('unknown') };
      if (kind === 'skill') {
        const r = openCardSkill(state, content, id);
        return r.ok ? r : { ok: false, reason: COPY.moves.reasons[r.reason] };
      }
      if (kind === 'dust') return wrap(starUpWithDust(state, content, id));
      return wrap(starUp(state, content, id));
    },
    chart(state, id) {
      const info = cardEnhancements(state, content, id);
      return info ? starChartView(info) : null;
    },
    enhance(state, id, optionId) {
      const result = chooseEnhancement(state, content, id, optionId);
      return result.ok ? result : { ok: false, reason: COPY.enhance.reasons[result.reason] };
    },
    skins: (state, id) => skinPickerView(state, content, id),
    setSkin(state, id, skinId) {
      const result = setCardSkin(state, content, id, skinId);
      return result.ok ? result : { ok: false, reason: COPY.cardSkins.failed };
    },
    resetEnhancements(state, id) {
      if (!state.cards.owned[id]) return { ok: false, reason: COPY.enhance.reasons['not-owned'] };
      return { ok: true, state: resetEnhancements(state, content, id) };
    },
  };
}
