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
  it('lists only the item types with a skin the player owns, named by its noun', () => {
    // Locked legacy skins are hidden until the Legacy Gate opens (DESIGN.md §8).
    expect(weaponOptions(freshState(), content)).toEqual([]);
    expect(weaponOptions(owning('legacy-scythe-04', 'legacy-sword-01'), content)).toEqual([
      { kind: 'sword', name: 'Sword' },
      { kind: 'scythe', name: 'Scythe' },
    ]);
  });

  it('has no weapon to show when no skin is owned', () => {
    const v = weaponSkinsView(freshState(), content, {}, 'Original');
    expect(v.weapon).toBeNull();
    expect(v.tiles.map((t) => t.id)).toEqual([null]);
  });

  it('starts on the first owned set, on Original, nothing to apply', () => {
    const v = weaponSkinsView(owning('legacy-sword-01'), content, {}, 'Original');
    expect(v.weapon).toBe('sword');
    expect(v.tiles).toHaveLength(2);
    expect(v.tiles[0]).toMatchObject({ id: null, name: 'Original', worn: true, picked: true });
    expect(v.previewArt).toBeNull();
    expect(v.canApply).toBe(false);
  });

  it('shows only the owned scythe skins plus Original, previewed on the card carrying a scythe', () => {
    const state = owning('legacy-scythe-04', 'legacy-scythe-06');
    const v = weaponSkinsView(state, content, { weapon: 'scythe' }, 'Original');
    expect(v.weapon).toBe('scythe');
    expect(v.tiles.map((t) => t.id)).toEqual([null, 'legacy-scythe-04', 'legacy-scythe-06']);
    expect(v.previewCardId).toBe('reaper_test');
    expect(v.ownsPreviewCard).toBe(false);
  });

  it('previews a card of the type', () => {
    const all = owning(...content.weaponSkins.flatMap((set) => set.skins.map((s) => s.id)));
    const sword = weaponSkinsView(all, content, { weapon: 'sword' }, 'Original');
    expect(sword.previewCardId).toBe('ember_squire');
    const bow = weaponSkinsView(all, content, { weapon: 'bow' }, 'Original');
    expect(content.cardById.get(bow.previewCardId!)!.item.kind).toBe('bow');
    const hammerCard = weaponSkinsView(all, content, { weapon: 'hammer' }, 'Original');
    expect(hammerCard.previewCardId).toBe('grave_hammerer');
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

  it('a skin that is not owned is not offered: the pick falls back to Original', () => {
    const v = weaponSkinsView(
      owning('legacy-scythe-06'),
      content,
      { weapon: 'scythe', skin: 'legacy-scythe-04' },
      'Original',
    );
    expect(v.pickedId).toBeNull();
    expect(v.previewArt).toBeNull();
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
