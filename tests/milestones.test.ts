import { describe, expect, it } from 'vitest';
import {
  baseDamage,
  damageLineDps,
  damageLineMilestone,
  Decimal,
  growthStage,
  mineLevelMilestone,
  milestoneInfo,
  milestoneMultiplier,
  milestonesCrossed,
  milestonesReached,
  nextMilestone,
  producerRate,
  resetProduction,
} from '../src/game';
import { content, freshState } from './helpers';

const x2 = { every: 25, multiplier: new Decimal(2) };
const copper = content.combat.damageUpgrades.find((u) => u.id === 'copper_edge')!;
const quarry = content.mineById.get('copper_quarry')!;

describe('level milestones (DESIGN.md 11.12)', () => {
  it('counts one milestone per 25 levels', () => {
    expect(milestonesReached(x2, 0)).toBe(0);
    expect(milestonesReached(x2, 24)).toBe(0);
    expect(milestonesReached(x2, 25)).toBe(1);
    expect(milestonesReached(x2, 74)).toBe(2);
    expect(milestonesReached(x2, -3)).toBe(0);
  });

  it('multiplies output by x2 per milestone reached', () => {
    expect(milestoneMultiplier(x2, 24).toNumber()).toBe(1);
    expect(milestoneMultiplier(x2, 25).toNumber()).toBe(2);
    expect(milestoneMultiplier(x2, 100).toNumber()).toBe(16);
  });

  it('names the next milestone and the levels crossed by a purchase', () => {
    expect(nextMilestone(x2, 0).level).toBe(25);
    expect(nextMilestone(x2, 25).level).toBe(50);
    expect(nextMilestone(x2, 25).multiplier.toNumber()).toBe(2);
    expect(milestonesCrossed(x2, 20, 60)).toEqual([25, 50]);
    expect(milestonesCrossed(x2, 25, 49)).toEqual([]);
  });

  it('gives the UI a ready label and a 0..1 progress toward the next milestone', () => {
    const info = milestoneInfo(x2, 30);
    expect(info.reached).toBe(1);
    expect(info.multiplier.toNumber()).toBe(2);
    expect(info.nextLevel).toBe(50);
    expect(info.nextMultiplier.toNumber()).toBe(2);
    expect(info.levelsToNext).toBe(20);
    expect(info.progress).toBeCloseTo(5 / 25);
  });

  it('caps the visual growth stage at the top stage', () => {
    expect(growthStage(x2, 0)).toBe(0);
    expect(growthStage(x2, 75)).toBe(3);
    expect(growthStage(x2, 1000)).toBe(4);
  });

  it('is data-driven per line: every damage line and mine level has x2 every 25 levels', () => {
    for (const line of content.combat.damageUpgrades) {
      expect(line.milestones.every).toBe(25);
      expect(line.milestones.multiplier.toNumber()).toBe(2);
    }
    for (const mine of content.mines) {
      expect(mine.level.milestones.every).toBe(25);
      expect(mine.level.milestones.multiplier.toNumber()).toBe(2);
    }
  });

  it('doubles a damage line at level 25', () => {
    const at24 = damageLineDps(copper, 24);
    const at25 = damageLineDps(copper, 25);
    expect(at24.eq(copper.damagePerLevel.mul(24))).toBe(true);
    expect(at25.eq(copper.damagePerLevel.mul(25).mul(2))).toBe(true);
    expect(damageLineDps(copper, 0).eq(0)).toBe(true);
  });

  it('doubles a mine level line at level 25', () => {
    const plain = quarry.baseRate.mul(1 + (25 * 10) / 100);
    expect(producerRate(quarry, 'mining', [], 25).eq(plain.mul(2))).toBe(true);
  });

  it('keeps damage line milestones through the production reset of a prestige', () => {
    const state = freshState();
    state.combat.damageLevels = { copper_edge: 50 };
    state.production.mineLevels = { copper_quarry: 50 };
    const before = baseDamage(state, content);
    const after = resetProduction(state, content);
    after.prestigeCount = 1;
    expect(baseDamage(after, content).eq(before)).toBe(true);
    expect(damageLineMilestone(after, content, 'copper_edge')!.reached).toBe(2);
    // Mine levels reset, and their milestones with them.
    expect(mineLevelMilestone(after, content, 'copper_quarry')!.reached).toBe(0);
  });

  it('reports the milestone info of a line by id', () => {
    const state = freshState();
    state.combat.damageLevels = { copper_edge: 26 };
    state.production.mineLevels = { copper_quarry: 3 };
    expect(damageLineMilestone(state, content, 'copper_edge')!.nextLevel).toBe(50);
    expect(mineLevelMilestone(state, content, 'copper_quarry')!.levelsToNext).toBe(22);
    expect(damageLineMilestone(state, content, 'nope')).toBeNull();
    expect(mineLevelMilestone(state, content, 'nope')).toBeNull();
  });
});
