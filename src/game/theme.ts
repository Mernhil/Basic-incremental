import {
  CARD_SLOTS,
  COSMETIC_SLOTS,
  MAX_STARS,
  RANK_TIERS,
  type CardSlot,
  type Content,
  type Cosmetic,
  type CosmeticSlot,
  type Rank,
  type Rarity,
} from '../data';

/**
 * The theming layer, as pure logic: which cosmetic is shown where, at which level, and what
 * CSS tokens / recipes / effects that produces. The renderer only applies the result.
 */

export interface Equipped {
  id: string;
  /** 1-based upgrade level. */
  level: number;
}

export interface CosmeticLoadout {
  /** Global choice per slot. A missing slot shows the starter item. */
  slots: Partial<Record<CosmeticSlot, Equipped>>;
  /** Per-card choices for card slots. Card-exclusive items can only be equipped here. */
  cards: Record<string, Partial<Record<CardSlot, Equipped>>>;
}

export interface Visual {
  tokens: Record<string, string>;
  recipes: string[];
  effects?: { fighting: string; mining: string; logging: string };
  effect?: string;
}

export interface ResolvedSlot {
  slot: CosmeticSlot;
  cosmetic: Cosmetic;
  level: number;
  visual: Visual;
  /**
   * For card slots: false when the chosen item could not be worn (card rank too low) and the
   * starter is shown instead. `blocked` is the item that was not worn.
   */
  worn: boolean;
  blocked?: Cosmetic;
}

export class ThemeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ThemeError';
  }
}

export function emptyLoadout(): CosmeticLoadout {
  return { slots: {}, cards: {} };
}

// ---- ranks ----------------------------------------------------------------------------------

/** Orders ranks: Bronze 1 < ... < Bronze 6 < Silver 1 < ... < Prismatic 6. */
export function rankValue(rank: Rank): number {
  return RANK_TIERS.indexOf(rank.tier) * MAX_STARS + rank.stars;
}

export function meetsRank(rank: Rank, minimum: Rank): boolean {
  return rankValue(rank) >= rankValue(minimum);
}

/** The minimum rank a card needs to wear this item (null = always wearable). */
export function wearRequirement(content: Content, cosmetic: Cosmetic): Rank | null {
  if (cosmetic.starter) return null;
  if (cosmetic.exclusiveCard) return content.wearRules.exclusive;
  if (cosmetic.slot === 'border' || cosmetic.slot === 'finish') {
    return content.wearRules[cosmetic.slot];
  }
  return null;
}

// ---- levels ---------------------------------------------------------------------------------

/**
 * Highest upgrade level of an item (DESIGN.md 11.1): by rarity from cosmeticRules.json; starter
 * items keep their own level count. Levels above the drawn ones show the top drawn level until
 * its art arrives.
 */
export function cosmeticMaxLevel(content: Content, cosmetic: Cosmetic): number {
  if (cosmetic.starter) return cosmetic.levels.length;
  return content.cosmeticRules.maxLevel[cosmetic.rarity];
}

/** Merges levels 1..level: later tokens win, recipes accumulate, effects are replaced. */
export function levelVisual(cosmetic: Cosmetic, level: number): Visual {
  const visual: Visual = { tokens: {}, recipes: [] };
  for (const step of cosmetic.levels.slice(0, Math.max(1, level))) {
    Object.assign(visual.tokens, step.tokens);
    for (const recipe of step.recipes) {
      if (!visual.recipes.includes(recipe)) visual.recipes.push(recipe);
    }
    if (step.effects) visual.effects = step.effects;
    if (step.effect) visual.effect = step.effect;
  }
  return visual;
}

/**
 * The visual for an item in its slot: the starter's tokens fill in anything the item does not set,
 * so a new item only has to list what it changes. Recipes and effects are not inherited.
 */
export function slotVisual(content: Content, cosmetic: Cosmetic, level: number): Visual {
  const own = levelVisual(cosmetic, level);
  const starter = content.starterBySlot[cosmetic.slot];
  if (starter.id === cosmetic.id) return own;
  return { ...own, tokens: { ...levelVisual(starter, 1).tokens, ...own.tokens } };
}

// ---- equipping ------------------------------------------------------------------------------

function isCardSlot(slot: CosmeticSlot): slot is CardSlot {
  return (CARD_SLOTS as readonly string[]).includes(slot);
}

/** Returns why this equip is not allowed, or null if it is. */
export function equipProblem(
  content: Content,
  slot: CosmeticSlot,
  equipped: Equipped,
  cardId?: string,
): string | null {
  const cosmetic = content.cosmeticById.get(equipped.id);
  if (!cosmetic) return `Unknown cosmetic "${equipped.id}".`;
  if (cosmetic.slot !== slot) return `"${cosmetic.name}" is a ${cosmetic.slot} item, not ${slot}.`;
  if (!Number.isInteger(equipped.level) || equipped.level < 1) {
    return `Level must be 1 or more.`;
  }
  const max = cosmeticMaxLevel(content, cosmetic);
  if (equipped.level > max) return `"${cosmetic.name}" only has ${max} level(s).`;
  if (cardId !== undefined) {
    if (!isCardSlot(slot)) return `${slot} is not a card slot.`;
    if (!content.cardById.has(cardId)) return `Unknown card "${cardId}".`;
    if (cosmetic.exclusiveCard && cosmetic.exclusiveCard !== cardId) {
      return `"${cosmetic.name}" is exclusive to another card.`;
    }
  } else if (cosmetic.exclusiveCard) {
    return `"${cosmetic.name}" is exclusive to one card and cannot be equipped globally.`;
  }
  return null;
}

/** Returns a new loadout with the item equipped (globally, or on one card). Throws ThemeError. */
export function equip(
  content: Content,
  loadout: CosmeticLoadout,
  slot: CosmeticSlot,
  equipped: Equipped,
  cardId?: string,
): CosmeticLoadout {
  const problem = equipProblem(content, slot, equipped, cardId);
  if (problem) throw new ThemeError(problem);
  if (cardId === undefined) {
    return { ...loadout, slots: { ...loadout.slots, [slot]: { ...equipped } } };
  }
  return {
    ...loadout,
    cards: {
      ...loadout.cards,
      [cardId]: { ...loadout.cards[cardId], [slot]: { ...equipped } },
    },
  };
}

/** Removes a per-card choice so the card follows the global slot again. */
export function unequipCard(
  loadout: CosmeticLoadout,
  cardId: string,
  slot: CardSlot,
): CosmeticLoadout {
  const current = { ...loadout.cards[cardId] };
  delete current[slot];
  const cards = { ...loadout.cards, [cardId]: current };
  if (Object.keys(current).length === 0) delete cards[cardId];
  return { ...loadout, cards };
}

/** Drops anything invalid (unknown ids, wrong slots, bad levels). Used when loading saves. */
export function sanitizeLoadout(content: Content, loadout: CosmeticLoadout): CosmeticLoadout {
  const clean = emptyLoadout();
  for (const slot of COSMETIC_SLOTS) {
    const eq = loadout.slots[slot];
    if (eq && !equipProblem(content, slot, eq)) clean.slots[slot] = { ...eq };
  }
  for (const [cardId, slots] of Object.entries(loadout.cards)) {
    for (const slot of CARD_SLOTS) {
      const eq = slots[slot];
      if (eq && !equipProblem(content, slot, eq, cardId)) {
        clean.cards[cardId] = { ...clean.cards[cardId], [slot]: { ...eq } };
      }
    }
  }
  return clean;
}

// ---- resolving ------------------------------------------------------------------------------

function resolveEquipped(content: Content, slot: CosmeticSlot, eq: Equipped | undefined) {
  const starter = content.starterBySlot[slot];
  const cosmetic = (eq && content.cosmeticById.get(eq.id)) || starter;
  const level =
    cosmetic === starter ? 1 : Math.min(eq?.level ?? 1, cosmeticMaxLevel(content, cosmetic));
  return { cosmetic, level };
}

/** Every slot as chosen globally (card slots here are the default for cards). */
export function resolveGlobal(
  content: Content,
  loadout: CosmeticLoadout,
): Record<CosmeticSlot, ResolvedSlot> {
  const out = {} as Record<CosmeticSlot, ResolvedSlot>;
  for (const slot of COSMETIC_SLOTS) {
    const { cosmetic, level } = resolveEquipped(content, slot, loadout.slots[slot]);
    out[slot] = { slot, cosmetic, level, visual: slotVisual(content, cosmetic, level), worn: true };
  }
  return out;
}

export interface CardContext {
  id: string;
  rank: Rank;
  rarity: Rarity;
}

export interface ResolvedCard {
  slots: Record<CardSlot, ResolvedSlot>;
  /** CSS custom properties for this card: card-slot tokens plus rarity tokens. */
  vars: Record<string, string>;
  /** Recipe class names for this card (card slots and rarity). */
  recipes: string[];
}

/**
 * What one card shows. Per card: its own choice for a slot wins over the global one; then the
 * item is only worn if the card's rank meets the wear rule, otherwise the starter is shown.
 */
export function resolveCard(
  content: Content,
  loadout: CosmeticLoadout,
  card: CardContext,
): ResolvedCard {
  const slots = {} as Record<CardSlot, ResolvedSlot>;
  const vars: Record<string, string> = {};
  const recipes: string[] = [];

  for (const slot of CARD_SLOTS) {
    const chosen = loadout.cards[card.id]?.[slot] ?? loadout.slots[slot];
    let { cosmetic, level } = resolveEquipped(content, slot, chosen);
    let worn = true;
    let blocked: Cosmetic | undefined;
    const needs = wearRequirement(content, cosmetic);
    const wrongCard = cosmetic.exclusiveCard !== null && cosmetic.exclusiveCard !== card.id;
    if (wrongCard || (needs && !meetsRank(card.rank, needs))) {
      blocked = cosmetic;
      worn = false;
      cosmetic = content.starterBySlot[slot];
      level = 1;
    }
    const visual = slotVisual(content, cosmetic, level);
    slots[slot] = { slot, cosmetic, level, visual, worn, ...(blocked ? { blocked } : {}) };
    Object.assign(vars, cssVars(visual.tokens));
    recipes.push(...visual.recipes);
  }

  const rarity = content.rarityById.get(card.rarity);
  if (rarity) {
    Object.assign(vars, cssVars(rarity.tokens, 'rarity-'));
    recipes.push(...rarity.recipes);
  }
  return { slots, vars, recipes: [...new Set(recipes)] };
}

/** CSS custom properties for the global (non-card) look: table, numbers, ticks, attack, cursor. */
export function globalVars(resolved: Record<CosmeticSlot, ResolvedSlot>): {
  vars: Record<string, string>;
  recipes: string[];
} {
  const vars: Record<string, string> = {};
  const recipes: string[] = [];
  for (const slot of COSMETIC_SLOTS) {
    if (isCardSlot(slot)) continue;
    Object.assign(vars, cssVars(resolved[slot].visual.tokens));
    recipes.push(...resolved[slot].visual.recipes);
  }
  return { vars, recipes };
}

/** Token keys become CSS custom properties: `plate-bg` -> `--bi-plate-bg`. */
export function cssVars(tokens: Record<string, string>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tokens)) out[`--bi-${prefix}${key}`] = value;
  return out;
}

// ---- sets -----------------------------------------------------------------------------------

export interface SetStatus {
  set: string;
  equipped: number;
  total: number;
  complete: boolean;
}

/** How much of each set is equipped globally. A set is complete when all its items are. */
export function detectSets(content: Content, loadout: CosmeticLoadout): SetStatus[] {
  const resolved = resolveGlobal(content, loadout);
  const sets = new Map<string, Cosmetic[]>();
  for (const c of content.cosmetics) {
    if (c.set) sets.set(c.set, [...(sets.get(c.set) ?? []), c]);
  }
  return [...sets].map(([set, items]) => {
    const equipped = items.filter((item) => resolved[item.slot].cosmetic.id === item.id).length;
    return { set, equipped, total: items.length, complete: equipped === items.length };
  });
}

// ---- registry check ---------------------------------------------------------------------------

/**
 * Every recipe and effect named in the data must exist in the renderer. The renderer calls this
 * at startup with what it implements, so a typo in data fails loudly instead of silently.
 */
export function missingVisuals(
  content: Content,
  known: { recipes: ReadonlySet<string>; effects: ReadonlySet<string> },
): string[] {
  const problems: string[] = [];
  const checkRecipes = (where: string, recipes: string[]) => {
    for (const r of recipes) {
      if (!known.recipes.has(r)) problems.push(`${where}: unknown recipe "${r}"`);
    }
  };
  for (const c of content.cosmetics) {
    c.levels.forEach((level, i) => {
      const where = `cosmetic "${c.id}" level ${i + 1}`;
      checkRecipes(where, level.recipes);
      const effects = [
        ...(level.effects ? Object.values(level.effects) : []),
        ...(level.effect ? [level.effect] : []),
      ];
      for (const e of effects) {
        if (!known.effects.has(e)) problems.push(`${where}: unknown effect "${e}"`);
      }
    });
  }
  for (const r of content.rarities) checkRecipes(`rarity "${r.id}"`, r.recipes);
  return problems;
}
