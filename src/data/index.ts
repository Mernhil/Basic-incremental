import { COSMETIC_SLOTS, JOBS, RANK_TIERS, RARITIES, contentSchemas } from './schemas';
import type {
  Card,
  CardRules,
  CombatConfig,
  Cosmetic,
  CosmeticSet,
  CosmeticSlot,
  Dungeon,
  Mine,
  ModifierData,
  Portal,
  PrestigeConfig,
  CosmeticRules,
  Achievement,
  ShardShopItem,
  AccountConfig,
  EnhancementsConfig,
  ProductionConfig,
  Progression,
  Rarity,
  RarityStyle,
  Resource,
  Tree,
  Trial,
  Upgrade,
  UpgradesConfig,
  WearRules,
  WeaponSkin,
  WeaponSkinSet,
  ItemsData,
  ItemType,
  RankTier,
} from './schemas';
import resourcesJson from './content/resources.json';
import treesJson from './content/trees.json';
import minesJson from './content/mines.json';
import productionJson from './content/production.json';
import cardsJson from './content/cards.json';
import cardRulesJson from './content/cardRules.json';
import dungeonsJson from './content/dungeons.json';
import trialsJson from './content/trials.json';
import combatJson from './content/combat.json';
import cosmeticsJson from './content/cosmetics.json';
import portalsJson from './content/portals.json';
import raritiesJson from './content/rarities.json';
import wearRulesJson from './content/wearRules.json';
import setsJson from './content/sets.json';
import progressionJson from './content/progression.json';
import prestigeJson from './content/prestige.json';
import cosmeticRulesJson from './content/cosmeticRules.json';
import achievementsJson from './content/achievements.json';
import accountJson from './content/account.json';
import enhancementsJson from './content/enhancements.json';
import upgradesJson from './content/upgrades.json';
import weaponSkinsJson from './content/weaponSkins.json';
import itemsJson from './content/items.json';

export * from './schemas';

export interface Content {
  resources: Resource[];
  trees: Tree[];
  mines: Mine[];
  production: ProductionConfig;
  cards: Card[];
  /** Card progression numbers (levels, star-ups, tier-ups, costs, drops). */
  cardRules: CardRules;
  /** The dungeons in the game. */
  dungeons: Dungeon[];
  /** Every dungeon, including those waiting for their theme (`enabled: false`, placeholder
   *  names and drops; DESIGN.md §6 Three new dungeons). */
  allDungeons: Dungeon[];
  /** Special dungeons (strength tests). Their ids share the dungeon id space. */
  trials: Trial[];
  combat: CombatConfig;
  cosmetics: Cosmetic[];
  portals: Portal[];
  rarities: RarityStyle[];
  wearRules: WearRules;
  sets: CosmeticSet[];
  /** Mastery, tile stages, evolutions and goal rules (DESIGN.md §4, §10, §12). */
  progression: Progression;
  /** Ascension: Starlight gain, the Starlight shop and prestige cosmetics (DESIGN.md §9). */
  prestige: PrestigeConfig;
  /** Cosmetic upgrade levels: max level by rarity, ladders, costs (DESIGN.md §8). */
  cosmeticRules: CosmeticRules;
  /** Every portal, including those waiting for their screen (`enabled: false`); `portals`
   *  holds only the open ones. */
  allPortals: Portal[];
  /** Achievements and their rewards (DESIGN.md §10). */
  achievements: Achievement[];
  /** Shard shop stock (card shards). */
  shardShop: ShardShopItem[];
  /** Account XP, levels, reward track, account tree and respec (DESIGN.md §10a, 16 E7). */
  account: AccountConfig;
  /** Card enhancements (DESIGN.md §10b). */
  enhancements: EnhancementsConfig;
  /** The upgrade shelf: one-time Money multipliers that appear at a threshold (DESIGN.md §4). */
  upgrades: UpgradesConfig;
  /** Weapon skins: alternate art per weapon kind (weaponSkins.json). */
  weaponSkins: WeaponSkinSet[];
  /** Item types: names per tier and which Heirlooms are open (items.json). */
  items: ItemsData;
  /** Item type by kind. */
  itemTypeByKind: ReadonlyMap<string, ItemType>;
  resourceById: ReadonlyMap<string, Resource>;
  dungeonById: ReadonlyMap<string, Dungeon>;
  trialById: ReadonlyMap<string, Trial>;
  upgradeById: ReadonlyMap<string, Upgrade>;
  treeById: ReadonlyMap<string, Tree>;
  mineById: ReadonlyMap<string, Mine>;
  cardById: ReadonlyMap<string, Card>;
  cosmeticById: ReadonlyMap<string, Cosmetic>;
  rarityById: ReadonlyMap<Rarity, RarityStyle>;
  setById: ReadonlyMap<string, CosmeticSet>;
  /** Weapon kind -> its skins and base art. */
  weaponSkinsByWeapon: ReadonlyMap<string, WeaponSkinSet>;
  /** Legacy skin id -> the weapon kind it is worn on and the skin (weaponSkins.json). */
  legacySkinById: ReadonlyMap<string, { weapon: string; skin: WeaponSkin }>;
  /** The starter item of each slot (validated: exactly one per slot). */
  starterBySlot: Readonly<Record<CosmeticSlot, Cosmetic>>;
}

export type RawContent = { [K in keyof typeof contentSchemas]: unknown };

/** Thrown when content data is malformed. `issues` is one human-readable line per problem. */
export class ContentValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(
      `Invalid game data (${issues.length} problem${issues.length === 1 ? '' : 's'}):\n` +
        issues.map((i) => `  - ${i}`).join('\n'),
    );
    this.name = 'ContentValidationError';
  }
}

/** Validates raw content (schemas + cross-references) and returns typed content. */
export function validateContent(raw: RawContent, options: ContentOptions = {}): Content {
  const issues: string[] = [];
  const parsed = {} as {
    [K in keyof typeof contentSchemas]: ReturnType<(typeof contentSchemas)[K]['parse']>;
  };

  for (const key of Object.keys(contentSchemas) as (keyof typeof contentSchemas)[]) {
    const result = contentSchemas[key].safeParse(raw[key]);
    if (result.success) {
      (parsed as Record<string, unknown>)[key] = result.data;
    } else {
      for (const issue of result.error.issues) {
        const path = issue.path.map((p) => (typeof p === 'number' ? `[${p}]` : String(p)));
        issues.push([`${key}.json`, ...path].join(' › ') + `: ${issue.message}`);
      }
    }
  }
  if (issues.length > 0) throw new ContentValidationError(issues);

  const {
    resources,
    trees,
    mines,
    production,
    cards,
    cardRules,
    dungeons,
    trials,
    combat,
    cosmetics,
    portals,
    rarities,
    wearRules,
    sets,
    progression,
    prestige,
    cosmeticRules,
    achievements: achievementsFile,
    account,
    enhancements,
    upgrades,
    weaponSkins,
    items,
  } = parsed;
  const { achievements, shardShop } = achievementsFile;
  checkReferences({ resources, trees, mines, cards, dungeons, cosmetics, portals }, issues);
  checkCombat({ resources, dungeons, trials, combat }, issues);
  checkProduction({ resources, trees, mines, production }, issues);
  checkCosmetics(cosmetics, rarities, issues);
  checkSets(cosmetics, sets, issues);
  checkCards({ resources, cards, cardRules }, issues);
  checkItems({ cards, items }, issues);
  checkPrestige({ resources, cosmetics, prestige }, issues);
  checkAchievements(
    { resources, cosmetics, cards, dungeons, trials, achievements, shardShop },
    issues,
  );
  checkAccount({ resources, cosmetics, cards, account, enhancements }, issues);
  checkUpgrades({ resources, trees, mines, dungeons, combat, upgrades }, issues);
  checkCosmeticSources(
    { resources, cosmetics, dungeons, portals, prestige, cards, achievements, shardShop, account },
    issues,
  );
  for (const [step, cost] of Object.entries(cosmeticRules.materials)) {
    if (!resources.some((r) => r.id === cost.resource)) {
      issues.push(
        `cosmeticRules.json › materials › ${step} › resource: unknown resource "${cost.resource}"`,
      );
    }
  }
  checkWeaponSkins(weaponSkins, issues);
  checkLegacyGates(weaponSkins, portals, issues);
  checkModifiers(
    {
      resources,
      trees,
      mines,
      dungeons,
      trials,
      portals,
      cosmetics,
      sets,
      cards,
      cardRules,
      prestige,
      account,
      enhancements,
      upgrades,
    },
    issues,
  );
  if (issues.length > 0) throw new ContentValidationError(issues);

  // Dungeons without a theme yet stay out of the game unless asked for (dev builds).
  const openDungeons = options.unreleased ? dungeons : dungeons.filter((d) => d.enabled);

  const starterBySlot = Object.fromEntries(
    COSMETIC_SLOTS.map((slot) => [slot, cosmetics.find((c) => c.starter && c.slot === slot)!]),
  ) as Record<CosmeticSlot, Cosmetic>;

  return {
    resources,
    trees,
    mines,
    production,
    cards,
    cardRules,
    dungeons: openDungeons,
    allDungeons: dungeons,
    trials,
    combat,
    cosmetics,
    portals: portals.filter((p) => p.enabled),
    allPortals: portals,
    rarities,
    wearRules,
    sets,
    progression,
    prestige,
    cosmeticRules,
    achievements,
    shardShop,
    account,
    enhancements,
    upgrades,
    weaponSkins,
    items,
    itemTypeByKind: new Map(items.types.map((t) => [t.kind, t])),
    resourceById: new Map(resources.map((r) => [r.id, r])),
    dungeonById: new Map(openDungeons.map((d) => [d.id, d])),
    trialById: new Map(trials.map((t) => [t.id, t])),
    upgradeById: new Map(upgrades.upgrades.map((u) => [u.id, u])),
    treeById: new Map(trees.map((t) => [t.id, t])),
    mineById: new Map(mines.map((m) => [m.id, m])),
    cardById: new Map(cards.map((x) => [x.id, x])),
    cosmeticById: new Map(cosmetics.map((x) => [x.id, x])),
    rarityById: new Map(rarities.map((r) => [r.id, r])),
    setById: new Map(sets.map((x) => [x.id, x])),
    weaponSkinsByWeapon: new Map(weaponSkins.map((w) => [w.weapon, w])),
    legacySkinById: new Map(
      weaponSkins.flatMap((w) =>
        w.skins.filter((k) => k.legacy).map((k) => [k.id, { weapon: w.weapon, skin: k }] as const),
      ),
    ),
    starterBySlot,
  };
}

function checkProduction(
  c: Pick<Content, 'resources' | 'trees' | 'mines' | 'production'>,
  issues: string[],
): void {
  const resources = new Map(c.resources.map((r) => [r.id, r]));
  const checkCost = (where: string, resource: string, kind: Resource['kind']): void => {
    const res = resources.get(resource);
    if (!res) issues.push(`${where}: unknown resource "${resource}"`);
    else if (res.kind !== kind)
      issues.push(`${where}: "${resource}" is ${res.kind}, expected ${kind}`);
  };

  // Tree kinds are unlocked with tree gems (DESIGN.md §4).
  c.trees.forEach((tree, i) =>
    tree.unlockCost.forEach((cost, j) =>
      checkCost(`trees.json › [${i}] › unlockCost › [${j}] › resource`, cost.resource, 'tree_gem'),
    ),
  );
  // Tree levels and mine levels are bought with Money (DESIGN.md §4, §3).
  c.trees.forEach((tree, i) =>
    checkCost(
      `trees.json › [${i}] › level › cost › resource`,
      tree.level.cost.resource,
      'currency',
    ),
  );
  c.mines.forEach((mine, i) =>
    checkCost(
      `mines.json › [${i}] › level › cost › resource`,
      mine.level.cost.resource,
      'currency',
    ),
  );

  // Producer ids are shared by modifier scopes and harvest targets, so they must be unique.
  const treeIds = new Set(c.trees.map((t) => t.id));
  c.mines.forEach((mine, i) => {
    if (treeIds.has(mine.id)) {
      issues.push(`mines.json › [${i}] › id: "${mine.id}" is already a tree id`);
    }
  });

  // Every kind produces once it is unlocked, so each job needs one from the start.
  if (!c.trees.some((t) => t.unlockCost.length === 0)) {
    issues.push('trees.json: at least one tree must be unlocked from the start (no unlockCost)');
  }
  if (!c.mines.some((m) => m.unlockedByDungeon === null)) {
    issues.push('mines.json: at least one mine must be available from the start');
  }
}

function checkCosmetics(cosmetics: Cosmetic[], rarities: RarityStyle[], issues: string[]): void {
  for (const slot of COSMETIC_SLOTS) {
    const starters = cosmetics.filter((c) => c.starter && c.slot === slot);
    if (starters.length !== 1) {
      issues.push(
        `cosmetics.json: slot "${slot}" needs exactly one starter item, found ${starters.length}`,
      );
    }
  }
  // A set has at most one item per slot, so "fully equipped" is well defined.
  const seen = new Map<string, number>();
  cosmetics.forEach((c, i) => {
    if (!c.set) return;
    const key = `${c.set}/${c.slot}`;
    const first = seen.get(key);
    if (first !== undefined) {
      issues.push(
        `cosmetics.json › [${i}] › set: set "${c.set}" already has a ${c.slot} item (at [${first}])`,
      );
    } else {
      seen.set(key, i);
    }
  });
  for (const rarity of RARITIES) {
    const count = rarities.filter((r) => r.id === rarity).length;
    if (count !== 1) {
      issues.push(`rarities.json: rarity "${rarity}" needs exactly one entry, found ${count}`);
    }
  }
}

function checkSets(cosmetics: Cosmetic[], sets: CosmeticSet[], issues: string[]): void {
  const ids = new Set<string>();
  sets.forEach((set, i) => {
    if (ids.has(set.id)) issues.push(`sets.json › [${i}] › id: duplicate id "${set.id}"`);
    ids.add(set.id);
    if (!cosmetics.some((c) => c.set === set.id)) {
      issues.push(`sets.json › [${i}] › id: no cosmetic belongs to set "${set.id}"`);
    }
  });
  cosmetics.forEach((c, i) => {
    if (c.set && !ids.has(c.set)) {
      issues.push(`cosmetics.json › [${i}] › set: unknown set "${c.set}" (add it to sets.json)`);
    }
  });
}

/** Upgrade shelf rules (DESIGN.md §4): unlock conditions and the cost name things that exist,
 *  and a permanent upgrade is unlocked by progress that an ascension keeps. */
function checkUpgrades(
  c: Pick<Content, 'resources' | 'trees' | 'mines' | 'dungeons' | 'combat' | 'upgrades'>,
  issues: string[],
): void {
  const resources = new Map(c.resources.map((r) => [r.id, r]));
  const seen = new Set<string>();
  const currency = resources.get(c.upgrades.currency);
  if (currency?.kind !== 'currency') {
    issues.push(`upgrades.json › currency: "${c.upgrades.currency}" must be a currency resource`);
  }
  c.upgrades.upgrades.forEach((u, i) => {
    const where = `upgrades.json › upgrades › [${i}]`;
    if (seen.has(u.id)) issues.push(`${where} › id: duplicate "${u.id}"`);
    seen.add(u.id);
    if (u.cost.resource !== c.upgrades.currency) {
      issues.push(`${where} › cost › resource: must be "${c.upgrades.currency}"`);
    }
    const k = u.unlock;
    const missing = (what: string, ok: boolean, value: string): void => {
      if (!ok) issues.push(`${where} › unlock: unknown ${what} "${value}"`);
    };
    if (k.kind === 'treeLevel')
      missing(
        'tree',
        c.trees.some((t) => t.id === k.tree),
        k.tree,
      );
    if (k.kind === 'mineLevel')
      missing(
        'mine',
        c.mines.some((m) => m.id === k.mine),
        k.mine,
      );
    if (k.kind === 'bossKills') {
      missing(
        'dungeon',
        c.dungeons.some((d) => d.id === k.dungeon),
        k.dungeon,
      );
    }
    if (k.kind === 'gemMastery') {
      const gem = resources.get(k.gem);
      missing('gem', gem?.kind === 'tree_gem' || gem?.kind === 'mine_gem', k.gem);
    }
    if (u.permanent && (k.kind === 'treeLevel' || k.kind === 'mineLevel')) {
      issues.push(
        `${where} › permanent: tree and mine levels reset, so their upgrades cannot be permanent`,
      );
    }
  });
}

/** Modifier scopes must name things that exist, so a typo never silently disables a buff. */
function checkModifiers(
  c: Pick<
    Content,
    | 'resources'
    | 'trees'
    | 'mines'
    | 'dungeons'
    | 'trials'
    | 'portals'
    | 'cosmetics'
    | 'sets'
    | 'cards'
    | 'cardRules'
    | 'prestige'
    | 'account'
    | 'enhancements'
    | 'upgrades'
  >,
  issues: string[],
): void {
  const known = {
    producer: new Set([...c.trees, ...c.mines].map((x) => x.id)),
    resource: new Set(c.resources.map((x) => x.id)),
    dungeon: new Set([...c.dungeons, ...c.trials].map((x) => x.id)),
    portal: new Set(c.portals.map((x) => x.id)),
  };
  const check = (where: string, modifiers: ModifierData[]): void => {
    modifiers.forEach((m, j) => {
      for (const key of ['producer', 'resource', 'dungeon', 'portal'] as const) {
        const value = m.scope?.[key];
        if (value !== undefined && !known[key].has(value)) {
          issues.push(`${where} › [${j}] › scope › ${key}: unknown ${key} "${value}"`);
        }
      }
    });
  };
  c.cosmetics.forEach((x, i) =>
    check(`cosmetics.json › [${i}] › ownedModifiers`, x.ownedModifiers),
  );
  c.sets.forEach((x, i) => check(`sets.json › [${i}] › modifiers`, x.modifiers));
  c.cards.forEach((x, i) => {
    check(`cards.json › [${i}] › main › modifiers`, x.main.modifiers);
    check(`cards.json › [${i}] › support › modifiers`, x.support.modifiers);
  });
  for (const job of JOBS) {
    check(`cardRules.json › mainGrowth › ${job}`, c.cardRules.mainGrowth[job]);
  }
  c.upgrades.upgrades.forEach((x, i) =>
    check(`upgrades.json › upgrades › [${i}] › effects`, x.effects),
  );
  c.prestige.shop.forEach((x, i) => check(`prestige.json › shop › [${i}] › perLevel`, x.perLevel));
  c.account.tree.forEach((x, i) => check(`account.json › tree › [${i}] › perRank`, x.perRank));
  for (const [card, options] of Object.entries(c.enhancements.cards)) {
    options.forEach((o, i) =>
      check(`enhancements.json › cards › ${card} › [${i}] › modifiers`, o.modifiers),
    );
  }
}

/** The account tree, reward track and enhancement lists name things that exist. */
function checkAccount(
  c: Pick<Content, 'resources' | 'cosmetics' | 'cards' | 'account' | 'enhancements'>,
  issues: string[],
): void {
  const ids = new Set(c.account.tree.map((n) => n.id));
  const seen = new Set<string>();
  c.account.tree.forEach((n, i) => {
    if (seen.has(n.id)) issues.push(`account.json › tree › [${i}] › id: duplicate "${n.id}"`);
    seen.add(n.id);
    n.requires.forEach((r, j) => {
      if (!ids.has(r) || r === n.id) {
        issues.push(`account.json › tree › [${i}] › requires › [${j}]: unknown node "${r}"`);
      }
    });
  });
  const resources = new Set(c.resources.map((x) => x.id));
  const cosmetics = new Set(c.cosmetics.map((x) => x.id));
  const levels = new Set<number>();
  c.account.rewardTrack.forEach((e, i) => {
    const where = `account.json › rewardTrack › [${i}]`;
    if (e.level > c.account.levels.maxLevel) issues.push(`${where} › level: above the max level`);
    if (levels.has(e.level)) issues.push(`${where} › level: level ${e.level} is listed twice`);
    levels.add(e.level);
    e.resources.forEach((r, j) => {
      if (!resources.has(r.resource)) {
        issues.push(`${where} › resources › [${j}]: unknown resource "${r.resource}"`);
      }
    });
    e.cosmetics.forEach((id, j) => {
      if (!cosmetics.has(id))
        issues.push(`${where} › cosmetics › [${j}]: unknown cosmetic "${id}"`);
    });
  });
  const cards = new Set(c.cards.map((x) => x.id));
  for (const [card, options] of Object.entries(c.enhancements.cards)) {
    if (!cards.has(card)) issues.push(`enhancements.json › cards › ${card}: unknown card`);
    const optionIds = new Set<string>();
    options.forEach((o, i) => {
      if (optionIds.has(o.id)) {
        issues.push(`enhancements.json › cards › ${card} › [${i}] › id: duplicate "${o.id}"`);
      }
      optionIds.add(o.id);
    });
  }
  for (const card of c.cards) {
    if (!c.enhancements.cards[card.id]) {
      issues.push(`enhancements.json › cards: "${card.id}" has no enhancement options`);
    }
  }
}

/**
 * Every non-starter cosmetic has a source (DESIGN.md §8: dungeon drops, a cosmetics portal,
 * prestige, achievements, the account reward track, the shard shop), and portal pools list items at their own rarity.
 */
function checkCosmeticSources(
  c: Pick<
    Content,
    | 'resources'
    | 'cosmetics'
    | 'dungeons'
    | 'portals'
    | 'prestige'
    | 'cards'
    | 'achievements'
    | 'shardShop'
    | 'account'
  >,
  issues: string[],
): void {
  const sourced = new Set<string>([
    ...c.dungeons.map((d) => d.drops.rare.itemId),
    ...c.prestige.rewards.flatMap((r) => r.cosmetics),
    ...c.achievements.flatMap((a) => a.reward.cosmetics),
    ...c.account.rewardTrack.flatMap((r) => r.cosmetics),
    ...c.shardShop.flatMap((i) => (i.reward.kind === 'cosmetic' ? [i.reward.cosmetic] : [])),
    ...c.portals.filter((p) => p.kind === 'cosmetics').flatMap((p) => p.pool.map((e) => e.itemId)),
  ]);
  c.cosmetics.forEach((x, i) => {
    if (!x.starter && !sourced.has(x.id)) {
      issues.push(
        `cosmetics.json › [${i}]: "${x.id}" has no source (put it in the Wardrobe Gate pool)`,
      );
    }
  });
  const rarityOf = new Map<string, Rarity>([
    ...c.cosmetics.map((x) => [x.id, x.rarity] as const),
    ...c.cards.map((x) => [x.id, x.rarity] as const),
  ]);
  c.portals.forEach((p, i) =>
    p.pool.forEach((e, j) => {
      const rarity = rarityOf.get(e.itemId);
      if (rarity && rarity !== e.rarity) {
        issues.push(
          `portals.json › [${i}] › pool › [${j}] › rarity: "${e.itemId}" is ${rarity}, not ${e.rarity}`,
        );
      }
    }),
  );
}

/** Achievement and shard shop ids are unique and everything they name exists. */
function checkAchievements(
  c: Pick<
    Content,
    'resources' | 'cosmetics' | 'cards' | 'dungeons' | 'trials' | 'achievements' | 'shardShop'
  >,
  issues: string[],
): void {
  const resources = new Set(c.resources.map((x) => x.id));
  const cosmetics = new Set(c.cosmetics.map((x) => x.id));
  const cards = new Set(c.cards.map((x) => x.id));
  const dungeons = new Set([...c.dungeons, ...c.trials].map((x) => x.id));
  const unique = (where: string, items: { id: string }[]): void => {
    const seen = new Set<string>();
    items.forEach((x, i) => {
      if (seen.has(x.id)) issues.push(`${where} › [${i}] › id: duplicate "${x.id}"`);
      seen.add(x.id);
    });
  };
  unique('achievements.json › achievements', c.achievements);
  unique('achievements.json › shardShop', c.shardShop);
  c.achievements.forEach((a, i) => {
    const where = `achievements.json › achievements › [${i}]`;
    if (a.condition.kind === 'cleared' && !dungeons.has(a.condition.dungeon)) {
      issues.push(`${where} › condition › dungeon: unknown dungeon "${a.condition.dungeon}"`);
    }
    a.reward.cosmetics.forEach((id, j) => {
      if (!cosmetics.has(id)) {
        issues.push(`${where} › reward › cosmetics › [${j}]: unknown cosmetic "${id}"`);
      }
    });
    a.reward.resources.forEach((r, j) => {
      if (!resources.has(r.resource)) {
        issues.push(`${where} › reward › resources › [${j}]: unknown resource "${r.resource}"`);
      }
    });
  });
  c.shardShop.forEach((item, i) => {
    const where = `achievements.json › shardShop › [${i}] › reward`;
    const r = item.reward;
    if (r.kind === 'card' && !cards.has(r.card)) issues.push(`${where}: unknown card "${r.card}"`);
    if (r.kind === 'resource' && !resources.has(r.resource)) {
      issues.push(`${where}: unknown resource "${r.resource}"`);
    }
    if (r.kind === 'cosmetic' && !cosmetics.has(r.cosmetic)) {
      issues.push(`${where}: unknown cosmetic "${r.cosmetic}"`);
    }
  });
}

/** Starlight is the one prestige resource; shop ids are unique; reward cosmetics exist. */
function checkPrestige(
  c: Pick<Content, 'resources' | 'cosmetics' | 'prestige'>,
  issues: string[],
): void {
  const currency = c.resources.find((r) => r.id === c.prestige.currency);
  if (!currency) {
    issues.push(`prestige.json › currency: unknown resource "${c.prestige.currency}"`);
  } else if (currency.kind !== 'prestige') {
    issues.push(
      `prestige.json › currency: "${currency.id}" is ${currency.kind}, expected prestige`,
    );
  }
  c.resources.forEach((r, i) => {
    if (r.kind === 'prestige' && r.id !== c.prestige.currency) {
      issues.push(`resources.json › [${i}] › kind: only the prestige currency can be prestige`);
    }
  });
  const ids = new Set<string>();
  c.prestige.shop.forEach((item, i) => {
    if (ids.has(item.id)) issues.push(`prestige.json › shop › [${i}] › id: duplicate "${item.id}"`);
    ids.add(item.id);
  });
  const cosmetics = new Set(c.cosmetics.map((x) => x.id));
  c.prestige.rewards.forEach((reward, i) =>
    reward.cosmetics.forEach((id, j) => {
      if (!cosmetics.has(id)) {
        issues.push(
          `prestige.json › rewards › [${i}] › cosmetics › [${j}]: unknown cosmetic "${id}"`,
        );
      }
    }),
  );
}

/** Resource kinds card upgrades may cost: gems and dungeon / trial materials (DESIGN.md §5). */
const UPGRADE_KINDS: readonly Resource['kind'][] = ['tree_gem', 'mine_gem', 'material'];

/** Start cards, star-up and tier-up materials must exist; start cards lead distinct jobs. */
function checkCards(c: Pick<Content, 'resources' | 'cards' | 'cardRules'>, issues: string[]): void {
  const resources = new Map(c.resources.map((r) => [r.id, r]));
  const cards = new Map(c.cards.map((x) => [x.id, x]));
  const jobs = new Set<string>();
  // Logging and mining mains say how they strike; fighting mains have no harvest pattern (11.15).
  c.cards.forEach((card, i) => {
    const has = card.main.harvest !== undefined;
    if (card.job === 'fighting' && has) {
      issues.push(`cards.json › [${i}] › main › harvest: fighting cards do not harvest`);
    }
    if (card.job !== 'fighting' && !has) {
      issues.push(
        `cards.json › [${i}] › main › harvest: a ${card.job} card needs a harvest pattern`,
      );
    }
  });
  c.cardRules.startCards.forEach((id, i) => {
    const where = `cardRules.json › startCards › [${i}]`;
    const card = cards.get(id);
    if (!card) return issues.push(`${where}: unknown card "${id}"`);
    if (jobs.has(card.job)) issues.push(`${where}: a start card already leads ${card.job}`);
    jobs.add(card.job);
  });
  const checkResource = (where: string, id: string): void => {
    const res = resources.get(id);
    if (!res) issues.push(`${where}: unknown resource "${id}"`);
    else if (id !== 'money' && !UPGRADE_KINDS.includes(res.kind)) {
      issues.push(
        `${where}: "${id}" is ${res.kind}, card upgrades use Money, gems and materials only`,
      );
    }
  };
  // Every card upgrade of every job mixes both production loops with a dungeon material
  // (DESIGN.md §5): a tree gem, a mine gem and a Core.
  const checkMix = (where: string, ids: string[]): void => {
    const kinds = new Set(ids.map((id) => resources.get(id)?.kind));
    for (const kind of ['tree_gem', 'mine_gem', 'material'] as const) {
      if (!kinds.has(kind)) issues.push(`${where}: needs a ${kind} among its costs`);
    }
  };
  RANK_TIERS.forEach((tier, i) => {
    const before = RANK_TIERS[i - 1];
    if (before && c.cardRules.levelCaps[tier] < c.cardRules.levelCaps[before]) {
      issues.push(`cardRules.json › levelCaps › ${tier}: caps must not go down`);
    }
  });
  for (const tier of RANK_TIERS.slice(0, -1) as Exclude<RankTier, 'heirloom'>[]) {
    for (const job of JOBS) {
      const costs = c.cardRules.tierUp[tier][job];
      if (!costs.some((x) => x.resource === 'money')) {
        issues.push(`cardRules.json › tierUp › ${tier} › ${job}: needs a Money cost`);
      }
      costs.forEach((cost, i) =>
        checkResource(
          `cardRules.json › tierUp › ${tier} › ${job} › [${i}] › resource`,
          cost.resource,
        ),
      );
      checkMix(
        `cardRules.json › tierUp › ${tier} › ${job}`,
        costs.map((x) => x.resource),
      );
    }
  }
}

/** Every item type is listed once and matches its job; every card carries a listed type of its own job. */
function checkItems(c: Pick<Content, 'cards' | 'items'>, issues: string[]): void {
  const kinds = new Map<string, ItemType>();
  c.items.types.forEach((t, i) => {
    if (kinds.has(t.kind)) {
      issues.push(`items.json › types › [${i}] › kind: duplicate "${t.kind}"`);
    }
    kinds.set(t.kind, t);
  });
  c.cards.forEach((card, i) => {
    const t = kinds.get(card.item.kind);
    if (t && t.job !== card.job) {
      issues.push(
        `cards.json › [${i}] › item › kind: "${card.item.kind}" is a ${t.job} item, the card is ${card.job}`,
      );
    }
  });
}

/** Dungeons and trials must point at existing things of the right kind. */
function checkCombat(
  c: Pick<Content, 'resources' | 'dungeons' | 'trials' | 'combat'>,
  issues: string[],
): void {
  const resources = new Map(c.resources.map((r) => [r.id, r]));
  const checkResource = (where: string, resource: string, kind: Resource['kind']): void => {
    const res = resources.get(resource);
    if (!res) issues.push(`${where}: unknown resource "${resource}"`);
    else if (res.kind !== kind)
      issues.push(`${where}: "${resource}" is ${res.kind}, expected ${kind}`);
  };

  // Each dungeon is unlocked by an earlier one, so the chain has a start and no loops.
  const earlier = new Set<string>();
  c.dungeons.forEach((d, i) => {
    if (d.unlockedBy !== null && !earlier.has(d.unlockedBy)) {
      issues.push(
        `dungeons.json › [${i}] › unlockedBy: "${d.unlockedBy}" is not a dungeon listed before it`,
      );
    }
    earlier.add(d.id);
    checkResource(
      `dungeons.json › [${i}] › drops › material › resource`,
      d.drops.material.resource,
      'material',
    );
  });

  c.trials.forEach((t, i) => {
    if (earlier.has(t.id))
      issues.push(`trials.json › [${i}] › id: "${t.id}" is already a dungeon id`);
    if (t.unlockedBy !== null && !earlier.has(t.unlockedBy)) {
      issues.push(`trials.json › [${i}] › unlockedBy: unknown dungeon "${t.unlockedBy}"`);
    }
    t.tiers.forEach((tierEntry, j) =>
      tierEntry.rewards.forEach((r, k) =>
        checkResource(
          `trials.json › [${i}] › tiers › [${j}] › rewards › [${k}] › resource`,
          r.resource,
          'material',
        ),
      ),
    );
  });
}

function checkReferences(
  c: Pick<
    Content,
    'resources' | 'trees' | 'mines' | 'cards' | 'dungeons' | 'cosmetics' | 'portals'
  >,
  issues: string[],
): void {
  const duplicates = (file: string, items: { id: string }[]): void => {
    const seen = new Set<string>();
    items.forEach((item, i) => {
      if (seen.has(item.id)) issues.push(`${file}.json › [${i}] › id: duplicate id "${item.id}"`);
      seen.add(item.id);
    });
  };
  duplicates('resources', c.resources);
  duplicates('trees', c.trees);
  duplicates('mines', c.mines);
  duplicates('cards', c.cards);
  duplicates('dungeons', c.dungeons);
  duplicates('cosmetics', c.cosmetics);
  duplicates('portals', c.portals);

  // Tree and mine gems are drawn from their gem art (DESIGN.md §12); other resources have none.
  c.resources.forEach((r, i) => {
    const isGem = r.kind === 'tree_gem' || r.kind === 'mine_gem';
    if (isGem && !r.gem) issues.push(`resources.json › [${i}] › gem: a ${r.kind} needs gem art`);
    if (!isGem && r.gem) issues.push(`resources.json › [${i}] › gem: only gems have gem art`);
  });

  const resources = new Map(c.resources.map((r) => [r.id, r]));
  const cardIds = new Set(c.cards.map((x) => x.id));
  const cosmeticIds = new Set(c.cosmetics.map((x) => x.id));
  const dungeonIds = new Set(c.dungeons.map((x) => x.id));

  const checkProducer = (
    file: 'trees' | 'mines',
    kind: Resource['kind'],
    items: (Tree | Mine)[],
  ): void => {
    items.forEach((item, i) => {
      const out = resources.get(item.resource);
      if (!out) {
        issues.push(`${file}.json › [${i}] › resource: unknown resource "${item.resource}"`);
      } else if (out.kind !== kind) {
        issues.push(
          `${file}.json › [${i}] › resource: "${item.resource}" is ${out.kind}, expected ${kind}`,
        );
      }
    });
  };
  checkProducer('trees', 'tree_gem', c.trees);
  checkProducer('mines', 'mine_gem', c.mines);

  c.mines.forEach((mine, i) => {
    if (mine.unlockedByDungeon && !dungeonIds.has(mine.unlockedByDungeon)) {
      issues.push(
        `mines.json › [${i}] › unlockedByDungeon: unknown dungeon "${mine.unlockedByDungeon}"`,
      );
    }
  });

  c.dungeons.forEach((dungeon, i) => {
    // Every dungeon pays Money and every crystal: Money by the kill, crystals as a wage
    // (DESIGN.md §3, §7).
    const dropped = new Set<string>();
    dungeon.drops.currencies.forEach((drop, j) => {
      const where = `dungeons.json › [${i}] › drops › currencies › [${j}] › resource`;
      const res = resources.get(drop.resource);
      if (!res) issues.push(`${where}: unknown resource "${drop.resource}"`);
      else if (res.kind !== 'currency' && res.kind !== 'crystal') {
        issues.push(`${where}: "${drop.resource}" is ${res.kind}, expected currency or crystal`);
      }
      if (dropped.has(drop.resource)) issues.push(`${where}: duplicate "${drop.resource}"`);
      dropped.add(drop.resource);
    });
    dungeon.drops.extraMaterials.forEach((extra, j) => {
      const res = resources.get(extra.resource);
      const where = `dungeons.json › [${i}] › drops › extraMaterials › [${j}] › resource`;
      if (!res) issues.push(`${where}: unknown resource "${extra.resource}"`);
      else if (res.kind !== 'material') {
        issues.push(`${where}: "${extra.resource}" is ${res.kind}, expected material`);
      }
    });
    const paid = (list: { resource: string }[], field: string): void =>
      list.forEach((entry, j) => {
        const res = resources.get(entry.resource);
        const where = `dungeons.json › [${i}] › drops › ${field} › [${j}] › resource`;
        if (!res) issues.push(`${where}: unknown resource "${entry.resource}"`);
        else if (res.kind !== 'currency' && res.kind !== 'crystal') {
          issues.push(`${where}: "${entry.resource}" is ${res.kind}, expected currency or crystal`);
        }
      });
    paid(dungeon.drops.wages, 'wages');
    paid(dungeon.drops.firstClear, 'firstClear');
    const waged = new Set(dungeon.drops.wages.map((w) => w.resource));
    if (waged.size !== dungeon.drops.wages.length) {
      issues.push(`dungeons.json › [${i}] › drops › wages: a resource is listed twice`);
    }
    for (const w of waged) dropped.add(w);
    for (const r of c.resources) {
      if ((r.kind === 'currency' || r.kind === 'crystal') && !dropped.has(r.id)) {
        issues.push(`dungeons.json › [${i}] › drops › currencies: "${r.id}" is not dropped`);
      }
    }
    const item = dungeon.drops.rare.itemId;
    if (!cardIds.has(item) && !cosmeticIds.has(item)) {
      issues.push(
        `dungeons.json › [${i}] › drops › rare › itemId: "${item}" is not a known card or cosmetic`,
      );
    }
  });

  c.portals.forEach((portal, i) => {
    const res = resources.get(portal.cost.resource);
    if (!res) {
      issues.push(
        `portals.json › [${i}] › cost › resource: unknown resource "${portal.cost.resource}"`,
      );
    } else if (res.kind !== 'crystal') {
      issues.push(
        `portals.json › [${i}] › cost › resource: "${portal.cost.resource}" is ${res.kind}, expected crystal`,
      );
    }
    // Pity and the 10-pull guarantee pick from the pool at or above their rarity.
    const reaches = (rarity: Rarity): boolean =>
      portal.pool.some((e) => RARITIES.indexOf(e.rarity) >= RARITIES.indexOf(rarity));
    if (portal.pool.length > 0 && !reaches(portal.pity.rarity)) {
      issues.push(
        `portals.json › [${i}] › pity › rarity: no pool item is ${portal.pity.rarity} or better`,
      );
    }
    if (portal.pool.length > 0 && !reaches(portal.tenPullGuarantee)) {
      issues.push(
        `portals.json › [${i}] › tenPullGuarantee: no pool item is ${portal.tenPullGuarantee} or better`,
      );
    }
    if (portal.kind === 'skins') return; // pools of skins are checked by checkLegacyGates
    const valid = portal.kind === 'cards' ? cardIds : cosmeticIds;
    portal.pool.forEach((entry, j) => {
      if (!valid.has(entry.itemId)) {
        issues.push(
          `portals.json › [${i}] › pool › [${j}] › itemId: "${entry.itemId}" is not a known ${portal.kind === 'cards' ? 'card' : 'cosmetic'}`,
        );
      }
    });
  });

  c.cosmetics.forEach((cosmetic, i) => {
    if (cosmetic.exclusiveCard && !cardIds.has(cosmetic.exclusiveCard)) {
      issues.push(
        `cosmetics.json › [${i}] › exclusiveCard: unknown card "${cosmetic.exclusiveCard}"`,
      );
    }
  });
}

/**
 * Each weapon is listed once; skin ids are unique across the file and art ids across the file
 * (with the base arts). A legacy skin has a rarity, any other skin has none; a weapon without
 * base art (a generic kind) holds only legacy skins.
 */
function checkWeaponSkins(sets: WeaponSkinSet[], issues: string[]): void {
  const weapons = new Set<string>();
  const arts = new Set<string>();
  const ids = new Set<string>();
  sets.forEach((set, i) => {
    if (weapons.has(set.weapon)) {
      issues.push(`weaponSkins.json › [${i}] › weapon: duplicate weapon "${set.weapon}"`);
    }
    weapons.add(set.weapon);
    if (set.baseArt) arts.add(set.baseArt);
    set.skins.forEach((skin, j) => {
      const where = `weaponSkins.json › [${i}] › skins › [${j}]`;
      if (ids.has(skin.id)) issues.push(`${where} › id: duplicate skin id "${skin.id}"`);
      ids.add(skin.id);
      if (arts.has(skin.art)) issues.push(`${where} › art: duplicate art id "${skin.art}"`);
      arts.add(skin.art);
      if (skin.legacy && !skin.rarity)
        issues.push(`${where} › rarity: a legacy skin needs a rarity`);
      if (!skin.legacy && skin.rarity) {
        issues.push(`${where} › rarity: only a legacy skin has a rarity`);
      }
      if (!set.baseArt && !skin.legacy) {
        issues.push(`${where} › legacy: a weapon without baseArt holds only legacy skins`);
      }
    });
  });
}

/** Every legacy skin is in a skins portal's pool with its own rarity, and every such pool entry is a legacy skin. */
function checkLegacyGates(sets: WeaponSkinSet[], portals: Portal[], issues: string[]): void {
  const legacy = new Map(
    sets.flatMap((w) => w.skins.filter((k) => k.legacy).map((k) => [k.id, k] as const)),
  );
  const pooled = new Set<string>();
  portals.forEach((portal, i) => {
    if (portal.kind !== 'skins') return;
    portal.pool.forEach((entry, j) => {
      const where = `portals.json › [${i}] › pool › [${j}]`;
      const skin = legacy.get(entry.itemId);
      if (!skin) {
        issues.push(`${where} › itemId: "${entry.itemId}" is not a legacy skin`);
        return;
      }
      if (pooled.has(entry.itemId))
        issues.push(`${where} › itemId: "${entry.itemId}" is pooled twice`);
      pooled.add(entry.itemId);
      if (skin.rarity !== entry.rarity) {
        issues.push(`${where} › rarity: "${entry.itemId}" is ${skin.rarity} in weaponSkins.json`);
      }
    });
  });
  for (const id of legacy.keys()) {
    if (!pooled.has(id))
      issues.push(`weaponSkins.json: legacy skin "${id}" is in no skins portal pool`);
  }
}

/** The raw bundled JSON, before validation (tests use it to build broken variants). */
export function bundledRawContent(): RawContent {
  return {
    resources: resourcesJson,
    trees: treesJson,
    mines: minesJson,
    production: productionJson,
    cards: cardsJson,
    cardRules: cardRulesJson,
    dungeons: dungeonsJson,
    trials: trialsJson,
    combat: combatJson,
    cosmetics: cosmeticsJson,
    portals: portalsJson,
    rarities: raritiesJson,
    wearRules: wearRulesJson,
    sets: setsJson,
    progression: progressionJson,
    prestige: prestigeJson,
    cosmeticRules: cosmeticRulesJson,
    achievements: achievementsJson,
    account: accountJson,
    enhancements: enhancementsJson,
    upgrades: upgradesJson,
    weaponSkins: weaponSkinsJson,
    items: itemsJson,
  };
}

/** What `loadContent` may be asked for. */
export interface ContentOptions {
  /** Also open the dungeons that wait for their theme (`enabled: false`), with their
   *  placeholder names and drops. For dev builds and the sim only. */
  unreleased?: boolean;
}

/** Loads and validates the bundled game data. Call once at startup. */
export function loadContent(options: ContentOptions = {}): Content {
  return validateContent(bundledRawContent(), options);
}
