import type { Content } from '../../../../data';
import { Decimal, forgeStatus, type GameState } from '../../../../game';
import { ITEM_VIEWBOX } from '../../art/items';
import { fmt } from '../../settings/numberFormat';
import { GATHERING_COPY as T } from './copy';

/**
 * View models of the Forge view (UI_RULES.md §2; table update 9b). Display
 * logic only: the game decides every number; this picks and words them. Pure, no DOM, unit tested.
 */

/** Crafts a minute of the forge, "0.8 crafts a minute", from work per second and the recipe's work. */
export function craftsPerMinute(speed: Decimal, work: Decimal): string {
  if (speed.lte(0) || work.lte(0)) return '';
  const n = speed.div(work).mul(60).toNumber();
  const text =
    n >= 10 ? String(Math.round(n)) : n >= 1 ? String(+n.toFixed(1)) : String(+n.toPrecision(2));
  return T.craftsPerMinute(text);
}

/** The forge's recipe as icons: inputs and output as resource ids with amount text. */
export interface ForgeFlow {
  inputs: Array<{ resource: string; amount: string }>;
  output: { resource: string; amount: string };
}

export function forgeFlow(state: GameState, content: Content): ForgeFlow | null {
  const recipe = forgeStatus(state, content)?.recipe;
  if (!recipe) return null;
  return {
    inputs: recipe.inputs.map((i) => ({ resource: i.resource, amount: fmt(i.amount) })),
    output: { resource: recipe.output.resource, amount: fmt(recipe.output.amount) },
  };
}

/** An item's art markup (the `<g>` of `cardItemArt`) wrapped as a drawing of its own. */
export const itemSvg = (markup: string): string =>
  markup
    ? `<svg viewBox="${ITEM_VIEWBOX}" aria-hidden="true" focusable="false">${markup}</svg>`
    : '';
