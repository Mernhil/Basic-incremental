import { describe, expect, it } from 'vitest';
import { SKILL_BRANCHES } from '../src/data';
import {
  Decimal,
  cardEnhancements,
  respecInfo,
  respecSkills,
  skillPoints,
  skillTree,
  type GameState,
} from '../src/game';
import {
  CENTRE,
  SKY,
  branchAngle,
  respecView,
  starChartView,
  treeView,
} from '../src/renderer/src/pages/skillsModel';
import { effectText } from '../src/renderer/src/shell/modifierText';
import { createCardsModel } from '../src/renderer/src/pages/cardsAdapter';
import { content, freshState } from './helpers';

const view = (s: GameState) => treeView(content, skillTree(s, content), skillPoints(s, content));

describe('constellation layout', () => {
  it('places every node inside the sky, on its own branch ray, without overlaps', () => {
    const v = view(freshState());
    expect(v.nodes).toHaveLength(content.account.tree.length);
    expect(v.branches.map((b) => b.id)).toEqual([...SKILL_BRANCHES]);
    for (const n of v.nodes) {
      expect(n.x).toBeGreaterThan(SKY.x);
      expect(n.x).toBeLessThan(SKY.x + SKY.w);
      expect(n.y).toBeGreaterThan(SKY.y);
      expect(n.y).toBeLessThan(SKY.y + SKY.h);
      // within 30 degrees of its branch ray
      const deg = (Math.atan2(n.y - CENTRE.y, n.x - CENTRE.x) * 180) / Math.PI;
      const off = ((deg - branchAngle(n.branch) + 540) % 360) - 180;
      expect(Math.abs(off)).toBeLessThan(30);
    }
    for (const a of v.nodes) {
      for (const b of v.nodes) {
        if (a === b) continue;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(55);
      }
    }
  });

  it('puts a node further out than what it requires', () => {
    const v = view(freshState());
    const r = (id: string) => {
      const n = v.nodes.find((x) => x.id === id)!;
      return Math.hypot(n.x - CENTRE.x, n.y - CENTRE.y);
    };
    expect(r('grove_rhythm')).toBeGreaterThan(r('grove_yield'));
    expect(r('grove_bounty')).toBeGreaterThan(r('grove_rhythm'));
    expect(r('brutal')).toBeGreaterThan(r('keen_eye'));
  });

  it('draws an edge per requirement, plus one from the centre for each root', () => {
    const v = view(freshState());
    const roots = content.account.tree.filter((n) => n.requires.length === 0).length;
    const links = content.account.tree.reduce((a, n) => a + n.requires.length, 0);
    expect(v.edges).toHaveLength(roots + links);
    expect(v.edges.every((e) => !e.lit)).toBe(true);
  });
});

describe('node states and effects', () => {
  it('goes locked -> open -> owned -> maxed with the right wording', () => {
    const s = freshState();
    s.account.level = 20;
    let v = view(s);
    const node = (id: string) => v.nodes.find((n) => n.id === id)!;
    expect(node('grove_yield').state).toBe('open');
    expect(node('grove_yield').canBuy).toBe(true);
    expect(node('grove_rhythm').state).toBe('locked');
    expect(node('grove_rhythm').needs).toBe('Needs Grove Yield first');
    expect(node('grove_yield').now).toEqual([]);
    expect(node('grove_yield').next).toEqual(['+5% logging production']);

    s.account.skills = { grove_yield: 2 };
    v = view(s);
    expect(node('grove_yield').state).toBe('owned');
    expect(node('grove_yield').now).toEqual(['+10% logging production']);
    expect(node('grove_yield').next).toEqual(['+15% logging production']);
    expect(node('grove_yield').rankText).toBe('2/5');
    expect(node('grove_rhythm').state).toBe('open');
    expect(v.edges.filter((e) => e.lit)).toHaveLength(1);

    s.account.skills = { grove_yield: 5 };
    v = view(s);
    expect(node('grove_yield').state).toBe('maxed');
    expect(node('grove_yield').next).toEqual([]);
    expect(node('grove_yield').canBuy).toBe(false);
  });

  it('words effects in the units players read', () => {
    const m = (stat: string, kind: string, value: string, job?: string) =>
      effectText({
        stat: stat as never,
        kind: kind as never,
        value: new Decimal(value),
        ...(job ? { scope: { job: job as never } } : {}),
      });
    expect(m('combat.critChance', 'flat', '0.01')).toBe('+1% crit chance');
    expect(m('combat.critDamage', 'flat', '0.1')).toBe('+10% crit damage');
    expect(m('summon.pityThreshold', 'flat', '-2')).toBe('−2 pulls to pity');
    expect(m('offline.capHours', 'flat', '1')).toBe('+1 h offline cap');
    expect(m('cost.growth', 'percent', '-1', 'logging')).toBe('−1% logging price growth');
    expect(m('burst.power', 'flat', '2', 'mining')).toBe('+2 s mining burst harvest');
  });
});

describe('respec', () => {
  it('is disabled with nothing spent, free first, then priced in Starlight', () => {
    const s = freshState();
    s.account.level = 10;
    let r = respecView(content, s, respecInfo(s, content));
    expect(r.enabled).toBe(false);
    expect(r.note).toBe('No points spent yet.');

    s.account.skills = { grove_yield: 3 };
    r = respecView(content, s, respecInfo(s, content));
    expect(r.enabled).toBe(true);
    expect(r.free).toBe(true);
    expect(r.button).toBe('Respec for free');
    expect(r.confirmTitle).toBe('Refund 3 points?');

    const after = respecSkills(s, content);
    if (!after.ok) throw new Error('respec failed');
    after.state.account.skills = { grove_yield: 1 };
    r = respecView(content, after.state, respecInfo(after.state, content));
    expect(r.free).toBe(false);
    expect(r.button).toBe(`Respec for ${content.account.respec.cost.toString()} Starlight`);
    expect(r.affordable).toBe(false);
    expect(r.enabled).toBe(false);
    expect(r.note).toContain('You need');

    after.state.resources['starlight'] = new Decimal(100);
    r = respecView(content, after.state, respecInfo(after.state, content));
    expect(r.enabled).toBe(true);
    expect(r.confirmBody).toContain('Starlight is spent');
  });
});

describe('enhancement star chart', () => {
  const cardId = Object.keys(content.enhancements.cards)[0]!;
  const own = (s: GameState, tier: 'bronze' | 'silver' | 'gold', chosen: string[] = []) => {
    s.cards.owned[cardId] = {
      tier,
      stars: 1,
      level: 1,
      xp: new Decimal(0),
      starFill: 0,
      enhancements: chosen,
    };
  };

  it('is locked below Silver ★1', () => {
    const s = freshState();
    own(s, 'bronze');
    const v = starChartView(cardEnhancements(s, content, cardId)!);
    expect(v.unlocked).toBe(false);
    expect(v.lockedText).toContain('Silver ★1');
    expect(v.stars.every((x) => x.state === 'locked')).toBe(true);
    expect(v.canReset).toBe(false);
  });

  it('chooses and resets through the Cards model, with readable refusals', () => {
    const model = createCardsModel(content);
    const s = freshState();
    own(s, 'bronze');
    const option = content.enhancements.cards[cardId]![0]!.id;
    const refused = model.enhance(s, cardId, option);
    expect(refused).toEqual({ ok: false, reason: 'Enhancements unlock at Silver ★1.' });

    own(s, 'gold');
    const chosen = model.enhance(s, cardId, option);
    if (!chosen.ok) throw new Error(chosen.reason);
    expect(model.chart(chosen.state, cardId)!.stars[0]!.state).toBe('chosen');
    expect(model.signature(chosen.state)).not.toBe(model.signature(s));
    const reset = model.resetEnhancements(chosen.state, cardId);
    if (!reset.ok) throw new Error(reset.reason);
    expect(model.chart(reset.state, cardId)!.spent).toBe(0);
  });

  it('lights chosen stars, the budget pips and the links between chosen stars', () => {
    const s = freshState();
    const options = content.enhancements.cards[cardId]!;
    own(s, 'gold', [options[0]!.id]);
    const v = starChartView(cardEnhancements(s, content, cardId)!);
    const budget = content.enhancements.budget.gold;
    expect(v.unlocked).toBe(true);
    expect(v.budget).toBe(budget);
    expect(v.spent).toBe(options[0]!.cost);
    expect(v.pointsText).toBe(`${options[0]!.cost} / ${budget} points`);
    expect(v.pips.filter(Boolean)).toHaveLength(options[0]!.cost);
    expect(v.stars[0]!.state).toBe('chosen');
    for (const [i, o] of options.entries()) {
      if (i === 0) continue;
      expect(v.stars[i]!.state).toBe(options[0]!.cost + o.cost <= budget ? 'open' : 'blocked');
    }
    expect(v.links).toHaveLength(options.length - 1);
    expect(v.links.some((l) => l.lit)).toBe(false);
    expect(v.canReset).toBe(true);
    for (const st of v.stars) {
      expect(st.x).toBeGreaterThan(0);
      expect(st.y).toBeGreaterThan(0);
    }
  });
});
