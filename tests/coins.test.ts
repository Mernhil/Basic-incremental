import { describe, expect, it } from 'vitest';
import { Decimal } from '../src/game';
import { amountText, coinAmount, isMoney, moneyText } from '../src/renderer/src/settings/coins';
import { content } from './helpers';

const coin = (n: number | string): string => {
  const { coin: c, value } = coinAmount(content.coins, new Decimal(n));
  return `${value} ${c.id}`;
};

describe('coins (DESIGN.md §3 Coins)', () => {
  it('starts at power 0 and every coin is worth more than the one before', () => {
    expect(content.coins[0]!.power).toBe(0);
    for (let i = 1; i < content.coins.length; i++) {
      expect(content.coins[i]!.power).toBeGreaterThan(content.coins[i - 1]!.power);
    }
  });

  it('shows Money in the biggest coin it fills', () => {
    expect(coin(0)).toBe('0 copper');
    expect(coin(950)).toBe('950 copper');
    expect(coin(999)).toBe('999 copper');
    expect(coin(1000)).toBe('1 silver');
    expect(coin(12_400)).toBe('12.4 silver');
    expect(coin(1_250_000)).toBe('1.25 gold');
    expect(coin(10_000_000_000)).toBe('10 diamond');
  });

  it('rounds down, so a price never reads as cheaper than it is paid', () => {
    expect(coin(1999)).toBe('1.99 silver');
    expect(coin(999_999)).toBe('999 silver');
  });

  it('keeps counting in the last coin past its thousand', () => {
    const last = content.coins[content.coins.length - 1]!;
    const { coin: c, value } = coinAmount(content.coins, Decimal.pow(10, last.power + 5));
    expect(c.id).toBe(last.id);
    // the count goes on in the one short format, never an exponent (UI_RULES §2 Readable numbers)
    expect(value).toBe('100k');
  });

  it('treats negative and fractional amounts as the first coin', () => {
    expect(coin(-5)).toBe('0 copper');
    expect(coin(0.5)).toBe('0.5 copper');
  });

  it('names Money by its coin and other resources by their name', () => {
    const money = content.upgrades.currency;
    expect(isMoney(content, money)).toBe(true);
    expect(moneyText(content, new Decimal(12_400_000))).toBe('12.4 Gold');
    expect(amountText(content, money, new Decimal(500))).toBe('500 Copper');
    const other = content.resources.find((r) => r.id !== money)!;
    expect(isMoney(content, other.id)).toBe(false);
    expect(amountText(content, other.id, new Decimal(12))).toBe(`12 ${other.name}`);
  });
});
