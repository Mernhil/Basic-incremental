import type { Content } from '../../../../data';
import type { GameState, Modifier } from '../../../../game';
import { amountText } from '../../settings/coins';
import { shelfChips, type ShelfChip } from '../../pages/shelfModel';

/**
 * The Upgrades view's board (UI_RULES §2 "The Upgrades view"): every one-time upgrade the shelf
 * shows, split into the two panels the view has, This run (reset by an Ascension) and Permanent
 * (kept for good), plus the ready count for the title bar and the pile hint and the lifetime Money
 * line. Display logic only: status, price and preview come from `shelfChips`.
 */

export interface UpgradeTile {
  id: string;
  name: string;
  effect: string;
  /** "1,500 Money" in the coin the price is shown in. */
  price: string;
  /** Before and after of the effect when the game has a simple one, else empty. */
  preview: string;
  status: 'available' | 'owned';
  /** Available and the price is in hand (the tile is gold and a click buys it). */
  affordable: boolean;
}

export interface UpgradeBoard {
  run: UpgradeTile[];
  permanent: UpgradeTile[];
  /** Upgrades that can be bought right now. */
  ready: number;
  /** Lifetime Money earned, in coins. */
  lifetime: string;
}

const tile = (c: ShelfChip): UpgradeTile => ({
  id: c.id,
  name: c.name,
  effect: c.effect,
  price: c.price,
  preview: c.preview,
  status: c.status,
  affordable: c.affordable,
});

export function upgradeBoard(
  state: GameState,
  content: Content,
  mods: readonly Modifier[],
): UpgradeBoard {
  const chips = shelfChips(state, content, mods, null);
  return {
    run: chips.filter((c) => !c.permanent).map(tile),
    permanent: chips.filter((c) => c.permanent).map(tile),
    ready: chips.filter((c) => c.status === 'available' && c.affordable).length,
    lifetime: amountText(content, content.upgrades.currency, state.upgrades.moneyEarned),
  };
}
