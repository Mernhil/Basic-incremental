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
  ProductionConfig,
  Progression,
  Rarity,
  RarityStyle,
  Resource,
  Tree,
  Trial,
  WearRules,
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

export * from './schemas';

export interface Content {
  resources: Resource[];
  trees: Tree[];
  mines: Mine[];
  production: ProductionConfig;
  cards: Card[];
  /** Card progression numbers (levels, star-ups, tier-ups, costs, drops). */
  cardRules: CardRules;
  dungeons: Dungeon[];
  /** Special dungeons (strength tests). Their ids share the dungeon id space. */
  trials: Trial[];
  combat: CombatConfig;
  cosmetics: Cosmetic[];
  portals: Portal[];
  rarities: RarityStyle[];
  wearRules: WearRules;
  sets: CosmeticSet[];
  /** Mastery, tile stages, evolutions and goal rules (DESIGN.md 16). */
  progression: Progression;
  resourceById: ReadonlyMap<string, Resource>;
  dungeonById: ReadonlyMap<string, Dungeon>;
  trialById: ReadonlyMap<string, Trial>;
  treeById: ReadonlyMap<string, Tree>;
  mineById: ReadonlyMap<string, Mine>;
  cardById: ReadonlyMap<string, Card>;
  cosmeticById: ReadonlyMap<string, Cosmetic>;
  rarityById: ReadonlyMap<Rarity, RarityStyle>;
  setById: ReadonlyMap<string, CosmeticSet>;
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
export function validateContent(raw: RawContent): Content {
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
  } = parsed;
  checkReferences({ resources, trees, mines, cards, dungeons, cosmetics, portals }, issues);
  checkCombat({ resources, dungeons, trials, combat }, issues);
  checkProduction({ resources, trees, mines, production }, issues);
  checkCosmetics(cosmetics, rarities, issues);
  checkSets(cosmetics, sets, issues);
  checkCards({ resources, cards, cardRules }, issues);
  checkProgression({ cards, progression }, issues);
  checkModifiers(
    { resources, trees, mines, dungeons, trials, portals, cosmetics, sets, cards, cardRules },
    issues,
  );
  if (issues.length > 0) throw new ContentValidationError(issues);

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
    dungeons,
    trials,
    combat,
    cosmetics,
    portals,
    rarities,
    wearRules,
    sets,
    progression,
    resourceById: new Map(resources.map((r) => [r.id, r])),
    dungeonById: new Map(dungeons.map((d) => [d.id, d])),
    trialById: new Map(trials.map((t) => [t.id, t])),
    treeById: new Map(trees.map((t) => [t.id, t])),
    mineById: new Map(mines.map((m) => [m.id, m])),
    cardById: new Map(cards.map((x) => [x.id, x])),
    cosmeticById: new Map(cosmetics.map((x) => [x.id, x])),
    rarityById: new Map(rarities.map((r) => [r.id, r])),
    setById: new Map(sets.map((x) => [x.id, x])),
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

  // Logging is paid for with wood, mining with ore (DESIGN.md 2).
  c.trees.forEach((tree, i) =>
    tree.unlockCost.forEach((cost, j) =>
      checkCost(`trees.json › [${i}] › unlockCost › [${j}] › resource`, cost.resource, 'tree_gem'),
    ),
  );
  c.mines.forEach((mine, i) =>
    checkCost(
      `mines.json › [${i}] › level › cost › resource`,
      mine.level.cost.resource,
      'mine_gem',
    ),
  );

  // Producer ids are shared by modifier scopes and plot contents, so they must be unique.
  const treeIds = new Set(c.trees.map((t) => t.id));
  c.mines.forEach((mine, i) => {
    if (treeIds.has(mine.id)) {
      issues.push(`mines.json › [${i}] › id: "${mine.id}" is already a tree id`);
    }
  });

  const jobs = [
    {
      job: 'logging',
      kind: 'tree_gem',
      starters: c.trees.filter((t) => t.unlockCost.length === 0),
      all: c.trees,
    },
    {
      job: 'mining',
      kind: 'mine_gem',
      starters: c.mines.filter((m) => m.unlockedByDungeon === null),
      all: c.mines,
    },
  ] as const;
  for (const { job, kind, starters, all } of jobs) {
    const config = c.production[job];
    checkCost(`production.json › ${job} › expansion › resource`, config.expansion.resource, kind);
    const where = `production.json › ${job} › startProducer`;
    if (!all.some((p) => p.id === config.startProducer)) {
      issues.push(
        `${where}: unknown ${job === 'logging' ? 'tree' : 'mine'} "${config.startProducer}"`,
      );
    } else if (!starters.some((p) => p.id === config.startProducer)) {
      issues.push(`${where}: "${config.startProducer}" is not available from the start`);
    }
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
}

/** Start cards, star-up and tier-up materials must exist; start cards lead distinct jobs. */
function checkCards(c: Pick<Content, 'resources' | 'cards' | 'cardRules'>, issues: string[]): void {
  const resources = new Set(c.resources.map((r) => r.id));
  const cards = new Map(c.cards.map((x) => [x.id, x]));
  const jobs = new Set<string>();
  c.cardRules.startCards.forEach((id, i) => {
    const where = `cardRules.json › startCards › [${i}]`;
    const card = cards.get(id);
    if (!card) return issues.push(`${where}: unknown card "${id}"`);
    if (jobs.has(card.job)) issues.push(`${where}: a start card already leads ${card.job}`);
    jobs.add(card.job);
  });
  const checkResource = (where: string, id: string): void => {
    if (!resources.has(id)) issues.push(`${where}: unknown resource "${id}"`);
  };
  for (const tier of RANK_TIERS) {
    const step = c.cardRules.starUp.tiers[tier];
    checkResource(`cardRules.json › starUp › tiers › ${tier} › resource`, step.resource);
    const caps = c.cardRules.levelCaps[tier];
    if (caps.some((cap, i) => i > 0 && cap < caps[i - 1]!)) {
      issues.push(`cardRules.json › levelCaps › ${tier}: caps must not go down`);
    }
  }
  for (const tier of ['bronze', 'silver', 'gold'] as const) {
    for (const job of JOBS) {
      c.cardRules.tierUp[tier][job].forEach((cost, i) =>
        checkResource(
          `cardRules.json › tierUp › ${tier} › ${job} › [${i}] › resource`,
          cost.resource,
        ),
      );
    }
  }
}

/** Each unique evolution is listed once, and cards only evolve into listed ones. */
function checkProgression(c: Pick<Content, 'cards' | 'progression'>, issues: string[]): void {
  const kinds = new Set<string>();
  c.progression.evolutions.items.forEach((item, i) => {
    if (kinds.has(item.kind)) {
      issues.push(
        `progression.json › evolutions › items › [${i}] › kind: duplicate "${item.kind}"`,
      );
    }
    kinds.add(item.kind);
  });
  c.cards.forEach((card, i) => {
    if (card.evolution && !kinds.has(card.evolution)) {
      issues.push(
        `cards.json › [${i}] › evolution: "${card.evolution}" is not in progression.json evolutions`,
      );
    }
  });
}

/** Dungeons, trials and damage upgrades must point at existing things of the right kind. */
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

  // Damage is bought with ore (DESIGN.md 2), one line per ore (11.8).
  const seen = new Set<string>();
  c.combat.damageUpgrades.forEach((u, i) => {
    const where = `combat.json › damageUpgrades › [${i}]`;
    if (seen.has(u.id)) issues.push(`${where} › id: duplicate id "${u.id}"`);
    seen.add(u.id);
    checkResource(`${where} › cost › resource`, u.cost.resource, 'mine_gem');
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

  // Tree and mine gems are drawn from their gem art (DESIGN.md 13); other resources have none.
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
    const portal = dungeon.drops.portalResource.resource;
    const res = resources.get(portal);
    if (!res) {
      issues.push(
        `dungeons.json › [${i}] › drops › portalResource › resource: unknown resource "${portal}"`,
      );
    } else if (res.kind !== 'portal') {
      issues.push(
        `dungeons.json › [${i}] › drops › portalResource › resource: "${portal}" is ${res.kind}, expected portal`,
      );
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
    } else if (res.kind !== 'portal') {
      issues.push(
        `portals.json › [${i}] › cost › resource: "${portal.cost.resource}" is ${res.kind}, expected portal`,
      );
    }
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

/** Loads and validates the bundled game data. Call once at startup. */
export function loadContent(): Content {
  return validateContent({
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
  });
}
