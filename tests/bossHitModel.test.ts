import { describe, expect, it } from 'vitest';
import { Decimal, type BossAttackEvent } from '../src/game';
import {
  PULSE_DEPTH,
  PULSE_HZ_END,
  STILL_GLOW,
  WINDUP_SECONDS,
  bossHitShows,
  edgeStrength,
  fallBanner,
  windupProgress,
  windupSeconds,
} from '../src/renderer/src/stage/bossHitModel';

const hit = (damage: number, slam = false, knockout = false): BossAttackEvent => ({
  dungeon: 'd',
  damage: new Decimal(damage),
  slam,
  attacks: 1,
  knockout,
  nextSlamSeconds: 10,
});

describe('windup', () => {
  it('is 1.5 s for the real bosses and shorter than a very short interval', () => {
    expect(windupSeconds(6)).toBe(WINDUP_SECONDS);
    expect(windupSeconds(1)).toBeCloseTo(0.8);
  });

  it('stays at 0 until the warning starts and for light hits', () => {
    expect(windupProgress(false, 0.5, 6)).toBe(0);
    expect(windupProgress(true, 4, 6)).toBe(0);
    expect(windupProgress(true, 1.5, 6)).toBe(0);
  });

  it('rises to 1 as the slam lands and holds a moment when it is late', () => {
    expect(windupProgress(true, 0.75, 6)).toBeCloseTo(0.5);
    expect(windupProgress(true, 0, 6)).toBe(1);
    expect(windupProgress(true, -0.1, 6)).toBe(1);
  });

  it('drops a long overdue warning', () => {
    expect(windupProgress(true, -0.5, 6)).toBe(0);
  });
});

describe('edgeStrength', () => {
  const T = WINDUP_SECONDS;
  const samples = (reduced: boolean, n = 600): number[] =>
    Array.from({ length: n + 1 }, (_, i) => edgeStrength(i / n, T, reduced));

  it('is off outside the warning', () => {
    expect(edgeStrength(0, T, false)).toBe(0);
    expect(edgeStrength(-1, T, false)).toBe(0);
  });

  it('grows with the wind-up: later peaks are stronger than earlier ones', () => {
    const early = Math.max(...samples(false).slice(0, 200));
    const late = Math.max(...samples(false).slice(400));
    expect(late).toBeGreaterThan(early);
    expect(late).toBeLessThanOrEqual(1);
  });

  it('never swings below the build-up it rides on (no on/off strobing)', () => {
    for (let i = 1; i <= 600; i++) {
      const p = i / 600;
      const s = edgeStrength(p, T, false);
      const build = Math.pow(p, 0.8);
      expect(s).toBeGreaterThanOrEqual(build * (1 - PULSE_DEPTH) - 1e-9);
      expect(s).toBeLessThanOrEqual(build + 1e-9);
    }
  });

  it('pulses fewer than 3 times a second, even at its fastest', () => {
    expect(PULSE_HZ_END).toBeLessThan(3);
    // count the peaks over the 1.5 s warning: well under 3 per second on average
    const s = samples(false, 1500);
    let peaks = 0;
    for (let i = 1; i < s.length - 1; i++) if (s[i]! > s[i - 1]! && s[i]! >= s[i + 1]!) peaks++;
    expect(peaks / T).toBeLessThan(3);
  });

  it('is a still glow that only builds up under reduced motion', () => {
    const s = samples(true);
    for (let i = 1; i < s.length; i++) expect(s[i]!).toBeGreaterThanOrEqual(s[i - 1]!);
    expect(Math.max(...s)).toBeCloseTo(STILL_GLOW);
  });
});

describe('bossHitShows', () => {
  it('places each hit on the bar one after another', () => {
    const shows = bossHitShows([hit(10), hit(40, true)], new Decimal(100), new Decimal(100));
    expect(shows[0]!.span).toEqual({ from: 1, to: 0.9 });
    expect(shows[1]!.span.from).toBeCloseTo(0.9);
    expect(shows[1]!.span.to).toBeCloseTo(0.5);
    expect(shows[1]!.event.slam).toBe(true);
  });

  it('measures against the full pool, not the pool left', () => {
    const [s] = bossHitShows([hit(25)], new Decimal(50), new Decimal(200));
    expect(s!.span).toEqual({ from: 0.25, to: 0.125 });
  });

  it('clamps a lethal hit to what was left and never goes below 0', () => {
    const shows = bossHitShows([hit(30, true, true), hit(5)], new Decimal(20), new Decimal(100));
    expect(shows[0]!.span).toEqual({ from: 0.2, to: 0 });
    expect(shows[1]!.span).toEqual({ from: 0, to: 0 });
  });

  it('gives nothing for an empty pool maximum', () => {
    expect(bossHitShows([hit(1)], new Decimal(0), new Decimal(0))).toEqual([]);
  });
});

describe('fallBanner', () => {
  const base = { secondsToKnockout: 1000, secondsPerKill: 1042, secondsToKnockoutNow: 400 };

  it('shows the figures when the loadout falls first (Root Warden: 16m 40s, 42 s early)', () => {
    expect(fallBanner({ ...base, fallsFirst: true })).toEqual({
      fallSeconds: 1000,
      earlySeconds: 42,
      nowSeconds: 400,
    });
  });

  it('stays hidden when the loadout wins the race', () => {
    expect(fallBanner({ ...base, fallsFirst: false })).toBeNull();
  });

  it('stays hidden when nothing attacks (a trial) or nothing can be killed', () => {
    expect(
      fallBanner({
        fallsFirst: false,
        secondsToKnockout: null,
        secondsPerKill: 30,
        secondsToKnockoutNow: null,
      }),
    ).toBeNull();
    expect(
      fallBanner({
        fallsFirst: true,
        secondsToKnockout: 10,
        secondsPerKill: null,
        secondsToKnockoutNow: null,
      }),
    ).toBeNull();
  });
});
