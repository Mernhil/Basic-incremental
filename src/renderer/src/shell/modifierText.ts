import type { Content } from '../../../data';
import { formatDecimal, type Modifier } from '../../../game';

/** Modifier wording shared by stat tooltips and view models. No DOM, so models can use it. */

const SOURCE_LABELS: Record<Modifier['source']['kind'], string> = {
  cosmetic: 'Owned item',
  set: 'Set bonus',
  skill: 'Skill tree',
  enhancement: 'Card enhancement',
  card: 'Card',
  prestige: 'Prestige',
  achievement: 'Achievement',
  mastery: 'Mastery',
  account: 'Account level', // compile fix (mechanics): reward track cost cap bumps
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

/** A modifier's value as shown in tooltips and previews: "+10%", "+1", "×2". */
export function modifierText(m: Pick<Modifier, 'kind' | 'value'>): string {
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
