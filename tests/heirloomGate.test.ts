import { describe, expect, it } from 'vitest';
import {
  addHeirloomShards,
  ascend,
  buyHeirloomNode,
  cardCost,
  cardSkill,
  collectModifiers,
  createSaveText,
  createSeededRng,
  Decimal,
  heirloomCards,
  heirloomGateInfo,
  heirloomPoints,
  heirloomScrollsForAscension,
  heirloomScrollsForClear,
  heirloomTreeInfo,
  heirloomTreeModifiers,
  newOwnedCard,
  pullHeirloomGate,
  readSave,
  respecHeirloomTree,
  stageChest,
  statValue,
  weaponCircles,
  type GameState,
} from '../src/game';
import { constantRng, content, freshState } from './helpers';

const gate = content.heirlooms.gate;
const scrolls = (state: GameState, n: number): GameState => {
  state.resources['heirloom_scroll'] = new Decimal(n);
  return state;
};
const ownHeirloom = (state: GameState, id: string, stars = 1, level = 1): GameState => {
  state.cards.owned[id] = { ...newOwnedCard(), tier: 'heirloom', stars, level };
  return state;
};

describe('the 22 Heirlooms (DESIGN.md §5 Heirlooms)', () => {
  it('lists one Heirloom card per item type and side, in the shared type order', () => {
    const list = heirloomCards(content);
    expect(list).toHaveLength(22);
    expect(list.slice(0, 4).map((c) => c.name)).toEqual([
      'Solaris',
      'Nightfall',
      'Kingsoath',
      'Grimhowl',
    ]);
    for (const c of list) expect(content.heirloomTreeByCard.has(c.id), c.id).toBe(true);
  });

  it('costs 18 in the loadout and is never in a portal pool', () => {
    expect(cardCost(content, 'solaris')).toBe(18);
    const pooled = new Set(content.portals.flatMap((p) => p.pool.map((e) => e.itemId)));
    for (const c of heirloomCards(content)) expect(pooled.has(c.id)).toBe(false);
  });
});

describe('Heirloom shards (DESIGN.md §7 Heirloom Gate details)', () => {
  it('unlock at 30, then fill ★2 … ★6 at 10 / 15 / 20 / 25 / 30, then pay card shards', () => {
    const state = freshState();
    expect(addHeirloomShards(state, content, 'solaris', 29)).toMatchObject({ unlocked: false });
    expect(state.heirlooms.shards['solaris']).toBe(29);
    const unlock = addHeirloomShards(state, content, 'solaris', 1);
    expect(unlock).toMatchObject({ unlocked: true, starsGained: 0 });
    expect(state.cards.owned['solaris']).toMatchObject({ tier: 'heirloom', stars: 1, level: 1 });
    expect(addHeirloomShards(state, content, 'solaris', 100).starsGained).toBe(5);
    expect(state.cards.owned['solaris']!.stars).toBe(6);
    expect(state.heirlooms.shards['solaris']).toBeUndefined();
    const before = state.cards.shards;
    const over = addHeirloomShards(state, content, 'solaris', 3);
    expect(over.cardShards).toBe(3 * gate.cardShardsPerOverflow);
    expect(state.cards.shards).toBe(before + over.cardShards);
  });
});

describe('the Heirloom Gate (DESIGN.md §7)', () => {
  it('costs Heirloom Scrolls and refuses without them', () => {
    expect(pullHeirloomGate(freshState(), content, 1, constantRng(0.5))).toEqual({
      ok: false,
      reason: 'unaffordable',
    });
    const r = pullHeirloomGate(scrolls(freshState(), 10), content, 10, constantRng(0.5));
    expect(r.ok && r.state.resources['heirloom_scroll']!.toNumber()).toBe(0);
  });

  it('gives shards of one Heirloom on a normal pull, and counts toward pity', () => {
    const r = pullHeirloomGate(scrolls(freshState(), 1), content, 1, constantRng(0.5));
    if (!r.ok) throw new Error(r.reason);
    const [pull] = r.results;
    expect(pull!.whole).toBe(false);
    expect(pull!.shards).toBeGreaterThanOrEqual(gate.shards.min);
    expect(pull!.shards).toBeLessThanOrEqual(gate.shards.max);
    expect(r.state.heirlooms.shards[pull!.cardId]).toBe(pull!.shards);
    expect(r.state.heirlooms).toMatchObject({ pity: 1, pulls: 1 });
  });

  it('gives a whole Heirloom at the chance, which unlocks it and resets the pity', () => {
    const state = scrolls(freshState(), 1);
    state.heirlooms.pity = 7;
    const r = pullHeirloomGate(state, content, 1, constantRng(0));
    if (!r.ok) throw new Error(r.reason);
    expect(r.results[0]).toMatchObject({ whole: true, pity: false, cardId: 'solaris', stars: 1 });
    expect(r.state.cards.owned['solaris']).toMatchObject({ tier: 'heirloom', stars: 1 });
    expect(r.state.heirlooms.pity).toBe(0);
  });

  it('makes the pity pull a whole Heirloom; a repeat counts as its shards', () => {
    const state = ownHeirloom(scrolls(freshState(), 1), 'solaris');
    state.heirlooms.pity = gate.pity - 1;
    const r = pullHeirloomGate(state, content, 1, constantRng(0.01));
    if (!r.ok) throw new Error(r.reason);
    expect(r.results[0]).toMatchObject({ whole: true, pity: true, shards: gate.wholeRepeatShards });
    expect(r.state.cards.owned['solaris']!.stars).toBe(3); // 30 shards: ★2 (10) and ★3 (15)
  });

  it('lands near its odds over many pulls', () => {
    let state = scrolls(freshState(), 20000);
    const rng = createSeededRng(7);
    let whole = 0;
    for (let i = 0; i < 1000; i++) {
      const r = pullHeirloomGate(state, content, 10, rng);
      if (!r.ok) throw new Error(r.reason);
      whole += r.results.filter((p) => p.whole).length;
      state = r.state;
    }
    // 2% with a pity at 60 lands a little above 2%.
    expect(whole / 10000).toBeGreaterThan(0.02);
    expect(whole / 10000).toBeLessThan(0.035);
    expect(heirloomGateInfo(state, content).unlocked).toBe(22);
  });

  it('keeps shards, pity, trees and scrolls through an Ascension', () => {
    const state = ownHeirloom(scrolls(freshState(), 4), 'solaris', 2);
    state.heirlooms = {
      shards: { nightfall: 12 },
      pity: 9,
      pulls: 40,
      trees: { solaris: ['root'] },
    };
    state.mastery.harvested['oak_gem'] = new Decimal(1e14);
    const result = ascend(state, content);
    if (!result.ok) throw new Error(result.reason);
    expect(result.state.heirlooms).toEqual(state.heirlooms);
    expect(result.state.resources['heirloom_scroll']!.toNumber()).toBe(4);
  });
});

describe('Heirloom Scrolls (DESIGN.md §3 Where Heirloom Scrolls come from)', () => {
  const s = content.heirlooms.scrolls;
  it('pays the Nightmare last-floor boss: its first win, then a little a kill', () => {
    expect(heirloomScrollsForClear(content, 'nightmare', 'boss', 60, true, 1)).toEqual(
      s.nightmareBossFirstWin,
    );
    expect(heirloomScrollsForClear(content, 'nightmare', 'boss', 60, false, 250).toNumber()).toBe(
      s.nightmareBossKill.mul(250).toNumber(),
    );
    expect(heirloomScrollsForClear(content, 'hard', 'boss', 60, true, 1).toNumber()).toBe(0);
    expect(heirloomScrollsForClear(content, 'nightmare', 'miniboss', 10, true, 1).toNumber()).toBe(
      0,
    );
  });

  it('pays every tenth endless depth the first time, and the Nightmare Mythic chest', () => {
    expect(heirloomScrollsForClear(content, 'endless', 'wave', 20, true, 1)).toEqual(
      s.endlessDepth,
    );
    expect(heirloomScrollsForClear(content, 'endless', 'wave', 21, true, 1).toNumber()).toBe(0);
    expect(heirloomScrollsForClear(content, 'endless', 'wave', 20, false, 1).toNumber()).toBe(0);
    const top = content.combat.stageStars.chests.rewards[0]!.amounts.length;
    const chest = stageChest(content, 'nightmare', top);
    expect(chest.find((p) => p.resource === 'heirloom_scroll')?.amount).toEqual(
      s.nightmareMythicChest,
    );
    expect(stageChest(content, 'hard', top).some((p) => p.resource === 'heirloom_scroll')).toBe(
      false,
    );
  });

  it('pays each Ascension from the third', () => {
    expect(heirloomScrollsForAscension(content, 2).toNumber()).toBe(0);
    expect(heirloomScrollsForAscension(content, 3)).toEqual(s.ascension);
  });
});

describe('Heirloom trees (DESIGN.md §10 Heirloom trees)', () => {
  it('earns a point a star and one at Lv 35, 70, 105 and 140: 10 at ★6 Lv 140', () => {
    expect(heirloomPoints(content, undefined)).toBe(0);
    expect(heirloomPoints(content, { ...newOwnedCard(), tier: 'heirloom', stars: 1 })).toBe(1);
    expect(
      heirloomPoints(content, { ...newOwnedCard(), tier: 'heirloom', stars: 3, level: 70 }),
    ).toBe(5);
    expect(
      heirloomPoints(content, { ...newOwnedCard(), tier: 'heirloom', stars: 6, level: 140 }),
    ).toBe(10);
    for (const tree of content.heirlooms.trees) {
      expect(
        tree.nodes.reduce((a, n) => a + n.cost, 0),
        tree.card,
      ).toBe(10);
    }
  });

  it('buys along a path, refuses without points or the node before, and respecs for free', () => {
    let state = ownHeirloom(freshState(), 'skypiercer', 2);
    const buy = (node: string) => buyHeirloomNode(state, content, 'skypiercer', node);
    expect(buy('small_a')).toEqual({ ok: false, reason: 'locked' });
    const root = buy('root');
    if (!root.ok) throw new Error(root.reason);
    state = root.state;
    expect(buy('root')).toEqual({ ok: false, reason: 'bought' });
    const small = buy('small_a');
    if (!small.ok) throw new Error(small.reason);
    state = small.state;
    expect(buy('small_b')).toEqual({ ok: false, reason: 'points' });
    expect(heirloomTreeInfo(state, content, 'skypiercer')).toMatchObject({ earned: 2, free: 0 });
    state = respecHeirloomTree(state, 'skypiercer');
    expect(heirloomTreeInfo(state, content, 'skypiercer')).toMatchObject({ spent: 0, free: 2 });
    expect(buyHeirloomNode(freshState(), content, 'skypiercer', 'root')).toEqual({
      ok: false,
      reason: 'not-owned',
    });
  });

  it('acts only while the Heirloom is at work', () => {
    const state = ownHeirloom(freshState(), 'skypiercer', 6, 140);
    state.heirlooms.trees['skypiercer'] = ['root', 'small_a', 'large_a'];
    expect(heirloomTreeModifiers(state, content)).toEqual([]);
    state.cards.loadouts.fighting.supports[0] = 'skypiercer';
    const mods = heirloomTreeModifiers(state, content);
    expect(mods.map((m) => m.source.id)).toEqual([
      'skypiercer:root',
      'skypiercer:small_a',
      'skypiercer:large_a',
    ]);
    const crit = (s: GameState) =>
      statValue('combat.critChance', 0, collectModifiers(s, content)).toNumber();
    const without = structuredClone(state);
    without.heirlooms.trees = {};
    expect(crit(state) - crit(without)).toBeCloseTo(0.05, 6);
  });

  it('adds signature power on top of its own signature while it leads', () => {
    const state = ownHeirloom(freshState(), 'grave_anvil', 6, 140);
    state.heirlooms.trees['grave_anvil'] = ['root', 'small_a', 'large_a', 'capstone'];
    state.cards.loadouts.fighting.main = 'grave_anvil';
    const power = statValue('burst.power', 1, collectModifiers(state, content), {
      job: 'fighting',
    });
    // The hammer's ×30, +2 (small), +4 (large) and +15 (Grave Toll).
    expect(power.toNumber()).toBe(51);
  });

  it('gives the capstone duel skill in place of the type skill while it is bought', () => {
    const state = ownHeirloom(freshState(), 'worldforge', 6, 140);
    expect(cardSkill(content, 'worldforge', state).id).toBe('quake');
    state.heirlooms.trees['worldforge'] = ['root', 'small_a', 'large_a', 'capstone'];
    expect(cardSkill(content, 'worldforge', state)).toMatchObject({
      id: 'anvil_of_worlds',
      guard: true,
      health: 1.5,
    });
  });
});

describe('weapon circles (DESIGN.md §10 Hidden weapon circles)', () => {
  it('open the keystone step at ★6 of Mythic or Void, or with an Heirloom of the type', () => {
    const state = freshState();
    state.cards.owned['core_titan'] = { ...newOwnedCard(), tier: 'mythic', stars: 5 };
    const step = (s: GameState) =>
      weaponCircles(s, content).find((c) => c.kind === 'pickaxe')!.step;
    expect(step(state)).toBe('mythic');
    state.cards.owned['core_titan']!.stars = 6;
    expect(step(state)).toBe('heirloom');
    const other = ownHeirloom(freshState(), 'deepmaw');
    expect(step(other)).toBe('heirloom');
  });
});

describe('save format 30 (DESIGN.md §5 Saves keep their Heirlooms)', () => {
  /** A format 29 save with cards at the old Heirloom tier. */
  function v29Save(): string {
    const state = freshState();
    state.cards.owned['seraph_lancer'] = { ...newOwnedCard(), tier: 'mythic', stars: 1, level: 1 };
    const other = content.cards.find(
      (c) => c.item.kind === 'lance' && c.rarity === 'mythic' && c.heirloomArt,
    )!;
    state.cards.owned[other.id] = { ...newOwnedCard(), tier: 'mythic', stars: 1, level: 1 };
    const envelope = JSON.parse(createSaveText(state, 1000)) as {
      version: number;
      state: Record<string, unknown> & {
        cards: { owned: Record<string, Record<string, unknown>> };
      };
    };
    envelope.version = 29;
    delete envelope.state['heirlooms'];
    Object.assign(envelope.state.cards.owned['seraph_lancer']!, {
      tier: 'heirloom',
      stars: 4,
      level: 130,
      xp: '55',
    });
    Object.assign(envelope.state.cards.owned[other.id]!, { tier: 'heirloom', stars: 2, level: 90 });
    return JSON.stringify(envelope);
  }

  it('puts the card back at Mythic ★6 and makes its Heirloom its own card', () => {
    const { state } = readSave(v29Save(), content);
    expect(state.cards.owned['seraph_lancer']).toMatchObject({
      tier: 'mythic',
      stars: 6,
      level: 120,
    });
    expect(state.cards.owned['seraph_lancer']!.xp.toNumber()).toBe(0);
    // Sunrider is the Mythic lance's Heirloom: ★4 from Seraph Lancer; the other lance's ★2 is
    // worth 30 + 10 shards, which take Sunrider to ★5 (25) with 15 left toward ★6.
    expect(state.cards.owned['sunrider']).toMatchObject({ tier: 'heirloom', stars: 5, level: 130 });
    expect(state.heirlooms.shards['sunrider']).toBe(15);
    expect(state.heirlooms).toMatchObject({ pity: 0, pulls: 0, trees: {} });
  });

  it('round-trips the Heirloom state', () => {
    const state = ownHeirloom(freshState(), 'solaris', 3, 40);
    state.heirlooms = {
      shards: { solaris: 4, nightfall: 9 },
      pity: 12,
      pulls: 70,
      trees: { solaris: ['root', 'small_b'] },
    };
    const { state: again } = readSave(createSaveText(state, 5), content);
    expect(again.heirlooms).toEqual(state.heirlooms);
    expect(again.cards.owned['solaris']).toMatchObject({ tier: 'heirloom', stars: 3, level: 40 });
  });
});
