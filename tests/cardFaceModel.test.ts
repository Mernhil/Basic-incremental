import { describe, expect, it } from 'vitest';
import { addCard } from '../src/game';
import { cardFaceFor, secondsText } from '../src/renderer/src/pages/cardFaceModel';
import { content, freshState } from './helpers';

describe('Full-art card face model', () => {
  it('writes seconds the short way', () => {
    expect(secondsText(1)).toBe('1s');
    expect(secondsText(0.5)).toBe('0.5s');
    expect(secondsText(4 / 3)).toBe('1.33s');
  });

  it('shows the ability, hit speed, level and progress of an owned card', () => {
    const face = cardFaceFor(content, freshState(), 'ember_squire')!;
    expect(face.ability).toBe('Wooden Sword');
    expect(face.speed).toBe('hits every 1s');
    expect(face.level).toEqual({ value: 1, cap: expect.any(Number) });
    expect(face.progress).toBeGreaterThanOrEqual(0);
    expect(face.progress).toBeLessThanOrEqual(1);
  });

  it("uses each fighting card's own hit speed, even when it is not leading", () => {
    let state = freshState();
    state = addCard(state, content, 'storm_duelist')!.state;
    expect(cardFaceFor(content, state, 'storm_duelist')!.speed).toBe('hits every 0.5s');
    expect(cardFaceFor(content, state, 'dawnblade_regent')!.speed).toBe('hits every 2s');
  });

  it('shows the harvest rhythm of a logging or mining card', () => {
    const face = cardFaceFor(content, freshState(), 'apprentice_feller')!;
    expect(face.speed).toMatch(/^hits every [\d.]+s$/);
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
