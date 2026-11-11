import { describe, expect, it } from 'vitest';
import {
  collectModifiers,
  cosmeticLadder,
  cosmeticSource,
  Decimal,
  equipCosmetic,
  grantCosmetic,
  resolveCardFor,
  resolveCard,
  wardrobeItems,
  type GameState,
} from '../src/game';
import {
  buffBreakdown,
  buffText,
  defaultPreview,
  itemDetail,
  itemTiles,
  previewChoices,
  setViews,
  slotViews,
  sourceText,
  tryOnLoadout,
  upgradeMetal,
  upgradeToast,
} from '../src/renderer/src/pages/wardrobeModel';
import { content, freshState } from './helpers';

const item = (state: GameState, id: string) =>
  wardrobeItems(state, content).find((i) => i.cosmetic.id === id)!;
const detail = (state: GameState, id: string, card: string | null) => {
  const i = item(state, id);
  return itemDetail(i, state, content, cosmeticLadder(content, i.cosmetic), card);
};

function withCard(state: GameState, id: string, tier: 'bronze' | 'gold' | 'prismatic', stars = 1) {
  state.cards.owned[id] = { ...state.cards.owned[id]!, tier, stars };
  return state;
}

function ownCard(state: GameState, id: string): GameState {
  const any = Object.values(state.cards.owned)[0]!;
  state.cards.owned[id] = { ...any, tier: 'bronze', stars: 1 };
  return state;
}

describe('wardrobe slots', () => {
  it('lists the eleven slots with the starter set on a new game', () => {
    const s = freshState();
    const card = defaultPreview(s, content);
    const slots = slotViews(s, content, card, card ? resolveCardFor(s, content, card) : null);
    expect(slots.map((x) => x.label)).toEqual([
      'Border',
      'Finish',
      'Attack',
      'Tick',
      'Numbers',
      'Table',
      'Cursor',
      'Starlight coin',
      'Stickers',
      'Skill nodes',
      'Wardrobe style',
    ]);
    expect(slots[0]).toMatchObject({ name: 'Knight Plate', level: 1, blocked: null });
  });

  it('says from which rank a chosen border is worn', () => {
    let s = freshState();
    grantCosmetic(s, 'gilded_plate');
    s = (equipCosmetic(s, content, 'gilded_plate') as { state: GameState }).state;
    const card = defaultPreview(s, content)!;
    const slots = slotViews(s, content, card, resolveCardFor(s, content, card));
    expect(slots[0]!.blocked).toBe('Gilded Plate is wearable from Gold ★1');
    withCard(s, card, 'gold');
    const worn = slotViews(s, content, card, resolveCardFor(s, content, card));
    expect(worn[0]).toMatchObject({ name: 'Gilded Plate', blocked: null });
  });
});

describe('wardrobe grid', () => {
  it('filters by slot and puts owned items first', () => {
    const s = freshState();
    grantCosmetic(s, 'holo_hex');
    const tiles = itemTiles(wardrobeItems(s, content), content, 'finish', null);
    expect(tiles.every((x) => x.slot === 'finish')).toBe(true);
    // owned first (rarest first), then the rest
    expect(tiles.slice(0, 2).map((x) => x.id)).toEqual(['holo_hex', 'gn_finish']);
    expect(tiles.at(-1)!.levelText).toBe('Not owned');
    expect(tiles[0]!.levelText).toBe('Lv 1/3');
  });

  it('marks what is equipped and what can be upgraded', () => {
    const s = freshState();
    grantCosmetic(s, 'holo_hex');
    grantCosmetic(s, 'holo_hex');
    s.resources['glimmer_dust'] = new Decimal(1e6);
    const tile = itemTiles(wardrobeItems(s, content), content, 'all', null).find(
      (x) => x.id === 'holo_hex',
    )!;
    expect(tile).toMatchObject({ copies: 1, upgradable: true, equipped: false });
    expect(tile.aria).toContain('Ready to upgrade');
    const starter = itemTiles(wardrobeItems(s, content), content, 'all', null)[0]!;
    expect(starter.equipped).toBe(true);
  });
});

describe('selected item', () => {
  it('shows the level ladder and the next upgrade checklist', () => {
    const s = freshState();
    grantCosmetic(s, 'gilded_filigree');
    grantCosmetic(s, 'gilded_filigree');
    const d = detail(s, 'gilded_filigree', null);
    expect(d.ladder.map((r) => `${r.level}:${r.step}:${r.state}`)).toEqual([
      '1:shape:done',
      '2:accent:next',
      '3:gems:locked',
      '4:ambient:locked',
    ]);
    expect(d.upgrade!.title).toBe('Level 2: Accent colour');
    expect(d.upgrade!.requirements.map((r) => r.label)).toEqual(['Copies', 'Glimmer Dust']);
    expect(d.upgrade!.requirements[0]!.met).toBe(true);
    expect(d.upgrade!.action).toBe('Upgrade');
    expect(d.upgrade!.price).toBe('1 copy, 800 Glimmer Dust');
    expect(d.upgrade!.missing).toEqual(['800 Glimmer Dust']);
    expect(d.nextStep).toBe('Accent colour');
    expect(d.subtitle).toMatch(/^Border · /);
    expect(d.upgrade!.ready).toBe(false);
  });

  it('notes the max level instead of an upgrade', () => {
    const s = freshState();
    grantCosmetic(s, 'holo_hex');
    s.cosmetics.owned['holo_hex'] = { level: 3, copies: 0 };
    const d = detail(s, 'holo_hex', null);
    expect(d.upgrade).toBeNull();
    expect(d.maxedNote).toBe('Max level 3 reached.');
  });

  it('offers equipping globally or on the preview card, and names the owned buff', () => {
    const s = freshState();
    grantCosmetic(s, 'gilded_plate');
    const card = defaultPreview(s, content)!;
    const d = detail(s, 'gilded_plate', card);
    expect(d.equip).toEqual({ global: 'equip', card: 'equip', note: null });
    expect(d.buffs).toEqual(['+0.5% damage']);
    expect(d.wear).toEqual({ text: 'Wearable on cards from Gold ★1', met: false });
    const unowned = detail(freshState(), 'gilded_plate', card);
    expect(unowned.equip.global).toBeNull();
    expect(unowned.equip.note).toMatch(/Not owned yet/);
  });

  it('keeps card-exclusives on their card', () => {
    const s = freshState();
    grantCosmetic(s, 'ember_crown');
    const other = defaultPreview(s, content)!;
    const d = detail(s, 'ember_crown', other);
    expect(d.equip.global).toBeNull();
    expect(d.equip.card).toBeNull();
    expect(d.equip.note).toBe('Own Dawnblade Regent to equip it.');
    expect(d.exclusive).toBe('Only for Dawnblade Regent, from Prismatic ★6');
    ownCard(s, 'dawnblade_regent');
    expect(detail(s, 'ember_crown', 'dawnblade_regent').equip.card).toBe('equip');
  });

  it('words the source of every item, including track and shop rewards', () => {
    for (const c of content.cosmetics) {
      const source = cosmeticSource(content, c.id);
      if (!source) continue;
      expect(sourceText(content, c.id, source), c.id).not.toBe('Source not known yet');
    }
    const track = content.account.rewardTrack.find((r) => r.cosmetics.length > 0);
    if (track) {
      expect(sourceText(content, track.cosmetics[0]!, 'track')).toBe(
        `Account level ${track.level} reward`,
      );
    }
    expect(sourceText(content, 'gn_border', 'shop')).toBe('Card shard shop');
  });

  it('names where an item comes from', () => {
    expect(sourceText(content, 'gn_border', 'starter')).toBe('Starter item');
    expect(sourceText(content, 'gt_border', 'portal')).toBe('Wardrobe Gate');
    expect(sourceText(content, 'gilded_filigree', 'prestige')).toBe('Ascension reward');
    const drop = content.dungeons.find((d) => content.cosmeticById.has(d.drops.rare.itemId ?? ''));
    if (drop) {
      expect(sourceText(content, drop.drops.rare.itemId!, 'dungeon')).toBe(
        `Rare drop in ${drop.name}, or the Wardrobe Gate`,
      );
    }
  });
});

describe('preview', () => {
  it('lists owned cards and tries a selected item on the preview card', () => {
    const s = freshState();
    const choices = previewChoices(s, content);
    expect(choices.length).toBeGreaterThan(0);
    const card = defaultPreview(s, content)!;
    const loadout = tryOnLoadout(s, content, 'holo_hex', card);
    expect(loadout.cards[card]?.finish?.id).toBe('holo_hex');
    expect(s.cosmetics.loadout.cards[card]).toBeUndefined();
    const global = tryOnLoadout(s, content, 'gt_table', card);
    expect(global.slots.table?.id).toBe('gt_table');
    // an exclusive on the wrong card cannot be tried on
    expect(tryOnLoadout(s, content, 'ember_crown', card)).toBe(s.cosmetics.loadout);
  });

  it('shows a max-level border with its level on the card theme', () => {
    const s = freshState();
    const card = defaultPreview(s, content)!;
    withCard(s, card, 'gold');
    grantCosmetic(s, 'gilded_filigree');
    s.cosmetics.owned['gilded_filigree'] = { level: 4, copies: 0 };
    const loadout = tryOnLoadout(s, content, 'gilded_filigree', card);
    const r = resolveCard(content, loadout, {
      id: card,
      rank: { tier: 'gold', stars: 1 },
      rarity: content.cardById.get(card)!.rarity,
    });
    expect(r.slots.border.level).toBe(4);
    expect(r.recipes).toEqual(expect.arrayContaining(['filigree-1', 'filigree-2', 'filigree-3']));
  });
});

describe('sets and buffs', () => {
  it('counts set pieces and lists the missing ones', () => {
    const s = freshState();
    const [nocturne, tradition] = setViews(s, content);
    expect(nocturne).toMatchObject({ count: '7/7', complete: true, bonus: [] });
    expect(tradition).toMatchObject({ count: '0/7', complete: false });
    expect(tradition!.bonus).toEqual(['+3% damage', '+3% production']);
    expect(tradition!.missing).toHaveLength(7);
  });

  it('breaks down every cosmetic bonus to a stat', () => {
    const s = freshState();
    grantCosmetic(s, 'gilded_plate');
    grantCosmetic(s, 'gilded_filigree');
    const b = buffBreakdown(content, collectModifiers(s, content), 'combat.damage');
    expect(b.rows).toEqual([
      ['Gilded Plate', '+0.5%'],
      ['Gilded Filigree', '+1%'],
    ]);
    expect(b.total).toEqual(['Total', '+1.5%']);
  });

  it('formats buffs and upgrade moments', () => {
    expect(buffText({ stat: 'production.rate', kind: 'percent', value: new Decimal(1) })).toBe(
      '+1% production',
    );
    expect(upgradeToast('Aurora Veil', 4, 'ambient', true).detail).toMatch(/Max level/);
    expect(upgradeMetal('ambient', true)).toBe('prismatic');
    expect(upgradeMetal('accent', false)).toBe('silver');
  });
});
