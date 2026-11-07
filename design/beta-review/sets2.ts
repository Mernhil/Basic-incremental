import { BODY, coin, miniCard, type OptionSet } from './lib';

const btn = (t: string, hot = false): string => `<span class="btn${hot ? ' hot' : ''}">${t}</span>`;
const orb = (c: string, s = 54): string =>
  `<span class="orb" style="--c:${c};width:${s}px;height:${s}px"></span>`;
const back = (s = 44): string =>
  `<span class="cback" style="width:${s}px;height:${Math.round(s * 1.41)}px"></span>`;
const slots = ['Border', 'Finish', 'Attack', 'Tick', 'Numbers', 'Table', 'Cursor'];
const slotChips = (vertical: boolean): string =>
  slots
    .map((s, i) => `<span class="slot${i === 0 ? ' on' : ''}" style="${vertical ? '' : 'flex:1'}">${s}</span>`)
    .join('');
const tiles = (n: number, s = 44): string =>
  Array.from(
    { length: n },
    (_, i) =>
      `<span class="tile" style="width:${s}px;height:${s}px;--c:${Object.values(BODY)[i % 7]}"><small>L${(i % 4) + 1}</small></span>`,
  ).join('');
const node = (x: number, y: number, on: boolean, big = false): string =>
  `<span class="node${on ? ' on' : ''}${big ? ' big' : ''}" style="left:${x}%;top:${y}%"></span>`;
const ach = (n: string, on: boolean): string =>
  `<span class="ach${on ? ' on' : ''}"><b>${on ? '🏆' : '🔒'}</b>${n}</span>`;

export const sets2: OptionSet[] = [
  {
    id: 'A6',
    title: 'Summon portal screen and reveal',
    brief: 'Portal swirls, an orb drops in a rarity colour (sometimes upgrading mid-reveal), then the card flips in its frame. 10-pull: a row of backs flipping one by one. Click to skip, skip all.',
    options: [
      {
        title: 'Altar portal',
        note: 'A big stone ring centre stage; orb falls into an altar, card rises and flips. 10-pull: two rows of five on the altar steps.',
        html: `<div class="scr stage col" style="gap:10px"><span class="portal" style="top:8%"></span><span style="height:70px"></span>${orb("#c070ff")}<div class="row" style="gap:6px">${btn('Pull ×1 · 10', true)}${btn('×10 · 100')}</div><small>Pity 34/90 · rates ⓘ</small></div>`,
      },
      {
        title: 'Starfall',
        note: 'Night sky; orbs fall like meteors, trail colour = rarity. The upgrade flash is a meteor splitting into a brighter one.',
        html: `<div class="scr stage sky">${orb('#4fa0ff', 30)}${orb('#ffd84a', 40)}${orb('#c070ff', 34)}<div class="abs b">${btn('Pull ×1', true)} ${btn('×10')}</div></div>`,
      },
      {
        title: 'Card-back row',
        note: 'Pulls lay out as a row of card backs that glow their rarity before flipping one by one; single pull is one big back. Fastest to read.',
        html: `<div class="scr stage col" style="gap:8px"><div class="row" style="gap:4px">${[...Array(10)].map(() => back(30)).join('')}</div><div class="row" style="gap:6px">${miniCard('sword', 'common', 'bronze', '', 46)}${miniCard('shield', 'rare', 'bronze', '', 46)}${miniCard('staff', 'rare', 'bronze', '', 46)}${back(46)}${back(46)}</div><small>click: next · ⏭ skip all</small></div>`,
      },
      {
        title: 'Vortex',
        note: 'A spiral vortex fills the screen, sucks in the sigils, spits out the orb; strongest motion and most dramatic Legendary+ moments.',
        html: `<div class="scr stage"><span class="vortex"></span>${orb('#ff7a1a', 60)}</div>`,
      },
      {
        title: 'Shelf of portals',
        note: 'Both portals side by side as cards (Card Portal | Wardrobe Gate) with pity bars; reveal opens in a modal over the shelf.',
        html: `<div class="scr row" style="gap:10px;padding:12px"><div class="pcard"><span class="portal sm"></span><b>Card Portal</b><small>Pity 34/90</small>${btn('×1', true)}${btn('×10')}</div><div class="pcard dim"><span class="portal sm ember"></span><b>Wardrobe Gate</b><small>Opens with the Wardrobe</small></div></div>`,
      },
    ],
  },
  {
    id: 'A7',
    title: 'Wardrobe screen',
    brief: 'Equip 7 slots, item grid, upgrade levels, set bonuses, rank gating and card-exclusives.',
    options: [
      {
        title: 'Mannequin card',
        note: 'A big preview card in the centre with the 7 slots around it like an equipment screen; item grid below.',
        html: `<div class="scr col"><div class="row" style="flex:6;justify-content:center;gap:8px;align-items:center"><div class="col" style="gap:3px">${slotChips(true)}</div>${miniCard('greatsword', 'legendary', 'gold', 'Preview', 100)}</div><div class="grid" style="flex:4">${tiles(12, 32)}</div></div>`,
      },
      {
        title: 'Slot tabs + grid',
        note: 'Slot tabs across the top, a dense item grid, details panel on the right with the level ladder and set bonus.',
        html: `<div class="scr col"><div class="strip">${slotChips(false)}</div><div class="row" style="flex:1"><div class="grid" style="flex:6">${tiles(18, 34)}</div><div class="side" style="flex:4"><b>Gilded Filigree</b><small>L1 shape · L2 accent · <u>L3 gems</u> · L4 glow</small>${btn('Upgrade · 2 dupes + 40 dust', true)}<small>Set 2/7 · +5% damage</small></div></div></div>`,
      },
      {
        title: 'Set boards',
        note: 'Organised by set: each set is a board with its 7 pieces, owned ones lit; equip whole sets in one click.',
        html: `<div class="scr col list"><div><b>Gilded Nocturne</b> ${tiles(7, 22)} ${btn('Equip set', true)}</div><div><b>Gilded Tradition</b> ${tiles(4, 22)} 4/7</div><div><b>Verdant Reverie</b> ${tiles(2, 22)} 2/7</div></div>`,
      },
      {
        title: 'Live table preview',
        note: 'The whole screen previews the selection: a sample arena strip with your attack, numbers and table; picker docked on the left.',
        html: `<div class="scr row"><div class="rail">${slotChips(true)}</div><div class="stage" style="flex:1">${miniCard('sword', 'epic', 'silver', '', 70)}<b class="fl" style="left:60%;top:30%;font-size:24px;color:#ffd84a">1,204</b></div></div>`,
      },
      {
        title: 'Upgrade forge',
        note: 'Focus on levelling: chosen item big on an anvil with its level ladder as steps; duplicates and materials slotted in.',
        html: `<div class="scr row"><div class="stage" style="flex:6"><span class="tile big" style="--c:#8a4ad0"></span><div class="abs b ladder"><i class="on">1</i><i class="on">2</i><i>3</i><i>4</i><i>5★</i></div></div><div class="side" style="flex:4"><small>Needs</small><b>2 duplicates</b><b>40 Glimmer Dust</b>${btn('Forge L3', true)}</div></div>`,
      },
    ],
  },
  {
    id: 'A8',
    title: 'Skill tree and card enhancement',
    brief: 'Account tree (6 branches: Logging, Mining, Combat, Summoning/Luck, Collection, Automation/Offline) with respec, and the per-card Omni-SP-style enhancement panel.',
    options: [
      {
        title: 'Radial constellation',
        note: 'Six branches radiate from a centre star; nodes are faceted gems lit in the branch colour. Enhancement: a small star chart on the card.',
        html: `<div class="scr stage tree radial">${node(50, 50, true, true)}${[0, 60, 120, 180, 240, 300].map((a) => node(50 + 30 * Math.cos((a * Math.PI) / 180), 50 + 38 * Math.sin((a * Math.PI) / 180), a < 120)).join('')}${[0, 60, 120, 180, 240, 300].map((a) => node(50 + 16 * Math.cos((a * Math.PI) / 180), 50 + 20 * Math.sin((a * Math.PI) / 180), true)).join('')}</div>`,
      },
      {
        title: 'Six columns',
        note: 'Six vertical branch columns, nodes top to bottom, cost on each; very readable. Enhancement panel: a checklist with a point budget bar.',
        html: `<div class="scr row tree" style="gap:4px;padding:8px">${['Log', 'Mine', 'Combat', 'Luck', 'Coll', 'Auto'].map((n, i) => `<div class="tcol"><small>${n}</small>${[0, 1, 2, 3].map((j) => `<span class="node rel${j < 3 - (i % 3) ? ' on' : ''}"></span>`).join('')}</div>`).join('')}</div>`,
      },
      {
        title: 'Hex board',
        note: 'Honeycomb of hex nodes (matches the hex ground tiles); branches are coloured regions; adjacency unlocks.',
        html: `<div class="scr stage"><div class="hexes">${[...Array(19)].map((_, i) => `<span class="hex${i < 7 ? ' on' : ''}"></span>`).join('')}</div></div>`,
      },
      {
        title: 'Card-first split',
        note: 'Left: account tree as a compact list; right: the selected card big with its enhancement options as slots around it (BF Omni SP feel).',
        html: `<div class="scr row"><div class="side list" style="flex:4"><div>Combat · Crit chance +1% ${btn('1 SP', true)}</div><div>Combat · Crit dmg +10%</div><div>Mining · +5% Cu</div></div><div class="stage" style="flex:6">${miniCard('sword', 'common', 'silver', 'Squire', 80)}<div class="abs b"><small>Points 4 / 6 · ◆◆◆◆◇◇</small></div></div></div>`,
      },
      {
        title: 'Skill path',
        note: 'One long horizontal scrolling path per branch (like a reward track); you buy left to right. Simplest, clear next step.',
        html: `<div class="scr col list">${['Combat', 'Mining', 'Logging'].map((b, i) => `<div><small style="width:60px;display:inline-block">${b}</small>${[...Array(8)].map((_, j) => `<span class="node rel${j < 5 - i ? ' on' : ''}"></span>`).join('<i class="lnk"></i>')}</div>`).join('')}</div>`,
      },
    ],
  },
  {
    id: 'A9',
    title: 'Prestige (Ascension) screen and confirm',
    brief: 'Shows what resets and what persists, Starlight gained, what it buys; then the confirm moment.',
    options: [
      {
        title: 'Two columns',
        note: 'Left “resets”, right “kept”, Starlight total in the middle in big type; a long-press confirm button fills up.',
        html: `<div class="scr row" style="gap:8px;padding:10px"><div class="side list" style="flex:1"><b>Resets</b><small>Plots, mine levels, gems, tile growth</small></div><div class="col" style="flex:1;align-items:center;justify-content:center"><b class="big">✦ 42</b><small>Starlight</small>${btn('Hold to ascend', true)}</div><div class="side list" style="flex:1"><b>Kept</b><small>Damage, cards, cosmetics, mastery, medals</small></div></div>`,
      },
      {
        title: 'Rising star',
        note: 'A night sky where your run becomes a star; confirm = the star rises and the screen fades to white, then dawn.',
        html: `<div class="scr stage sky"><span class="star"></span><div class="abs b">${btn('Ascend · +42 Starlight', true)}</div></div>`,
      },
      {
        title: 'Receipt',
        note: 'A tidy receipt listing every number before and after; plain, honest, quick to read. Confirm with a modal.',
        html: `<div class="scr col list"><div>Oak gems 2.1M → 0</div><div>Copper Edge Lv 61 → 61 (kept)</div><div>Oak mastery 🥈 → 🥈 (kept)</div><div><b>Starlight +42</b></div><div>${btn('Ascend', true)}</div></div>`,
      },
      {
        title: 'Shop-first',
        note: 'The screen opens on the Starlight shop; the ascend button is a single card in the corner showing gain. Planning first.',
        html: `<div class="scr row"><div class="grid" style="flex:7">${[...Array(6)].map(() => `<span class="tile" style="--c:#4a5fa0;width:60px;height:46px"><small>✦ 5</small></span>`).join('')}</div><div class="side" style="flex:3"><b>✦ 42</b>${btn('Ascend', true)}</div></div>`,
      },
      {
        title: 'Portal gate',
        note: 'A giant prismatic gate; everything that persists is drawn as items floating into it. Confirm = walk through, prismatic sweep.',
        html: `<div class="scr stage"><span class="portal gate"></span>${coin('oak_gem', 4, 30)}${miniCard('sword', 'common', 'gold', '', 40)}</div>`,
      },
    ],
  },
  {
    id: 'A10',
    title: 'Achievements page and shard shop',
    brief: 'The 25 achievements with cosmetic rewards, and the shard shop.',
    options: [
      {
        title: 'Trophy wall',
        note: 'Achievements as plaques on a wall, unlocked ones in the metal of their tier; shard shop is a side counter.',
        html: `<div class="scr row"><div class="grid" style="flex:7">${['First Kill', 'First Harvest', 'Lumberjack I', 'Giant Slayer I', 'Six Stars', 'First Summon'].map((n, i) => ach(n, i < 3)).join('')}</div><div class="side" style="flex:3"><b>Shards 34</b>${btn('Hex Lattice · 20', true)}${btn('Moss Core ×5 · 8')}</div></div>`,
      },
      {
        title: 'Progress list',
        note: 'A list with progress bars and the reward preview on the right; sorted by closest to done. Shop on its own tab.',
        html: `<div class="scr col list"><div>Lumberjack II ▮▮▮▮▯ 80% → 🎴 Verdant border</div><div>Giant Slayer II ▮▮▯▯▯ → 🎴 Ember tick</div><div>Ten Pulls ▮▯▯▯▯ → ✦ 5 sigils</div></div>`,
      },
      {
        title: 'Sticker book',
        note: 'Each achievement is a sticker slot in a book; unlocked ones get the sticker art slapped in with a bounce.',
        html: `<div class="scr stage book"><div class="grid">${[...Array(10)].map((_, i) => `<span class="stk${i < 4 ? ' on' : ''}">${i < 4 ? '★' : ''}</span>`).join('')}</div></div>`,
      },
      {
        title: 'Category chapters',
        note: 'Grouped by area (Production, Combat, Cards, Collection, Meta) with a chapter completion medal each.',
        html: `<div class="scr col list">${['Production 3/6 🥉', 'Combat 2/5', 'Cards 1/6', 'Collection 0/4', 'Meta 0/4'].map((c) => `<div>${c} ▮▮▯▯</div>`).join('')}</div>`,
      },
      {
        title: 'Shop counter',
        note: 'Shop is the hero (shard counter with rotating stock); achievements live as a compact strip on top.',
        html: `<div class="scr col"><div class="strip">🏆 7/25 · next: Ten Pulls</div><div class="grid" style="flex:1">${[...Array(6)].map((_, i) => `<span class="tile" style="--c:${Object.values(BODY)[i]};width:62px;height:62px"><small>◆ ${(i + 1) * 5}</small></span>`).join('')}</div></div>`,
      },
    ],
  },
];
