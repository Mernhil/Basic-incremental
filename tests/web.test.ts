import { describe, expect, it } from 'vitest';
import type { WebNode } from '../src/data';
import { SKILL_WEIGHT } from '../scripts/sim/sim';
import {
  buyWebNode,
  collectModifiers,
  respecInfo,
  respecSkills,
  skillPoints,
  webNextCost,
  type GameState,
} from '../src/game';
import { content, freshState, levelPointsOnly } from './helpers';

const rich = (points = 100): GameState => {
  const s = freshState();
  s.account.level = points + 1;
  return s;
};

describe('buying in the skill web (DESIGN.md §10 The skill web)', () => {
  it('buys a level of a first node with skill points, one level at a time', () => {
    const s = rich();
    const node = content.webNodeById.get('lg_saws')!;
    const before = skillPoints(s, content).available;
    const r = buyWebNode(s, content, 'lg_saws');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.account.web['lg_saws']).toBe(1);
    expect(skillPoints(r.state, content).available).toBe(before - webNextCost(node, 0));
    // the input is not changed
    expect(s.account.web['lg_saws']).toBeUndefined();
  });

  it('needs the node before it, an open ring, points and a level left', () => {
    const s = rich();
    expect(buyWebNode(s, content, 'lg_swing')).toEqual({ ok: false, reason: 'locked' });
    expect(buyWebNode(s, content, 'nope')).toEqual({ ok: false, reason: 'unknown' });
    const s2 = rich();
    s2.account.web = { lg_saws: 1, lg_swing: 1 };
    // Wide Groves opens with the first Ascension
    expect(buyWebNode(s2, content, 'lg_groves')).toEqual({ ok: false, reason: 'closed' });
    s2.prestigeCount = 1;
    expect(buyWebNode(s2, content, 'lg_groves').ok).toBe(true);
    const lp = levelPointsOnly(content);
    const poor = freshState();
    poor.account.level = 1;
    expect(buyWebNode(poor, lp, 'lg_saws')).toEqual({ ok: false, reason: 'no-points' });
    const max = rich(500);
    max.account.web = { lg_saws: content.webNodeById.get('lg_saws')!.maxLevel };
    expect(buyWebNode(max, content, 'lg_saws')).toEqual({ ok: false, reason: 'maxed' });
  });

  it('gives its modifiers to the game: a level of Sharp Saws raises logging output', () => {
    const s = rich();
    const r = buyWebNode(s, content, 'lg_saws');
    if (!r.ok) throw new Error('buy');
    const mods = collectModifiers(r.state, content).filter((m) => m.source.id === 'lg_saws');
    expect(mods.length).toBeGreaterThan(0);
    expect(mods[0]!.stat).toBe('production.rate');
    expect(mods[0]!.value.toNumber()).toBeCloseTo(
      content.webNodeById.get('lg_saws')!.perLevel[0]!.value.toNumber(),
      6,
    );
  });

  it('respec refunds every point of the web too, free once per Ascension', () => {
    let s = rich();
    for (const id of ['lg_saws', 'lg_saws', 'lg_heart']) {
      const r = buyWebNode(s, content, id);
      if (!r.ok) throw new Error(id);
      s = r.state;
    }
    const info = respecInfo(s, content);
    expect(info.free).toBe(true);
    expect(info.refund).toBe(skillPoints(s, content).spent);
    const out = respecSkills(s, content);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.state.account.web).toEqual({});
    expect(skillPoints(out.state, content).spent).toBe(0);
    expect(respecSkills(freshState(), content)).toEqual({ ok: false, reason: 'nothing' });
  });
});

describe('where the web keeps its power', () => {
  it('has a quarter less on the deep nodes and the same total per arm (the sim weights)', () => {
    // what a maxed arm gave before a quarter of the deep nodes' effect moved onto the first two
    const before: Record<string, number> = {
      logging: 1.68865,
      mining: 1.99195,
      dungeon: 3.29501,
      cards: 3.1555,
    };
    const depth = (n: WebNode): number =>
      n.parent ? 1 + depth(content.webNodeById.get(n.parent)!) : 1;
    for (const arm of Object.keys(before)) {
      const ns = content.web.nodes.filter((n) => n.arm === arm && !n.keystone);
      const value = (n: WebNode): number =>
        n.maxLevel *
        n.perLevel.reduce(
          (s, m) => s + Math.abs(m.value.toNumber()) * (SKILL_WEIGHT[m.stat] ?? 0.001),
          0,
        );
      const total = ns.reduce((s, n) => s + value(n), 0);
      expect(total, arm).toBeCloseTo(before[arm]!, 2);
      const deep = ns.filter((n) => depth(n) >= 3).reduce((s, n) => s + value(n), 0);
      expect(deep / total, arm).toBeLessThan(0.45);
    }
  });
});
