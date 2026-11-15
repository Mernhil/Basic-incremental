import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/data';
import {
  cardCost,
  loadoutCapAtLevel,
  loadoutProblem,
  MAX_LOADOUT_HEIRLOOMS,
  newOwnedCard,
  nextCapRise,
} from '../src/game';
import { slotChoices } from '../src/renderer/src/pages/cardsModel';
import { freshState } from './helpers';

const real = loadContent();

/** DESIGN.md §5 Cost, §10 Loadout cost cap. */
describe('the loadout cost cap', () => {
  it('starts as it did and tops out at 64', () => {
    expect(loadoutCapAtLevel(real, 1)).toBe(6);
    expect(loadoutCapAtLevel(real, 2)).toBe(8);
    expect(real.account.loadoutCostCapTop).toBe(64);
    expect(loadoutCapAtLevel(real, 500)).toBe(64);
  });

  it('never stops a team the player can own: 36 by level 40, 56 by level 120, 64 by level 150', () => {
    expect(loadoutCapAtLevel(real, 40)).toBeGreaterThanOrEqual(36);
    expect(loadoutCapAtLevel(real, 120)).toBeGreaterThanOrEqual(56);
    expect(loadoutCapAtLevel(real, 150)).toBe(64);
  });

  it('grows by +2 a level to level 10, then slower, and never shrinks', () => {
    let last = 0;
    for (let level = 1; level <= 200; level++) {
      const cap = loadoutCapAtLevel(real, level);
      expect(cap).toBeGreaterThanOrEqual(last);
      if (level > 1 && level <= 10) expect(cap - last).toBeGreaterThanOrEqual(2);
      if (level > 14) expect(cap - last).toBeLessThanOrEqual(2);
      last = cap;
    }
  });

  it('says when the next rise comes, and nothing at the top', () => {
    const rise = nextCapRise(real, 12)!;
    expect(loadoutCapAtLevel(real, rise.level) - loadoutCapAtLevel(real, 12)).toBe(rise.by);
    expect(rise.level).toBeGreaterThan(12);
    expect(nextCapRise(real, 200)).toBeNull();
  });

  it('fits two Heirlooms and two T6 cards (64) and three T6 with an Heirloom (60)', () => {
    const t6 = cardCost(real, 'seraph_lancer');
    const heirloom = real.cards.find((c) => c.heirloom)!;
    expect(2 * cardCost(real, heirloom.id) + 2 * t6).toBe(64);
    expect(cardCost(real, heirloom.id) + 3 * t6).toBe(60);
  });
});

describe('at most two Heirlooms in a loadout', () => {
  const heirlooms = real.cards.filter((c) => c.job === 'fighting' && c.heirloom).slice(0, 3);
  const stateWith = (...ids: string[]) => {
    const s = freshState();
    s.account.level = 200;
    for (const id of ids) s.cards.owned[id] = newOwnedCard();
    return s;
  };

  it('refuses a third Heirloom', () => {
    expect(MAX_LOADOUT_HEIRLOOMS).toBe(2);
    const [a, b, c] = heirlooms.map((h) => h.id) as [string, string, string];
    const s = stateWith(a, b, c);
    expect(loadoutProblem(s, real, 'fighting', { slots: [a, b, null, null] })).toBeNull();
    expect(loadoutProblem(s, real, 'fighting', { slots: [a, b, c, null] })).toBe(
      'too-many-heirlooms',
    );
  });

  it('tells the picker why a third Heirloom cannot go in', () => {
    const [a, b, c] = heirlooms.map((h) => h.id) as [string, string, string];
    const entry = (id: string, heirloom: boolean) =>
      ({ id, owned: true, job: 'fighting', cost: cardCost(real, id), heirloom }) as never;
    const choices = slotChoices(
      [entry(a, true), entry(b, true), entry(c, true), entry('ember_squire', false)],
      { job: 'fighting', slots: [a, b, null, null], cost: 36, cap: 64, nextRise: null },
      2,
    );
    const third = choices.find((x) => x.id === c)!;
    expect(third.heirloomBlocked).toBe(true);
    expect(third.fits).toBe(false);
    expect(choices.find((x) => x.id === 'ember_squire')!.heirloomBlocked).toBe(false);
    // swapping one of the two Heirlooms for the third is fine
    const swap = slotChoices(
      [entry(a, true), entry(b, true), entry(c, true)],
      { job: 'fighting', slots: [a, b, null, null], cost: 36, cap: 64, nextRise: null },
      1,
    );
    expect(swap.find((x) => x.id === c)!.heirloomBlocked).toBe(false);
  });
});

describe('scroll rewards are whole numbers (user, 2026-11-15)', () => {
  const scroll = (r: { resource: string; amount: { toNumber(): number } | string }) =>
    /scroll/.test(r.resource);
  it('on the reward track, in achievements and on first clears', () => {
    const amounts: number[] = [];
    for (const step of real.account.rewardTrack) {
      for (const r of step.resources) if (scroll(r)) amounts.push(Number(r.amount.toString()));
    }
    for (const a of real.achievements) {
      for (const r of a.reward.resources ?? [])
        if (scroll(r)) amounts.push(Number(r.amount.toString()));
    }
    for (const d of real.dungeons) {
      for (const r of d.drops.firstClear) if (scroll(r)) amounts.push(Number(r.amount.toString()));
    }
    expect(amounts.length).toBeGreaterThan(10);
    for (const n of amounts) {
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
    }
  });
});
