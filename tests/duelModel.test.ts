import { describe, expect, it } from 'vitest';
import { Decimal } from '../src/game';
import {
  DUEL_PANELS,
  FEED_LINES,
  PLATE_HOLD_MS,
  clock,
  deckBacks,
  duelDoing,
  enemyDamage,
  enemyMoment,
  feedLines,
  floorPips,
  handCardWant,
  handSize,
  handSlot,
  hopMs,
  numberStyle,
  pipKind,
  queuePlates,
  sheetRows,
  showPlates,
  slotColour,
  togglePanel,
} from '../src/renderer/src/views/dungeon/duelModel';

const d = (n: number) => new Decimal(n);

describe('the hand', () => {
  it('overlaps neighbours by 20 art pixels and drops the two outer cards 8', () => {
    expect([0, 1, 2, 3].map((i) => handSlot(i, 4))).toEqual([
      { x: 0, y: 8 },
      { x: 112, y: 0 },
      { x: 224, y: 0 },
      { x: 336, y: 8 },
    ]);
    expect(handSize(4)).toEqual({ w: 468, h: 194 });
  });

  it('keeps a hand of one or two flat', () => {
    expect(handSlot(0, 1)).toEqual({ x: 0, y: 0 });
    expect(handSlot(1, 2)).toEqual({ x: 112, y: 0 });
    expect(handSize(1)).toEqual({ w: 132, h: 186 });
    expect(handSize(0)).toEqual({ w: 132, h: 186 });
  });

  it('wants a card from the duel height, never more than 55% of it', () => {
    const { want, max } = handCardWant(492);
    expect(want).toBeCloseTo((492 * 0.42 * 132) / 186);
    expect(max).toBeGreaterThan(want);
  });

  it('hops over 40% of the hit interval, clamped to 160..420 ms', () => {
    expect(hopMs(0.5)).toBe(200);
    expect(hopMs(0.1)).toBe(160);
    expect(hopMs(3)).toBe(420);
    expect(hopMs(Infinity)).toBe(420);
  });

  it('colours the places gold, cyan, green, violet', () => {
    expect([0, 1, 2, 3, 4].map(slotColour)).toEqual(['gold', 'cyan', 'green', 'violet', 'gold']);
  });
});

describe('the enemy side', () => {
  it('marks beaten, fought and waiting pips, with the boss and mini-boss kinds', () => {
    expect(floorPips(2, ['enemy', 'enemy', 'boss'])).toEqual([
      { kind: 'enemy', state: 'done' },
      { kind: 'enemy', state: 'now' },
      { kind: 'boss', state: 'wait' },
    ]);
    expect(pipKind('miniboss')).toBe('miniboss');
    expect(pipKind('wave')).toBe('enemy');
  });

  it('walks to the next enemy, deals on a new dungeon or tier, and stays otherwise', () => {
    const a = { dungeon: 'mossy', difficulty: 'normal', key: 'mossy:1:1' };
    expect(enemyMoment(null, a)).toBe('deal');
    expect(enemyMoment(a, a)).toBe('same');
    expect(enemyMoment(a, { ...a, key: 'mossy:1:2' })).toBe('walk');
    expect(enemyMoment(a, { ...a, dungeon: 'ember', key: 'ember:1:1' })).toBe('deal');
    expect(enemyMoment(a, { ...a, difficulty: 'hard', key: 'x' })).toBe('deal');
    expect(enemyMoment(a, null)).toBe('same');
  });

  it('tags the damage dealt to the enemy, never below zero', () => {
    expect(enemyDamage(d(30), d(100)).toNumber()).toBe(70);
    expect(enemyDamage(d(120), d(100)).toNumber()).toBe(0);
  });

  it('draws a back per waiting enemy, five at most', () => {
    expect([0, 2, 5, 9, -1].map(deckBacks)).toEqual([0, 2, 5, 5, 0]);
  });

  it('wears the equipped number style, Stamped Numerals otherwise', () => {
    expect(numberStyle('candy-2')).toBe('candy-2');
    expect(numberStyle('  ')).toBe('forge-1');
    expect(numberStyle(undefined)).toBe('forge-1');
  });
});

describe('the feed and the sheet', () => {
  it('keeps the newest four lines with their place in the hand', () => {
    const feed = Array.from({ length: 6 }, (_, i) => ({
      cardId: i % 2 ? 'b' : 'a',
      damage: d(i + 1),
      hits: 1,
      signature: i === 0,
    }));
    const lines = feedLines(feed, ['a', 'b']);
    expect(lines).toHaveLength(FEED_LINES);
    expect(lines.map((l) => l.slot)).toEqual([0, 1, 0, 1]);
    expect(lines[0]!.signature).toBe(true);
    expect(
      feedLines([{ cardId: 'gone', damage: d(1), hits: 1, signature: false }], ['a'])[0]!.slot,
    ).toBe(-1);
  });

  it('gives each card a row in hand order, its bar against the top card', () => {
    const rows = sheetRows({ a: d(50), c: d(100) }, ['a', 'b', 'c']);
    expect(rows.map((r) => [r.cardId, r.slot, r.damage.toNumber(), r.bar])).toEqual([
      ['a', 0, 50, 0.5],
      ['b', 1, 0, 0],
      ['c', 2, 100, 1],
    ]);
    expect(sheetRows({}, ['a'])[0]!.bar).toBe(0);
  });
});

describe('skill plates', () => {
  const ev = (cardId: string) => ({
    cardId,
    skillId: `s-${cardId}`,
    kind: 'strike' as const,
    count: 1,
  });

  it('shows two at once and lets the third wait for a free place', () => {
    const { queue } = queuePlates([], [ev('a'), ev('b'), ev('c')], 0, 1);
    const at0 = showPlates(queue, 0);
    expect(at0.showing.map((p) => p.cardId)).toEqual(['a', 'b']);
    const later = showPlates(at0.queue, PLATE_HOLD_MS + 10);
    expect(later.showing.map((p) => p.cardId)).toEqual(['c']);
    // the third showed from the moment the first two ended, so it holds its full time
    expect(later.showing[0]!.at).toBe(PLATE_HOLD_MS);
    expect(showPlates(later.queue, 2 * PLATE_HOLD_MS + 20).showing).toEqual([]);
  });

  it('numbers the plates', () => {
    const r = queuePlates([], [ev('a')], 5, 7);
    expect(r.nextId).toBe(8);
    expect(r.queue[0]).toMatchObject({ id: 7, at: 5, kind: 'strike' });
  });
});

describe('the left column and the panels', () => {
  it('says what the team is doing', () => {
    expect(duelDoing({ trial: true, challenge: false, knockoutSeconds: 3 })).toBe('trial');
    expect(duelDoing({ trial: false, challenge: true, knockoutSeconds: 3 })).toBe('knockout');
    expect(duelDoing({ trial: false, challenge: true, knockoutSeconds: 0 })).toBe('challenge');
    expect(duelDoing({ trial: false, challenge: false, knockoutSeconds: 0 })).toBe('farming');
  });

  it('reads a Challenge clock as m:ss, rounded up', () => {
    expect(clock(54)).toBe('0:54');
    expect(clock(59.2)).toBe('1:00');
    expect(clock(-3)).toBe('0:00');
  });

  it('opens a panel and closes it on a second click', () => {
    expect(DUEL_PANELS).toEqual(['dungeons', 'weapon', 'training']);
    expect(togglePanel(null, 'weapon')).toBe('weapon');
    expect(togglePanel('weapon', 'weapon')).toBeNull();
    expect(togglePanel('weapon', 'training')).toBe('training');
  });
});
