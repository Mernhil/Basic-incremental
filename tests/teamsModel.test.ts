import { describe, expect, it } from 'vitest';
import { teamRows } from '../src/renderer/src/views/collection/teamsModel';
import { content, freshState } from './helpers';

describe('remembered teams per dungeon', () => {
  it('lists the fighting loadout under the dungeon being fought', () => {
    const state = freshState();
    const [first] = content.dungeons;
    state.activeDungeonId = first!.id;
    const rows = teamRows(state, content);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ dungeonId: first!.id, active: true });
  });

  it('adds a row for each dungeon with a remembered team, in dungeon order, and flags the cap', () => {
    const state = freshState();
    const [a, b] = content.dungeons;
    state.activeDungeonId = a!.id;
    const card = content.cards.find((c) => c.job === 'fighting')!;
    state.cards.owned[card.id] = state.cards.owned[card.id] ?? {
      ...Object.values(state.cards.owned)[0]!,
    };
    state.presets.dungeons[b!.id] = { main: card.id, supports: [null, null, null] };
    const rows = teamRows(state, content);
    expect(rows.map((r) => r.dungeonId)).toEqual([a!.id, b!.id]);
    expect(rows[1]).toMatchObject({ active: false, cards: [card.name] });
    expect(rows[1]!.overCap).toBe(rows[1]!.cost > rows[1]!.cap);
  });

  it('skips a dungeon whose remembered team is empty', () => {
    const state = freshState();
    const [a, b] = content.dungeons;
    state.activeDungeonId = a!.id;
    state.presets.dungeons[b!.id] = { main: null, supports: [null, null, null] };
    expect(teamRows(state, content).map((r) => r.dungeonId)).toEqual([a!.id]);
  });
});
