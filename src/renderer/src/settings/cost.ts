import type { Content } from '../../../data';
import type { Decimal } from '../../../game';
import { amountText, coinAmount, isMoney } from './coins';
import { fmt } from './numberFormat';

/**
 * A cost is shown ONCE: the sprite of the material and the amount ("5.12" beside the Silver
 * coin), never a second copy in words (UI_RULES: buttons and costs). A material with no sprite
 * yet keeps its name in words, so the cost stays readable; the name is always in the tooltip or
 * the accessible label. Pure (no DOM): the markup is `ui/costMarkup.ts`.
 */

export interface CostPart {
  resource: string;
  amount: Decimal;
}

/**
 * Whether the resource has a sprite to draw its cost with: gems (their coin), Money (its coin),
 * the scrolls and Starlight (their icons). Materials (Cores, Dust, Shards, Sigils) have none yet.
 * Keep in step with `ICON_MARKUP` in ui/resourceIcons.ts: a material that gets an icon there
 * becomes a sprite cost here by adding its kind.
 */
export function hasCostArt(content: Content, resource: string): boolean {
  const r = content.resourceById.get(resource);
  if (!r) return false;
  if (r.gem || isMoney(content, resource)) return true;
  return r.kind === 'scroll' || r.kind === 'prestige' || r.kind === 'currency';
}

/** The amount that sits beside the sprite: "5.12" for Money, "1,200" for the rest. */
export function costAmount(content: Content, resource: string, amount: Decimal): string {
  return isMoney(content, resource) ? coinAmount(content.coins, amount).value : fmt(amount);
}

/**
 * The amount of a cost: the number alone when the resource has a sprite, the number and the
 * name ("40 Glimmer Dust") when it has none.
 */
export function costText(content: Content, resource: string, amount: Decimal): string {
  return hasCostArt(content, resource)
    ? costAmount(content, resource, amount)
    : amountText(content, resource, amount);
}

/** The cost in words for a tooltip or an accessible label ("5.12 Silver"). */
export const costLabel = amountText;
