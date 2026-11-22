import { describe, expect, it } from 'vitest';
import { clearDungeon, collectModifiers, newOwnedCard } from '../src/game';
import { campScreen, lockedWhy, NODE_MASK } from '../src/renderer/src/views/gathering/campModel';
import { bareState, content } from './helpers';

/** The forest and mine screens' view model (DESIGN.md §2 Base camp). */
describe('campScreen', () => {
  it('lists the three nodes of a place, the locked ones with what opens them', () => {
    const s = bareState();
    const screen = campScreen(s, content, 'forest', collectModifiers(s, content));
    expect(screen.nodes.map((n) => n.id)).toEqual(['oak', 'ironbark', 'moonwillow']);
    expect(screen.nodes.map((n) => n.locked !== null)).toEqual([false, true, true]);
    expect(screen.nodes[1]!.locked).toBe(lockedWhy(content, 'mossy_cellar'));
    expect(screen.nodes[1]!.locked).toMatch(/^clear .+ to reach it$/);
  });

  it('every node has a mask key', () => {
    for (const id of [...content.trees, ...content.mines].map((p) => p.id)) {
      expect(NODE_MASK[id]).toBeTruthy();
    }
  });

  it('puts each slot on its node and offers "place here" on open nodes only while a slot waits', () => {
    let s = bareState();
    s.camp.level = 3;
    s.cards.owned['apprentice_feller'] = newOwnedCard();
    s.camp.forest[0]!.card = 'apprentice_feller';
    s = clearDungeon(s, content, 'mossy_cellar').state;
    const screen = campScreen(s, content, 'forest', collectModifiers(s, content));
    expect(screen.waiting).toBe(1);
    expect(screen.nodes.map((n) => n.canPlace)).toEqual([true, true, false]);
    expect(screen.nodes[0]!.slots.map((x) => x.index)).toEqual([0]);
    expect(screen.nodes[0]!.working).toBe(true);
    expect(screen.nodes[0]!.slots[0]!.rate).toMatch(/^\+.+\/s$/);
    expect(screen.nodes[1]!.slots).toEqual([]);
  });

  it('shows no slots on a locked node and no call when none waits', () => {
    const s = bareState();
    const screen = campScreen(s, content, 'cave', collectModifiers(s, content));
    expect(screen.waiting).toBe(0);
    expect(screen.nodes.every((n) => !n.canPlace)).toBe(true);
    expect(screen.nodes[2]!.slots).toEqual([]);
  });
});
