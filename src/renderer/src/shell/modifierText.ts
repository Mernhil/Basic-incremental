import { formatDecimal, type Modifier } from '../../../game';

/** A modifier's value as shown in tooltips and previews: "+10%", "+1", "×2". No DOM. */
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
