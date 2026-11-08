import type { Content, Rarity } from '../../../data';
import { type PortalInfo, type PullResult } from '../../../game';
import { fmt } from '../settings/numberFormat';
import { COPY } from '../copy';

/**
 * Summon view models (DESIGN.md §7 Beta portals, A6 E): a portal card on the shelf, its rates
 * tooltip, and each pull of a reveal. Display logic only; pulls and pity come from game.
 */

export interface PortalView {
  id: string;
  name: string;
  single: { label: string; price: string; affordable: boolean };
  ten: { label: string; price: string; affordable: boolean };
  /** "Legendary or better in 56 pulls". */
  pity: string;
  pityProgress: number;
  /** "Every ×10 holds a Rare or better". */
  guarantee: string;
  /** Lines of the rates tooltip, by rarity, lowest first. */
  rates: string[];
  /** The same rates as rows for the odds panel. */
  odds: { rarity: Rarity; name: string; chance: string }[];
  /** Pulls since the last pity rarity, and the hard pity threshold. */
  pityCount: number;
  pityThreshold: number;
  /** Name of the pity rarity ("Legendary"). */
  pityRarityName: string;
  /** Visible card layers of the deck (more edge = closer to the hard pity). */
  deckLayers: number;
}

const rarityName = (content: Content, r: Rarity): string => content.rarityById.get(r)?.name ?? r;

const pct = (x: number): string => {
  const v = x * 100;
  return `${v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2)}%`;
};

export function portalView(info: PortalInfo, content: Content): PortalView {
  const res = (id: string): string => content.resourceById.get(id)?.name ?? id;
  const t = COPY.summon;
  const left = Math.max(1, info.pity.threshold - info.pity.count);
  return {
    id: info.portal.id,
    name: info.portal.name,
    single: {
      label: t.single,
      price: `${fmt(info.single.price.amount)} ${res(info.single.price.resource)}`,
      affordable: info.single.affordable,
    },
    ten: {
      label: t.ten,
      price: `${fmt(info.ten.price.amount)} ${res(info.ten.price.resource)}`,
      affordable: info.ten.affordable,
    },
    pity: t.pity(rarityName(content, info.pity.rarity), left),
    pityProgress: Math.min(1, Math.max(0, info.pity.progress)),
    guarantee: t.guarantee(rarityName(content, info.tenPullGuarantee)),
    rates: info.rates.byRarity.map((r) => t.rate(rarityName(content, r.rarity), pct(r.chance))),
    odds: info.rates.byRarity.map((r) => ({
      rarity: r.rarity,
      name: rarityName(content, r.rarity),
      chance: pct(r.chance),
    })),
    pityCount: info.pity.count,
    pityThreshold: info.pity.threshold,
    pityRarityName: rarityName(content, info.pity.rarity),
    deckLayers: deckLayers(info.pity.progress),
  };
}

/** Fewest and most card layers a deck shows. */
export const DECK_MIN_LAYERS = 1;
export const DECK_MAX_LAYERS = 9;

/** Thickness of a deck in card layers: one when fresh, DECK_MAX_LAYERS at the hard pity. */
export function deckLayers(progress: number): number {
  const p = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  return DECK_MIN_LAYERS + Math.round(p * (DECK_MAX_LAYERS - DECK_MIN_LAYERS));
}

/** Most cards "Your last hand" shows. */
export const HAND_MAX = 10;

/** One card of "Your last hand". */
export interface HandCardView {
  itemId: string;
  name: string;
  rarity: Rarity;
  rarityName: string;
  isNew: boolean;
  /** Spoken label: "Name, Rarity, New!". */
  label: string;
  /** Fan angle in degrees: a light spread around the middle of the row. */
  tilt: number;
}

/** The last pull as a flat, lightly fanned row of up to HAND_MAX cards (the final ones if more). */
export function lastHandView(views: readonly RevealView[]): HandCardView[] {
  const shown = views.slice(-HAND_MAX);
  const mid = (shown.length - 1) / 2;
  return shown.map((v, i) => {
    const isNew = v.tags.includes(COPY.summon.isNew);
    return {
      itemId: v.itemId,
      name: v.name,
      rarity: v.rarity,
      rarityName: v.rarityName,
      isNew,
      label: COPY.summon.shown(v.name, v.rarityName, isNew ? COPY.summon.isNew : ''),
      tilt: shown.length > 1 ? Math.round((i - mid) * 1.6 * 10) / 10 : 0,
    };
  });
}

/** One pull of a reveal. */
export interface RevealView {
  itemId: string;
  name: string;
  rarity: Rarity;
  rarityName: string;
  /** The orb's colour before the flip (one lower when an upgrade flash plays). */
  orb: Rarity;
  upgrade: boolean;
  /** "New!", "Duplicate ×2", "+3 shards", "Pity", ... */
  tags: string[];
}

export function revealViews(results: readonly PullResult[], content: Content): RevealView[] {
  const t = COPY.summon;
  return results.map((r) => {
    const tags: string[] = [];
    const g = r.gain;
    if (g.kind === 'new') tags.push(t.isNew);
    else if (g.kind === 'duplicate') tags.push(t.duplicate(g.duplicates));
    else if (g.kind === 'shards') tags.push(t.shards(g.shards));
    else if (g.kind === 'copy') tags.push(t.copy(g.copies));
    if (r.pity) tags.push(t.byPity);
    if (r.guaranteed) tags.push(t.byGuarantee);
    return {
      itemId: r.itemId,
      name:
        content.cardById.get(r.itemId)?.name ??
        content.cosmeticById.get(r.itemId)?.name ??
        r.itemId,
      rarity: r.rarity,
      rarityName: rarityName(content, r.rarity),
      orb: r.orb,
      upgrade: r.orb !== r.rarity,
      tags,
    };
  });
}

/** The summon reveal sound for a rarity (DESIGN.md §13). */
export function revealSound(rarity: Rarity): string {
  switch (rarity) {
    case 'common':
      return 'summonCommon';
    case 'rare':
      return 'summonRare';
    case 'epic':
      return 'summonEpic';
    case 'legendary':
      return 'summonLegendary';
    default:
      return 'summonMythic';
  }
}
