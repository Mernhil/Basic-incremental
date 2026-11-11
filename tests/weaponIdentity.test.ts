import { describe, expect, it } from 'vitest';
import { ITEM_KINDS, RARITIES } from '../src/data';
import {
  averageDps,
  burstStats,
  collectModifiers,
  critStats,
  loadoutMaxHealth,
  newOwnedCard,
} from '../src/game';
import { bareState, content } from './helpers';

/** DESIGN §5 Weapon identities: every fighting type has its own shape and the same total power. */
const KINDS = ITEM_KINDS.filter((k) => !['pickaxe', 'logging_axe'].includes(k));

/** A game whose fighting main is the card of this type and rarity, fresh, no supports. */
function lead(kind: string, rarity: string) {
  const card = content.cards.find(
    (c) => c.job === 'fighting' && c.item.kind === kind && c.rarity === rarity,
  )!;
  const state = bareState();
  state.cards.owned[card.id] = newOwnedCard();
  state.cards.loadouts.fighting = { main: card.id, supports: [null, null, null] };
  const mods = collectModifiers(state, content);
  return {
    card,
    dps: averageDps(state, content, null, mods),
    health: loadoutMaxHealth(state, content, mods),
    crit: critStats(content, mods),
    burst: burstStats(content, 'fighting', mods),
  };
}

describe('weapon identities (DESIGN.md §5)', () => {
  it('every fighting type has a card of every rarity', () => {
    for (const kind of KINDS) for (const r of RARITIES) expect(lead(kind, r).card).toBeTruthy();
  });

  it('at the same rarity the types stay within 10% of each other in total power', () => {
    for (const rarity of RARITIES) {
      const power = KINDS.map((k) => {
        const l = lead(k, rarity);
        return { k, p: l.dps.mul(l.health).toNumber() };
      });
      const hi = Math.max(...power.map((x) => x.p));
      const lo = Math.min(...power.map((x) => x.p));
      expect(hi / lo, `${rarity}: ${JSON.stringify(power)}`).toBeLessThanOrEqual(1.1);
    }
  });

  it('follows the identity table', () => {
    const l = (k: string) => lead(k, 'rare');
    const crits = KINDS.map((k) => ({ k, ...l(k).crit }));
    const health = KINDS.map((k) => ({ k, h: l(k).health.toNumber() }));
    const top = <T>(a: T[], f: (x: T) => number) => a.reduce((m, x) => (f(x) > f(m) ? x : m));
    const low = <T>(a: T[], f: (x: T) => number) => a.reduce((m, x) => (f(x) < f(m) ? x : m));
    expect(top(crits, (c) => c.chance).k).toBe('spear');
    expect(top(crits, (c) => c.damage.toNumber()).k).toBe('bow');
    expect(low(health, (x) => x.h).k).toBe('bow');
    expect(top(health, (x) => x.h).k).toBe('hammer');
    // Scythe: medium crit chance and damage, between the sword and the extremes.
    const scythe = crits.find((c) => c.k === 'scythe')!;
    const sword = crits.find((c) => c.k === 'sword')!;
    expect(scythe.chance).toBeGreaterThan(sword.chance);
    expect(scythe.chance).toBeLessThan(crits.find((c) => c.k === 'spear')!.chance);
    expect(scythe.damage.gt(sword.damage)).toBe(true);
    expect(scythe.damage.lt(crits.find((c) => c.k === 'bow')!.damage)).toBe(true);
    // Sword is balanced: no crit change.
    expect(sword.chance).toBeCloseTo(0.05);
    expect(l('staff').burst.fill).toBeCloseTo(1.5);
    expect(l('dagger').burst.fill).toBeCloseTo(2);
    expect(l('lance').burst.power.toNumber()).toBe(20);
    expect(l('greatsword').burst.power.toNumber()).toBe(15);
    expect(l('hammer').burst.power.toNumber()).toBe(30);
    const hp = (k: string) => l(k).health.toNumber();
    expect(hp('lance')).toBeGreaterThan(hp('sword'));
    expect(hp('dagger')).toBeLessThan(hp('sword'));
    expect(l('spear').burst.interval).toBeCloseTo(0.8);
  });
});
