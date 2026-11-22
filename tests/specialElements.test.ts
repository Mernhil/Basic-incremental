import { describe, expect, it } from 'vitest';
import { ELEMENTS } from '../src/data';
import {
  effectOf,
  ELEMENT_EFFECTS,
  ELEMENT_SHEETS,
  hasSpecial,
} from '../src/renderer/src/stage/specialData';

/** DESIGN §2 Five elements: the duel's special attack knows exactly the five. */
describe('the special attack and the five elements', () => {
  it('has a code-drawn effect for each of the five and for no other', () => {
    expect(Object.keys(ELEMENT_EFFECTS).sort()).toEqual([...ELEMENTS].sort());
  });

  it('has a drawn slash for fire, light, earth and dark; water has none yet', () => {
    expect(Object.keys(ELEMENT_SHEETS).sort()).toEqual(['dark', 'earth', 'fire', 'light']);
  });

  it('a card with no element still plays its material hit (Wood to Prismatic)', () => {
    expect(hasSpecial('sword', undefined, 'wood')).toBe(true);
    expect(effectOf('prismatic', '')?.plain).toBe(true);
    expect(hasSpecial('sword', undefined)).toBe(false);
  });

  it('a T6 or Heirloom card plays its element, water included', () => {
    for (const element of ELEMENTS) {
      expect(hasSpecial('sword', element, 'mythic'), element).toBe(true);
      expect(effectOf('heirloom', element)?.plain, element).toBeUndefined();
    }
  });
});
