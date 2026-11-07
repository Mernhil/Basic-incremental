import type { Content } from '../../../data';
import { type Modifier } from '../../../game';
import { fmt } from '../settings/numberFormat';

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

/** What a stat is called in effect lines ("+5% logging production"). */
const STAT_NAMES: Partial<Record<Modifier['stat'], string>> = {
  'production.rate': 'production',
  'production.levelBonus': 'output per mine level',
  'production.capacity': 'plots and slots',
  'combat.damage': 'damage',
  'combat.health': 'loadout health',
  'combat.defence': 'damage blocked',
  'combat.critChance': 'crit chance',
  'combat.critDamage': 'crit damage',
  'drops.rareChance': 'rare drop chance',
  'drops.portalMultiplier': 'sigil drops',
  'drops.portalAmount': 'sigils per kill',
  'drops.materialChance': 'Core drop chance',
  'summon.pityThreshold': 'pulls to pity',
  'offline.capHours': 'offline cap',
  'xp.account': 'account XP',
  'xp.card': 'card XP',
  'loadout.costCap': 'loadout cost cap',
  'cost.multiplier': 'prices',
  'cost.growth': 'price growth',
  'burst.fill': 'burst gauge fill',
  'burst.power': 'burst power',
  'trial.reward': 'Glimmer Trial rewards',
  'prestige.gain': 'Starlight from ascensions',
};

/**
 * Stats stored as fractions or flat points that read better in another unit: crit chance 0.01
 * reads "+1%", crit damage 0.1 reads "+10%", defence 2 reads "+2%", offline 1 reads "+1 h".
 */
function effectValue(m: Pick<Modifier, 'stat' | 'kind' | 'value'>): string {
  if (m.kind === 'flat') {
    const sign = m.value.gte(0) ? '+' : '−';
    const abs = m.value.abs();
    if (m.stat === 'combat.critChance' || m.stat === 'combat.critDamage') {
      return `${sign}${formatDecimal(abs.mul(100))}%`;
    }
    if (m.stat === 'combat.defence') return `${sign}${formatDecimal(abs)}%`;
    if (m.stat === 'offline.capHours') return `${sign}${formatDecimal(abs)} h`;
    if (m.stat === 'burst.power') return `${sign}${formatDecimal(abs)} s`;
    return `${sign}${formatDecimal(abs)}`;
  }
  if (m.kind === 'percent' && m.value.lt(0)) return `−${formatDecimal(m.value.abs())}%`;
  return modifierText(m);
}

/**
 * One effect line for skill nodes, enhancements and rewards: "+5% logging production",
 * "+1% crit chance", "−2 pulls to pity". The job scope names the job.
 */
export function effectText(m: Pick<Modifier, 'stat' | 'kind' | 'value' | 'scope'>): string {
  const name = STAT_NAMES[m.stat] ?? m.stat;
  const job = m.scope?.job;
  // burst power on a production job is seconds of that job's output harvested at once
  const what =
    m.stat === 'burst.power' && job && job !== 'fighting'
      ? `${job} burst harvest`
      : job
        ? `${job} ${name}`
        : name;
  return `${effectValue(m)} ${what}`;
}

/** A modifier's value as shown in tooltips and previews: "+10%", "+1", "×2". */
export function modifierText(m: Pick<Modifier, 'kind' | 'value'>): string {
  const v = fmt(m.value);
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
