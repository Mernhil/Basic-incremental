import { describe, expect, it } from 'vitest';
import { Decimal } from '../src/game';
import { holdAscension } from '../scripts/sim/sim';
import { content, freshState } from './helpers';

const coreNeed = content.cardRules.tierUp.gold.mining
  .find((c) => c.resource === 'frost_core')!
  .amount.toNumber();

const goldCard = (cores: number, level = 80, stars = 6) => {
  const state = freshState();
  state.cards.owned['geode_golem'] = {
    tier: 'gold',
    stars,
    level,
    xp: new Decimal(0),
    starFill: 0,
    enhancements: [],
  };
  state.resources['frost_core'] = new Decimal(cores);
  state.resources['frost_sigil'] = new Decimal(1000);
  // The gems of the step are in hand: only the slow dungeon materials decide the hold.
  state.resources['moonwillow_gem'] = new Decimal(1e6);
  state.resources['grotto_gem'] = new Decimal(1e6);
  state.resources['money'] = new Decimal(1e9);
  return state;
};

describe('balance sim: waiting for a Prismatic step before an ascension', () => {
  it('holds the ascension while a ready Gold card is most of the way to its Frost Cores', () => {
    expect(holdAscension(goldCard(Math.ceil(coreNeed * 0.8)), content)).toBe(true);
  });

  it('holds with the Cores in hand while only the gems are still to come', () => {
    const state = goldCard(coreNeed + 10);
    state.resources['moonwillow_gem'] = new Decimal(0);
    state.resources['grotto_gem'] = new Decimal(0);
    expect(holdAscension(state, content)).toBe(true);
  });

  it('treats Money like a slow material: it resets on Ascension, so it must be mostly in hand', () => {
    const farOff = goldCard(coreNeed + 10);
    farOff.resources['money'] = new Decimal(0);
    expect(holdAscension(farOff, content)).toBe(false);
    const goldMoney = content.cardRules.tierUp.gold.mining
      .find((c) => c.resource === 'money')!
      .amount.toNumber();
    const close = goldCard(coreNeed + 10);
    close.resources['money'] = new Decimal(goldMoney * 0.8);
    expect(holdAscension(close, content)).toBe(true);
  });

  it('does not hold when the Cores are far off, the card is below its level cap, or the step is affordable', () => {
    expect(holdAscension(goldCard(10), content)).toBe(false);
    expect(holdAscension(goldCard(Math.ceil(coreNeed * 0.8), 40), content)).toBe(false);
    expect(holdAscension(goldCard(coreNeed + 10), content)).toBe(false);
  });
});
