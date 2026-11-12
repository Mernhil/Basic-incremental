import { describe, expect, it } from 'vitest';
import { COSMETIC_SLOTS, RARITIES, type Cosmetic, type Rarity } from '../src/data';
import {
  collectModifiers,
  cosmeticMaxLevel,
  cosmeticSource,
  equipCosmetic,
  sanitizeLoadout,
  setBonuses,
  type EquipResult,
  type GameState,
} from '../src/game';
import { content, freshState } from './helpers';

/**
 * The beta art batch B1-B10 as content (DESIGN.md §8 "Every option is kept", 11.1; ids from
 * docs/ASSET_RULES.md §7).
 */

const byId = (id: string): Cosmetic => {
  const c = content.cosmeticById.get(id);
  if (!c) throw new Error(`missing cosmetic ${id}`);
  return c;
};
const ok = (r: EquipResult): GameState => {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};
const recipesAt = (c: Cosmetic, level: number): string[] => c.levels[level - 1]!.recipes;
const lastRecipes = (c: Cosmetic): string[] => recipesAt(c, c.levels.length);

/** Border / finish motion and corner per style (manifest B2-B5). */
const GARDEN = {
  verdant: {
    name: 'Verdant Reverie',
    set: 'verdant_reverie',
    rail: 'rail',
    corner: 'acanthus',
    fin: 'pop',
  },
  vine: { name: 'Vine Wrap', set: 'vine_wrap', rail: 'orbit', corner: 'knot', fin: 'rail' },
  fern: { name: 'Fern Fronds', set: 'fern_fronds', rail: 'fountain', corner: 'wings', fin: 'pair' },
  moss: {
    name: 'Moss and Mushrooms',
    set: 'moss_mushrooms',
    rail: 'pair',
    corner: 'pauldron',
    fin: 'fountain',
  },
  blossom: {
    name: 'Blossom Branch',
    set: 'blossom_branch',
    rail: 'pop',
    corner: 'shards',
    fin: 'orbit',
  },
} as const;
const PREFIX = {
  border: 'bd',
  finish: 'fn',
  tick: 'tk',
  number: 'num',
  table: 'tb',
  cursor: 'cur',
} as const;

const MOON = {
  heartwood: { id: 'heartwood_halo', name: 'Heartwood Halo', motion: 'orbit', corner: 'knot' },
  antler: { id: 'moonwood_antlers', name: 'Moonwood Antlers', motion: 'rail', corner: 'wings' },
  rings: { id: 'growth_rings', name: 'Growth Rings', motion: 'pair', corner: 'acanthus' },
  luna: { id: 'luna_moths', name: 'Luna Moths', motion: 'pop', corner: 'shards' },
  wreath: { id: 'moon_wreath', name: 'Moon Wreath', motion: 'fountain', corner: 'pauldron' },
} as const;
const LOOSE = {
  forge: { motion: 'pop', corner: 'pauldron' },
  woodcraft: { motion: 'rail', corner: 'knot' },
  starmap: { motion: 'orbit', corner: 'wings' },
  candy: { motion: 'fountain', corner: 'shards' },
  rune: { motion: 'pair', corner: 'acanthus' },
} as const;

describe('the four UI-skin slots', () => {
  const SKINS = ['starlight', 'sticker', 'nodes', 'wardrobe'] as const;
  const RARITY_OF: Record<string, Rarity> = {
    b: 'rare',
    c: 'epic',
    d: 'legendary',
    e: 'mythic',
  };

  it('are global slots after the six card and screen slots (there is no attack slot)', () => {
    expect(COSMETIC_SLOTS.slice(0, 6)).toEqual([
      'border',
      'finish',
      'tick',
      'number',
      'table',
      'cursor',
    ]);
    expect(COSMETIC_SLOTS.slice(6)).toEqual([...SKINS]);
    expect(COSMETIC_SLOTS).not.toContain('attack');
  });

  for (const skin of SKINS) {
    it(`${skin}: option A is the starter, B to E are items in their rarity`, () => {
      const items = content.cosmetics.filter((c) => c.slot === skin);
      expect(items).toHaveLength(5);
      const starter = content.starterBySlot[skin]!;
      expect(starter.levels).toHaveLength(1);
      expect(starter.levels[0]!.recipes).toEqual([`ui-${skin}-a`]);
      for (const style of ['b', 'c', 'd', 'e']) {
        const item = items.find((c) => c.levels[0]!.recipes[0] === `ui-${skin}-${style}`)!;
        expect(item, `${skin} ${style}`).toBeDefined();
        expect(item.starter).toBe(false);
        expect(item.rarity).toBe(RARITY_OF[style]);
        expect(item.set).toBeNull();
        expect(item.exclusiveCard).toBeNull();
        expect(item.levels).toHaveLength(1);
        expect(Object.keys(item.levels[0]!.tokens)).toEqual([]);
        expect(item.ownedModifiers.length).toBeGreaterThan(0);
      }
    });
  }

  it('spread their sources over prestige, achievements, the reward track, the shard shop and the dungeons (the rare drops that replaced the finishes)', () => {
    const source = (id: string) => cosmeticSource(content, id);
    expect(source('starlight_b')).toBe('prestige');
    expect(source('starlight_c')).toBe('dungeon');
    expect(source('starlight_d')).toBe('shop');
    expect(source('starlight_e')).toBe('shop');
    expect(source('sticker_b')).toBe('achievement');
    expect(source('sticker_c')).toBe('dungeon');
    expect(source('sticker_d')).toBe('shop');
    expect(source('sticker_e')).toBe('achievement');
    expect(source('nodes_b')).toBe('dungeon');
    expect(source('nodes_c')).toBe('dungeon');
    expect(source('nodes_d')).toBe('achievement');
    expect(source('nodes_e')).toBe('shop');
    expect(source('wardrobe_b')).toBe('achievement');
    expect(source('wardrobe_c')).toBe('dungeon');
    expect(source('wardrobe_d')).toBe('achievement');
    expect(source('wardrobe_e')).toBe('shop');
  });

  it('equip globally, and a loadout from before the slots existed still resolves', () => {
    const state = freshState();
    state.cosmetics.owned['nodes_c'] = { level: 1, copies: 0 };
    const worn = ok(equipCosmetic(state, content, 'nodes_c'));
    expect(worn.cosmetics.loadout.slots['nodes']?.id).toBe('nodes_c');
    const old = sanitizeLoadout(content, {
      slots: { border: { id: 'gn_border', level: 1 } },
      cards: {},
    });
    expect(old.slots['nodes']).toBeUndefined();
  });
});

describe('the five garden sets (B2)', () => {
  for (const [style, spec] of Object.entries(GARDEN)) {
    describe(spec.name, () => {
      const items = content.cosmetics.filter((c) => c.set === spec.set);

      it('is a Legendary set: a border, a table and a cursor, five levels each, with a set bonus', () => {
        expect(content.setById.get(spec.set)?.modifiers.length).toBeGreaterThan(0);
        expect(items.map((c) => c.slot).sort()).toEqual(['border', 'cursor', 'table'].sort());
        for (const c of items) {
          expect(c.rarity).toBe('legendary');
          expect(c.starter).toBe(false);
          expect(c.exclusiveCard).toBeNull();
          expect(c.levels, c.id).toHaveLength(cosmeticMaxLevel(content, c));
          expect(c.ownedModifiers.length).toBeGreaterThan(0);
        }
      });

      it('names its recipes and effects per level (coherent across the slots)', () => {
        for (const c of items) {
          c.levels.forEach((level, i) => {
            const n = i + 1;
            const prefix = PREFIX[c.slot as keyof typeof PREFIX];
            expect(level.recipes, `${c.id} L${n}`).toContain(`${prefix}-${style}-${n}`);
          });
        }
      });

      it('reaches its maximum with the assigned motion and corner', () => {
        const border = items.find((c) => c.slot === 'border')!;
        expect(lastRecipes(border)).toContain(`ambient-${spec.rail}`);
        expect(lastRecipes(border)).toContain(`corner-${spec.corner}`);
      });

      it('applies its bonus when all three pieces are worn', () => {
        let state = freshState();
        for (const c of items) state.cosmetics.owned[c.id] = { level: 1, copies: 0 };
        for (const c of items) state = ok(equipCosmetic(state, content, c.id));
        const info = setBonuses(state, content).find((s) => s.set.id === spec.set)!;
        expect(info).toMatchObject({ equipped: 3, total: 3, complete: true });
        const mods = collectModifiers(state, content).filter(
          (m) => m.source.kind === 'set' && m.source.id === spec.set,
        );
        expect(mods).toHaveLength(info.set.modifiers.length);
      });
    });
  }

  it('is named by the manifest', () => {
    expect(content.setById.get('verdant_reverie')?.name).toBe('Verdant Reverie');
    expect(byId('verdant_border').name).toBe('Leaf Crown');
  });
});

describe('Moonwood Dryad borders (B3)', () => {
  for (const [style, spec] of Object.entries(MOON)) {
    it(`${spec.name}: Mythic, five levels, exclusive to the Dryad`, () => {
      const c = byId(spec.id);
      expect(c.name).toBe(spec.name);
      expect([c.slot, c.rarity, c.exclusiveCard, c.set]).toEqual([
        'border',
        'mythic',
        'moonwood_dryad',
        null,
      ]);
      expect(c.levels).toHaveLength(5);
      c.levels.forEach((_, i) => expect(recipesAt(c, i + 1)).toContain(`bd-${style}-${i + 1}`));
      expect(lastRecipes(c)).toContain(`ambient-${spec.motion}`);
      expect(lastRecipes(c)).toContain(`corner-${spec.corner}`);
      expect(cosmeticSource(content, c.id)).toBe('portal');
    });
  }
});

describe('the 5 loose borders (B5)', () => {
  for (const [style, spec] of Object.entries(LOOSE)) {
    const slot = (s: string) => byId(`${style}_${s}`);

    it(`${style}: a Common border in no set, from the Wardrobe Gate`, () => {
      const border = slot('border');
      expect([border.slot, border.rarity, border.set, border.exclusiveCard]).toEqual([
        'border',
        'common',
        null,
        null,
      ]);
      expect(border.levels).toHaveLength(cosmeticMaxLevel(content, border));
      expect(cosmeticSource(content, border.id)).toBe('portal');
    });

    it(`${style}: levels name the recipes, the border ends with its motion and corner`, () => {
      const border = slot('border');
      expect(recipesAt(border, 1)).toContain(`bd-${style}-1`);
      expect(recipesAt(border, 2)).toContain(`bd-${style}-2`);
      expect(lastRecipes(border)).toContain(`ambient-${spec.motion}`);
      expect(lastRecipes(border)).toContain(`corner-${spec.corner}`);
    });
  }
});

describe('the B8 / B9 spread over the existing items', () => {
  it('adds each existing border motion (and corner) at its max level', () => {
    expect(lastRecipes(byId('gilded_filigree'))).toContain('ambient-rail');
    expect(lastRecipes(byId('gilded_plate'))).toContain('ambient-pair');
    expect(lastRecipes(byId('gt_border'))).toContain('ambient-pop');
    expect(lastRecipes(byId('ember_crown'))).toContain('ambient-fountain');
    expect(lastRecipes(byId('ember_crown'))).toContain('corner-wings');
  });
});

describe('the Wardrobe Gate pool and sources', () => {
  const gate = content.allPortals.find((p) => p.id === 'wardrobe_gate')!;

  it('covers the rarities its items use: Common, Legendary and Mythic (the Rare and Epic loose items were finishes and ticks)', () => {
    const rarities = new Set(gate.pool.map((e) => e.rarity));
    for (const r of ['common', 'legendary', 'mythic'] as const) {
      expect(rarities.has(r), r).toBe(true);
    }
    // Exotic is gone: Mythic and Void are the top two rarities.
    expect(RARITIES).not.toContain('exotic');
    expect(RARITIES.slice(-2)).toEqual(['mythic', 'void']);
  });

  it('holds every new portal item, and the rarity classes stay sensible', () => {
    const ids = new Set(gate.pool.map((e) => e.itemId));
    const portalItems = content.cosmetics.filter((c) => cosmeticSource(content, c.id) === 'portal');
    for (const c of portalItems) expect(ids.has(c.id), c.id).toBe(true);
    expect(gate.pool.length).toBe(29);
    const total = gate.pool.reduce((a, e) => a + e.weight, 0);
    const share = (r: Rarity) =>
      gate.pool.filter((e) => e.rarity === r).reduce((a, e) => a + e.weight, 0) / total;
    expect(share('common')).toBeGreaterThan(share('legendary'));
    expect(share('legendary')).toBeGreaterThan(share('mythic'));
  });

  it('gives every non-starter cosmetic a source', () => {
    for (const c of content.cosmetics) expect(cosmeticSource(content, c.id), c.id).not.toBeNull();
  });
});

describe('owned buffs and set bonuses stay small', () => {
  it('keeps every owned buff at or under 2 percent and every set bonus at or under 6 percent per stat', () => {
    for (const c of content.cosmetics) {
      for (const m of c.ownedModifiers) expect(m.value.toNumber(), c.id).toBeLessThanOrEqual(2);
    }
    for (const style of Object.values(GARDEN)) {
      for (const m of content.setById.get(style.set)!.modifiers) {
        expect(m.value.toNumber(), style.set).toBeLessThanOrEqual(6);
      }
    }
  });
});

describe('achievement sticker styles', () => {
  it('are named after the card-frame art', () => {
    const names = ['a', 'b', 'c', 'd', 'e'].map((k) => byId(`sticker_${k}`).name);
    expect(names).toEqual([
      'Mini Card',
      'Silver Card',
      'Gold Card',
      'Legendary Card',
      'Prismatic Card',
    ]);
  });
});
