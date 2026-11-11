import { describe, expect, it } from 'vitest';
import {
  advance,
  advanceChunked,
  bossMastery,
  collectModifiers,
  createSaveText,
  Decimal,
  gemMastery,
  METALS,
  MODIFIER_SOURCE_KINDS,
  producerRate,
  readSave,
  resetProduction,
  simulateOffline,
  type GameState,
} from '../src/game';
import { bareState, constantRng, content, freshState } from './helpers';

const rng = constantRng(0.5);

/** A state whose settled tiers match its totals, as after a tick on the 1 s grid. */
function settled(state: GameState): GameState {
  return advance(state, content, 1000, rng).state;
}

describe('gem mastery data (DESIGN.md §4)', () => {
  it('has the decided thresholds and +10% per tier', () => {
    const m = content.progression.gemMastery;
    expect(m.thresholds.map((t) => t.toNumber())).toEqual([1e3, 1e5, 1e7, 1e9]);
    expect(m.perTier).toEqual([
      expect.objectContaining({ stat: 'production.rate', kind: 'percent', value: new Decimal(10) }),
    ]);
    expect(METALS).toEqual(['stone', 'bronze', 'silver', 'gold', 'prismatic']);
  });

  it('adds `mastery` to the modifier source kinds', () => {
    expect(MODIFIER_SOURCE_KINDS).toContain('mastery');
  });
});

describe('gemMastery', () => {
  it('starts at stone (tier 0) with progress toward 1e3', () => {
    const m = gemMastery(freshState(), content, 'oak_gem');
    expect(m).toMatchObject({ tier: 0, metal: 'stone', progress: 0 });
    expect(m.total.toNumber()).toBe(0);
    expect(m.nextThreshold?.toNumber()).toBe(1e3);
  });

  it('reads the settled tier and the linear progress to the next threshold', () => {
    const state = freshState();
    state.mastery.harvested['oak_gem'] = new Decimal(50_500);
    state.mastery.gemTiers['oak_gem'] = 1;
    const m = gemMastery(state, content, 'oak_gem');
    expect(m).toMatchObject({ tier: 1, metal: 'bronze' });
    expect(m.nextThreshold?.toNumber()).toBe(1e5);
    expect(m.progress).toBeCloseTo((50_500 - 1e3) / (1e5 - 1e3));
  });

  it('is full at prismatic with no next threshold', () => {
    const state = freshState();
    state.mastery.harvested['copper_gem'] = new Decimal(5e9);
    state.mastery.gemTiers['copper_gem'] = 4;
    expect(gemMastery(state, content, 'copper_gem')).toMatchObject({
      tier: 4,
      metal: 'prismatic',
      nextThreshold: null,
      progress: 1,
    });
  });
});

describe('gem mastery bonus', () => {
  it('gives +10% per tier to that gem only, with source kind mastery', () => {
    const state = freshState();
    state.mastery.gemTiers['oak_gem'] = 2;
    const mods = collectModifiers(state, content);
    const mastery = mods.filter((m) => m.source.kind === 'mastery');
    expect(mastery).toHaveLength(1);
    expect(mastery[0]).toMatchObject({
      stat: 'production.rate',
      kind: 'percent',
      scope: { resource: 'oak_gem' },
      source: { kind: 'mastery', id: 'oak_gem' },
    });
    expect(mastery[0]!.value.toNumber()).toBe(20);
    const oak = content.treeById.get('oak')!;
    const iron = content.treeById.get('ironbark')!;
    expect(producerRate(oak, 'logging', mods).toNumber()).toBeCloseTo(1.2);
    expect(producerRate(iron, 'logging', mods).toNumber()).toBeCloseTo(0.5);
  });
});

describe('counting harvest', () => {
  it('counts normal output into the lifetime total', () => {
    const state = bareState();
    const after = advance(state, content, 10_000, rng).state;
    // One Oak plot at 1/s and one Copper Quarry slot at 0.5/s, no cards.
    expect(after.mastery.harvested['oak_gem']!.toNumber()).toBeCloseTo(10);
    expect(after.mastery.harvested['copper_gem']!.toNumber()).toBeCloseTo(5);
  });

  it('counts harvest bursts too', () => {
    const state = bareState();
    // The logging gauge is one tick from firing: 10 s of output on top.
    state.bursts.logging = { gauge: content.combat.bursts.logging.gaugeSize - 1, timer: 0 };
    const after = advance(state, content, 1000, rng).state;
    const power = content.combat.bursts.logging.power.toNumber();
    expect(after.mastery.harvested['oak_gem']!.toNumber()).toBeCloseTo(1 + power);
    expect(after.resources['oak_gem']!.toNumber()).toBeCloseTo(1 + power);
  });

  it('counts offline progress', () => {
    const state = bareState();
    const { state: after } = simulateOffline(state, content, 0, 60_000, rng);
    expect(after.mastery.harvested['oak_gem']!.toNumber()).toBeGreaterThanOrEqual(60);
  });

  it('keeps counting after the gems are spent', () => {
    const state = bareState();
    state.mastery.harvested['oak_gem'] = new Decimal(500);
    state.resources['oak_gem'] = new Decimal(0);
    const after = advance(state, content, 2000, rng).state;
    expect(after.mastery.harvested['oak_gem']!.toNumber()).toBeCloseTo(502);
  });
});

describe('gem tier-ups', () => {
  it('settles on the 1 s grid and reports a unified TierUp', () => {
    const state = bareState();
    state.mastery.harvested['oak_gem'] = new Decimal(999.5);
    const { state: after, report } = advance(state, content, 1000, rng);
    expect(after.mastery.gemTiers['oak_gem']).toBe(1);
    expect(report.tierUps).toEqual([
      { kind: 'gem_mastery', id: 'oak_gem', from: 0, to: 1, metal: 'bronze' },
    ]);
  });

  it('gives the same totals however the time is split', () => {
    const state = bareState();
    // Crosses 1e3 mid-second (not on a grid line, where float noise could tip it either way).
    state.mastery.harvested['oak_gem'] = new Decimal(990.5);
    const once = advance(state, content, 30_000, rng).state;
    const split = advanceChunked(state, content, 30_000, rng, 16).state;
    expect(split.mastery.gemTiers['oak_gem']).toBe(1);
    expect(once.mastery.gemTiers['oak_gem']).toBe(1);
    expect(split.resources['oak_gem']!.toNumber()).toBeCloseTo(
      once.resources['oak_gem']!.toNumber(),
      6,
    );
  });

  it('jumps several tiers at once when a total passes them', () => {
    const state = bareState();
    state.mastery.harvested['oak_gem'] = new Decimal(2e7);
    const { report } = advance(state, content, 1000, rng);
    expect(report.tierUps).toEqual([
      { kind: 'gem_mastery', id: 'oak_gem', from: 0, to: 3, metal: 'gold' },
    ]);
  });
});

describe('boss mastery (DESIGN.md §6)', () => {
  it('keeps the trial medal thresholds in data', () => {
    expect(content.progression.trialMastery.thresholds).toEqual([0.25, 0.5, 0.75, 1]);
  });

  it('gives dungeons no medal: they have stage stars instead', () => {
    const state = freshState();
    state.combat.stageKills['mossy_cellar:normal:1'] = 55;
    state.mastery.bossTiers['mossy_cellar'] = 1;
    expect(bossMastery(state, content, 'mossy_cellar')).toBeNull();
    expect(collectModifiers(state, content).some((m) => m.source.kind === 'mastery')).toBe(false);
    const settled = advance(state, content, 1000, rng).state;
    expect(settled.mastery.bossTiers['mossy_cellar']).toBeUndefined();
  });

  it('reads the Glimmer Trial medal from its best score', () => {
    const state = freshState();
    state.combat.trialBest['glimmer_trial'] = 0.6;
    state.mastery.bossTiers['glimmer_trial'] = 2;
    const m = bossMastery(state, content, 'glimmer_trial')!;
    expect(m).toMatchObject({ tier: 2, metal: 'silver', value: 0.6, nextThreshold: 0.75 });
    expect(m.progress).toBeCloseTo(0.4);
  });

  it('is null for an unknown dungeon', () => {
    expect(bossMastery(freshState(), content, 'nowhere')).toBeNull();
  });
});

describe('mastery through prestige and saves', () => {
  it('is kept when production resets', () => {
    const state = settled(bareState());
    state.mastery.harvested['oak_gem'] = new Decimal(5e5);
    state.mastery.gemTiers['oak_gem'] = 2;
    const after = resetProduction(state);
    expect(after.mastery.harvested['oak_gem']!.toNumber()).toBe(5e5);
    expect(after.mastery.gemTiers['oak_gem']).toBe(2);
  });

  it('round-trips through a save', () => {
    const state = freshState();
    state.mastery.harvested['iron_gem'] = new Decimal('1.5e8');
    state.mastery.gemTiers['iron_gem'] = 3;
    state.mastery.bossTiers['ember_crypt'] = 1;
    const loaded = readSave(createSaveText(state, 0), content).state;
    expect(loaded.mastery.harvested['iron_gem']!.toString()).toBe('150000000');
    expect(loaded.mastery.gemTiers).toEqual({ iron_gem: 3 });
    // Dungeons have no medals any more: only the special dungeons' are kept.
    expect(loaded.mastery.bossTiers).toEqual({});
  });
});
