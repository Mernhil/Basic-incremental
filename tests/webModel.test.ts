import { describe, expect, it } from 'vitest';
import { WEB_ARMS } from '../src/data';
import { skillPoints, type GameState } from '../src/game';
import { AREA_COLOUR, CENTRE } from '../src/renderer/src/pages/skillsModel';
import {
  MIN_GAP,
  STEP,
  nextLevelCost,
  webPositions,
  webSpent,
  webView,
} from '../src/renderer/src/pages/webModel';
import { content, freshState } from './helpers';

const nodes = content.web.nodes;
const free = (s: GameState): number => skillPoints(s, content).available;
const levelsAll = (n: number): Record<string, number> =>
  Object.fromEntries(nodes.map((x) => [x.id, Math.min(n, x.maxLevel)]));

describe('the skill web (UI_RULES, The Skill Tree, pick 4a)', () => {
  it('has four arms, one first node each, and every node hangs off a node of its own arm', () => {
    expect(content.web.arms.map((a) => a.id)).toEqual([...WEB_ARMS]);
    for (const arm of WEB_ARMS) {
      expect(nodes.filter((n) => n.arm === arm && n.parent === null)).toHaveLength(1);
    }
    for (const n of nodes) {
      if (n.parent) expect(content.webNodeById.get(n.parent)!.arm).toBe(n.arm);
      expect(n.maxLevel).toBeGreaterThanOrEqual(1);
    }
    // fewer nodes with several levels: about 55, most with 5 levels or more
    expect(nodes.length).toBeGreaterThan(45);
    expect(nodes.length).toBeLessThan(70);
    expect(nodes.filter((n) => n.maxLevel >= 5).length).toBeGreaterThan(nodes.length / 2);
  });

  it('puts every line at one step, the first node of an arm one step from the star', () => {
    const pos = webPositions(content);
    for (const n of nodes) {
      const a = n.parent ? pos.get(n.parent)! : CENTRE;
      const b = pos.get(n.id)!;
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(STEP, 0);
    }
  });

  it('never lets two plates, or a plate and the star, come nearer than MIN_GAP (the whole web at once)', () => {
    const pos = [...webPositions(content).entries()];
    for (const [ia, a] of pos) {
      expect(Math.hypot(a.x - CENTRE.x, a.y - CENTRE.y), ia).toBeGreaterThanOrEqual(MIN_GAP);
      for (const [ib, b] of pos) {
        if (ia >= ib) continue;
        expect(Math.hypot(a.x - b.x, a.y - b.y), `${ia} ${ib}`).toBeGreaterThanOrEqual(MIN_GAP);
      }
    }
  });

  it('grows each arm along its own direction: left, right, up, down', () => {
    const pos = webPositions(content);
    for (const arm of content.web.arms) {
      const deg = (arm.degrees * Math.PI) / 180;
      for (const n of nodes.filter((x) => x.arm === arm.id)) {
        const p = pos.get(n.id)!;
        expect(p.x * Math.cos(deg) + p.y * Math.sin(deg), n.id).toBeGreaterThan(0);
      }
    }
  });

  it('starts as the four first nodes and the "?" past them, nothing further out', () => {
    const s = freshState();
    s.account.level = 20;
    const v = webView(content, s, free(s));
    expect(v.nodes.filter((n) => n.state === 'open')).toHaveLength(4);
    const unknown = v.nodes.filter((n) => n.state === 'unknown');
    expect(unknown.length).toBeGreaterThan(0);
    expect(unknown.every((n) => n.name === 'Unknown skill' && n.now.length === 0)).toBe(true);
    expect(v.nodes.length).toBeLessThan(nodes.length / 2);
  });

  it('opens the next nodes and words now and next level in real numbers as levels are bought', () => {
    const s = freshState();
    s.account.level = 20;
    s.account.web = { lg_saws: 2 };
    const v = webView(content, s, free(s));
    const saws = v.nodes.find((n) => n.id === 'lg_saws')!;
    expect(saws.state).toBe('owned');
    expect(saws.rankText).toBe('2/10');
    expect(saws.now).toEqual(['+11% logging production']);
    expect(saws.next).toEqual(['+16% logging production']);
    expect(saws.colour).toBe(AREA_COLOUR.logging);
    expect(v.nodes.find((n) => n.id === 'lg_swing')!.state).toBe('open');
    expect(v.nodes.find((n) => n.id === 'lg_heart')!.state).toBe('open');
    expect(v.nodes.find((n) => n.id === 'lg_grove')?.state ?? 'hidden').not.toBe('open');
  });

  it('shows every node when the whole web is learned, and counts what can be bought', () => {
    const s = freshState();
    s.prestigeCount = 3;
    s.account.web = levelsAll(1);
    const v = webView(content, s, 1000);
    expect(v.nodes).toHaveLength(nodes.length);
    expect(v.nodes.every((n) => n.state !== 'unknown')).toBe(true);
    expect(v.learned).toBe(nodes.length);
    expect(v.affordable).toBe(v.nodes.filter((n) => n.canBuy).length);
  });

  it("prices a level from the node's one cost object, in skill points", () => {
    for (const n of nodes) {
      expect(n.cost.resource).toBe('skill_points');
      expect(nextLevelCost(n, 0)).toBeGreaterThanOrEqual(1);
    }
    expect(webSpent(content, { lg_saws: 3 })).toBe(
      3 * nextLevelCost(content.webNodeById.get('lg_saws')!, 0),
    );
  });
});
