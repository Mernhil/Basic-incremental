import type { Content } from '../../../data';
import { formatDecimal, type StatResult } from '../../../game';
import { COPY } from '../copy';
import { modifierText, sourceName } from './modifierText';
import { tipTable } from './tooltip';

export { modifierText, sourceName };

/** Tooltip body for a stat: base value, every modifier that applied, and the total. */
export function statTip(
  content: Content,
  title: string,
  result: StatResult,
  unit = '',
): HTMLElement {
  const rows: Array<[string, string]> = [[COPY.home.base, formatDecimal(result.base) + unit]];
  for (const m of result.applied) rows.push([sourceName(content, m), modifierText(m)]);
  return tipTable(title, rows, [COPY.home.total, formatDecimal(result.value) + unit]);
}
