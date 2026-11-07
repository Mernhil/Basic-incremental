import { describe, expect, it } from 'vitest';
import { Decimal, damageLevel, type GameState } from '../src/game';
import {
  buyerCandidates,
  greedyBuy,
  MILESTONES,
  runSim,
  formatTable,
  arrangePlots,
  shouldAscend,
} from '../scripts/sim/sim';
import { content, freshState } from './helpers';

const rich = (state: GameState, resource: string, amount: number): GameState => {
  state.resources[resource] = new Decimal(amount);
  return state;
};

describe('balance sim: greedy buyer', () => {
  it('lists purchases with an ETA, 0 when affordable now', () => {
    const state = rich(freshState(), 'copper_gem', 10);
    const candidates = buyerCandidates(state, content);
    const copperEdge = candidates.find((c) => c.id === 'damage:copper_edge');
    expect(copperEdge?.eta).toBe(0);
    const ironEdge = candidates.find((c) => c.id === 'damage:iron_edge');
    // Nothing earns Iron Gems yet.
    expect(ironEdge?.eta).toBeNull();
  });

  it('buys the cheapest affordable purchase first, then keeps buying', () => {
    // 10 copper buys Copper Edge (10); a mine level costs 15 and a slot 25.
    const state = rich(freshState(), 'copper_gem', 10);
    const { state: after, bought } = greedyBuy(state, content);
    expect(bought).toContain('damage:copper_edge');
    expect(damageLevel(after, 'copper_edge')).toBe(1);
    expect(after.resources['copper_gem']!.toNumber()).toBe(0);
  });

  it('summons from a portal once a pull is affordable', () => {
    const state = rich(freshState(), 'moss_sigil', 10);
    const { state: after, bought } = greedyBuy(state, content);
    expect(bought).toContain('summon:card_portal');
    expect(after.portals['card_portal']?.pulls).toBe(1);
    expect(MILESTONES.find((m) => m.id === 'first_summon')?.pending).toBeUndefined();
  });

  it('ascends once the gain is worth it, then spends the Starlight', () => {
    const state = freshState();
    state.mastery.harvested['oak_gem'] = new Decimal(1e9);
    expect(shouldAscend(state, content)).toBe(true);
    expect(shouldAscend(freshState(), content)).toBe(false);
    const rich = freshState();
    rich.resources['starlight'] = new Decimal(100);
    const { bought } = greedyBuy(rich, content);
    expect(bought.some((id) => id.startsWith('starlight:'))).toBe(true);
    expect(MILESTONES.find((m) => m.id === 'first_prestige')?.pending).toBeUndefined();
  });

  it('upgrades a cosmetic once it has the copy and the material, and equips it', () => {
    const state = freshState();
    state.cosmetics.owned['holo_hex'] = { level: 1, copies: 1 };
    state.resources['glimmer_dust'] = new Decimal(1000);
    const { state: after, bought } = greedyBuy(state, content);
    expect(bought).toContain('cosmetic:holo_hex');
    expect(after.cosmetics.owned['holo_hex']!.level).toBe(2);
    expect(MILESTONES.find((m) => m.id === 'max_cosmetic')?.pending).toBeUndefined();
  });

  it('does nothing when nothing is affordable', () => {
    const { bought } = greedyBuy(freshState(), content);
    expect(bought).toEqual([]);
  });

  it('fills new plots, spreading them over the unlocked producers', () => {
    const state = freshState();
    state.production.logging.expansions = 2;
    state.production.unlockedTrees = ['ironbark'];
    const arranged = arrangePlots(state, content);
    expect([...arranged.production.logging.plots].sort()).toEqual(['ironbark', 'oak', 'oak']);
  });
});

describe('balance sim: run', () => {
  it('lists the DESIGN 11.7 milestones with their targets', () => {
    const first = MILESTONES.find((m) => m.id === 'clear_d1');
    expect(first?.targetHours).toBe(0.5);
    expect(MILESTONES.map((m) => m.targetHours)).toContain(40);
  });

  it('is deterministic for a seed and records milestone times', () => {
    const a = runSim(content, { hours: 1, seed: 7, stepSeconds: 10 });
    const b = runSim(content, { hours: 1, seed: 7, stepSeconds: 10 });
    expect(a.hits).toEqual(b.hits);
    expect(a.simSeconds).toBe(3600);
    // The first boss falls well within the first hour of greedy play.
    expect(a.hits['clear_d1']).not.toBeNull();
    expect(a.hits['clear_d1']!).toBeLessThan(3600);
  });

  it('prints a markdown table with one row per milestone', () => {
    const result = runSim(content, { hours: 0.05, seed: 1, stepSeconds: 10 });
    const table = formatTable(result);
    expect(table.split('\n').filter((l) => l.startsWith('| ')).length).toBe(MILESTONES.length + 1);
    expect(table).toContain('First dungeon cleared');
  });
});
