import { describe, expect, it } from 'vitest';
import { Decimal } from '../src/game';
import { holdAscension } from '../scripts/sim/sim';
import { content, freshState } from './helpers';

const goldCard = (cores: number, level = 80, stars = 6) => {
  const state = freshState();
  state.cards.owned['cave_digger'] = {
    tier: 'gold',
    stars,
    level,
    xp: new Decimal(0),
    duplicates: 0,
    enhancements: [],
  };
  state.resources['frost_core'] = new Decimal(cores);
  state.resources['frost_sigil'] = new Decimal(200);
  return state;
};

describe('balance sim: waiting for a Prismatic step before an ascension', () => {
  it('holds the ascension while a ready Gold card is half way to its Frost Cores', () => {
    expect(holdAscension(goldCard(70), content)).toBe(true);
  });

  it('does not hold when the Cores are far off, the card is not ready, or the step is affordable', () => {
    expect(holdAscension(goldCard(10), content)).toBe(false);
    expect(holdAscension(goldCard(70, 40), content)).toBe(false);
    expect(holdAscension(goldCard(70, 80, 5), content)).toBe(false);
    expect(holdAscension(goldCard(160), content)).toBe(false);
  });
});
