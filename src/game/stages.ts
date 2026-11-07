import type { Content, Milestones, ProductionJob } from '../data';
import { damageLevel } from './combat';
import { metalOf } from './mastery';
import { growthStage, milestonesCrossed } from './milestones';
import { Decimal } from './num';
import { mineLevel } from './production';
import type { TierUp } from './report';
import type { GameState } from './state';

/**
 * Visual stages 0..4 (DESIGN.md 16, E4 and E5): growing tiles and forged edges, one step per
 * milestone. Mine tiles follow their mine level milestones; tree tiles follow the plots bought
 * (trees have no levels; progression.json `tileStages`); forged edges follow their damage line
 * milestones. Tiles reset on prestige with the levels and plots; edges are kept with the lines.
 */

/** A stage-only milestone: one step every `every` (no output multiplier). */
const stepsOf = (every: number): Milestones => ({ every, multiplier: new Decimal(1) });

/** What grows a job's tiles and how far it has grown. Null for unknown or other-job producers. */
function tileSource(
  state: GameState,
  content: Content,
  job: ProductionJob,
  producerId: string,
): { milestones: Milestones; level: number } | null {
  const known =
    job === 'logging' ? content.treeById.has(producerId) : content.mineById.has(producerId);
  if (!known) return null;
  const source = content.progression.tileStages[job];
  if (source.source === 'expansions') {
    return { milestones: stepsOf(source.every), level: state.production[job].expansions };
  }
  const mine = content.mineById.get(producerId);
  return mine ? { milestones: mine.level.milestones, level: mineLevel(state, producerId) } : null;
}

/** Growth stage 0..4 of a tree / mine tile. 0 for unknown producers or the wrong job. */
export function tileStage(
  state: GameState,
  content: Content,
  job: ProductionJob,
  producerId: string,
): number {
  const source = tileSource(state, content, job, producerId);
  return source ? growthStage(source.milestones, source.level) : 0;
}

/** Forged-edge stage 0..4 of a damage line (bare, inlaid, gem-set, runes, prismatic). */
export function edgeStage(state: GameState, content: Content, upgradeId: string): number {
  const upgrade = content.combat.damageUpgrades.find((u) => u.id === upgradeId);
  return upgrade ? growthStage(upgrade.milestones, damageLevel(state, upgradeId)) : 0;
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

/** The tree tile stage reached by buying plots / slots (only when expansions grow the tiles). */
export function expansionStageTierUps(
  content: Content,
  job: ProductionJob,
  from: number,
  to: number,
): TierUp[] {
  const source = content.progression.tileStages[job];
  if (source.source !== 'expansions') return [];
  const m = stepsOf(source.every);
  const before = growthStage(m, from);
  const after = growthStage(m, to);
  return after > before
    ? [{ kind: 'tile_stage', id: job, from: before, to: after, metal: metalOf(after) }]
    : [];
}
