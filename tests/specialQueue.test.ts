import { describe, expect, it } from 'vitest';
import {
  SPECIAL_WAIT_MAX,
  STAMP_GAP,
  queueSpecial,
  stampSpot,
} from '../src/renderer/src/stage/specialQueue';

describe('ultimates queue one at a time', () => {
  it('keeps the order they fired in', () => {
    let waiting: string[] = [];
    for (const id of ['a', 'b']) waiting = queueSpecial(waiting, id).waiting;
    expect(waiting).toEqual(['a', 'b']);
  });

  it('holds at most the cap and drops the oldest waiting, never the newest', () => {
    let waiting: string[] = [];
    const dropped: string[] = [];
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      const q = queueSpecial(waiting, id);
      waiting = q.waiting;
      dropped.push(...q.dropped);
    }
    expect(waiting).toHaveLength(SPECIAL_WAIT_MAX);
    expect(waiting).toEqual(['d', 'e']);
    expect(dropped).toEqual(['a', 'b', 'c']);
  });

  it('drops nothing while under the cap', () => {
    expect(queueSpecial(['a'], 'b').dropped).toEqual([]);
  });

  it('has no other place to send a dropped ultimate: it comes back as data, not as a banner', () => {
    const q = queueSpecial(['a', 'b'], 'c');
    expect(q.dropped).toEqual(['a']);
    expect(q.waiting).toEqual(['b', 'c']);
  });
});

describe('stamps on the enemy card', () => {
  it('lands in its own band', () => {
    const crit = stampSpot('crit', [], () => 0.5);
    const brk = stampSpot('break', [], () => 0.5);
    expect(crit.x).toBeGreaterThan(0.5);
    expect(brk.x).toBeLessThan(0.3);
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
      .filter((c) => !hasSpecial(c.item?.kind, c.element))
      .map((c) => `${c.id} (${c.item?.kind}, ${c.element})`);
    expect(missing).toEqual([]);
  });
});
