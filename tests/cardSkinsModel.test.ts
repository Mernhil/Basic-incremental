import { describe, expect, it } from 'vitest';
import { newOwnedCard, setCardSkin } from '../src/game';
import {
  cardSkinsSignature,
  skinCards,
  skinPickerView,
} from '../src/renderer/src/pages/cardSkinsModel';
import { content, freshState } from './helpers';

const own = (...ids: string[]) => {
  const s = freshState();
  for (const id of ids) s.cards.owned[id] = newOwnedCard();
  return s;
};

describe('card skin picker model', () => {
  it('has no picker for a card that is not owned or an Heirloom', () => {
    expect(skinPickerView(freshState(), content, 'violet_herald')).toBeNull();
    const heirloom = content.cards.find((c) => c.heirloom)!.id;
    expect(skinPickerView(own(heirloom), content, heirloom)).toBeNull();
  });

  it('lists Original, owned skins, then locked card skins greyed with "Own <card> to unlock"', () => {
    const state = own('ember_squire', 'jade_vanguard');
    const v = skinPickerView(state, content, 'ember_squire')!;
    expect(v.tiles[0]).toMatchObject({ id: null, kind: 'original', worn: true });
    expect(v.tiles[1]).toMatchObject({
      id: 'card:jade_vanguard',
      name: 'Frostjade',
      locked: false,
    });
    const locked = v.tiles.filter((t) => t.locked);
    expect(locked.length).toBeGreaterThan(0);
    expect(locked.every((t) => t.lockedNote?.startsWith('Own '))).toBe(true);
    expect(v.ownedSkins).toBe(1);
  });

  it('marks the worn skin and lists a card for the Wardrobe only when it has a skin to wear', () => {
    const state = own('ember_squire', 'brass_vanguard', 'jade_vanguard');
    const r = setCardSkin(state, content, 'ember_squire', 'card:jade_vanguard');
    if (!r.ok) throw new Error(r.reason);
    const v = skinPickerView(r.state, content, 'ember_squire')!;
    expect(v.wornName).toBe('Frostjade');
    expect(skinCards(r.state, content).map((c) => c.id)).toContain('ember_squire');
    expect(skinCards(own('ember_squire'), content)).toEqual([]);
    expect(cardSkinsSignature(r.state)).not.toBe(cardSkinsSignature(state));
  });
});
