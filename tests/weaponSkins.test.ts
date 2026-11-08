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
import type { Content } from '../src/data';
import { content, freshState } from './helpers';

describe('weapon skins content (weaponSkins.json)', () => {
  it('lists twelve free skins for the Soul Reaper scythe', () => {
    const set = content.weaponSkinsByWeapon.get('soul_reaper')!;
    const skins = set.skins;
    expect(skins.map((s) => s.id)).toEqual(
      Array.from({ length: 12 }, (_, i) => `skin-${String(i + 1).padStart(2, '0')}`),
    );
    expect(skins.map((s) => s.art)).toEqual(
      Array.from({ length: 12 }, (_, i) => `skin-scythe-${String(i + 1).padStart(2, '0')}`),
    );
    expect(set.baseArt).toBe('skin-scythe-base');
    for (const s of skins) {
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.cost).toBe(0);
    }
  });

  it('rejects duplicate skin ids within a weapon', () => {
    const rawContent = structuredClone(bundledRawContent());
    const entry = rawContent.weaponSkins as { skins: { id: string }[] }[];
    entry[0]!.skins[1]!.id = entry[0]!.skins[0]!.id;
    expect(() => validateContent(rawContent)).toThrow(ContentValidationError);
    expect(() => validateContent(rawContent)).toThrow(/duplicate/);
  });

  it('rejects an unknown weapon', () => {
    const rawContent = structuredClone(bundledRawContent());
    (rawContent.weaponSkins as { weapon: string }[])[0]!.weapon = 'banana';
    expect(() => validateContent(rawContent)).toThrow(/weaponSkins/);
  });
});

describe('equipping weapon skins', () => {
  it('starts unskinned', () => {
    const state = freshState();
    expect(state.weaponSkins).toEqual({});
    expect(weaponSkinFor(state, 'soul_reaper')).toBeNull();
    expect(weaponSkinArt(state, content, 'soul_reaper')).toBe('skin-scythe-base');
  });

  it('equips a skin for its weapon without touching the original state', () => {
    const state = freshState();
    const result = equipWeaponSkin(state, content, 'soul_reaper', 'skin-05');
    if (!result.ok) throw new Error(result.reason);
    expect(weaponSkinFor(result.state, 'soul_reaper')).toBe('skin-05');
    expect(weaponSkinArt(result.state, content, 'soul_reaper')).toBe('skin-scythe-05');
    expect(weaponSkinFor(state, 'soul_reaper')).toBeNull();
  });

  it('does not change the cosmetic slots', () => {
    const state = freshState();
    const result = equipWeaponSkin(state, content, 'soul_reaper', 'skin-01');
    if (!result.ok) throw new Error(result.reason);
    expect(result.state.cosmetics).toEqual(state.cosmetics);
  });

  it('null goes back to the unskinned weapon', () => {
    const state = freshState();
    const first = equipWeaponSkin(state, content, 'soul_reaper', 'skin-02');
    if (!first.ok) throw new Error(first.reason);
    const back = equipWeaponSkin(first.state, content, 'soul_reaper', null);
    if (!back.ok) throw new Error(back.reason);
    expect(back.state.weaponSkins).toEqual({});
  });

  it('rejects a skin of another weapon, an unknown skin and a weapon without skins', () => {
    const state = freshState();
    expect(equipWeaponSkin(state, content, 'soul_reaper', 'nope')).toEqual({
      ok: false,
      reason: 'unknown-skin',
    });
    expect(equipWeaponSkin(state, content, 'sword', 'skin-01')).toEqual({
      ok: false,
      reason: 'unknown-weapon',
    });
  });

  it('rejects a skin that is not available (a priced skin, nothing sells them yet)', () => {
    const priced: Content = {
      ...content,
      weaponSkinsByWeapon: new Map([
        [
          'soul_reaper',
          {
            weapon: 'soul_reaper',
            baseArt: 'skin-scythe-base',
            skins: [{ id: 'skin-01', name: 'Pale Harvest', art: 'skin-scythe-01', cost: 5 }],
          },
        ],
      ]),
    };
    expect(equipWeaponSkin(freshState(), priced, 'soul_reaper', 'skin-01')).toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });

  it('lists the choices with the equipped one marked', () => {
    const first = equipWeaponSkin(freshState(), content, 'soul_reaper', 'skin-03');
    if (!first.ok) throw new Error(first.reason);
    const choices = weaponSkinChoices(first.state, content, 'soul_reaper');
    expect(choices).toHaveLength(12);
    expect(choices.filter((c) => c.equipped).map((c) => c.id)).toEqual(['skin-03']);
    expect(choices.every((c) => c.available)).toBe(true);
    expect(weaponSkinChoices(first.state, content, 'sword')).toEqual([]);
  });

  it('survives a save and load, and drops skins that no longer exist', () => {
    const equipped = equipWeaponSkin(freshState(), content, 'soul_reaper', 'skin-07');
    if (!equipped.ok) throw new Error(equipped.reason);
    const loaded = readSave(createSaveText(equipped.state, 1), content).state;
    expect(weaponSkinFor(loaded, 'soul_reaper')).toBe('skin-07');
    const text = JSON.parse(createSaveText(equipped.state, 1));
    text.state.weaponSkins = { soul_reaper: 'gone', banana: 'skin-01' };
    expect(readSave(JSON.stringify(text), content).state.weaponSkins).toEqual({});
  });
});
