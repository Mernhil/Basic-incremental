import type { Content, Milestones, ProductionJob } from '../data';
import { metalOf } from './mastery';
import { growthStage, milestonesCrossed } from './milestones';
import { producerLevel } from './production';
import type { TierUp } from './report';
import type { GameState } from './state';

/**
 * Visual stages 0..4 (DESIGN.md §12): growing tiles, one step per milestone. Tree and mine
 * tiles follow their level milestones (DESIGN.md §4; progression.json `tileStages`). Tiles reset
 * on prestige with the levels.
 */

/** Growth stage 0..4 of a tree / mine tile. 0 for unknown producers or the wrong job. */
export function tileStage(
  state: GameState,
  content: Content,
  job: ProductionJob,
  producerId: string,
): number {
  const producer =
    job === 'logging' ? content.treeById.get(producerId) : content.mineById.get(producerId);
  if (!producer) return 0;
  return growthStage(producer.level.milestones, producerLevel(state, job, producerId));
}

/** One TierUp for the milestones crossed going from level `from` to `to` (none when none). */
export function milestoneTierUps(
  kind: TierUp['kind'],
  id: string,
  milestones: Milestones,
  from: number,
  to: number,
): TierUp[] {
  const crossed = milestonesCrossed(milestones, from, to);
  if (crossed.length === 0) return [];
  const before = Math.floor(Math.max(0, from) / milestones.every);
  const after = before + crossed.length;
  return [{ kind, id, from: before, to: after, metal: metalOf(after) }];
}
