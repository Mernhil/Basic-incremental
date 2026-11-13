import { formatShort, type DecimalSource } from '../../../game';

/**
 * The game's one number format (UI_RULES §2 Readable numbers): whole digits
 * below 10,000 ("2003"), then three significant digits and k, M, B, T, Qa, Qi ("20k", "1.25M",
 * "105B", "3T"); below 10 small fractions keep two decimals ("0.75"). There is no setting and no
 * scientific or engineering notation. Money in coins goes through `settings/coins.ts`, whose
 * counts use the same digits.
 */
export function fmt(value: DecimalSource): string {
  return formatShort(value);
}
