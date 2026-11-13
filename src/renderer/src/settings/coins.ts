import type { Coin, Content } from '../../../data';
import { Decimal } from '../../../game';
import { fmt } from './numberFormat';

/**
 * Coins (DESIGN.md §3 Coins): Money is shown in the biggest coin it fills instead of a long or
 * scientific number: 950 is "950 Copper", 12,400,000 is "12.4 Gold". The coins are data
 * (`coins.json`); past the last coin its count simply keeps growing, in the one short number
 * format ("100k Crown"). Display only: the game counts Money as one number.
 */

export interface CoinAmount {
  coin: Coin;
  /** How many of that coin, as text: whole below ten of the smallest coin's digits, else three
   *  significant digits ("950", "12.4", "1.25"). */
  value: string;
}

/** Float slack: 12.4 × 10 is 123.99999999999999, which must still floor to 124. */
const EPS = 1e-7;

/** Three significant digits, rounded down, without trailing zeros: 1.25, 12.4, 950. */
function threeDigits(n: number): string {
  if (n >= 100) return String(Math.floor(n + EPS));
  if (n >= 10) return String(Math.floor(n * 10 + EPS) / 10);
  return String(Math.floor(n * 100 + EPS) / 100);
}

/** The biggest coin `amount` fills and how many of it. Negative and tiny amounts are Copper. */
export function coinAmount(coins: readonly Coin[], amount: Decimal): CoinAmount {
  const first = coins[0]!;
  if (!amount.gte(1)) return { coin: first, value: threeDigits(Math.max(0, amount.toNumber())) };
  let coin = first;
  for (const c of coins) {
    if (amount.gte(Decimal.pow(10, c.power))) coin = c;
  }
  const count = amount.div(Decimal.pow(10, coin.power));
  // Past the last coin the count outgrows three digits: the short number format takes over.
  if (count.gte(1000)) return { coin, value: fmt(count.floor()) };
  return { coin, value: threeDigits(count.toNumber()) };
}

/** Money as text: "12.4 Gold". */
export function moneyText(content: Content, amount: Decimal): string {
  const { coin, value } = coinAmount(content.coins, amount);
  return `${value} ${coin.name}`;
}

/** Whether a resource is the Money that coins show. */
export const isMoney = (content: Content, resource: string): boolean =>
  resource === content.upgrades.currency;

/**
 * An amount of a resource with its name: Money in coins ("12.4 Gold"), anything else as a
 * number and the resource's name ("1,200 Frost Core").
 */
export function amountText(content: Content, resource: string, amount: Decimal): string {
  if (isMoney(content, resource)) return moneyText(content, amount);
  return `${fmt(amount)} ${content.resourceById.get(resource)?.name ?? resource}`;
}
