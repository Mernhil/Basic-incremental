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
    expect(row.buy.price).toMatch(/Copper Gem$/);
    expect(row.buy.short).toBeNull();
    expect(row.next).toBe('Lv 10: pick Battle Cry or Keen Blades');
    expect(row.toGo).toBe('2 levels');
    expect(row.segments).toEqual({ filled: 8, total: 10 });
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
    s.combat.training['sharpen'] = 20;
    s.upgrades.picks['sharpen_10'] = 'sharpen_10_cry';
    const row = upgradeRow(
      s,
      content,
      { kind: 'training', id: 'sharpen' },
      1,
      collectModifiers(s, content),
    )!;
    expect(row.next).toBe('Lv 25: damage ×1.8 and pick Finishing Blow or Brutal Edge');
    expect(row.badges.map((b) => b.name)).toEqual(['Battle Cry']);
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
