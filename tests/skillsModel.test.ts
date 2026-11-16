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
  AREA_COLOUR,
  AREA_DEGREES,
  DEPTH_STEP,
  LATERAL,
  SKY,
  respecView,
  starChartView,
  treeView,
} from '../src/renderer/src/pages/skillsModel';
import { effectText } from '../src/renderer/src/shell/modifierText';
import { createCardsModel } from '../src/renderer/src/pages/cardsAdapter';
import { content as bundled, freshState, levelPointsOnly } from './helpers';

const content = levelPointsOnly(bundled);

/** The tree without its weapon circles, which are hidden on a new game. */
const branchNodes = content.account.tree.filter((n) => !n.circle);

const view = (s: GameState) => treeView(content, skillTree(s, content), skillPoints(s, content));
/** Every skill of the branches learned one rank: the whole tree is known, so all of it is in view. */
const fullyKnown = (): GameState => {
  const s = freshState();
  s.account.skills = Object.fromEntries(branchNodes.map((n) => [n.id, 1]));
  return s;
};

describe('web layout', () => {
  const areaOf = (branch: string) =>
    content.account.branches.find((x) => x.branch === branch)!.area;

  it('places every node inside the sky, along its area, with room for a plate and its name', () => {
    const v = view(fullyKnown());
    // the weapon circles are hidden on a new game: only their outlines are in the view
    expect(v.nodes).toHaveLength(branchNodes.length);
    expect(v.circles).toHaveLength(0);
    expect(v.branches.map((b) => b.id)).toEqual([...SKILL_BRANCHES]);
    for (const n of v.nodes) {
      expect(n.x).toBeGreaterThan(SKY.x);
      expect(n.x).toBeLessThan(SKY.x + SKY.w);
      expect(n.y).toBeGreaterThan(SKY.y);
      expect(n.y).toBeLessThan(SKY.y + SKY.h);
      // in the area's half of the web, in the area's colour
      const deg = AREA_DEGREES[areaOf(n.branch)];
      const along = n.x * Math.cos((deg * Math.PI) / 180) + n.y * Math.sin((deg * Math.PI) / 180);
      expect(along).toBeGreaterThan(0);
      expect(n.colour).toBe(AREA_COLOUR[areaOf(n.branch)]);
    }
    // the spacing of pick 4a: no two skills closer than a plate and a name need
    const min = Math.min(LATERAL, DEPTH_STEP) - 10;
    for (const a of v.nodes) {
      for (const b of v.nodes) {
        if (a === b) continue;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(min);
      }
    }
  });

  it('puts a node further out than what it requires, along its area', () => {
    const v = view(fullyKnown());
    const along = (id: string) => {
      const n = v.nodes.find((x) => x.id === id)!;
      const deg = (AREA_DEGREES[areaOf(n.branch)] * Math.PI) / 180;
      return n.x * Math.cos(deg) + n.y * Math.sin(deg);
    };
    expect(along('logging_s3')).toBeGreaterThan(along('logging_s2'));
    expect(along('combat_s6')).toBeGreaterThan(along('combat_s3'));
    expect(along('combat_k')).toBeGreaterThan(along('combat_l3'));
    // the keystone is the furthest of its branch
    const furthest = Math.max(
      ...branchNodes.filter((n) => n.branch === 'combat').map((n) => along(n.id)),
    );
    expect(along('combat_k')).toBe(furthest);
  });

  it('gives every branch an area, and the four areas their own direction', () => {
    expect(new Set(content.account.branches.map((b) => b.area)).size).toBe(4);
    expect(new Set(Object.values(AREA_DEGREES)).size).toBe(4);
  });

  it('draws an edge per requirement, plus one from the centre for each root', () => {
    const v = view(fullyKnown());
    const roots = branchNodes.filter((n) => n.requires.length === 0).length;
    const links = branchNodes.reduce((a, n) => a + n.requires.length, 0);
    expect(v.edges).toHaveLength(roots + links);
  });
});

describe('node states and effects', () => {
  it('goes locked -> open -> owned -> maxed with the right wording', () => {
    const s = freshState();
    s.account.level = 20;
    let v = view(s);
    const node = (id: string) => v.nodes.find((n) => n.id === id)!;
    expect(node('logging_s1').state).toBe('open');
    expect(node('logging_s1').canBuy).toBe(true);
    // a skill next to a known one is a "?": its name and effect stay hidden until it is open
    expect(node('logging_s2').state).toBe('unknown');
    expect(node('logging_s2').name).toBe('Unknown skill');
    expect(node('logging_s2').now).toEqual([]);
    expect(node('logging_s2').next).toEqual([]);
    expect(node('logging_s2').canBuy).toBe(false);
    expect(node('logging_s1').now).toEqual([]);
    expect(node('logging_s1').next).toEqual(['+5% logging production']);

    s.account.skills = { logging_s1: 2 };
    v = view(s);
    expect(node('logging_s1').state).toBe('owned');
    expect(node('logging_s1').now).toEqual(['+10% logging production']);
    expect(node('logging_s1').next).toEqual(['+15% logging production']);
    expect(node('logging_s1').rankText).toBe('2/5');
    expect(node('logging_s2').state).toBe('open');
    expect(v.edges.filter((e) => e.lit)).toHaveLength(1);
    // the link from the centre to a learned root is learned, the next link is open, the rest locked
    expect(v.edges.filter((e) => e.state === 'learned')).toHaveLength(1);
    expect(v.edges.filter((e) => e.state === 'open').length).toBeGreaterThan(1);
    expect(v.edges.filter((e) => e.state === 'locked').length).toBeGreaterThan(0);
    expect(v.learned).toBe(1);
    expect(v.total).toBe(branchNodes.length);
    expect(v.branches.find((b) => b.id === 'logging')!.learned).toBe(1);

    s.account.skills = { logging_s1: 5 };
    v = view(s);
    expect(node('logging_s1').state).toBe('maxed');
    expect(node('logging_s1').next).toEqual([]);
    expect(node('logging_s1').canBuy).toBe(false);
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

    s.account.skills = { logging_s1: 3 };
    r = respecView(content, s, respecInfo(s, content));
    expect(r.enabled).toBe(true);
    expect(r.free).toBe(true);
    expect(r.button).toBe('Respec for free');
    expect(r.confirmTitle).toBe('Refund 3 points?');

    const after = respecSkills(s, content);
    if (!after.ok) throw new Error('respec failed');
    after.state.account.skills = { logging_s1: 1 };
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
  const own = (
    s: GameState,
    tier: 'wood' | 'bronze' | 'silver' | 'gold',
    chosen: string[] = [],
    level = 1,
  ) => {
    s.cards.owned[cardId] = {
      tier,
      stars: 1,
      level,
      xp: new Decimal(0),
      starFill: 0,
      enhancements: chosen,
    };
  };

  // a content where Wood has no points: the card shows its chart locked
  const closed = {
    ...content,
    enhancements: {
      ...content.enhancements,
      budget: { ...content.enhancements.budget, wood: 0 },
      unlockRank: { tier: 'bronze' as const, stars: 1 },
    },
  };

  it('is locked below its unlock rank', () => {
    const s = freshState();
    own(s, 'wood');
    const v = starChartView(cardEnhancements(s, closed, cardId)!);
    expect(v.unlocked).toBe(false);
    expect(v.lockedText).toContain('Bronze ★1');
    expect(v.stars.every((x) => x.state === 'locked')).toBe(true);
    expect(v.canReset).toBe(false);
  });

  it('chooses and resets through the Cards model, with readable refusals', () => {
    const s = freshState();
    own(s, 'wood');
    const option = content.enhancements.cards[cardId]![0]!.id;
    const refused = createCardsModel(closed).enhance(s, cardId, option);
    expect(refused).toEqual({ ok: false, reason: 'Enhancements are not open for this card yet.' });

    const model = createCardsModel(content);
    own(s, 'gold');
    const early = model.enhance(s, cardId, content.enhancements.cards[cardId]!.at(-1)!.id);
    expect(early).toEqual({ ok: false, reason: 'That option opens at a higher card level.' });
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
    const options = content.enhancements.cards[cardId]!.filter((o) => o.milestone === 0);
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
    const onChart = v.stars.filter((x) => x.onChart);
    expect(onChart).toHaveLength(options.length);
    expect(v.links).toHaveLength(options.length - 1);
    expect(v.links.some((l) => l.lit)).toBe(false);
    expect(v.canReset).toBe(true);
    for (const st of onChart) {
      expect(st.x).toBeGreaterThan(0);
      expect(st.y).toBeGreaterThan(0);
    }
  });

  it('shows a milestone option as locked with the level that opens it, and open once reached', () => {
    const s = freshState();
    own(s, 'gold', [], 19);
    const v = starChartView(cardEnhancements(s, content, cardId)!);
    const milestone = v.stars.find((x) => x.unlockLevel === 20)!;
    expect(milestone.state).toBe('level');
    expect(milestone.onChart).toBe(false);
    expect(milestone.levelText).toBe('Opens at level 20');
    expect(milestone.label).toContain('Opens at level 20');
    own(s, 'gold', [], 20);
    const open = starChartView(cardEnhancements(s, content, cardId)!);
    expect(open.stars.find((x) => x.unlockLevel === 20)!.state).toBe('open');
    expect(open.stars.find((x) => x.unlockLevel === 40)!.levelText).toBe('Opens at level 40');
  });
});

describe('the web shows what you know and its "?" neighbours (UI_RULES, The Skill Tree, pick 4a)', () => {
  it('starts with the open roots and the "?" next to them, and nothing further out', () => {
    const v = view(freshState());
    const open = v.nodes.filter((n) => n.state === 'open');
    const unknown = v.nodes.filter((n) => n.state === 'unknown');
    expect(open.length).toBe(SKILL_BRANCHES.length);
    expect(unknown.length).toBeGreaterThan(0);
    // a "?" is never a root, and its parent is in view
    const ids = new Set(v.nodes.map((n) => n.id));
    for (const n of unknown) {
      const req = content.account.tree.find((x) => x.id === n.id)!.requires;
      expect(req.length).toBeGreaterThan(0);
      expect(req.some((r) => ids.has(r))).toBe(true);
    }
    expect(v.nodes.length).toBeLessThan(branchNodes.length);
    // nothing in view is hidden behind two unknown skills
    expect(v.nodes.every((n) => n.glyph.length > 0)).toBe(true);
  });

  it('counts what can be learned now, and opens the next "?" when a skill is learned', () => {
    const s = freshState();
    s.account.level = 20;
    const before = view(s);
    expect(before.affordable).toBe(before.nodes.filter((n) => n.canBuy).length);
    expect(before.affordable).toBeGreaterThan(0);
    s.account.skills = { logging_s1: 1 };
    const after = view(s);
    expect(after.nodes.find((n) => n.id === 'logging_s2')!.state).toBe('open');
    expect(after.nodes.find((n) => n.id === 'logging_s2')!.name).toBe('Grove Rhythm');
    expect(after.nodes.length).toBeGreaterThan(before.nodes.length);
  });
});
