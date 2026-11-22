import { describe, expect, it } from 'vitest';
import { Decimal } from '../src/game';
import { milestoneBoard } from '../src/renderer/src/views/meta/upgradesModel';
import { content, freshState } from './helpers';

describe('the Upgrades board (milestone picks by place)', () => {
  it('lists every milestone once, under Training', () => {
    const board = milestoneBoard(freshState(), content);
    expect(board.groups.map((g) => g.key)).toEqual(['training']);
    const ids = board.groups.flatMap((g) =>
      g.lines.flatMap((l) => l.items.map((i) => i.milestone.id)),
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(content.perks.milestones.length);
  });

  it('counts the picks waiting and marks the rest picked, kept or ahead', () => {
    const s = freshState();
    s.combat.training['sharpen'] = 6;
    s.upgrades.picks['sharpen_5'] = content.perkMilestoneById.get('sharpen_5')!.options[0].id;
    const board = milestoneBoard(s, content);
    const line = board.groups[0]!.lines.find((l) => l.line.id === 'sharpen')!;
    expect(line.items.map((i) => i.status)).toEqual(['active', 'ahead', 'ahead']);
  });

  it('reads the lifetime Money as a coin amount', () => {
    const s = freshState();
    s.upgrades.moneyEarned = new Decimal('1234');
    expect(milestoneBoard(s, content).lifetime).toMatch(/\d/);
  });
});
