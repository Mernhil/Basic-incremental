import { describe, expect, it } from 'vitest';
import { ContentValidationError, bundledRawContent, validateContent } from '../src/data';
import type { Content } from '../src/data';
import {
  CURRENT_SAVE_VERSION,
  Decimal,
  MIGRATIONS,
  createSaveText,
  equipWeaponSkin,
  isWeaponSkinAvailable,
  legacyWeaponArt,
  portalInfo,
  pull,
  readSave,
  weaponSkinArt,
  weaponSkinChoices,
  type GameState,
} from '../src/game';
import { constantRng, content as baseContent, CRYSTAL_UNIT, freshState } from './helpers';

const GATE = 'legacy_gate';

/** The bundled content with the Legacy Gate switched on (it ships disabled until its screen). */
function gateContent(): Content {
  const raw = structuredClone(bundledRawContent());
  const portals = raw.portals as { id: string; enabled?: boolean }[];
  portals.find((p) => p.id === GATE)!.enabled = true;
  return validateContent(raw);
}
const content = gateContent();

const withGlamour = (n: number, base: GameState = freshState()): GameState => {
  base.resources['glamour_scroll'] = new Decimal(n * CRYSTAL_UNIT);
  return base;
};
const owning = (...ids: string[]): GameState => {
  const s = freshState();
  s.legacySkins = ids;
  return s;
};

const LEGACY_COUNTS: Record<string, number> = {
  sword: 1,
  hammer: 2,
  bow: 10,
  staff: 1,
  scythe: 13,
};

describe('legacy skins content', () => {
  it('holds exactly the legacy skins: 27 across five item types, keyed by item type', () => {
    expect(baseContent.weaponSkins.map((w) => [w.weapon, w.skins.length])).toEqual(
      Object.entries(LEGACY_COUNTS),
    );
    const all = baseContent.weaponSkins.flatMap((w) => w.skins);
    expect(all).toHaveLength(27);
    for (const w of baseContent.weaponSkins) {
      expect(w.baseArt).toBeUndefined();
      expect(baseContent.itemTypeByKind.has(w.weapon)).toBe(true);
      expect(w.skins.every((s) => s.legacy === true && s.rarity !== undefined)).toBe(true);
    }
    expect(new Set(all.map((s) => s.id)).size).toBe(27);
    expect(new Set(all.map((s) => s.name)).size).toBe(27);
  });

  it('lists the staff skin: Night Herald, Void', () => {
    const set = baseContent.weaponSkinsByWeapon.get('staff')!;
    expect(set.skins.map((s) => [s.id, s.art, s.rarity, s.name, s.legacy])).toEqual([
      ['legacy-staff-03', 'skin-staff-03', 'void', 'Night Herald', true],
    ]);
  });

  it('lists the sword and hammer skins with their rarity (Exotic became Mythic)', () => {
    const sword = baseContent.weaponSkinsByWeapon.get('sword')!;
    expect(sword.skins.map((s) => [s.id, s.art, s.rarity, s.name])).toEqual([
      ['legacy-sword-01', 'evo-flameblade', 'mythic', 'Flameblade'],
    ]);
    const hammer = baseContent.weaponSkinsByWeapon.get('hammer')!;
    expect(hammer.skins.map((s) => [s.id, s.art, s.rarity])).toEqual([
      ['legacy-hammer-01', 'item-maul-exotic', 'mythic'],
      ['legacy-hammer-02', 'item-maul-void', 'void'],
    ]);
  });

  it('declares the Legacy Gate open, priced like the Wardrobe Gate', () => {
    expect(baseContent.portals.some((p) => p.id === GATE)).toBe(true);
    const gate = baseContent.allPortals.find((p) => p.id === GATE)!;
    const wardrobe = baseContent.allPortals.find((p) => p.id === 'wardrobe_gate')!;
    expect(gate.kind).toBe('skins');
    expect(gate.enabled).toBe(true);
    expect(gate.cost).toEqual(wardrobe.cost);
    expect(gate.pity).toEqual(wardrobe.pity);
    expect(gate.tenPullGuarantee).toBe(wardrobe.tenPullGuarantee);
    expect(gate.duplicatePayback).toBe(0.2);
  });

  it('rejects a legacy skin missing from the gate pool, and a pool entry with another rarity', () => {
    const missing = structuredClone(bundledRawContent());
    const gate = (missing.portals as { id: string; pool: { itemId: string }[] }[]).find(
      (p) => p.id === GATE,
    )!;
    gate.pool.pop();
    expect(() => validateContent(missing)).toThrow(ContentValidationError);

    const wrong = structuredClone(bundledRawContent());
    (wrong.portals as { id: string; pool: { rarity: string }[] }[]).find(
      (p) => p.id === GATE,
    )!.pool[0]!.rarity = 'rare';
    expect(() => validateContent(wrong)).toThrow(/rarity/);
  });

  it('rejects a legacy skin without a rarity, and a skin id used twice across item types', () => {
    const noRarity = structuredClone(bundledRawContent());
    delete (noRarity.weaponSkins as { skins: { rarity?: string }[] }[])[1]!.skins[0]!.rarity;
    expect(() => validateContent(noRarity)).toThrow(/rarity/);

    const dup = structuredClone(bundledRawContent());
    const sets = dup.weaponSkins as { skins: { id: string }[] }[];
    sets[1]!.skins[0]!.id = sets[0]!.skins[0]!.id;
    expect(() => validateContent(dup)).toThrow(/duplicate/);
  });

  it('rejects a weapon without base art whose skins are not all legacy', () => {
    const raw = structuredClone(bundledRawContent());
    (raw.weaponSkins as { skins: { legacy: boolean }[] }[])[1]!.skins[0]!.legacy = false;
    expect(() => validateContent(raw)).toThrow(ContentValidationError);
  });

  it('rejects a skin set for an item type that does not exist', () => {
    const raw = structuredClone(bundledRawContent());
    (raw.weaponSkins as { weapon: string }[])[0]!.weapon = 'soul_reaper';
    expect(() => validateContent(raw)).toThrow(/weaponSkins/);
  });
});

describe('legacy skin ownership', () => {
  it('starts owning nothing and refuses to wear a skin that is not owned', () => {
    const state = freshState();
    expect(state.legacySkins).toEqual([]);
    expect(isWeaponSkinAvailable(state, baseContent, 'staff', 'legacy-staff-03')).toBe(false);
    expect(equipWeaponSkin(state, baseContent, 'staff', 'legacy-staff-03')).toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });

  it('wears an owned legacy skin; nothing is free, scythe skins included', () => {
    const r = equipWeaponSkin(owning('legacy-staff-03'), baseContent, 'staff', 'legacy-staff-03');
    if (!r.ok) throw new Error(r.reason);
    expect(weaponSkinArt(r.state, baseContent, 'staff')).toBe('skin-staff-03');
    for (const set of baseContent.weaponSkins) {
      for (const s of set.skins) {
        expect(isWeaponSkinAvailable(freshState(), baseContent, set.weapon, s.id)).toBe(false);
      }
    }
    const scythe = owning('legacy-scythe-02');
    expect(isWeaponSkinAvailable(scythe, baseContent, 'scythe', 'legacy-scythe-02')).toBe(true);
    expect(equipWeaponSkin(freshState(), baseContent, 'scythe', 'legacy-scythe-02')).toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });

  it('has no unskinned art for a generic item type: null until a skin is worn', () => {
    expect(weaponSkinArt(freshState(), baseContent, 'staff')).toBeNull();
    expect(weaponSkinArt(freshState(), baseContent, 'scythe')).toBeNull();
  });

  it('lists the choices with legacy, rarity, owned and available', () => {
    const state = owning('legacy-hammer-02');
    const choices = weaponSkinChoices(state, baseContent, 'hammer');
    expect(choices.map((c) => [c.id, c.legacy, c.rarity, c.owned, c.available])).toEqual([
      ['legacy-hammer-01', true, 'mythic', false, false],
      ['legacy-hammer-02', true, 'void', true, true],
    ]);
    const scythes = weaponSkinChoices(state, baseContent, 'scythe');
    expect(scythes).toHaveLength(13);
    expect(scythes.every((c) => c.legacy && c.rarity === 'void' && !c.owned && !c.available)).toBe(
      true,
    );
  });

  it('keeps an owned worn skin through save and load, and drops unowned or unknown ones', () => {
    const owned = owning('legacy-staff-03');
    const r = equipWeaponSkin(owned, baseContent, 'staff', 'legacy-staff-03');
    if (!r.ok) throw new Error(r.reason);
    const loaded = readSave(createSaveText(r.state, 1), baseContent).state;
    expect(loaded.legacySkins).toEqual(['legacy-staff-03']);
    expect(loaded.weaponSkins['staff']).toBe('legacy-staff-03');
    const text = JSON.parse(createSaveText(r.state, 1));
    text.state.legacySkins = ['nope', 'legacy-staff-03', 'legacy-staff-03'];
    text.state.weaponSkins = { scythe: 'legacy-scythe-02', soul_reaper: 'skin-01' };
    const l2 = readSave(JSON.stringify(text), baseContent).state;
    expect(l2.legacySkins).toEqual(['legacy-staff-03']);
    expect(l2.weaponSkins).toEqual({});
  });
});

describe('legacyWeaponArt (what a card draws)', () => {
  const wear = (kind: string, skin: string): GameState => {
    const r = equipWeaponSkin(owning(skin), baseContent, kind, skin);
    if (!r.ok) throw new Error(r.reason);
    return r.state;
  };
  const worn = (): GameState => wear('staff', 'legacy-staff-03');

  it('is null when nothing is worn', () => {
    expect(legacyWeaponArt(freshState(), baseContent, 'staff', 'bronze')).toBeNull();
  });

  it('applies at every tier below Heirloom, not at the Heirloom', () => {
    for (const tier of ['wood', 'bronze', 'silver', 'gold', 'prismatic', 'mythic'] as const) {
      expect(legacyWeaponArt(worn(), baseContent, 'staff', tier)).toBe('skin-staff-03');
    }
    expect(legacyWeaponArt(worn(), baseContent, 'staff', 'heirloom')).toBeNull();
  });

  it('a worn hammer skin shows at every tier of the hammer, none at the heirloom tier', () => {
    const state = wear('hammer', 'legacy-hammer-01');
    expect(legacyWeaponArt(state, baseContent, 'hammer', 'wood')).toBe('item-maul-exotic');
    expect(legacyWeaponArt(state, baseContent, 'hammer', 'mythic')).toBe('item-maul-exotic');
    expect(legacyWeaponArt(state, baseContent, 'hammer', 'heirloom')).toBeNull();
  });

  it('is null for another item type, and when the worn skin is not owned', () => {
    expect(legacyWeaponArt(worn(), baseContent, 'bow', 'bronze')).toBeNull();
    expect(legacyWeaponArt(worn(), baseContent, 'scythe', 'bronze')).toBeNull();
    const state = worn();
    state.legacySkins = [];
    expect(legacyWeaponArt(state, baseContent, 'staff', 'bronze')).toBeNull();
  });
});

describe('Legacy Gate pulls', () => {
  it('is pullable now that the gate is open', () => {
    expect(pull(withGlamour(100), baseContent, GATE, 1, constantRng(0)).ok).toBe(true);
  });

  it('a new skin becomes owned and is marked new', () => {
    const out = pull(withGlamour(10), content, GATE, 1, constantRng(0));
    if (!out.ok) throw new Error(out.reason);
    expect(out.results[0]!.gain).toEqual({ kind: 'new' });
    expect(out.state.legacySkins).toEqual([out.results[0]!.itemId]);
    expect(out.state.resources['glamour_scroll']!.toNumber()).toBe(0);
  });

  it('a duplicate pays back 20% of a single pull in Glamour Scrolls and owns it once', () => {
    const first = pull(withGlamour(20), content, GATE, 1, constantRng(0));
    if (!first.ok) throw new Error(first.reason);
    const id = first.results[0]!.itemId;
    const second = pull(first.state, content, GATE, 1, constantRng(0));
    if (!second.ok) throw new Error(second.reason);
    expect(second.results[0]!.itemId).toBe(id);
    const gain = second.results[0]!.gain;
    expect(gain.kind).toBe('payback');
    if (gain.kind !== 'payback') return;
    expect(gain.resource).toBe('glamour_scroll');
    expect(gain.amount.toNumber()).toBe(2 * CRYSTAL_UNIT);
    expect(second.state.legacySkins).toEqual([id]);
    expect(second.state.resources['glamour_scroll']!.toNumber()).toBe(2 * CRYSTAL_UNIT);
  });

  it('a ten-pull of one skin is one new and nine paybacks', () => {
    const out = pull(withGlamour(100), content, GATE, 10, constantRng(0));
    if (!out.ok) throw new Error(out.reason);
    expect(out.results.map((r) => r.gain.kind)).toEqual(['new', ...Array(9).fill('payback')]);
    expect(out.state.resources['glamour_scroll']!.toNumber()).toBeCloseTo(18 * CRYSTAL_UNIT, 9);
  });

  it('counts pity on its own portal', () => {
    const s = withGlamour(20);
    s.portals['wardrobe_gate'] = { pity: 50, pulls: 50, pityHits: 0 };
    const out = pull(s, content, GATE, 1, constantRng(0.99));
    if (!out.ok) throw new Error(out.reason);
    expect(out.state.portals[GATE]!.pulls).toBe(1);
    expect(out.state.portals['wardrobe_gate']!.pity).toBe(50);
    const info = portalInfo(out.state, content, GATE)!;
    expect(info.pity.threshold).toBe(90);
  });

  it('lists every skin in the odds at its own rarity', () => {
    const info = portalInfo(freshState(), content, GATE)!;
    const staffOdds = info.rates.byItem.filter((i) => i.itemId.startsWith('legacy-staff-'));
    expect(info.rates.byItem).toHaveLength(27);
    expect(staffOdds.map((i) => [i.itemId, i.rarity]).sort()).toEqual([
      ['legacy-staff-03', 'void'],
    ]);
  });
});

describe('v20 -> v21 (owned legacy skins)', () => {
  const step = MIGRATIONS[20]!;

  it('has the v20 step in the migration chain', () => {
    expect(CURRENT_SAVE_VERSION).toBeGreaterThanOrEqual(21);
  });

  it('adds an empty legacySkins and keeps the rest', () => {
    const out = step({ prestigeCount: 3, weaponSkins: { x: 'y' } }) as Record<string, unknown>;
    expect(out['legacySkins']).toEqual([]);
    expect(out['prestigeCount']).toBe(3);
    expect(out['weaponSkins']).toEqual({ x: 'y' });
  });

  it('turns a whole v20 save into a state owning nothing', () => {
    const v20 = JSON.parse(createSaveText(freshState(), 1));
    delete v20.state.legacySkins;
    v20.version = 20;
    expect(readSave(JSON.stringify(v20), baseContent).state.legacySkins).toEqual([]);
  });
});

describe('legacy bow skins content', () => {
  const set = baseContent.weaponSkinsByWeapon.get('bow')!;
  const gate = baseContent.allPortals.find((p) => p.id === GATE)!;
  const BOWS = [
    ['legacy-bow-56', 'item-bow-rare', 'rare'],
    ['legacy-bow-57', 'item-bow-mythic', 'mythic'],
    ['legacy-bow-58', 'item-bow-epic-0-red', 'epic'],
    ['legacy-bow-59', 'item-bow-mythic-6-red', 'mythic'],
    ['legacy-bow-01', 'skin-bow-01', 'epic'],
    ['legacy-bow-30', 'skin-bow-30', 'mythic'],
    ['legacy-bow-31', 'skin-bow-31', 'mythic'],
    ['legacy-bow-34', 'skin-bow-34', 'mythic'],
    ['legacy-bow-36', 'skin-bow-36', 'mythic'],
    ['legacy-bow-17', 'skin-bow-17', 'mythic'],
  ];

  it('lists 10 distinct legacy bow skins at their rarity', () => {
    expect(set.baseArt).toBeUndefined();
    expect(set.skins.map((s) => [s.id, s.art, s.rarity])).toEqual(BOWS);
    expect(set.skins.every((s) => s.legacy === true)).toBe(true);
    expect(new Set(set.skins.map((s) => s.name)).size).toBe(10);
  });

  it('puts every bow skin in the Legacy Gate pool at its rarity', () => {
    for (const s of set.skins) {
      expect(gate.pool.find((p) => p.itemId === s.id)!.rarity).toBe(s.rarity);
    }
  });
});

describe('legacy scythe skins content', () => {
  const set = baseContent.weaponSkinsByWeapon.get('scythe')!;
  const gate = baseContent.allPortals.find((p) => p.id === GATE)!;

  it('lists 13 Void scythe skins, the Soul Reaper first with its own art', () => {
    expect(set.baseArt).toBeUndefined();
    expect(set.skins).toHaveLength(13);
    expect(set.skins[0]).toMatchObject({
      id: 'legacy-scythe-01',
      name: 'Soul Reaper',
      art: 'evo-soul_reaper-0-base',
      rarity: 'void',
      legacy: true,
    });
    expect(set.skins.slice(1).map((s) => s.art)).toEqual(
      Array.from({ length: 12 }, (_, i) => `skin-scythe-${String(i + 1).padStart(2, '0')}`),
    );
    expect(set.skins.every((s) => s.rarity === 'void')).toBe(true);
  });

  it('pools all 27 legacy skins in the Legacy Gate with the documented rarity counts', () => {
    expect(gate.pool).toHaveLength(27);
    const counts: Record<string, number> = {};
    for (const p of gate.pool) counts[p.rarity] = (counts[p.rarity] ?? 0) + 1;
    expect(counts).toEqual({ rare: 1, epic: 2, mythic: 9, void: 15 });
    const skinIds = baseContent.weaponSkins.flatMap((w) => w.skins.map((s) => s.id)).sort();
    expect(gate.pool.map((p) => p.itemId).sort()).toEqual(skinIds);
  });
});
