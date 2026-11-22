import { cardStyle, styleGrade } from '../../../data';
import { gradeLabel } from '../../../game';
import { ITEM_KINDS, RARITIES, type Content, type Rarity } from '../../../data';
import {
  cardDisplayName,
  cardNameById,
  type GameState,
  type HeirloomGateInfo,
  type HeirloomPull,
  type PortalInfo,
  type PullResult,
  type WishlistInfo,
  tierProgress,
} from '../../../game';
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
  /** The portal's level bar (card portals); null for a portal with no levels. */
  level: { label: string; value: string; progress: number; now: number; max: number } | null;
  /** "Your first ×10 holds a Gold or better" until it is made; null otherwise. */
  firstTen: string | null;
  /** The note under the odds about the level and the tiers that leave the pool. */
  levelNote: string | null;
}

/**
 * The name of a step of a portal's ladder: a tier on a card portal (DESIGN.md §7: Wood ... Prismatic,
 * Mythic or Void at T6), a rarity on the cosmetic gates.
 */
const rarityName = (content: Content, r: Rarity, cards = false): string =>
  cards ? gradeLabel(styleGrade(r)) : (content.rarityById.get(r)?.name ?? r);

const pct = (x: number): string => {
  const v = x * 100;
  return `${v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2)}%`;
};

export function portalView(info: PortalInfo, content: Content): PortalView {
  const res = (id: string): string => content.resourceById.get(id)?.name ?? id;
  const t = COPY.summon;
  const cards = info.portal.kind === 'cards';
  const left = Math.max(1, info.pity.threshold - info.pity.count);
  // a card portal's pity step is T6 (Mythic or Void): nothing is better, so no "or better"
  const t6 = cards && info.pity.rarity === 'mythic';
  const lv = info.level;
  return {
    id: info.portal.id,
    name: info.portal.name,
    kind: info.portal.kind,
    line: t6
      ? t.lineT6(info.pity.threshold)
      : deckLine(
          info.portal.kind,
          rarityName(content, info.pity.rarity, cards),
          info.pity.threshold,
        ),
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
    pity: t6 ? t.pityT6(left) : t.pity(rarityName(content, info.pity.rarity, cards), left),
    pityProgress: Math.min(1, Math.max(0, info.pity.progress)),
    guarantee: t.guarantee(rarityName(content, info.tenPullGuarantee, cards)),
    rates: info.rates.byRarity.map((r) =>
      t.rate(rarityName(content, r.rarity, cards), pct(r.chance)),
    ),
    odds: info.rates.byRarity.map((r) => ({
      rarity: r.rarity,
      name: rarityName(content, r.rarity, cards),
      chance: pct(r.chance),
    })),
    pityCount: info.pity.count,
    pityThreshold: info.pity.threshold,
    pityRarityName: rarityName(content, info.pity.rarity, cards),
    deckLayers: deckLayers(info.pity.progress),
    level: lv
      ? {
          label: t.levelLabel(lv.level),
          value: t.levelValue(lv.pulls, lv.next),
          progress: Math.min(1, Math.max(0, lv.progress)),
          now: lv.pulls - lv.from,
          max: lv.next === null ? 1 : lv.next - lv.from,
        }
      : null,
    firstTen: info.firstTenPull ? t.firstTen(rarityName(content, info.firstTenPull, cards)) : null,
    levelNote: lv ? t.levelNote(lv.level, lv.levels) : null,
  };
}

/** One check box of the tier collection. */
export interface TierBoxView {
  grade: string;
  rarity: Rarity;
  name: string;
  count: string;
  reward: string;
  checked: boolean;
  label: string;
}

/** The tier collection: a check box per tier, ticked when the tier's reward was paid. */
export function tierBoxes(state: GameState, content: Content): TierBoxView[] {
  const t = COPY.summon;
  return tierProgress(state, content).map((p) => ({
    grade: p.grade,
    rarity: p.rarity,
    name: rarityName(content, p.rarity, true),
    count: t.tierCount(p.done, p.total),
    reward: t.tierReward(fmt(p.scrolls), fmt(content.cardRules.tierReward.damagePercent)),
    checked: p.claimed,
    label: t.tierBox(rarityName(content, p.rarity, true), p.done, p.total, p.claimed),
  }));
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

/** The Wishlist panel of a card portal (DESIGN.md §7): the pool's cards by rarity, with the marks. */
export interface WishlistPanelView {
  active: boolean;
  /** "Hunting: Name, Name" under the deck, or "No card marked". */
  hunting: string;
  about: string;
  rows: {
    rarity: Rarity;
    name: string;
    countText: string;
    label: string;
    full: boolean;
    cards: {
      id: string;
      name: string;
      marked: boolean;
      label: string;
      blocked: boolean;
      /** The player owns this card (an unowned tile is drawn with a dashed edge). */
      owned: boolean;
      /** Item type ("greatsword"), the column the tile sits in. */
      kind: string;
      element: string;
      /** "Wooden Sword · Sword · Fire · Fighting": the one-line readout and the tooltip. */
      detail: string;
    }[];
  }[];
}

const cap = (x: string): string => x.charAt(0).toUpperCase() + x.slice(1);
const kindName = (kind: string): string => cap(kind.replace('_', ' '));

/** Column of an item type in the Wishlist grid (the order of the 11 types). */
export function wishKindIndex(kind: string): number {
  const i = (ITEM_KINDS as readonly string[]).indexOf(kind);
  return i < 0 ? ITEM_KINDS.length : i;
}

export function wishlistPanelView(
  info: WishlistInfo,
  state: GameState,
  content: Content,
): WishlistPanelView {
  const t = COPY.summon;
  const nameOf = (id: string): string => {
    const def = content.cardById.get(id);
    return def ? cardDisplayName(content, def) : id;
  };
  const limit = info.byRarity[0]?.limit ?? 0;
  const marked = state.cards.wishlist.filter((id) =>
    info.byRarity.some((r) => r.cards.some((c) => c.itemId === id)),
  );
  return {
    active: info.active,
    hunting: marked.length ? t.wishlistHunting(marked.map(nameOf).join(', ')) : t.wishlistNone,
    about: t.wishlistAbout(limit),
    rows: info.byRarity.map((r) => {
      const full = r.marked >= r.limit;
      return {
        rarity: r.rarity,
        name: rarityName(content, r.rarity, true),
        countText: t.wishlistCount(r.marked, r.limit),
        label: t.wishlistRow(rarityName(content, r.rarity, true), r.marked, r.limit),
        full,
        cards: r.cards
          .map((c) => {
            const card = content.cardById.get(c.itemId);
            const kind = card?.item.kind ?? '';
            return {
              id: c.itemId,
              name: nameOf(c.itemId),
              marked: c.marked,
              blocked: !c.marked && full,
              owned: state.cards.owned[c.itemId] !== undefined,
              label: t.wishlistCard(nameOf(c.itemId), c.marked, full),
              kind,
              element: card?.element ?? '',
              detail: card
                ? t.wishlistDetail(
                    nameOf(c.itemId),
                    kindName(kind),
                    card.element ? cap(card.element) : undefined,
                    cap(card.job),
                  )
                : nameOf(c.itemId),
            };
          })
          // by weapon type, so a type keeps its column from one rarity to the next
          .sort((a, b) => wishKindIndex(a.kind) - wishKindIndex(b.kind)),
      };
    }),
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
    else if (g.kind === 'payback') tags.push(t.payback(fmt(g.amount)));
    const gain =
      g.kind === 'new'
        ? 'new'
        : g.kind === 'duplicate' || g.kind === 'copy' || g.kind === 'payback'
          ? 'copy'
          : g.kind === 'shards'
            ? 'shards'
            : 'other';
    if (r.pity) tags.push(t.byPity);
    if (r.guaranteed) tags.push(t.byGuarantee);
    return {
      itemId: r.itemId,
      name:
        cardNameById(content, r.itemId) ??
        content.cosmeticById.get(r.itemId)?.name ??
        content.legacySkinById.get(r.itemId)?.skin.name ??
        r.itemId,
      rarity: r.rarity,
      rarityName: rarityName(content, r.rarity, content.cardById.has(r.itemId)),
      orb: r.orb,
      upgrade: r.orb !== r.rarity,
      tags,
      gain,
    };
  });
}

// ---- the Heirloom Gate (DESIGN.md §7 Heirloom Gate; UI_RULES §2 The Summon view, pick 3a) ----

/** The Heirloom Gate's deck: like a portal deck, with its own lines. */
export interface HeirloomDeckView {
  name: string;
  line: string;
  about: string;
  resourceId: string;
  pityText: string;
  pityCount: number;
  pityThreshold: number;
  pityProgress: number;
  deckLayers: number;
  single: { amount: string; price: string; affordable: boolean };
  ten: { amount: string; price: string; affordable: boolean };
}

/** One cell of the board: an Heirloom with its stars and shard bar. */
export interface HeirloomCellView {
  cardId: string;
  name: string;
  kind: string;
  side: 'mythic' | 'void';
  owned: boolean;
  stars: number;
  progress: number;
  shardsText: string;
  label: string;
}

/** The board: 11 types across in one row (each Heirloom leans light or dark: its cell's side), in the shared type order. */
export interface HeirloomBoardView {
  title: string;
  facts: string;
  columns: { kind: string; name: string }[];
  rows: { name: string; cells: (HeirloomCellView | null)[] }[];
  odds: string;
  pityNote: string;
}

export function heirloomDeckView(info: HeirloomGateInfo, content: Content): HeirloomDeckView {
  const t = COPY.summon;
  const res = (id: string): string => content.resourceById.get(id)?.name ?? id;
  const offer = (o: HeirloomGateInfo['single']) => ({
    amount: fmt(o.price.amount),
    price: `${fmt(o.price.amount)} ${res(o.price.resource)}`,
    affordable: o.affordable,
  });
  return {
    name: info.name,
    line: t.heirloomLine(info.pity.threshold),
    about: t.heirloomAbout(pct(info.wholeChance), info.shards.min, info.shards.max),
    resourceId: info.single.price.resource,
    pityText: t.pityOf(info.pity.count, info.pity.threshold),
    pityCount: info.pity.count,
    pityThreshold: info.pity.threshold,
    pityProgress: info.pity.progress,
    deckLayers: deckLayers(info.pity.progress),
    single: offer(info.single),
    ten: offer(info.ten),
  };
}

export function heirloomBoardView(info: HeirloomGateInfo, content: Content): HeirloomBoardView {
  const t = COPY.summon;
  const gate = content.heirlooms.gate;
  // a row key is a batch id, or `<batch>#2` for the batch's second Heirloom of a type (Wildwood's
  // fox tail dagger): that row holds only those cells
  const cell = (kind: string, rowKey: string): HeirloomCellView | null => {
    const [batch = '', nth = '1'] = rowKey.split('#');
    const e = info.entries.filter(
      (x) => x.card.item.kind === kind && (x.card.batch ?? 'base') === batch,
    )[Number(nth) - 1];
    if (!e) return null;
    const side = e.side;
    return {
      cardId: e.card.id,
      name: cardDisplayName(content, e.card),
      kind,
      side,
      owned: e.owned !== null,
      stars: e.stars,
      progress: e.progress,
      shardsText: t.heirloomShardsOf(e.shards, e.need),
      label: t.heirloomCell(cardDisplayName(content, e.card), e.stars, e.shards, e.need),
    };
  };
  const kinds = content.items.types;
  return {
    title: t.heirloomBoardTitle(info.total),
    facts: t.heirloomBoardFacts(info.unlocked, info.total, gate.unlockShards),
    columns: kinds.map((k) => ({ kind: k.kind, name: k.noun })),
    // one row per art batch (Dragon, Leviathan, Wildwood, and a second Wildwood row for its extra dagger), a cell per weapon type
    rows: Object.entries(t.heirloomRows).map(([batch, name]) => ({
      name,
      cells: kinds.map((k) => cell(k.kind, batch)),
    })),
    odds: t.heirloomOdds(
      pct(info.wholeChance),
      pct(1 - info.wholeChance),
      info.shards.min,
      info.shards.max,
      info.total,
    ),
    pityNote: t.heirloomPityNote(info.pity.threshold, gate.cardShardsPerOverflow),
  };
}

/** The Heirloom Gate's pulls as reveal views: the Heirloom's card, and what the pull did. */
export function heirloomRevealViews(
  results: readonly HeirloomPull[],
  content: Content,
): RevealView[] {
  const t = COPY.summon;
  return results.map((r) => {
    const card = content.cardById.get(r.cardId);
    const rarity = card ? cardStyle(card) : 'mythic';
    const tags: string[] = [];
    if (r.whole) tags.push(t.heirloomWhole);
    else tags.push(t.shards(r.shards));
    if (r.outcome.unlocked) tags.push(t.heirloomUnlocked);
    if (r.outcome.starsGained > 0) tags.push(t.heirloomStar(r.stars));
    if (r.outcome.cardShards > 0) tags.push(t.heirloomCardShards(r.outcome.cardShards));
    if (r.pity) tags.push(t.byPity);
    return {
      itemId: r.cardId,
      name: cardNameById(content, r.cardId) ?? r.cardId,
      // a shard pull shows one step lower, so a whole Heirloom stands out in the reveal
      rarity: r.whole ? rarity : 'legendary',
      rarityName: rarityName(content, rarity),
      orb: r.whole ? rarity : 'legendary',
      upgrade: false,
      tags,
      gain: r.outcome.unlocked ? 'new' : 'other',
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

// ---- the three doors and the new reveal (DESIGN.md §2 "The reveal is redone") ----

/** The door art a gate shows: the Card Portal, the Focus Portal or the Heirloom Gate. */
export type DoorKey = 'card_portal' | 'focus_portal' | 'heirloom_gate';

/** The three doors of the page, left to right. */
export const DOOR_ORDER: readonly DoorKey[] = ['card_portal', 'focus_portal', 'heirloom_gate'];

/**
 * The door a gate's pull opens. The Wardrobe and Legacy gates have no door art yet: they open the
 * Card Portal's door.
 */
export function doorKeyOf(gateId: string): DoorKey {
  return gateId === 'focus_portal' || gateId === 'heirloom_gate' ? gateId : 'card_portal';
}

/** The one line under a door's name: what the gate pulls. */
export function doorAbout(key: DoorKey, focusName: string | null): string {
  const t = COPY.summon;
  if (key === 'card_portal') return t.doorCard;
  if (key === 'focus_portal') return focusName ? t.doorFocus(focusName) : t.focusNone;
  return t.doorHeirloom;
}

/** True for a pull that gets the cut-in: a T6 (Mythic or Void) or a whole Heirloom. */
export const isCutinRarity = (r: Rarity): boolean => r === 'mythic' || r === 'void';

/** The best card of a pull, known before any card moves: its place, rarity and whether it gets the cut-in. */
export function bestOfPull(rarities: readonly Rarity[]): {
  index: number;
  rarity: Rarity;
  cutin: boolean;
} | null {
  let best = -1;
  rarities.forEach((r, i) => {
    if (best < 0 || RARITIES.indexOf(r) > RARITIES.indexOf(rarities[best]!)) best = i;
  });
  const rarity = rarities[best];
  return rarity ? { index: best, rarity, cutin: isCutinRarity(rarity) } : null;
}

/** One beat of the reveal: a card flies through the door, the cut-in plays for one card, or that card lands at the centre at 2x, holds, and moves into its place (`hero`). */
export interface RevealStep {
  kind: 'fly' | 'cutin' | 'hero';
  index: number;
  /** Milliseconds from the start of the show when it begins. */
  at: number;
}

/** How long one ordinary card takes to cross, how long a cut-in holds everything. */
export const FLY_MS = 420;
export const CUTIN_MS = 1800;
/** The T6 card after its cut-in: lands at 2x (200 ms), holds (450 ms), moves to its slot (250 ms). */
export const HERO_MS = 900;
/** All the ordinary cards of a pull leave the door within about this long. */
export const FLY_SPREAD_MS = 600;

/**
 * The show's timeline, in pull order: ordinary cards leave the door a few tens of milliseconds
 * apart so a ten-pull is through in about a second; a T6 or Heirloom stops everything for the
 * cut-in, then its card flies in and the rest go on.
 */
export function revealTimeline(rarities: readonly Rarity[]): {
  steps: RevealStep[];
  totalMs: number;
} {
  const steps: RevealStep[] = [];
  const gap = rarities.length > 1 ? Math.min(90, FLY_SPREAD_MS / (rarities.length - 1)) : 0;
  let clock = 0;
  rarities.forEach((r, index) => {
    if (isCutinRarity(r)) {
      // everything already on its way lands first
      clock = Math.max(
        clock,
        steps.reduce((m, s) => Math.max(m, s.at + (s.kind === 'hero' ? HERO_MS : FLY_MS)), 0),
      );
      steps.push({ kind: 'cutin', index, at: clock });
      clock += CUTIN_MS;
      steps.push({ kind: 'hero', index, at: clock });
      clock += HERO_MS + gap;
    } else {
      steps.push({ kind: 'fly', index, at: clock });
      clock += gap;
    }
  });
  return {
    steps,
    totalMs: steps.reduce((m, s) => Math.max(m, s.at + (s.kind === 'hero' ? HERO_MS : FLY_MS)), 0),
  };
}

/**
 * A door's size on screen in CSS px: its 160-px picture at a whole number of device pixels per art
 * pixel (2x on a roomy page), the nearest whole scale to `wantCss`, never below 1.
 */
export function doorPx(wantCss: number, dpr: number): number {
  const n = Math.max(1, Math.round((wantCss * dpr) / 160));
  return (n * 160) / dpr;
}

/** The sprite name a weapon's art markup draws (`data-sprite="..."`), or null. */
export function spriteNameOf(markup: string): string | null {
  return /data-sprite="([^"]+)"/.exec(markup)?.[1] ?? null;
}
