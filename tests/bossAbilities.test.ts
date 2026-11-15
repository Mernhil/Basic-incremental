import { describe, expect, it } from 'vitest';
import {
  abilitiesFor,
  abilityCounts,
  abilityOfAttack,
  abilityTargets,
  advance,
  bossDamageBetween,
  buildTeam,
  collectModifiers,
  Decimal,
  lethalBossAttack,
  newOwnedCard,
  setActiveDungeon,
  type GameState,
} from '../src/game';
import { constantRng, content, freshState, withBossAttack, withBossHp } from './helpers';

const abilities = content.combat.bossAbilities;
const pattern = content.combat.bossPattern;
const rng = constantRng(0.5);
const FOUR = ['ember_squire', 'militia_picket', 'fieldhand_archer', 'field_reaper'];

const named = (kind: string, difficulty: string): string[] =>
  abilitiesFor(abilities, kind, difficulty).map((a) => a.id);

describe('boss abilities (DESIGN.md §6): data', () => {
  it('gives every Normal boss a light back strike, no Normal mini-boss anything', () => {
    expect(named('boss', 'normal')).toEqual(['back_strike']);
    expect(named('miniboss', 'normal')).toEqual([]);
    expect(named('enemy', 'nightmare')).toEqual([]);
  });

  it('adds more on Hard and Nightmare', () => {
    expect(named('boss', 'hard')).toEqual(['back_strike', 'sweep']);
    expect(named('miniboss', 'hard')).toEqual(['back_strike_mini']);
    expect(named('boss', 'nightmare')).toEqual(['back_strike', 'sweep', 'culling_blow']);
  });

  it('names a target each and never replaces a slam', () => {
    const targets = new Set(abilities.map((a) => a.target));
    expect(targets).toEqual(new Set(['back-one', 'back', 'lowest']));
    const list = abilitiesFor(abilities, 'boss', 'nightmare');
    for (let k = 1; k <= 120; k++) {
      if (k % pattern.attacksPerCycle === 0) expect(abilityOfAttack(k, pattern, list)).toBeNull();
    }
    expect(abilityOfAttack(2, pattern, list)?.id).toBe('back_strike');
    expect(abilityOfAttack(1, pattern, list)).toBeNull();
  });
});

describe('boss abilities: the schedule', () => {
  const list = abilitiesFor(abilities, 'boss', 'normal');
  const normal = new Decimal(100);

  it('counts the attacks an ability replaces, over any span', () => {
    expect(abilityCounts(0, 6, pattern, list)).toEqual([2]); // attacks 2 and 5
    expect(abilityCounts(0, 60, pattern, list)).toEqual([20]);
    expect(abilityCounts(5, 6, pattern, list)).toEqual([0]);
  });

  it('takes the replaced attacks off the main target', () => {
    const plain = bossDamageBetween(0, 6, normal, pattern).toNumber();
    const withAbility = bossDamageBetween(0, 6, normal, pattern, list).toNumber();
    expect(plain - withAbility).toBeCloseTo(2 * pattern.lightMultiplier * 100);
  });

  it('lets the main target last longer by the attacks that go elsewhere', () => {
    const pool = new Decimal(130);
    const plain = lethalBossAttack(pool, new Decimal(10), 0, pattern);
    const withAbility = lethalBossAttack(pool, new Decimal(10), 0, pattern, list);
    expect(withAbility).toBeGreaterThan(plain);
  });
});

describe('boss abilities: who they hit', () => {
  const stateOf = (): GameState => {
    const s = freshState();
    for (const id of FOUR) s.cards.owned[id] ??= newOwnedCard();
    s.account.level = 40;
    s.cards.loadouts.fighting = { slots: [...FOUR] };
    return s;
  };
  const team = (s: GameState) => buildTeam(s, content, collectModifiers(s, content), null);
  const find = (id: string) => abilities.find((a) => a.id === id)!;

  it('sends a Sweep to every standing back card and a back strike to one of them', () => {
    const s = stateOf();
    const t = team(s);
    expect(
      abilityTargets(s, t, find('sweep'), 3)
        .map((c) => c.id)
        .sort(),
    ).toEqual(['ember_squire', 'field_reaper']);
    const one = abilityTargets(s, t, find('back_strike'), 2);
    expect(one).toHaveLength(1);
    expect(one[0]!.row).toBe('back');
  });

  it('falls to the front when no back card stands, and finds the weakest for a Culling Blow', () => {
    const s = stateOf();
    const t = team(s);
    s.combat.cardsOut = ['ember_squire', 'field_reaper'];
    for (const c of t.filter((x) => x.row === 'back')) s.combat.cardDamage[c.id] = c.maxHealth;
    expect(abilityTargets(s, t, find('sweep'), 3).every((c) => c.row === 'front')).toBe(true);
    const fresh = stateOf();
    const picket = team(fresh).find((c) => c.id === 'militia_picket')!;
    fresh.combat.cardDamage[picket.id] = picket.maxHealth.mul(0.9);
    expect(abilityTargets(fresh, team(fresh), find('culling_blow'), 4)[0]!.id).toBe(
      'militia_picket',
    );
  });
});

describe('boss abilities in a fight', () => {
  const hitBoss = withBossAttack(withBossHp(content, 'mossy_cellar', 1e15), 'mossy_cellar', 4, 3);

  it('lets a Normal boss land a light hit on the back row now and then, named in the report', () => {
    const r = setActiveDungeon(freshState(), hitBoss, 'mossy_cellar');
    if (!r.ok) throw new Error(r.reason);
    const s = r.state;
    for (const id of FOUR) s.cards.owned[id] ??= newOwnedCard();
    s.cards.loadouts.fighting = { slots: [...FOUR] };
    const { state, report } = advance(s, hitBoss, 30_000, rng);
    const strikes = report.bossAttacks.filter((e) => e.ability === 'Back Strike');
    expect(strikes.length).toBeGreaterThan(0);
    expect(strikes.every((e) => ['ember_squire', 'field_reaper'].includes(e.cardId))).toBe(true);
    // light: a sensible team keeps its back row standing
    expect(report.cardKnockouts).toEqual([]);
    const hurt = ['ember_squire', 'field_reaper'].reduce(
      (n, id) => n + (state.combat.cardDamage[id]?.toNumber() ?? 0),
      0,
    );
    expect(hurt).toBeGreaterThan(0);
  });
});
