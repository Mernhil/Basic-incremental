import { describe, expect, it } from 'vitest';
import {
  advance,
  bossAttackDps,
  collectModifiers,
  createSaveText,
  Decimal,
  defencePercent,
  loadoutHealth,
  loadoutMaxHealth,
  secondsToKnockoutNow,
  readSave,
  setActiveDungeon,
  type CombatResult,
  type GameState,
  type Modifier,
} from '../src/game';
import { MIGRATIONS } from '../src/game/migrations';
import { constantRng, content, freshState } from './helpers';

const rng = constantRng(0.99);
const warden = content.dungeonById.get('mossy_cellar')!;

const ok = (r: CombatResult): GameState => {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};
function inCellar(): GameState {
  return ok(setActiveDungeon(freshState(), content, 'mossy_cellar'));
}
const mods = (s: GameState) => collectModifiers(s, content);
/** When the hit that empties the pool lands (hits come in chunks, see bossHits.test.ts). */
const secondsToDown = (s: GameState) => secondsToKnockoutNow(s, content)!;

describe('card health (DESIGN.md §6)', () => {
  it('pools the fighting loadout cards health', () => {
    const s = inCellar();
    const owned = s.cards.owned['ember_squire']!;
    expect(owned).toBeDefined();
    const pool = loadoutMaxHealth(s, content, mods(s));
    expect(pool.toNumber()).toBeGreaterThan(0);
    expect(loadoutHealth(s, content).current.eq(pool)).toBe(true);
  });

  it('lets bosses hit back at their own rhythm, harder with prestige', () => {
    const base = bossAttackDps(warden, 0, []);
    expect(base.toNumber()).toBeCloseTo(
      warden.boss.attack.damage.toNumber() / warden.boss.attack.intervalSeconds,
    );
    expect(bossAttackDps(warden, 3, []).gt(base)).toBe(true);
  });

  it('blocks damage only through the defence stat, capped at 90%', () => {
    const def = (v: string): Modifier[] => [
      {
        stat: 'combat.defence',
        kind: 'flat',
        value: new Decimal(v),
        scale: 'full',
        source: { kind: 'cosmetic', id: 'test' },
      } as Modifier,
    ];
    const base = () => bossAttackDps(warden, 0, []);
    expect(defencePercent(def('25'), 'mossy_cellar')).toBe(25);
    expect(defencePercent(def('500'), 'mossy_cellar')).toBe(90);
    expect(bossAttackDps(warden, 0, def('50')).toNumber()).toBeCloseTo(base().toNumber() / 2);
  });

  it('knocks the loadout out when the pool runs dry: the boss heals and the fight pauses', () => {
    const start = inCellar();
    const down = secondsToDown(start);
    const { state, report } = advance(start, content, (down + 10) * 1000, rng);
    expect(report.knockouts).toBe(1);
    expect(state.bossHp).toBeNull();
    expect(state.combat.knockoutSeconds).toBeCloseTo(content.combat.knockoutSeconds - 10, 3);
    expect(loadoutHealth(state, content).current.toNumber()).toBe(0);
  });

  it('starts again with full health once the knockout is over', () => {
    const start = inCellar();
    const down = secondsToDown(start);
    const ko = content.combat.knockoutSeconds;
    // The knockout ends on a hit's beat; the next hit (a light one, 0.4 of an attack) lands a
    // whole interval later, on the rebuilt pool.
    const { state } = advance(start, content, (down + ko + 5) * 1000, rng);
    expect(state.combat.knockoutSeconds).toBe(0);
    const h = loadoutHealth(state, content);
    expect(h.current.eq(h.max)).toBe(true);
    const later = advance(start, content, (down + ko + 15) * 1000, rng).state;
    const hl = loadoutHealth(later, content);
    expect(hl.max.sub(hl.current).toNumber()).toBeCloseTo(hl.incoming.toNumber() * 10 * 0.4, 6);
  });

  it('gives the same result however the time is split (online and offline match)', () => {
    const start = inCellar();
    const total = (secondsToDown(start) * 2.5 + 77) * 1000;
    const once = advance(start, content, total, rng);
    let s = start;
    let knockouts = 0;
    for (let i = 0; i < 25; i++) {
      const r = advance(s, content, total / 25, rng);
      s = r.state;
      knockouts += r.report.knockouts;
    }
    expect(knockouts).toBe(once.report.knockouts);
    expect(s.combat.knockoutSeconds).toBeCloseTo(once.state.combat.knockoutSeconds, 2);
  });

  it('special dungeon targets do not attack', () => {
    const s = freshState();
    s.clearedDungeons.push('mossy_cellar', 'ember_crypt');
    const trial = ok(setActiveDungeon(s, content, 'glimmer_trial'));
    const { state, report } = advance(trial, content, 3_600_000, rng);
    expect(report.knockouts).toBe(0);
    expect(state.combat.loadoutDamage.toNumber()).toBe(0);
  });

  it('saves and loads damage taken and knockout time (save v7)', () => {
    const start = inCellar();
    const { state } = advance(start, content, (secondsToDown(start) + 3) * 1000, rng);
    const loaded = readSave(createSaveText(state, 1), content).state;
    expect(loaded.combat.knockoutSeconds).toBeCloseTo(state.combat.knockoutSeconds, 6);
    expect(loaded.combat.loadoutDamage.eq(state.combat.loadoutDamage)).toBe(true);
  });

  it('migrates v6 saves to full health and no knockout', () => {
    expect(MIGRATIONS[6]!({ combat: { kills: { a: 1 } } })).toEqual({
      combat: { kills: { a: 1 }, loadoutDamage: '0', knockoutSeconds: 0 },
    });
  });
});
