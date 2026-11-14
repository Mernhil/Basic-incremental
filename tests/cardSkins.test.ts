import { describe, expect, it } from 'vitest';
import {
  MIGRATIONS,
  createSaveText,
  cardSkinChoices,
  newOwnedCard,
  readSave,
  resolveCardSkin,
  setCardSkin,
  type GameState,
} from '../src/game';
import { content, freshState } from './helpers';

const own = (state: GameState, ...ids: string[]): GameState => {
  for (const id of ids) state.cards.owned[id] = newOwnedCard();
  return state;
};
// two sword cards with their own weapon, a plain sword card, an Heirloom sword and a bow card
const JADE = 'jade_vanguard';
const VIOLET = 'violet_herald';
const PLAIN = 'ember_squire';
const BOW = content.cards.find((c) => c.item.kind === 'bow' && !c.heirloom && !c.heirloomArt)!.id;
const SWORD_HEIRLOOM = content.cards.find((c) => c.heirloom && c.item.kind === 'sword')!.id;

describe('card skins: what a card may wear', () => {
  it('lists the own weapons of the same type, locked until the card is owned', () => {
    const state = own(freshState(), PLAIN);
    const jade = cardSkinChoices(state, content, PLAIN).find((c) => c.id === `card:${JADE}`)!;
    expect(jade).toMatchObject({ kind: 'card', name: 'Frostjade', available: false });
    own(state, JADE);
    expect(
      cardSkinChoices(state, content, PLAIN).find((c) => c.id === `card:${JADE}`)!.available,
    ).toBe(true);
  });

  it('owning is enough: the card need not be at Mythic', () => {
    const state = own(freshState(), PLAIN, JADE);
    expect(state.cards.owned[JADE]!.tier).toBe('wood');
    expect(setCardSkin(state, content, PLAIN, `card:${JADE}`).ok).toBe(true);
  });

  it('never offers a card its own picture, another type, or an Heirloom', () => {
    const state = own(freshState(), JADE, VIOLET, PLAIN);
    const ids = cardSkinChoices(state, content, JADE).map((c) => c.id);
    expect(ids).not.toContain(`card:${JADE}`);
    expect(ids).toContain(`card:${VIOLET}`);
    for (const c of content.cards.filter((c) => c.item.kind !== 'sword')) {
      expect(ids).not.toContain(`card:${c.id}`);
    }
    const fromHeirloom = ids.some(
      (id) => id.startsWith('card:') && content.cardById.get(id.slice(5))!.heirloom,
    );
    expect(fromHeirloom).toBe(false);
  });

  it('gives Heirloom cards no picker and refuses to set one', () => {
    const state = own(freshState(), SWORD_HEIRLOOM, JADE);
    expect(cardSkinChoices(state, content, SWORD_HEIRLOOM)).toEqual([]);
    expect(setCardSkin(state, content, SWORD_HEIRLOOM, `card:${JADE}`)).toEqual({
      ok: false,
      reason: 'unknown-card',
    });
  });

  it('offers owned legacy skins of the type only', () => {
    const state = own(freshState(), PLAIN, BOW);
    state.legacySkins = ['legacy-sword-01'];
    const sword = cardSkinChoices(state, content, PLAIN).find((c) => c.id === 'legacy-sword-01')!;
    expect(sword.available).toBe(true);
    const onBow = cardSkinChoices(state, content, BOW).some((c) => c.id === 'legacy-sword-01');
    expect(onBow).toBe(false);
  });
});

describe('card skins: choosing per card', () => {
  it('sets and clears one card without touching another', () => {
    const state = own(freshState(), PLAIN, JADE, VIOLET);
    const r = setCardSkin(state, content, PLAIN, `card:${VIOLET}`);
    if (!r.ok) throw new Error(r.reason);
    expect(resolveCardSkin(r.state, content, PLAIN)).toEqual({
      kind: 'card',
      id: `card:${VIOLET}`,
      sourceCardId: VIOLET,
    });
    expect(resolveCardSkin(r.state, content, JADE)).toBeNull();
    expect(state.cardSkins).toEqual({});
    const back = setCardSkin(r.state, content, PLAIN, null);
    if (!back.ok) throw new Error(back.reason);
    expect(back.state.cardSkins).toEqual({});
  });

  it('a card with its own weapon can wear another skin, and stays a skin for others', () => {
    const state = own(freshState(), PLAIN, JADE, VIOLET);
    const r = setCardSkin(state, content, JADE, `card:${VIOLET}`);
    if (!r.ok) throw new Error(r.reason);
    expect(resolveCardSkin(r.state, content, JADE)?.id).toBe(`card:${VIOLET}`);
    const forPlain = cardSkinChoices(r.state, content, PLAIN).find((c) => c.id === `card:${JADE}`);
    expect(forPlain!.available).toBe(true);
  });

  it('refuses locked, unknown and not-owned', () => {
    const state = own(freshState(), PLAIN);
    expect(setCardSkin(state, content, PLAIN, `card:${JADE}`)).toEqual({
      ok: false,
      reason: 'unavailable',
    });
    expect(setCardSkin(state, content, PLAIN, 'nope')).toEqual({
      ok: false,
      reason: 'unknown-skin',
    });
    expect(setCardSkin(state, content, VIOLET, null)).toEqual({ ok: false, reason: 'not-owned' });
  });

  it('shows nothing when the skin can no longer be worn', () => {
    const state = own(freshState(), PLAIN);
    state.cardSkins[PLAIN] = `card:${JADE}`;
    expect(resolveCardSkin(state, content, PLAIN)).toBeNull();
  });

  it('keeps the choice through save and load, and drops one that is not wearable', () => {
    const state = own(freshState(), PLAIN, JADE);
    const r = setCardSkin(state, content, PLAIN, `card:${JADE}`);
    if (!r.ok) throw new Error(r.reason);
    expect(readSave(createSaveText(r.state, 1), content).state.cardSkins).toEqual({
      [PLAIN]: `card:${JADE}`,
    });
    const json = JSON.parse(createSaveText(r.state, 1));
    json.state.cardSkins = { [PLAIN]: 'legacy-sword-01', [VIOLET]: `card:${JADE}`, gone: 'x' };
    expect(readSave(JSON.stringify(json), content).state.cardSkins).toEqual({});
  });
});

describe('v32 -> v33 (the per-type skin becomes a choice per card)', () => {
  const step = MIGRATIONS[32]!;
  it('copies the type choice onto every owned card of the type, and drops it', () => {
    const out = step({
      weaponSkins: { sword: 'legacy-sword-01', bow: 'legacy-bow-01' },
      cards: { owned: { [PLAIN]: {}, [JADE]: {}, [BOW]: {} } },
      prestigeCount: 3,
    });
    expect(out['weaponSkins']).toBeUndefined();
    expect(out['cardSkins']).toEqual({
      [PLAIN]: 'legacy-sword-01',
      [JADE]: 'legacy-sword-01',
      [BOW]: 'legacy-bow-01',
    });
    expect(out['prestigeCount']).toBe(3);
  });
  it('a save with no skin chosen gets an empty choice', () => {
    expect(step({ weaponSkins: {}, cards: { owned: { [PLAIN]: {} } } })['cardSkins']).toEqual({});
    expect(step({})['cardSkins']).toEqual({});
  });
  it('a type with no owned cards loses its choice; Heirlooms never take one', () => {
    const out = step({
      weaponSkins: { scythe: 'legacy-scythe-01', sword: 'legacy-sword-01' },
      cards: { owned: { [SWORD_HEIRLOOM]: {} } },
    });
    expect(out['cardSkins']).toEqual({});
  });
  it('does not mutate its input', () => {
    const input = { weaponSkins: { sword: 'a' }, cards: { owned: { [PLAIN]: {} } } };
    const copy = structuredClone(input);
    step(input);
    expect(input).toEqual(copy);
  });
  it('a whole v32 save loads with every card looking as before', () => {
    const state = own(freshState(), PLAIN, JADE);
    state.legacySkins = ['legacy-sword-01'];
    const json = JSON.parse(createSaveText(state, 1));
    json.version = 32;
    delete json.state.cardSkins;
    json.state.weaponSkins = { sword: 'legacy-sword-01' };
    const loaded = readSave(JSON.stringify(json), content).state;
    expect(loaded.cardSkins).toEqual({ [PLAIN]: 'legacy-sword-01', [JADE]: 'legacy-sword-01' });
  });
});
