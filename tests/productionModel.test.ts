import { describe, expect, it } from 'vitest';
import {
  Decimal,
  collectModifiers,
  buyTreeLevels,
  timeToAfford,
  type GameState,
} from '../src/game';
import {
  formatWait,
  gainText,
  jobRateValue,
  milestoneSegments,
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
    expect(oak!.levelText).toBe('Level 0');
    expect(oak!.output).toMatch(/\/s$/);
    expect(oak!.outputUnit).toBe('Oak Gem/s');
    expect(oak!.buy?.offer.affordable).toBe(true);
    expect(oak!.previewText).toMatch(/ → .* \/s$/);
    expect(oak!.milestone).toMatchObject({ label: 'Lv 15: ×2', toGo: '×2 in 15', progress: 0 });
    expect(oak!.milestone?.segments).toEqual({ total: 15, filled: 0 });
    expect(locked.length).toBeGreaterThan(0);
    for (const r of locked) {
      expect(r.kind).toBe('locked-tree');
      expect(r.buy).toBeNull();
      expect(r.milestone).toBeNull();
      expect(r.unlock?.price).toBeTruthy();
      expect(r.unlock?.have).toMatch(/^You have /);
      expect(r.unlock?.amount).toBeTruthy();
      expect(r.unlock?.resources).toBeTruthy();
      expect(r.nextBuy).toBeNull();
      expect(r.note).toBe(`Unlock for ${r.unlock!.price}`);
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
    expect(oak.levelText).toBe('Level 10');
    expect(oak.milestone?.toGo).toBe('×2 in 5');
    expect(oak.milestone?.segments).toEqual({ total: 15, filled: 10 });
    expect(oak.milestone?.progress).toBeCloseTo(10 / 15);
    expect(oak.buy?.label).toBe('Buy ×10');
  });
});

describe('next buy', () => {
  it('says "ready" with the output gain when the level is affordable', () => {
    const s = rich();
    const oak = productionRows(s, content, 'logging', 1, mods(s))[0]!;
    expect(oak.nextBuy?.ready).toBe(true);
    expect(oak.nextBuy?.text).toBe('ready');
    expect(oak.nextBuy?.sub).toMatch(/^×\d+(\.\d+)? output$/);
  });

  it('shows the wait to afford when it is not, from the game helper', () => {
    const s = freshState();
    s.resources.money = new Decimal(0);
    const oak = productionRows(s, content, 'logging', 1, mods(s))[0]!;
    expect(oak.buy?.offer.affordable).toBe(false);
    expect(oak.nextBuy?.ready).toBe(false);
    const wait = timeToAfford(s, content, oak.buy!.offer.price, mods(s));
    expect(oak.nextBuy?.text).toBe(formatWait(wait));
    expect(oak.nextBuy?.sub).toBe(wait === null ? 'no income' : 'to afford');
  });
});

describe('formatWait', () => {
  it('writes days and hours, hours and minutes, minutes and seconds, seconds', () => {
    expect(formatWait(9 * 86_400 + 3 * 3600 + 10)).toBe('9d 3h');
    expect(formatWait(3600 + 49 * 60)).toBe('1h 49m');
    expect(formatWait(12 * 60 + 5)).toBe('12m 5s');
    expect(formatWait(40)).toBe('40 s');
    expect(formatWait(0.2)).toBe('1 s');
  });
  it('shows a dash with no income or an endless wait', () => {
    expect(formatWait(null)).toBe('—');
    expect(formatWait(1e12)).toBe('—');
  });
});

describe('gainText', () => {
  it('keeps two decimals under 10 and fewer above', () => {
    expect(gainText(1.034)).toBe('1.03');
    expect(gainText(12.34)).toBe('12.3');
    expect(gainText(480.6)).toBe('481');
  });
});

describe('milestoneSegments', () => {
  it('spans the levels between milestones and lights the done ones', () => {
    expect(milestoneSegments(19, 6 / 25)).toEqual({ total: 25, filled: 6 });
    expect(milestoneSegments(25, 0)).toEqual({ total: 25, filled: 0 });
    expect(milestoneSegments(1, 24 / 25)).toEqual({ total: 25, filled: 24 });
  });
  it('caps long spans at 25 segments', () => {
    expect(milestoneSegments(80, 0).total).toBe(25);
  });
});

describe('band rate', () => {
  it('sums the job gems per second as a number', () => {
    const s = rich();
    expect(jobRateValue(s, content, 'logging', mods(s))).toMatch(/\d/);
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
