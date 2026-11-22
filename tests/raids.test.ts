import { describe, expect, it } from 'vitest';
import {
  Decimal,
  buildTeam,
  collectModifiers,
  elementRelation,
  fightRaid,
  newOwnedCard,
  raidLadder,
  raidRank,
  raidsOpen,
  raidTriesLeft,
  bossTrick,
  teamEffectShare,
  tryRaid,
  type GameState,
} from '../src/game';
import type { Content } from '../src/data';
import { content, freshState } from './helpers';

/** Raid bosses (DESIGN.md §2 Raid bosses): the rules, not the tuning. */

function teamOf(ids: string[], open = true): GameState {
  const state = freshState();
  state.prestigeCount = 1;
  for (const id of ids) {
    state.cards.owned[id] = {
      ...newOwnedCard(content.cardById.get(id)!.tier),
      skillOpen: open,
    };
  }
  state.cards.loadouts.fighting = {
    slots: [ids[0] ?? null, ids[1] ?? null, ids[2] ?? null, ids[3] ?? null],
  };
  return state;
}
const mods = (s: GameState) => collectModifiers(s, content);
const boss = (id: string) => content.raidById.get(id)!;
const SWORDS = ['prism_paladin', 'gilded_knight', 'mirror_cavalier', 'rainbow_sniper'];
const TODAY = '2026-12-01';

/** The content with one boss changed. */
function withBoss(
  id: string,
  change: (b: ReturnType<typeof boss>) => ReturnType<typeof boss>,
): Content {
  return { ...content, raidById: new Map([[id, change(boss(id))]]) };
}

/** A soft Tide Queen (no trick to speak of) the test team can score against. */
const soft = (hp = 1e6): Content =>
  withBoss('tide_queen', (b) => ({
    ...b,
    hp: new Decimal(hp),
    attack: { ...b.attack, damage: new Decimal(1) },
    trick: { ...b.trick, kind: 'rage', size: 0.0001, every: 0, answerAt: 0 },
  }));

describe('the raid data', () => {
  it('has the five bosses, one for each element, each with its trick', () => {
    expect(content.raids.bosses.map((b) => b.element).sort()).toEqual([
      'dark',
      'earth',
      'fire',
      'light',
      'water',
    ]);
    expect(new Set(content.raids.bosses.map((b) => b.trick.kind)).size).toBe(5);
    expect(content.raids.triesPerDay).toBe(3);
  });

  it('every boss is weak to the element that beats it', () => {
    expect(elementRelation(content, 'tide_queen', 'earth')).toBe('weak');
    expect(elementRelation(content, 'ember_tyrant', 'water')).toBe('weak');
    expect(elementRelation(content, 'rootstone_titan', 'fire')).toBe('weak');
    expect(elementRelation(content, 'dread_dragon_lich', 'light')).toBe('weak');
    expect(elementRelation(content, 'dawn_seraph', 'dark')).toBe('weak');
  });

  it('ladder teams are real fighting cards and every boss has a score for each', () => {
    for (const t of content.raids.ladder.teams) {
      for (const id of t.cards) expect(content.cardById.get(id)?.job).toBe('fighting');
      for (const b of content.raids.bosses) expect(t.scores[b.id]).toBeGreaterThan(0);
    }
  });
});

describe('opening and tries', () => {
  it('raids open after the first Ascension', () => {
    const s = freshState();
    expect(raidsOpen(s, content)).toBe(false);
    s.prestigeCount = 1;
    expect(raidsOpen(s, content)).toBe(true);
    const locked = freshState();
    expect(tryRaid(locked, content, mods(locked), 'tide_queen', TODAY)).toEqual({
      ok: false,
      reason: 'locked',
    });
  });

  it('three tries a day per boss, all back on a new day', () => {
    let s = teamOf(SWORDS);
    for (let i = 0; i < 3; i++) {
      const r = tryRaid(s, content, mods(s), 'tide_queen', TODAY);
      expect(r.ok).toBe(true);
      if (r.ok) s = r.state;
    }
    expect(raidTriesLeft(s, content, 'tide_queen', TODAY)).toBe(0);
    expect(raidTriesLeft(s, content, 'ember_tyrant', TODAY)).toBe(3);
    expect(tryRaid(s, content, mods(s), 'tide_queen', TODAY)).toEqual({
      ok: false,
      reason: 'no-tries',
    });
    // The next day, also after being away for days.
    expect(raidTriesLeft(s, content, 'tide_queen', '2026-12-04')).toBe(3);
    expect(tryRaid(s, content, mods(s), 'tide_queen', '2026-12-04').ok).toBe(true);
  });

  it('needs a team', () => {
    const s = freshState();
    s.prestigeCount = 1;
    s.cards.loadouts.fighting = { slots: [null, null, null, null] };
    expect(tryRaid(s, content, mods(s), 'tide_queen', TODAY)).toEqual({
      ok: false,
      reason: 'no-team',
    });
  });
});

describe('the fight', () => {
  it('is deterministic and scored by the damage dealt', () => {
    const s = teamOf(SWORDS);
    const a = fightRaid(s, content, mods(s), 'tide_queen')!;
    const b = fightRaid(s, content, mods(s), 'tide_queen')!;
    expect(a.share).toBe(b.share);
    expect(a.score.eq(a.hp.mul(a.share))).toBe(true);
    expect(a.seconds).toBeLessThanOrEqual(content.raids.durationSeconds);
    expect(a.samples.length).toBeGreaterThan(1);
  });

  it('a kill ends the fight early and scores above 1', () => {
    const s = teamOf(SWORDS);
    const easy = withBoss('tide_queen', (b) => ({ ...b, hp: new Decimal(1000) }));
    const f = fightRaid(s, easy, mods(s), 'tide_queen')!;
    expect(f.killed).toBe(true);
    expect(f.share).toBeGreaterThan(1);
    expect(f.seconds).toBeLessThan(content.raids.durationSeconds);
  });

  it('a tougher boss takes less off the same team', () => {
    const s = teamOf(SWORDS);
    const weak = fightRaid(s, soft(1e6), mods(s), 'tide_queen')!.share;
    expect(fightRaid(s, soft(1e12), mods(s), 'tide_queen')!.share).toBeLessThan(weak);
  });
});

describe('the tricks ask for their answer', () => {
  it('Expose takes Stoneskin away; a team without it keeps all of it', () => {
    const none = teamOf(SWORDS);
    const withExpose = teamOf(['sunbreaker_titan', 'valor_pikeman', ...SWORDS.slice(0, 2)]);
    const t0 = buildTeam(none, content, mods(none), 'rootstone_titan');
    const t1 = buildTeam(withExpose, content, mods(withExpose), 'rootstone_titan');
    expect(teamEffectShare(t0, 'expose')).toBe(0);
    expect(teamEffectShare(t1, 'expose')).toBeGreaterThan(0);
    expect(bossTrick(boss('rootstone_titan'), t0).left).toBe(1);
    expect(bossTrick(boss('rootstone_titan'), t1).left).toBeLessThan(1);
  });

  it('Wound stops the Tide Queen mending and Rally lifts the Lich curse', () => {
    const daggers = teamOf(['silver_minnow', 'reef_assassin', 'frost_viper', 'bloodletter']);
    const td = buildTeam(daggers, content, mods(daggers), 'tide_queen');
    expect(teamEffectShare(td, 'wound')).toBeGreaterThan(0);
    expect(bossTrick(boss('tide_queen'), td).left).toBeLessThan(1);
    const swords = teamOf(['dawn_champion', 'emberthorn', 'runemoss', 'pearl_duelist']);
    const ts = buildTeam(swords, content, mods(swords), 'dread_dragon_lich');
    expect(teamEffectShare(ts, 'rally')).toBeGreaterThan(0);
    expect(bossTrick(boss('dread_dragon_lich'), ts).left).toBeLessThan(1);
    const t0 = buildTeam(daggers, content, mods(daggers), 'dread_dragon_lich');
    expect(bossTrick(boss('dread_dragon_lich'), t0).left).toBe(1);
  });

  it('the Ember Tyrant hits harder the longer the fight goes', () => {
    const s = teamOf(SWORDS);
    const tough = (size: number) =>
      withBoss('ember_tyrant', (b) => ({
        ...b,
        hp: b.hp.mul(1e6),
        trick: { ...b.trick, size },
      }));
    const raged = fightRaid(s, tough(1.5), mods(s), 'ember_tyrant')!;
    const calm = fightRaid(s, tough(0.0001), mods(s), 'ember_tyrant')!;
    expect(raged.seconds).toBeLessThanOrEqual(calm.seconds);
    expect(raged.out.length).toBeGreaterThanOrEqual(calm.out.length);
  });
});

describe('the ladder and rewards', () => {
  it('puts the player among the AI teams, best first, a tie to the AI', () => {
    const rows = raidLadder(content, 'tide_queen', 0.5);
    expect(rows).toHaveLength(content.raids.ladder.teams.length + 1);
    expect(rows.map((r) => r.rank)).toEqual(rows.map((_, i) => i + 1));
    for (let i = 1; i < rows.length; i++)
      expect(rows[i - 1]!.share).toBeGreaterThanOrEqual(rows[i]!.share);
    expect(raidRank(content, 'tide_queen', null)).toBeNull();
    expect(raidRank(content, 'tide_queen', 1e9)).toBe(1);
    expect(raidRank(content, 'tide_queen', 1e-9)).toBe(content.raids.ladder.teams.length + 1);
  });

  it('pays each rank reward once per boss, and keeps the best score', () => {
    let s = teamOf(SWORDS);
    const first = tryRaid(s, soft(1e12), mods(s), 'tide_queen', TODAY);
    if (!first.ok) throw new Error(first.reason);
    s = first.state;
    expect(s.raids.best['tide_queen']).toBe(first.result.fight.share);
    expect(s.raids.paid['tide_queen']).toBe(first.result.rank);
    const second = tryRaid(s, soft(1e12), mods(s), 'tide_queen', TODAY);
    if (!second.ok) throw new Error(second.reason);
    // The same team gets the same score: no new best and nothing paid again.
    expect(second.result.newBest).toBe(false);
    expect(second.result.rewards).toEqual([]);
    expect(second.state.raids.best['tide_queen']).toBe(first.result.fight.share);
  });

  it('pays the ranks a better score reaches, once', () => {
    let s = teamOf(SWORDS);
    s.raids.paid['tide_queen'] = 10;
    s.raids.best['tide_queen'] = 1e-9;
    const strong = withBoss('tide_queen', (b) => ({ ...b, hp: new Decimal(1000) }));
    const r = tryRaid(s, strong, mods(s), 'tide_queen', TODAY);
    if (!r.ok) throw new Error(r.reason);
    expect(r.result.rank).toBe(1);
    expect(r.result.rewards.length).toBeGreaterThan(0);
    s = r.state;
    expect(s.raids.paid['tide_queen']).toBe(1);
    const again = tryRaid(s, strong, mods(s), 'tide_queen', TODAY);
    if (!again.ok) throw new Error(again.reason);
    expect(again.result.rewards).toEqual([]);
  });
});
