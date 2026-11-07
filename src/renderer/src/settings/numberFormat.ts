import { Decimal, formatDecimal } from '../../../game';
import { prefs, type NumberStyle } from './prefs';

/**
 * Number styles of the Settings page (DESIGN.md 12.23). Below a million every style matches the
 * game's `formatDecimal` (two decimals under 1,000, then grouped digits). From a million up:
 * suffixes (12.3M, 4.56B … Dc), scientific (1.23e7, the game's own form) or engineering
 * (12.3e6, exponents in steps of three). Past the last suffix, suffixes fall back to scientific.
 */

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/** Mantissa (3 significant digits) and an exponent that is a multiple of three. */
function engineering(value: Decimal): { mantissa: string; exp: number } | null {
  if (value.layer >= 2) return null; // exponent itself is astronomically large
  let exp = Math.floor(value.log10().toNumber());
  exp -= ((exp % 3) + 3) % 3;
  let mant = Number(value.div(Decimal.pow(10, exp)).toNumber().toPrecision(3));
  if (mant >= 1000) {
    mant /= 1000;
    exp += 3;
  }
  if (!Number.isFinite(mant)) return null;
  return { mantissa: String(Number(mant.toPrecision(3))), exp };
}

/** Formats a game number in the given style. Pure; see `fmt` for the player's style. */
export function formatNumber(value: Decimal, style: NumberStyle): string {
  if (style === 'scientific' || value.abs().lt(1e6)) return formatDecimal(value);
  const sign = value.lt(0) ? '-' : '';
  const eng = engineering(value.abs());
  if (!eng) return formatDecimal(value);
  if (style === 'engineering') return `${sign}${eng.mantissa}e${eng.exp}`;
  const suffix = SUFFIXES[eng.exp / 3];
  return suffix === undefined ? formatDecimal(value) : `${sign}${eng.mantissa}${suffix}`;
}

/** Formats a game number in the style the player chose in Settings. */
export function fmt(value: Decimal): string {
  return formatNumber(value, prefs().numbers);
}
