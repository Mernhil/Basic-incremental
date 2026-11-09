import { describe, expect, it } from 'vitest';
import { ContentValidationError, bundledRawContent, validateContent } from '../src/data';
import {
  createSaveText,
  equipWeaponSkin,
  readSave,
  weaponSkinArt,
  weaponSkinChoices,
  weaponSkinFor,
} from '../src/game';
import { content, freshState } from './helpers';

type RawSet = { weapon: string; skins: { id: string }[] };
const rawSet = (raw: ReturnType<typeof bundledRawContent>, weapon: string): RawSet =>
  (raw.weaponSkins as RawSet[]).find((s) => s.weapon === weapon)!;

/** A state that owns every scythe legacy skin (nothing is free any more: a skin must be owned to be worn). */
function owningScythes() {
  const state = freshState();
  state.legacySkins = content.weaponSkinsByWeapon.get('scythe')!.skins.map((s) => s.id);
  return state;
}

describe('weapon skins content (weaponSkins.json)', () => {
  it('lists the thirteen legacy scythe skins, none free and none with base art', () => {
    const set = content.weaponSkinsByWeapon.get('scythe')!;
    expect(set.baseArt).toBeUndefined();
    expect(set.skins.map((s) => s.id)).toEqual(
      Array.from({ length: 13 }, (_, i) => `legacy-scythe-${String(i + 1).padStart(2, '0')}`),
    );
    expect(set.skins.map((s) => s.art)).toEqual([
      'evo-soul_reaper-0-base',
      ...Array.from({ length: 12 }, (_, i) => `skin-scythe-${String(i + 1).padStart(2, '0')}`),
    ]);
    for (const s of set.skins) {
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.legacy).toBe(true);
      expect(s.rarity).toBe('void');
    }
  });

  it('rejects duplicate skin ids within a weapon', () => {
    const raw = structuredClone(bundledRawContent());
    const scythe = rawSet(raw, 'scythe');
    scythe.skins[1]!.id = scythe.skins[0]!.id;
    expect(() => validateContent(raw)).toThrow(ContentValidationError);
    expect(() => validateContent(raw)).toThrow(/duplicate/);
  });

  it('rejects an unknown weapon', () => {
    const raw = structuredClone(bundledRawContent());
    rawSet(raw, 'scythe').weapon = 'banana';
    expect(() => validateContent(raw)).toThrow(/weaponSkins/);
  });
});

describe('equipping weapon skins', () => {
  it('starts unskinned, and an item type without base art draws nothing', () => {
    const state = freshState();
    expect(state.weaponSkins).toEqual({});
    expect(weaponSkinFor(state, 'scythe')).toBeNull();
    expect(weaponSkinArt(state, content, 'scythe')).toBeNull();
  });

  it('equips an owned skin for its item type without touching the original state', () => {
    const state = owningScythes();
    const result = equipWeaponSkin(state, content, 'scythe', 'legacy-scythe-06');
    if (!result.ok) throw new Error(result.reason);
    expect(weaponSkinFor(result.state, 'scythe')).toBe('legacy-scythe-06');
    expect(weaponSkinArt(result.state, content, 'scythe')).toBe('skin-scythe-05');
    expect(weaponSkinFor(state, 'scythe')).toBeNull();
  });

  it('does not change the cosmetic slots', () => {
    const state = owningScythes();
    const result = equipWeaponSkin(state, content, 'scythe', 'legacy-scythe-02');
    if (!result.ok) throw new Error(result.reason);
    expect(result.state.cosmetics).toEqual(state.cosmetics);
  });

  it('null goes back to the unskinned weapon', () => {
    const first = equipWeaponSkin(owningScythes(), content, 'scythe', 'legacy-scythe-03');
    if (!first.ok) throw new Error(first.reason);
    const back = equipWeaponSkin(first.state, content, 'scythe', null);
    if (!back.ok) throw new Error(back.reason);
    expect(back.state.weaponSkins).toEqual({});
  });

  it('refuses a skin that is not owned: nothing is free any more', () => {
    expect(equipWeaponSkin(freshState(), content, 'scythe', 'legacy-scythe-02')).toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });

  it('rejects an unknown skin, a skin of another item type and an item type without skins', () => {
    const state = owningScythes();
    expect(equipWeaponSkin(state, content, 'scythe', 'nope')).toEqual({
      ok: false,
      reason: 'unknown-skin',
    });
    expect(equipWeaponSkin(state, content, 'scythe', 'legacy-bow-01')).toEqual({
      ok: false,
      reason: 'unknown-skin',
    });
    expect(equipWeaponSkin(state, content, 'spear', 'legacy-scythe-02')).toEqual({
      ok: false,
      reason: 'unknown-weapon',
    });
  });

  it('lists the choices with the equipped one marked, and the owned ones available', () => {
    const first = equipWeaponSkin(owningScythes(), content, 'scythe', 'legacy-scythe-04');
    if (!first.ok) throw new Error(first.reason);
    const choices = weaponSkinChoices(first.state, content, 'scythe');
    expect(choices).toHaveLength(13);
    expect(choices.filter((c) => c.equipped).map((c) => c.id)).toEqual(['legacy-scythe-04']);
    expect(choices.every((c) => c.available)).toBe(true);
    expect(weaponSkinChoices(first.state, content, 'spear')).toEqual([]);
    const locked = weaponSkinChoices(freshState(), content, 'scythe');
    expect(locked.some((c) => c.available || c.owned)).toBe(false);
  });

  it('survives a save and load, and drops skins that no longer exist', () => {
    const equipped = equipWeaponSkin(owningScythes(), content, 'scythe', 'legacy-scythe-08');
    if (!equipped.ok) throw new Error(equipped.reason);
    const loaded = readSave(createSaveText(equipped.state, 1), content).state;
    expect(weaponSkinFor(loaded, 'scythe')).toBe('legacy-scythe-08');
    const text = JSON.parse(createSaveText(equipped.state, 1));
    text.state.weaponSkins = { scythe: 'gone', banana: 'legacy-scythe-02' };
    expect(readSave(JSON.stringify(text), content).state.weaponSkins).toEqual({});
  });
});
