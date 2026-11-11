function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/*
 * Helpers of the v26 -> v27 migration (DESIGN.md §6 "An old save gets its team and a floor it can
 * farm"). Snapshots, because migrations never read the content, which may change later.
 */

/** The fighting cards by rarity when save format 27 was made. */
const FIGHTING_BY_RARITY: Record<string, readonly string[]> = {
  common: [
    'ember_squire',
    'rusty_brute',
    'militia_picket',
    'stable_squire',
    'alley_cutpurse',
    'quarry_smasher',
    'fieldhand_archer',
    'hedge_acolyte',
    'field_reaper',
  ],
  uncommon: [
    'hollow_spearman',
    'brass_vanguard',
    'bronze_warden',
    'bronze_jouster',
    'bronze_sneak',
    'bronze_forgehand',
    'bronze_hunter',
    'bronze_mystic',
    'bronze_gleaner',
  ],
  rare: [
    'reaper_test',
    'silver_cavalier',
    'silver_executioner',
    'silver_skirmisher',
    'silver_rider',
    'silver_shiv',
    'silver_sledger',
    'silver_ranger',
    'silver_mage',
  ],
  epic: [
    'storm_duelist',
    'gilded_knight',
    'gold_warlord',
    'golden_hoplite',
    'golden_tilter',
    'golden_anvilmaster',
    'golden_sharpshot',
    'golden_sage',
    'golden_harvester',
  ],
  legendary: [
    'dawnblade_regent',
    'prism_paladin',
    'shard_strider',
    'mirror_cavalier',
    'whisper_assassin',
    'facet_crusher',
    'rainbow_sniper',
    'kaleido_weaver',
    'halfmoon_reaper',
  ],
  mythic: [
    'seraph_lancer',
    'dawn_champion',
    'sunbreaker_titan',
    'valor_pikeman',
    'gleam_phantom',
    'thunder_smith',
    'seraph_archer',
    'sanctum_oracle',
    'mercy_harvester',
  ],
  void: [
    'grave_hammerer',
    'shadow_reaver',
    'ruin_tyrant',
    'wraith_impaler',
    'dread_horseman',
    'venom_stalker',
    'wither_huntress',
    'hex_warlock',
    'grim_sovereign',
  ],
};
/** Card cost by rarity (Mythic and Void share one). */
const RARITY_COST: Record<string, number> = {
  common: 2,
  uncommon: 3,
  rare: 4,
  epic: 6,
  legendary: 9,
  mythic: 14,
  void: 14,
};
const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'void'];
const RANK_ORDER = ['wood', 'bronze', 'silver', 'gold', 'prismatic', 'mythic', 'heirloom'];
/** Fighting loadout cost cap before any bonus (a lower bound: bonuses only raise it). */
const CAP_BASE = 6;
const CAP_PER_LEVEL = 2;
const CAP_TOP = 40;
const CHEAPEST_CARD = 2;
/** The dungeons in game order. */
const DUNGEON_ORDER = [
  'mossy_cellar',
  'ember_crypt',
  'frostspire_vault',
  'thunderpeak_aerie',
  'sunken_sanctum',
  'void_hollow',
];

/** The best floor beaten on the tier a dungeon stands on, 0 when none (a missing entry). */
function bestFloor(progress: unknown): number {
  if (!isRecord(progress)) return 0;
  const tiers = isRecord(progress['tiers']) ? progress['tiers'] : {};
  const difficulty = typeof progress['difficulty'] === 'string' ? progress['difficulty'] : 'normal';
  const tier = tiers[difficulty];
  const best = isRecord(tier) ? tier['best'] : 0;
  return typeof best === 'number' && best > 0 ? best : 0;
}

/**
 * Fills the empty support slots of the fighting loadout with the best fighting cards owned: best
 * first by rarity, rank, stars and level, each only if the cost cap leaves the cheapest card for
 * every slot still to fill. The main card stays.
 */
export function fillTeam(
  cards: Record<string, unknown>,
  accountLevel: number,
): Record<string, unknown> {
  const loadouts = isRecord(cards['loadouts']) ? cards['loadouts'] : {};
  const fighting = isRecord(loadouts['fighting']) ? loadouts['fighting'] : {};
  const owned = isRecord(cards['owned']) ? cards['owned'] : {};
  const supports: unknown[] = Array.isArray(fighting['supports'])
    ? [...fighting['supports']]
    : [null, null, null];
  const main = typeof fighting['main'] === 'string' ? fighting['main'] : null;
  const rarityOf = new Map<string, string>();
  for (const [rarity, ids] of Object.entries(FIGHTING_BY_RARITY)) {
    for (const id of ids) rarityOf.set(id, rarity);
  }
  const costOf = (id: string): number => RARITY_COST[rarityOf.get(id) ?? ''] ?? 99;
  const used = new Set<string>(main ? [main] : []);
  for (const id of supports) if (typeof id === 'string') used.add(id);
  const cap = Math.min(CAP_TOP, CAP_BASE + CAP_PER_LEVEL * (Math.max(1, accountLevel) - 1));
  let left = cap - [...used].reduce((sum, id) => sum + costOf(id), 0);
  const score = (id: string): number[] => {
    const card = isRecord(owned[id]) ? owned[id] : {};
    return [
      RARITY_ORDER.indexOf(rarityOf.get(id) ?? ''),
      RANK_ORDER.indexOf(typeof card['tier'] === 'string' ? card['tier'] : 'wood'),
      typeof card['stars'] === 'number' ? card['stars'] : 0,
      typeof card['level'] === 'number' ? card['level'] : 0,
    ];
  };
  const candidates = Object.keys(owned)
    .filter((id) => rarityOf.has(id) && !used.has(id))
    .sort((a, b) => {
      const x = score(a);
      const y = score(b);
      for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i]! - x[i]!;
      return a < b ? -1 : 1;
    });
  const empty = supports.flatMap((id, i) => (typeof id === 'string' ? [] : [i]));
  // How many slots the cap lets us fill, the cheapest card in each.
  let slots = Math.min(
    empty.length,
    candidates.length,
    Math.max(0, Math.floor(left / CHEAPEST_CARD)),
  );
  for (const slot of empty) {
    if (slots <= 0) break;
    const room = left - CHEAPEST_CARD * (slots - 1);
    const pick = candidates.findIndex((id) => costOf(id) <= room);
    if (pick < 0) break;
    const id = candidates.splice(pick, 1)[0]!;
    supports[slot] = id;
    left -= costOf(id);
    slots--;
  }
  return { ...cards, loadouts: { ...loadouts, fighting: { ...fighting, supports } } };
}

/**
 * Where the player stands: kept, unless that dungeon has nothing beaten on its tier and another
 * has, then the last such dungeon in game order.
 */
export function farmableDungeon(active: unknown, floors: Record<string, unknown>): unknown {
  if (typeof active !== 'string' || bestFloor(floors[active]) > 0) return active;
  const beaten = DUNGEON_ORDER.filter((id) => bestFloor(floors[id]) > 0);
  return beaten.length > 0 ? beaten[beaten.length - 1] : active;
}
