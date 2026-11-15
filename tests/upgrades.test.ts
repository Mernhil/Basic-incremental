import { describe, expect, it } from 'vitest';
import {
  bossMaxHp,
  advance,
  ascend,
  collectModifiers,
  createSaveText,
  Decimal,
  lifetimeMoney,
  lineBadges,
  lineEffect,
  milestoneStatus,
  nextLineStep,
  perkModifiers,
  pickPerk,
  producerRate,
  readSave,
  teamBonusPower,
  waitingPicks,
  type GameState,
} from '../src/game';
import { bareState, constantRng, content, freshState, withDps } from './helpers';

const NOW = 1_700_000_000_000;
const oak = content.treeById.get('oak')!;
const ms = (id: string) => content.perkMilestoneById.get(id)!;

function withOakLevel(state: GameState, level: number): GameState {
  state.production.treeLevels['oak'] = level;
  return state;
}

describe('milestone pick content (DESIGN.md §4 Milestone picks)', () => {
  it('gives every line its picks: trees and mines at 10/25/50/75, tools at 10/25/50, Training at 5/15/30', () => {
    const levels = (kind: string, id: string) =>
      content.perks.milestones
        .filter((m) => m.line.kind === kind && m.line.id === id)
        .map((m) => m.level);
    for (const t of content.trees) expect(levels('tree', t.id)).toEqual([10, 25, 50, 75]);
    for (const m of content.mines) expect(levels('mine', m.id)).toEqual([10, 25, 50, 75]);
    for (const t of content.production.tools) expect(levels('tool', t.id)).toEqual([10, 25, 50]);
    for (const t of content.training) expect(levels('training', t.id)).toEqual([5, 15, 30]);
  });

  it('offers two different perks at every milestone, none for the fight support cards', () => {
    for (const m of content.perks.milestones) {
      expect(m.options[0].id).not.toBe(m.options[1].id);
      for (const o of m.options) {
        for (const e of o.effects) {
          if (e.stat === 'card.teamBonusPower') expect(e.scope?.job).not.toBe('fighting');
        }
      }
    }
  });
});

describe('picks', () => {
  it('a milestone waits once its line reaches the level, and nothing applies before a pick', () => {
    const state = withOakLevel(freshState(), 9);
    expect(milestoneStatus(state, ms('oak_10'))).toBe('ahead');
    expect(waitingPicks(state, content).map((m) => m.id)).not.toContain('oak_10');
    withOakLevel(state, 10);
    expect(milestoneStatus(state, ms('oak_10'))).toBe('waiting');
    expect(waitingPicks(state, content).map((m) => m.id)).toContain('oak_10');
    expect(perkModifiers(state, content)).toEqual([]);
  });

  it('a pick applies its perk as an ordinary modifier and shows as a badge', () => {
    const state = withOakLevel(freshState(), 12);
    const before = producerRate(oak, 'logging', collectModifiers(state, content), 12);
    const r = pickPerk(state, content, 'oak_10', 'oak_10_output');
    if (!r.ok) throw new Error(r.reason);
    expect(milestoneStatus(r.state, ms('oak_10'))).toBe('active');
    const after = producerRate(oak, 'logging', collectModifiers(r.state, content), 12);
    expect(after.div(before).toNumber()).toBeCloseTo(1.25, 9);
    const badges = lineBadges(r.state, content, { kind: 'tree', id: 'oak' });
    expect(badges.map((b) => b.option.id)).toEqual(['oak_10_output']);
  });

  it('refuses a pick that is unknown, not reached or already made', () => {
    const state = withOakLevel(freshState(), 10);
    expect(pickPerk(state, content, 'nope', 'x')).toEqual({ ok: false, reason: 'unknown' });
    expect(pickPerk(state, content, 'oak_10', 'oak_25_lucky')).toEqual({
      ok: false,
      reason: 'unknown',
    });
    expect(pickPerk(state, content, 'oak_25', 'oak_25_lucky')).toEqual({
      ok: false,
      reason: 'not-reached',
    });
    const r = pickPerk(state, content, 'oak_10', 'oak_10_pace');
    if (!r.ok) throw new Error(r.reason);
    expect(pickPerk(r.state, content, 'oak_10', 'oak_10_output')).toEqual({
      ok: false,
      reason: 'picked',
    });
  });

  it("the Pact perks make a job's worker abilities stronger", () => {
    const state = freshState();
    state.production.tools['mining_speed'] = 10;
    expect(teamBonusPower(state, content, 'mining').toNumber()).toBe(1);
    state.upgrades.picks['mining_speed_10'] = 'mining_speed_10_pact';
    expect(teamBonusPower(state, content, 'mining').toNumber()).toBeCloseTo(1.25, 9);
    expect(teamBonusPower(state, content, 'logging').toNumber()).toBe(1);
  });
});

describe('ascension', () => {
  it('keeps every pick and the lifetime Money; a perk comes back when its line reaches the level', () => {
    const state = withOakLevel(freshState(), 30);
    state.mastery.harvested['oak_gem'] = new Decimal(1e14);
    state.mastery.harvested['grotto_gem'] = new Decimal(1e8);
    state.upgrades.picks['oak_10'] = 'oak_10_output';
    state.upgrades.moneyEarned = new Decimal(123456);
    const result = ascend(state, content);
    if (!result.ok) throw new Error(result.reason);
    const next = result.state;
    expect(next.upgrades.picks).toEqual({ oak_10: 'oak_10_output' });
    expect(next.upgrades.moneyEarned.eq(123456)).toBe(true);
    expect(milestoneStatus(next, ms('oak_10'))).toBe('kept');
    expect(perkModifiers(next, content)).toEqual([]);
    withOakLevel(next, 10);
    expect(milestoneStatus(next, ms('oak_10'))).toBe('active');
    expect(waitingPicks(next, content).map((m) => m.id)).not.toContain('oak_10');
    expect(perkModifiers(next, content).length).toBe(1);
  });
});

describe('lifetime Money earned', () => {
  it('counts the wage and purses paid with the kills', () => {
    const state = bareState();
    state.activeDungeonId = 'mossy_cellar';
    expect(lifetimeMoney(state).eq(0)).toBe(true);
    const { state: after } = advance(
      state,
      withDps(bossMaxHp(content.dungeons[0]!)),
      2000,
      constantRng(0.5),
    );
    const gained = after.resources['money']!.sub(state.resources['money']!);
    expect(gained.gt(0)).toBe(true);
    expect(lifetimeMoney(after).eq(gained)).toBe(true);
  });
});

describe('the upgrade row (DESIGN.md §4 The upgrade row)', () => {
  it('shows a tree level as the place output now and after', () => {
    const state = withOakLevel(freshState(), 5);
    const e = lineEffect(state, content, { kind: 'tree', id: 'oak' }, 1);
    expect(e.kind).toBe('placeOutput');
    expect(e.resource).toBe('oak_gem');
    expect(e.after.gt(e.now)).toBe(true);
  });

  it('shows Sharpen as team damage per second and Tempo as hits per signature', () => {
    const state = freshState();
    const dps = lineEffect(state, content, { kind: 'training', id: 'sharpen' }, 1);
    expect(dps.kind).toBe('teamDps');
    expect(dps.after.gt(dps.now)).toBe(true);
    const tempo = lineEffect(state, content, { kind: 'training', id: 'tempo' }, 1);
    expect(tempo.kind).toBe('hitsPerSignature');
    expect(tempo.after.lt(tempo.now)).toBe(true);
  });

  it('names the next milestone: the ring, the pick, or both at one level', () => {
    const state = withOakLevel(freshState(), 8);
    const step = nextLineStep(state, content, { kind: 'tree', id: 'oak' })!;
    expect(step.level).toBe(10);
    expect(step.levelsToGo).toBe(2);
    expect(step.pick?.id).toBe('oak_10');
    expect(step.ring).toBeNull();
    withOakLevel(state, 12);
    const ring = nextLineStep(state, content, { kind: 'tree', id: 'oak' })!;
    expect(ring.level).toBe(15);
    expect(ring.ring?.nextMultiplier.toNumber()).toBeCloseTo(1.15, 9);
    expect(ring.fromLevel).toBe(10);
    state.production.tools['logging_yield'] = 20;
    const both = nextLineStep(state, content, { kind: 'tool', id: 'logging_yield' })!;
    expect(both.level).toBe(25);
    expect(both.ring).not.toBeNull();
    expect(both.pick?.id).toBe('logging_yield_25');
  });
});

describe('saves', () => {
  it('round-trips picks and lifetime Money, dropping picks no longer in the game', () => {
    const state = freshState();
    state.upgrades.picks = { oak_10: 'oak_10_output', gone: 'x', oak_25: 'oak_10_pace' };
    state.upgrades.moneyEarned = new Decimal('1.5e12');
    const loaded = readSave(createSaveText(state, NOW), content).state;
    expect(loaded.upgrades.picks).toEqual({ oak_10: 'oak_10_output' });
    expect(loaded.upgrades.moneyEarned.eq('1.5e12')).toBe(true);
  });
});
