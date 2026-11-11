import { describe, expect, it } from 'vitest';
import {
  collectModifiers,
  damageStat,
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
const fight = (main: string, supports: string[] = []): GameState => {
  const state = bareState();
  for (const id of [main, ...supports]) own(state, id);
  state.cards.loadouts.fighting = {
    main,
    supports: [supports[0] ?? null, supports[1] ?? null, supports[2] ?? null],
  };
  return state;
};
/** The element percent against a dungeon: the `element` damage modifiers that apply there. */
const elementPercent = (state: GameState, dungeon: string): number =>
  collectModifiers(state, content)
    .filter((m) => m.source.kind === 'element' && m.stat === 'combat.damage')
    .filter((m) => !m.scope?.dungeon || m.scope.dungeon === dungeon)
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

  it('the main card against the weakness gives +50%, against the resistance -25%', () => {
    expect(elementRelation(content, 'mossy_cellar', 'fire')).toBe('weak');
    expect(elementRelation(content, 'mossy_cellar', 'nature')).toBe('resist');
    expect(elementRelation(content, 'mossy_cellar', 'storm')).toBe('neutral');
    expect(elementRelation(content, 'glimmer_trial', 'fire')).toBe('neutral');
    expect(elementPercent(fight('ember_squire'), 'mossy_cellar')).toBe(50);
    expect(elementPercent(fight('fieldhand_archer'), 'mossy_cellar')).toBe(-25);
    expect(elementPercent(fight('alley_cutpurse'), 'mossy_cellar')).toBe(0);
  });

  it('each matching support adds +10%, a non-matching one nothing', () => {
    const s = fight('ember_squire', ['rusty_brute', 'brass_vanguard', 'alley_cutpurse']);
    expect(elementPercent(s, 'mossy_cellar')).toBe(70);
    expect(elementPercent(fight('alley_cutpurse', ['rusty_brute']), 'mossy_cellar')).toBe(10);
  });

  it('reaches the damage stat as a modifier of source element, only against that dungeon', () => {
    const state = fight('ember_squire');
    const mods = collectModifiers(state, content);
    const cellar = damageStat(state, content, 'mossy_cellar', mods);
    expect(cellar.applied.some((m) => m.source.kind === 'element')).toBe(true);
    expect(cellar.value.div(cellar.base).toNumber()).toBeCloseTo(1.5);
    // The Ember Crypt resists Fire: -25%, not +50%.
    const crypt = damageStat(state, content, 'ember_crypt', mods);
    expect(crypt.value.div(crypt.base).toNumber()).toBeCloseTo(0.75);
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
