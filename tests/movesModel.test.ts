import { describe, expect, it } from 'vitest';
import { Decimal, newOwnedCard, type GameState } from '../src/game';
import { effectText, movesView } from '../src/renderer/src/pages/movesModel';
import { content, freshState } from './helpers';

/** A card's three attacks on the card screens (DESIGN.md §2 Three attacks per card). */
function owning(id: string, open = false): GameState {
  const s = freshState();
  s.cards.owned[id] = { ...newOwnedCard(content.cardById.get(id)!.tier), skillOpen: open };
  return s;
}

describe('movesView', () => {
  it('a Wood card: its hit and ultimate with numbers, and no skill slot', () => {
    const v = movesView(owning('ember_squire'), content, 'ember_squire')!;
    expect(v.rows.map((r) => r.kind)).toEqual(['hit', 'skill', 'ult']);
    expect(v.rows[0]!.text).toMatch(/damage every/);
    expect(v.rows[1]!.note).toMatch(/No skill at this tier/);
    expect(v.rows[2]!.name).toBe(content.moves.kits.sword.ult.name);
    expect(v.rows[2]!.text).toMatch(/Every \d+ hits/);
    expect(v.unlock).toBeNull();
  });

  it('a closed Bronze skill shows its Cores, affordable only with enough of them', () => {
    const s = owning('brass_vanguard');
    const v = movesView(s, content, 'brass_vanguard')!;
    expect(v.rows[1]!.note).toMatch(/Not opened yet/);
    expect(v.unlock?.cost[0]?.resource).toBe(content.moves.unlock.bronze!.resource);
    expect(v.unlock?.affordable).toBe(false);
    s.resources[content.moves.unlock.bronze!.resource] = new Decimal(99);
    expect(movesView(s, content, 'brass_vanguard')!.unlock?.affordable).toBe(true);
  });

  it('an open skill has no unlock and no note', () => {
    const v = movesView(owning('brass_vanguard', true), content, 'brass_vanguard')!;
    expect(v.unlock).toBeNull();
    expect(v.rows[1]!.note).toBeNull();
    expect(v.rows[1]!.effects[0]).toMatch(/^Rally/);
  });

  it('a T6 card names its own moves and its Mark', () => {
    const v = movesView(owning('moon_reaver', true), content, 'moon_reaver')!;
    expect(v.rows[1]!.name).toBe(content.moves.cards['moon_reaver']!.skill);
    expect(v.rows[2]!.effects.some((e) => e.startsWith('Mark: fire'))).toBe(true);
  });

  it('a card not owned shows its moves without numbers; a worker has none', () => {
    const v = movesView(freshState(), content, 'solaris')!;
    expect(v.rows[2]!.name).toBe(content.moves.cards['solaris']!.ult);
    expect(v.unlock).toBeNull();
    expect(movesView(freshState(), content, 'apprentice_feller')).toBeNull();
  });

  it('words every effect', () => {
    expect(effectText({ kind: 'stagger', on: 'enemy', value: 3 }, null)).toMatch(/3 s later/);
    expect(effectText({ kind: 'rally', on: 'team', value: 0.1, seconds: 0 }, null)).toMatch(
      /whole fight/,
    );
    expect(effectText({ kind: 'focus', on: 'self', value: 1, seconds: 1 }, null)).toMatch(
      /always crits/,
    );
  });
});
