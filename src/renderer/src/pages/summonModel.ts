import type { Content, Rarity } from '../../../data';
import { formatDecimal, type PortalInfo, type PullResult } from '../../../game';
import { COPY } from '../copy';

/**
 * Summon view models (DESIGN.md 6 Beta portals, A6 E): a portal card on the shelf, its rates
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
      price: `${formatDecimal(info.single.price.amount)} ${res(info.single.price.resource)}`,
      affordable: info.single.affordable,
    },
    ten: {
      label: t.ten,
      price: `${formatDecimal(info.ten.price.amount)} ${res(info.ten.price.resource)}`,
      affordable: info.ten.affordable,
    },
    pity: t.pity(rarityName(content, info.pity.rarity), left),
    pityProgress: Math.min(1, Math.max(0, info.pity.progress)),
    guarantee: t.guarantee(rarityName(content, info.tenPullGuarantee)),
    rates: info.rates.byRarity.map((r) => t.rate(rarityName(content, r.rarity), pct(r.chance))),
  };
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

/** The summon reveal sound for a rarity (DESIGN.md 15). */
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
