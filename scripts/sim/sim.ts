/**
 * Balance sim (lite), DESIGN.md 11.7 and 16 E9: plays the real game logic fast with a simple
 * greedy buyer and records when each beta pacing milestone is reached.
 *
 * The buyer, every step: buys whatever is affordable now, cheapest share of the bank first
 * (card star-ups and tier-ups before anything else), spreads plots / slots over the unlocked
 * trees and mines, puts the best cards in the loadouts and fights the hardest dungeon it can
 * kill (or the one that drops a Core a card is waiting for, or the Glimmer Trial once it can
 * score 100%).
 */
import {
  JOBS,
  RANK_TIERS,
  RARITIES,
  type Content,
  type Job,
  type ProductionJob,
} from '../../src/data';
import {
  advance,
  bossAttackDps,
  buyDamageUpgrade,
  buyExpansion,
  buyMineLevel,
  cardPower,
  collectModifiers,
  createInitialState,
  createSeededRng,
  damageUpgradeCost,
  Decimal,
  emptyCardLoadout,
  expansionCost,
  incomePerSecond,
  isDungeonCleared,
  isDungeonUnlocked,
  isProducerUnlocked,
  loadoutCostCap,
  loadoutMaxHealth,
  mineLevelCost,
  plotCapacity,
  secondsPerKill,
  setActiveDungeon,
  setLoadout,
  starUp,
  starUpCheck,
  tierUp,
  tierUpCheck,
  treeUnlockCost,
  unlockTree,
  unlockedProducers,
  averageDps,
  cloneState,
  cardCost,
  pull,
  pullPrice,
  ascend,
  ascensionPreview,
  buyStarlightItem,
  starlightShop,
  cosmeticMaxLevel,
  cosmeticUpgradeCheck,
  upgradeCosmetic,
  equipCosmetic,
  type CardLoadout,
  type GameState,
  type Modifier,
  type Price,
  type Rng,
} from '../../src/game';

// ---- milestones (DESIGN.md 11.7) ---------------------------------------------------------------

export interface Milestone {
  id: string;
  label: string;
  targetHours: number;
  /** Whether the state has reached it. */
  reached: (state: GameState, content: Content, log: SimLog) => boolean;
  /** Set while the system the milestone needs is not built yet. */
  pending?: string;
}

/** Counters the sim keeps beside the state (things the state does not record). */
export interface SimLog {
  summons: number;
}

const tierAtLeast = (state: GameState, tier: (typeof RANK_TIERS)[number]): boolean =>
  Object.values(state.cards.owned).some(
    (c) => RANK_TIERS.indexOf(c.tier) >= RANK_TIERS.indexOf(tier),
  );
const cleared = (id: string) => (state: GameState) => isDungeonCleared(state, id);

export const MILESTONES: Milestone[] = [
  {
    id: 'clear_d1',
    label: 'First dungeon cleared',
    targetHours: 0.5,
    reached: cleared('mossy_cellar'),
  },
  {
    id: 'first_summon',
    label: 'First summon',
    targetHours: 0.75,
    reached: (_s, _c, log) => log.summons > 0,
  },
  {
    id: 'first_silver',
    label: 'First Silver card',
    targetHours: 1.5,
    reached: (s) => tierAtLeast(s, 'silver'),
  },
  { id: 'clear_d2', label: 'Dungeon 2 cleared', targetHours: 3, reached: cleared('ember_crypt') },
  {
    id: 'first_gold',
    label: 'First Gold card',
    targetHours: 5,
    reached: (s) => tierAtLeast(s, 'gold'),
  },
  {
    id: 'first_star6',
    label: 'First ★6',
    targetHours: 7,
    reached: (s) => Object.values(s.cards.owned).some((c) => c.stars >= 6),
  },
  {
    id: 'first_prestige',
    label: 'First prestige (Ascension)',
    targetHours: 8,
    reached: (s) => s.prestigeCount > 0,
  },
  {
    id: 'clear_d3',
    label: 'Dungeon 3 cleared',
    targetHours: 12,
    reached: cleared('frostspire_vault'),
  },
  {
    id: 'clear_trial',
    label: 'Glimmer Trial cleared',
    targetHours: 15,
    reached: cleared('glimmer_trial'),
  },
  {
    id: 'first_prismatic',
    label: 'First Prismatic card',
    targetHours: 25,
    reached: (s) => tierAtLeast(s, 'prismatic'),
  },
  {
    id: 'max_cosmetic',
    label: 'First max-level cosmetic',
    targetHours: 20,
    reached: (s, c) =>
      Object.entries(s.cosmetics.owned).some(([id, o]) => {
        const cosmetic = c.cosmeticById.get(id);
        return !!cosmetic && !cosmetic.starter && o.level >= cosmeticMaxLevel(c, cosmetic);
      }),
  },
  {
    id: 'exhausted',
    label: 'Beta content mostly exhausted',
    targetHours: 40,
    // Every other milestone reached and every card owned.
    reached: (s, c, log) =>
      c.cards.every((card) => s.cards.owned[card.id]) &&
      MILESTONES.every((m) => m.id === 'exhausted' || m.reached(s, c, log)),
  },
];

// ---- the greedy buyer --------------------------------------------------------------------------

export interface Candidate {
  /** `damage:<line>`, `mine:<mine>`, `expand:<job>`, `tree:<tree>`, `star:<card>`, `tier:<card>`. */
  id: string;
  prices: Price[];
  /** Seconds until affordable at the current income; 0 = now; null = nothing earns it. */
  eta: number | null;
  /** Card upgrades go first among affordable purchases. */
  priority: number;
  buy: (state: GameState, content: Content, modifiers: Modifier[], rng: Rng) => GameState | null;
}

function etaOf(
  state: GameState,
  content: Content,
  prices: readonly Price[],
  modifiers: readonly Modifier[],
): number | null {
  let worst = 0;
  for (const p of prices) {
    const missing = p.amount.sub(state.resources[p.resource] ?? 0);
    if (missing.lte(0)) continue;
    const income = incomePerSecond(state, content, p.resource, modifiers);
    if (income.lte(0)) return null;
    worst = Math.max(worst, missing.div(income).toNumber());
  }
  return Number.isFinite(worst) ? worst : null;
}

const okState = (r: { ok: boolean; state?: GameState }): GameState | null =>
  r.ok ? (r.state ?? null) : null;

/** Every purchase the buyer considers right now, with its ETA. */
export function buyerCandidates(
  state: GameState,
  content: Content,
  modifiers: Modifier[] = collectModifiers(state, content),
): Candidate[] {
  const out: Omit<Candidate, 'eta'>[] = [];
  for (const line of content.combat.damageUpgrades) {
    const price = damageUpgradeCost(state, content, line.id, modifiers);
    if (!price) continue;
    out.push({
      id: `damage:${line.id}`,
      prices: [price],
      priority: 0,
      buy: (s, c, m) => okState(buyDamageUpgrade(s, c, line.id, m)),
    });
  }
  for (const mine of content.mines) {
    if (!isProducerUnlocked(state, content, 'mining', mine.id)) continue;
    const price = mineLevelCost(state, content, mine.id, modifiers);
    if (!price) continue;
    out.push({
      id: `mine:${mine.id}`,
      prices: [price],
      priority: 0,
      buy: (s, c, m) => okState(buyMineLevel(s, c, mine.id, m)),
    });
  }
  for (const job of ['logging', 'mining'] as const) {
    out.push({
      id: `expand:${job}`,
      prices: [expansionCost(state, content, job, modifiers)],
      priority: 0,
      buy: (s, c, m) => okState(buyExpansion(s, c, job, m)),
    });
  }
  for (const tree of content.trees) {
    if (isProducerUnlocked(state, content, 'logging', tree.id)) continue;
    out.push({
      id: `tree:${tree.id}`,
      prices: treeUnlockCost(content, tree.id, modifiers),
      priority: 1,
      buy: (s, c, m) => okState(unlockTree(s, c, tree.id, m)),
    });
  }
  for (const card of content.cards) {
    if (!state.cards.owned[card.id]) continue;
    for (const kind of ['star', 'tier'] as const) {
      const check =
        kind === 'star'
          ? starUpCheck(state, content, card.id, modifiers)
          : tierUpCheck(state, content, card.id, modifiers);
      if (!check?.available) continue;
      // Only worth waiting for when the duplicate and level are already there.
      if (check.requirements.some((r) => r.kind !== 'resource' && !r.met)) continue;
      out.push({
        id: `${kind}:${card.id}`,
        prices: check.requirements
          .filter((r) => r.kind === 'resource' && r.resource)
          .map((r) => ({ resource: r.resource!, amount: r.need })),
        priority: 2,
        buy: (s, c, m) =>
          okState(kind === 'star' ? starUp(s, c, card.id, m) : tierUp(s, c, card.id, m)),
      });
    }
  }
  // Starlight shop: every level as soon as it is affordable.
  for (const offer of starlightShop(state, content, modifiers)) {
    if (!offer.price) continue;
    out.push({
      id: `starlight:${offer.item.id}`,
      prices: [offer.price],
      priority: 1,
      buy: (s, c, m) => okState(buyStarlightItem(s, c, offer.item.id, m)),
    });
  }
  // Cosmetic upgrade levels, once the duplicate is in hand (equipped right after).
  for (const id of Object.keys(state.cosmetics.owned)) {
    const check = cosmeticUpgradeCheck(state, content, id, modifiers);
    if (!check?.available || check.requirements.some((r) => r.kind === 'copies' && !r.met)) {
      continue;
    }
    out.push({
      id: `cosmetic:${id}`,
      prices: check.requirements
        .filter((r) => r.kind === 'resource' && r.resource)
        .map((r) => ({ resource: r.resource!, amount: r.need })),
      priority: 1,
      buy: (s, c, m) => {
        const up = upgradeCosmetic(s, c, id, m);
        if (!up.ok) return null;
        const worn = equipCosmetic(up.state, c, id);
        return worn.ok ? worn.state : up.state;
      },
    });
  }
  // Summons: a single pull whenever one is affordable (lite: no saving up for 10-pulls).
  for (const portal of content.portals) {
    out.push({
      id: `summon:${portal.id}`,
      prices: [pullPrice(portal, 1, modifiers)],
      priority: 2,
      buy: (s, c, m, rng) => okState(pull(s, c, portal.id, 1, rng, m)),
    });
  }
  return out.map((c) => ({ ...c, eta: etaOf(state, content, c.prices, modifiers) }));
}

/** Share of the bank a purchase spends (its largest price over what is held). */
function bankShare(state: GameState, prices: readonly Price[]): number {
  let worst = 0;
  for (const p of prices) {
    const have = state.resources[p.resource] ?? new Decimal(0);
    worst = Math.max(worst, have.lte(0) ? Infinity : p.amount.div(have).toNumber());
  }
  return worst;
}

/** Most purchases in one greedy pass (a safety valve). */
const MAX_BUYS_PER_PASS = 500;

/**
 * Buys while anything is affordable: card upgrades first, then tree unlocks, then the purchase
 * that spends the smallest share of the bank. Re-arranges plots and loadouts afterwards.
 */
export function greedyBuy(
  state: GameState,
  content: Content,
  rng: Rng = createSeededRng(1),
): { state: GameState; bought: string[] } {
  let current = state;
  const bought: string[] = [];
  for (let i = 0; i < MAX_BUYS_PER_PASS; i++) {
    const modifiers = collectModifiers(current, content);
    const ready = buyerCandidates(current, content, modifiers)
      .filter((c) => c.eta === 0)
      .sort(
        (a, b) =>
          b.priority - a.priority ||
          bankShare(current, a.prices) - bankShare(current, b.prices) ||
          (a.id < b.id ? -1 : 1),
      );
    let next: GameState | null = null;
    for (const candidate of ready) {
      next = candidate.buy(current, content, modifiers, rng);
      if (next) {
        bought.push(candidate.id);
        break;
      }
    }
    if (!next) break;
    current = next;
  }
  if (bought.length > 0) current = optimizeLoadouts(arrangePlots(current, content), content);
  return { state: current, bought };
}

/**
 * Spreads each job's plots / slots evenly over its unlocked producers; the remainder goes to the
 * lowest tiers (their gems pay for expansions and the cheap upgrade lines).
 */
export function arrangePlots(state: GameState, content: Content): GameState {
  const next = cloneState(state);
  for (const job of ['logging', 'mining'] as ProductionJob[]) {
    const capacity = plotCapacity(state, content, job);
    const producers = [...unlockedProducers(state, content, job)].sort((a, b) => a.tier - b.tier);
    if (producers.length === 0) continue;
    const per = Math.floor(capacity / producers.length);
    let extra = capacity - per * producers.length;
    const plots: string[] = [];
    for (const p of producers) {
      const n = per + (extra > 0 ? 1 : 0);
      if (extra > 0) extra--;
      for (let i = 0; i < n; i++) plots.push(p.id);
    }
    next.production[job].plots = plots;
  }
  return next;
}

/** Puts each job's strongest cards in its loadout (rarity, then power) within the cost cap. */
export function optimizeLoadouts(state: GameState, content: Content): GameState {
  let current = state;
  for (const job of JOBS as readonly Job[]) {
    const cap = loadoutCostCap(current, content, job);
    const ranked = content.cards
      .filter((c) => c.job === job && current.cards.owned[c.id])
      .sort(
        (a, b) =>
          RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity) ||
          cardPower(content, current.cards.owned[b.id]!) -
            cardPower(content, current.cards.owned[a.id]!),
      );
    const loadout: CardLoadout = emptyCardLoadout();
    let cost = 0;
    let support = 0;
    for (const card of ranked) {
      const c = cardCost(content, card.id);
      if (cost + c > cap) continue;
      if (loadout.main === null) loadout.main = card.id;
      else if (support < loadout.supports.length) loadout.supports[support++] = card.id;
      else break;
      cost += c;
    }
    const result = setLoadout(current, content, job, loadout);
    if (result.ok) current = result.state;
  }
  return current;
}

/** Ascend once allowed and the gain at least matches all the Starlight earned so far (so each
 *  ascension at least doubles the total). */
export function shouldAscend(state: GameState, content: Content): boolean {
  const preview = ascensionPreview(state, content);
  return preview.canAscend && preview.gain.gte(state.prestige.starlightEarned);
}

// ---- where to fight ----------------------------------------------------------------------------

/** Whether the loadout kills the boss before the boss knocks it out. */
function canKill(state: GameState, content: Content, id: string, modifiers: Modifier[]): boolean {
  const dungeon = content.dungeonById.get(id);
  if (!dungeon || !isDungeonUnlocked(state, content, id)) return false;
  const spk = secondsPerKill(state, content, id, modifiers);
  if (spk === null || !Number.isFinite(spk)) return false;
  const health = loadoutMaxHealth(state, content, modifiers, id);
  const incoming = bossAttackDps(dungeon, state.prestigeCount, modifiers);
  return !(health.gt(0) && incoming.gt(0) && health.div(incoming).toNumber() < spk);
}

/** The Core resources a card upgrade is waiting for (duplicate and level already there). */
function wantedCores(state: GameState, content: Content, modifiers: Modifier[]): Set<string> {
  const wanted = new Set<string>();
  for (const c of buyerCandidates(state, content, modifiers)) {
    if (!/^(star|tier|cosmetic):/.test(c.id)) continue;
    for (const p of c.prices) {
      if ((state.resources[p.resource] ?? new Decimal(0)).lt(p.amount)) wanted.add(p.resource);
    }
  }
  return wanted;
}

/** What to fight: the Glimmer Trial once it can be cleared, a Core a card waits for, else the
 *  hardest dungeon it can kill, else the first unlocked one not cleared. */
export function chooseDungeon(state: GameState, content: Content): string | null {
  const modifiers = collectModifiers(state, content);
  for (const trial of content.trials) {
    if (!isDungeonUnlocked(state, content, trial.id) || isDungeonCleared(state, trial.id)) continue;
    const dealt = averageDps(state, content, trial.id, modifiers).mul(trial.durationSeconds);
    if (dealt.gte(trial.target.hp)) return trial.id;
  }
  const killable = content.dungeons.filter((d) => canKill(state, content, d.id, modifiers));
  const wanted = wantedCores(state, content, modifiers);
  // A cleared trial is farmed for the Glimmer Dust / Facet Shards a cosmetic level waits for.
  const trialFarm = content.trials.find(
    (t) =>
      isDungeonCleared(state, t.id) &&
      t.tiers.some((tier) => tier.rewards.some((r) => wanted.has(r.resource))),
  );
  if (trialFarm) return trialFarm.id;
  const farm = killable.find((d) => wanted.has(d.drops.material.resource));
  if (farm) return farm.id;
  const hardest = killable[killable.length - 1];
  if (hardest) {
    // Push on to the next dungeon as soon as it can be killed too (handled above); otherwise
    // farm the hardest one.
    return hardest.id;
  }
  const open = content.dungeons.find(
    (d) => isDungeonUnlocked(state, content, d.id) && !isDungeonCleared(state, d.id),
  );
  return open?.id ?? content.dungeons[0]?.id ?? null;
}

// ---- running -----------------------------------------------------------------------------------

export interface SimOptions {
  hours: number;
  seed?: number;
  /** Seconds of play per step (the buyer acts between steps). */
  stepSeconds?: number;
  /** Open portals that wait for their screen (default true: the sim plays the whole beta). */
  openAllPortals?: boolean;
}

export interface SimResult {
  /** Milestone id -> sim seconds when reached, or null. */
  hits: Record<string, number | null>;
  simSeconds: number;
  state: GameState;
  log: SimLog;
}

/** How often the fight target is re-chosen without a kill, in seconds. */
const RECHOOSE_SECONDS = 300;

export function runSim(bundled: Content, options: SimOptions): SimResult {
  // The sim plays the whole beta: portals waiting for their screen (the Wardrobe Gate) are open.
  const content: Content =
    options.openAllPortals === false ? bundled : { ...bundled, portals: bundled.allPortals };
  const rng: Rng = createSeededRng(options.seed ?? 1);
  const step = options.stepSeconds ?? 5;
  const total = Math.round(options.hours * 3600);
  const log: SimLog = { summons: 0 };
  const hits: Record<string, number | null> = Object.fromEntries(
    MILESTONES.map((m) => [m.id, null]),
  );
  let state = createInitialState(content);
  let sinceChoose = Infinity;
  let t = 0;
  while (t < total) {
    const buys = greedyBuy(state, content, rng);
    state = buys.state;
    log.summons += buys.bought.filter((id) => id.startsWith('summon:')).length;
    if (shouldAscend(state, content)) {
      const result = ascend(state, content);
      if (result.ok) {
        state = greedyBuy(result.state, content, rng).state;
        sinceChoose = RECHOOSE_SECONDS;
      }
    }
    if (sinceChoose >= RECHOOSE_SECONDS) {
      const target = chooseDungeon(state, content);
      if (target !== state.activeDungeonId) {
        const result = setActiveDungeon(state, content, target);
        if (result.ok) state = result.state;
      }
      sinceChoose = 0;
    }
    const dt = Math.min(step, total - t);
    const { state: next, report } = advance(state, content, dt * 1000, rng);
    state = next;
    t += dt;
    sinceChoose += dt;
    if (report.bossKills > 0 || report.knockouts > 0 || report.trialAttempts > 0) {
      sinceChoose = RECHOOSE_SECONDS;
    }
    if (report.cardDrops.length > 0) state = optimizeLoadouts(state, content);
    for (const m of MILESTONES) {
      if (hits[m.id] === null && m.reached(state, content, log)) hits[m.id] = t;
    }
  }
  return { hits, simSeconds: t, state, log };
}

const hoursText = (seconds: number): string => `${(seconds / 3600).toFixed(2)} h`;

/** The result as a markdown table: milestone, sim time, DESIGN 11.7 target. */
export function formatTable(result: SimResult): string {
  const lines = ['| Milestone | Sim time | Target |', '|---|---|---|'];
  for (const m of MILESTONES) {
    const hit = result.hits[m.id];
    const time =
      hit !== null && hit !== undefined
        ? hoursText(hit)
        : m.pending
          ? `not built (${m.pending})`
          : `not reached in ${hoursText(result.simSeconds)}`;
    lines.push(`| ${m.label} | ${time} | ${m.targetHours} h |`);
  }
  return lines.join('\n');
}

/** One line per job and a few totals, to read alongside the table. */
export function formatSummary(result: SimResult, content: Content): string {
  const s = result.state;
  const cards = Object.entries(s.cards.owned)
    .map(([id, c]) => `${content.cardById.get(id)?.name ?? id} ${c.tier} ★${c.stars} Lv ${c.level}`)
    .join(', ');
  const damage = content.combat.damageUpgrades
    .map((u) => `${u.name} ${s.combat.damageLevels[u.id] ?? 0}`)
    .join(', ');
  const mines = content.mines
    .map((m) => `${m.name} ${s.production.mineLevels[m.id] ?? 0}`)
    .join(', ');
  return [
    `Kills: ${s.stats.bossKills} (${Object.entries(s.combat.kills)
      .map(([d, k]) => `${d} ${k}`)
      .join(', ')})`,
    `Plots: ${plotCapacity(s, content, 'logging')}, slots: ${plotCapacity(s, content, 'mining')}`,
    `Damage lines: ${damage}`,
    `Mine levels: ${mines}`,
    `Cards: ${cards}`,
  ].join('\n');
}
