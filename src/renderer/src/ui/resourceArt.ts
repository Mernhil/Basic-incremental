import type { Content } from '../../../data';
import { Decimal, type GameState } from '../../../game';
import { coinAmount, isMoney } from '../settings/coins';
import { iconMarkup, keptIconMarkup, moneyCoinArt, resourceIconId } from './resourceIcons';

/**
 * A resource's own art as markup, for prices and "You hold" strips: a kept icon (gems, materials, scrolls, Starlight), Money as the coin its amount fills ("1.03 Silver" shows the Silver coin), anything else its
 * icon. Empty when the resource has no art.
 */
export function resourceArt(
  content: Content,
  state: GameState,
  resource: string,
  amount: Decimal = new Decimal(0),
): string {
  const r = content.resourceById.get(resource);
  if (!r) return '';
  const kept = keptIconMarkup(resource);
  if (kept) return kept;
  if (isMoney(content, resource)) return moneyCoinArt(coinAmount(content.coins, amount).coin.id);
  return iconMarkup(resourceIconId(r)) ?? '';
}
