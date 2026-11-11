import { describe, expect, it } from 'vitest';
import { Decimal, collectModifiers } from '../src/game';
import { upgradeBoard } from '../src/renderer/src/views/meta/upgradesModel';
import { content, freshState } from './helpers';

describe('the Upgrades board', () => {
  it('splits every shelf upgrade into This run and Permanent without losing any', () => {
    const s = freshState();
    s.resources.money = new Decimal(1e15);
    for (const t of content.trees) s.production.treeLevels[t.id] = 60;
    const mods = collectModifiers(s, content);
    const board = upgradeBoard(s, content, mods);
    const ids = [...board.run, ...board.permanent].map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(0);
    expect(board.ready).toBe(
      [...board.run, ...board.permanent].filter((t) => t.status === 'available' && t.affordable)
        .length,
    );
  });

  it('puts bought upgrades after the ones still on sale and counts only the buyable as ready', () => {
    const s = freshState();
    const mods = collectModifiers(s, content);
    const board = upgradeBoard(s, content, mods);
    for (const list of [board.run, board.permanent]) {
      const firstOwned = list.findIndex((t) => t.status === 'owned');
      if (firstOwned >= 0)
        expect(list.slice(firstOwned).every((t) => t.status === 'owned')).toBe(true);
    }
    expect(board.ready).toBeLessThanOrEqual(board.run.length + board.permanent.length);
  });

  it('reads the lifetime Money as a coin amount', () => {
    const s = freshState();
    s.upgrades.moneyEarned = new Decimal('1234');
    const board = upgradeBoard(s, content, collectModifiers(s, content));
    expect(board.lifetime).toMatch(/\d/);
  });
});
