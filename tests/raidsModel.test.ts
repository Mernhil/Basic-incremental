import { describe, expect, it } from 'vitest';
import { Decimal, type RaidFight } from '../src/game';
import {
  bossRows,
  clockText,
  ending,
  frameAt,
  ladderLines,
  rewardLines,
  shareText,
} from '../src/renderer/src/views/raids/raidsModel';
import { content, freshState } from './helpers';

const fight = (over: Partial<RaidFight> = {}): RaidFight => ({
  bossId: 'ember_tyrant',
  hp: new Decimal(1000),
  dealt: new Decimal(500),
  killed: false,
  seconds: 90,
  share: 0.5,
  score: new Decimal(500),
  out: [],
  samples: [
    { t: 0, dealt: 0, down: 0 },
    { t: 10, dealt: 0.2, down: 0 },
    { t: 20, dealt: 0.5, down: 1 },
  ],
  trick: { kind: 'rage', left: 1 },
  level: 0,
  ...over,
});

describe('the Raids view model', () => {
  it('has a row per boss with its weakness, tries and best', () => {
    const s = freshState();
    s.raids = {
      day: '2026-12-01',
      used: { ember_tyrant: 1 },
      best: { ember_tyrant: 0.8 },
      paid: {},
      level: { ember_tyrant: 1 },
    };
    const rows = bossRows(s, content, '2026-12-01');
    expect(rows).toHaveLength(5);
    const tyrant = rows.find((r) => r.id === 'ember_tyrant')!;
    expect(tyrant.weakTo).toBe('water');
    expect(tyrant.triesLeft).toBe(2);
    expect(tyrant.level).toBe(1);
    expect(tyrant.best).toBe(0.8);
    expect(tyrant.rank).not.toBeNull();
    expect(rows.find((r) => r.id === 'tide_queen')!.rank).toBeNull();
    // a new day gives the tries back
    expect(bossRows(s, content, '2026-12-02').find((r) => r.id === 'ember_tyrant')!.triesLeft).toBe(
      3,
    );
  });

  it('writes shares and clocks', () => {
    expect(shareText(1.04)).toBe('104%');
    expect(clockText(90)).toBe('1:30');
    expect(clockText(0)).toBe('0:00');
    expect(clockText(59.2)).toBe('1:00');
  });

  it('plays a fight back between its samples and ends at its length', () => {
    const f = fight();
    expect(frameAt(f, 0).dealt).toBe(0);
    expect(frameAt(f, 5).dealt).toBeCloseTo(0.1);
    expect(frameAt(f, 15).dealt).toBeCloseTo(0.35);
    expect(frameAt(f, 5).done).toBe(false);
    const end = frameAt(f, 999);
    expect(end.done).toBe(true);
    expect(end.dealt).toBeCloseTo(0.5);
  });

  it('says how a fight ended', () => {
    expect(ending(fight({ killed: true }), 90)).toBe('victory');
    expect(ending(fight({ seconds: 40 }), 90)).toBe('wiped');
    expect(ending(fight(), 90)).toBe('timeUp');
  });

  it('lists the ladder with the player and the rewards with what is paid', () => {
    const s = freshState();
    s.raids = {
      day: null,
      used: {},
      best: { tide_queen: 0.5 },
      paid: { tide_queen: 7 },
      level: {},
    };
    const lines = ladderLines(s, content, 'tide_queen', new Decimal(1000));
    expect(lines.filter((l) => l.you)).toHaveLength(1);
    expect(lines).toHaveLength(content.raids.ladder.teams.length + 1);
    const rewards = rewardLines(
      s,
      content,
      'tide_queen',
      (id) => id,
      (n) => n.toString(),
    );
    expect(rewards.map((r) => r.rank)).toEqual([10, 7, 5, 3, 1]);
    expect(rewards.map((r) => r.paid)).toEqual([true, true, false, false, false]);
  });
});
