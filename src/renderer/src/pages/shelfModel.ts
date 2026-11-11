import type { Content } from '../../../data';
import { upgradeShelf, type GameState, type Modifier, type ShelfItem } from '../../../game';
import { COPY } from '../copy';
import { fmt } from '../settings/numberFormat';
import { amountText } from '../settings/coins';

/**
 * Upgrade shelf view models (DESIGN.md §4, §11): the chips of the shelf panel. Hidden upgrades
 * are never returned. Display logic only; status, cost, previews and unlock text come from game.
 */

/** Which page shows an upgrade: Production shows the rest, Dungeons the fighting and drop ones. */
export type ShelfScope = 'production' | 'fighting';

export interface ShelfChip {
  id: string;
  name: string;
  /** The effect as a sentence ("Oak output x2"). */
  effect: string;
  status: 'available' | 'owned';
  /** "1,500 Money". */
  price: string;
  /** Available and the Money is there (the chip glows). */
  affordable: boolean;
  permanent: boolean;
  /** Why it appeared ("Oak level 10"), shown on owned chips. */
  unlockText: string;
  /** Before / after of the effect when the game has a simple one, else empty. */
  preview: string;
}

const resName = (content: Content, id: string): string => content.resourceById.get(id)?.name ?? id;

/** True for upgrades that touch fighting, damage or dungeon drops. */
export function isFightingUpgrade(item: Pick<ShelfItem, 'effects'>): boolean {
  return item.effects.some(
    (e) =>
      e.scope?.job === 'fighting' || e.stat.startsWith('drops.') || e.stat.startsWith('combat.'),
  );
}

function previewText(item: ShelfItem, content: Content): string {
  const p = item.preview;
  if (!p) return '';
  if (p.kind === 'damage') return COPY.shelf.damage(fmt(p.before), fmt(p.after));
  return COPY.shelf.rate(resName(content, p.resource), fmt(p.before), fmt(p.after));
}

/**
 * The chips to show: available then owned, never hidden. Available ones come affordable-first;
 * content order breaks ties. `scope` null returns every page's upgrades.
 */
export function shelfChips(
  state: GameState,
  content: Content,
  mods: readonly Modifier[],
  scope: ShelfScope | null,
): ShelfChip[] {
  const items = upgradeShelf(state, content, mods).filter(
    (i) =>
      i.status !== 'hidden' && (scope === null || isFightingUpgrade(i) === (scope === 'fighting')),
  );
  const chips = items.map<ShelfChip>((i) => ({
    id: i.id,
    name: i.name,
    effect: i.description,
    status: i.status === 'owned' ? 'owned' : 'available',
    price: amountText(content, i.cost.resource, i.cost.amount),
    affordable: i.canAfford,
    permanent: i.permanent,
    unlockText: i.unlockText,
    preview: previewText(i, content),
  }));
  const rank = (c: ShelfChip): number => (c.status === 'owned' ? 2 : c.affordable ? 0 : 1);
  return chips
    .map((c, i) => [c, i] as const)
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1])
    .map(([c]) => c);
}
