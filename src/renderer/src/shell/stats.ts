import type { Content } from '../../../data';
import { formatDecimal, type Modifier, type StatResult } from '../../../game';
import { COPY } from '../copy';
import { tipTable } from './tooltip';

const SOURCE_LABELS: Record<Modifier['source']['kind'], string> = {
  cosmetic: 'Owned item',
  set: 'Set bonus',
  skill: 'Skill tree',
  enhancement: 'Card enhancement',
  card: 'Card',
  prestige: 'Prestige',
  achievement: 'Achievement',
  mastery: 'Mastery',
};

/** "Gilded Plate", "Gilded Tradition set", or a generic label for sources without a name yet. */
export function sourceName(content: Content, m: Modifier): string {
  const { kind, id } = m.source;
  if (kind === 'cosmetic') return content.cosmeticById.get(id)?.name ?? SOURCE_LABELS[kind];
  if (kind === 'set') {
    const set = content.setById.get(id);
    return set ? `${set.name} set` : SOURCE_LABELS[kind];
  }
  if (kind === 'card') return content.cardById.get(id)?.name ?? SOURCE_LABELS[kind];
  return SOURCE_LABELS[kind];
}

export function modifierText(m: Modifier): string {
  const v = formatDecimal(m.value);
  switch (m.kind) {
    case 'flat':
      return m.value.gte(0) ? `+${v}` : v;
    case 'percent':
      return m.value.gte(0) ? `+${v}%` : `${v}%`;
    case 'mult':
      return `×${v}`;
    case 'set':
      return `= ${v}`;
    case 'min':
      return `at least ${v}`;
    case 'max':
      return `at most ${v}`;
  }
}

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
