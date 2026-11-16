import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/data';
import {
  breakthroughTier,
  cardInfo,
  createInitialState,
  newOwnedCard,
  xpToNextLevel,
} from '../src/game';
import { weaponView } from '../src/renderer/src/pages/weaponModel';

/**
 * Breakthrough levels (DESIGN.md §5 Strength comes with the card's levels): the levels that carry a
 * card onto the next tier's power step need much more XP, and the Weapon panel says so.
 */
const content = loadContent();
const { xpCurve, levelCaps, power } = content.cardRules;
const plain = (level: number) => xpCurve.base.mul(xpCurve.growth.pow(level - 1));

describe('breakthrough levels', () => {
  it('are the levels from each old cap on, as many as the step is spread over', () => {
    expect(breakthroughTier(content, 19)).toBeNull();
    expect(breakthroughTier(content, levelCaps.wood)).toBe('wood');
    expect(breakthroughTier(content, levelCaps.wood + power.tierStepLevels - 1)).toBe('wood');
    expect(breakthroughTier(content, levelCaps.wood + power.tierStepLevels)).toBeNull();
    expect(breakthroughTier(content, levelCaps.bronze)).toBe('bronze');
    expect(breakthroughTier(content, levelCaps.silver)).toBe('silver');
    expect(breakthroughTier(content, levelCaps.gold)).toBe('gold');
    expect(breakthroughTier(content, levelCaps.prismatic)).toBe('prismatic');
    expect(breakthroughTier(content, levelCaps.mythic)).toBeNull();
  });

  it('need the plain XP times the wall of the cap they pass; every other level the plain XP', () => {
    for (const level of [1, 10, 19, 26, 39, 46, 79, 99, 110]) {
      expect(xpToNextLevel(content, level).eq(plain(level)), String(level)).toBe(true);
    }
    for (const tier of ['wood', 'bronze', 'silver', 'gold', 'prismatic'] as const) {
      const level = levelCaps[tier] + 2;
      expect(xpCurve.stepWall[tier].gt(1), tier).toBe(true);
      expect(xpToNextLevel(content, level).eq(plain(level).mul(xpCurve.stepWall[tier]))).toBe(true);
    }
  });

  it('shows the note in the Weapon panel only while the next level is one of them', () => {
    const view = (id: string, level: number) => {
      const state = createInitialState(content);
      const card = content.cardById.get(id)!;
      state.cards.owned[id] = { ...newOwnedCard(card.tier), level };
      return weaponView(content, cardInfo(state, content, id)!)!;
    };
    const note =
      'Breakthrough levels: the next levels need much more XP and give a big jump in power.';
    expect(view('prism_paladin', 19).breakthrough).toBeNull();
    expect(view('prism_paladin', 20).breakthrough).toBe(note);
    expect(view('prism_paladin', 24).breakthrough).toBe(note);
    expect(view('prism_paladin', 25).breakthrough).toBeNull();
    expect(view('prism_paladin', 80).breakthrough).toBe(note);
    // a Wooden card at Lv 20 is at its cap: it has no step to gain
    expect(view('ember_squire', 20).breakthrough).toBeNull();
  });
});
