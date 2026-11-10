import { describe, expect, it } from 'vitest';
import {
  ATTACK_MAX_MS,
  ATTACK_MIN_MS,
  attackAnimationMs,
  attackSpeed,
} from '../src/renderer/src/theme/attackSpeed';

describe('attack animation follows hit speed (DESIGN §6)', () => {
  it('plays a dagger swing faster than a hammer swing', () => {
    expect(attackAnimationMs(0.5)).toBeLessThan(attackAnimationMs(1));
    expect(attackAnimationMs(1)).toBeLessThan(attackAnimationMs(2));
    expect(attackAnimationMs(2)).toBeLessThan(attackAnimationMs(3) + 1);
  });

  it('clamps to a readable range', () => {
    expect(attackAnimationMs(0.05)).toBe(ATTACK_MIN_MS);
    expect(attackAnimationMs(3)).toBe(ATTACK_MAX_MS);
    expect(attackAnimationMs(30)).toBe(ATTACK_MAX_MS);
  });

  it('keeps the drawn speed without an interval', () => {
    expect(attackSpeed(420)).toBe(1);
    expect(attackSpeed(420, 0)).toBe(1);
  });

  it('speeds an animation up for a fast hit and slows it for a slow one', () => {
    expect(attackSpeed(420, 0.5)).toBeGreaterThan(1);
    expect(attackSpeed(420, 3)).toBeLessThan(1);
    expect(attackSpeed(400, 1)).toBeCloseTo(1, 5);
  });
});
