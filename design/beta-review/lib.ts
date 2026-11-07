// Shared helpers for the beta review page. Uses the game's real art so mockups look like the game.
import { loadContent, type Rarity } from '../../src/data';
import { bossArt, type BossArt } from '../../src/renderer/src/art/bosses';
import { gemCoin, mineTile, treeTile, svg, METALS, type Metal } from '../../src/renderer/src/art/gems';
import { itemArt, ITEM_VIEWBOX } from '../../src/renderer/src/art/items';
import { cardFrame } from '../../src/renderer/src/art/frame';

const content = loadContent();
const res = (id: string) => content.resources.find((r) => r.id === id)!;
const tree = (id: string) => content.trees.find((t) => t.id === id)!;

export const coin = (id: string, tier: number, size = 36): string =>
  `<span class="ico" style="width:${size}px;height:${size}px">${svg(gemCoin(res(id).gem!, tier))}</span>`;
export const boss = (a: BossArt, size = 200): string =>
  `<span class="boss" style="width:${size}px;height:${size}px">${svg(bossArt(a))}</span>`;
export const treeSvg = (id: string, size = 90): string => {
  const t = tree(id);
  return `<span class="ico" style="width:${size}px;height:${size}px">${svg(treeTile(t, res(t.resource).gem!))}</span>`;
};
export const mineSvg = (gemId: string, size = 90): string =>
  `<span class="ico" style="width:${size}px;height:${size}px">${svg(mineTile(res(gemId).gem!))}</span>`;
export const item = (kind: string, rarity: Rarity, size = 120): string =>
  `<svg class="item" width="${size}" viewBox="${ITEM_VIEWBOX}">${itemArt(kind, rarity)}</svg>`;

export const BODY: Record<Rarity, string> = {
  common: '#7d8794',
  rare: '#3d78d8',
  epic: '#8a4ad0',
  legendary: '#d99a2b',
  mythic: '#ff4fa8',
  exotic: '#ff7a1a',
  void: '#1d1d24',
};

/** A small card: rarity body, item, tier frame. */
export function miniCard(
  kind: string,
  rarity: Rarity,
  tier: 'bronze' | 'silver' | 'gold' | 'prismatic' = 'bronze',
  name = '',
  w = 88,
  extra = '',
): string {
  const h = Math.round((w * 248) / 176);
  return `<div class="mc ${extra}" style="width:${w}px;height:${h}px;background:${BODY[rarity]}">
    <svg class="mc-item" viewBox="${ITEM_VIEWBOX}" style="width:100%">${itemArt(kind, rarity)}</svg>
    <svg class="mc-frame" viewBox="-30 -10 236 268">${cardFrame(tier)}</svg>
    ${name ? `<span class="mc-name">${name}</span>` : ''}</div>`;
}

export const METAL_CSS: Record<Metal, string> = {
  stone: METALS.stone[1],
  bronze: METALS.bronze[1],
  silver: METALS.silver[1],
  gold: METALS.gold[1],
  prism: '#c0a8ff',
};
export const LADDER: Metal[] = ['stone', 'bronze', 'silver', 'gold', 'prism'];
export const LADDER_NAMES = ['Stone', 'Bronze', 'Silver', 'Gold', 'Prismatic'];

export interface Option {
  title: string;
  note: string;
  html: string;
  css?: string;
}
export interface OptionSet {
  id: string;
  title: string;
  brief: string;
  options: Option[];
}

/** HP bar helper: n bars shown stacked. */
export const hpBar = (pct: number, bars: number, col = '#e8573d', h = 12): string =>
  `<div class="hp" style="height:${h}px"><i style="width:${pct}%;background:${col}"></i><b>×${bars}</b></div>`;

export const fmt = (s: string): string => s;
