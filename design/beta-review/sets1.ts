import { boss, coin, hpBar, item, miniCard, mineSvg, treeSvg, type OptionSet } from './lib';

const pill = (t: string, c = '#d9b04a'): string => `<i class="pill" style="--c:${c}">${t}</i>`;
const btn = (t: string, hot = false): string => `<span class="btn${hot ? ' hot' : ''}">${t}</span>`;
const readout = (a: string, b: string): string =>
  `<span class="ro"><small>${a}</small><b>${b}</b></span>`;
const floors = (vertical: boolean): string =>
  ['Mossy Cellar', 'Ember Crypt', 'Frostspire', 'Glimmer'].map(
    (n, i) =>
      `<span class="floor${i === 0 ? ' on' : ''}${i > 1 ? ' lock' : ''}" style="${vertical ? '' : 'flex:1'}">${i === 0 ? '🥉 ' : ''}${n}</span>`,
  ).join('');
const loadout = (flip = false): string =>
  `<div class="lo ${flip ? 'flip' : ''}">${miniCard('sword', 'common', 'bronze', '', 54)}${miniCard('shield', 'rare', 'bronze', '', 40)}${miniCard('twin_blades', 'epic', 'bronze', '', 40)}${miniCard('hatchet', 'common', 'bronze', '', 40)}</div>`;
const gauge = `<div class="gauge"><i style="width:62%"></i><small>BURST</small></div>`;
const mgmt = `<div class="mg"><div>${coin('copper_gem', 1, 22)} Copper Edge <b>Lv 12</b> ${btn('DPS 12 → 13 · 4 Cu', true)}</div><div>${coin('iron_gem', 2, 22)} Iron Edge <b>Lv 3</b> ${btn('DPS +40 · 80 Fe')}</div><div>${coin('grotto_gem', 3, 22)} Crystal Edge ${btn('Locked')}</div></div>`;

export const sets1: OptionSet[] = [
  {
    id: 'A1',
    title: 'Dungeons page layout',
    brief: 'Stage-first arena: boss large and centred, loadout facing it, floors compact, management below or beside.',
    options: [
      {
        title: 'Cinema + dock',
        note: 'Wide stage on top (60%), floor map as a thin tab strip, management in a 3-column dock below. Loadout bottom-left, readouts top-right.',
        html: `<div class="scr col"><div class="stage" style="flex:6">${boss('root_warden', 150)}<div class="abs tl">${hpBar(70, 5)}</div><div class="abs bl">${loadout()}${gauge}</div><div class="abs tr">${readout('DPS', '1.2k')}${readout('Kills/min', '3.1')}${readout('TTK', '19s')}</div></div><div class="strip">${floors(false)}</div><div class="dock" style="flex:3">${mgmt}</div></div>`,
      },
      {
        title: 'Left floor rail',
        note: 'Vertical floor rail with medals on the left, stage fills the rest, upgrades in a bottom bar. Reads like a world map.',
        html: `<div class="scr row"><div class="rail">${floors(true)}</div><div class="col" style="flex:1"><div class="stage" style="flex:7">${boss('root_warden', 150)}<div class="abs tl">${hpBar(70, 5)}</div><div class="abs br">${loadout(true)}</div><div class="abs tr">${readout('DPS', '1.2k')}</div></div><div class="dock" style="flex:3">${mgmt}</div></div></div>`,
      },
      {
        title: 'Right rack',
        note: 'Stage on the left (70% width), right column holds the weapon rack of three forged edges and the upgrade buttons. Floors are a dropdown chip over the stage.',
        html: `<div class="scr row"><div class="stage" style="flex:7">${boss('root_warden', 150)}<div class="abs tl">${pill('Mossy Cellar ▾')}</div><div class="abs t">${hpBar(70, 5)}</div><div class="abs bl">${loadout()}${gauge}</div></div><div class="side" style="flex:3">${mgmt}</div></div>`,
      },
      {
        title: 'Full-bleed stage',
        note: 'Stage takes the whole page; management slides up as a drawer (collapsed shows one buy button). Maximum juice, minimum menu.',
        html: `<div class="scr col"><div class="stage" style="flex:1">${boss('root_warden', 170)}<div class="abs tl">${hpBar(70, 5)}</div><div class="abs bl">${loadout()}${gauge}</div><div class="abs tr">${readout('DPS', '1.2k')}${readout('TTK', '19s')}</div><div class="abs b">${pill('⌃ Upgrades · Floors', '#8aa0d0')} ${btn('Buy ×1 · DPS 12 → 13', true)}</div></div></div>`,
      },
      {
        title: 'Duel split',
        note: 'Loadout on the left, boss on the right, facing each other across a mid-line with the burst gauge in between. Management below as one wide row.',
        html: `<div class="scr col"><div class="stage duel" style="flex:6"><div class="abs t">${hpBar(70, 5)}</div><div class="half">${loadout()}${gauge}</div><div class="half">${boss('root_warden', 140)}</div></div><div class="strip">${floors(false)}</div><div class="dock" style="flex:3">${mgmt}</div></div>`,
      },
    ],
  },
  {
    id: 'A2',
    title: 'Production page layout',
    brief: 'Stage-first field: faceted plot and slot tiles, trees that grow and hang gems, mine strikes, +n rising, coins flying.',
    options: [
      {
        title: 'Two fields stacked',
        note: 'Logging field above, mining field below, each a wide strip of tiles; upgrade lines in a side rail.',
        html: `<div class="scr row"><div class="col" style="flex:7"><div class="field">${treeSvg('oak', 70)}${treeSvg('oak', 70)}${treeSvg('ironbark', 70)}<span class="plus">+</span></div><div class="field rock">${mineSvg('copper_gem', 70)}${mineSvg('copper_gem', 70)}<span class="plus">+</span></div></div><div class="side" style="flex:3"><div class="mg"><div>Oak <b>Lv 8</b>${btn('4/s → 5/s', true)}</div><div>Plots ${btn('120 Oak')}</div><div>Copper Quarry ${btn('Lv 25: ×2')}</div></div></div></div>`,
      },
      {
        title: 'Side-by-side fields',
        note: 'Logging left, mining right, each its own framed stage with a header rate. Management under each field.',
        html: `<div class="scr row"><div class="col" style="flex:1"><div class="field" style="flex:2;flex-wrap:wrap">${treeSvg('oak', 64)}${treeSvg('oak', 64)}${treeSvg('ironbark', 64)}${treeSvg('oak', 64)}</div><div class="dock">${btn('Oak 4/s → 5/s', true)} ${btn('Plot · 120')}</div></div><div class="col" style="flex:1"><div class="field rock" style="flex:2;flex-wrap:wrap">${mineSvg('copper_gem', 64)}${mineSvg('copper_gem', 64)}${mineSvg('iron_gem', 64)}</div><div class="dock">${btn('Lv 25: ×2 · 3 left', true)} ${btn('Slot · 150')}</div></div></div>`,
      },
      {
        title: 'Isometric yard',
        note: 'One diamond-shaped yard: trees on one half, mines on the other, tiles in a tilted grid. Most scenic, least dense.',
        html: `<div class="scr col"><div class="stage" style="flex:7"><div class="iso">${treeSvg('oak', 64)}${treeSvg('ironbark', 64)}${mineSvg('copper_gem', 64)}${mineSvg('iron_gem', 64)}${treeSvg('oak', 64)}${mineSvg('copper_gem', 64)}</div></div><div class="dock" style="flex:3">${mgmt}</div></div>`,
      },
      {
        title: 'Tabbed single field',
        note: 'One big field at a time (Logging | Mining tab), tiles large with growth visible; fastest to read, one job on screen.',
        html: `<div class="scr col"><div class="strip">${pill('Logging', '#7bd26a')} ${pill('Mining', '#8aa0d0')}</div><div class="stage" style="flex:7;gap:10px">${treeSvg('oak', 100)}${treeSvg('oak', 100)}${treeSvg('ironbark', 100)}</div><div class="dock" style="flex:3">${btn('Oak 4/s → 5/s', true)} ${btn('Plot · 120')} ${btn('Ironbark · 500')}</div></div>`,
      },
      {
        title: 'Dense grid + lens',
        note: 'Compact tile grid (many plots) with a lens panel on the selected tile showing its stats and the upgrade preview.',
        html: `<div class="scr row"><div class="field" style="flex:6;flex-wrap:wrap">${[...Array(6)].map((_, i) => (i % 2 ? mineSvg('copper_gem', 50) : treeSvg('oak', 50))).join('')}</div><div class="side" style="flex:4"><div class="mg"><div>${treeSvg('oak', 40)} Oak · 4/s</div><div>${btn('4/s → 5/s · 12 Oak', true)}</div><div>Next: Lv 25 ×2 (3 away)</div></div></div></div>`,
      },
    ],
  },
  {
    id: 'A3',
    title: 'Home page role',
    brief: 'Once the arena and field live on their own pages, what is Home for?',
    options: [
      {
        title: 'Command centre',
        note: 'Three live mini-stages (fight, logging, mining) with their rates; click to jump. Goal tracker on top.',
        html: `<div class="scr col"><div class="strip">🎯 Clear Ember Crypt → Crystal Grotto ▮▮▮▯</div><div class="row" style="flex:1;gap:8px;padding:8px"><div class="stage mini">${boss('root_warden', 70)}<small>1.2k DPS</small></div><div class="stage mini">${treeSvg('oak', 70)}<small>4 Oak/s</small></div><div class="stage mini">${mineSvg('copper_gem', 70)}<small>2 Cu/s</small></div></div></div>`,
      },
      {
        title: 'Journal',
        note: 'A feed of what happened (kills, drops, harvests, milestones) plus the next goals. Calm, text-led, no live art.',
        html: `<div class="scr col list"><div>🎯 Goals: Iron Edge Lv 25 ▮▮▮▯ · Silver Squire ▮▯▯▯</div><div>⚔ Killed Root Warden ×14 · rare drop ✦ Hex Lattice</div><div>🌳 Oak mastery → 🥉 Bronze</div><div>⬆ Copper Edge Lv 25: ×2</div><div>🌙 Offline 8h: +2.1M Oak</div></div>`,
      },
      {
        title: 'Collection shelf',
        note: 'Home shows your loadouts and best cards on a shelf, with medals and the account level track. A trophy room.',
        html: `<div class="scr col"><div class="stage" style="flex:1;gap:8px">${miniCard('sword', 'common', 'silver', 'Squire', 70)}${miniCard('hatchet', 'common', 'bronze', 'Feller', 70)}${miniCard('pickaxe', 'common', 'bronze', 'Digger', 70)}</div><div class="strip">Account Lv 7 → rewards: ◆ 10 sigils at Lv 10</div></div>`,
      },
      {
        title: 'Next-actions board',
        note: 'Only things you can do right now: affordable upgrades, ready star-ups, free pulls. A to-do list that ranks by value.',
        html: `<div class="scr col list"><div>${btn('Buy Copper Edge ×10', true)} DPS +34%</div><div>${btn('Star-up Squire', true)} ★3 → ★4</div><div>${btn('Pull ×1', true)} Card Portal · 10 sigils</div><div>${btn('Plot')} 120 Oak (need 22 more)</div></div>`,
      },
      {
        title: 'Hub of both',
        note: 'Large live split view: half arena, half field, each at 40% height, with the goal tracker and account level in a thin top band.',
        html: `<div class="scr col"><div class="strip">🎯 Goals ▮▮▯ · ▮▮▮</div><div class="stage" style="flex:1">${boss('cinder_lich', 90)}${treeSvg('oak', 70)}${mineSvg('copper_gem', 70)}</div></div>`,
      },
    ],
  },
  {
    id: 'A4',
    title: 'Floating numbers and hit reactions',
    brief: 'Normal hit, crit, signature attack, boss hitting back, production gain. Numbers use the number-style cosmetic slot; sizes scale with the hit.',
    options: [
      {
        title: 'Classic RPG pop',
        note: 'White numbers rise and fade; crit is yellow, larger, with a burst star; signature is huge orange with a screen flash; boss hits are red on the card.',
        html: `<div class="scr stage fn">${boss('root_warden', 120)}<b class="fl" style="left:44%;top:30%;font-size:18px">412</b><b class="fl" style="left:56%;top:22%;font-size:30px;color:#ffd84a">1,204!</b><b class="fl" style="left:40%;top:58%;font-size:44px;color:#ff8a2a;text-shadow:0 0 16px #ff8a2a">48.2K</b><b class="fl" style="left:10%;top:70%;font-size:20px;color:#ff5a5a">-86</b><b class="fl" style="left:80%;top:78%;font-size:14px;color:#8aff9a">+4 🪙</b></div>`,
      },
      {
        title: 'Sticker numerals',
        note: 'Numbers drawn like the sticker art: thick white outline, drop shadow, slight tilt. Crit adds a starburst behind; hits bounce instead of rise.',
        html: `<div class="scr stage fn st">${boss('root_warden', 120)}<b class="fl" style="left:44%;top:30%;font-size:22px">412</b><b class="fl" style="left:56%;top:20%;font-size:34px;color:#ffd84a;rotate:-8deg">1,204!</b><b class="fl" style="left:38%;top:56%;font-size:50px;color:#ff8a2a;rotate:5deg">48.2K</b><b class="fl" style="left:8%;top:70%;font-size:22px;color:#ff5a5a">-86</b><b class="fl" style="left:78%;top:78%;font-size:16px;color:#8aff9a">+4</b></div>`,
      },
      {
        title: 'Minimal ticks',
        note: 'Small, quiet, tabular numbers that merge into a running total per second; only crits and signature attacks get big. Best for long sessions.',
        html: `<div class="scr stage fn min">${boss('root_warden', 120)}<b class="fl" style="left:48%;top:34%;font-size:13px;opacity:.7">+3.4K/s</b><b class="fl" style="left:56%;top:22%;font-size:24px;color:#ffd84a">1,204</b><b class="fl" style="left:40%;top:58%;font-size:34px;color:#fff">48.2K</b><b class="fl" style="left:8%;top:70%;font-size:14px;color:#ff7a7a">-86</b></div>`,
      },
      {
        title: 'Comic burst',
        note: 'Hits show a comic impact word with the number (POW / CRIT / BOOM) in a jagged balloon; boss hits get a red WHAM. Loud and funny.',
        html: `<div class="scr stage fn">${boss('root_warden', 120)}<b class="fl balloon" style="left:42%;top:28%;font-size:16px">POW 412</b><b class="fl balloon" style="left:55%;top:16%;font-size:22px;background:#ffd84a;color:#401">CRIT 1,204</b><b class="fl balloon" style="left:34%;top:56%;font-size:30px;background:#ff8a2a;color:#fff">BOOM 48.2K</b><b class="fl balloon" style="left:4%;top:70%;font-size:16px;background:#ff5a5a;color:#fff">WHAM -86</b></div>`,
      },
      {
        title: 'Glow digits',
        note: 'Light digits with soft glow in the element colour; the size scales smoothly with the hit relative to your average. Quiet but lively.',
        html: `<div class="scr stage fn glow">${boss('root_warden', 120)}<b class="fl" style="left:44%;top:30%;font-size:17px;color:#9ae8ff;text-shadow:0 0 8px #3ac">412</b><b class="fl" style="left:56%;top:22%;font-size:28px;color:#ffe27a;text-shadow:0 0 12px #fb3">1,204</b><b class="fl" style="left:38%;top:56%;font-size:42px;color:#ffb070;text-shadow:0 0 22px #f60">48.2K</b><b class="fl" style="left:8%;top:70%;font-size:18px;color:#ff8a8a;text-shadow:0 0 8px #f33">-86</b></div>`,
      },
    ],
  },
  {
    id: 'A5',
    title: 'Kill and drop moment',
    brief: 'Boss pop, gems flying to the header, rare drop beam.',
    options: [
      {
        title: 'Pop + arc to header',
        note: 'Boss squashes and pops into a ring; gem coins fly in curved arcs to the header counters, each landing with a pulse. Rare: a vertical beam and a toast.',
        html: `<div class="scr stage kill"><span class="burst"></span>${coin('grotto_gem', 1, 26)}${coin('oak_gem', 1, 26)}<i class="trail"></i><i class="beam"></i><span class="toast">✦ Rare drop — Hex Lattice</span><small class="hdr">header ↑ 🪙 +12</small></div>`,
      },
      {
        title: 'Loot shower',
        note: 'Drops spill from the boss with physics bounces, rest for a beat, then vacuum to the header. Rare drop slows time for a second.',
        html: `<div class="scr stage kill s2"><span class="burst"></span>${coin('oak_gem', 1, 24)}${coin('oak_gem', 1, 24)}${coin('copper_gem', 1, 24)}<span class="toast">✦ Rare drop</span></div>`,
      },
      {
        title: 'Shatter',
        note: 'The boss shatters into sticker shards that become the gems; a clean, fast, low-clutter kill. Rare drop is a gold shard with a sparkle column.',
        html: `<div class="scr stage kill s3"><span class="burst shard"></span>${coin('oak_gem', 1, 26)}<i class="beam gold"></i><span class="toast">✦ Rare drop</span></div>`,
      },
      {
        title: 'Reward chest',
        note: 'The boss drops a small chest that opens on its own; contents fan out to a tidy row, then fly up. Rare drop opens a gold chest.',
        html: `<div class="scr stage kill s4"><span class="chest">🎁</span>${coin('oak_gem', 1, 24)}${coin('grotto_gem', 1, 24)}${coin('copper_gem', 1, 24)}<span class="toast">✦ Rare drop</span></div>`,
      },
      {
        title: 'Ticker only',
        note: 'No world drops: the kill adds floating "+n" at the boss and a compact ticker row of gains under the stage. Calmest; best for very fast kills.',
        html: `<div class="scr stage kill s5"><b class="fl" style="left:44%;top:30%;font-size:18px;color:#8aff9a">+4 Moss Sigil</b><div class="strip" style="position:absolute;bottom:0;left:0;right:0">${coin('grotto_gem', 1, 20)}+4 ${coin('oak_gem', 1, 20)}+12 · 14 kills/min</div><span class="toast">✦ Rare drop</span></div>`,
      },
    ],
  },
];

void item;
