import Decimal from 'break_eternity.js';
import type { DecimalSource } from 'break_eternity.js';

/**
 * All game numbers use break_eternity.js. Import Decimal from here, never from the
 * package directly, so there is a single place to adjust if the library changes.
 */
export { Decimal };
export type { DecimalSource };

const DECIMAL_PATTERN = /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

/** True for strings like "100", "1.5e300", "-2". Note `new Decimal('abc')` is 0, not an error. */
export function isDecimalString(value: string): boolean {
  if (!DECIMAL_PATTERN.test(value.trim())) return false;
  const d = new Decimal(value);
  return !d.isNan() && d.isFinite();
}

/** Lossless text form used in save files. */
export function decimalToString(value: Decimal): string {
  return value.toString();
}

export function decimalFromString(value: string): Decimal {
  if (!isDecimalString(value)) throw new Error(`Invalid number string: "${value}"`);
  return new Decimal(value);
}

/** Compare with a relative tolerance; break_eternity is not exact for huge values. */
export function approxEq(a: DecimalSource, b: DecimalSource, relTol = 1e-9): boolean {
  const x = new Decimal(a);
  const y = new Decimal(b);
  if (x.eq(y)) return true;
  const diff = x.sub(y).abs();
  const scale = Decimal.max(x.abs(), y.abs());
  return diff.lte(scale.mul(relTol));
}

/** Below this a number is written in whole digits ("2003"); from it on, with a suffix ("10k"). */
export const SHORT_FROM = 10_000;

/** One suffix per power of a thousand: k, M, B, T, then the named ones past a trillion. */
export const SUFFIXES: readonly string[] = [
  '',
  'k',
  'M',
  'B',
  'T',
  'Qa',
  'Qi',
  'Sx',
  'Sp',
  'Oc',
  'No',
  'Dc',
  'UDc',
  'DDc',
  'TDc',
  'QaDc',
  'QiDc',
  'SxDc',
  'SpDc',
  'OcDc',
  'NoDc',
  'Vg',
];

/**
 * The one short number format of the game (UI_RULES §2 Readable numbers; user, 2026-11-12:
 * "12B 3T 105B 18M 20k 2003"). Every number that is not Money in coins is written with it, on
 * every screen, tooltip and pixel tag and in the sim's reports. No scientific or engineering
 * notation, ever:
 *
 * - below 10,000 the whole digits ("2003", "59"), and below 10 up to two decimals for small
 *   fractions ("0.75", "4.5");
 * - from 10,000 three significant digits and a suffix, without trailing zeros: 20k, 1.25M, 18M,
 *   105B, 3T, then Qa, Qi and the next named suffixes; past the last one its count grows;
 * - always rounded toward zero, so an amount never reads as more than is there.
 */
export function formatShort(value: DecimalSource): string {
  const d = new Decimal(value);
  if (d.isNan()) return '0';
  if (d.lt(0)) return `-${formatShort(d.neg())}`;
  if (!d.isFinite() || d.layer >= 2) return '∞';
  if (d.lt(10)) return trimZeros((Math.floor(d.toNumber() * 100 + 1e-7) / 100).toFixed(2));
  if (d.lt(SHORT_FROM)) return String(Math.floor(d.toNumber() + 1e-7));
  const group = Math.floor(Math.floor(d.log10().toNumber() + 1e-9) / 3);
  const last = SUFFIXES.length - 1;
  // Far past anything the game reaches: a count of the last suffix up to a million of it.
  if (group > last + 2) return `∞`;
  if (group > last) {
    const count = d.div(Decimal.pow(1000, last)).floor().toNumber();
    return `${count.toLocaleString('en-US')}${SUFFIXES[last]}`;
  }
  const scaled = d.div(Decimal.pow(1000, group)).toNumber(); // 1 <= scaled < 1000
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  const step = Math.pow(10, digits);
  const cut = Math.floor(scaled * step + 1e-7) / step;
  return `${trimZeros(cut.toFixed(digits))}${SUFFIXES[group]}`;
}

function trimZeros(text: string): string {
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
}
