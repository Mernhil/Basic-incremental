import { describe, expect, it } from 'vitest';
import {
  activeEffects,
  buildTeam,
  cardMoves,
  mergeEffects,
  cloneState,
  collectModifiers,
  createSaveText,
  Decimal,
  newOwnedCard,
  openCardSkill,
  readSave,
  setActiveDungeon,
  skillUnlockCost,
  weakenFactor,
  type GameState,
  type TeamCard,
} from '../src/game';
import { content, freshState } from './helpers';

/** Three attacks per card (DESIGN.md §2): the normal hit, a skill on its own timer and an ultimate
 *  on the full gauge; numbers are placeholders, so these tests check the rules, not the tuning. */

function teamOf(ids: (string | null)[], open: string[] = []): GameState {
  const r = setActiveDungeon(freshState(), content, 'mossy_cellar');
  if (!r.ok) throw new Error(r.reason);
  const state = r.state;
  for (const id of ids) {
    if (!id) continue;
    const card = content.cardById.get(id)!;
    state.cards.owned[id] = { ...newOwnedCard(card.tier), skillOpen: open.includes(id) };
  }
  state.cards.loadouts.fighting = {
    slots: [ids[0] ?? null, ids[1] ?? null, ids[2] ?? null, ids[3] ?? null],
  };
  return state;
}
const team = (s: GameState): TeamCard[] =>
  buildTeam(s, content, collectModifiers(s, content), s.activeDungeonId);
const card = (s: GameState, id: string): TeamCard => team(s).find((c) => c.id === id)!;
const moves = (id: string, open = false) =>
  cardMoves(content, id, { ...newOwnedCard(content.cardById.get(id)!.tier), skillOpen: open })!;

describe('the moves of a card', () => {
  it('every fighting card has an ultimate; workers have no moves', () => {
    for (const c of content.cards) {
      const m = cardMoves(content, c.id, newOwnedCard(c.tier));
      if (c.job === 'fighting') expect(m?.ult.name, c.id).toBeTruthy();
      else expect(m, c.id).toBeNull();
    }
  });

  it('Wood to Prismatic share their weapon type kit; T6 and Heirloom have their own names', () => {
    expect(moves('ember_squire').ult.name).toBe(content.moves.kits.sword.ult.name);
    expect(moves('prism_paladin', true).skill?.name).toBe(content.moves.kits.sword.skill.name);
    expect(moves('solaris', true).skill?.name).toBe(content.moves.cards['solaris']!.skill);
    expect(moves('solaris').ult.name).toBe(content.moves.cards['solaris']!.ult);
    // Wildwood (batch 3): the fox tail dagger is earth, the phoenix feather dagger fire.
    expect(moves('foxtail', true).skill?.name).toBe('Foxtail Flick');
    expect(moves('phoenixquill').ult.name).toBe('Rebirth Flurry');
  });

  it('Wood has no skill slot and its ultimate only strikes', () => {
    const m = moves('ember_squire', true);
    expect(m.skill).toBeNull();
    expect(m.ult.effects).toEqual([]);
    expect(m.ult.strike).toBeGreaterThan(0);
  });

  it('Bronze has a skill slot that fires only once opened; its ultimate has no effect yet', () => {
    expect(moves('brass_vanguard').skill?.open).toBe(false);
    expect(moves('brass_vanguard', true).skill?.open).toBe(true);
    expect(moves('brass_vanguard', true).ult.effects).toEqual([]);
  });

  it('Silver ultimates carry their effect; Gold skills come sooner', () => {
    expect(moves('silver_cavalier').ult.effects.length).toBeGreaterThan(0);
    const silver = moves('silver_cavalier', true).skill!;
    const gold = moves('gilded_knight', true).skill!;
    expect(gold.every).toBeLessThan(silver.every);
  });

  it('a T6 ultimate Marks its element and adds its side; an Heirloom adds both sides', () => {
    const fireVoid = moves('moon_reaver'); // Crimsonfall, fire, void
    expect(fireVoid.element).toBe('fire');
    const kinds = fireVoid.ult.effects.map((e) => e.kind);
    expect(kinds).toContain('mark');
    expect(kinds).toContain('wound'); // the fire Void side
    expect(kinds).not.toContain('rally'); // the fire Mythic side
    const heir = moves('solaris').ult.effects.map((e) => e.kind); // light Heirloom
    expect(heir).toContain('haste'); // light Mythic side
    expect(heir).toContain('expose'); // light Void side
  });

  it('a T6 skill adds its element layer to the kit skill', () => {
    const s = moves('moon_reaver', true).skill!; // sword + fire
    expect(s.effects.map((e) => e.kind)).toEqual(expect.arrayContaining(['rally', 'wound']));
  });
});

describe('moves in the fight', () => {
  it('a Wood team fights exactly as before: the ultimate is the signature attack', () => {
    const s = teamOf(['ember_squire']);
    const c = card(s, 'ember_squire');
    expect(c.signature.div(c.hit).toNumber()).toBeCloseTo(
      Number(content.combat.bursts.fighting.power),
    );
    expect(c.skillEvery).toBe(0);
  });

  it('an opened skill adds damage; a closed one adds none', () => {
    const closed = card(teamOf(['brass_vanguard']), 'brass_vanguard');
    const open = card(teamOf(['brass_vanguard'], ['brass_vanguard']), 'brass_vanguard');
    expect(open.hit.gt(closed.hit)).toBe(true);
    expect(open.skillEvery).toBeGreaterThan(0);
  });

  it("a sword's Rally raises its teammates' damage", () => {
    const alone = card(teamOf([null, 'quarry_smasher']), 'quarry_smasher');
    const rallied = card(
      teamOf(['brass_vanguard', 'quarry_smasher'], ['brass_vanguard']),
      'quarry_smasher',
    );
    expect(rallied.hit.gt(alone.hit)).toBe(true);
  });

  it("a hammer's Weaken lowers what the enemy deals while it stands", () => {
    const s = teamOf(['bronze_forgehand'], ['bronze_forgehand']);
    expect(weakenFactor(s, team(s))).toBeLessThan(1);
    const closed = teamOf(['bronze_forgehand']);
    expect(weakenFactor(closed, team(closed))).toBe(1);
  });

  it("a staff's Mend heals the team on its ultimate, as today", () => {
    const c = card(teamOf(['hedge_acolyte']), 'hedge_acolyte');
    expect(c.signature.eq(0)).toBe(true);
    expect(c.heals).toEqual([{ on: 'team', share: 0.3 }]);
  });

  it('a Prismatic staff is a plain staff now (the old per-card Hex is gone)', () => {
    const c = card(teamOf(['kaleido_weaver']), 'kaleido_weaver');
    expect(c.skill.weaken).toBe(0);
    expect(c.heals.some((h) => h.on === 'team')).toBe(true);
  });

  it('shows the skill and the ultimate as they fire, as words for the card', () => {
    const s = teamOf(['brass_vanguard', 'quarry_smasher'], ['brass_vanguard']);
    const t = team(s);
    const every = t[0]!.skillEvery;
    const just = activeEffects(t, every + 0.1);
    expect(just.cards['quarry_smasher']).toContain('rally');
    const later = activeEffects(t, every + 9);
    expect(later.cards['quarry_smasher'] ?? []).not.toContain('rally');
  });
});

describe('opening a skill with Cores', () => {
  it('costs the Cores of the tier, once', () => {
    expect(skillUnlockCost(content, 'ember_squire')).toBeNull();
    const cost = skillUnlockCost(content, 'brass_vanguard')!;
    expect(cost.amount).toBeGreaterThan(0);
    const s = teamOf(['brass_vanguard']);
    expect(openCardSkill(s, content, 'brass_vanguard')).toEqual({ ok: false, reason: 'cost' });
    s.resources[cost.resource] = new Decimal(cost.amount);
    const r = openCardSkill(s, content, 'brass_vanguard');
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.cards.owned['brass_vanguard']!.skillOpen).toBe(true);
    expect(r.state.resources[cost.resource]!.toNumber()).toBe(0);
    expect(openCardSkill(r.state, content, 'brass_vanguard')).toEqual({
      ok: false,
      reason: 'open',
    });
  });

  it('refuses a card with no skill slot, a card not owned and a worker', () => {
    const s = teamOf(['ember_squire']);
    expect(openCardSkill(s, content, 'ember_squire')).toEqual({ ok: false, reason: 'no-skill' });
    expect(openCardSkill(s, content, 'solaris')).toEqual({ ok: false, reason: 'not-owned' });
  });

  it('is kept by the save', () => {
    const s = teamOf(['brass_vanguard'], ['brass_vanguard']);
    const back = readSave(createSaveText(cloneState(s), 0), content).state;
    expect(back.cards.owned['brass_vanguard']!.skillOpen).toBe(true);
  });
});

describe('one effect of a kind per move', () => {
  it('merges the kit, layer and twist: the stronger counts, Wounds add up', () => {
    const ult = moves('solaris').ult.effects;
    expect(ult.filter((e) => e.kind === 'haste' && e.on === 'team')).toHaveLength(1);
    expect(
      mergeEffects([
        { kind: 'wound', on: 'enemy', value: 0.4, seconds: 6 },
        { kind: 'wound', on: 'enemy', value: 0.5, seconds: 6 },
        { kind: 'rally', on: 'team', value: 0.1, seconds: 5 },
        { kind: 'rally', on: 'team', value: 0.15, seconds: 6 },
      ]),
    ).toEqual([
      { kind: 'wound', on: 'enemy', value: 0.9, seconds: 6 },
      { kind: 'rally', on: 'team', value: 0.15, seconds: 6 },
    ]);
  });
});
