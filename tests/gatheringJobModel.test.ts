import { describe, expect, it } from 'vitest';
import { Decimal, collectModifiers } from '../src/game';
import {
  craftsPerMinute,
  forgeFlow,
  gaugeLine,
  jobUpgradeChips,
  slotsLine,
  strikeSeconds,
  upgradeIsFor,
  workerLine,
} from '../src/renderer/src/views/gathering/jobModel';
import { plainContent, freshState } from './helpers';

describe('Logging, Mining and Forge view models', () => {
  const content = plainContent;

  it('words the worker block lines', () => {
    expect(workerLine('3.2', 1)).toBe('power ×3.2 · strikes every 1 s');
    expect(workerLine('3.2', 12.4)).toBe('power ×3.2 · strikes every 12 s');
    expect(workerLine('3.2', null)).toBe('power ×3.2');
    expect(gaugeLine(0.66, 30)).toBe('gauge 20 / 30');
    expect(gaugeLine(2, 30)).toBe('gauge 30 / 30');
    expect(slotsLine(4, 4)).toBe('Worker slots: 4 of 4 in use');
  });

  it('reads the strike rhythm from the next strike, not near the end of a period', () => {
    expect(strikeSeconds({ worker: {}, nextStrike: { progress: 0.5, inSeconds: 0.5 } })).toBe(1);
    expect(strikeSeconds({ worker: {}, nextStrike: { progress: 0.95, inSeconds: 0.05 } })).toBe(
      null,
    );
    expect(strikeSeconds({ worker: null, nextStrike: { progress: 0.1, inSeconds: 1 } })).toBe(null);
  });

  it('says crafts a minute, and nothing with no speed', () => {
    expect(craftsPerMinute(new Decimal(2), new Decimal(150))).toBe('0.8 crafts a minute');
    expect(craftsPerMinute(new Decimal(0), new Decimal(150))).toBe('');
    expect(craftsPerMinute(new Decimal(1), new Decimal(3000))).toBe('0.02 crafts a minute');
  });

  it('keeps the upgrades of the job and its places apart', () => {
    const places = new Set(['oak']);
    const eff = (scope: object) => ({ effects: [{ scope }] }) as never;
    expect(upgradeIsFor(eff({ producer: 'oak' }), 'logging', places)).toBe(true);
    expect(upgradeIsFor(eff({ job: 'logging' }), 'logging', places)).toBe(true);
    expect(upgradeIsFor(eff({ job: 'mining' }), 'logging', places)).toBe(false);
    expect(upgradeIsFor(eff({ producer: 'copper_quarry' }), 'logging', places)).toBe(false);
    expect(upgradeIsFor({ effects: [{}] } as never, 'logging', places)).toBe(false);
  });

  it('lists only upgrades of one job, none of them hidden', () => {
    const state = freshState();
    const mods = collectModifiers(state, content);
    const logging = jobUpgradeChips(state, content, mods, 'logging');
    const mining = jobUpgradeChips(state, content, mods, 'mining');
    const ids = new Set(logging.map((c) => c.id));
    expect(mining.every((c) => !ids.has(c.id))).toBe(true);
  });

  it('has no forge flow with no recipe, and the recipe as inputs and an output with one', () => {
    const state = freshState();
    state.production.forge.recipe = null;
    expect(forgeFlow(state, content)).toBeNull();
    const recipe = content.production.forge.recipes[0]!;
    state.production.forge.recipe = recipe.id;
    const flow = forgeFlow(state, content)!;
    expect(flow.inputs).toHaveLength(recipe.inputs.length);
    expect(flow.output.resource).toBe(recipe.output.resource);
  });
});
