import type { Content, ShopItem } from '../data';
import type { Modifier } from './modifiers';
import type { GameState } from './state';

/** The id arena fights use where a dungeon id goes (modifier scopes, the element circle). */
export const ARENA_ID = 'arena';

/** Every shop item of the arena and raid shops. */
export function allShopItems(
  content: Content,
): { item: ShopItem; kind: 'arena' | 'raid'; boss?: string; season?: number }[] {
  const out: { item: ShopItem; kind: 'arena' | 'raid'; boss?: string; season?: number }[] = [];
  for (const s of content.arena.shop.seasons)
    for (const item of s.items) out.push({ item, kind: 'arena', season: s.season });
  for (const [boss, shop] of Object.entries(content.arena.raid.shops))
    for (const item of shop.items) out.push({ item, kind: 'raid', boss });
  return out;
}

const itemByCard = new WeakMap<Content, Map<string, ShopItem & { kind: 'arena' | 'raid' }>>();
function shopItemOf(
  content: Content,
  cardId: string,
): (ShopItem & { kind: 'arena' | 'raid' }) | undefined {
  let m = itemByCard.get(content);
  if (!m) {
    m = new Map();
    for (const e of allShopItems(content)) m.set(e.item.card, { ...e.item, kind: e.kind });
    itemByCard.set(content, m);
  }
  return m.get(cardId);
}

/**
 * The perks of the shop Heirlooms in the fighting loadout as modifiers (source `shop`): an arena
 * perk is scoped to the arena, a raid perk to every raid boss, so they count nowhere else. A perk
 * with a `vs` tag is left out unless `rivalTags` is given and has it (and then only those are returned
 * when `only` is `vs`, so the fight can add them on top of `collectModifiers`).
 */
export function shopPerkModifiers(
  state: GameState,
  content: Content,
  rivalTags?: readonly string[],
  only?: 'vs',
): Modifier[] {
  const out: Modifier[] = [];
  for (const id of state.cards.loadouts.fighting.slots) {
    if (id === null || !state.cards.owned[id]) continue;
    const item = shopItemOf(content, id);
    const perk = item?.perk;
    if (!item || !perk) continue;
    if (perk.vs !== undefined) {
      if (!rivalTags?.includes(perk.vs)) continue;
    } else if (only === 'vs') continue;
    const scopes = item.kind === 'arena' ? [ARENA_ID] : content.raids.bosses.map((b) => b.id);
    for (const dungeon of scopes)
      for (const m of perk.modifiers) {
        out.push({
          stat: m.stat,
          kind: m.kind,
          value: m.value,
          scope: { dungeon },
          source: { kind: 'shop', id },
        });
      }
  }
  return out;
}
