import { describe, expect, it } from 'vitest';
import { Decimal, collectModifiers, buyTreeLevels, type GameState } from '../src/game';
import {
  allRateText,
  jobRateText,
  productionRows,
  shelfSummary,
} from '../src/renderer/src/pages/productionModel';
import type { ShelfChip } from '../src/renderer/src/pages/shelfModel';
import { content, freshState } from './helpers';

const mods = (s: GameState) => collectModifiers(s, content);

function rich(): GameState {
  const s = freshState();
  s.resources.money = new Decimal(1e12);
  return s;
}

describe('productionRows', () => {
  it('lists every tree kind in content order: Oak active, the rest locked with an unlock price', () => {
    const s = rich();
    const rows = productionRows(s, content, 'logging', 1, mods(s));
    expect(rows.map((r) => r.id)).toEqual(content.trees.map((t) => t.id));
    expect(rows.map((r) => r.kindIndex)).toEqual(rows.map((_, i) => i));
    const [oak, ...locked] = rows;
    expect(oak!.kind).toBe('active');
    expect(oak!.levelText).toBe('Lv 0');
    expect(oak!.output).toMatch(/\/s$/);
    expect(oak!.buy?.offer.affordable).toBe(true);
    expect(oak!.milestone).toMatchObject({ label: 'Lv 25: ×2', toGo: '25 to go', progress: 0 });
    expect(locked.length).toBeGreaterThan(0);
    for (const r of locked) {
      expect(r.kind).toBe('locked-tree');
      expect(r.buy).toBeNull();
      expect(r.milestone).toBeNull();
      expect(r.unlock?.price).toBeTruthy();
      expect(r.unlock?.have).toMatch(/^You have /);
      expect(r.note).toMatch(/^Starts at .*\/s at level 0$/);
    }
  });

  it('marks a tree unlock affordable only when the gems are there', () => {
    const s = rich();
    const locked = productionRows(s, content, 'logging', 1, mods(s))[1]!;
    expect(locked.unlock?.affordable).toBe(false);
    const cost = content.trees[1]!.unlockCost[0]!;
    s.resources[cost.resource] = new Decimal(cost.amount).mul(2);
    const again = productionRows(s, content, 'logging', 1, mods(s))[1]!;
    expect(again.unlock?.affordable).toBe(true);
  });

  it('shows locked mines with the dungeon that opens them, and unlocks them once cleared', () => {
    const s = rich();
    const rows = productionRows(s, content, 'mining', 1, mods(s));
    expect(rows[0]!.kind).toBe('active');
    const gated = rows.filter((r) => r.kind === 'locked-mine');
    expect(gated.length).toBeGreaterThan(0);
    for (const r of gated) {
      expect(r.dungeon).toBeTruthy();
      expect(r.note).toBe(`Clear ${r.dungeon} to unlock`);
      expect(r.unlock).toBeNull();
    }
    const first = content.mines.find((m) => m.unlockedByDungeon)!;
    s.clearedDungeons = [...s.clearedDungeons, first.unlockedByDungeon!];
    const after = productionRows(s, content, 'mining', 1, mods(s));
    expect(after.find((r) => r.id === first.id)?.kind).toBe('active');
  });

  it('follows the level and the buy amount', () => {
    const s = rich();
    const r = buyTreeLevels(s, content, 'oak', 10);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const oak = productionRows(r.state, content, 'logging', 10, mods(r.state))[0]!;
    expect(oak.levelText).toBe('Lv 10');
    expect(oak.milestone?.toGo).toBe('15 to go');
    expect(oak.milestone?.progress).toBeCloseTo(10 / 25);
    expect(oak.buy?.label).toBe('Buy ×10');
  });
});

describe('rate texts', () => {
  it('sums the gems per second', () => {
    const s = rich();
    expect(jobRateText(s, content, 'logging', mods(s))).toMatch(/gems\/s$/);
    expect(allRateText(s, content, mods(s))).toMatch(/gems\/s$/);
  });
});

describe('shelfSummary', () => {
  const chip = (over: Partial<ShelfChip>): ShelfChip => ({
    id: 'x',
    name: 'X',
    effect: '',
    status: 'available',
    price: '1 Money',
    affordable: false,
    permanent: false,
    unlockText: '',
    preview: '',
    ...over,
  });

  it('counts ready, waiting and owned upgrades', () => {
    const s = shelfSummary([
      chip({ affordable: true }),
      chip({ affordable: true }),
      chip({}),
      chip({ status: 'owned' }),
    ]);
    expect(s).toMatchObject({ ready: 2, waiting: 1, owned: 1, text: '2 ready to buy · 1 owned' });
  });

  it('says zero ready for an empty shelf', () => {
    expect(shelfSummary([]).text).toBe('0 ready to buy · 0 owned');
  });
});
