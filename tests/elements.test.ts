import { describe, expect, it } from 'vitest';
import {
  collectModifiers,
  buildTeam,
  elementMatchup,
  elementRelation,
  resistsElement,
  weakToElement,
  newOwnedCard,
  materialRate,
  type GameState,
} from '../src/game';
import { ELEMENTS, loadContent, type CardElement } from '../src/data';
import { bareState } from './helpers';

const content = loadContent();
/** T6 cards of each element, and a Wood card (no element). */
const FIRE = 'grave_hammerer';
const FIRE2 = 'shadow_reaver';
const EARTH = 'jade_vanguard';
const WATER = 'cobalt_tyrant';
const LIGHT = 'seraph_lancer';
const DARK = 'violet_herald';
const BASE = 'alley_cutpurse';

/** DESIGN §6 Elements in combat: a bonus or a malus, never a wall. */
const own = (state: GameState, id: string) => (state.cards.owned[id] = newOwnedCard());
const fight = (...cards: string[]): GameState => {
  const state = bareState();
  for (const id of cards) own(state, id);
  state.cards.loadouts.fighting = { slots: [0, 1, 2, 3].map((i) => cards[i] ?? null) };
  return state;
};
/** The element percent a card gets against a dungeon: its own `element` damage modifier there. */
const elementPercent = (state: GameState, dungeon: string, card: string): number =>
  collectModifiers(state, content)
    .filter((m) => m.source.kind === 'element' && m.stat === 'combat.damage')
    .filter((m) => m.source.id === `${dungeon}:${card}`)
    .reduce((sum, m) => sum + m.value.toNumber(), 0);

describe('the five elements', () => {
  it('are water, fire, earth, light and dark', () => {
    expect([...ELEMENTS]).toEqual(['water', 'fire', 'earth', 'light', 'dark']);
  });

  it('a Wood to Prismatic card has none, a T6 or Heirloom card has one', () => {
    for (const card of content.cards) {
      const high = card.tier === 'mythic' || card.tier === 'heirloom';
      expect(card.element !== undefined, card.id).toBe(high);
    }
  });

  it('the 150 T6 and Heirloom cards come out as dark 32, water 25, light 23, fire 36, earth 34', () => {
    const count: Record<string, number> = {};
    for (const card of content.cards) {
      if (card.element) count[card.element] = (count[card.element] ?? 0) + 1;
    }
    expect(count).toEqual({ dark: 32, water: 25, light: 23, fire: 36, earth: 34 });
  });
});

describe('the circle', () => {
  it('water beats fire, fire beats earth, earth beats water; the beaten side does less', () => {
    const pairs: Array<[CardElement, CardElement]> = [
      ['water', 'fire'],
      ['fire', 'earth'],
      ['earth', 'water'],
    ];
    for (const [win, lose] of pairs) {
      expect(elementMatchup(win, lose), `${win} on ${lose}`).toBe('weak');
      expect(elementMatchup(lose, win), `${lose} on ${win}`).toBe('resist');
      expect(elementMatchup(win, win)).toBe('neutral');
    }
  });

  it('light and dark hit each other harder and nothing ever resists or weakens them', () => {
    expect(elementMatchup('light', 'dark')).toBe('weak');
    expect(elementMatchup('dark', 'light')).toBe('weak');
    for (const other of ['water', 'fire', 'earth'] as const) {
      for (const x of ['light', 'dark'] as const) {
        expect(elementMatchup(x, other), `${x} on ${other}`).toBe('neutral');
        expect(elementMatchup(other, x), `${other} on ${x}`).toBe('neutral');
      }
    }
    expect(elementMatchup('light', 'light')).toBe('neutral');
    expect(elementMatchup('dark', 'dark')).toBe('neutral');
  });

  it('a card with no element, or an enemy with none, is always plain', () => {
    for (const e of ELEMENTS) {
      expect(elementMatchup(undefined, e)).toBe('neutral');
      expect(elementMatchup(e, undefined)).toBe('neutral');
    }
  });

  it('names what an element is weak to and what it resists', () => {
    expect(weakToElement('fire')).toBe('water');
    expect(weakToElement('earth')).toBe('fire');
    expect(weakToElement('water')).toBe('earth');
    expect(weakToElement('dark')).toBe('light');
    expect(weakToElement('light')).toBe('dark');
    expect(resistsElement('fire')).toBe('earth');
    expect(resistsElement('earth')).toBe('water');
    expect(resistsElement('water')).toBe('fire');
    expect(resistsElement('light')).toBeUndefined();
    expect(resistsElement('dark')).toBeUndefined();
  });
});

describe('boss elements', () => {
  it('each of the six bosses has one element, derived from its old weakness', () => {
    const want: Record<string, CardElement> = {
      mossy_cellar: 'earth', // was weak to fire
      ember_crypt: 'dark', // was weak to light
      frostspire_vault: 'fire', // was weak to water
      thunderpeak_aerie: 'water', // was weak to earth
      sunken_sanctum: 'light', // was weak to dark
      void_hollow: 'dark', // was weak to light
    };
    for (const [id, element] of Object.entries(want)) {
      expect(content.dungeonById.get(id)!.boss.element, id).toBe(element);
    }
    expect(content.dungeons).toHaveLength(6);
  });

  it('the weakness every player knows is unchanged', () => {
    const weak: Record<string, CardElement> = {
      mossy_cellar: 'fire',
      ember_crypt: 'light',
      frostspire_vault: 'water',
      thunderpeak_aerie: 'earth',
      sunken_sanctum: 'dark',
      void_hollow: 'light',
    };
    for (const [id, element] of Object.entries(weak)) {
      expect(weakToElement(content.dungeonById.get(id)!.boss.element), id).toBe(element);
      expect(elementRelation(content, id, element), id).toBe('weak');
    }
  });

  it('the circle applies on every boss: +50% when the card beats it, -25% when it beats the card', () => {
    // Cellar is earth: fire beats it, water is beaten by it.
    expect(elementPercent(fight(FIRE), 'mossy_cellar', FIRE)).toBe(50);
    expect(elementPercent(fight(WATER), 'mossy_cellar', WATER)).toBe(-25);
    expect(elementPercent(fight(EARTH), 'mossy_cellar', EARTH)).toBe(0);
    // Frostspire is fire: water beats it, earth is beaten by it; fire on fire is plain.
    expect(elementPercent(fight(WATER), 'frostspire_vault', WATER)).toBe(50);
    expect(elementPercent(fight(EARTH), 'frostspire_vault', EARTH)).toBe(-25);
    expect(elementPercent(fight(FIRE), 'frostspire_vault', FIRE)).toBe(0);
    // Aerie is water: earth beats it, fire is beaten by it (not only when the boss lists water).
    expect(elementPercent(fight(EARTH), 'thunderpeak_aerie', EARTH)).toBe(50);
    expect(elementPercent(fight(FIRE), 'thunderpeak_aerie', FIRE)).toBe(-25);
    // Dark bosses: light +50, dark plain, water/fire/earth plain. Light boss: dark +50.
    expect(elementPercent(fight(LIGHT), 'void_hollow', LIGHT)).toBe(50);
    expect(elementPercent(fight(DARK), 'void_hollow', DARK)).toBe(0);
    expect(elementPercent(fight(DARK), 'sunken_sanctum', DARK)).toBe(50);
    expect(elementPercent(fight(LIGHT), 'sunken_sanctum', LIGHT)).toBe(0);
    expect(elementPercent(fight(FIRE), 'void_hollow', FIRE)).toBe(0);
    expect(elementRelation(content, 'glimmer_trial', 'fire')).toBe('neutral');
  });

  it('light and dark are never reduced by any boss', () => {
    for (const dungeon of content.dungeons) {
      for (const id of [LIGHT, DARK]) {
        expect(elementPercent(fight(id), dungeon.id, id), dungeon.id + id).toBeGreaterThanOrEqual(
          0,
        );
      }
    }
  });

  it('a Wood to Prismatic card is never strong or weak, whatever the boss', () => {
    for (const dungeon of content.dungeons) {
      expect(elementPercent(fight(BASE), dungeon.id, BASE), dungeon.id).toBe(0);
    }
  });

  it('every matching card gets its own +50%, in any slot, and a non-matching one nothing', () => {
    const s = fight(BASE, FIRE, FIRE2, WATER);
    for (const id of [FIRE, FIRE2]) expect(elementPercent(s, 'mossy_cellar', id), id).toBe(50);
    expect(elementPercent(s, 'mossy_cellar', BASE)).toBe(0);
    expect(elementPercent(s, 'mossy_cellar', WATER)).toBe(-25); // water is beaten by the earth boss
  });

  it('changes only the damage of the card whose element it is, only against that dungeon', () => {
    const state = fight(FIRE, BASE);
    const mods = collectModifiers(state, content);
    const cellar = buildTeam(state, content, mods, 'mossy_cellar');
    const neutral = buildTeam(state, content, mods, 'void_hollow');
    expect(cellar[0]!.hit.div(neutral[0]!.hit).toNumber()).toBeGreaterThan(1.3);
    expect(cellar[1]!.hit.div(neutral[1]!.hit).toNumber()).toBeCloseTo(1);
    const crypt = buildTeam(state, content, mods, 'thunderpeak_aerie');
    expect(crypt[0]!.hit.div(neutral[0]!.hit).toNumber()).toBeLessThan(0.9);
  });

  it('is a bonus, never a wall', () => {
    expect(content.combat.elements.resistance.toNumber()).toBeGreaterThanOrEqual(-50);
  });
});

describe('workers on matching places', () => {
  const place = (worker: string, id: string, job: 'logging' | 'mining') => {
    const state = bareState();
    own(state, worker);
    state.clearedDungeons = content.dungeons.map((d) => d.id);
    state.camp.level = 40;
    const where = job === 'logging' ? 'forest' : 'cave';
    state.camp[where] = [{ material: id, card: worker }];
    const mods = collectModifiers(state, content);
    const producer = (job === 'logging' ? content.treeById : content.mineById).get(id)!;
    const element = mods.filter((m) => m.source.kind === 'element');
    const bare = materialRate(state, content, producer, []);
    return { mods, element, rate: materialRate(state, content, producer, mods), bare };
  };
  it('+15% to production.rate on a matching tree or mine, nothing elsewhere', () => {
    const iron = place('emerald_seer', 'iron_deeps', 'mining');
    expect(iron.element.map((m) => [m.stat, m.kind, m.value.toNumber()])).toEqual([
      ['production.rate', 'percent', 15],
    ]);
    expect(iron.rate.div(iron.bare).toNumber()).toBeGreaterThan(1.15 - 1e-9);
    expect(place('azure_delver', 'crystal_grotto', 'mining').element).toHaveLength(1);
    // A water worker on the Iron Deeps (earth) gets nothing.
    expect(place('azure_delver', 'iron_deeps', 'mining').element).toHaveLength(0);
  });
  it('a Wood to Prismatic worker has no element, so it never gets the bonus', () => {
    expect(place('apprentice_feller', 'oak', 'logging').element).toHaveLength(0);
    expect(place('cave_digger', 'iron_deeps', 'mining').element).toHaveLength(0);
  });
  it('every tree is earth, and the two earth logging workers are the Wildwood hero T6 and Heirloom axes', () => {
    for (const tree of content.trees) expect(tree.element, tree.id).toBe('earth');
    const earthLoggers = content.cards.filter((c) => c.job === 'logging' && c.element === 'earth');
    expect(earthLoggers.map((c) => c.id).sort()).toEqual(['beetlejaw', 'grovehewer']);
  });
});
