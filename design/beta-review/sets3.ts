import { LADDER, LADDER_NAMES, METAL_CSS, boss, coin, item, miniCard, mineSvg, treeSvg, type OptionSet } from './lib';

const btn = (t: string, hot = false): string => `<span class="btn${hot ? ' hot' : ''}">${t}</span>`;
const M = LADDER.map((m) => METAL_CSS[m]);
const INK = '#1a1020';

// ---- A12 medal shapes ----
const medal = (style: number, i: number, s = 34): string => {
  const c = M[i]!;
  const prism = i === 4 ? 'url(#rv-prism)' : c;
  const body = [
    // ribbon medal
    `<path d="M12 2 L20 18 L28 2Z" fill="#c0392b" stroke="${INK}" stroke-width="2"/><path d="M28 2 L20 18 L36 2Z" fill="#2c6fd0" stroke="${INK}" stroke-width="2"/><circle cx="20" cy="26" r="11" fill="${prism}" stroke="${INK}" stroke-width="2.5"/><circle cx="20" cy="26" r="6" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.5"/>`,
    // shield crest
    `<path d="M6 6 H34 V20 C34 30 26 36 20 39 C14 36 6 30 6 20Z" fill="${prism}" stroke="${INK}" stroke-width="2.5"/><path d="M20 10 L26 22 L20 32 L14 22Z" fill="#fff" fill-opacity=".55"/>`,
    // laurel ring
    `<circle cx="20" cy="21" r="10" fill="${prism}" stroke="${INK}" stroke-width="2.5"/>${[...Array(6)].map((_, k) => `<ellipse cx="${20 + 15 * Math.cos(Math.PI * (0.65 + k * 0.14))}" cy="${21 + 15 * Math.sin(Math.PI * (0.65 + k * 0.14))}" rx="4" ry="2" fill="#6dbf4a" stroke="${INK}" stroke-width="1.2"/><ellipse cx="${20 - 15 * Math.cos(Math.PI * (0.65 + k * 0.14))}" cy="${21 + 15 * Math.sin(Math.PI * (0.65 + k * 0.14))}" rx="4" ry="2" fill="#6dbf4a" stroke="${INK}" stroke-width="1.2"/>`).join('')}`,
    // faceted star badge
    `<path d="M20 2 L25 14 L38 15 L28 24 L31 37 L20 30 L9 37 L12 24 L2 15 L15 14Z" fill="${prism}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/><path d="M20 2 L20 30 L9 37 L12 24 L2 15 L15 14Z" fill="#000" fill-opacity=".18"/>`,
    // pips
    `${[0, 1, 2, 3].map((k) => `<rect x="${3 + k * 9}" y="14" width="7" height="12" rx="2" fill="${k < i ? (i === 4 ? 'url(#rv-prism)' : c) : '#2a3040'}" stroke="${INK}" stroke-width="1.5"/>`).join('')}`,
  ][style];
  return `<svg width="${s}" height="${s}" viewBox="0 0 40 40" style="${i === 0 ? 'opacity:.55' : ''}">${body}</svg>`;
};
const ladderRow = (style: number): string =>
  LADDER.map((_, i) => `<span class="lad">${medal(style, i, 56)}<small>${LADDER_NAMES[i]}</small></span>`).join('');

// ---- A13 growth ----
const growTree = (style: number, stage: number, mine = false): string => {
  const metal = M[stage]!;
  const art = mine ? mineSvg(['copper_gem', 'copper_gem', 'iron_gem', 'iron_gem', 'grotto_gem'][stage]!, 64) : treeSvg('oak', 64);
  const scale = [0.55, 0.7, 0.85, 1, 1.08][stage]!;
  const extras = [
    '',
    stage >= 3 ? `<i class="hang" style="left:20%;top:30%"></i><i class="hang" style="left:66%;top:26%"></i>` : '',
    stage >= 2 ? `<i class="hang" style="left:40%;top:40%"></i>` : '',
    stage >= 4 ? `<i class="crown"></i><i class="spark"></i>` : '',
  ].join('');
  const s = [
    `transform:scale(${scale})`, // grows in size
    '', // same size, adds parts
    `transform:scale(${0.8 + stage * 0.05})`, // rim-led
    `transform:scale(${scale})`, // props
    `transform:scale(${0.8 + stage * 0.06})`, // aura
  ][style];
  const props = style === 3 ? [...Array(stage)].map((_, k) => `<i class="prop" style="left:${8 + k * 20}%"></i>`).join('') : '';
  const aura = style === 4 ? `<i class="aura" style="--c:${metal};opacity:${0.15 + stage * 0.18}"></i>` : '';
  const rimW = style === 2 ? 6 : 3;
  return `<span class="grow">${aura}<span style="display:inline-block;${s};transform-origin:50% 90%">${art}</span>${style === 1 || style === 4 ? extras : stage >= 4 ? '<i class="spark"></i>' : ''}${props}<i class="rim" style="border-color:${metal};border-width:${rimW}px"></i><small>${LADDER_NAMES[stage]}</small></span>`;
};

// ---- A14 forged edges ----
const BLADE_RAR = ['common', 'rare', 'epic', 'legendary', 'mythic'] as const;
const GEM_TINT = ['#e6a464', '#a8b4c4', '#c070ff'];
const edge = (gem: number, step: number, s = 60): string =>
  `<span class="edge" style="--t:${GEM_TINT[gem]};${step === 4 ? 'filter:hue-rotate(0deg) saturate(1.4)' : ''}">${item('sword', BLADE_RAR[step]!, s)}${step >= 3 ? '<i class="rune"></i>' : ''}</span>`;

// ---- A15 evolutions ----
const flame = (st: number): string => {
  const outline = st === 1 ? 'none' : INK;
  const w = st === 2 ? 3.5 : 2.5;
  const cols = st === 4 ? ['#ffd0f0', '#ff7ac0', '#9a3cff'] : ['#fff2a0', '#ffb43a', '#e8501e'];
  const extra = st === 2 ? `<path d="M30 112 h40 l-6 10 h-28z" fill="#f4c23b" stroke="${INK}" stroke-width="2.5"/><circle cx="50" cy="117" r="4" fill="#ff3d6e" stroke="${INK}" stroke-width="1.5"/>` : `<rect x="38" y="110" width="24" height="7" rx="2" fill="#5a3a26" stroke="${INK}" stroke-width="2.5"/>`;
  const fx = st === 3 ? `<path d="M50 10 C70 30 60 40 75 60 C80 80 64 98 56 104" fill="none" stroke="#ffd83e" stroke-width="5" stroke-linecap="round" opacity=".7"/><circle cx="72" cy="30" r="3" fill="#ffd83e"/><circle cx="26" cy="50" r="2.5" fill="#ffd83e"/>` : '';
  return `<svg viewBox="0 0 100 150" width="80">${fx}<path d="M50 4 C60 24 66 30 62 52 C70 46 70 40 72 36 C78 62 66 86 62 108 H38 C34 86 22 62 28 36 C30 44 32 48 38 52 C34 30 42 22 50 4Z" fill="${cols[2]}" stroke="${outline}" stroke-width="${w}" stroke-linejoin="round"/><path d="M50 22 C56 38 58 52 56 70 C60 66 62 62 62 58 C64 76 58 94 56 106 H44 C42 94 38 76 40 62 C42 68 44 70 46 72 C44 56 46 40 50 22Z" fill="${cols[1]}"/><path d="M50 48 C54 62 54 80 52 104 H48 C46 82 46 64 50 48Z" fill="${cols[0]}"/>${extra}<rect x="45" y="117" width="10" height="22" rx="2" fill="#3a2418" stroke="${INK}" stroke-width="2.5"/><circle cx="50" cy="143" r="5" fill="#ff8e2c" stroke="${INK}" stroke-width="2"/></svg>`;
};
const staff = (st: number): string => {
  const petal = st === 4 ? '#b0f0ff' : '#ff9ad2';
  const petals = [0, 72, 144, 216, 288]
    .map((a) => `<ellipse cx="50" cy="16" rx="8" ry="14" fill="${petal}" stroke="${st === 1 ? 'none' : INK}" stroke-width="2" transform="rotate(${a} 50 28)"/>`)
    .join('');
  const crystals = st === 2 || st === 4 ? `<path d="M20 60 l5 -9 l5 9 l-5 9z M75 70 l4 -7 l4 7 l-4 7z" fill="#7ae0ff" stroke="${INK}" stroke-width="1.8"/>` : `<path d="M22 64 l4 -7 l4 7 l-4 7z" fill="#7ae0ff" stroke="${INK}" stroke-width="1.8"/>`;
  const leaves = st === 3 ? `<path d="M70 40 q8 4 4 12 q-8 -4 -4 -12z M26 90 q8 4 4 12 q-8 -4 -4 -12z M74 110 q8 4 4 12 q-8 -4 -4 -12z" fill="#7ae05a" stroke="${INK}" stroke-width="1.5"/><path d="M14 40 q30 -10 60 6" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="4 6" opacity=".6"/>` : '';
  return `<svg viewBox="0 0 100 150" width="80">${leaves}${crystals}<path d="M46 40 C44 80 48 110 44 134 L40 146 M54 40 C56 80 52 110 56 134 L62 146 M48 132 L50 146" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round"/><path d="M46 40 C44 80 48 110 44 134 L40 146 M54 40 C56 80 52 110 56 134 L62 146 M48 132 L50 146" fill="none" stroke="#9a6236" stroke-width="5" stroke-linecap="round"/>${petals}<circle cx="50" cy="28" r="8" fill="#ffe27a" stroke="${INK}" stroke-width="2.2"/></svg>`;
};
const reaper = (st: number): string => {
  const blade = st === 4 ? '#c0a8ff' : st === 2 ? '#2a2a34' : '#d8dce8';
  const glow = st === 3 ? `<path d="M30 20 C60 6 92 18 96 44" fill="none" stroke="#9a5aff" stroke-width="10" opacity=".35" stroke-linecap="round"/>` : '';
  const orn = st === 2 ? `<circle cx="34" cy="26" r="6" fill="#9a5aff" stroke="${INK}" stroke-width="2"/><path d="M34 140 l-6 8 h12z" fill="#f4c23b" stroke="${INK}" stroke-width="2"/>` : '';
  return `<svg viewBox="0 0 100 150" width="80">${glow}<rect x="31" y="22" width="7" height="122" rx="3" fill="#3a2a40" stroke="${INK}" stroke-width="2.5" transform="rotate(8 34 80)"/><path d="M28 22 C56 4 92 14 98 46 C84 30 62 26 40 34Z" fill="${blade}" stroke="${st === 1 ? 'none' : INK}" stroke-width="2.6" stroke-linejoin="round"/><path d="M40 30 C60 22 80 24 92 38" fill="none" stroke="#fff" stroke-width="2" opacity=".7"/>${orn}${st === 3 ? '<circle cx="70" cy="60" r="3" fill="#c79aff"/><circle cx="20" cy="70" r="2.5" fill="#c79aff"/>' : ''}</svg>`;
};
const evoStyles = [
  ['Cel standard', 'Same cel recipe as every item: bold ink, flat 3-tone fills, white highlight. Most consistent with the 12 cards.'],
  ['Silhouette only', 'No inner outlines; shapes read by colour bands alone, ink only at the outer edge via the card. Cleanest, most "icon".'],
  ['Ornate relic', 'Gold fittings, gem set in the guard/head, thicker ink. Feels like a reward; heaviest detail.'],
  ['Effect-led', 'Simple item, lots of cel motion around it: flame streams, wind ribbons and falling leaves, soul wisps.'],
  ['Prismatic-tinted', 'The evolution borrows the prismatic palette (pink/violet/cyan) to tie it to the top tier; strongest contrast with ★5.'],
];

// ---- A11, A16 helpers ----
const bar = (p: number, c = '#d9b04a'): string => `<span class="pb"><i style="width:${p}%;background:${c}"></i></span>`;
const reward = (lv: number, ico: string, on = false): string =>
  `<span class="rw${on ? ' on' : ''}"><small>Lv ${lv}</small><b>${ico}</b></span>`;

export const sets3: OptionSet[] = [
  {
    id: 'A11',
    title: 'Welcome-back (offline) summary',
    brief: 'Time away (and the cap), resources, kills, knockouts, drops (rare highlighted), card XP and levels, mastery tiers reached.',
    options: [
      {
        title: 'Ledger modal',
        note: 'Centered modal with sections and right-aligned numbers; rare drops get a gold row. One "Collect" button with the coin fly.',
        html: `<div class="scr stage"><div class="modal list"><b>Welcome back · 6h 12m <small>(cap 8h)</small></b><div>${coin('oak_gem', 1, 18)} Oak +2.1M · ${coin('copper_gem', 1, 18)} Cu +430K</div><div>⚔ 312 kills · 2 knockouts</div><div class="gold">✦ Hex Lattice (rare)</div><div>Squire Lv 14 → 19 · 🥈 Oak mastery</div>${btn('Collect', true)}</div></div>`,
      },
      {
        title: 'Card fan',
        note: 'Each category is a little card dealt onto the table one after another (resources, fights, drops, cards, mastery). Playful.',
        html: `<div class="scr stage" style="gap:6px">${['⏱ 6h12m', '🪙 +2.1M', '⚔ 312', '✦ Rare!', '⬆ Lv 19'].map((t, i) => `<span class="fan" style="rotate:${(i - 2) * 6}deg">${t}</span>`).join('')}</div>`,
      },
      {
        title: 'Timeline',
        note: 'A horizontal timeline of the time away with events pinned on it (kills, knockouts, drops); totals below. Explains what happened.',
        html: `<div class="scr col" style="padding:14px;gap:10px"><b>While you were away · 6h 12m / 8h</b><div class="tl"><i style="left:10%">⚔</i><i style="left:34%">💥</i><i style="left:52%" class="gold">✦</i><i style="left:80%">⬆</i></div><div class="list"><div>+2.1M Oak · +430K Cu · 312 kills</div></div></div>`,
      },
      {
        title: 'Header toast stack',
        note: 'No modal: the game opens normally and a stack of toasts slides from the header; the counters roll up as they land.',
        html: `<div class="scr col"><div class="strip">${coin('oak_gem', 1, 18)} <b class="rolling">2,104,331</b> <small>+2.1M</small></div><div class="col" style="align-items:flex-end;padding:8px;gap:4px"><span class="toast2">⏱ Away 6h 12m</span><span class="toast2">⚔ 312 kills</span><span class="toast2 gold">✦ Hex Lattice</span></div></div>`,
      },
      {
        title: 'Scoreboard',
        note: 'Full-screen scoreboard with big tallies that count up in sequence, mastery medals stamped at the end. Most celebratory.',
        html: `<div class="scr stage col" style="gap:4px"><b class="big">6h 12m</b><div class="row" style="gap:14px"><span class="tally"><b>2.1M</b><small>Oak</small></span><span class="tally"><b>312</b><small>Kills</small></span><span class="tally gold"><b>1</b><small>Rare</small></span></div>${medal(0, 2)}</div>`,
      },
    ],
  },
  {
    id: 'A12',
    title: 'Mastery medals and the metal ladder',
    brief: 'Stone → bronze → silver → gold → prismatic on coins (gem mastery), boss medals on the floor rail and next to the boss, and forged edges.',
    options: [0, 1, 2, 3, 4].map((st) => ({
      title: ['Ribbon medal', 'Shield crest', 'Laurel ring', 'Faceted star', 'Pip bar'][st]!,
      note: [
        'Classic hanging medal with a ribbon. Very readable as "achievement", warm.',
        'Heraldic shield in the metal with a faceted gem; matches the Knight plate frames.',
        'Metal disc wrapped in laurel leaves; feels like a victory.',
        'Faceted star with cut light/dark faces, matching the scenery and gems.',
        'Four pips that fill with metal; compact, works at 12px on the floor rail.',
      ][st]!,
      html: `<div class="scr col" style="padding:14px;gap:14px;justify-content:center"><div class="row" style="gap:14px;justify-content:center">${ladderRow(st)}</div><div class="row" style="gap:12px;align-items:center;justify-content:center"><span class="floor on">${medal(st, 2, 22)} Mossy Cellar</span>${boss("root_warden", 100)}${medal(st, 2, 44)}<span class="coins">${coin("oak_gem", 1, 46)}${coin("oak_gem", 2, 46)}${coin("oak_gem", 3, 46)}${coin("oak_gem", 4, 46)}</span></div><small>Tier-up: metal flash across the medal + toast “Root Warden · Silver”</small></div>`,
    })),
  },
  {
    id: 'A13',
    title: 'Growth stages of tree and mine tiles',
    brief: 'One visible step per 25-level milestone; the ground rim uses the metal ladder.',
    options: [0, 1, 2, 3, 4].map((st) => ({
      title: ['Grows in size', 'Adds parts', 'Rim-led', 'Props around', 'Aura and sky'][st]!,
      note: [
        'Sapling to grand tree by scale; extra gems and the sparkle at the top stage. Strongest silhouette change.',
        'Same footprint, each stage adds hanging gems, then a crown and sparkle. Grid stays tidy.',
        'Modest growth; a thick metal ground rim carries the stage. Clearest at a glance, least scenic.',
        'Tile gets props per stage: fence, lantern, banner, shrine. Feels like building a homestead.',
        'A soft coloured aura and halo grow with the stage. Magical, but subtle on dark tables.',
      ][st]!,
      html: `<div class="scr col" style="padding:8px;gap:4px"><div class="row" style="gap:2px;justify-content:space-around">${[0, 1, 2, 3, 4].map((s) => growTree(st, s)).join('')}</div><div class="row" style="gap:2px;justify-content:space-around">${[0, 1, 2, 3, 4].map((s) => growTree(st, s, true)).join('')}</div></div>`,
    })),
  },
  {
    id: 'A14',
    title: 'Forged edges for the damage lines',
    brief: 'Copper, Iron and Crystal Edge as forged blades, stepping bare → inlaid → gem-set → glowing runes → prismatic at each milestone, shown beside the arena.',
    options: [
      {
        title: 'Wall rack',
        note: 'A wooden rack behind the loadout, three blades hung horizontally; the level and the next milestone under each.',
        html: `<div class="scr row"><div class="stage" style="flex:6">${boss('root_warden', 110)}</div><div class="side rack" style="flex:4">${[0, 1, 2].map((g) => `<div class="row" style="align-items:center;gap:4px">${edge(g, [3, 1, 0][g]!, 80)}<small>Lv ${[78, 31, 4][g]} · next ×2 at ${[100, 50, 25][g]}</small></div>`).join('')}</div></div>`,
      },
      {
        title: 'Planted in the ground',
        note: 'Three blades stuck in the arena floor in front of the cards, like trophies. Most "on stage".',
        html: `<div class="scr stage">${boss('root_warden', 110)}<div class="abs b row" style="gap:10px">${[0, 1, 2].map((g) => `<span style="rotate:${(g - 1) * 8}deg">${edge(g, [3, 1, 0][g]!, 90)}</span>`).join('')}</div></div>`,
      },
      {
        title: 'Orbiting blades',
        note: 'The blades float and slowly orbit the main card, glowing with their stage. Magical; links damage to the card.',
        html: `<div class="scr stage">${miniCard("sword", "common", "gold", "", 70, "center")}<span class="orbit">${[0, 1, 2].map((g) => `<span class="ob" style="--a:${g * 120}deg">${edge(g, [4, 2, 0][g]!, 70)}</span>`).join('')}</span></div>`,
      },
      {
        title: 'Ladder strip',
        note: 'Each line is a row showing all five steps with the current one lit; the upgrade button sits at the end. Most informative.',
        html: `<div class="scr col list">${[0, 1, 2].map((g) => `<div class="row" style="gap:2px;align-items:center">${[0, 1, 2, 3, 4].map((s) => `<span style="opacity:${s <= [3, 1, 0][g]! ? 1 : 0.25}">${edge(g, s, 52)}</span>`).join('')}${btn('Buy ×10', g === 0)}</div>`).join('')}</div>`,
      },
      {
        title: 'Crossed crest',
        note: 'The three blades crossed into a crest above the boss name plate, behind the HP bars. Compact, heraldic.',
        html: `<div class="scr stage col"><span class="crest">${[0, 1, 2].map((g) => `<span style="rotate:${(g - 1) * 35}deg">${edge(g, [3, 2, 1][g]!, 80)}</span>`).join('')}</span>${boss('root_warden', 90)}</div>`,
      },
    ],
  },
  {
    id: 'A15',
    title: 'Unique ★6 evolutions: Flameblade, Rootbloom Staff, Soul Reaper',
    brief: 'Drawn in five treatments. Each appears from Gold ★6 with the tier element effect, and gets a bigger evolution flash than a normal ★6.',
    options: evoStyles.map(([t, n], st) => ({
      title: t!,
      note: n!,
      html: `<div class="scr stage evo" style="gap:16px"><span class="ev">${flame(st)}<small>Flameblade</small></span><span class="ev">${staff(st)}<small>Rootbloom Staff</small></span><span class="ev">${reaper(st)}<small>Soul Reaper</small></span></div>`,
    })),
  },
  {
    id: 'A16',
    title: 'Goal tracker and account level reward track',
    brief: 'Header widget with the next 1–3 goals (click to jump), and the BF-style horizontal reward row opened from the account level.',
    options: [
      {
        title: 'Header pills',
        note: 'Goals as three compact pills in the header with tiny bars; the reward track drops down under the account badge.',
        html: `<div class="scr col"><div class="strip"><b>Lv 7</b>${bar(40)}<span class="goal">🎯 Ember Crypt ${bar(60, '#e8573d')}</span><span class="goal">⬆ Cu Lv 25 ${bar(80)}</span><span class="goal">★ Squire ${bar(30, '#4fa0ff')}</span></div><div class="row track">${reward(8, '◆10')}${reward(9, '+1 cap')}${reward(10, '🎴')}${reward(11, '◆')}${reward(12, '◆')}</div></div>`,
      },
      {
        title: 'Quest scroll',
        note: 'A parchment scroll pinned under the header listing goals with check boxes; the reward track is a path on the scroll.',
        html: `<div class="scr col" style="padding:10px"><div class="scroll list"><div>☐ Clear Ember Crypt ${bar(60, '#e8573d')}</div><div>☐ Copper Edge Lv 25 ${bar(80)}</div><div>☐ Squire ★4: 2 Moss Cores</div></div><div class="row track">${reward(8, '◆')}${reward(10, '🎴', true)}${reward(15, '◆')}</div></div>`,
      },
      {
        title: 'Ring meter',
        note: 'Account level as a ring around the badge; goals as a single rotating line next to it. Smallest header cost.',
        html: `<div class="scr col"><div class="strip"><span class="ring">7</span><span class="goal">🎯 Clear Ember Crypt · 60% · ~12m</span></div><div class="stage"><div class="row track">${[8, 9, 10, 11, 12, 13].map((l) => reward(l, l % 5 === 0 ? '🎴' : '◆')).join('')}</div></div></div>`,
      },
      {
        title: 'Side widget',
        note: 'A floating card in the bottom-right corner on every page with goals and ETAs; reward track opens as a full-width ribbon.',
        html: `<div class="scr stage"><div class="abs br widget list"><div>🎯 Ember Crypt ~12m</div><div>⬆ Cu Lv 25 ~3m</div><div>🥈 Oak mastery ~40m</div></div><div class="abs t row track">${reward(8, '◆')}${reward(9, '+1')}${reward(10, '🎴')}</div></div>`,
      },
      {
        title: 'Reward road',
        note: 'Reward track is the hero: a road with milestone signposts, your marker on it; goals are the next signposts. Feels like a journey.',
        html: `<div class="scr stage col"><div class="road">${[7, 8, 9, 10, 11, 12].map((l, i) => `<span class="sign" style="left:${8 + i * 16}%">${l % 5 === 0 ? '🎴' : '◆'}<small>${l}</small></span>`).join('')}<span class="me" style="left:12%">▼</span></div><small>🎯 next: Clear Ember Crypt · Cu Lv 25</small></div>`,
      },
    ],
  },
];
