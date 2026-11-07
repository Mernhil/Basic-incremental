import { describe, expect, it } from 'vitest';
import { cosmeticMaxLevel } from '../src/game';
import { content } from './helpers';

const UI_SLOTS = ['starlight', 'sticker', 'nodes', 'wardrobe'];

describe('UI-skin cosmetics have one drawn level', () => {
  const skins = content.cosmetics.filter((c) => UI_SLOTS.includes(c.slot));

  it('covers the four UI-skin slots', () => {
    expect(skins.length).toBeGreaterThanOrEqual(20);
  });

  it('caps every UI-skin item at level 1 whatever its rarity', () => {
    for (const c of skins) expect(cosmeticMaxLevel(content, c), c.id).toBe(1);
  });

  it('keeps the rarity rule for every other non-starter item', () => {
    for (const c of content.cosmetics) {
      if (c.starter || UI_SLOTS.includes(c.slot)) continue;
      expect(cosmeticMaxLevel(content, c), c.id).toBe(content.cosmeticRules.maxLevel[c.rarity]);
    }
  });
});
