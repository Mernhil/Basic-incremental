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
import { constantRng, content as baseContent, freshState } from './helpers';

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
  base.resources['glamour_crystal'] = new Decimal(n);
  return base;
};
const owning = (...ids: string[]): GameState => {
  const s = freshState();
  s.legacySkins = ids;
  return s;
};

describe('legacy skins content', () => {
  it('lists the three staff skins in order, legacy and with their rarity', () => {
    const set = baseContent.weaponSkinsByWeapon.get('staff')!;
    expect(set.baseArt).toBeUndefined();
    expect(set.skins.map((s) => [s.id, s.art, s.rarity, s.name, s.legacy])).toEqual([
      ['legacy-staff-01', 'skin-staff-01', 'mythic', 'Solar Sceptre', true],
      ['legacy-staff-02', 'skin-staff-02', 'exotic', 'Orbit Bloom', true],
      ['legacy-staff-03', 'skin-staff-03', 'void', 'Night Herald', true],
    ]);
  });

  it('keeps the Soul Reaper test skins non-legacy', () => {
    const set = baseContent.weaponSkinsByWeapon.get('soul_reaper')!;
    expect(set.baseArt).toBe('skin-scythe-base');
    expect(set.skins.every((s) => !s.legacy && s.rarity === undefined)).toBe(true);
  });

  it('declares the Legacy Gate disabled, priced like the Wardrobe Gate', () => {
    expect(baseContent.portals.some((p) => p.id === GATE)).toBe(false);
    const gate = baseContent.allPortals.find((p) => p.id === GATE)!;
    const wardrobe = baseContent.allPortals.find((p) => p.id === 'wardrobe_gate')!;
    expect(gate.kind).toBe('skins');
    expect(gate.enabled).toBe(false);
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

  it('rejects a legacy skin without a rarity, and a skin id used twice across weapons', () => {
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
});

describe('legacy skin ownership', () => {
  it('starts owning nothing and refuses to wear a skin that is not owned', () => {
    const state = freshState();
    expect(state.legacySkins).toEqual([]);
    expect(isWeaponSkinAvailable(state, baseContent, 'staff', 'legacy-staff-01')).toBe(false);
    expect(equipWeaponSkin(state, baseContent, 'staff', 'legacy-staff-01')).toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });

  it('wears an owned legacy skin, and keeps free test skins free', () => {
    const state = owning('legacy-staff-02');
    const r = equipWeaponSkin(state, baseContent, 'staff', 'legacy-staff-02');
    if (!r.ok) throw new Error(r.reason);
    expect(weaponSkinArt(r.state, baseContent, 'staff')).toBe('skin-staff-02');
    expect(isWeaponSkinAvailable(freshState(), baseContent, 'soul_reaper', 'skin-01')).toBe(true);
  });

  it('has no unskinned art for a generic kind: null until a skin is worn', () => {
    expect(weaponSkinArt(freshState(), baseContent, 'staff')).toBeNull();
  });

  it('lists the choices with legacy, rarity, owned and available', () => {
    const state = owning('legacy-staff-03');
    const choices = weaponSkinChoices(state, baseContent, 'staff');
    expect(choices.map((c) => [c.id, c.legacy, c.rarity, c.owned, c.available])).toEqual([
      ['legacy-staff-01', true, 'mythic', false, false],
      ['legacy-staff-02', true, 'exotic', false, false],
      ['legacy-staff-03', true, 'void', true, true],
    ]);
    const reaper = weaponSkinChoices(state, baseContent, 'soul_reaper');
    expect(reaper.every((c) => !c.legacy && c.rarity === null && c.owned && c.available)).toBe(
      true,
    );
  });

  it('keeps an owned worn skin through save and load, and drops unowned or unknown ones', () => {
    const owned = owning('legacy-staff-01');
    const r = equipWeaponSkin(owned, baseContent, 'staff', 'legacy-staff-01');
    if (!r.ok) throw new Error(r.reason);
    const loaded = readSave(createSaveText(r.state, 1), baseContent).state;
    expect(loaded.legacySkins).toEqual(['legacy-staff-01']);
    expect(loaded.weaponSkins['staff']).toBe('legacy-staff-01');
    const text = JSON.parse(createSaveText(r.state, 1));
    text.state.legacySkins = ['nope', 'legacy-staff-01', 'legacy-staff-01'];
    text.state.weaponSkins = { staff: 'legacy-staff-02' };
    const l2 = readSave(JSON.stringify(text), baseContent).state;
    expect(l2.legacySkins).toEqual(['legacy-staff-01']);
    expect(l2.weaponSkins).toEqual({});
  });
});

describe('legacyWeaponArt (what a card draws)', () => {
  const worn = (): GameState => {
    const r = equipWeaponSkin(owning('legacy-staff-01'), baseContent, 'staff', 'legacy-staff-01');
    if (!r.ok) throw new Error(r.reason);
    return r.state;
  };

  it('is null when nothing is worn', () => {
    expect(legacyWeaponArt(freshState(), baseContent, 'staff', 'bronze')).toBeNull();
  });

  it('applies to every tier below Unique, not to the Unique', () => {
    for (const tier of ['bronze', 'silver', 'gold', 'prismatic'] as const) {
      expect(legacyWeaponArt(worn(), baseContent, 'staff', tier)).toBe('skin-staff-01');
    }
    expect(legacyWeaponArt(worn(), baseContent, 'staff', 'unique')).toBeNull();
  });

  it('is null for another kind, and for a non-legacy skin', () => {
    expect(legacyWeaponArt(worn(), baseContent, 'bow', 'bronze')).toBeNull();
    const r = equipWeaponSkin(freshState(), baseContent, 'soul_reaper', 'skin-01');
    if (!r.ok) throw new Error(r.reason);
    expect(legacyWeaponArt(r.state, baseContent, 'soul_reaper', 'bronze')).toBeNull();
  });
});

describe('Legacy Gate pulls', () => {
  it('is not pullable while disabled', () => {
    expect(pull(withGlamour(100), baseContent, GATE, 1, constantRng(0))).toEqual({
      ok: false,
      reason: 'unknown',
    });
  });

  it('a new skin becomes owned and is marked new', () => {
    const out = pull(withGlamour(10), content, GATE, 1, constantRng(0));
    if (!out.ok) throw new Error(out.reason);
    expect(out.results[0]!.gain).toEqual({ kind: 'new' });
    expect(out.state.legacySkins).toEqual([out.results[0]!.itemId]);
    expect(out.state.resources['glamour_crystal']!.toNumber()).toBe(0);
  });

  it('a duplicate pays back 20% of a single pull in Glamour Crystals and owns it once', () => {
    const first = pull(withGlamour(20), content, GATE, 1, constantRng(0));
    if (!first.ok) throw new Error(first.reason);
    const id = first.results[0]!.itemId;
    const second = pull(first.state, content, GATE, 1, constantRng(0));
    if (!second.ok) throw new Error(second.reason);
    expect(second.results[0]!.itemId).toBe(id);
    const gain = second.results[0]!.gain;
    expect(gain.kind).toBe('payback');
    if (gain.kind !== 'payback') return;
    expect(gain.resource).toBe('glamour_crystal');
    expect(gain.amount.toNumber()).toBe(2);
    expect(second.state.legacySkins).toEqual([id]);
    expect(second.state.resources['glamour_crystal']!.toNumber()).toBe(2);
  });

  it('a ten-pull of one skin is one new and nine paybacks', () => {
    const out = pull(withGlamour(100), content, GATE, 10, constantRng(0));
    if (!out.ok) throw new Error(out.reason);
    expect(out.results.map((r) => r.gain.kind)).toEqual(['new', ...Array(9).fill('payback')]);
    expect(out.state.resources['glamour_crystal']!.toNumber()).toBe(18);
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
    expect(info.rates.byItem.map((i) => [i.itemId, i.rarity]).sort()).toEqual([
      ['legacy-staff-01', 'mythic'],
      ['legacy-staff-02', 'exotic'],
      ['legacy-staff-03', 'void'],
    ]);
  });
});

describe('v20 -> v21 (owned legacy skins)', () => {
  const step = MIGRATIONS[20]!;

  it('bumps the save version', () => {
    expect(CURRENT_SAVE_VERSION).toBe(21);
  });

  it('adds an empty legacySkins and keeps the rest', () => {
    const out = step({ prestigeCount: 3, weaponSkins: { x: 'y' } }) as Record<string, unknown>;
    expect(out['legacySkins']).toEqual([]);
    expect(out['prestigeCount']).toBe(3);
    expect(out['weaponSkins']).toEqual({ x: 'y' });
  });

  it('turns a whole v20 save into a v21 state owning nothing', () => {
    const v20 = JSON.parse(createSaveText(freshState(), 1));
    delete v20.state.legacySkins;
    v20.version = 20;
    expect(readSave(JSON.stringify(v20), baseContent).state.legacySkins).toEqual([]);
  });
});
