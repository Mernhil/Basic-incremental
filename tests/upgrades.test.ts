import { describe, expect, it } from 'vitest';
import {
  advance,
  ascend,
  buyUpgrade,
  collectModifiers,
  createSaveText,
  Decimal,
  lifetimeMoney,
  producerRate,
  readSave,
  upgradeShelf,
  type GameState,
} from '../src/game';
import { bareState, constantRng, content, freshState } from './helpers';

const NOW = 1_700_000_000_000;
const oak = content.treeById.get('oak')!;

const item = (state: GameState, id: string) =>
  upgradeShelf(state, content).find((i) => i.id === id)!;

function withMoney(state: GameState, amount: number | string): GameState {
  state.resources['money'] = new Decimal(amount);
  return state;
}

describe('upgrade shelf content (DESIGN.md §4)', () => {
  it('has about 30 upgrades with unique ids, paid in Money', () => {
    const list = content.upgrades.upgrades;
    expect(list.length).toBeGreaterThanOrEqual(30);
    expect(new Set(list.map((u) => u.id)).size).toBe(list.length);
    for (const u of list) expect(u.cost.resource).toBe(content.upgrades.currency);
  });

  it('keeps only upgrades unlocked by lasting progress as permanent', () => {
    for (const u of content.upgrades.upgrades.filter((x) => x.permanent)) {
      expect(['treeLevel', 'mineLevel']).not.toContain(u.unlock.kind);
    }
  });
});

describe('shelf status', () => {
  it('hides an upgrade until its threshold, then offers it, then shows it owned', () => {
    const state = freshState();
    expect(item(state, 'keen_axes').status).toBe('hidden');
    state.production.treeLevels['oak'] = 10;
    expect(item(state, 'keen_axes').status).toBe('available');
    withMoney(state, 1e9);
    const bought = buyUpgrade(state, content, 'keen_axes');
    expect(bought.ok).toBe(true);
    if (bought.ok) expect(item(bought.state, 'keen_axes').status).toBe('owned');
  });

  it('unlocks from every condition kind', () => {
    const state = freshState();
    state.production.mineLevels['copper_quarry'] = 10;
    expect(item(state, 'sharp_picks').status).toBe('available');
    state.combat.stageKills['mossy_cellar:normal:1'] = 20;
    expect(item(state, 'tax_collector').status).toBe('available');
    state.mastery.gemTiers['oak_gem'] = 1;
    expect(item(state, 'harvest_rhythm').status).toBe('available');
    state.upgrades.moneyEarned = new Decimal(1e5);
    expect(item(state, 'lumber_union').status).toBe('available');
  });

  it('shows cost, affordability and a ready-to-show effect', () => {
    const state = freshState();
    state.production.treeLevels['oak'] = 10;
    const entry = item(state, 'keen_axes');
    expect(entry.cost.resource).toBe('money');
    expect(entry.cost.amount.eq(1500)).toBe(true);
    expect(entry.canAfford).toBe(false);
    expect(entry.description).toBe('Oak output x2');
    expect(entry.unlockText).toMatch(/Oak/);
    withMoney(state, 1500);
    expect(item(state, 'keen_axes').canAfford).toBe(true);
  });

  it('previews the output of a production upgrade before and after', () => {
    const state = freshState();
    state.production.treeLevels['oak'] = 10;
    const preview = item(state, 'keen_axes').preview!;
    expect(preview.kind).toBe('rate');
    expect(preview.after.eq(preview.before.mul(2))).toBe(true);
  });
});

describe('buying', () => {
  it('pays Money once and refuses locked, owned, unknown and unaffordable', () => {
    const state = withMoney(freshState(), 5000);
    expect(buyUpgrade(state, content, 'keen_axes')).toEqual({ ok: false, reason: 'locked' });
    expect(buyUpgrade(state, content, 'nope')).toEqual({ ok: false, reason: 'unknown' });
    state.production.treeLevels['oak'] = 10;
    const ok = buyUpgrade(state, content, 'keen_axes');
    expect(ok.ok && ok.state.resources['money']!.eq(3500)).toBe(true);
    if (!ok.ok) throw new Error('should buy');
    expect(buyUpgrade(ok.state, content, 'keen_axes')).toEqual({ ok: false, reason: 'owned' });
    const poor = withMoney(freshState(), 10);
    poor.production.treeLevels['oak'] = 10;
    expect(buyUpgrade(poor, content, 'keen_axes')).toEqual({ ok: false, reason: 'unaffordable' });
  });
});

describe('effects through the modifier pipeline', () => {
  it('doubles Oak output and labels the source "upgrade"', () => {
    const state = freshState();
    const before = producerRate(oak, 'logging', collectModifiers(state, content));
    state.upgrades.owned.push('keen_axes');
    const mods = collectModifiers(state, content);
    expect(producerRate(oak, 'logging', mods).eq(before.mul(2))).toBe(true);
    expect(mods.some((m) => m.source.kind === 'upgrade' && m.source.id === 'keen_axes')).toBe(true);
  });

  it('makes a logging worker ability stronger', () => {
    const state = bareState();
    const card = content.cards.find(
      (c) => c.job === 'logging' && c.worker.modifiers.some((m) => m.kind !== 'set'),
    )!;
    state.cards.owned[card.id] = {
      tier: 'bronze',
      stars: 1,
      level: 1,
      xp: new Decimal(0),
      starFill: 0,
      enhancements: [],
    };
    state.production.workers = { oak: [card.id] };
    const sum = (s: GameState) =>
      collectModifiers(s, content)
        .filter((m) => m.source.kind === 'card' && m.source.id === card.id)
        .map((m) => m.value);
    const base = sum(state);
    state.upgrades.owned.push('lumberjack_pact');
    const boosted = sum(state);
    expect(boosted.length).toBe(base.length);
    const grew = boosted.some((v, i) => !v.eq(base[i]!));
    expect(grew).toBe(true);
  });
});

describe('lifetime Money earned', () => {
  it('counts the fighting wage and purses', () => {
    const state = bareState();
    state.activeDungeonId = 'mossy_cellar';
    expect(lifetimeMoney(state).eq(0)).toBe(true);
    const { state: after } = advance(state, content, 2000, constantRng(0.5));
    const gained = after.resources['money']!.sub(state.resources['money']!);
    expect(gained.gt(0)).toBe(true);
    expect(lifetimeMoney(after).eq(gained)).toBe(true);
  });
});

describe('ascension', () => {
  it('drops per-run upgrades, keeps permanent ones and lifetime Money', () => {
    const state = freshState();
    state.mastery.harvested['oak_gem'] = new Decimal(1e14);
    state.mastery.harvested['grotto_gem'] = new Decimal(1e8);
    state.upgrades.owned.push('keen_axes', 'battle_cry');
    state.upgrades.moneyEarned = new Decimal(123456);
    const result = ascend(state, content);
    if (!result.ok) throw new Error(result.reason);
    expect(result.state.upgrades.owned).toEqual(['battle_cry']);
    expect(result.state.upgrades.moneyEarned.eq(123456)).toBe(true);
  });
});

describe('saves', () => {
  it('round-trips owned upgrades and lifetime Money', () => {
    const state = freshState();
    state.upgrades.owned.push('keen_axes', 'battle_cry', 'removed_upgrade');
    state.upgrades.moneyEarned = new Decimal('1.5e12');
    const loaded = readSave(createSaveText(state, NOW), content).state;
    expect(loaded.upgrades.owned).toEqual(['keen_axes', 'battle_cry']);
    expect(loaded.upgrades.moneyEarned.eq('1.5e12')).toBe(true);
  });
});
