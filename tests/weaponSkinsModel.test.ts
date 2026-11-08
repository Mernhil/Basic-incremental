import { describe, expect, it } from 'vitest';
import { equipWeaponSkin } from '../src/game';
import {
  weaponOptions,
  weaponSkinsSignature,
  weaponSkinsView,
} from '../src/renderer/src/pages/weaponSkinsModel';
import { content, freshState } from './helpers';

describe('weapon skins tab model', () => {
  it('lists the Soul Reaper as the weapon', () => {
    expect(weaponOptions(content)).toEqual([{ kind: 'soul_reaper', name: expect.any(String) }]);
  });

  it('starts on Original with 13 skins plus Original, nothing to apply', () => {
    const v = weaponSkinsView(freshState(), content, {}, 'Original');
    expect(v.weapon).toBe('soul_reaper');
    expect(v.tiles).toHaveLength(14);
    expect(v.tiles[0]).toMatchObject({ id: null, name: 'Original', worn: true, picked: true });
    expect(v.previewArt).toBeNull();
    expect(v.canApply).toBe(false);
    expect(v.previewCardId).toBe('reaper_test');
    expect(v.ownsPreviewCard).toBe(false);
  });

  it('previewing a skin does not change the save and can be applied', () => {
    const state = freshState();
    const v = weaponSkinsView(state, content, { skin: 'skin-03' }, 'Original');
    expect(v.previewArt).toBe('skin-scythe-03');
    expect(v.canApply).toBe(true);
    expect(state.weaponSkins).toEqual({});
  });

  it('after equipping, the skin is worn and selected by default', () => {
    const r = equipWeaponSkin(freshState(), content, 'soul_reaper', 'skin-05');
    if (!r.ok) throw new Error('equip failed');
    const v = weaponSkinsView(r.state, content, {}, 'Original');
    expect(v.pickedId).toBe('skin-05');
    expect(v.isWorn).toBe(true);
    expect(v.canApply).toBe(false);
    expect(weaponSkinsSignature(r.state)).not.toBe(weaponSkinsSignature(freshState()));
  });

  it('an unknown skin falls back to Original', () => {
    const v = weaponSkinsView(freshState(), content, { skin: 'nope' }, 'Original');
    expect(v.pickedId).toBeNull();
  });
});
