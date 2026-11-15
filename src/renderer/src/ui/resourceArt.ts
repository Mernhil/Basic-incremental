import type { Content } from '../../../data';
import { Decimal, gemMastery, type GameState } from '../../../game';
import { gemCoin, svg } from '../art/gems';
import { coinAmount, isMoney } from '../settings/coins';
import { iconMarkup, moneyCoinArt, resourceIconId } from './resourceIcons';

/**
 * A resource's own art as markup, for prices and "You hold" strips: a gem's coin at its mastery
 * tier, Money as the coin its amount fills ("1.03 Silver" shows the Silver coin), anything else its
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
  if (r.gem) return svg(gemCoin(r.gem, Math.max(0, gemMastery(state, content, resource).tier)));
  if (isMoney(content, resource)) return moneyCoinArt(coinAmount(content.coins, amount).coin.id);
  return iconMarkup(resourceIconId(r)) ?? '';
}
