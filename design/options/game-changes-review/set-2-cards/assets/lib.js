/* Shared mock data and helpers for the review pages. Names, prices, rates and card text are the
   real ones from src/data/content (trees.json, mines.json, upgrades.json, cards.json,
   cardRules.json); the "save" (levels, money, tiers) is an invented mid-game state. */
(function () {
  'use strict';
  const SP = 'assets/sprites/';

  /* ---- number format: under a million in full, above with suffixes (a Settings option) ---- */
  function fmt(n) {
    if (n < 1e6) {
      if (n >= 100) return Math.round(n).toLocaleString('en-US');
      if (n >= 10) return (Math.round(n * 10) / 10).toLocaleString('en-US');
      return (Math.round(n * 100) / 100).toLocaleString('en-US');
    }
    if (n >= 1e15) { const e = Math.floor(Math.log10(n)); return (n / Math.pow(10, e)).toFixed(2) + 'e' + e; }
    const S = [['T', 1e12], ['B', 1e9], ['M', 1e6]];
    for (const [s, v] of S) if (n >= v) return (n / v >= 100 ? Math.round(n / v) : Math.round((n / v) * 100) / 100) + s;
    return String(n);
  }

  /* ---- production (DESIGN section 4): price = ceil(base * growth^level); +10% per level;
     x2 every 25 levels; upgrade multipliers on top ---- */
  const KINDS = {
    logging: [
      { id: 'oak', name: 'Oak', tier: 1, gem: 'Oak Gem', shape: 'round', kindArt: 'tree', base: 1, cb: 20, cg: 1.3, lvl: 56, mult: 2, note: 'Keen Axes x2' },
      { id: 'ironbark', name: 'Ironbark', tier: 2, gem: 'Ironbark Gem', shape: 'pentagon', kindArt: 'tree', base: 0.5, cb: 250, cg: 1.32, lvl: 27, mult: 2, note: 'Iron Saws x2' },
      { id: 'moonwillow', name: 'Moonwillow', tier: 3, gem: 'Moonwillow Gem', shape: 'star', kindArt: 'tree', base: 0.25, cb: 3000, cg: 1.34, lvl: 0, mult: 1, locked: true, unlock: '2,000 Ironbark Gem', unlockShort: '2,000 Ironbark Gem' },
    ],
    mining: [
      { id: 'copper_quarry', name: 'Copper Quarry', tier: 1, gem: 'Copper Gem', shape: 'square', kindArt: 'mine', base: 0.5, cb: 15, cg: 1.3, lvl: 38, mult: 2, note: 'Sharp Picks x2' },
      { id: 'iron_deeps', name: 'Iron Deeps', tier: 2, gem: 'Iron Gem', shape: 'hexagon', kindArt: 'mine', base: 0.25, cb: 200, cg: 1.32, lvl: 12, mult: 1 },
      { id: 'crystal_grotto', name: 'Crystal Grotto', tier: 3, gem: 'Grotto Gem', shape: 'drop', kindArt: 'mine', base: 0.1, cb: 2500, cg: 1.34, lvl: 0, mult: 1, locked: true, unlock: 'Clear Ember Crypt', dungeon: true },
    ],
  };
  const MONEY = 1830000;
  const stageOf = (lvl) => Math.min(4, Math.floor(lvl / 25));
  const rateAt = (k, lvl) => k.base * (1 + 0.1 * lvl) * Math.pow(2, Math.floor(lvl / 25)) * k.mult;
  const priceN = (k, n) => {
    // sum of n consecutive level prices, each rounded up
    let t = 0;
    for (let i = 0; i < n; i++) t += Math.ceil(k.cb * Math.pow(k.cg, k.lvl + i));
    return t;
  };
  function maxAffordable(k, money) {
    let n = 0, t = 0;
    for (;;) {
      const p = Math.ceil(k.cb * Math.pow(k.cg, k.lvl + n));
      if (t + p > money || n >= 5000) break;
      t += p; n++;
    }
    return n;
  }
  /** The view model of one row for the current buy mode ('1', '10', '100', 'max'). */
  function rowModel(k, mode) {
    const m = {
      k, id: k.id, name: k.name, tier: k.tier, locked: !!k.locked, lvl: k.lvl, gem: k.gem,
      stage: stageOf(k.lvl), tile: SP + 'tile-' + k.kindArt + '-' + k.shape + '-' + stageOf(k.lvl) + '.png',
    };
    if (k.locked) {
      m.rate = 0; m.unlock = k.unlock; m.dungeon = !!k.dungeon; m.stage = 0;
      m.tile = SP + 'tile-' + k.kindArt + '-' + k.shape + '-0.png';
      m.baseRate = k.base;
      m.affordUnlock = false;
      return m;
    }
    m.rate = rateAt(k, k.lvl);
    const nextMs = (Math.floor(k.lvl / 25) + 1) * 25;
    m.nextMs = nextMs; m.msProg = ((k.lvl - (nextMs - 25)) / 25) * 100; m.toMs = nextMs - k.lvl;
    let n = mode === 'max' ? Math.max(1, maxAffordable(k, MONEY)) : +mode;
    m.n = n; m.price = priceN(k, n); m.afford = priceN(k, n) <= MONEY && (mode !== 'max' || maxAffordable(k, MONEY) >= 1);
    m.newRate = rateAt(k, k.lvl + n);
    m.crosses = Math.floor((k.lvl + n) / 25) > Math.floor(k.lvl / 25);
    m.label = mode === 'max' ? (maxAffordable(k, MONEY) >= 1 ? 'Max (' + n + ')' : '') : '×' + n;
    m.gain = m.newRate - m.rate;
    return m;
  }
  const job = (j) => KINDS[j];

  /* ---- the upgrade shelf (upgrades.json, descriptions and prices verbatim) ---- */
  const SHELF = [
    { id: 'keen_axes', name: 'Keen Axes', d: 'Oak output x2', cost: 1500, owned: true, group: 'logging', kind: 'oak' },
    { id: 'iron_saws', name: 'Iron Saws', d: 'Ironbark output x2', cost: 15000, owned: true, group: 'logging', kind: 'ironbark' },
    { id: 'fertile_soil', name: 'Fertile Soil', d: 'Tree levels add 50% more output each', cost: 25000, group: 'logging', kind: 'oak' },
    { id: 'lumberjack_pact', name: 'Lumberjack Pact', d: 'Logging support cards +25% effect', cost: 40000, group: 'logging', kind: 'oak' },
    { id: 'deep_roots', name: 'Deep Roots', d: 'Oak output x3', cost: 400000, group: 'logging', kind: 'oak' },
    { id: 'lumber_union', name: 'Lumber Union', d: 'All trees +50% output', cost: 50000, group: 'logging', kind: 'all' },
    { id: 'sharp_picks', name: 'Sharp Picks', d: 'Copper Quarry output x2', cost: 1200, owned: true, group: 'mining', kind: 'copper_quarry' },
    { id: 'rich_ore', name: 'Rich Ore', d: 'Mine levels add 50% more output each', cost: 30000, group: 'mining', kind: 'copper_quarry' },
    { id: 'miner_pact', name: 'Miner Pact', d: 'Mining support cards +25% effect', cost: 40000, group: 'mining', kind: 'copper_quarry' },
    { id: 'deep_shafts', name: 'Deep Shafts', d: 'Iron Deeps output x2', cost: 15000, group: 'mining', kind: 'iron_deeps' },
    { id: 'dynamite', name: 'Dynamite', d: 'All mines +50% output', cost: 100000, group: 'mining', kind: 'all' },
    { id: 'harvest_rhythm', name: 'Harvest Rhythm', d: 'Logging and mining burst gauges fill 25% faster', cost: 20000, group: 'all', kind: 'all' },
    { id: 'merchant_ledger', name: 'Merchant Ledger', d: 'All production +25%', cost: 2000000, group: 'all', kind: 'all' },
  ].map((u) => Object.assign(u, { afford: !u.owned && u.cost <= MONEY }));

  /* ---- the 12 beta cards (cards.json text verbatim) with an invented collection state ---- */
  const CAPS = {
    bronze: [20, 24, 28, 32, 36, 40], silver: [40, 44, 48, 52, 56, 60],
    gold: [60, 64, 68, 72, 76, 80], prismatic: [80, 84, 88, 92, 96, 100],
  };
  const COST = { common: 2, rare: 3, epic: 5, legendary: 8, mythic: 12, exotic: 16, void: 20 };
  const TIERN = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', prismatic: 'Prismatic' };
  const RARN = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', mythic: 'Mythic', exotic: 'Exotic', void: 'Void' };
  const JOBN = { fighting: 'Fighting', logging: 'Logging', mining: 'Mining' };
  const CARDS = [
    { id: 'ember_squire', name: 'Ember Squire', job: 'fighting', rarity: 'common', element: 'Fire', item: 'sword', weapon: 'Ember Blade', main: 'Steady hits every 1 s', support: '+5% damage', tier: 'silver', stars: 3, lvl: 41, dupes: 0, isMain: true },
    { id: 'shield_warden', name: 'Shield Warden', job: 'fighting', rarity: 'rare', element: 'Light', item: 'shield', weapon: 'Bulwark', main: 'Steady hits every 1 s, +10% damage', support: '+1 burst fill per hit', tier: 'bronze', stars: 2, lvl: 9, dupes: 1 },
    { id: 'storm_duelist', name: 'Storm Duelist', job: 'fighting', rarity: 'epic', element: 'Storm', item: 'twin_blades', weapon: 'Twin Storm Blades', main: 'Fast hits every 0.5 s, gauge fills twice as fast', support: '+12% damage', tier: 'gold', stars: 1, lvl: 54, dupes: 0 },
    { id: 'dawnblade_regent', name: 'Dawnblade Regent', job: 'fighting', rarity: 'legendary', element: 'Fire', item: 'greatsword', weapon: 'Dawnblade', main: 'Heavy hits every 2 s, signature attack ×15', support: '+15% damage, +10% rare drop chance', tier: 'gold', stars: 3, lvl: 66, dupes: 1 },
    { id: 'apprentice_feller', name: 'Apprentice Feller', job: 'logging', rarity: 'common', element: 'Nature', item: 'hatchet', weapon: 'Hatchet', main: 'Steady output', support: '+5% logging', tier: 'bronze', stars: 3, lvl: 22, dupes: 0, isMain: true },
    { id: 'grove_keeper', name: 'Grove Keeper', job: 'logging', rarity: 'rare', element: 'Nature', item: 'staff', weapon: 'Sapling Staff', main: '+10% logging', support: '+1 harvest-burst fill per tick', tier: 'silver', stars: 1, lvl: 40, dupes: 0 },
    { id: 'elder_treant', name: 'Elder Treant', job: 'logging', rarity: 'epic', element: 'Nature', item: 'maul', weapon: 'Heartwood Maul', main: 'Harvest bursts give 15 s of output instead of 10 s', support: '+12% logging', locked: true },
    { id: 'moonwood_dryad', name: 'Moonwood Dryad', job: 'logging', rarity: 'mythic', element: 'Light', item: 'bow', weapon: 'Moon Bow', main: '+30% logging, harvest gauge fills faster', support: '+20% logging', tier: 'gold', stars: 4, lvl: 71, dupes: 2 },
    { id: 'cave_digger', name: 'Cave Digger', job: 'mining', rarity: 'common', element: 'Earth', item: 'pickaxe', weapon: 'Pickaxe', main: 'Steady output', support: '+5% mining', tier: 'bronze', stars: 1, lvl: 11, dupes: 0, isMain: true },
    { id: 'gem_cutter', name: 'Gem Cutter', job: 'mining', rarity: 'rare', element: 'Crystal', item: 'chisel', weapon: 'Cutting Chisel', main: '+10% mining', support: '+1 harvest-burst fill per tick', tier: 'bronze', stars: 1, lvl: 3, dupes: 0 },
    { id: 'geode_golem', name: 'Geode Golem', job: 'mining', rarity: 'legendary', element: 'Crystal', item: 'geode_hammer', weapon: 'Geode Hammer', main: 'Harvest bursts give 15 s of output, +15% mining', support: '+15% mining', tier: 'silver', stars: 2, lvl: 41, dupes: 0 },
    { id: 'core_titan', name: 'Core Titan', job: 'mining', rarity: 'exotic', element: 'Void', item: 'gauntlet', weapon: 'Core Gauntlet', main: '+40% mining, harvest gauge fills faster', support: '+25% mining, +5% Core drop chance', locked: true },
  ].map((c) => {
    c.cost = COST[c.rarity];
    if (!c.locked) c.cap = CAPS[c.tier][c.stars - 1];
    else { c.tier = 'bronze'; c.stars = 0; c.lvl = 0; c.cap = 20; }
    return c;
  });
  const cardBy = (id) => CARDS.find((c) => c.id === id);

  /* ---- a card at scale s (1, 2 or 3) on the 132 x 186 grid ---- */
  function stars(c) {
    let h = '';
    for (let i = 1; i <= 6; i++) h += '<i' + (i <= c.stars ? ' class="on"' : '') + '>★</i>';
    return '<span class="stars" aria-label="' + c.stars + ' of 6 stars">' + h + '</span>';
  }
  function card(c, s, o) {
    o = o || {};
    const neon = c.rarity === 'mythic' || c.rarity === 'exotic';
    return '<div class="cd s' + s + ' r-' + c.rarity + (c.locked ? ' locked' : '') + '" data-card="' + c.id + '" title="' + c.name + '">' +
      '<div class="body">' + (neon ? '<span class="neon"></span>' : '') +
      '<div class="plate name"><span>' + (c.locked ? '???' : c.name) + '</span></div>' +
      '<div class="win"></div>' +
      '<img class="item" alt="' + c.weapon + '" src="' + SP + 'item-' + c.item + '-' + c.rarity + '.png">' +
      (o.stats === false ? '' : '<div class="plate stats"><span>Level <b class="num">' + (c.locked ? '-' : c.lvl + '/' + c.cap) + '</b></span><span>Cost <b class="num">' + c.cost + '</b></span></div>') +
      '<div class="rank"><span>' + TIERN[c.tier] + '</span>' + stars(c) + '</div>' +
      '</div>' +
      '<img class="frame" alt="" src="' + SP + 'frame-' + c.tier + '.png">' +
      '</div>';
  }

  /* ---- the fake shell around a mock ---- */
  const NAV = ['Home', 'Cards', 'Production', 'Dungeons', 'Summon', 'Skill Tree', 'Wardrobe', 'Achievements', 'Shop', 'Settings'];
  const PLAQ = { Home: 'home', Cards: 'cards', Production: 'production', Dungeons: 'dungeons', Summon: 'summon', 'Skill Tree': 'skills', Wardrobe: 'wardrobe', Achievements: 'achievements', Shop: 'shop', Settings: 'settings' };
  function shell(active, inner, extraMain) {
    return '<div class="sh"><header class="sh-top"><div class="sh-brand">Basic Incremental<small>v0.3.0</small></div>' +
      '<div class="sh-level"><i>9</i><div><span>Account level 9</span><em></em></div></div>' +
      '<div class="sh-res"><div class="pill"><span class="coin"></span><b class="num" data-money>' + fmt(MONEY) + '</b><small>Money</small></div>' +
      '<div class="pill"><span class="cry"></span><b class="num">14</b><small>Summon Crystals</small></div>' +
      '<div class="pill"><span class="cry g"></span><b class="num">3</b><small>Glamour Crystals</small></div></div></header>' +
      '<nav class="sh-rail">' + NAV.map((n) => '<div' + (n === active ? ' aria-current="page"' : '') + '><img alt="" src="' + SP + 'plaque-' + PLAQ[n] + '.png">' + n + '</div>').join('') + '</nav>' +
      '<main class="sh-main"' + (extraMain || '') + '>' + inner + '</main></div>';
  }

  window.BI = { fmt, KINDS, MONEY, rowModel, SHELF, CARDS, cardBy, card, stars, shell, SP, TIERN, RARN, JOBN, COST, CAPS, stageOf, rateAt };
})();
