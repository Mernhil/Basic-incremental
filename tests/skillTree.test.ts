import { describe, expect, it } from 'vitest';
import { SKILL_BRANCHES } from '../src/data';
import {
  accountInfo,
  buySkill,
  Decimal,
  fitSkillsToPoints,
  grantAccountXp,
  loadoutCostCap,
  rewardTrack,
  settleAccount,
  skillPoints,
  skillTree,
  trackReward,
  weaponCircles,
  type GameState,
} from '../src/game';
import { content, freshState, newGame } from './helpers';

const A = content.account;
const node = (id: string) => A.tree.find((n) => n.id === id)!;

/** A state with `points` skill points to spend, from the level alone (every achievement is counted). */
function withPoints(points: number): GameState {
  const s = newGame();
  s.account.level = 1 + points / A.levels.skillPointsPerLevel;
  return s;
}

describe('no account level cap (DESIGN.md §10)', () => {
  it('levels keep coming past 50', () => {
    const s = newGame();
    s.account.level = 50;
    s.account.xp = new Decimal('1e30');
    settleAccount(s, content);
    expect(s.account.level).toBeGreaterThan(51);
    expect(accountInfo(s, content).xpToNext).not.toBeNull();
  });

  it('XP is still gained at level 50 and above', () => {
    const s = newGame();
    s.account.level = 60;
    grantAccountXp(s, content, new Decimal(100), []);
    expect(s.account.xp.toNumber()).toBe(100);
  });

  it('the reward track repeats a reward every 5 levels past the listed ones', () => {
    const last = Math.max(...A.rewardTrack.map((e) => e.level));
    expect(trackReward(content, last + 5).resources).toEqual(A.rewardRepeat.resources);
    expect(trackReward(content, last + 1).resources).toEqual([]);
    expect(trackReward(content, last + 5).cosmetics).toEqual([]);
    const s = newGame();
    s.account.level = last;
    const before = s.resources[A.rewardRepeat.resources[0]!.resource] ?? new Decimal(0);
    s.account.xp = new Decimal('1e300');
    settleAccount(s, content);
    expect(s.account.level).toBeGreaterThan(last + 5);
    expect(s.resources[A.rewardRepeat.resources[0]!.resource]!.gt(before)).toBe(true);
  });

  it('the track row always shows levels ahead of the player', () => {
    const s = newGame();
    s.account.level = 80;
    const track = rewardTrack(s, content);
    expect(track[track.length - 1]!.level).toBeGreaterThan(80);
    expect(track.find((t) => t.level === 81)!.reached).toBe(false);
  });

  it('the fighting loadout cost cap stops at its top value', () => {
    const s = newGame();
    s.account.level = 5000;
    expect(loadoutCostCap(s, content, 'fighting')).toBe(A.loadoutCostCapTop);
    expect(loadoutCostCap(s, content, 'logging')).toBeGreaterThan(A.loadoutCostCapTop);
  });
});

describe('skill points are derived (DESIGN.md §10)', () => {
  it('are the level, the achievements and the stage stars', () => {
    const s = newGame();
    s.account.level = 4;
    expect(skillPoints(s, content).total).toBe(3 * A.levels.skillPointsPerLevel);
    s.achievements['first_harvest'] = 1;
    s.achievements['first_kill'] = 1;
    expect(skillPoints(s, content).total).toBe(
      3 * A.levels.skillPointsPerLevel + 2 * A.levels.pointsPerAchievement,
    );
  });
});

describe('the tree is generated on one skeleton', () => {
  it('has the six branches on the same skeleton, about fifteen skills each', () => {
    for (const branch of SKILL_BRANCHES) {
      const own = A.tree.filter((n) => n.branch === branch && !n.circle);
      expect(own, branch).toHaveLength(A.skeleton.length);
      expect(own.map((n) => [n.ring, n.kind, n.requires.length])).toEqual(
        A.skeleton.map((s) => [s.ring, s.kind, s.requires.length]),
      );
    }
    expect(A.skeleton.length).toBeGreaterThanOrEqual(12);
    expect(A.skeleton.length).toBeLessThanOrEqual(18);
  });

  it('has one keystone per branch and unique ids, and every requirement exists in the same branch', () => {
    const ids = new Set(A.tree.map((n) => n.id));
    expect(ids.size).toBe(A.tree.length);
    for (const branch of SKILL_BRANCHES) {
      expect(
        A.tree.filter((n) => n.branch === branch && n.kind === 'keystone' && !n.circle),
      ).toHaveLength(1);
    }
    for (const n of A.tree)
      for (const r of n.requires) expect(ids.has(r), `${n.id} needs ${r}`).toBe(true);
  });

  it('opens ring 0 from the start and ring N with Ascension N', () => {
    const s = withPoints(40);
    const infoOf = (st: GameState, id: string) =>
      skillTree(st, content).find((i) => i.node.id === id)!;
    expect(infoOf(s, 'logging_s1').open).toBe(true);
    expect(infoOf(s, 'logging_s9').open).toBe(false);
    expect(buySkill(s, content, 'logging_s9')).toEqual({ ok: false, reason: 'closed' });
    s.prestigeCount = 3;
    expect(infoOf(s, 'logging_s9').open).toBe(true);
    s.account.skills['logging_s1'] = 1;
    s.account.skills['logging_s2'] = 1;
    s.account.skills['logging_s3'] = 1;
    s.account.skills['logging_s6'] = 1;
    expect(buySkill(s, content, 'logging_s9').ok).toBe(true);
  });

  it('keeps ranks and costs: a large skill costs more per rank than a small one', () => {
    expect(node('logging_l1').cost).toBeGreaterThan(node('logging_s1').cost);
    expect(node('logging_k').maxRank).toBe(1);
  });
});

describe('hidden weapon circles', () => {
  const swordCard = content.cards.find((c) => c.item.kind === 'sword')!.id;
  const own = (s: GameState, tier: GameState['cards']['owned'][string]['tier']) => {
    s.cards.owned[swordCard] = {
      tier,
      stars: 1,
      level: 1,
      xp: new Decimal(0),
      starFill: 0,
      enhancements: [],
    };
  };

  it('has one circle per item type, hidden until a card of the type is Gold', () => {
    const s = newGame();
    const circles = weaponCircles(s, content);
    expect(circles.map((c) => c.kind)).toEqual(content.items.types.map((t) => t.kind));
    expect(circles.every((c) => !c.revealed)).toBe(true);
    own(s, 'silver');
    expect(weaponCircles(s, content).find((c) => c.kind === 'sword')!.revealed).toBe(false);
    own(s, 'gold');
    const sword = weaponCircles(s, content).find((c) => c.kind === 'sword')!;
    expect(sword.revealed).toBe(true);
    expect(sword.step).toBe('gold');
  });

  it('opens further steps at Prismatic, Mythic and the Heirloom, and stays open', () => {
    const s = newGame();
    s.account.level = 40;
    own(s, 'gold');
    const open = (id: string) => skillTree(s, content).find((i) => i.node.id === id)!.open;
    expect(open('sword_edge')).toBe(true);
    expect(open('sword_flurry')).toBe(false);
    own(s, 'prismatic');
    expect(open('sword_flurry')).toBe(true);
    expect(open('sword_light')).toBe(false);
    own(s, 'mythic');
    expect(open('sword_light')).toBe(true);
    expect(open('sword_heirloom')).toBe(false);
    own(s, 'heirloom');
    expect(open('sword_heirloom')).toBe(true);
    // an Ascension never touches cards, so the circle is still open after one
    s.prestigeCount += 1;
    expect(open('sword_heirloom')).toBe(true);
  });

  it('a circle skill cannot be bought while its circle is hidden', () => {
    const s = withPoints(10);
    expect(buySkill(s, content, 'sword_edge')).toEqual({ ok: false, reason: 'closed' });
    own(s, 'gold');
    expect(buySkill(s, content, 'sword_edge').ok).toBe(true);
  });

  it('the sword circle has about ten skills across the four steps', () => {
    const sword = A.tree.filter((n) => n.circle === 'sword');
    expect(sword.length).toBeGreaterThanOrEqual(8);
    expect(new Set(sword.map((n) => n.step))).toEqual(
      new Set(['gold', 'prismatic', 'mythic', 'heirloom']),
    );
  });
});

describe('fitting bought ranks to the points earned', () => {
  it('maps the old nodes onto the new tree', () => {
    const s = withPoints(30);
    const fit = fitSkillsToPoints(s, content, {
      grove_yield: 2,
      grove_rhythm: 1,
      might: 3,
      nonsense: 4,
    });
    expect(fit).toEqual({ logging_s1: 2, logging_s2: 1, combat_s1: 3 });
  });

  it('drops a mapped rank whose requirement was never bought', () => {
    const s = withPoints(30);
    // wide_groves needed only grove_yield before; the new node also needs grove_rhythm
    const fit = fitSkillsToPoints(s, content, { grove_yield: 1, wide_groves: 2 });
    expect(fit).toEqual({ logging_s1: 1 });
  });

  it('never leaves more ranks than points: the last bought go first', () => {
    const s = withPoints(3);
    const fit = fitSkillsToPoints(s, content, { logging_s1: 2, logging_s2: 2, logging_s3: 2 });
    const spent = Object.entries(fit).reduce((a, [id, r]) => a + r * node(id).cost, 0);
    expect(spent).toBeLessThanOrEqual(3);
    for (const [id, r] of Object.entries(fit)) {
      for (const req of node(id).requires)
        expect(fit[req] ?? 0, `${id} needs ${req}`).toBeGreaterThan(0);
      expect(r).toBeGreaterThan(0);
    }
  });

  it('drops skills of a closed ring or a hidden circle', () => {
    const s = withPoints(30);
    const fit = fitSkillsToPoints(s, content, { logging_s1: 1, logging_s9: 1, sword_edge: 1 });
    expect(fit).toEqual({ logging_s1: 1 });
  });

  it('keeps a fitting save as it is', () => {
    const s = freshState();
    s.account.level = 20;
    const bought = { logging_s1: 3, logging_s2: 2, combat_s1: 4 };
    expect(fitSkillsToPoints(s, content, bought)).toEqual(bought);
  });
});
