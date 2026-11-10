import { RARITIES, type Content, type Rarity } from '../../../data';
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
  /** The portal's kind (`cards`, `cosmetics`, ...): picks its card back and its one-line blurb. */
  kind: string;
  /** The one line under the deck's title ("Legendary or better within 90 pulls"). */
  line: string;
  /** The crystal a pull costs, for the button's icon. */
  resourceId: string;
  /** The pity bar's value, "62 / 90". */
  pityText: string;
  single: { label: string; price: string; amount: string; affordable: boolean };
  ten: { label: string; price: string; amount: string; affordable: boolean };
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
    kind: info.portal.kind,
    line: deckLine(info.portal.kind, rarityName(content, info.pity.rarity), info.pity.threshold),
    resourceId: info.single.price.resource,
    pityText: t.pityOf(info.pity.count, info.pity.threshold),
    single: {
      label: t.pullOne,
      price: `${fmt(info.single.price.amount)} ${res(info.single.price.resource)}`,
      amount: fmt(info.single.price.amount),
      affordable: info.single.affordable,
    },
    ten: {
      label: t.pullTen,
      price: `${fmt(info.ten.price.amount)} ${res(info.ten.price.resource)}`,
      amount: fmt(info.ten.price.amount),
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

/** The line under a deck's title: the pity promise for cards, what the pool holds for the rest. */
export function deckLine(kind: string, pityRarity: string, threshold: number): string {
  const t = COPY.summon;
  if (kind === 'cards') return t.lineCards(pityRarity, threshold);
  if (kind === 'cosmetics') return t.lineCosmetics;
  return t.lineOther(pityRarity, threshold);
}

/** The odds table: one row per rarity found in any portal, one column per portal. */
export interface OddsTable {
  columns: { id: string; name: string }[];
  rows: { rarity: Rarity; name: string; cells: (string | null)[] }[];
}

export function oddsTable(views: readonly PortalView[]): OddsTable {
  const column = (v: PortalView): string =>
    (COPY.summon.oddsColumn as Record<string, string>)[v.kind] ?? v.name;
  const rows = RARITIES.filter((r) => views.some((v) => v.odds.some((o) => o.rarity === r))).map(
    (rarity) => ({
      rarity,
      name: views.flatMap((v) => v.odds).find((o) => o.rarity === rarity)?.name ?? rarity,
      cells: views.map((v) => v.odds.find((o) => o.rarity === rarity)?.chance ?? null),
    }),
  );
  return { columns: views.map((v) => ({ id: v.id, name: column(v) })), rows };
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
  /** What the pull became, under the card: "New card", "+1 copy", "+3 shards". */
  note: string;
  /** Spoken label: "Name, Rarity, New!". */
  label: string;
}

/** The note under a card of the last hand, by what the pull became. */
function handNote(v: RevealView, content?: Content): string {
  const t = COPY.summon;
  if (v.gain === 'new')
    return content?.cardById.has(v.itemId) === false ? t.noteNewItem : t.noteNewCard;
  if (v.gain === 'copy') return t.noteCopy;
  return v.tags.find((x) => x !== t.isNew) ?? '';
}

/** The last pull as a flat row of up to HAND_MAX cards (the final ones if more). */
export function lastHandView(views: readonly RevealView[], content?: Content): HandCardView[] {
  const shown = views.slice(-HAND_MAX);
  return shown.map((v) => {
    const isNew = v.gain === 'new' || v.tags.includes(COPY.summon.isNew);
    return {
      itemId: v.itemId,
      name: v.name,
      rarity: v.rarity,
      rarityName: v.rarityName,
      isNew,
      note: handNote(v, content),
      label: COPY.summon.shown(v.name, v.rarityName, isNew ? COPY.summon.isNew : ''),
    };
  });
}

/** The line beside "Your last hand": pulls, new cards or items, and copies. */
export function handSummary(views: readonly RevealView[]): string {
  const shown = views.slice(-HAND_MAX);
  if (shown.length === 0) return '';
  const news = shown.filter((v) => v.gain === 'new' || v.tags.includes(COPY.summon.isNew)).length;
  const copies = shown.filter((v) => v.gain === 'copy').length;
  return COPY.summon.handSummary(shown.length, news, copies);
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
  /** What the pull became (a repeat of an owned item is `copy`); unset where it is not known. */
  gain?: 'new' | 'copy' | 'shards' | 'other';
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
    const gain =
      g.kind === 'new'
        ? 'new'
        : g.kind === 'duplicate' || g.kind === 'copy'
          ? 'copy'
          : g.kind === 'shards'
            ? 'shards'
            : 'other';
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
      gain,
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
