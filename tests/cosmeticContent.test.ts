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
const CORE = {
  corepulse: { id: 'core_pulse', name: 'Core Pulse', motion: 'pair' },
  veins: { id: 'power_veins', name: 'Power Veins', motion: 'pop' },
  hexcore: { id: 'hex_core', name: 'Hex Core', motion: 'orbit' },
  strata: { id: 'magma_strata', name: 'Magma Strata', motion: 'fountain' },
  starburst: { id: 'starburst', name: 'Starburst', motion: 'rail' },
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

  it('are global slots after the seven card and screen slots', () => {
    expect(COSMETIC_SLOTS.slice(0, 7)).toEqual([
      'border',
      'finish',
      'attack',
      'tick',
      'number',
      'table',
      'cursor',
    ]);
    expect(COSMETIC_SLOTS.slice(7)).toEqual([...SKINS]);
  });

  for (const skin of SKINS) {
    it(`${skin}: option A is the starter, B to E are items in their rarity`, () => {
      const items = content.cosmetics.filter((c) => c.slot === skin);
      expect(items).toHaveLength(5);
      const starter = content.starterBySlot[skin];
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

  it('spread their sources over prestige, achievements, the reward track and the shard shop', () => {
    const source = (id: string) => cosmeticSource(content, id);
    expect(source('starlight_b')).toBe('prestige');
    expect(source('starlight_c')).toBe('prestige');
    expect(source('starlight_d')).toBe('shop');
    expect(source('starlight_e')).toBe('shop');
    expect(source('sticker_b')).toBe('achievement');
    expect(source('sticker_c')).toBe('achievement');
    expect(source('sticker_d')).toBe('shop');
    expect(source('sticker_e')).toBe('achievement');
    expect(source('nodes_b')).toBe('achievement');
    expect(source('nodes_c')).toBe('track');
    expect(source('nodes_d')).toBe('track');
    expect(source('nodes_e')).toBe('shop');
    expect(source('wardrobe_b')).toBe('achievement');
    expect(source('wardrobe_c')).toBe('track');
    expect(source('wardrobe_d')).toBe('track');
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

      it('is a Legendary set: one item per slot, five levels each, with a set bonus', () => {
        expect(content.setById.get(spec.set)?.modifiers.length).toBeGreaterThan(0);
        expect(items.map((c) => c.slot).sort()).toEqual(
          ['attack', 'border', 'cursor', 'finish', 'number', 'table', 'tick'].sort(),
        );
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
            if (c.slot === 'attack') {
              expect(level.effects).toEqual({
                fighting: `px-slash-${style}-${n}`,
                logging: `px-slash-${style}-${n}`,
                mining: 'heavy-hit',
              });
            } else {
              const prefix = PREFIX[c.slot as keyof typeof PREFIX];
              expect(level.recipes, `${c.id} L${n}`).toContain(`${prefix}-${style}-${n}`);
            }
          });
        }
      });

      it('reaches its maximum with the assigned motion and corner', () => {
        const border = items.find((c) => c.slot === 'border')!;
        expect(lastRecipes(border)).toContain(`ambient-${spec.rail}`);
        expect(lastRecipes(border)).toContain(`corner-${spec.corner}`);
        const finish = items.find((c) => c.slot === 'finish')!;
        expect(lastRecipes(finish)).toContain(`ambient-${spec.fin}-f`);
      });

      it('applies its bonus when all seven pieces are worn', () => {
        let state = freshState();
        for (const c of items) state.cosmetics.owned[c.id] = { level: 1, copies: 0 };
        for (const c of items) state = ok(equipCosmetic(state, content, c.id));
        const info = setBonuses(state, content).find((s) => s.set.id === spec.set)!;
        expect(info).toMatchObject({ equipped: 7, total: 7, complete: true });
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

describe('Core Titan finishes (B4)', () => {
  for (const [style, spec] of Object.entries(CORE)) {
    it(`${spec.name}: Mythic, six levels, exclusive to the Titan`, () => {
      const c = byId(spec.id);
      expect(c.name).toBe(spec.name);
      expect([c.slot, c.rarity, c.exclusiveCard, c.set]).toEqual([
        'finish',
        'mythic',
        'core_titan',
        null,
      ]);
      expect(c.levels).toHaveLength(6);
      c.levels.forEach((_, i) => expect(recipesAt(c, i + 1)).toContain(`fn-${style}-${i + 1}`));
      expect(lastRecipes(c)).toContain(`ambient-${spec.motion}-f`);
      expect(cosmeticSource(content, c.id)).toBe('portal');
    });
  }
});

describe('the 20 loose items (B5)', () => {
  for (const [style, spec] of Object.entries(LOOSE)) {
    const slot = (s: string) => byId(`${style}_${s}`);

    it(`${style}: Common border and numbers, Epic attack and tick, in no set`, () => {
      const border = slot('border');
      const number = slot('number');
      const attack = slot('attack');
      const tick = slot('tick');
      expect([border.rarity, number.rarity]).toEqual(['common', 'common']);
      expect([attack.rarity, tick.rarity]).toEqual(['epic', 'epic']);
      for (const c of [border, number, attack, tick]) {
        expect(c.set).toBeNull();
        expect(c.exclusiveCard).toBeNull();
        expect(c.levels, c.id).toHaveLength(cosmeticMaxLevel(content, c));
        expect(cosmeticSource(content, c.id)).toBe('portal');
      }
      expect([border.slot, number.slot, attack.slot, tick.slot]).toEqual([
        'border',
        'number',
        'attack',
        'tick',
      ]);
    });

    it(`${style}: levels name the recipes, the border ends with its motion and corner`, () => {
      const border = slot('border');
      expect(recipesAt(border, 1)).toContain(`bd-${style}-1`);
      expect(recipesAt(border, 2)).toContain(`bd-${style}-2`);
      expect(lastRecipes(border)).toContain(`ambient-${spec.motion}`);
      expect(lastRecipes(border)).toContain(`corner-${spec.corner}`);
      const number = slot('number');
      expect(recipesAt(number, 1)).toContain(`num-${style}-1`);
      expect(recipesAt(number, 2)).toContain(`num-${style}-2`);
      const tick = slot('tick');
      tick.levels.forEach((_, i) =>
        expect(recipesAt(tick, i + 1)).toContain(`tk-${style}-${i + 1}`),
      );
      expect(tick.levels[0]!.effect).toBe('rise');
      const attack = slot('attack');
      attack.levels.forEach((l, i) =>
        expect(l.effects).toEqual({
          fighting: `px-slash-${style}-${i + 1}`,
          logging: `px-slash-${style}-${i + 1}`,
          mining: 'heavy-hit',
        }),
      );
    });
  }
});

describe('the B8 / B9 spread over the existing items', () => {
  it('adds each existing border or finish motion (and corner) at its max level', () => {
    expect(lastRecipes(byId('gilded_filigree'))).toContain('ambient-rail');
    expect(lastRecipes(byId('gilded_plate'))).toContain('ambient-pair');
    expect(lastRecipes(byId('gt_border'))).toContain('ambient-pop');
    expect(lastRecipes(byId('ember_crown'))).toContain('ambient-fountain');
    expect(lastRecipes(byId('ember_crown'))).toContain('corner-wings');
    expect(lastRecipes(byId('aurora_veil'))).toContain('ambient-orbit-f');
    expect(lastRecipes(byId('holo_hex'))).toContain('ambient-fountain-f');
    expect(lastRecipes(byId('holo_waves'))).toContain('ambient-rail-f');
    expect(lastRecipes(byId('gt_finish'))).toContain('ambient-pop-f');
  });
});

describe('the Wardrobe Gate pool and sources', () => {
  const gate = content.allPortals.find((p) => p.id === 'wardrobe_gate')!;

  it('covers the rarities its items use, from Common to Mythic', () => {
    const rarities = new Set(gate.pool.map((e) => e.rarity));
    for (const r of ['common', 'rare', 'epic', 'legendary', 'mythic'] as const) {
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
    expect(gate.pool.length).toBe(11 + 35 + 5 + 5 + 20);
    const total = gate.pool.reduce((a, e) => a + e.weight, 0);
    const share = (r: Rarity) =>
      gate.pool.filter((e) => e.rarity === r).reduce((a, e) => a + e.weight, 0) / total;
    expect(share('common')).toBeGreaterThan(share('rare'));
    expect(share('rare')).toBeGreaterThan(share('epic'));
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
