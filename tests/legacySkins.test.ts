import { describe, expect, it } from 'vitest';
import { ContentValidationError, bundledRawContent, validateContent } from '../src/data';
import type { Content } from '../src/data';
import {
  CURRENT_SAVE_VERSION,
  Decimal,
  MIGRATIONS,
  createSaveText,
  newOwnedCard,
  resolveCardSkin,
  setCardSkin,
  portalInfo,
  pull,
  readSave,
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
  bow: 7,
  staff: 1,
  scythe: 13,
};

describe('legacy skins content', () => {
  it('holds exactly the legacy skins: 24 across five item types, keyed by item type', () => {
    expect(baseContent.weaponSkins.map((w) => [w.weapon, w.skins.length])).toEqual(
      Object.entries(LEGACY_COUNTS),
    );
    const all = baseContent.weaponSkins.flatMap((w) => w.skins);
    expect(all).toHaveLength(24);
    for (const w of baseContent.weaponSkins) {
      expect(w.baseArt).toBeUndefined();
      expect(baseContent.itemTypeByKind.has(w.weapon)).toBe(true);
      expect(w.skins.every((s) => s.legacy === true && s.rarity !== undefined)).toBe(true);
    }
    expect(new Set(all.map((s) => s.id)).size).toBe(24);
    expect(new Set(all.map((s) => s.name)).size).toBe(24);
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
  it('starts owning nothing, and a card cannot wear a legacy skin it does not own', () => {
    const state = freshState();
    state.cards.owned['ember_squire'] = newOwnedCard();
    expect(state.legacySkins).toEqual([]);
    expect(setCardSkin(state, baseContent, 'ember_squire', 'legacy-sword-01')).toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });

  it('wears an owned legacy skin on one card only, at any tier, and drops it when not owned', () => {
    const state = owning('legacy-sword-01');
    state.cards.owned['ember_squire'] = newOwnedCard();
    state.cards.owned['brass_vanguard'] = newOwnedCard();
    const r = setCardSkin(state, baseContent, 'ember_squire', 'legacy-sword-01');
    if (!r.ok) throw new Error(r.reason);
    expect(resolveCardSkin(r.state, baseContent, 'ember_squire')).toEqual({
      kind: 'legacy',
      id: 'legacy-sword-01',
      art: 'evo-flameblade',
    });
    expect(resolveCardSkin(r.state, baseContent, 'brass_vanguard')).toBeNull();
    r.state.legacySkins = [];
    expect(resolveCardSkin(r.state, baseContent, 'ember_squire')).toBeNull();
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
    expect(info.rates.byItem).toHaveLength(24);
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
    ['legacy-bow-59', 'item-bow-mythic-6-red', 'mythic'],
    ['legacy-bow-01', 'skin-bow-01', 'epic'],
    ['legacy-bow-30', 'skin-bow-30', 'mythic'],
    ['legacy-bow-31', 'skin-bow-31', 'mythic'],
    ['legacy-bow-34', 'skin-bow-34', 'mythic'],
    ['legacy-bow-36', 'skin-bow-36', 'mythic'],
    ['legacy-bow-17', 'skin-bow-17', 'mythic'],
  ];

  it('lists 7 distinct legacy bow skins at their rarity', () => {
    expect(set.baseArt).toBeUndefined();
    expect(set.skins.map((s) => [s.id, s.art, s.rarity])).toEqual(BOWS);
    expect(set.skins.every((s) => s.legacy === true)).toBe(true);
    expect(new Set(set.skins.map((s) => s.name)).size).toBe(7);
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

  it('pools all 24 legacy skins in the Legacy Gate with the documented rarity counts', () => {
    expect(gate.pool).toHaveLength(24);
    const counts: Record<string, number> = {};
    for (const p of gate.pool) counts[p.rarity] = (counts[p.rarity] ?? 0) + 1;
    expect(counts).toEqual({ epic: 1, mythic: 8, void: 15 });
    const skinIds = baseContent.weaponSkins.flatMap((w) => w.skins.map((s) => s.id)).sort();
    expect(gate.pool.map((p) => p.itemId).sort()).toEqual(skinIds);
  });
});
