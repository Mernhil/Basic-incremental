import { describe, expect, it } from 'vitest';
import {
  buyTraining,
  collectModifiers,
  Decimal,
  lineEffect,
  trainingLines,
  withLineLevel,
} from '../src/game';
import { heldResources, upgradeRow } from '../src/renderer/src/pages/upgradeRowModel';
import { content, freshState } from './helpers';

describe('the upgrade row (DESIGN.md §4 The upgrade row)', () => {
  it('shows Training as team damage now -> after, the gem price and the next milestone in words', () => {
    const s = freshState();
    s.combat.training['sharpen'] = 8;
    s.resources['copper_gem'] = new Decimal(1e9);
    const row = upgradeRow(
      s,
      content,
      { kind: 'training', id: 'sharpen' },
      1,
      collectModifiers(s, content),
    )!;
    expect(row.effectLabel).toBe('Team damage');
    expect(row.now).toMatch(/\/s$/);
    expect(row.after).toMatch(/\/s$/);
    expect(row.mult).toMatch(/^×[\d.]+ → ×[\d.]+$/);
    expect(row.buy.affordable).toBe(true);
    // a gem has its coin sprite: the price is the number, the name only in the label
    expect(row.buy.price).toMatch(/^[0-9.,]+[a-zA-Z]?$/);
    expect(row.buy.price).not.toMatch(/Copper/);
    expect(row.buy.priceLabel).toMatch(/Copper Gem$/);
    expect(row.buy.short).toBeNull();
    expect(row.next).toBe('In 7 levels (Lv 15): you pick Finishing Blow or Brutal Edge');
    expect(row.toGo).toBe('7 levels');
    expect(row.segments).toEqual({ filled: 3, total: 10 });
  });

  it('says how much is missing when the player is short', () => {
    const s = freshState();
    s.resources['copper_gem'] = new Decimal(150);
    const row = upgradeRow(
      s,
      content,
      { kind: 'training', id: 'sharpen' },
      1,
      collectModifiers(s, content),
    )!;
    expect(row.buy.affordable).toBe(false);
    expect(row.buy.short).toBe('need 50 more');
  });

  it('names the next pick in words, and shows the badges picked', () => {
    const s = freshState();
    s.combat.training['sharpen'] = 4;
    const row = upgradeRow(
      s,
      content,
      { kind: 'training', id: 'sharpen' },
      1,
      collectModifiers(s, content),
    )!;
    expect(row.next).toMatch(/^In \d+ levels? \(Lv \d+\): /);
    // what each pick does is readable before choosing
    expect(row.nextTip.split(String.fromCharCode(10))).toHaveLength(2);
    expect(row.badges).toEqual([]);
    s.combat.training['sharpen'] = 6;
    s.upgrades.picks['sharpen_5'] = 'sharpen_5_cry';
    const picked = upgradeRow(
      s,
      content,
      { kind: 'training', id: 'sharpen' },
      1,
      collectModifiers(s, content),
    )!;
    expect(picked.badges.map((b) => b.name)).toEqual(['Battle Cry']);
  });

  it('lists the resources a panel spends once each for the "You hold" strip', () => {
    const s = freshState();
    const mods = collectModifiers(s, content);
    const rows = content.training.map((t) =>
      upgradeRow(s, content, { kind: 'training', id: t.id }, 1, mods)!,
    );
    const held = heldResources(s, content, rows);
    expect(held.map((h) => h.resource)).toEqual([
      'copper_gem',
      'ironbark_gem',
      'iron_gem',
      'oak_gem',
    ]);
  });

  describe('what a purchase changes, before you buy', () => {
    const line = { kind: 'training', id: 'sharpen' } as const;
    const rich = () => {
      const s = freshState();
      s.resources['copper_gem'] = new Decimal(1e12);
      s.combat.training['sharpen'] = 10;
      return s;
    };

    it('says now and after for the amount about to be bought, with the size of the gain', () => {
      const s = rich();
      const mods = collectModifiers(s, content);
      const one = upgradeRow(s, content, line, 1, mods)!;
      const ten = upgradeRow(s, content, line, 10, mods)!;
      expect(one.scope).toBe('after this level');
      expect(ten.scope).toBe('after 10 levels');
      expect(one.now).toBe(ten.now);
      expect(one.delta).toMatch(/^\+[\d.]+\/s$/);
      expect(parseFloat(ten.delta)).toBeGreaterThan(parseFloat(one.delta));
      expect(ten.says).toBe(
        `${ten.effectLabel}: ${ten.now} now, ${ten.after} after 10 levels (${ten.delta})`,
      );
    });

    it('takes now and after from the game: ten levels ahead is the state ten levels higher', () => {
      const s = rich();
      const mods = collectModifiers(s, content);
      const e = lineEffect(s, content, line, 10, mods);
      const ahead = withLineLevel(s, line, 10);
      expect(ahead.combat.training['sharpen']).toBe(20);
      expect(lineEffect(ahead, content, line, 0).now.eq(e.after)).toBe(true);
      expect(lineEffect(s, content, line, 0, mods).after.eq(e.now)).toBe(true);
    });

    it('x10 costs exactly what ten single buys cost, and Max buys what is affordable', () => {
      const s = rich();
      const ten = trainingLines(s, content, 10).find((t) => t.line.id === 'sharpen')!;
      let cur = s;
      let paid = new Decimal(0);
      for (let i = 0; i < 10; i++) {
        const one = trainingLines(cur, content, 1).find((t) => t.line.id === 'sharpen')!;
        paid = paid.add(one.offer.price.amount);
        const r = buyTraining(cur, content, 'sharpen', 1);
        if (!r.ok) throw new Error('single buy failed');
        cur = r.state;
      }
      expect(ten.offer.price.amount.eq(paid)).toBe(true);
      const bulk = buyTraining(s, content, 'sharpen', 10);
      if (!bulk.ok) throw new Error('bulk buy failed');
      expect(bulk.state.combat.training['sharpen']).toBe(20);

      const poor = freshState();
      poor.combat.training['sharpen'] = 10;
      poor.resources['copper_gem'] = ten.offer.price.amount.mul(0.6);
      const x10 = upgradeRow(poor, content, line, 10, collectModifiers(poor, content))!;
      expect(x10.buy.affordable).toBe(false);
      expect(x10.buy.label).toBe('Buy ×10');
      const max = upgradeRow(poor, content, line, 'max', collectModifiers(poor, content))!;
      expect(max.buy.affordable).toBe(true);
      expect(max.buy.count).toBeGreaterThan(0);
      expect(max.buy.count).toBeLessThan(10);
      expect(max.buy.label).toBe(`Buy ×${max.buy.count} (max)`);
      expect(max.scope).toBe(`after ${max.buy.count} levels`);
    });
  });
});
