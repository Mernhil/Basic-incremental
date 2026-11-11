import { describe, expect, it } from 'vitest';
import {
  activeWorkers,
  advance,
  advanceChunked,
  assignWorker,
  cardStatPower,
  collectModifiers,
  createInitialState,
  Decimal,
  deserializeState,
  harvestBurstStats,
  jobProductionPerSecond,
  newOwnedCard,
  producerRate,
  productionPerSecond,
  productionStageView,
  serializeState,
  workerAt,
  workerChoices,
  workerPower,
  workerSlots,
  workersUsed,
  workplaceOf,
  workSites,
  type GameState,
} from '../src/game';
import { bareState, constantRng, content } from './helpers';

const rng = constantRng(0.5);

/** A bare game (no workers) owning `cards`, with every tree kind unlocked. */
function withCards(cards: string[], trees = ['ironbark', 'moonwillow']): GameState {
  const state = bareState();
  for (const id of cards) state.cards.owned[id] = newOwnedCard();
  state.production.unlockedTrees = trees;
  return state;
}

function assign(state: GameState, place: string, card: string | null): GameState {
  const result = assignWorker(state, content, place, card);
  if (!result.ok) throw new Error(`assign ${card} to ${place}: ${result.reason}`);
  return result.state;
}

const oakGem = content.treeById.get('oak')!.resource;

describe('worker slots', () => {
  it('a new game has two slots, its start cards working the first tree and mine', () => {
    const state = createInitialState(content);
    expect(workerSlots(state, content)).toBe(2);
    expect(workerAt(state, content, 'oak')).toBe('apprentice_feller');
    expect(workerAt(state, content, 'copper_quarry')).toBe('cave_digger');
    expect(workersUsed(state, content)).toBe(2);
  });

  it('each Ascension opens one more, up to one per tree and mine', () => {
    const state = bareState();
    state.prestigeCount = 3;
    expect(workerSlots(state, content)).toBe(5);
    state.prestigeCount = 40;
    expect(workerSlots(state, content)).toBe(content.trees.length + content.mines.length);
  });

  it('a new worker needs a free slot; moving or replacing one does not', () => {
    let state = withCards(['apprentice_feller', 'moss_forager', 'grove_keeper']);
    state = assign(state, 'oak', 'apprentice_feller');
    state = assign(state, 'ironbark', 'moss_forager');
    expect(assignWorker(state, content, 'moonwillow', 'grove_keeper')).toEqual({
      ok: false,
      reason: 'no-slot',
    });
    // replacing the worker of a place keeps the count
    state = assign(state, 'oak', 'grove_keeper');
    expect(workerAt(state, content, 'oak')).toBe('grove_keeper');
    expect(workplaceOf(state, content, 'apprentice_feller')).toBeNull();
    // moving a worker to an empty place keeps the count
    state = assign(state, 'moonwillow', 'moss_forager');
    expect(activeWorkers(state, content)).toEqual({
      oak: ['grove_keeper'],
      moonwillow: ['moss_forager'],
    });
  });

  it('a slot count that drops leaves the extra workers idle, never a broken assignment', () => {
    const state = withCards(['apprentice_feller', 'moss_forager', 'cave_digger']);
    state.production.workers = {
      oak: ['apprentice_feller'],
      ironbark: ['moss_forager'],
      copper_quarry: ['cave_digger'],
    };
    // two slots: the first two places in order (trees, then mines) work
    expect(activeWorkers(state, content)).toEqual({
      oak: ['apprentice_feller'],
      ironbark: ['moss_forager'],
    });
    expect(workersUsed(state, content)).toBe(2);
    // any change rewrites the saved assignment from what works
    const next = assign(state, 'oak', null);
    expect(next.production.workers).toEqual({ ironbark: ['moss_forager'] });
  });
});

describe('assigning workers', () => {
  it('a logging card works trees, a mining card works mines, fighting cards never work', () => {
    const state = withCards(['apprentice_feller', 'cave_digger', 'ember_squire']);
    expect(assignWorker(state, content, 'oak', 'cave_digger')).toEqual({
      ok: false,
      reason: 'wrong-job',
    });
    expect(assignWorker(state, content, 'copper_quarry', 'apprentice_feller')).toEqual({
      ok: false,
      reason: 'wrong-job',
    });
    expect(assignWorker(state, content, 'oak', 'ember_squire')).toEqual({
      ok: false,
      reason: 'wrong-job',
    });
    expect(assignWorker(state, content, 'oak', 'apprentice_feller').ok).toBe(true);
  });

  it('refuses unknown places and cards, cards not owned and locked places', () => {
    const state = withCards(['apprentice_feller', 'cave_digger'], []);
    expect(assignWorker(state, content, 'nowhere', 'apprentice_feller')).toEqual({
      ok: false,
      reason: 'unknown',
    });
    expect(assignWorker(state, content, 'oak', 'nobody')).toEqual({
      ok: false,
      reason: 'unknown',
    });
    expect(assignWorker(state, content, 'oak', 'grove_keeper')).toEqual({
      ok: false,
      reason: 'not-owned',
    });
    expect(assignWorker(state, content, 'ironbark', 'apprentice_feller')).toEqual({
      ok: false,
      reason: 'locked',
    });
    expect(assignWorker(state, content, 'iron_deeps', 'cave_digger')).toEqual({
      ok: false,
      reason: 'locked',
    });
  });

  it('a card works one place: moving it swaps it with the card at the new place', () => {
    let state = withCards(['apprentice_feller', 'moss_forager']);
    state.prestigeCount = 1;
    state = assign(state, 'oak', 'apprentice_feller');
    state = assign(state, 'ironbark', 'moss_forager');
    state = assign(state, 'ironbark', 'apprentice_feller');
    expect(activeWorkers(state, content)).toEqual({
      oak: ['moss_forager'],
      ironbark: ['apprentice_feller'],
    });
  });

  it('null sends a place’s worker away; the gauge stays with the place', () => {
    let state = withCards(['apprentice_feller']);
    state = assign(state, 'oak', 'apprentice_feller');
    state.production.harvestGauges.oak = { gauge: 12, timer: 0.5 };
    state = assign(state, 'oak', null);
    expect(workerAt(state, content, 'oak')).toBeNull();
    expect(state.production.harvestGauges.oak).toEqual({ gauge: 12, timer: 0.5 });
  });

  it('a worker on a locked place, a lost card or a repeat never works', () => {
    const state = withCards(['apprentice_feller'], []);
    state.prestigeCount = 5;
    state.production.workers = {
      ironbark: ['apprentice_feller'],
      moonwillow: ['grove_keeper'],
      oak: ['apprentice_feller', 'apprentice_feller'],
    };
    expect(activeWorkers(state, content)).toEqual({ oak: ['apprentice_feller'] });
  });

  it('the picker lists the job’s owned cards, strongest first, with where each works', () => {
    let state = withCards(['apprentice_feller', 'moonwood_dryad', 'cave_digger']);
    state = assign(state, 'oak', 'apprentice_feller');
    const choices = workerChoices(state, content, 'ironbark');
    expect(choices.map((c) => c.cardId)).toEqual(['moonwood_dryad', 'apprentice_feller']);
    expect(choices[1]).toMatchObject({ workplace: 'oak', workplaceName: 'Oak', here: false });
    expect(choices[0]!.needsSlot).toBe(false);
  });
});

describe('a worker’s power multiplies its place’s output', () => {
  it('no worker: the plain level rate', () => {
    const state = withCards([]);
    const mods = collectModifiers(state, content);
    const oak = content.treeById.get('oak')!;
    expect(
      jobProductionPerSecond(state, content, 'logging', mods)[oakGem]!.eq(
        producerRate(oak, 'logging', mods),
      ),
    ).toBe(true);
  });

  it('power is rarity × the card’s level, star and tier power', () => {
    const owned = { ...newOwnedCard(), level: 11, stars: 3, tier: 'bronze' as const };
    const expected = content.production.workers.rarityPower.epic * cardStatPower(content, owned);
    expect(workerPower(content, 'elder_treant', owned)).toBeCloseTo(expected, 12);
    expect(workerPower(content, 'apprentice_feller', newOwnedCard())).toBe(1);
  });

  it('only the worked place is multiplied, by the power and the worker’s own ability', () => {
    let state = withCards(['moonwood_dryad']);
    state = assign(state, 'ironbark', 'moonwood_dryad');
    const mods = collectModifiers(state, content);
    const sites = workSites(state, content, 'logging', mods);
    const plain = (id: string) => producerRate(content.treeById.get(id)!, 'logging', []);
    const power = workerPower(content, 'moonwood_dryad', state.cards.owned['moonwood_dryad']!);
    const site = (id: string) => sites.find((s) => s.producer.id === id)!;
    expect(site('oak').rate.eq(plain('oak'))).toBe(true);
    expect(site('moonwillow').rate.eq(plain('moonwillow'))).toBe(true);
    // +30% output here (Moonwood Dryad's ability) × its power
    expect(site('ironbark').rate.toNumber()).toBeCloseTo(
      plain('ironbark').mul(1.3).mul(power).toNumber(),
      9,
    );
  });

  it('a worker ability is scoped to its place (the burst stats too)', () => {
    let state = withCards(['grove_keeper']);
    state = assign(state, 'ironbark', 'grove_keeper');
    const mods = collectModifiers(state, content);
    const sites = workSites(state, content, 'logging', mods);
    const fill = (id: string) =>
      harvestBurstStats(
        content,
        sites.find((s) => s.producer.id === id)!,
        mods,
      ).fill;
    expect(fill('ironbark')).toBe(fill('oak') + 1);
  });

  it('harvest crits come from the worker: a place with no worker never crits', () => {
    let state = withCards(['gem_cutter'], []);
    state = assign(state, 'copper_quarry', 'gem_cutter');
    const mods = collectModifiers(state, content);
    const mine = workSites(state, content, 'mining', mods)[0]!;
    expect(mine.crit.chance).toBeCloseTo(0.1, 12);
    const oak = workSites(state, content, 'logging', mods)[0]!;
    expect(oak.crit.chance).toBe(0);
    expect(oak.crit.damage.eq(1)).toBe(true);
  });

  it('a worker’s enhancements act at its own place only', () => {
    let state = withCards(['grove_keeper']);
    state.cards.owned['grove_keeper'] = {
      ...newOwnedCard(),
      tier: 'silver',
      enhancements: ['yield'],
    };
    state = assign(state, 'ironbark', 'grove_keeper');
    const mods = collectModifiers(state, content);
    const yieldMods = mods.filter((m) => m.source.kind === 'enhancement');
    expect(yieldMods.length).toBeGreaterThan(0);
    expect(yieldMods.every((m) => m.scope?.producer === 'ironbark')).toBe(true);
  });

  it('the Lumberjack Pact makes logging worker abilities stronger', () => {
    let state = withCards(['moonwood_dryad']);
    state = assign(state, 'ironbark', 'moonwood_dryad');
    const before = workSites(state, content, 'logging')[1]!.rate;
    state.upgrades.owned.push('lumberjack_pact');
    const after = workSites(state, content, 'logging')[1]!.rate;
    // +30% becomes +37.5%
    expect(after.div(before).toNumber()).toBeCloseTo(1.375 / 1.3, 9);
  });
});

describe('workers play the field', () => {
  it('a worker strikes its own place in its rhythm, and the strikes add up to its output', () => {
    let state = withCards(['grove_keeper']);
    state = assign(state, 'ironbark', 'grove_keeper');
    const { report } = advance(state, content, 3000, rng);
    const strikes = report.harvests.filter((h) => h.job === 'logging' && !h.burst);
    // Grove Keeper strikes every 0.5 s; only its own tree is struck
    expect(strikes.map((h) => h.producer)).toEqual(Array(6).fill('ironbark'));
    expect(strikes.every((h) => h.worker === 'grove_keeper')).toBe(true);
    const rate = productionPerSecond(state, content)[content.treeById.get('ironbark')!.resource]!;
    const got = strikes.reduce((a, h) => a.add(h.amount), new Decimal(0));
    expect(got.toNumber()).toBeCloseTo(rate.mul(3).toNumber(), 9);
  });

  it('a place with no worker produces but is not struck', () => {
    const state = withCards([]);
    const before = state.resources[oakGem]!;
    const { state: after, report } = advance(state, content, 3000, rng);
    expect(report.harvests.filter((h) => h.job === 'logging')).toHaveLength(0);
    expect(after.resources[oakGem]!.gt(before)).toBe(true);
  });

  it('each worker has its own gauge; a full one harvests its own place only', () => {
    let state = withCards(['apprentice_feller', 'cave_digger'], []);
    state = assign(state, 'oak', 'apprentice_feller');
    state = assign(state, 'copper_quarry', 'cave_digger');
    const size = content.combat.bursts.logging.gaugeSize;
    const { state: after, report } = advance(state, content, size * 1000, rng);
    const bursts = report.harvests.filter((h) => h.burst);
    expect(bursts.map((h) => h.producer).sort()).toEqual(['copper_quarry', 'oak']);
    expect(after.production.harvestGauges.oak).toEqual({ gauge: 0, timer: 0 });
    expect(report.bursts.logging).toBe(1);
    // ironbark is not unlocked, so no gauge appears for it
    expect(after.production.harvestGauges.ironbark).toBeUndefined();
  });

  it('a worker gains XP from its own place only', () => {
    let state = withCards(['apprentice_feller', 'moss_forager']);
    state.prestigeCount = 1;
    state = assign(state, 'oak', 'apprentice_feller');
    const { state: after } = advance(state, content, 999, rng);
    expect(after.cards.owned['apprentice_feller']!.xp.gt(0)).toBe(true);
    expect(after.cards.owned['moss_forager']!.xp.eq(0)).toBe(true);
  });

  it('online, offline and any split of time give the same totals', () => {
    let state = withCards(['moonwood_dryad', 'gem_cutter', 'apprentice_feller']);
    state.prestigeCount = 2;
    state = assign(state, 'ironbark', 'moonwood_dryad');
    state = assign(state, 'oak', 'apprentice_feller');
    state = assign(state, 'copper_quarry', 'gem_cutter');
    state.activeDungeonId = null;
    const whole = advance(state, content, 125_000, rng).state;
    const split = advanceChunked(state, content, 125_000, rng, 333).state;
    for (const id of Object.keys(whole.resources)) {
      const a = whole.resources[id]!;
      const b = split.resources[id]!;
      expect(a.sub(b).abs().lte(a.abs().mul(1e-9).add(1e-9)), id).toBe(true);
    }
    for (const [id, g] of Object.entries(whole.production.harvestGauges)) {
      expect(split.production.harvestGauges[id]!.gauge, id).toBe(g.gauge);
      expect(split.production.harvestGauges[id]!.timer, id).toBeCloseTo(g.timer, 9);
    }
  });
});

describe('the workers view and save', () => {
  it('the stage view has one entry per unlocked place with its worker and gauge', () => {
    let state = withCards(['grove_keeper']);
    state = assign(state, 'ironbark', 'grove_keeper');
    state.production.harvestGauges.ironbark = { gauge: 15, timer: 0 };
    const view = productionStageView(state, content, 'logging');
    expect(view.targets.map((t) => t.producer)).toEqual(['oak', 'ironbark', 'moonwillow']);
    expect(view.targets[0]!.worker).toBeNull();
    expect(view.targets[0]!.gauge).toBe(0);
    expect(view.targets[1]!.worker?.cardId).toBe('grove_keeper');
    expect(view.targets[1]!.pattern?.style).toBe('flurry');
    expect(view.targets[1]!.gauge).toBeCloseTo(15 / content.combat.bursts.logging.gaugeSize);
    expect(view.slots).toEqual({ used: 1, total: 2 });
  });

  it('workers and gauges survive a save; the old loadouts and gauges are gone', () => {
    let state = withCards(['grove_keeper']);
    state = assign(state, 'ironbark', 'grove_keeper');
    state.production.harvestGauges.ironbark = { gauge: 7, timer: 0.25 };
    const saved = serializeState(state);
    expect(Object.keys(saved.cards.loadouts)).toEqual(['fighting']);
    expect(Object.keys(saved.bursts)).toEqual(['fighting']);
    const loaded = deserializeState(saved, content);
    expect(activeWorkers(loaded, content)).toEqual({ ironbark: ['grove_keeper'] });
    expect(loaded.production.harvestGauges.ironbark).toEqual({ gauge: 7, timer: 0.25 });
  });

  it('a format 26 save that still holds the old loadouts and gauges loads', () => {
    const saved = serializeState(createInitialState(content)) as unknown as Record<
      string,
      Record<string, unknown>
    >;
    const cards = saved['cards']!;
    cards['loadouts'] = {
      ...(cards['loadouts'] as object),
      logging: { main: 'apprentice_feller', supports: [null, null, null] },
      mining: { main: 'cave_digger', supports: [null, null, null] },
    };
    saved['bursts'] = {
      fighting: { gauge: 1, timer: 0 },
      logging: { gauge: 2, timer: 0 },
      mining: { gauge: 3, timer: 0 },
    };
    const loaded = deserializeState(saved as never, content);
    expect(Object.keys(loaded.cards.loadouts)).toEqual(['fighting']);
    expect(loaded.bursts).toEqual({ fighting: { gauge: 1, timer: 0 } });
  });
});
