import { describe, expect, it } from 'vitest';
import { equipWeaponSkin } from '../src/game';
import {
  weaponOptions,
  weaponSkinsSignature,
  weaponSkinsView,
} from '../src/renderer/src/pages/weaponSkinsModel';
import { content, freshState } from './helpers';

const owning = (...ids: string[]) => {
  const s = freshState();
  s.legacySkins = ids;
  return s;
};

describe('weapon skins tab model', () => {
  it('lists every item type with legacy skins, named by its noun', () => {
    expect(weaponOptions(content)).toEqual([
      { kind: 'sword', name: 'Sword' },
      { kind: 'hammer', name: 'Hammer' },
      { kind: 'bow', name: 'Bow' },
      { kind: 'staff', name: 'Staff' },
      { kind: 'scythe', name: 'Scythe' },
    ]);
  });

  it('starts on the first set, on Original, nothing to apply', () => {
    const v = weaponSkinsView(freshState(), content, {}, 'Original');
    expect(v.weapon).toBe('sword');
    expect(v.tiles).toHaveLength(2);
    expect(v.tiles[0]).toMatchObject({ id: null, name: 'Original', worn: true, picked: true });
    expect(v.previewArt).toBeNull();
    expect(v.canApply).toBe(false);
  });

  it('shows 13 skins plus Original for the scythe, previewed on the card carrying a scythe', () => {
    const v = weaponSkinsView(freshState(), content, { weapon: 'scythe' }, 'Original');
    expect(v.weapon).toBe('scythe');
    expect(v.tiles).toHaveLength(14);
    expect(v.previewCardId).toBe('reaper_test');
    expect(v.ownsPreviewCard).toBe(false);
  });

  it('previews a card of the type, else the first fighting card', () => {
    const sword = weaponSkinsView(freshState(), content, { weapon: 'sword' }, 'Original');
    expect(sword.previewCardId).toBe('ember_squire');
    const hammer = weaponSkinsView(freshState(), content, { weapon: 'hammer' }, 'Original');
    expect(content.cards.some((c) => c.item.kind === 'hammer')).toBe(false);
    expect(hammer.previewCardId).toBe(content.cards.find((c) => c.job === 'fighting')!.id);
  });

  it('previewing an owned skin does not change the save and can be applied', () => {
    const state = owning('legacy-scythe-04');
    const v = weaponSkinsView(
      state,
      content,
      { weapon: 'scythe', skin: 'legacy-scythe-04' },
      'Original',
    );
    expect(v.previewArt).toBe('skin-scythe-03');
    expect(v.canApply).toBe(true);
    expect(state.weaponSkins).toEqual({});
  });

  it('previewing a skin that is not owned cannot be applied', () => {
    const v = weaponSkinsView(
      freshState(),
      content,
      { weapon: 'scythe', skin: 'legacy-scythe-04' },
      'Original',
    );
    expect(v.previewArt).toBe('skin-scythe-03');
    expect(v.canApply).toBe(false);
  });

  it('after equipping, the skin is worn and selected by default', () => {
    const r = equipWeaponSkin(owning('legacy-scythe-06'), content, 'scythe', 'legacy-scythe-06');
    if (!r.ok) throw new Error('equip failed');
    const v = weaponSkinsView(r.state, content, { weapon: 'scythe' }, 'Original');
    expect(v.pickedId).toBe('legacy-scythe-06');
    expect(v.isWorn).toBe(true);
    expect(v.canApply).toBe(false);
    expect(weaponSkinsSignature(r.state)).not.toBe(weaponSkinsSignature(freshState()));
  });

  it('an unknown skin falls back to Original', () => {
    const v = weaponSkinsView(freshState(), content, { skin: 'nope' }, 'Original');
    expect(v.pickedId).toBeNull();
  });
});
