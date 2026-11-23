import { describe, expect, it } from 'vitest';
import {
  assignSlotCard,
  campPerSecond,
  clearDungeon,
  createInitialState,
  createSaveText,
  CURRENT_SAVE_VERSION,
  newOwnedCard,
  nodeSlots,
  openSlots,
  placeSlot,
  readSave,
  slotWorkers,
  waitingSlots,
  type CampResult,
  type GameState,
} from '../src/game';
import { bareState, content } from './helpers';

const ok = (r: CampResult): GameState => {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};

/** Material nodes (DESIGN.md §2 Base camp): a slot belongs to a tree or a vein, placed when it opens. */
describe('slots on material nodes', () => {
  it('a new game has its first slot on the first node of each place', () => {
    const s = createInitialState(content);
    expect(s.camp.forest).toEqual([{ material: 'oak', card: 'apprentice_feller' }]);
    expect(s.camp.cave).toEqual([{ material: 'copper_quarry', card: 'cave_digger' }]);
    expect(waitingSlots(s, content, 'forest')).toEqual([]);
  });

  it('a level that opens a slot leaves it waiting until it is placed', () => {
    const s = bareState();
    s.camp.level = 3; // forest 2 slots, cave 1
    expect(openSlots(s, content, 'forest')).toBe(2);
    expect(waitingSlots(s, content, 'forest')).toEqual([1]);
    expect(waitingSlots(s, content, 'cave')).toEqual([]);
  });

  it('places the waiting slot on the chosen open node, and a placed slot stays there', () => {
    let s = bareState();
    s.camp.level = 3;
    s = clearDungeon(s, content, 'mossy_cellar').state;
    s = ok(placeSlot(s, content, 'forest', 'ironbark'));
    expect(s.camp.forest[1]).toEqual({ material: 'ironbark', card: null });
    expect(nodeSlots(s, content, 'forest', 'ironbark')).toEqual([1]);
    expect(nodeSlots(s, content, 'forest', 'oak')).toEqual([0]);
    expect(waitingSlots(s, content, 'forest')).toEqual([]);
  });

  it('refuses a locked node, an unknown node, and a place with no waiting slot', () => {
    const s = bareState();
    s.camp.level = 3;
    expect(placeSlot(s, content, 'forest', 'ironbark')).toEqual({
      ok: false,
      reason: 'material-locked',
    });
    expect(placeSlot(s, content, 'forest', 'iron_deeps')).toEqual({ ok: false, reason: 'unknown' });
    expect(placeSlot(s, content, 'cave', 'copper_quarry')).toEqual({
      ok: false,
      reason: 'nothing-to-place',
    });
  });

  it('several slots may go on one node', () => {
    let s = bareState();
    s.camp.level = 5;
    s = ok(placeSlot(s, content, 'forest', 'oak'));
    expect(nodeSlots(s, content, 'forest', 'oak')).toEqual([0, 1]);
  });

  it('a card cannot go on a slot that waits, and farms the node it is placed on', () => {
    let s = bareState();
    s.camp.level = 3;
    s.cards.owned['apprentice_feller'] = newOwnedCard();
    expect(assignSlotCard(s, content, 'forest', 1, 'apprentice_feller')).toEqual({
      ok: false,
      reason: 'slot-unplaced',
    });
    s = clearDungeon(s, content, 'mossy_cellar').state;
    s = ok(placeSlot(s, content, 'forest', 'ironbark'));
    s = ok(assignSlotCard(s, content, 'forest', 1, 'apprentice_feller'));
    expect(slotWorkers(s, content).map((w) => w.material.id)).toEqual(['ironbark']);
    expect(campPerSecond(s, content)['ironbark_gem']!.toNumber()).toBeGreaterThan(0);
    expect(campPerSecond(s, content)['oak_gem']).toBeUndefined();
  });

  it('a waiting slot farms nothing even with a card saved on it', () => {
    const s = bareState();
    s.camp.level = 3;
    s.cards.owned['apprentice_feller'] = newOwnedCard();
    s.camp.forest[1] = { material: null, card: 'apprentice_feller' };
    expect(slotWorkers(s, content)).toEqual([]);
  });
});

/** Save format 45: every slot open at format 44 keeps the material it farmed. */
describe('v44 -> v45', () => {
  const build = (edit: (s: GameState) => void) => {
    const state = createInitialState(content);
    edit(state);
    const parsed = JSON.parse(createSaveText(state, 5_000)) as {
      version: number;
      state: { camp: { forest: unknown[]; cave: unknown[] } };
    };
    parsed.version = 44;
    return parsed;
  };

  it('is a format 44 save and the game is newer', () => {
    expect(build(() => {}).version).toBe(44);
    expect(CURRENT_SAVE_VERSION).toBeGreaterThanOrEqual(45);
  });

  it("gives an unplaced or missing slot the place's first material", () => {
    const parsed = build((s) => {
      s.camp.level = 5; // forest 2, cave 2
    });
    parsed.state.camp.forest = [{ material: null, card: 'apprentice_feller' }];
    parsed.state.camp.cave = [];
    const { state } = readSave(JSON.stringify(parsed), content);
    expect(state.camp.forest).toEqual([
      { material: 'oak', card: 'apprentice_feller' },
      { material: 'oak', card: null },
    ]);
    expect(state.camp.cave).toEqual([
      { material: 'copper_quarry', card: null },
      { material: 'copper_quarry', card: null },
    ]);
    expect(waitingSlots(state, content, 'forest')).toEqual([]);
  });

  it('keeps a chosen material and counts the Starlight slots', () => {
    const parsed = build((s) => {
      s.camp.level = 3;
      s.prestige.shop['second_hands'] = 1;
    });
    parsed.state.camp.forest = [
      { material: 'oak', card: null },
      { material: 'ironbark', card: null },
    ];
    const { state } = readSave(JSON.stringify(parsed), content);
    expect(state.camp.forest.map((s) => s.material)).toEqual(['oak', 'ironbark', 'oak']);
    expect(waitingSlots(state, content, 'forest')).toEqual([]);
    expect(waitingSlots(state, content, 'cave')).toEqual([]);
  });
});
