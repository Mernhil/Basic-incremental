import { describe, expect, it } from 'vitest';
import {
  accountInfo,
  accountLevel,
  advance,
  ascend,
  buySkill,
  cardEnhancements,
  checkAchievements,
  chooseEnhancement,
  collectModifiers,
  createSaveText,
  CURRENT_SAVE_VERSION,
  Decimal,
  loadoutCostCap,
  MIGRATIONS,
  pull,
  readSave,
  resetEnhancements,
  respecInfo,
  respecSkills,
  rewardTrack,
  skillTree,
  xpToNextAccountLevel,
  type GameState,
} from '../src/game';
import { bareState, constantRng, content, freshState, newGame } from './helpers';

const A = content.account;

/** A state with `points` skill points to spend (its level set to match). */
function withPoints(points: number): GameState {
  const state = freshState();
  state.account.level = 1 + points / A.levels.skillPointsPerLevel;
  return state;
}

describe('account XP (DESIGN.md 10a, 12.4)', () => {
  it('a new game is level 1 with no XP or skill points', () => {
    const info = accountInfo(newGame(), content);
    expect(info).toMatchObject({ level: 1, maxLevel: A.levels.maxLevel, progress: 0 });
    expect(info.xp.toNumber()).toBe(0);
    expect(info.xpToNext!.eq(A.levels.xpBase)).toBe(true);
    expect(info.skillPoints).toEqual({ total: 0, spent: 0, available: 0 });
  });

  it('XP to the next level grows: quick early, slow later', () => {
    const early = xpToNextAccountLevel(content, 1).toNumber();
    const late = xpToNextAccountLevel(content, 30).toNumber();
    expect(early).toBe(A.levels.xpBase.toNumber());
    expect(late / early).toBeCloseTo(A.levels.xpGrowth.toNumber() ** 29, 6);
  });

  it('comes from harvests, weighted by gem tier', () => {
    const state = bareState();
    const after = advance(state, content, 10_000, constantRng(0.5)).state;
    const oak = after.mastery.harvested['oak_gem']!.toNumber();
    const copper = after.mastery.harvested['copper_gem']!.toNumber();
    const expected =
      oak * A.xp.perUnit.logging.toNumber() + copper * A.xp.perUnit.mining.toNumber();
    expect(after.account.xp.toNumber()).toBeCloseTo(expected, 6);
  });

  it('comes from kills, more for harder dungeons', () => {
    const state = bareState();
    state.production.logging.plots = [];
    state.production.mining.plots = [];
    state.combat.damageLevels = { copper_edge: 200 };
    const { state: after, report } = advance(state, content, 3_000, constantRng(0.5));
    expect(report.bossKills).toBeGreaterThan(0);
    expect(after.account.xp.toNumber()).toBeCloseTo(report.bossKills * A.xp.perKill.toNumber(), 6);
  });

  it('comes from pulls and ascensions', () => {
    const state = freshState();
    state.resources['moss_sigil'] = new Decimal(10);
    const pulled = pull(state, content, 'card_portal', 1, constantRng(0.5));
    if (!pulled.ok) throw new Error(pulled.reason);
    expect(pulled.state.account.xp.eq(A.xp.perPull)).toBe(true);

    const run = freshState();
    run.mastery.harvested['oak_gem'] = new Decimal(1e9);
    const ascended = ascend(run, content);
    if (!ascended.ok) throw new Error(ascended.reason);
    expect(ascended.state.account.xp.eq(A.xp.perAscension)).toBe(true);
  });

  it('goes through xp.account', () => {
    const state = bareState();
    state.account.skills['renown'] = 2;
    const boosted = advance(state, content, 10_000, constantRng(0.5)).state;
    const plain = advance(bareState(), content, 10_000, constantRng(0.5)).state;
    expect(boosted.account.xp.div(plain.account.xp).toNumber()).toBeCloseTo(1.1, 6);
  });
});

describe('account levels and the reward track (DESIGN.md 16 E7, 11.9)', () => {
  it('levels up on the whole-second grid and reports it with the rewards', () => {
    const state = freshState();
    state.account.xp = xpToNextAccountLevel(content, 1).add(xpToNextAccountLevel(content, 2));
    const { state: after, report } = advance(state, content, 1000, constantRng(0.5));
    expect(after.account.level).toBe(3);
    expect(report.accountLevel).toEqual({ from: 1, to: 3 });
    expect(accountInfo(after, content).skillPoints.total).toBe(2 * A.levels.skillPointsPerLevel);
  });

  it('grows the loadout cost cap by 2 a level, plus the track bumps', () => {
    const state = freshState();
    state.account.level = 2;
    const base = content.cardRules.costCap.base;
    expect(loadoutCostCap(state, content, 'fighting')).toBe(base + 2);
    state.account.level = 3; // the track's first cost cap bump
    const bump = A.rewardTrack.find((e) => e.level === 3)!.costCap;
    expect(loadoutCostCap(state, content, 'fighting')).toBe(base + 4 + bump);
  });

  it('grants sigils every 5 levels and a cosmetic every 10', () => {
    const state = freshState();
    state.account.level = 4;
    state.account.xp = xpToNextAccountLevel(content, 4);
    const at5 = advance(state, content, 1000, constantRng(0.5)).state;
    const sigils = A.rewardTrack.find((e) => e.level === 5)!.resources[0]!;
    expect(at5.resources[sigils.resource]!.gte(sigils.amount)).toBe(true);

    const nine = freshState();
    nine.account.level = 9;
    nine.account.xp = xpToNextAccountLevel(content, 9);
    const at10 = advance(nine, content, 1000, constantRng(0.5)).state;
    const cosmetic = A.rewardTrack.find((e) => e.level === 10)!.cosmetics[0]!;
    expect(at10.cosmetics.owned[cosmetic]).toBeDefined();
  });

  it('lists every level of the track with what it gives and whether it is reached', () => {
    const state = freshState();
    state.account.level = 6;
    const track = rewardTrack(state, content);
    expect(track[0]!.level).toBe(2);
    expect(track).toHaveLength(A.levels.maxLevel - 1);
    expect(track.every((e) => e.skillPoints === A.levels.skillPointsPerLevel)).toBe(true);
    expect(track.find((e) => e.level === 5)).toMatchObject({ reached: true });
    expect(track.find((e) => e.level === 10)).toMatchObject({ reached: false });
  });

  it('stops at the max level', () => {
    const state = freshState();
    state.account.level = A.levels.maxLevel;
    state.account.xp = new Decimal(1e30);
    const after = advance(state, content, 1000, constantRng(0.5)).state;
    expect(after.account.level).toBe(A.levels.maxLevel);
    expect(accountInfo(after, content).xpToNext).toBeNull();
  });

  it('accountLevel reads the state', () => {
    const state = freshState();
    state.account.level = 7;
    expect(accountLevel(state)).toBe(7);
  });
});

describe('account tree (DESIGN.md 10a)', () => {
  it('has the six branches', () => {
    const branches = new Set(skillTree(freshState(), content).map((n) => n.node.branch));
    expect([...branches].sort()).toEqual(
      ['automation', 'collection', 'combat', 'logging', 'luck', 'mining'].sort(),
    );
  });

  it('buys ranks with skill points; effects are skill modifiers that grow per rank', () => {
    const result = buySkill(withPoints(3), content, 'might');
    if (!result.ok) throw new Error(result.reason);
    const again = buySkill(result.state, content, 'might');
    if (!again.ok) throw new Error(again.reason);
    expect(again.state.account.skills['might']).toBe(2);
    const mods = collectModifiers(again.state, content).filter((m) => m.source.kind === 'skill');
    const might = A.tree.find((n) => n.id === 'might')!;
    expect(mods).toEqual([
      expect.objectContaining({ stat: 'combat.damage', source: { kind: 'skill', id: 'might' } }),
    ]);
    expect(mods[0]!.value.toNumber()).toBe(might.perRank[0]!.value.toNumber() * 2);
    expect(accountInfo(again.state, content).skillPoints).toEqual({
      total: 3,
      spent: 2,
      available: 1,
    });
  });

  it('needs the node before it, free points and room below the max rank', () => {
    expect(buySkill(withPoints(5), content, 'keen_eye')).toEqual({ ok: false, reason: 'locked' });
    expect(buySkill(withPoints(0), content, 'might')).toEqual({ ok: false, reason: 'no-points' });
    const maxed = withPoints(10);
    maxed.account.skills['might'] = A.tree.find((n) => n.id === 'might')!.maxRank;
    expect(buySkill(maxed, content, 'might')).toEqual({ ok: false, reason: 'maxed' });
    expect(buySkill(maxed, content, 'nope')).toEqual({ ok: false, reason: 'unknown' });
    const tree = skillTree(maxed, content);
    expect(tree.find((n) => n.node.id === 'keen_eye')).toMatchObject({ requiresMet: true });
  });

  it('crit nodes raise crit chance and damage (DESIGN.md 11.11)', () => {
    const state = withPoints(10);
    state.account.skills = { might: 1, keen_eye: 2, brutal: 1 };
    const mods = collectModifiers(state, content).filter((m) => m.source.kind === 'skill');
    expect(mods.map((m) => m.stat)).toEqual(
      expect.arrayContaining(['combat.critChance', 'combat.critDamage']),
    );
  });

  it('respecs for free once per ascension, then for Starlight (DESIGN.md 12.1)', () => {
    const state = withPoints(4);
    state.account.skills = { might: 2 };
    expect(respecInfo(state, content)).toEqual({ free: true, price: null, refund: 2 });
    const free = respecSkills(state, content);
    if (!free.ok) throw new Error(free.reason);
    expect(free.state.account.skills).toEqual({});
    free.state.account.skills = { vigor: 1 };
    const info = respecInfo(free.state, content);
    expect(info.free).toBe(false);
    expect(info.price!.resource).toBe(content.prestige.currency);
    expect(respecSkills(free.state, content)).toEqual({ ok: false, reason: 'unaffordable' });
    free.state.resources[content.prestige.currency] = new Decimal(100);
    const paid = respecSkills(free.state, content);
    if (!paid.ok) throw new Error(paid.reason);
    expect(paid.state.resources[content.prestige.currency]!.toNumber()).toBe(
      100 - A.respec.cost.toNumber(),
    );
    expect(respecSkills(paid.state, content)).toEqual({ ok: false, reason: 'nothing' });
  });

  it('the free respec comes back with each ascension', () => {
    const state = withPoints(4);
    state.account.freeRespecsUsed = 1;
    state.mastery.harvested['oak_gem'] = new Decimal(1e9);
    const result = ascend(state, content);
    if (!result.ok) throw new Error(result.reason);
    expect(result.state.account.freeRespecsUsed).toBe(0);
    expect(result.state.account.skills).toEqual(state.account.skills);
  });

  it('Skilled unlocks once 10 skill points are spent', () => {
    const state = newGame();
    state.account.level = 11;
    state.account.skills = { might: 5, vigor: 5 };
    expect(checkAchievements(state, content).unlocked).toContain('skilled');
  });
});

describe('card enhancements (DESIGN.md 10b, 12.2, 12.3)', () => {
  const silver = (): GameState => {
    const state = freshState();
    state.cards.owned['ember_squire']!.tier = 'silver';
    return state;
  };

  it('unlock at Silver ★1 with a budget that grows by tier', () => {
    const bronze = cardEnhancements(freshState(), content, 'ember_squire')!;
    expect(bronze.unlocked).toBe(false);
    expect(bronze.unlockRank).toEqual({ tier: 'silver', stars: 1 });
    const info = cardEnhancements(silver(), content, 'ember_squire')!;
    expect(info.unlocked).toBe(true);
    expect(info.budget).toBe(content.enhancements.budget.silver);
    expect(info.spent).toBe(0);
    expect(content.enhancements.budget.gold).toBeGreaterThan(info.budget);
  });

  it('give each card its own options costing about twice the top budget', () => {
    const top = content.enhancements.budget.prismatic;
    for (const card of content.cards) {
      const options = content.enhancements.cards[card.id]!;
      expect(options.length, card.id).toBeGreaterThanOrEqual(3);
      const total = options.reduce((a, o) => a + o.cost, 0);
      expect(total / top, card.id).toBeGreaterThanOrEqual(1.6);
      expect(total / top, card.id).toBeLessThanOrEqual(2.4);
    }
  });

  it('choose options within the budget; effects apply while the card is in a loadout', () => {
    const option = content.enhancements.cards['ember_squire']![0]!;
    const result = chooseEnhancement(silver(), content, 'ember_squire', option.id);
    if (!result.ok) throw new Error(result.reason);
    expect(result.state.cards.owned['ember_squire']!.enhancements).toEqual([option.id]);
    const mods = collectModifiers(result.state, content).filter(
      (m) => m.source.kind === 'enhancement',
    );
    expect(mods).toHaveLength(option.modifiers.length);
    expect(mods[0]!.source.id).toBe(`ember_squire:${option.id}`);

    const benched = result.state;
    benched.cards.loadouts.fighting.main = null;
    expect(
      collectModifiers(benched, content).filter((m) => m.source.kind === 'enhancement'),
    ).toHaveLength(0);
  });

  it('refuse locked cards, over-budget picks, repeats and unknown options', () => {
    const first = content.enhancements.cards['ember_squire']![0]!.id;
    expect(chooseEnhancement(freshState(), content, 'ember_squire', first)).toEqual({
      ok: false,
      reason: 'locked',
    });
    const once = chooseEnhancement(silver(), content, 'ember_squire', first);
    if (!once.ok) throw new Error(once.reason);
    expect(chooseEnhancement(once.state, content, 'ember_squire', first)).toEqual({
      ok: false,
      reason: 'already',
    });
    const costly = content.enhancements.cards['ember_squire']!.find(
      (o) => o.id !== first && o.cost + content.enhancements.cards['ember_squire']![0]!.cost > 4,
    )!;
    expect(chooseEnhancement(once.state, content, 'ember_squire', costly.id)).toEqual({
      ok: false,
      reason: 'over-budget',
    });
    expect(chooseEnhancement(silver(), content, 'ember_squire', 'nope')).toEqual({
      ok: false,
      reason: 'unknown',
    });
  });

  it('respec for free', () => {
    const first = content.enhancements.cards['ember_squire']![0]!.id;
    const chosen = chooseEnhancement(silver(), content, 'ember_squire', first);
    if (!chosen.ok) throw new Error(chosen.reason);
    const reset = resetEnhancements(chosen.state, content, 'ember_squire');
    expect(reset.cards.owned['ember_squire']!.enhancements).toEqual([]);
  });
});

describe('saving (save format v13)', () => {
  it('round-trips the account and card enhancements', () => {
    const state = freshState();
    state.account = {
      xp: new Decimal(42),
      level: 6,
      skills: { might: 2, gone: 1 },
      freeRespecsUsed: 1,
    };
    state.cards.owned['ember_squire']!.tier = 'silver';
    state.cards.owned['ember_squire']!.enhancements = ['edge', 'nope'];
    const loaded = readSave(createSaveText(state, 1), content).state;
    expect(loaded.account.xp.toNumber()).toBe(42);
    expect(loaded.account.level).toBe(6);
    expect(loaded.account.skills).toEqual({ might: 2 });
    expect(loaded.account.freeRespecsUsed).toBe(1);
    expect(loaded.cards.owned['ember_squire']!.enhancements).toEqual(['edge']);
  });

  it('migrates v12 -> v13: level 1, no skills, no enhancements', () => {
    expect(CURRENT_SAVE_VERSION).toBeGreaterThanOrEqual(13);
    const migrated = MIGRATIONS[12]!({
      cards: {
        owned: { ember_squire: { tier: 'bronze', stars: 1, level: 1, xp: '0', duplicates: 0 } },
        loadouts: {},
        shards: 0,
      },
    });
    expect(migrated['account']).toEqual({ xp: '0', level: 1, skills: {}, freeRespecsUsed: 0 });
    expect(migrated['cards']).toEqual({
      owned: {
        ember_squire: {
          tier: 'bronze',
          stars: 1,
          level: 1,
          xp: '0',
          duplicates: 0,
          enhancements: [],
        },
      },
      loadouts: {},
      shards: 0,
    });
  });
});
