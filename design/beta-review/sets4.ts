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


const evoImg = (src: string, alt: string): string => `<img class="evoimg" src="${src}" alt="${alt}">`;

export const sets4: OptionSet[] = [
  {
    id: 'A13',
    title: 'Growth stages: C Rising plinth, fixed',
    brief:
      'Option C (rising plinth), fixed after your notes: mines are one solid rock mass per stage, seams follow the rock’s cuts, and the top tree stage is a gem-coloured canopy instead of a floating crown. Shown for all three tiers; nothing to pick here, just a check.',
    options: [
      {
        title: 'Rising plinth (your pick, fixed)',
        note: 'Mines are now one solid faceted rock mass per stage (no gaps between blocks), gems sit in sockets, and the glowing seams run along the rock’s own facet edges instead of random lines. The top tree stage drops the floating crown: its top canopy turns into the gem’s own colours with a glow, which is what “gem-crowned” means.',
        html: growth({ rim: 'plinth', scale: MOD, crystal: false, ambient: 1 }, 'oak', 'oak_gem', 'copper_gem'),
      },
      {
        title: 'Same, Ironbark / Iron Deeps',
        note: 'The fixed stages with the tier 2 tree and mine, to check they hold up with other gems.',
        html: growth({ rim: 'plinth', scale: MOD, crystal: false, ambient: 1 }, 'ironbark', 'ironbark_gem', 'iron_gem'),
      },
      {
        title: 'Same, Moonwillow / Crystal Grotto',
        note: 'The fixed stages with the tier 3 tree and mine.',
        html: growth({ rim: 'plinth', scale: MOD, crystal: false, ambient: 1 }, 'moonwillow', 'moonwillow_gem', 'grotto_gem'),
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
