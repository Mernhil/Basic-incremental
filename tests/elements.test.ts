import { describe, expect, it } from 'vitest';
import {
  collectModifiers,
  buildTeam,
  elementRelation,
  newOwnedCard,
  producerRate,
  type GameState,
} from '../src/game';
import { ELEMENTS, loadContent } from '../src/data';
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

  it('the 111 T6 and Heirloom cards come out as dark 31, water 24, light 22, fire 19, earth 15', () => {
    const count: Record<string, number> = {};
    for (const card of content.cards) {
      if (card.element) count[card.element] = (count[card.element] ?? 0) + 1;
    }
    expect(count).toEqual({ dark: 31, water: 24, light: 22, fire: 19, earth: 15 });
  });
});

describe('boss weaknesses and resistances', () => {
  it('all six bosses have a weakness; a resistance only where it is water, fire or earth', () => {
    const want: Record<string, [string, string | undefined]> = {
      mossy_cellar: ['fire', 'earth'],
      ember_crypt: ['light', 'fire'],
      frostspire_vault: ['water', undefined], // storm and crystal both became water: weakness kept
      thunderpeak_aerie: ['earth', 'water'],
      sunken_sanctum: ['dark', undefined], // it resisted light: nothing resists light or dark
      void_hollow: ['light', undefined],
    };
    for (const [id, [weak, resist]] of Object.entries(want)) {
      const boss = content.dungeonById.get(id)!.boss;
      expect([boss.weakness, boss.resistance], id).toEqual([weak, resist]);
    }
    expect(content.dungeons).toHaveLength(6);
  });

  it('a card against the weakness gives its damage +50%, against the resistance -25%', () => {
    expect(elementRelation(content, 'mossy_cellar', 'fire')).toBe('weak');
    expect(elementRelation(content, 'mossy_cellar', 'earth')).toBe('resist');
    expect(elementRelation(content, 'mossy_cellar', 'water')).toBe('neutral');
    expect(elementRelation(content, 'glimmer_trial', 'fire')).toBe('neutral');
    expect(elementPercent(fight(FIRE), 'mossy_cellar', FIRE)).toBe(50);
    expect(elementPercent(fight(EARTH), 'mossy_cellar', EARTH)).toBe(-25);
    expect(elementPercent(fight(WATER), 'mossy_cellar', WATER)).toBe(0);
  });

  it('water beats fire, fire beats earth, earth beats water: the beaten side does less', () => {
    // Cellar: fire strong, earth weak. Crypt: light strong, fire weak. Aerie: earth strong, water weak.
    expect(elementPercent(fight(FIRE), 'mossy_cellar', FIRE)).toBe(50);
    expect(elementPercent(fight(FIRE), 'ember_crypt', FIRE)).toBe(-25);
    expect(elementPercent(fight(EARTH), 'thunderpeak_aerie', EARTH)).toBe(50);
    expect(elementPercent(fight(WATER), 'thunderpeak_aerie', WATER)).toBe(-25);
    expect(elementPercent(fight(WATER), 'frostspire_vault', WATER)).toBe(50);
  });

  it('light and dark hit the other harder and are never reduced by any boss', () => {
    expect(elementPercent(fight(DARK), 'sunken_sanctum', DARK)).toBe(50);
    expect(elementPercent(fight(LIGHT), 'void_hollow', LIGHT)).toBe(50);
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
    expect(elementPercent(s, 'mossy_cellar', WATER)).toBe(0);
  });

  it('changes only the damage of the card whose element it is, only against that dungeon', () => {
    const state = fight(FIRE, BASE);
    const mods = collectModifiers(state, content);
    const cellar = buildTeam(state, content, mods, 'mossy_cellar');
    const neutral = buildTeam(state, content, mods, 'void_hollow');
    expect(cellar[0]!.hit.div(neutral[0]!.hit).toNumber()).toBeGreaterThan(1.3);
    expect(cellar[1]!.hit.div(neutral[1]!.hit).toNumber()).toBeCloseTo(1);
    const crypt = buildTeam(state, content, mods, 'ember_crypt');
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
    state.production.workers = { [id]: [worker] };
    const mods = collectModifiers(state, content);
    const producer = (job === 'logging' ? content.treeById : content.mineById).get(id)!;
    const element = mods.filter((m) => m.source.kind === 'element');
    return { mods, element, rate: producerRate(producer, job, mods) };
  };
  it('+15% to production.rate on a matching tree or mine, nothing elsewhere', () => {
    const iron = place('emerald_seer', 'iron_deeps', 'mining');
    expect(iron.element.map((m) => [m.stat, m.kind, m.value.toNumber()])).toEqual([
      ['production.rate', 'percent', 15],
    ]);
    const bare = producerRate(content.mineById.get('iron_deeps')!, 'mining', []);
    expect(iron.rate.div(bare).toNumber()).toBeGreaterThan(1.15 - 1e-9);
    expect(place('azure_delver', 'crystal_grotto', 'mining').element).toHaveLength(1);
    // A water worker on the Iron Deeps (earth) gets nothing.
    expect(place('azure_delver', 'iron_deeps', 'mining').element).toHaveLength(0);
  });
  it('a Wood to Prismatic worker has no element, so it never gets the bonus', () => {
    expect(place('apprentice_feller', 'oak', 'logging').element).toHaveLength(0);
    expect(place('cave_digger', 'iron_deeps', 'mining').element).toHaveLength(0);
  });
  it('every tree is earth, and no T6 or Heirloom logging worker is earth (the logging axe has none)', () => {
    for (const tree of content.trees) expect(tree.element, tree.id).toBe('earth');
    const earthLoggers = content.cards.filter((c) => c.job === 'logging' && c.element === 'earth');
    expect(earthLoggers).toHaveLength(0);
  });
});
