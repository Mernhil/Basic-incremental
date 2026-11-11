import { describe, expect, it } from 'vitest';
import {
  advance,
  averageDps,
  buildTeam,
  cardHealth,
  cardSkill,
  collectModifiers,
  Decimal,
  duelEnemy,
  duelFightKey,
  duelSheet,
  emptyDuelLog,
  emptyReport,
  fightStage,
  loadoutHealth,
  newOwnedCard,
  recordDuel,
  setActiveDungeon,
  startFloorChallenge,
  teamAverageDps,
  teamView,
  type CombatResult,
  type GameState,
  type TeamCard,
} from '../src/game';
import {
  constantRng,
  content as bundled,
  freshState,
  withAutoChallenge,
  withBossAttack,
  withBossHp,
} from './helpers';

/** The card duel's rules (DESIGN.md §6 "The fight is a first-person card duel"). */

const rng = constantRng(0.99);
const ok = (r: CombatResult): GameState => {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};
/** The Mossy Cellar out of reach (no kill refills the health while a test counts hits). */
const walled = withBossHp(bundled, 'mossy_cellar', 1e15);
/** The same, hitting softly: no card falls within a minute. */
const gentle = withBossAttack(walled, 'mossy_cellar', 4, 3);

/** A game in the Mossy Cellar whose fighting loadout is these cards, fresh, in this order. */
function teamOf(ids: (string | null)[], content = bundled): GameState {
  const state = ok(setActiveDungeon(freshState(), content, 'mossy_cellar'));
  for (const id of ids) if (id) state.cards.owned[id] ??= newOwnedCard();
  state.cards.loadouts.fighting = {
    main: ids[0] ?? null,
    supports: [ids[1] ?? null, ids[2] ?? null, ids[3] ?? null],
  };
  return state;
}
const team = (s: GameState, content = bundled): TeamCard[] =>
  buildTeam(s, content, collectModifiers(s, content), s.activeDungeonId);
const taken = (s: GameState, id: string): number => s.combat.cardDamage[id]?.toNumber() ?? 0;
const hitters = (r: ReturnType<typeof advance>['report']): Set<string> =>
  new Set(r.playerHits.map((h) => h.cardId));

const FOUR = ['ember_squire', 'militia_picket', 'fieldhand_archer', 'field_reaper'];

describe('the team', () => {
  it('is the fighting loadout in order, owned cards only, each fighting on its own', () => {
    const state = teamOf([...FOUR]);
    const cards = team(state);
    expect(cards.map((c) => c.id)).toEqual(FOUR);
    // Each card hits at its own weapon's interval (DESIGN.md §5 Weapon identity table).
    expect(cards.map((c) => c.interval)).toEqual([1, 0.8, 1.2, 1]);
    // The team's damage is every card's own.
    expect(averageDps(state, bundled).eq(teamAverageDps(cards))).toBe(true);
    // An empty slot or a card not owned is skipped.
    const gaps = teamOf(['ember_squire', null, 'field_reaper']);
    delete gaps.cards.owned['field_reaper'];
    expect(team(gaps).map((c) => c.id)).toEqual(['ember_squire']);
  });

  it('hits harder with more cards: each card adds its own damage', () => {
    const one = averageDps(teamOf(['ember_squire']), bundled);
    const four = averageDps(teamOf([...FOUR]), bundled);
    expect(four.div(one).toNumber()).toBeGreaterThan(3);
  });

  it('gives each card its own health, summing to the team health', () => {
    const state = teamOf([...FOUR]);
    const health = loadoutHealth(state, bundled);
    const own = FOUR.map((id) => cardHealth(bundled, id, state.cards.owned[id]!));
    expect(team(state).map((c) => c.maxHealth.toNumber())).toEqual(own.map((h) => h.toNumber()));
    expect(health.max.toNumber()).toBeCloseTo(
      own.reduce((a, b) => a + b.toNumber(), 0),
      6,
    );
  });

  it('every card in hand lands its own hits', () => {
    const { report } = advance(teamOf([...FOUR], walled), walled, 5_000, rng);
    expect(hitters(report)).toEqual(new Set(FOUR));
  });

  it('with no card in the loadout fights bare-handed and takes no hits', () => {
    const state = teamOf([null], walled);
    const { state: after, report } = advance(state, walled, 60_000, rng);
    expect(report.playerHits.length).toBeGreaterThan(0);
    expect(report.knockouts).toBe(0);
    expect(after.combat.cardDamage).toEqual({});
  });
});

describe('who the enemy hits', () => {
  it('hits the first standing card from the left', () => {
    const { state } = advance(teamOf([...FOUR], gentle), gentle, 30_000, rng);
    expect(taken(state, 'ember_squire')).toBeGreaterThan(0);
    for (const id of FOUR.slice(1)) expect(taken(state, id)).toBe(0);
  });

  it('hits a standing guard first: hammers and lances lean to tanks', () => {
    expect(cardSkill(bundled, 'quarry_smasher').guard).toBe(true);
    expect(cardSkill(bundled, 'stable_squire').guard).toBe(true);
    const ids = ['ember_squire', 'militia_picket', 'quarry_smasher', 'field_reaper'];
    const { state, report } = advance(teamOf(ids, gentle), gentle, 30_000, rng);
    expect(taken(state, 'quarry_smasher')).toBeGreaterThan(0);
    expect(taken(state, 'ember_squire')).toBe(0);
    expect(report.bossAttacks.every((e) => e.cardId === 'quarry_smasher')).toBe(true);
  });

  it('knocks a card out on the attack that empties its health; the others fight on', () => {
    const state = teamOf([...FOUR], walled);
    const lead = team(state, walled)[0]!;
    state.combat.cardDamage = { ember_squire: lead.maxHealth.sub(1e-6) };
    const { state: after, report } = advance(state, walled, 7_000, rng);
    expect(report.cardKnockouts).toEqual(['ember_squire']);
    expect(report.knockouts).toBe(0);
    // The next card takes the hits from then on.
    expect(taken(after, 'militia_picket')).toBeGreaterThan(0);
    const view = teamView(after, walled);
    expect(view[0]!.knockedOut).toBe(true);
    expect(view[0]!.health.toNumber()).toBe(0);
    expect(view[1]!.targeted).toBe(true);
    // A knocked-out card stops attacking until the floor is won.
    const later = advance(after, walled, 3_000, rng);
    expect(hitters(later.report).has('ember_squire')).toBe(false);
    expect(hitters(later.report).has('militia_picket')).toBe(true);
  });

  it('brings every card back at full health when the floor is cleared', () => {
    const state = teamOf([...FOUR]);
    const lead = team(state)[0]!;
    state.combat.cardDamage = { ember_squire: lead.maxHealth };
    const { state: after, report } = advance(state, bundled, 30_000, rng);
    expect(report.floorsCleared).toBeGreaterThan(0);
    expect(teamView(after, bundled)[0]!.knockedOut).toBe(false);
  });

  it('loses the fight when every card is out: a knockout while farming', () => {
    const state = teamOf(['ember_squire', 'militia_picket'], walled);
    const [a, b] = team(state, walled);
    state.combat.cardDamage = {
      ember_squire: a!.maxHealth,
      militia_picket: b!.maxHealth.sub(1e-6),
    };
    const { state: after, report } = advance(state, walled, 4_000, rng);
    expect(report.knockouts).toBe(1);
    expect(after.combat.knockoutSeconds).toBeGreaterThan(0);
    expect(report.bossAttacks.some((e) => e.knockout)).toBe(true);
    expect(teamView(after, walled).every((c) => c.knockedOut)).toBe(true);
  });

  it('loses a Challenge when every card is out', () => {
    const state = ok(startFloorChallenge(teamOf(['ember_squire'], walled), walled));
    const lead = team(state, walled)[0]!;
    state.combat.cardDamage = { ember_squire: lead.maxHealth.sub(1e-6) };
    const { report } = advance(state, walled, 20_000, rng);
    expect(report.challenges[0]).toMatchObject({ won: false, reason: 'health' });
    expect(report.knockouts).toBe(0);
  });
});

describe('roles by weapon type (skills.json)', () => {
  it('staffs lean to healers; a unique may break the leaning', () => {
    expect(cardSkill(bundled, 'hedge_acolyte').signature.kind).toBe('heal');
    expect(cardSkill(bundled, 'silver_mage').role).toBe('glass_cannon');
    expect(cardSkill(bundled, 'hex_warlock').role).toBe('debuffer');
    // Seraph Lancer carries a lance but heals.
    expect(cardSkill(bundled, 'seraph_lancer').signature.kind).toBe('heal');
    expect(cardSkill(bundled, 'quarry_smasher').role).toBe('tank');
    // Every fighting card has a skill.
    for (const card of bundled.cards.filter((c) => c.job === 'fighting')) {
      expect(cardSkill(bundled, card.id)).toBeTruthy();
    }
  });

  it('a healer heals every standing card instead of striking', () => {
    const state = teamOf(['ember_squire', 'hedge_acolyte'], gentle);
    const [lead, healer] = team(state, gentle);
    expect(healer!.heal).toBeGreaterThan(0);
    expect(healer!.signature.toNumber()).toBe(0);
    state.combat.cardDamage = { ember_squire: lead!.maxHealth.mul(0.5) };
    const { state: after, report } = advance(state, gentle, 30_000, rng);
    expect(report.skills.some((s) => s.cardId === 'hedge_acolyte' && s.kind === 'heal')).toBe(true);
    expect(report.playerHits.some((h) => h.cardId === 'hedge_acolyte' && h.signature)).toBe(false);
    // Without the healer the same 30 s leave the lead lower.
    const alone = teamOf(['ember_squire', 'militia_picket'], gentle);
    alone.combat.cardDamage = { ember_squire: lead!.maxHealth.mul(0.5) };
    const without = advance(alone, gentle, 30_000, rng).state;
    expect(taken(after, 'ember_squire')).toBeLessThan(taken(without, 'ember_squire'));
  });

  it('a debuffer weakens the enemy while it stands', () => {
    const plain = loadoutHealth(teamOf(['ember_squire']), bundled).incoming;
    const hexed = loadoutHealth(teamOf(['ember_squire', 'hex_warlock']), bundled).incoming;
    expect(hexed.div(plain).toNumber()).toBeCloseTo(0.8, 9);
  });

  it('a glass cannon hits harder on half the health', () => {
    const state = teamOf(['silver_mage']);
    const mage = team(state)[0]!;
    expect(mage.maxHealth.toNumber()).toBeCloseTo(
      cardHealth(bundled, 'silver_mage', state.cards.owned['silver_mage']!).toNumber() * 0.5,
      6,
    );
  });
});

describe('any split of time gives the same fight', () => {
  const ids = ['ember_squire', 'quarry_smasher', 'hedge_acolyte', 'hex_warlock'];
  const snapshot = (s: GameState) => ({
    damage: Object.fromEntries(
      Object.entries(s.combat.cardDamage).map(([k, v]) => [k, v.toNumber()]),
    ),
    enemy: s.combat.enemyIndex,
    hp: s.bossHp?.toNumber() ?? null,
    money: s.resources['money']!.toNumber(),
    knockout: s.combat.knockoutSeconds,
    floor: s.combat.floors['mossy_cellar']?.tiers['normal']?.best ?? 0,
  });
  const same = (a: ReturnType<typeof snapshot>, b: ReturnType<typeof snapshot>) => {
    expect(Object.keys(a.damage).sort()).toEqual(Object.keys(b.damage).sort());
    for (const k of Object.keys(a.damage)) expect(a.damage[k]).toBeCloseTo(b.damage[k]!, 3);
    expect(a.enemy).toBe(b.enemy);
    if (a.hp === null) expect(b.hp).toBeNull();
    else expect(a.hp / b.hp!).toBeCloseTo(1, 6);
    expect(a.money / b.money).toBeCloseTo(1, 6);
    expect(a.knockout).toBeCloseTo(b.knockout, 3);
    expect(a.floor).toBe(b.floor);
  };

  for (const [label, content, auto] of [
    ['farming a floor it cannot clear (heals, knockouts)', walled, false],
    ['climbing with auto-challenge', bundled, true],
  ] as const) {
    it(label, () => {
      const start = withAutoChallenge(teamOf(ids, content), auto);
      const once = advance(start, content, 240_000, rng).state;
      let split = start;
      const steps = [1_300, 7_100, 250, 33_000, 999, 50_000, 12_345, 4_000];
      let total = 0;
      for (let i = 0; total < 240_000; i++) {
        const ms = Math.min(steps[i % steps.length]!, 240_000 - total);
        split = advance(split, content, ms, rng).state;
        total += ms;
      }
      same(snapshot(once), snapshot(split));
    });
  }
});

describe('what the duel shows (selectors for the UI)', () => {
  it('lists each card with its health, role and state', () => {
    const view = teamView(teamOf(['ember_squire', 'quarry_smasher']), bundled);
    expect(view.map((c) => c.cardId)).toEqual(['ember_squire', 'quarry_smasher']);
    expect(view[1]!.skill.role).toBe('tank');
    expect(view[1]!.targeted).toBe(true);
    expect(view.every((c) => c.fraction === 1 && !c.knockedOut)).toBe(true);
  });

  it('shows the enemy ahead and how many wait behind it, the boss last', () => {
    const state = teamOf(['ember_squire']);
    const enemy = duelEnemy(state, bundled)!;
    const stage = fightStage(state, bundled, 'mossy_cellar')!;
    expect(enemy.index).toBe(1);
    expect(enemy.waiting.length).toBe(stage.enemies.length - 1);
    expect(duelEnemy({ ...state, activeDungeonId: null }, bundled)).toBeNull();
  });

  it('logs per-card damage, the hit feed and the stat sheet of the fight', () => {
    const state = teamOf([...FOUR], walled);
    const key = duelFightKey(state, walled);
    const { report } = advance(state, walled, 10_000, rng);
    const log = recordDuel(emptyDuelLog(key), report, 10, key);
    const dealt = report.playerHits.reduce((a, h) => a.add(h.damage.mul(h.hits)), new Decimal(0));
    expect(log.total.toNumber()).toBeCloseTo(dealt.toNumber(), 6);
    expect(Object.keys(log.perCard).sort()).toEqual([...FOUR].sort());
    expect(log.feed.length).toBeGreaterThan(0);
    const sheet = duelSheet(log);
    expect(sheet.perSecond.toNumber()).toBeCloseTo(dealt.toNumber() / 10, 6);
    expect(sheet.best.gt(0)).toBe(true);
    // A cleared floor starts a new fight and keeps the last one's sheet.
    const cleared = { ...emptyReport(), floorsCleared: 1 };
    const next = recordDuel(log, cleared, 1, key);
    expect(next.total.toNumber()).toBe(0);
    expect(next.previous?.total.toNumber()).toBeCloseTo(dealt.toNumber(), 6);
  });
});
