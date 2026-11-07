import {
  CARD_SLOTS,
  COSMETIC_SLOTS,
  type CardSlot,
  type Content,
  type CosmeticSlot,
  type LadderStep,
  type ModifierData,
  type Rank,
  type Rarity,
} from '../../../data';
import {
  Decimal,
  equip,
  type Modifier,
  meetsRank,
  resolveGlobal,
  setBonuses,
  ThemeError,
  type CosmeticLoadout,
  type GameState,
  type ResolvedCard,
  type WardrobeItem,
} from '../../../game';
import { fmt } from '../settings/numberFormat';
import { COPY } from '../copy';
import { modifierText, sourceName } from '../shell/modifierText';

/**
 * Wardrobe view models (DESIGN.md 7, 11.1, 17 mannequin card): the seven slots around the
 * preview card, the item grid, the selected item's ladder and upgrade checklist, set bonuses and
 * the try-on loadout of the preview. Display logic only; every rule comes from game.
 */

export type SlotFilter = CosmeticSlot | 'all';

export const SLOT_ORDER: readonly CosmeticSlot[] = COSMETIC_SLOTS;

const t = COPY.wardrobe;

export const isCardSlot = (slot: CosmeticSlot): slot is CardSlot =>
  (CARD_SLOTS as readonly string[]).includes(slot);

const TIER_NAMES: Record<Rank['tier'], string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  prismatic: 'Prismatic',
};

export const rankText = (rank: Rank): string => `${TIER_NAMES[rank.tier]} ★${rank.stars}`;

const rarityName = (content: Content, r: Rarity): string => content.rarityById.get(r)?.name ?? r;

/** "+1% damage", "×2 sigils", ... */
export function buffText(m: ModifierData): string {
  const v = fmt(m.value);
  const stat = t.stat[m.stat as keyof typeof t.stat] ?? m.stat;
  switch (m.kind) {
    case 'percent':
      return `${m.value.gte(0) ? '+' : ''}${v}% ${stat}`;
    case 'mult':
      return `×${v} ${stat}`;
    case 'flat':
      return `${m.value.gte(0) ? '+' : ''}${v} ${stat}`;
    default:
      return `${stat} ${m.kind} ${v}`;
  }
}

// ---- preview card ----------------------------------------------------------------------------

export interface PreviewChoice {
  id: string;
  name: string;
  rank: Rank;
  label: string;
}

/** The owned cards the mannequin can wear, rarest first. */
export function previewChoices(state: GameState, content: Content): PreviewChoice[] {
  const order = content.rarities.map((r) => r.id);
  return content.cards
    .filter((c) => state.cards.owned[c.id])
    .sort((a, b) => order.indexOf(b.rarity) - order.indexOf(a.rarity))
    .map((c) => {
      const o = state.cards.owned[c.id]!;
      const rank = { tier: o.tier, stars: o.stars };
      return { id: c.id, name: c.name, rank, label: `${c.name} · ${rankText(rank)}` };
    });
}

/** The default preview card: the fighting main card, else the rarest owned card. */
export function defaultPreview(state: GameState, content: Content): string | null {
  const main = state.cards.loadouts.fighting.main;
  if (main && state.cards.owned[main]) return main;
  return previewChoices(state, content)[0]?.id ?? null;
}

/**
 * The loadout the mannequin shows: the real one with the selected item tried on (on the preview
 * card for card slots, globally otherwise). The real loadout when nothing can be tried on.
 */
export function tryOnLoadout(
  state: GameState,
  content: Content,
  itemId: string | null,
  cardId: string | null,
): CosmeticLoadout {
  const loadout = state.cosmetics.loadout;
  const cosmetic = itemId ? content.cosmeticById.get(itemId) : undefined;
  if (!cosmetic) return loadout;
  const level = state.cosmetics.owned[cosmetic.id]?.level ?? 1;
  const onCard = isCardSlot(cosmetic.slot) && cardId !== null;
  try {
    return equip(
      content,
      loadout,
      cosmetic.slot,
      { id: cosmetic.id, level },
      onCard ? cardId : undefined,
    );
  } catch (e) {
    if (e instanceof ThemeError) return loadout;
    throw e;
  }
}

// ---- slots around the card -------------------------------------------------------------------

export interface SlotView {
  slot: CosmeticSlot;
  label: string;
  itemId: string;
  name: string;
  rarity: Rarity;
  level: number;
  /** True when the preview card has its own choice for this slot. */
  perCard: boolean;
  /** Card slots: the chosen item the card cannot wear yet ("wearable from ..."), else null. */
  blocked: string | null;
}

export function slotViews(
  state: GameState,
  content: Content,
  previewCard: string | null,
  /** `resolveCardFor` of the preview card (null without one). */
  resolved: ResolvedCard | null,
): SlotView[] {
  const global = resolveGlobal(content, state.cosmetics.loadout);
  return SLOT_ORDER.map((slot) => {
    const onCard = isCardSlot(slot) && resolved ? resolved.slots[slot] : null;
    const r = onCard ?? global[slot];
    const blocked = onCard?.blocked ?? null;
    const need = blocked ? wearRankOf(content, blocked.id) : null;
    return {
      slot,
      label: t.slots[slot],
      itemId: r.cosmetic.id,
      name: r.cosmetic.name,
      rarity: r.cosmetic.rarity,
      level: r.level,
      perCard:
        isCardSlot(slot) && previewCard !== null
          ? Boolean(state.cosmetics.loadout.cards[previewCard]?.[slot])
          : false,
      blocked: blocked && need ? t.blockedSlot(blocked.name, rankText(need)) : null,
    };
  });
}

function wearRankOf(content: Content, id: string): Rank | null {
  const c = content.cosmeticById.get(id);
  if (!c || c.starter) return null;
  if (c.exclusiveCard) return content.wearRules.exclusive;
  if (c.slot === 'border' || c.slot === 'finish') return content.wearRules[c.slot];
  return null;
}

// ---- item grid -------------------------------------------------------------------------------

export interface ItemTile {
  id: string;
  name: string;
  slot: CosmeticSlot;
  slotLabel: string;
  rarity: Rarity;
  rarityName: string;
  owned: boolean;
  level: number;
  maxLevel: number;
  /** "Lv 2/4", or "Not owned". */
  levelText: string;
  copies: number;
  maxed: boolean;
  /** Worn globally, or on the preview card. */
  equipped: boolean;
  /** Owned with everything the next level needs. */
  upgradable: boolean;
  /** Screen-reader label for the tile button. */
  aria: string;
}

const rarityIndex = (content: Content, r: Rarity): number =>
  content.rarities.findIndex((x) => x.id === r);

export function itemTiles(
  items: readonly WardrobeItem[],
  content: Content,
  filter: SlotFilter,
  previewCard: string | null,
): ItemTile[] {
  return items
    .filter((i) => filter === 'all' || i.cosmetic.slot === filter)
    .map((i): ItemTile => {
      const c = i.cosmetic;
      const equipped =
        i.equippedGlobally || (previewCard !== null && i.equippedOnCards.includes(previewCard));
      const levelText = i.owned ? t.levelOf(i.level, i.maxLevel) : t.notOwned;
      const bits = [
        c.name,
        t.slots[c.slot],
        rarityName(content, c.rarity),
        levelText,
        ...(equipped ? [t.equipped] : []),
        ...(i.upgrade?.met ? [t.canUpgrade] : []),
      ];
      return {
        id: c.id,
        name: c.name,
        slot: c.slot,
        slotLabel: t.slots[c.slot],
        rarity: c.rarity,
        rarityName: rarityName(content, c.rarity),
        owned: i.owned,
        level: i.level,
        maxLevel: i.maxLevel,
        levelText,
        copies: i.copies,
        maxed: i.maxed,
        equipped,
        upgradable: Boolean(i.upgrade?.met),
        aria: bits.join(', '),
      };
    })
    .sort(
      (a, b) =>
        Number(b.owned) - Number(a.owned) ||
        SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) ||
        rarityIndex(content, b.rarity) - rarityIndex(content, a.rarity) ||
        a.name.localeCompare(b.name),
    );
}

// ---- selected item ---------------------------------------------------------------------------

export interface LadderRung {
  level: number;
  step: LadderStep;
  name: string;
  state: 'done' | 'next' | 'locked';
}

export interface Requirement {
  label: string;
  value: string;
  met: boolean;
}

export interface UpgradeView {
  /** "Level 3: Accent colour". */
  title: string;
  /** What the step adds, in one line. */
  note: string;
  requirements: Requirement[];
  /** "Upgrade · 1 copy, 300 Glimmer Dust". */
  action: string;
  ready: boolean;
}

export interface EquipOptions {
  /** Equip in the global slot (not for card-exclusives). */
  global: 'equip' | 'equipped' | 'starter' | null;
  /** Equip on the preview card only (card slots). */
  card: 'equip' | 'equipped' | null;
  /** Why it cannot be equipped, when it cannot ("Not owned yet", "Only for ..."). */
  note: string | null;
}

export interface ItemDetail {
  tile: ItemTile;
  /** "Epic border · Gilded Tradition set". */
  subtitle: string;
  source: string;
  /** Owned buff lines ("+1% damage"); empty when the item has none. */
  buffs: string[];
  buffActive: boolean;
  /** "Wearable on cards from Gold ★1", with whether the preview card meets it. */
  wear: { text: string; met: boolean } | null;
  exclusive: string | null;
  ladder: LadderRung[];
  /** Null when not owned; `maxed` true at the top. */
  upgrade: UpgradeView | null;
  maxedNote: string | null;
  equip: EquipOptions;
}

export function itemDetail(
  item: WardrobeItem,
  state: GameState,
  content: Content,
  ladder: readonly LadderStep[],
  previewCard: string | null,
): ItemDetail {
  const c = item.cosmetic;
  const tile = itemTiles([item], content, 'all', previewCard)[0]!;
  const set = c.set ? content.setById.get(c.set) : undefined;
  const subtitle = [
    `${rarityName(content, c.rarity)} ${t.slots[c.slot].toLowerCase()}`,
    ...(set ? [t.setOf(set.name)] : []),
  ].join(' · ');

  const previewOwned = previewCard ? state.cards.owned[previewCard] : undefined;
  const previewRank = previewOwned ? { tier: previewOwned.tier, stars: previewOwned.stars } : null;
  const wear =
    item.wearRank && !c.exclusiveCard
      ? {
          text: t.wearableFrom(rankText(item.wearRank)),
          met: previewRank ? meetsRank(previewRank, item.wearRank) : false,
        }
      : null;
  const exclusiveCard = c.exclusiveCard ? content.cardById.get(c.exclusiveCard) : undefined;
  const exclusive = exclusiveCard
    ? t.exclusiveTo(exclusiveCard.name, rankText(content.wearRules.exclusive))
    : null;

  const rungs: LadderRung[] = ladder.map((step, i) => {
    const level = i + 1;
    return {
      level,
      step,
      name: t.steps[step],
      state: level <= item.level ? 'done' : level === item.level + 1 ? 'next' : 'locked',
    };
  });

  let upgrade: UpgradeView | null = null;
  if (item.upgrade?.available && item.upgrade.step && item.upgrade.toLevel) {
    const reqs = item.upgrade.requirements.map((r): Requirement => {
      const need = fmt(r.need);
      if (r.kind === 'copies') {
        return {
          label: t.copiesLabel,
          value: t.haveOf(fmt(r.have), need),
          met: r.met,
        };
      }
      const name = content.resourceById.get(r.resource ?? '')?.name ?? r.resource ?? '';
      return { label: name, value: t.haveOf(fmt(r.have), need), met: r.met };
    });
    const price = item.upgrade.requirements
      .map((r) =>
        r.kind === 'copies'
          ? t.copies(r.need.toNumber())
          : `${fmt(r.need)} ${content.resourceById.get(r.resource ?? '')?.name ?? ''}`,
      )
      .join(', ');
    upgrade = {
      title: t.nextLevel(item.upgrade.toLevel, t.steps[item.upgrade.step]),
      note: t.stepNote[item.upgrade.step],
      requirements: reqs,
      action: `${t.upgrade} · ${price}`,
      ready: item.upgrade.met,
    };
  }

  // equip options
  const cardSlot = isCardSlot(c.slot);
  const onPreview = previewCard !== null && item.equippedOnCards.includes(previewCard);
  let note: string | null = null;
  if (!item.owned) note = t.notOwnedNote;
  else if (exclusiveCard && previewCard !== exclusiveCard.id) {
    note = state.cards.owned[exclusiveCard.id]
      ? t.pickCard(exclusiveCard.name)
      : t.needCard(exclusiveCard.name);
  }
  const equipOpts: EquipOptions = {
    global:
      !item.owned || c.exclusiveCard
        ? null
        : c.starter
          ? item.equippedGlobally
            ? 'equipped'
            : 'starter'
          : item.equippedGlobally
            ? 'equipped'
            : 'equip',
    card:
      item.owned &&
      cardSlot &&
      previewCard !== null &&
      !c.starter &&
      (!c.exclusiveCard || c.exclusiveCard === previewCard)
        ? onPreview
          ? 'equipped'
          : 'equip'
        : null,
    note,
  };

  return {
    tile,
    subtitle,
    source: sourceText(content, c.id, item.source),
    buffs: item.ownedModifiers.map(buffText),
    buffActive: item.owned,
    wear,
    exclusive,
    ladder: rungs,
    upgrade,
    maxedNote: item.owned && item.maxed ? t.maxed(item.maxLevel) : null,
    equip: equipOpts,
  };
}

/** Where an item comes from, in words. */
export function sourceText(content: Content, id: string, source: WardrobeItem['source']): string {
  const inGate = content.allPortals.some((p) => p.enabled && p.pool.some((e) => e.itemId === id));
  switch (source) {
    case 'starter':
      return t.source.starter;
    case 'dungeon': {
      const d = content.dungeons.find((x) => x.drops.rare.itemId === id);
      const drop = t.source.dungeon(d?.name ?? '');
      return inGate ? t.source.or(drop, t.source.gate) : drop;
    }
    case 'prestige':
      return t.source.prestige;
    case 'portal':
      return t.source.gate;
    case 'achievement':
      return t.source.achievement;
    case 'track': {
      const step = content.account.rewardTrack.find((r) => r.cosmetics.includes(id));
      return step ? t.source.track(step.level) : t.source.unknown;
    }
    case 'shop':
      return t.source.shop;
    default:
      return t.source.unknown;
  }
}

// ---- set bonuses -----------------------------------------------------------------------------

export interface SetView {
  id: string;
  name: string;
  equipped: number;
  total: number;
  complete: boolean;
  /** "3/7". */
  count: string;
  bonus: string[];
  /** Names of the pieces not equipped globally. */
  missing: string[];
}

export function setViews(state: GameState, content: Content): SetView[] {
  const global = resolveGlobal(content, state.cosmetics.loadout);
  return setBonuses(state, content).map((s) => ({
    id: s.set.id,
    name: s.set.name,
    equipped: s.equipped,
    total: s.total,
    complete: s.complete,
    count: `${s.equipped}/${s.total}`,
    bonus: s.set.modifiers.map(buffText),
    missing: content.cosmetics
      .filter((c) => c.set === s.set.id && global[c.slot].cosmetic.id !== c.id)
      .map((c) => c.name),
  }));
}

/**
 * The tooltip breakdown of one stat's cosmetic bonuses: every owned buff and set bonus that
 * applies to it now, and their sum (percent bonuses add up).
 */
export function buffBreakdown(
  content: Content,
  mods: readonly Modifier[],
  stat: ModifierData['stat'],
): { title: string; rows: Array<[string, string]>; total: [string, string] } {
  const rows: Array<[string, string]> = [];
  let sum = new Decimal(0);
  for (const m of mods) {
    if (m.stat !== stat || (m.source.kind !== 'cosmetic' && m.source.kind !== 'set')) continue;
    rows.push([sourceName(content, m), modifierText(m)]);
    if (m.kind === 'percent') sum = sum.add(m.value);
  }
  const statName = t.stat[stat as keyof typeof t.stat] ?? stat;
  return {
    title: t.breakdownTitle(statName),
    rows,
    total: [t.breakdownTotal, `+${fmt(sum)}%`],
  };
}

/** Toast text after an upgrade. */
export function upgradeToast(
  name: string,
  level: number,
  step: LadderStep,
  maxed: boolean,
): { title: string; detail: string } {
  return {
    title: t.upgraded(name, level),
    detail: maxed ? t.maxedToast : t.stepNote[step],
  };
}

/** The metal of the tier-up flash for an upgrade: higher steps shine brighter. */
export function upgradeMetal(step: LadderStep, maxed: boolean): string {
  if (maxed) return 'prismatic';
  if (step === 'glow' || step === 'gems') return 'gold';
  if (step === 'accent') return 'silver';
  return 'bronze';
}
