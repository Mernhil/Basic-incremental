import { describe, expect, it } from 'vitest';
import {
  SPECIAL_WAIT_MAX,
  STAMP_GAP,
  queueSpecial,
  stampSpot,
} from '../src/renderer/src/stage/specialQueue';

const job = (cardId: string, n = 0) => ({ cardId, n });

describe('ultimates queue one at a time', () => {
  it('keeps the order they fired in', () => {
    let waiting = [job('a')];
    waiting = queueSpecial(waiting, job('b')).waiting;
    expect(waiting.map((w) => w.cardId)).toEqual(['a', 'b']);
  });

  it('a card has one waiting: a newer one replaces its older one in its place', () => {
    let waiting = queueSpecial([job('a', 1)], job('b', 1)).waiting;
    const q = queueSpecial(waiting, job('a', 2));
    expect(q.waiting).toEqual([job('a', 2), job('b', 1)]);
    expect(q.dropped).toEqual([job('a', 1)]);
    waiting = q.waiting;
    expect(waiting).toHaveLength(2);
  });

  it('a flood from one card never crowds the others out', () => {
    let waiting = [job('sword'), job('bow'), job('hammer')];
    for (let i = 0; i < 20; i += 1) waiting = queueSpecial(waiting, job('dagger', i)).waiting;
    expect(waiting.map((w) => w.cardId).sort()).toEqual(['bow', 'dagger', 'hammer', 'sword']);
  });

  it('holds at most the cap and drops the oldest waiting, never the newest', () => {
    const q = queueSpecial(
      ['a', 'b', 'c', 'd'].map((id) => job(id)),
      job('e'),
    );
    expect(q.waiting).toHaveLength(SPECIAL_WAIT_MAX);
    expect(q.waiting.map((w) => w.cardId)).toEqual(['b', 'c', 'd', 'e']);
    expect(q.dropped.map((w) => w.cardId)).toEqual(['a']);
  });

  it('drops nothing while under the cap and the cards differ', () => {
    expect(queueSpecial([job('a')], job('b')).dropped).toEqual([]);
  });
});

describe('stamps on the enemy card', () => {
  it('BREAK! takes the upper slot and CRIT! the lower, never crossing', () => {
    for (const r of [0, 0.5, 0.99]) {
      const crit = stampSpot('crit', [], () => r);
      const brk = stampSpot('break', [], () => r);
      expect(brk.y).toBeLessThan(0.3);
      expect(crit.y).toBeGreaterThan(0.6);
      expect(crit.y - brk.y).toBeGreaterThan(0.4);
    }
  });

  it('never sits on a stamp that is still showing (two at a time, 200 seeded tries)', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let n = 0; n < 200; n += 1) {
      const first = stampSpot('crit', [], rnd);
      const second = stampSpot('crit', [first], rnd);
      expect(Math.hypot(second.x - first.x, (second.y - first.y) * 2)).toBeGreaterThanOrEqual(
        STAMP_GAP,
      );
    }
  });

  it('falls back to the farthest try when the band is full', () => {
    const spot = stampSpot('break', [{ x: 0.17, y: 0.17 }], () => 0.5);
    expect(spot.x).toBeGreaterThan(0);
  });
});

describe('every fighting card has a cut-in, so no ultimate needs another style', () => {
  it('covers each fighting weapon type with each element', async () => {
    const { loadContent } = await import('../src/data');
    const { hasSpecial } = await import('../src/renderer/src/stage/specialData');
    const missing = loadContent()
      .cards.filter((c) => c.job === 'fighting')
      .filter((c) => !hasSpecial(c.item?.kind, c.element, c.tier))
      .map((c) => `${c.id} (${c.item?.kind}, ${c.element})`);
    expect(missing).toEqual([]);
  });
});
