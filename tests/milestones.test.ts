import { describe, expect, it } from 'vitest';
import {
  Decimal,
  growthStage,
  milestoneInfo,
  milestoneMultiplier,
  milestonesCrossed,
  milestonesReached,
  nextMilestone,
} from '../src/game';
import { content } from './helpers';

const x2 = { every: 25, multiplier: new Decimal(2) };

describe('level milestones (DESIGN.md §4)', () => {
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

  it('is data-driven per line: every Training line has its own ring', () => {
    for (const line of content.training) {
      expect(line.milestones.every).toBeGreaterThan(0);
    }
  });
});
