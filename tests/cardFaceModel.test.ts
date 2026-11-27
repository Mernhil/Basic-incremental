import { describe, expect, it } from 'vitest';
import { cardFaceFor } from '../src/renderer/src/pages/cardFaceModel';
import { content, freshState } from './helpers';

describe('Full-art card face model', () => {
  it('shows the level and progress of an owned card, and no hit speed', () => {
    const face = cardFaceFor(content, freshState(), 'ember_squire')!;
    expect(face).not.toHaveProperty('speed');
    expect(face.level).toEqual({ value: 1, cap: expect.any(Number) });
    expect(face.progress).toBeGreaterThanOrEqual(0);
    expect(face.progress).toBeLessThanOrEqual(1);
  });

  it('has no level for a card the player does not own', () => {
    const face = cardFaceFor(content, freshState(), 'dawnblade_regent')!;
    expect(face.level).toBeNull();
    expect(face.progress).toBe(0);
  });

  it('is null for an unknown card', () => {
    expect(cardFaceFor(content, freshState(), 'nope')).toBeNull();
  });
});
