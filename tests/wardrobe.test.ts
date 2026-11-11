import { describe, expect, it } from 'vitest';
import type { Content } from '../src/data';
import {
  advance,
  collectModifiers,
  cosmeticLadder,
  cosmeticMaxLevel,
  cosmeticSource,
  cosmeticUpgradeCheck,
  createSaveText,
  CURRENT_SAVE_VERSION,
  Decimal,
  equipCosmetic,
  MIGRATIONS,
  portalInfo,
  pull,
  readSave,
  resolveCardFor,
  setBonuses,
  unequipCosmetic,
  upgradeCosmetic,
  wardrobeItems,
  type EquipResult,
  type GameState,
} from '../src/game';
import { constantRng, content, CRYSTAL_UNIT, freshState, withDps } from './helpers';

const rules = content.cosmeticRules;
const cosmetic = (id: string) => content.cosmeticById.get(id)!;
const owning = (...ids: string[]): GameState => {
  const state = freshState();
  for (const id of ids) state.cosmetics.owned[id] = { level: 1, copies: 0 };
  return state;
};
/** The new state of a successful equip. */
const ok = (r: EquipResult): GameState => {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};
/** Content with the Wardrobe Gate open (it ships with the Wardrobe screen). */
const gateOpen: Content = { ...content, portals: content.allPortals };

describe('upgrade levels (DESIGN.md §8)', () => {
  it('caps levels by rarity; starters keep their own level count', () => {
    expect(cosmeticMaxLevel(content, cosmetic('holo_hex'))).toBe(3); // rare
    expect(cosmeticMaxLevel(content, cosmetic('gilded_filigree'))).toBe(4); // epic
    expect(cosmeticMaxLevel(content, cosmetic('gt_border'))).toBe(5); // legendary
    expect(cosmeticMaxLevel(content, cosmetic('ember_crown'))).toBe(6); // mythic (as void)
    expect(cosmeticMaxLevel(content, cosmetic('gn_border'))).toBe(1); // starter
    expect(rules.maxLevel).toEqual({
      common: 2,
      uncommon: 3,
      rare: 3,
      epic: 4,
      legendary: 5,
      mythic: 6,
      void: 6,
    });
  });

  it('follows the ladder: shape, accent, gems, glow, ambient, always ending on ambient', () => {
    expect(rules.ladders['2']).toEqual(['shape', 'ambient']);
    expect(rules.ladders['6']).toEqual(['shape', 'shape', 'accent', 'gems', 'glow', 'ambient']);
    expect(cosmeticLadder(content, cosmetic('gt_border'))).toEqual([
      'shape',
      'accent',
      'gems',
      'glow',
      'ambient',
    ]);
  });

  it('needs a duplicate and the step material to level up', () => {
    const state = owning('holo_hex');
    const check = cosmeticUpgradeCheck(state, content, 'holo_hex')!;
    expect(check.toLevel).toBe(2);
    expect(check.step).toBe('accent');
    const material = rules.materials.accent;
    const amount = material.amount.mul(rules.rarityCost.rare);
    expect(check.requirements).toEqual([
      { kind: 'copies', have: new Decimal(0), need: new Decimal(rules.copiesPerLevel), met: false },
      {
        kind: 'resource',
        resource: material.resource,
        have: new Decimal(0),
        need: amount,
        met: false,
      },
    ]);
    expect(check.met).toBe(false);
  });

  it('spends the copy and material, raises the level and keeps worn copies in step', () => {
    let state = owning('holo_hex');
    state.cosmetics.owned['holo_hex']!.copies = 2;
    state.resources['glimmer_dust'] = new Decimal(1000);
    state = ok(equipCosmetic(state, content, 'holo_hex'));
    const result = upgradeCosmetic(state, content, 'holo_hex');
    if (!result.ok) throw new Error(result.reason);
    const owned = result.state.cosmetics.owned['holo_hex']!;
    expect(owned).toEqual({ level: 2, copies: 1 });
    expect(result.state.cosmetics.loadout.slots.finish).toEqual({ id: 'holo_hex', level: 2 });
    expect(result.state.resources['glimmer_dust']!.lt(1000)).toBe(true);
    expect(result.maxed).toBe(false);
  });

  it('refuses unowned items, missing requirements and the max level', () => {
    expect(upgradeCosmetic(freshState(), content, 'holo_hex')).toEqual({
      ok: false,
      reason: 'not-owned',
    });
    expect(upgradeCosmetic(owning('holo_hex'), content, 'holo_hex')).toEqual({
      ok: false,
      reason: 'requirements',
    });
    const top = owning('holo_hex');
    top.cosmetics.owned['holo_hex']!.level = 3;
    expect(upgradeCosmetic(top, content, 'holo_hex')).toEqual({ ok: false, reason: 'maxed' });
    expect(cosmeticUpgradeCheck(top, content, 'holo_hex')!.available).toBe(false);
  });
});

describe('drawn levels of borders and finishes (DESIGN.md §8)', () => {
  const items = content.cosmetics.filter(
    (c) => !c.starter && (c.slot === 'border' || c.slot === 'finish'),
  );

  it('have no more drawn levels than the max (higher ones show the top drawn level)', () => {
    for (const c of items) {
      expect(c.levels.length, c.id).toBeLessThanOrEqual(content.cosmeticRules.maxLevel[c.rarity]);
    }
  });

  it('end on an ambient recipe; borders add the corner flourishes at the top', () => {
    for (const c of items) {
      const top = c.levels[c.levels.length - 1]!.recipes;
      expect(
        top.some((r) => r.startsWith('ambient-')),
        c.id,
      ).toBe(true);
      if (c.slot === 'border') {
        expect(
          top.some((r) => r === 'flourish-corners' || r.startsWith('corner-')),
          c.id,
        ).toBe(true);
      }
      // Only the ambient level animates.
      for (const level of c.levels.slice(0, -1)) {
        expect(
          level.recipes.some((r) => r.startsWith('ambient-')),
          c.id,
        ).toBe(false);
      }
    }
  });
});

describe('equipping (DESIGN.md §8)', () => {
  it('equips owned items in their slot at their level, and unequips back to the starter', () => {
    expect(equipCosmetic(freshState(), content, 'gt_table')).toMatchObject({
      ok: false,
      reason: 'not-owned',
    });
    const state = owning('gt_table');
    state.cosmetics.owned['gt_table']!.level = 3;
    const on = equipCosmetic(state, content, 'gt_table');
    if (!on.ok) throw new Error(on.reason);
    expect(on.state.cosmetics.loadout.slots.table).toEqual({ id: 'gt_table', level: 3 });
    const off = unequipCosmetic(on.state, content, 'table');
    expect(off.cosmetics.loadout.slots.table).toBeUndefined();
  });

  it('wears card-exclusive items only on their own card', () => {
    const state = owning('ember_crown');
    expect(equipCosmetic(state, content, 'ember_crown')).toMatchObject({
      ok: false,
      reason: 'invalid',
    });
    expect(equipCosmetic(state, content, 'ember_crown', 'storm_duelist')).toMatchObject({
      ok: false,
      reason: 'invalid',
    });
    const ok = equipCosmetic(state, content, 'ember_crown', 'dawnblade_regent');
    expect(ok.ok).toBe(true);
  });

  it('gates wearing by card rank: below it the card shows the starter', () => {
    const state = ok(equipCosmetic(owning('gilded_plate'), content, 'gilded_plate'));
    const bronze = resolveCardFor(state, content, 'ember_squire')!;
    expect(bronze.slots.border.worn).toBe(false);
    expect(bronze.slots.border.blocked?.id).toBe('gilded_plate');
    state.cards.owned['ember_squire']!.tier = 'gold';
    const gold = resolveCardFor(state, content, 'ember_squire')!;
    expect(gold.slots.border.worn).toBe(true);
    expect(gold.slots.border.cosmetic.id).toBe('gilded_plate');
  });

  it('gives the set bonus once every item of a set is equipped', () => {
    const ids = content.cosmetics.filter((c) => c.set === 'gilded_tradition').map((c) => c.id);
    let state = owning(...ids);
    for (const id of ids.slice(0, -1)) state = ok(equipCosmetic(state, content, id));
    const partial = setBonuses(state, content).find((s) => s.set.id === 'gilded_tradition')!;
    expect(partial).toMatchObject({ equipped: ids.length - 1, total: ids.length, complete: false });
    state = ok(equipCosmetic(state, content, ids[ids.length - 1]!));
    const full = setBonuses(state, content).find((s) => s.set.id === 'gilded_tradition')!;
    expect(full.complete).toBe(true);
    const mods = collectModifiers(state, content).filter((m) => m.source.kind === 'set');
    expect(mods.length).toBe(full.set.modifiers.length);
  });
});

describe('the wardrobe grid', () => {
  it('lists every cosmetic with ownership, level, max, copies, source and where it is worn', () => {
    const state = ok(equipCosmetic(owning('holo_hex'), content, 'holo_hex'));
    const items = wardrobeItems(state, content);
    expect(items).toHaveLength(content.cosmetics.length);
    const hex = items.find((i) => i.cosmetic.id === 'holo_hex')!;
    expect(hex).toMatchObject({
      owned: true,
      level: 1,
      maxLevel: 3,
      copies: 0,
      source: 'dungeon',
      equippedGlobally: true,
      equippedOnCards: [],
      nextStep: 'accent',
    });
    const crown = items.find((i) => i.cosmetic.id === 'ember_crown')!;
    expect(crown.owned).toBe(false);
    expect(crown.wearRank).toEqual(content.wearRules.exclusive);
  });

  it('names a source for every cosmetic (starter, dungeon, prestige or portal)', () => {
    expect(cosmeticSource(content, 'gn_border')).toBe('starter');
    expect(cosmeticSource(content, 'holo_waves')).toBe('dungeon');
    expect(cosmeticSource(content, 'gilded_plate')).toBe('prestige');
    expect(cosmeticSource(content, 'gt_finish')).toBe('achievement');
    expect(cosmeticSource(content, 'ember_crown')).toBe('portal');
    for (const c of content.cosmetics) expect(cosmeticSource(content, c.id), c.id).not.toBeNull();
  });
});

describe('dungeon cosmetic drops are owned', () => {
  it('a rare drop that is a cosmetic goes into the wardrobe (a copy when owned)', () => {
    const state = freshState();
    // rng 0: every chance roll succeeds, so the first kill drops Holo Hex.
    const { state: after, report } = advance(state, withDps(1e6, content), 5_000, constantRng(0));
    expect(report.bossKills).toBeGreaterThan(0);
    expect(after.cosmetics.owned['holo_hex']).toEqual({
      level: 1,
      copies: report.bossKills - 1,
    });
  });
});

describe('the Wardrobe Gate (DESIGN.md §7)', () => {
  it('opens with the Wardrobe screen (Phase 5b): among the open portals', () => {
    expect(content.portals.some((p) => p.id === 'wardrobe_gate')).toBe(true);
    expect(content.allPortals.some((p) => p.id === 'wardrobe_gate')).toBe(true);
  });

  it('costs Glamour Scrolls with the same pull, pity and guarantee rules', () => {
    const state = freshState();
    state.resources['glamour_scroll'] = new Decimal(100 * CRYSTAL_UNIT);
    const info = portalInfo(state, gateOpen, 'wardrobe_gate')!;
    expect(info.single.price.resource).toBe('glamour_scroll');
    expect(info.ten.affordable).toBe(true);
    expect(info.pity.threshold).toBe(90);
    expect(info.tenPullGuarantee).toBe('rare');
  });

  it('pulls cosmetics; a duplicate becomes a copy for upgrade levels', () => {
    const state = freshState();
    state.resources['glamour_scroll'] = new Decimal(20 * CRYSTAL_UNIT);
    const once = pull(state, gateOpen, 'wardrobe_gate', 1, constantRng(0));
    if (!once.ok) throw new Error(once.reason);
    const id = once.results[0]!.itemId;
    expect(content.cosmeticById.has(id)).toBe(true);
    expect(once.results[0]!.gain).toEqual({ kind: 'new' });
    const twice = pull(once.state, gateOpen, 'wardrobe_gate', 1, constantRng(0));
    if (!twice.ok) throw new Error(twice.reason);
    expect(twice.results[0]!.gain).toEqual({ kind: 'copy', copies: 1 });
    expect(twice.state.cosmetics.owned[id]!.copies).toBe(1);
  });

  it('holds every cosmetic whose source is not defined elsewhere', () => {
    const gate = content.allPortals.find((p) => p.id === 'wardrobe_gate')!;
    const pool = new Set(gate.pool.map((e) => e.itemId));
    for (const c of content.cosmetics) {
      if (cosmeticSource(content, c.id) === 'portal') expect(pool.has(c.id), c.id).toBe(true);
    }
    for (const e of gate.pool) expect(e.rarity).toBe(cosmetic(e.itemId).rarity);
  });
});

describe('saving (save format v11)', () => {
  it('keeps levels above the drawn levels, up to the rarity max', () => {
    const state = owning('holo_hex');
    state.cosmetics.owned['holo_hex'] = { level: 3, copies: 4 };
    const loaded = readSave(createSaveText(state, 1), content).state;
    expect(loaded.cosmetics.owned['holo_hex']).toEqual({ level: 3, copies: 4 });
  });

  it('migrates v10 -> v11: cosmetic rare drops held in the inventory become owned', () => {
    expect(CURRENT_SAVE_VERSION).toBeGreaterThanOrEqual(11);
    const migrated = MIGRATIONS[10]!({
      inventory: { holo_hex: 3, something_else: 1 },
      cosmetics: {
        loadout: { slots: {}, cards: {} },
        owned: { gn_border: { level: 1, copies: 1 } },
      },
    });
    expect(migrated['cosmetics']).toEqual({
      loadout: { slots: {}, cards: {} },
      owned: { gn_border: { level: 1, copies: 1 }, holo_hex: { level: 1, copies: 2 } },
    });
  });
});
