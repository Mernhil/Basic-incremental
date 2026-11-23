import type { Content } from '../../../../data';
import {
  campLevel,
  Decimal,
  isProducerUnlocked,
  nodeSlots,
  placeJob,
  producersOf,
  slotAt,
  slotRates,
  waitingSlots,
  type CampPlace,
  type GameState,
  type Modifier,
} from '../../../../game';
import { fmt } from '../../settings/numberFormat';

/**
 * View model of the forest and the mine (DESIGN.md section 2 Base camp): the three material nodes
 * of a place, each with its slots, its rate and why it is locked. Display logic only: the game
 * decides every number. Pure, no DOM, unit tested.
 */

/** The node mask file of each material (`scenes/masks/<key>.png`). */
export const NODE_MASK: Readonly<Record<string, string>> = {
  oak: 'oak',
  ironbark: 'ironbark',
  moonwillow: 'moonwillow',
  copper_quarry: 'copper',
  iron_deeps: 'iron',
  crystal_grotto: 'grotto',
};

export interface SlotView {
  /** The slot's index in its place (what `assignSlotCard` takes). */
  index: number;
  card: string | null;
  /** The slot's output per second, "" when no card works it. */
  rate: string;
}

export interface NodeView {
  id: string;
  name: string;
  /** The mask file key. */
  mask: string;
  /** What opens the node ("clear Ember Crypt to reach it"), or null when it is open. */
  locked: string | null;
  slots: SlotView[];
  /** What the node's slots bring together per second, "" when none works. */
  rate: string;
  /** Whether a slot waiting to be placed can go on this node now. */
  canPlace: boolean;
  /** A card works one of its slots. */
  working: boolean;
}

export interface CampScreen {
  nodes: NodeView[];
  /** How many open slots wait for a node. */
  waiting: number;
  /** The whole place per second. */
  total: Decimal;
  level: number;
}

export function lockedWhy(content: Content, dungeonId: string | null): string | null {
  if (dungeonId === null) return null;
  const name = content.dungeonById.get(dungeonId)?.name ?? dungeonId;
  return `clear ${name} to reach it`;
}

export function campScreen(
  state: GameState,
  content: Content,
  place: CampPlace,
  modifiers: readonly Modifier[],
): CampScreen {
  const job = placeJob(place);
  const rates = slotRates(state, content, modifiers).filter((r) => r.worker.place === place);
  const waiting = waitingSlots(state, content, place).length;
  let total = new Decimal(0);
  const nodes = producersOf(content, job).map((p): NodeView => {
    const unlocked = isProducerUnlocked(state, content, job, p.id);
    let sum = new Decimal(0);
    const slots = nodeSlots(state, content, place, p.id).map((index): SlotView => {
      const found = rates.find((r) => r.worker.index === index);
      if (found) sum = sum.add(found.rate);
      return {
        index,
        card: slotAt(state, place, index).card,
        rate: found ? `+${fmt(found.rate)}/s` : '',
      };
    });
    total = total.add(sum);
    const working = slots.some((s) => s.rate !== '');
    return {
      id: p.id,
      name: p.name,
      mask: NODE_MASK[p.id] ?? p.id,
      locked: unlocked ? null : lockedWhy(content, p.unlockedByDungeon),
      slots: unlocked ? slots : [],
      rate: working ? `+${fmt(sum)}/s` : '',
      canPlace: unlocked && waiting > 0,
      working,
    };
  });
  return { nodes, waiting, total, level: campLevel(state) };
}
