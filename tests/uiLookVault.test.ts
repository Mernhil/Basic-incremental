import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UI_LOOKS_VAULTED, UI_LOOK_SLOTS, VAULT_TABLE_ID, loadContent } from '../src/data';
import { createInitialState, emptyLoadout, resolveGlobal, wardrobeItems } from '../src/game';

const vaulted = loadContent({ uiLooksVaulted: true });
const open = loadContent({ uiLooksVaulted: false });

describe('the UI look vault (data/vault.ts)', () => {
  it('is on in the shipped game', () => {
    expect(UI_LOOKS_VAULTED).toBe(true);
    expect(loadContent().uiLooksVaulted).toBe(true);
  });

  it('shows Charcoal and Gold whatever table is worn, and the starter of each skin slot', () => {
    const loadout = emptyLoadout();
    loadout.slots.table = { id: 'verdant_table', level: 1 };
    loadout.slots.nodes = { id: 'nodes_c', level: 1 };
    const shown = resolveGlobal(vaulted, loadout);
    expect(shown.table.cosmetic.id).toBe(VAULT_TABLE_ID);
    expect(shown.table.visual.recipes).toEqual(['shell-gold']);
    expect(shown.nodes.cosmetic.id).toBe('nodes_a');
    // the same loadout with the vault open still wears what it was given
    const worn = resolveGlobal(open, loadout);
    expect(worn.table.cosmetic.id).toBe('verdant_table');
    expect(worn.nodes.cosmetic.id).toBe('nodes_c');
  });

  it('offers no UI look in the Wardrobe, the pulls, the shard shop or the rewards', () => {
    const slots = new Set<string>(UI_LOOK_SLOTS);
    const ids = new Set(open.cosmetics.filter((c) => slots.has(c.slot)).map((c) => c.id));
    const items = wardrobeItems(createInitialState(vaulted), vaulted);
    expect(items.some((i) => slots.has(i.cosmetic.slot))).toBe(false);
    expect(items.length).toBeGreaterThan(0); // borders and cursors stay
    expect(vaulted.allPortals.flatMap((p) => p.pool).some((e) => ids.has(e.itemId))).toBe(false);
    expect(
      vaulted.shardShop.some((i) => i.reward.kind === 'cosmetic' && ids.has(i.reward.cosmetic)),
    ).toBe(false);
    const rewarded = [
      ...vaulted.prestige.rewards.flatMap((r) => r.cosmetics),
      ...vaulted.achievements.flatMap((a) => a.reward.cosmetics),
      ...vaulted.account.rewardTrack.flatMap((r) => r.cosmetics),
    ];
    expect(rewarded.some((id) => ids.has(id))).toBe(false);
  });

  it('leaves what a save owns and wears untouched and keeps the other cosmetics on sale', () => {
    expect(vaulted.cosmeticById.has('nodes_c')).toBe(true); // ids stay known, so a save loads as it was
    const kept = open.cosmetics.filter((c) => !UI_LOOK_SLOTS.includes(c.slot) && !c.hidden);
    for (const c of kept) expect(vaulted.cosmeticById.get(c.id)!.hidden).toBe(false);
  });
});

describe('Charcoal and Gold pieces', () => {
  const dir = 'src/renderer/src/art/shell/gold';
  const pieces = JSON.parse(readFileSync(`${dir}/pieces.json`, 'utf8')) as Record<
    string,
    { w: number; h: number; corner: number; outset: number }
  >;
  const css = readFileSync('src/renderer/src/theme/shellGold.css', 'utf8');
  const size = (file: string) => {
    const b = readFileSync(file);
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  };

  it('has every PNG at the size pieces.json says, with no overhang', () => {
    for (const [name, p] of Object.entries(pieces)) {
      expect(size(`${dir}/${name}.png`), name).toEqual({ w: p.w, h: p.h });
      expect(p.outset, name).toBe(0);
    }
  });

  it('draws each piece with its own corner as the slice', () => {
    const slice = (src: string) =>
      Number(
        new RegExp(
          String.raw`gold/${src}\.png'\);
  --o-bg: [^;]+;
  --o-slice: (\d+)`,
        ).exec(css)![1],
      );
    expect(slice('sheet')).toBe(pieces.sheet!.corner);
    expect(slice('plate')).toBe(pieces.plate!.corner);
    expect(slice('tile')).toBe(pieces.tile!.corner);
    expect(slice('pill')).toBe(pieces.pill!.corner);
    expect(slice('btn')).toBe(pieces.btn!.corner);
    expect(css).toContain(
      `window.png') ${pieces.window!.corner} / calc(${pieces.window!.corner} *`,
    );
  });

  it('reads no oak picture', () => {
    expect(css).not.toContain('shell/oak/');
  });
});
