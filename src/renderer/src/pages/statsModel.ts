import type { Content } from '../../../data';
import { cardStats, compareStats, type GameState } from '../../../game';
import { fmt } from '../settings/numberFormat';
import { COPY } from '../copy';
import type { StatTiles } from './cardsModel';

/**
 * The stat tiles of a card (DESIGN.md §5 Show the stats): damage per second (output for a
 * worker), health, how often it hits, and its crits, plus a line against the card it would replace.
 * Pure, so the Cards detail only draws it.
 */
export function statTiles(content: Content, state: GameState, cardId: string): StatTiles {
  const s = COPY.cards.stats;
  const stats = cardStats(state, content, cardId);
  if (!stats) return { tiles: [], compare: '' };
  const fighting = stats.kind === 'fighting';
  const tiles: StatTiles['tiles'] = [
    fighting
      ? { label: s.damage, value: fmt(stats.output), title: s.damageTip }
      : { label: s.output, value: s.outputValue(fmt(stats.output)), title: s.outputTip },
  ];
  if (stats.health) tiles.push({ label: s.health, value: fmt(stats.health), title: '' });
  tiles.push(
    {
      label: fighting ? s.hit : s.strike,
      value: s.seconds(stats.hitSeconds),
      title: '',
    },
    { label: s.crits, value: s.crit(stats.critChance, fmt(stats.critDamage)), title: '' },
  );
  const cmp = compareStats(state, content, cardId);
  let compare: string;
  if (cmp) {
    const parts = [s.comparePart(cmp.output, fighting ? 'damage' : 'output')];
    if (cmp.health !== null) parts.push(s.comparePart(cmp.health, 'health'));
    const name = content.cardById.get(cmp.againstId)?.name ?? s.compareMain;
    compare = s.compare(name, parts);
  } else if (fighting && state.cards.loadouts.fighting.main === cardId) {
    compare = s.equipped;
  } else {
    compare = '';
  }
  return { tiles, compare: compare.replace(/\+0%|−0%/g, s.same) };
}
