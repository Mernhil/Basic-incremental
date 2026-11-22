import type { CosmeticSlot } from './schemas';

/**
 * The vault for the UI look cosmetics (decided 2026-11-22: "lets vault this feature for now").
 * While it is on, the slots below are not offered anywhere (Wardrobe, portals, shard shop, drops'
 * cosmetic, rewards) and a worn one has no effect: every player sees the shell look of
 * `VAULT_TABLE_ID` and the starter of each skin slot. What a save owns or wears stays in the save,
 * so turning this off brings the feature back. Built like `BACKDROP_MOTION` (art/seaSim.ts).
 */
export const UI_LOOKS_VAULTED = true;

/** The cosmetic slots that change the shell or table look or a UI-skin style. */
export const UI_LOOK_SLOTS: readonly CosmeticSlot[] = [
  'table',
  'starlight',
  'sticker',
  'nodes',
  'wardrobe',
];

/** The table shown while the vault is on (a hidden item: Charcoal and Gold). */
export const VAULT_TABLE_ID = 'gold_table';

export function isUiLookSlot(slot: CosmeticSlot): boolean {
  return UI_LOOK_SLOTS.includes(slot);
}
