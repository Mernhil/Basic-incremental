import { Decimal, isDecimalString } from './num';
import { SaveError } from './saveError';
import { farmableDungeon, fillTeam } from './migrationTeam';

/** Upgrades the state payload from version N to N + 1. Must not mutate its input. */
export type MigrationStep = (state: Record<string, unknown>) => Record<string, unknown>;

/** Keyed by the version a step upgrades FROM: `{ 1: v1ToV2 }` turns a v1 payload into v2. */
export type MigrationTable = Record<number, MigrationStep>;

/**
 * The real migrations. Whenever the save format changes: bump CURRENT_SAVE_VERSION and add a
 * step here keyed by the previous version.
 */
export const MIGRATIONS: MigrationTable = {
  /** v1 -> v2: cosmetics (equipped loadout and owned items) were added. Start empty; starters
   *  are filled in when the save is read. */
  1: (state) => ({ ...state, cosmetics: { loadout: { slots: {}, cards: {} }, owned: {} } }),
  2: v2ToV3,
  3: v3ToV4,
  4: v4ToV5,
  5: v5ToV6,
  6: v6ToV7,
  7: v7ToV8,
  /** v8 -> v9: summon portals (DESIGN.md §7). No pulls have been made yet, so every pity counter
   *  starts at 0. */
  8: (state) => ({ ...state, portals: {} }),
  /** v9 -> v10: Ascension (DESIGN.md §9). Nobody has ascended yet, so the run started with the
   *  save: every gem harvested so far counts toward the first Starlight. */
  9: (state) => ({
    ...state,
    prestige: { runStart: {}, shop: {}, starlightEarned: '0' },
  }),
  10: v10ToV11,
  /** v11 -> v12: achievements and the shard shop (DESIGN.md §10). Nothing is unlocked yet; the
   *  next tick unlocks whatever the save already earned. No offline session was recorded. */
  11: (state) => ({
    ...state,
    stats: { ...(isRecord(state['stats']) ? state['stats'] : {}), longestOfflineMs: 0 },
    achievements: {},
    shardShop: {},
  }),
  12: v12ToV13,
  13: v13ToV14,
  14: v14ToV15,
  15: v15ToV16,
  16: v16ToV17,
  17: v17ToV18,
  18: v18ToV19,
  /** v19 -> v20: weapon skins (weaponSkins.json). Nothing is equipped: every weapon is unskinned. */
  19: (state) => ({ ...state, weaponSkins: {} }),
  /** v20 -> v21: owned legacy weapon skins (Legacy Gate). None owned. */
  20: (state) => ({ ...state, legacySkins: [] }),
  /** v21 -> v22: the weapon base (DESIGN.md §5, §8): tiers Wood to Mythic/Void, Unique renamed
   *  Heirloom, the 11 item types and the picked legacy skins. */
  21: v21ToV22,
  /** v22 -> v23: crystals repriced (DESIGN.md §7 Rarer summons): a pull costs 30 times the crystals
   *  it did, so the Summon and Glamour Crystals held are multiplied by 30 and keep their worth. */
  22: v22ToV23,
  /** v23 -> v24: dungeon floors (DESIGN.md §6 Dungeon floors, Clearing, Difficulty tiers). */
  23: v23ToV24,
  /** v24 -> v25: replay Normal first, and training levels (DESIGN.md §6). */
  24: v24ToV25,
  /** v25 -> v26: the balance update (DESIGN.md §4 to §10): workers, stage stars and the rest. */
  25: v25ToV26,
  /** v26 -> v27: the table update (0.7.0): stage battles, the card duel, scrolls and the rest. */
  26: v26ToV27,
  /** v27 -> v28: the cosmetics review (0.7.3): the attack slot, every finish, tick and number item,
   *  the Prism Pointer and three bow skins are gone; owned ones are refunded. */
  27: v27ToV28,
};

/** Crystals one pull cost when save format 27 was made (a snapshot): a scroll is worth this. */
export const V27_CRYSTALS_PER_SCROLL = 300;

/** The crystal each scroll is converted from (DESIGN.md §3 Scroll details). */
const V27_SCROLLS = { summon_scroll: 'summon_crystal', glamour_scroll: 'glamour_crystal' } as const;

/**
 * v26 -> v27: the table update (user, 2026-11-11). Adds
 * the state of the rules it builds, all inert until their packages read it:
 * - every dungeon gets an auto-challenge switch, on where it was pushing (`mode` stays for now);
 * - the fight gets the enemy being fought (the first), no knockout wait carried over, no Challenge running, no auto-challenge
 *   wait and no damage on any team card; the HP of the floor being fought is dropped (`bossHp`
 *   becomes one enemy's HP), so the floor starts fresh;
 * - the crystals held become scrolls at the pull price (300 crystals a scroll, rounded down) and
 *   the crystals are dropped: the portals, wages and rewards all pay scrolls now;
 * - the empty support slots of the fighting loadout fill with the best owned fighting cards, and a
 *   player on a dungeon with nothing beaten moves to the last dungeon with a beaten floor
 *   (DESIGN.md §6 "An old save gets its team and a floor it can farm", `migrationTeam.ts`);
 * - no Focus Portal kind, daily reward, presets, bonds, expeditions or Ascension challenges yet.
 */
function v26ToV27(state: Record<string, unknown>): Record<string, unknown> {
  const combat = isRecord(state['combat']) ? state['combat'] : {};
  const floors = isRecord(combat['floors']) ? combat['floors'] : {};
  const account = isRecord(state['account']) ? state['account'] : {};
  const accountLevel = typeof account['level'] === 'number' ? account['level'] : 1;
  const resources = isRecord(state['resources']) ? { ...state['resources'] } : {};
  for (const [scroll, crystal] of Object.entries(V27_SCROLLS)) {
    const held = resources[crystal];
    const crystals = typeof held === 'string' && isDecimalString(held) ? new Decimal(held) : null;
    resources[scroll] =
      crystals && crystals.gt(0) ? crystals.div(V27_CRYSTALS_PER_SCROLL).floor().toString() : '0';
    delete resources[crystal];
  }
  return {
    ...state,
    resources,
    cards: isRecord(state['cards']) ? fillTeam(state['cards'], accountLevel) : state['cards'],
    activeDungeonId: farmableDungeon(state['activeDungeonId'], floors),
    bossHp: null,
    combat: {
      ...combat,
      floors: Object.fromEntries(
        Object.entries(floors).map(([id, p]) => [
          id,
          isRecord(p) ? { ...p, autoChallenge: p['mode'] !== 'farm' } : p,
        ]),
      ),
      enemyIndex: 0,
      knockoutSeconds: 0,
      challenge: null,
      challengeWaitSeconds: 0,
      cardDamage: {},
      cardsOut: [],
    },
    summon: { focusKind: null, dailyClaimedDay: null },
    presets: {
      dungeons: {},
      production: { logging: [null, null, null], mining: [null, null, null] },
    },
    discoveredBonds: [],
    expeditions: { trips: [], completed: 0 },
    ascensionChallenges: { active: null, completions: {} },
  };
}

/** The first tree kind and mine type when save format 26 was made (a snapshot). */
const V26_FIRST_PRODUCER = { logging: 'oak', mining: 'copper_quarry' } as const;

/** Floors of each dungeon on Normal when save format 26 was made (a snapshot). */
const V26_FLOORS: Record<string, number> = {
  mossy_cellar: 10,
  ember_crypt: 20,
  frostspire_vault: 30,
  thunderpeak_aerie: 40,
  sunken_sanctum: 50,
  void_hollow: 60,
};

/**
 * v25 -> v26: the balance update (user, 2026-11-11). Logging and mining cards become workers
 * (DESIGN.md §4 Workers): each job's main card becomes the worker of that job's first tree or
 * mine, and the job's harvest gauge moves with it. The boss kills of each dungeon become the
 * stage kills of its Normal last floor (§6 Stage stars), keyed `"<dungeon>:normal:<last floor>"`
 * as `stageKey` writes it in format 26. Cards keep their stars, levels and tiers. Everything else
 * starts empty: no tool lines, depth, forge, wishlist, chests paid, overflow switches or
 * autobuyers switched on. The old loadouts, burst gauges and kill counts stay as they are: the
 * game still reads them until the packages that replace them remove them.
 */
function v25ToV26(state: Record<string, unknown>): Record<string, unknown> {
  const production = isRecord(state['production']) ? state['production'] : {};
  const combat = isRecord(state['combat']) ? state['combat'] : {};
  const cards = isRecord(state['cards']) ? state['cards'] : {};
  const loadouts = isRecord(cards['loadouts']) ? cards['loadouts'] : {};
  const bursts = isRecord(state['bursts']) ? state['bursts'] : {};
  const workers: Record<string, string[]> = {};
  const harvestGauges: Record<string, unknown> = {};
  for (const job of ['logging', 'mining'] as const) {
    const loadout = loadouts[job];
    const main = isRecord(loadout) ? loadout['main'] : null;
    if (typeof main !== 'string') continue;
    const producer = V26_FIRST_PRODUCER[job];
    workers[producer] = [main];
    // An empty gauge needs no entry (missing = empty).
    const gauge = bursts[job];
    if (isRecord(gauge) && (gauge['gauge'] !== 0 || gauge['timer'] !== 0))
      harvestGauges[producer] = { ...gauge };
  }
  const kills = isRecord(combat['kills']) ? combat['kills'] : {};
  const stageKills: Record<string, unknown> = {};
  for (const [dungeonId, count] of Object.entries(kills)) {
    const last = V26_FLOORS[dungeonId];
    if (last === undefined || typeof count !== 'number' || !(count > 0)) continue;
    stageKills[`${dungeonId}:normal:${last}`] = count;
  }
  return {
    ...state,
    production: {
      ...production,
      workers,
      harvestGauges,
      tools: {},
      depth: {},
      forge: { recipe: null, progress: '0', worker: null },
    },
    combat: { ...combat, stageKills, stageChests: {}, overflow: {} },
    cards: { ...cards, wishlist: [] },
    automation: { treeLevels: false, mineLevels: false, reservePercent: 0 },
  };
}

/**
 * v24 -> v25. Replay Normal first (user, 2026-11-10): format 24 put a dungeon that had been
 * cleared by boss kills on its Normal last floor with Hard open, although its floors had never
 * been played. Every dungeon now starts again on floor 1 of Normal, pushing, with nothing
 * beaten, so Hard opens only by beating the Normal boss through the floors. What a clear
 * unlocked stays: the cleared dungeons, the next dungeons and the mines, kills and medals.
 * Format 24 was two days old, so floors played in it are replayed too. Training levels (the
 * repeatable fighting upgrades) start at none.
 */
function v24ToV25(state: Record<string, unknown>): Record<string, unknown> {
  const combat = isRecord(state['combat']) ? state['combat'] : {};
  return { ...state, bossHp: null, combat: { ...combat, floors: {}, training: {} } };
}

/** Floors of each dungeon when save format 24 was made (a snapshot: migrations never read the
 *  content, which may change later). */
const V24_FLOORS: Record<string, number> = {
  mossy_cellar: 10,
  ember_crypt: 20,
  frostspire_vault: 30,
};

/**
 * v23 -> v24: dungeons became stacks of floors, with progress saved per dungeon and difficulty
 * (current floor, best floor; the endless depths use the same shape). A dungeon already cleared
 * stays cleared and stands on its Normal last floor, the boss it was farming, with that floor as
 * its best, in farm mode; every other dungeon starts on floor 1 in push mode, which is what a
 * missing entry means. The boss being fought is respawned, because the HP now belongs to a floor.
 * Kill counts and boss medals stay as they are.
 */
function v23ToV24(state: Record<string, unknown>): Record<string, unknown> {
  const combat = isRecord(state['combat']) ? state['combat'] : {};
  const cleared = Array.isArray(state['clearedDungeons']) ? state['clearedDungeons'] : [];
  const floors: Record<string, unknown> = {};
  for (const id of cleared) {
    const count = typeof id === 'string' ? V24_FLOORS[id] : undefined;
    if (typeof id !== 'string' || count === undefined) continue;
    floors[id] = {
      difficulty: 'normal',
      mode: 'farm',
      tiers: { normal: { floor: count, best: count } },
    };
  }
  return { ...state, bossHp: null, combat: { ...combat, floors } };
}

/** The factor crystals were repriced by in save format 23. */
export const V23_CRYSTAL_FACTOR = 30;

/** v22 -> v23: Summon and Glamour Crystals held times 30 (junk amounts count as 0). */
function v22ToV23(state: Record<string, unknown>): Record<string, unknown> {
  const resources = isRecord(state['resources']) ? { ...state['resources'] } : {};
  for (const id of ['summon_crystal', 'glamour_crystal']) {
    const held = resources[id];
    if (typeof held === 'string' && isDecimalString(held)) {
      resources[id] = new Decimal(held).mul(V23_CRYSTAL_FACTOR).toString();
    }
  }
  return { ...state, resources };
}

/** Old weapon kind -> its new item type (maul, twin blades and the Soul Reaper scythe). */
const V22_WEAPONS: Record<string, string> = {
  maul: 'hammer',
  twin_blades: 'dagger',
  soul_reaper: 'scythe',
};
/** Kept legacy skins whose id changed (maul 06 and 07 became hammer skins). */
const V22_SKIN_IDS: Record<string, string> = {
  'legacy-maul-06': 'legacy-hammer-01',
  'legacy-maul-07': 'legacy-hammer-02',
};

/**
 * v21 -> v22: a Unique card is at the Mythic/Void tier (T6, by the card's side, which the game
 * knows from the card); Bronze to Prismatic keep their names (Bronze is T2 now, Wood is the new
 * first tier). A worn Soul Reaper skin (free before) stays worn as an owned scythe legacy skin;
 * weapon skins move to their new type; legacy skins that are not kept are dropped on load. Cards
 * above their rarity's cap are clamped (and paid back) on load, where the cards are known.
 */
function v21ToV22(state: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...state };
  if (isRecord(state['cards']) && isRecord(state['cards']['owned'])) {
    const owned = Object.fromEntries(
      Object.entries(state['cards']['owned']).map(([id, card]) => [
        id,
        isRecord(card) && card['tier'] === 'unique' ? { ...card, tier: 'mythic' } : card,
      ]),
    );
    out['cards'] = { ...state['cards'], owned };
  }
  const legacy = new Set<string>(
    Array.isArray(state['legacySkins'])
      ? state['legacySkins'].filter((x): x is string => typeof x === 'string')
      : [],
  );
  const skins: Record<string, string> = {};
  for (const [weapon, skin] of Object.entries(
    isRecord(state['weaponSkins']) ? state['weaponSkins'] : {},
  )) {
    if (typeof skin !== 'string') continue;
    const to = V22_WEAPONS[weapon] ?? weapon;
    const scythe = /^skin-(\d\d)$/.exec(skin);
    if (weapon === 'soul_reaper' && scythe) {
      const n = Number(scythe[1]);
      if (n >= 1 && n <= 12) {
        const id = `legacy-scythe-${String(n + 1).padStart(2, '0')}`;
        legacy.add(id);
        skins[to] = id;
      }
      continue;
    }
    skins[to] = V22_SKIN_IDS[skin] ?? skin;
  }
  out['weaponSkins'] = skins;
  out['legacySkins'] = [...legacy].map((id) => V22_SKIN_IDS[id] ?? id);
  return out;
}

/** Price of the first plot / slot at save format 15 (production.json `expansion`): base and growth. */
const V15_EXPANSION = { base: 25, growth: 1.4 };

/**
 * Money the first `count` buys of an exponential curve cost: each price is `base * growth^n`,
 * rounded up like a buy (the game never charges a fraction).
 */
function curvePaid(curve: { base: number; growth: number }, count: number): Decimal {
  let paid = new Decimal(0);
  for (let n = 0; n < Math.max(0, Math.floor(count)); n++) {
    const price = new Decimal(curve.base).mul(new Decimal(curve.growth).pow(n));
    const near = price.round();
    // Drop float noise first (25 x 1.4^2 is 49.00000000000001 and must cost 49, not 50).
    paid = paid.add(price.sub(near).abs().lte(near.abs().mul(1e-9)) ? near : price.ceil());
  }
  return paid;
}

/** Adds Money to the resources of a state payload (a copy). Junk money counts as 0. */
function withMoney(state: Record<string, unknown>, refund: Decimal): Record<string, unknown> {
  if (!refund.gt(0)) return state;
  const resources = isRecord(state['resources']) ? { ...state['resources'] } : {};
  const money = resources['money'];
  const held =
    typeof money === 'string' && isDecimalString(money) ? new Decimal(money) : new Decimal(0);
  resources['money'] = held.add(refund).toString();
  return { ...state, resources };
}

/**
 * v15 -> v16: one of each (DESIGN.md §4). Plots, slots and expansions are gone: every unlocked
 * tree kind and mine type produces once, at its level. The production part loses `logging` and
 * `mining` (plots, slots, expansions) and keeps unlocks and levels; the Money spent on the
 * expansions is paid back (each price of the old curve, rounded up).
 */
function v15ToV16(state: Record<string, unknown>): Record<string, unknown> {
  const production = isRecord(state['production']) ? state['production'] : {};
  const { logging, mining, ...kept } = production;
  let refund = new Decimal(0);
  for (const part of [logging, mining]) {
    refund = refund.add(curvePaid(V15_EXPANSION, isRecord(part) ? levelOf(part['expansions']) : 0));
  }
  return withMoney({ ...state, production: kept }, refund);
}

/** The Money curves of the three damage lines at save format 16 (combat.json): base and growth. */
const V16_DAMAGE_LINES = {
  copper_edge: { base: 10, growth: 1.11 },
  iron_edge: { base: 200, growth: 1.12 },
  crystal_edge: { base: 3000, growth: 1.13 },
} as const;
/** The six shelf upgrades that depended on the damage lines, with their Money price at format 16. */
const V16_DAMAGE_UPGRADES = {
  copper_temper: 5_000,
  copper_hardening: 1_000_000,
  iron_temper: 100_000,
  iron_hardening: 30_000_000,
  crystal_temper: 1_500_000,
  crystal_hardening: 1_000_000_000,
} as const;
/** The level cap of each tier from format 17 on (cardRules.json `levelCaps`); stars do not count. */
const V17_LEVEL_CAPS: Record<string, number> = { bronze: 20, silver: 40, gold: 60, prismatic: 80 };

/**
 * v18 -> v19: the Shield Warden card was removed (DESIGN.md §5: shields do not fit the weapon
 * cards). A saved Shield Warden is paid back in shards, 2 per star (its Rare shard value in
 * format 18), and its cosmetics, shard shop purchases and loadout slots are dropped.
 */
function v18ToV19(state: Record<string, unknown>): Record<string, unknown> {
  const REMOVED = 'shield_warden';
  const out: Record<string, unknown> = { ...state };
  if (isRecord(state['cards'])) {
    const cards = { ...state['cards'] };
    const owned = isRecord(cards['owned']) ? { ...cards['owned'] } : {};
    const card = owned[REMOVED];
    if (isRecord(card)) {
      const stars = Math.max(1, Math.floor(Number(card['stars']) || 1));
      cards['shards'] = Math.floor(Number(cards['shards']) || 0) + 2 * stars;
    }
    delete owned[REMOVED];
    cards['owned'] = owned;
    if (isRecord(cards['loadouts'])) {
      const loadouts: Record<string, unknown> = {};
      for (const [job, l] of Object.entries(cards['loadouts'])) {
        if (!isRecord(l)) {
          loadouts[job] = l;
          continue;
        }
        loadouts[job] = {
          ...l,
          main: l['main'] === REMOVED ? null : l['main'],
          supports: Array.isArray(l['supports'])
            ? l['supports'].map((id: unknown) => (id === REMOVED ? null : id))
            : l['supports'],
        };
      }
      cards['loadouts'] = loadouts;
    }
    out['cards'] = cards;
  }
  if (isRecord(state['cosmetics']) && isRecord(state['cosmetics']['loadout'])) {
    const loadout = state['cosmetics']['loadout'];
    if (isRecord(loadout['cards'])) {
      const perCard = { ...loadout['cards'] };
      delete perCard[REMOVED];
      out['cosmetics'] = { ...state['cosmetics'], loadout: { ...loadout, cards: perCard } };
    }
  }
  if (isRecord(state['shardShop'])) {
    const shop = { ...state['shardShop'] };
    delete shop['copy_shield_warden'];
    out['shardShop'] = shop;
  }
  return out;
}

/**
 * v17 -> v18: tiers, stars and the Unique tier (DESIGN.md §5). A card's `duplicates` became its
 * star bar fill, which starts at 0; tier, stars and level are kept. A card that showed the unique
 * item at Gold ★6 keeps its tier: the unique item now waits for the Unique tier.
 */
function v17ToV18(state: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(state['cards']) || !isRecord(state['cards']['owned'])) return { ...state };
  const cards = state['cards'];
  return {
    ...state,
    cards: {
      ...cards,
      owned: Object.fromEntries(
        Object.entries(cards['owned'] as Record<string, unknown>).map(([id, card]) => {
          if (!isRecord(card)) return [id, card];
          const rest: Record<string, unknown> = { ...card, starFill: 0 };
          delete rest['duplicates'];
          return [id, rest];
        }),
      ),
    },
  };
}

/**
 * v16 -> v17: damage comes from cards (DESIGN.md §5). The three damage lines (Copper, Iron and
 * Crystal Edge) and the six Temper / Hardening shelf upgrades are gone. The Money they cost is
 * paid back: every level of a line at its old price (`base * growth^n`, each rounded up like a
 * buy, before any modifier) and the price of every owned upgrade. A card above its tier's new
 * level cap is set to the cap with no XP, so it can tier up at once; stars are kept.
 */
function v16ToV17(state: Record<string, unknown>): Record<string, unknown> {
  let refund = new Decimal(0);
  const out: Record<string, unknown> = { ...state };

  if (isRecord(state['combat'])) {
    const { damageLevels, ...combat } = state['combat'];
    const levels = isRecord(damageLevels) ? damageLevels : {};
    for (const [id, curve] of Object.entries(V16_DAMAGE_LINES)) {
      refund = refund.add(curvePaid(curve, levelOf(levels[id])));
    }
    out['combat'] = combat;
  }

  if (isRecord(state['upgrades'])) {
    const owned = Array.isArray(state['upgrades']['owned']) ? state['upgrades']['owned'] : [];
    const gone = new Set(Object.keys(V16_DAMAGE_UPGRADES));
    for (const id of owned) {
      if (typeof id === 'string' && gone.has(id)) {
        refund = refund.add(V16_DAMAGE_UPGRADES[id as keyof typeof V16_DAMAGE_UPGRADES]);
      }
    }
    out['upgrades'] = {
      ...state['upgrades'],
      owned: owned.filter((id) => !(typeof id === 'string' && gone.has(id))),
    };
  }

  if (isRecord(state['cards']) && isRecord(state['cards']['owned'])) {
    const cards = state['cards'];
    out['cards'] = {
      ...cards,
      owned: Object.fromEntries(
        Object.entries(cards['owned'] as Record<string, unknown>).map(([id, card]) => {
          if (!isRecord(card)) return [id, card];
          const cap = V17_LEVEL_CAPS[String(card['tier'])];
          return cap !== undefined && levelOf(card['level']) > cap
            ? [id, { ...card, level: cap, xp: '0' }]
            : [id, card];
        }),
      ),
    };
  }

  return withMoney(out, refund);
}

/**
 * v14 -> v15: tree levels and the upgrade shelf (DESIGN.md §4). Trees get a level line like
 * the mines; every existing tree starts at level 0 and the plots are kept. No upgrade is owned,
 * and the lifetime Money earned starts at the Money held (the best known lower bound).
 */
function v14ToV15(state: Record<string, unknown>): Record<string, unknown> {
  const production = isRecord(state['production']) ? state['production'] : {};
  const resources = isRecord(state['resources']) ? state['resources'] : {};
  const money = resources['money'];
  const held = typeof money === 'string' && isDecimalString(money) ? money : '0';
  return {
    ...state,
    production: { ...production, treeLevels: {} },
    upgrades: { owned: [], moneyEarned: held },
  };
}

/** The Money curves of save format 14 (a snapshot of the prices of DESIGN.md §3): base and growth. */
const V14_MONEY_CURVES = {
  mines: {
    copper_quarry: { base: 15, growth: 1.3 },
    iron_deeps: { base: 200, growth: 1.32 },
    crystal_grotto: { base: 2500, growth: 1.34 },
  },
} as const;
/** Money a brand-new game starts with at save format 14 (resources.json `startAmount`). */
const V14_START_MONEY = 100;

/** Price of the first `count` purchases of an exponential curve. */
function curveSum(curve: { base: number; growth: number }, count: number): Decimal {
  const n = Math.max(0, Math.floor(count));
  if (!(n > 0)) return new Decimal(0);
  const g = new Decimal(curve.growth);
  return new Decimal(curve.base).mul(g.pow(n).sub(1)).div(g.sub(1));
}

const levelOf = (value: unknown): number => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * v13 -> v14: the three loops (DESIGN.md §3). Money buys mine levels, plots / slots and damage
 * lines (they cost gems before); the Moss and Ember Sigils became the Summon and Glamour
 * Crystal; the Frost Sigil is a material with the same id. Levels are kept, and the Money the mine
 * levels would cost now is paid back on top of the starting Money, so nothing feels lost. Plots,
 * slots and damage lines are kept too; their Money is paid back once, by v15 -> v16 and v16 -> v17,
 * when they go away.
 * Ids that were about sigils are renamed (skill, Starlight shop item, shard shop bundles).
 */
function v13ToV14(state: Record<string, unknown>): Record<string, unknown> {
  const resources = isRecord(state['resources']) ? { ...state['resources'] } : {};
  const moved = renameKeys(resources, {
    moss_sigil: 'summon_crystal',
    ember_sigil: 'glamour_crystal',
  }) as Record<string, unknown>;

  const production = isRecord(state['production']) ? state['production'] : {};
  const mineLevels = isRecord(production['mineLevels']) ? production['mineLevels'] : {};
  let refund = new Decimal(0);
  for (const [id, curve] of Object.entries(V14_MONEY_CURVES.mines)) {
    refund = refund.add(curveSum(curve, levelOf(mineLevels[id])));
  }
  const held =
    typeof moved['money'] === 'string' && isDecimalString(moved['money'])
      ? new Decimal(moved['money'])
      : new Decimal(0);
  moved['money'] = held.add(V14_START_MONEY).add(refund).toString();

  const out: Record<string, unknown> = { ...state, resources: moved };
  if (isRecord(state['account'])) {
    out['account'] = {
      ...state['account'],
      skills: renameKeys(state['account']['skills'], { sigil_luck: 'crystal_luck' }),
    };
  }
  if (isRecord(state['prestige'])) {
    out['prestige'] = {
      ...state['prestige'],
      shop: renameKeys(state['prestige']['shop'], {
        constellation_sigils: 'constellation_crystals',
      }),
    };
  }
  if ('shardShop' in state) {
    out['shardShop'] = renameKeys(state['shardShop'], {
      moss_sigils: 'summon_crystals',
      ember_sigils: 'glamour_crystals',
    });
  }
  return out;
}

/**
 * v12 -> v13: the account (DESIGN.md §10a) and card enhancements (10b). Accounts start at level
 * 1 with no XP and no skills (XP is earned from now on); no card has enhancements yet.
 */
function v12ToV13(state: Record<string, unknown>): Record<string, unknown> {
  const cards = isRecord(state['cards']) ? state['cards'] : {};
  const owned = isRecord(cards['owned']) ? cards['owned'] : {};
  return {
    ...state,
    account: { xp: '0', level: 1, skills: {}, freeRespecsUsed: 0 },
    cards: {
      ...cards,
      owned: Object.fromEntries(
        Object.entries(owned).map(([id, c]) => [id, isRecord(c) ? { ...c, enhancements: [] } : c]),
      ),
    },
  };
}

/** The cosmetics dungeons drop as their rare item, at save format 10 (a snapshot). */
const V10_DROPPED_COSMETICS = ['holo_hex', 'holo_waves', 'prism_pointer'] as const;

/**
 * v10 -> v11: the Wardrobe (DESIGN.md §8). Rare drops that are cosmetics used to sit in the
 * inventory; now they are owned. The first copy owns the item, the rest are duplicates for its
 * upgrade levels. The inventory counts stay (they are the drop history).
 */
function v10ToV11(state: Record<string, unknown>): Record<string, unknown> {
  const inventory = isRecord(state['inventory']) ? state['inventory'] : {};
  const cosmetics = isRecord(state['cosmetics']) ? state['cosmetics'] : {};
  const owned = isRecord(cosmetics['owned']) ? { ...cosmetics['owned'] } : {};
  for (const id of V10_DROPPED_COSMETICS) {
    const n = Math.floor(Number(inventory[id] ?? 0));
    if (!(n > 0)) continue;
    const had = owned[id];
    if (isRecord(had)) {
      owned[id] = { ...had, copies: Number(had['copies'] ?? 0) + n };
    } else {
      owned[id] = { level: 1, copies: n - 1 };
    }
  }
  return { ...state, cosmetics: { ...cosmetics, owned } };
}

/** Production gem ids at save format 7 (a snapshot, like the other steps). */
const V7_GEMS = [
  'oak_gem',
  'ironbark_gem',
  'moonwillow_gem',
  'copper_gem',
  'iron_gem',
  'grotto_gem',
] as const;

/**
 * v7 -> v8: gem mastery (DESIGN.md §4). Each gem's lifetime total starts at the amount owned.
 * Settled tiers are left out: loading fills them in from the totals and kills (they need the
 * thresholds from the content).
 */
function v7ToV8(state: Record<string, unknown>): Record<string, unknown> {
  const resources = isRecord(state['resources']) ? state['resources'] : {};
  const harvested: Record<string, string> = {};
  for (const id of V7_GEMS) {
    const amount = resources[id];
    if (typeof amount === 'string' && isDecimalString(amount)) harvested[id] = amount;
  }
  return { ...state, mastery: { harvested } };
}

/** v6 -> v7: card health (DESIGN.md §6). Loadouts start at full health and not knocked out. */
function v6ToV7(state: Record<string, unknown>): Record<string, unknown> {
  const combat = isRecord(state['combat']) ? state['combat'] : {};
  return { ...state, combat: { ...combat, loadoutDamage: '0', knockoutSeconds: 0 } };
}

/**
 * v5 -> v6: the woods and ores became gems (DESIGN.md §12, "Resources are carved gems"). Only the
 * ids changed; amounts carry over one to one. Ids are a snapshot of the v0.3 data.
 */
function v5ToV6(state: Record<string, unknown>): Record<string, unknown> {
  return { ...state, resources: renameKeys(state['resources'], GEM_RESOURCES) };
}

const GEM_RESOURCES: Record<string, string> = {
  oak_wood: 'oak_gem',
  ironwood: 'ironbark_gem',
  moonwood: 'moonwillow_gem',
  copper_ore: 'copper_gem',
  iron_ore: 'iron_gem',
  crystal_ore: 'grotto_gem',
};

/**
 * v4 -> v5: cards (Phase 6). Earlier saves owned no cards; they get the three Common cards at
 * Bronze ★1 Lv 1, each leading its job, like a new game. The placeholder example cards were
 * replaced by the beta cards: the Ember Crown (worn on the example main card) now belongs to
 * Dawnblade Regent, so per-card cosmetics move with it. Ids are a snapshot of the v0.3 data.
 */
function v4ToV5(state: Record<string, unknown>): Record<string, unknown> {
  const card = () => ({ tier: 'bronze', stars: 1, level: 1, xp: '0', duplicates: 0 });
  const lead = (main: string) => ({ main, supports: [null, null, null] });
  const cosmetics = isRecord(state['cosmetics']) ? state['cosmetics'] : null;
  const loadout = cosmetics && isRecord(cosmetics['loadout']) ? cosmetics['loadout'] : null;
  const migratedCosmetics =
    cosmetics && loadout
      ? {
          ...cosmetics,
          loadout: {
            ...loadout,
            cards: renameKeys(loadout['cards'], {
              example_fighting_main: 'dawnblade_regent',
              example_fighting_support: 'shield_warden',
            }),
          },
        }
      : state['cosmetics'];
  return {
    ...state,
    cosmetics: migratedCosmetics,
    cards: {
      owned: { ember_squire: card(), apprentice_feller: card(), cave_digger: card() },
      loadouts: {
        fighting: lead('ember_squire'),
        logging: lead('apprentice_feller'),
        mining: lead('cave_digger'),
      },
      shards: 0,
    },
  };
}

/**
 * v3 -> v4: combat (Phase 5). The single `damage` number became damage upgrade levels (nothing
 * could buy damage before, so it was always the starting value); kills per dungeon, the special
 * dungeon attempt and burst gauges were added. Bosses only existed in the Mossy Cellar before, so
 * every earlier kill counts there, and a save with a kill has cleared it (unlocking Iron Deeps).
 * Boss HP is respawned because the boss numbers changed.
 */
function v3ToV4(state: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...state };
  delete rest['damage'];
  const stats = isRecord(state['stats']) ? state['stats'] : {};
  const kills = Math.max(0, Math.floor(Number(stats['bossKills'] ?? 0)) || 0);
  const cleared = Array.isArray(state['clearedDungeons']) ? [...state['clearedDungeons']] : [];
  if (kills > 0 && !cleared.includes('mossy_cellar')) cleared.push('mossy_cellar');
  const gauge = () => ({ gauge: 0, timer: 0 });
  return {
    ...rest,
    clearedDungeons: cleared,
    bossHp: null,
    combat: {
      damageLevels: {},
      kills: kills > 0 ? { mossy_cellar: kills } : {},
      trialAttempt: { elapsedSeconds: 0, dealt: '0' },
      trialBest: {},
    },
    bursts: { fighting: gauge(), logging: gauge(), mining: gauge() },
  };
}

/**
 * v2 -> v3: production moved from "producer id -> plot count" to plots/slots with chosen
 * contents, expansions, unlocked tree kinds and mine levels; dungeon clears are recorded; the
 * placeholder content (example_*) was replaced by the beta content. Ids are a snapshot of the
 * v0.2 and v0.3 data, so this step keeps working whatever the content becomes later.
 */
function v2ToV3(state: Record<string, unknown>): Record<string, unknown> {
  const { producers, ...rest } = state;
  const counts = isRecord(producers) ? producers : {};
  // v0.2 had one start plot per job and no way to buy more; anything above one is an expansion.
  const job = (legacyId: string, newId: string) => {
    const n = Math.max(1, Math.floor(Number(counts[legacyId] ?? 0)) || 0);
    return { expansions: n - 1, plots: Array<string>(n).fill(newId) };
  };
  return {
    ...rest,
    resources: renameKeys(state['resources'], LEGACY_RESOURCES),
    pity: renameKeys(state['pity'], { example_boss: 'root_warden' }),
    activeDungeonId:
      state['activeDungeonId'] === 'example_dungeon' ? 'mossy_cellar' : state['activeDungeonId'],
    production: {
      logging: job('example_tree', 'oak'),
      mining: job('example_mine', 'copper_quarry'),
      unlockedTrees: [],
      mineLevels: {},
    },
    clearedDungeons: [],
  };
}

const LEGACY_RESOURCES: Record<string, string> = {
  example_wood: 'oak_wood',
  example_ore: 'copper_ore',
  example_portal_shard: 'moss_sigil',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Copies a record with some keys renamed; non-records are returned as they are. */
function renameKeys(value: unknown, names: Record<string, string>): unknown {
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [names[k] ?? k, v]));
}

/** Runs every step from `fromVersion` up to `targetVersion`, in order. */
export function migrateState(
  state: unknown,
  fromVersion: number,
  targetVersion: number,
  table: MigrationTable,
): unknown {
  if (!Number.isInteger(fromVersion) || fromVersion < 1) {
    throw new SaveError('invalid-format', `Invalid save version: ${String(fromVersion)}`);
  }
  if (fromVersion > targetVersion) {
    throw new SaveError(
      'future-version',
      `This save is from a newer version of the game (save format ${fromVersion}, this app supports up to ${targetVersion}). Update the game to load it.`,
    );
  }

  let current = state;
  for (let version = fromVersion; version < targetVersion; version++) {
    const step = table[version];
    if (!step) {
      throw new SaveError(
        'missing-migration',
        `No migration from save format ${version} to ${version + 1}.`,
      );
    }
    if (typeof current !== 'object' || current === null || Array.isArray(current)) {
      throw new SaveError('invalid-format', 'Save data is not an object.');
    }
    current = step(current as Record<string, unknown>);
  }
  return current;
}

/** The cosmetics that left the game at save format 28 (a snapshot): the attack slot, every finish, tick and number item, and the Prism Pointer. */
const V28_REMOVED_COSMETICS: ReadonlySet<string> = new Set([
  'gn_finish',
  'gn_attack',
  'gn_tick',
  'gn_number',
  'gt_finish',
  'gt_attack',
  'gt_tick',
  'gt_number',
  'aurora_veil',
  'holo_hex',
  'holo_waves',
  'prism_pointer',
  'verdant_finish',
  'verdant_attack',
  'verdant_tick',
  'verdant_number',
  'vine_finish',
  'vine_attack',
  'vine_tick',
  'vine_number',
  'fern_finish',
  'fern_attack',
  'fern_tick',
  'fern_number',
  'moss_finish',
  'moss_attack',
  'moss_tick',
  'moss_number',
  'blossom_finish',
  'blossom_attack',
  'blossom_tick',
  'blossom_number',
  'core_pulse',
  'power_veins',
  'hex_core',
  'magma_strata',
  'starburst',
  'forge_number',
  'forge_attack',
  'forge_tick',
  'woodcraft_number',
  'woodcraft_attack',
  'woodcraft_tick',
  'starmap_number',
  'starmap_attack',
  'starmap_tick',
  'candy_number',
  'candy_attack',
  'candy_tick',
  'rune_number',
  'rune_attack',
  'rune_tick',
]);
/** The four free starters among them: owned by every save, so nothing is refunded for them. */
const V28_REMOVED_STARTERS: ReadonlySet<string> = new Set([
  'gn_attack',
  'gn_finish',
  'gn_tick',
  'gn_number',
]);
/** The legacy bow skins that left the game at save format 28 (a snapshot). */
const V28_REMOVED_SKINS: ReadonlySet<string> = new Set([
  'legacy-bow-56',
  'legacy-bow-57',
  'legacy-bow-58',
]);
/** What each removed item refunds, per copy owned: the Legacy Gate's duplicate payback, a fifth of a Glamour Scroll (DESIGN.md §7, §8). */
const V28_REFUND_SCROLLS = new Decimal(0.2);

/**
 * v27 -> v28: the cosmetics review (DESIGN.md §8). Removed cosmetics and the three removed bow
 * skins are unequipped and dropped from the owned lists, and each owned copy (the item and its
 * duplicates; not the free starters) pays back a fifth of a Glamour Scroll. The attack slot's
 * loadout entries go with it.
 */
function v27ToV28(state: Record<string, unknown>): Record<string, unknown> {
  const cosmetics = isRecord(state['cosmetics']) ? state['cosmetics'] : {};
  const owned = isRecord(cosmetics['owned']) ? cosmetics['owned'] : {};
  const loadout = isRecord(cosmetics['loadout']) ? cosmetics['loadout'] : {};
  let refunded = new Decimal(0);

  const keptOwned: Record<string, unknown> = {};
  for (const [id, entry] of Object.entries(owned)) {
    if (!V28_REMOVED_COSMETICS.has(id)) {
      keptOwned[id] = entry;
      continue;
    }
    if (V28_REMOVED_STARTERS.has(id)) continue;
    const copies = isRecord(entry) && typeof entry['copies'] === 'number' ? entry['copies'] : 0;
    refunded = refunded.add(V28_REFUND_SCROLLS.mul(1 + Math.max(0, copies)));
  }

  const worn = (eq: unknown): boolean =>
    isRecord(eq) && typeof eq['id'] === 'string' && V28_REMOVED_COSMETICS.has(eq['id']);
  const cleanSlots = (slots: unknown): Record<string, unknown> =>
    Object.fromEntries(
      Object.entries(isRecord(slots) ? slots : {}).filter(
        ([slot, eq]) => slot !== 'attack' && !worn(eq),
      ),
    );
  const cleanCards: Record<string, unknown> = {};
  for (const [card, slots] of Object.entries(isRecord(loadout['cards']) ? loadout['cards'] : {})) {
    const kept = cleanSlots(slots);
    if (Object.keys(kept).length > 0) cleanCards[card] = kept;
  }

  const legacy = Array.isArray(state['legacySkins']) ? state['legacySkins'] : [];
  const keptSkins = legacy.filter((id) => !(typeof id === 'string' && V28_REMOVED_SKINS.has(id)));
  refunded = refunded.add(V28_REFUND_SCROLLS.mul(legacy.length - keptSkins.length));
  const worn_skins = isRecord(state['weaponSkins']) ? state['weaponSkins'] : {};
  const weaponSkins = Object.fromEntries(
    Object.entries(worn_skins).filter(
      ([, skin]) => !(typeof skin === 'string' && V28_REMOVED_SKINS.has(skin)),
    ),
  );

  const resources = isRecord(state['resources']) ? { ...state['resources'] } : {};
  if (refunded.gt(0)) {
    const held = resources['glamour_scroll'];
    const had =
      typeof held === 'string' && isDecimalString(held) ? new Decimal(held) : new Decimal(0);
    resources['glamour_scroll'] = had.add(refunded).toString();
  }
  return {
    ...state,
    resources,
    legacySkins: keptSkins,
    weaponSkins,
    cosmetics: {
      ...cosmetics,
      owned: keptOwned,
      loadout: { ...loadout, slots: cleanSlots(loadout['slots']), cards: cleanCards },
    },
  };
}
