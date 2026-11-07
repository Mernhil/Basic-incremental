import type { CosmeticGain } from './portals';
import type { GameState } from './state';

/**
 * Adds one copy of a cosmetic (mutates `state`, a fresh copy owned by the caller): a new item
 * at level 1, or a copy that feeds its upgrade levels (DESIGN.md 7). Used by the portals,
 * prestige rewards and achievements.
 */
export function grantCosmetic(state: GameState, cosmeticId: string): CosmeticGain {
  const owned = state.cosmetics.owned[cosmeticId];
  if (!owned) {
    state.cosmetics.owned[cosmeticId] = { level: 1, copies: 0 };
    return { kind: 'new' };
  }
  const copies = owned.copies + 1;
  state.cosmetics.owned[cosmeticId] = { ...owned, copies };
  return { kind: 'copy', copies };
}
