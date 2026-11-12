import type { Content } from '../../../../data';
import {
  dungeonPreset,
  loadoutCards,
  presetCost,
  type CardLoadout,
  type GameState,
} from '../../../../game';

/**
 * The teams the fighting loadout remembers per dungeon (DESIGN.md §15 Loadout presets), as rows for
 * the Cards view's Loadouts tab. Pure view-model: the page only draws it.
 */

export interface TeamRow {
  dungeonId: string;
  dungeonName: string;
  /** The dungeon being fought: its team is the one in the slots above. */
  active: boolean;
  /** Names of the remembered cards, main first; an unowned card is left out. */
  cards: string[];
  cost: number;
  cap: number;
  /** The remembered team costs more than the cap allows now (it is flagged, not applied). */
  overCap: boolean;
}

/** One row per dungeon that has a remembered team (or is being fought), in the game's dungeon order. */
export function teamRows(state: GameState, content: Content): TeamRow[] {
  const rows: TeamRow[] = [];
  for (const dungeon of content.dungeons) {
    const active = state.activeDungeonId === dungeon.id;
    const saved: CardLoadout | null = active
      ? state.cards.loadouts.fighting
      : dungeonPreset(state, dungeon.id);
    if (!saved) continue;
    const ids = loadoutCards(saved);
    if (ids.length === 0 && !active) continue;
    const { cost, cap } = presetCost(state, content, saved);
    rows.push({
      dungeonId: dungeon.id,
      dungeonName: dungeon.name,
      active,
      cards: ids.map((id) => content.cardById.get(id)?.name).filter((n): n is string => !!n),
      cost,
      cap,
      overCap: cost > cap,
    });
  }
  return rows;
}
