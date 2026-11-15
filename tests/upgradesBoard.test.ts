import { describe, expect, it } from 'vitest';
import { Decimal } from '../src/game';
import { milestoneBoard } from '../src/renderer/src/views/meta/upgradesModel';
import { content, freshState } from './helpers';

describe('the Upgrades board (milestone picks by place)', () => {
  it('lists every milestone once, in Logging, Mining and Training', () => {
    const board = milestoneBoard(freshState(), content);
    expect(board.groups.map((g) => g.key)).toEqual(['logging', 'mining', 'training']);
    const ids = board.groups.flatMap((g) =>
      g.lines.flatMap((l) => l.items.map((i) => i.milestone.id)),
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(content.perks.milestones.length);
  });

  it('counts the picks waiting and marks the rest picked, kept or ahead', () => {
    const s = freshState();
    s.production.treeLevels['oak'] = 26;
    s.upgrades.picks['oak_10'] = 'oak_10_output';
    s.upgrades.picks['oak_50'] = 'oak_50_worker';
    const board = milestoneBoard(s, content);
    const oak = board.groups[0]!.lines.find((l) => l.line.id === 'oak')!;
    expect(oak.items.map((i) => i.status)).toEqual(['active', 'waiting', 'kept', 'ahead']);
    expect(board.waiting).toBeGreaterThanOrEqual(1);
  });

  it('reads the lifetime Money as a coin amount', () => {
    const s = freshState();
    s.upgrades.moneyEarned = new Decimal('1234');
    expect(milestoneBoard(s, content).lifetime).toMatch(/\d/);
  });
});
