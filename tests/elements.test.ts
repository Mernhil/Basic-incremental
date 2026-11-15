import { describe, expect, it } from 'vitest';
import {
  collectModifiers,
  buildTeam,
  elementRelation,
  newOwnedCard,
  producerRate,
  type GameState,
} from '../src/game';
import { loadContent } from '../src/data';
import { bareState } from './helpers';

const content = loadContent();

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

describe('boss weaknesses and resistances', () => {
  it('all six bosses have them, from DESIGN §6', () => {
    const want: Record<string, [string, string]> = {
      mossy_cellar: ['fire', 'nature'],
      ember_crypt: ['light', 'fire'],
      frostspire_vault: ['storm', 'crystal'],
      thunderpeak_aerie: ['earth', 'storm'],
      sunken_sanctum: ['void', 'light'],
      void_hollow: ['light', 'void'],
    };
    for (const [id, [weak, resist]] of Object.entries(want)) {
      const boss = content.dungeonById.get(id)!.boss;
      expect([boss.weakness, boss.resistance], id).toEqual([weak, resist]);
    }
    expect(content.dungeons).toHaveLength(6);
  });

  it('a card against the weakness gives its damage +50%, against the resistance -25%', () => {
    expect(elementRelation(content, 'mossy_cellar', 'fire')).toBe('weak');
    expect(elementRelation(content, 'mossy_cellar', 'nature')).toBe('resist');
    expect(elementRelation(content, 'mossy_cellar', 'storm')).toBe('neutral');
    expect(elementRelation(content, 'glimmer_trial', 'fire')).toBe('neutral');
    expect(elementPercent(fight('ember_squire'), 'mossy_cellar', 'ember_squire')).toBe(50);
    expect(elementPercent(fight('fieldhand_archer'), 'mossy_cellar', 'fieldhand_archer')).toBe(-25);
    expect(elementPercent(fight('alley_cutpurse'), 'mossy_cellar', 'alley_cutpurse')).toBe(0);
  });

  it('every matching card gets its own +50%, in any slot, and a non-matching one nothing', () => {
    const s = fight('alley_cutpurse', 'ember_squire', 'rusty_brute', 'brass_vanguard');
    for (const id of ['ember_squire', 'rusty_brute', 'brass_vanguard']) {
      expect(elementPercent(s, 'mossy_cellar', id), id).toBe(50);
    }
    expect(elementPercent(s, 'mossy_cellar', 'alley_cutpurse')).toBe(0);
  });

  it('changes only the damage of the card whose element it is, only against that dungeon', () => {
    const state = fight('ember_squire', 'alley_cutpurse');
    const mods = collectModifiers(state, content);
    const cellar = buildTeam(state, content, mods, 'mossy_cellar');
    const neutral = buildTeam(state, content, mods, 'void_hollow');
    // percent bonuses add: the two Commons' team bonuses (+4% each) and the Squire's +50%
    expect(cellar[0]!.hit.div(neutral[0]!.hit).toNumber()).toBeCloseTo(1.58 / 1.08);
    expect(cellar[1]!.hit.div(neutral[1]!.hit).toNumber()).toBeCloseTo(1);
    // The Ember Crypt resists Fire: -25%, not +50%.
    const crypt = buildTeam(state, content, mods, 'ember_crypt');
    expect(crypt[0]!.hit.div(neutral[0]!.hit).toNumber()).toBeCloseTo(0.83 / 1.08);
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
    const oak = place('apprentice_feller', 'oak', 'logging');
    expect(oak.element.map((m) => [m.stat, m.kind, m.value.toNumber()])).toEqual([
      ['production.rate', 'percent', 15],
    ]);
    const bare = producerRate(content.treeById.get('oak')!, 'logging', []);
    expect(oak.rate.div(bare).toNumber()).toBeGreaterThan(1.15 - 1e-9);
    expect(place('cave_digger', 'iron_deeps', 'mining').element).toHaveLength(1);
    expect(place('gem_cutter', 'crystal_grotto', 'mining').element).toHaveLength(1);
    // A crystal worker on the Iron Deeps (earth) and a nature worker on the quarry get nothing.
    expect(place('gem_cutter', 'iron_deeps', 'mining').element).toHaveLength(0);
  });
});
