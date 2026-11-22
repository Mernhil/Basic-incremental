import { describe, expect, it } from 'vitest';
import {
  buyTool,
  collectModifiers,
  Decimal,
  lineEffect,
  toolLines,
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

  it('names a ring and a pick at the same level together, and shows the badges picked', () => {
    const s = freshState();
    s.production.tools['logging_yield'] = 20;
    s.upgrades.picks['logging_yield_10'] = 'logging_yield_10_all';
    const row = upgradeRow(
      s,
      content,
      { kind: 'tool', id: 'logging_yield' },
      1,
      collectModifiers(s, content),
    )!;
    expect(row.next).toBe(
      'In 5 levels (Lv 25): yield ×1.1, and you pick Merchant Ledger or Timber Yard',
    );
    // what each pick does is readable before choosing
    expect(row.nextTip.split(String.fromCharCode(10))).toHaveLength(2);
    expect(row.nextTip).toMatch(/^Merchant Ledger: .+/);
    expect(row.badges.map((b) => b.name)).toEqual(['Lumber Union']);
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
    const line = { kind: 'tool', id: 'logging_yield' } as const;
    const rich = () => {
      const s = freshState();
      s.resources['money'] = new Decimal(1e12);
      s.production.tools['logging_yield'] = 10;
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
      expect(ahead.production.tools['logging_yield']).toBe(20);
      expect(lineEffect(ahead, content, line, 0).now.eq(e.after)).toBe(true);
      expect(lineEffect(s, content, line, 0, mods).after.eq(e.now)).toBe(true);
    });

    it('x10 costs exactly what ten single buys cost, and Max buys what is affordable', () => {
      const s = rich();
      const ten = toolLines(s, content, 'logging', 10).find((t) => t.line.id === 'logging_yield')!;
      let cur = s;
      let paid = new Decimal(0);
      for (let i = 0; i < 10; i++) {
        const one = toolLines(cur, content, 'logging', 1).find(
          (t) => t.line.id === 'logging_yield',
        )!;
        paid = paid.add(one.offer.price.amount);
        const r = buyTool(cur, content, 'logging_yield', 1);
        if (!r.ok) throw new Error('single buy failed');
        cur = r.state;
      }
      expect(ten.offer.price.amount.eq(paid)).toBe(true);
      const bulk = buyTool(s, content, 'logging_yield', 10);
      if (!bulk.ok) throw new Error('bulk buy failed');
      expect(bulk.state.production.tools['logging_yield']).toBe(20);
      expect(bulk.state.resources['money']!.eq(cur.resources['money']!)).toBe(true);

      const poor = freshState();
      poor.production.tools['logging_yield'] = 10;
      poor.resources['money'] = ten.offer.price.amount.mul(0.6);
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
