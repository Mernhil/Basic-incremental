import { describe, expect, it } from 'vitest';
import { collectModifiers, Decimal } from '../src/game';
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
    expect(row.next).toBe('Lv 15: pick Finishing Blow or Brutal Edge');
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
    expect(row.next).toBe('Lv 25: yield ×1.1 and pick Merchant Ledger or Timber Yard');
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
});
