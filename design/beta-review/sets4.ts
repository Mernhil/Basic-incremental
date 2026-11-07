// Round 2 of the review gate: A13 overhauled (grows in size, drawn per stage) and A15 rebuilt on
// the decided unique evolution art from the earlier "Item Rarity and Effects" page.
import { svg } from '../../src/renderer/src/art/gems';
import { mineAt, treeAt, type GrowthLook } from './growth';
import { LADDER_NAMES, gemArt, miniCard, treeData, type OptionSet } from './lib';
import flameblade from './evo/flameblade.png';
import rootbloom from './evo/rootbloom-staff.png';
import reaper from './evo/soul-reaper.png';

const STAGE_TREE = ['Sapling', 'Young tree', 'Full canopy', 'Grand tree', 'Gem-crowned'];
const STAGE_MINE = ['Surface rock', 'Open quarry', 'Deeper shaft', 'Glowing veins', 'Crystal cavern'];

const row = (look: GrowthLook, kind: 'tree' | 'mine', id: string, gem: string): string =>
  `<div class="gstrip">${[0, 1, 2, 3, 4]
    .map(
      (s) =>
        `<span class="gcell"><span class="gt">${svg(
          kind === 'tree' ? treeAt(treeData(id), gemArt(gem), s, look) : mineAt(gemArt(gem), s, look),
          '-10 -16 120 126',
        )}</span><small>${(kind === 'tree' ? STAGE_TREE : STAGE_MINE)[s]}<i>${LADDER_NAMES[s]} · Lv ${s * 25}+</i></small></span>`,
    )
    .join('')}</div>`;

const growth = (look: GrowthLook, tree: string, tgem: string, mgem: string): string =>
  `<div class="scr col gscr">${row(look, 'tree', tree, tgem)}${row(look, 'mine', '', mgem)}</div>`;

const MOD = [0.62, 0.74, 0.86, 0.96, 1.04];
const BIG = [0.5, 0.66, 0.84, 1, 1.12];

const evoImg = (src: string, alt: string): string => `<img class="evoimg" src="${src}" alt="${alt}">`;

export const sets4: OptionSet[] = [
  {
    id: 'A13',
    title: 'Growth stages of tree and mine tiles (round 2: “grows in size”, redrawn)',
    brief:
      'Your pick A, overhauled: every stage is now drawn as its own faceted tile with the game kit, not a scaled copy. Trees: sapling → young tree → full canopy → grand tree with roots and more gems → gem-crowned. Mines: surface rock → open quarry → shaft with timber frame → glowing veins → crystal cavern. Options differ in how the metal ladder shows on the ground and how far the top stages go.',
    options: [
      {
        title: 'Metal tile sides',
        note: 'The hexagon’s side faces are cast in the stage metal; growth is moderate so the field grid stays even. Closest to the current tiles.',
        html: growth({ rim: 'sides', scale: MOD, crystal: false, ambient: 1 }, 'oak', 'oak_gem', 'copper_gem'),
      },
      {
        title: 'Metal band',
        note: 'Earth-coloured sides, a metal band around the top edge of the tile. Bigger growth range: the grand trees overhang the tile.',
        html: growth({ rim: 'band', scale: BIG, crystal: false, ambient: 1 }, 'oak', 'oak_gem', 'copper_gem'),
      },
      {
        title: 'Rising plinth',
        note: 'The tile sits on a metal plinth that gets taller every stage, so a maxed tile literally stands higher than a new one.',
        html: growth({ rim: 'plinth', scale: MOD, crystal: false, ambient: 1 }, 'ironbark', 'ironbark_gem', 'iron_gem'),
      },
      {
        title: 'Gem inlay',
        note: 'A metal rim with one inlaid gem per milestone reached (0–4), so you can count the milestones on each tile.',
        html: growth({ rim: 'inlay', scale: MOD, crystal: false, ambient: 1 }, 'oak', 'oak_gem', 'copper_gem'),
      },
      {
        title: 'Crystal turn',
        note: 'Metal sides like A, but from Grand onward the canopy and rock turn into the gem’s own crystal and glow more. Most dramatic top stages.',
        html: growth({ rim: 'sides', scale: BIG, crystal: true, ambient: 2 }, 'moonwillow', 'moonwillow_gem', 'grotto_gem'),
      },
    ],
  },
  {
    id: 'A15',
    title: 'Unique ★6 evolutions (round 2: your existing art)',
    brief:
      'Flameblade, Rootbloom Staff and Soul Reaper as already designed (captured from the earlier item page, with their own fire, wind and soul-fire effects). The art is settled, so the options are about the evolution moment and how the unique item sits in a Gold ★6 card.',
    options: [
      {
        title: 'Burn-through',
        note: 'The old item ignites from the guard up and the fire leaves the unique item behind; a gold flash fills the card frame. Each item has its own “burn”: fire, blooming roots, soul fire.',
        html: `<div class="scr stage evo2"><span class="evcard old">${miniCard('sword', 'common', 'gold', '', 92)}</span><span class="arrow">→</span><span class="evcard">${evoImg(flameblade, 'Flameblade')}</span><span class="burst2"></span><small class="cap">Ember Blade → Flameblade</small></div>`,
      },
      {
        title: 'Shatter reveal',
        note: 'The card freezes, cracks like glass along the item, and the shards blow away to reveal the unique item with a big prismatic-gold flash. Bigger than the normal ★6 flash.',
        html: `<div class="scr stage evo2"><span class="evcard cracked">${miniCard('staff', 'rare', 'gold', '', 92)}</span><span class="arrow">→</span><span class="evcard">${evoImg(rootbloom, 'Rootbloom Staff')}</span><small class="cap">Sapling staff → Rootbloom Staff</small></div>`,
      },
      {
        title: 'Silhouette tease',
        note: 'The new item appears first as a black silhouette with a light behind it, holds a beat, then floods with colour and its effect starts. Calm and readable.',
        html: `<div class="scr stage evo2"><span class="evcard sil">${evoImg(flameblade, 'Flameblade silhouette')}</span><span class="arrow">→</span><span class="evcard">${evoImg(flameblade, 'Flameblade')}</span><small class="cap">silhouette → colour + effect</small></div>`,
      },
      {
        title: 'Three-up showcase',
        note: 'The evolution opens a full-screen showcase card (name banner, element, “Unique evolution”) before it settles back into the collection. The Soul Reaper shows as “awaiting a Void fighter”.',
        html: `<div class="scr stage evo2 trio"><span class="evcard">${evoImg(flameblade, 'Flameblade')}<b>Flameblade</b></span><span class="evcard">${evoImg(rootbloom, 'Rootbloom Staff')}<b>Rootbloom</b></span><span class="evcard dim">${evoImg(reaper, 'Soul Reaper')}<b>Soul Reaper · later</b></span></div>`,
      },
      {
        title: 'Beam + frame rebuild',
        note: 'A light beam drops into the card, the Gold frame rebuilds around it with an extra crest flare, then the unique item rises into the window. Ties the moment to the frame-as-tier rule.',
        html: `<div class="scr stage evo2"><i class="beam2"></i><span class="evcard framed">${evoImg(reaper, 'Soul Reaper')}</span><small class="cap">frame rebuild + rise (shown with Soul Reaper)</small></div>`,
      },
    ],
  },
];
