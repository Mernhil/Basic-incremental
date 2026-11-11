import type { Content, ModifierData, Upgrade, UpgradeUnlock } from '../data';
import { effectiveDamage } from './combat';
import { stageKey } from './floors';
import { collectModifiers, statValue, type Modifier } from './modifiers';
import { Decimal } from './num';
import { canAfford, mineLevel, pay, producerRate, treeLevel, type Price } from './production';
import type { GameState } from './state';

/**
 * The upgrade shelf (DESIGN.md §4): one-time multipliers bought with Money that appear when
 * a threshold is reached (a level, a mastery tier, a boss kill count, lifetime Money earned).
 * Their effects are ordinary modifiers with the source kind `upgrade`. Upgrades marked
 * `permanent` survive an ascension; the rest are bought again each run.
 */

export type UpgradeStatus = 'hidden' | 'available' | 'owned';

export type UpgradeFailure = 'unknown' | 'locked' | 'owned' | 'unaffordable';

export type UpgradeBuyResult =
  { ok: true; state: GameState } | { ok: false; reason: UpgradeFailure };

/** What an upgrade changes, worked out for the shelf (null when there is no simple number). */
export type UpgradePreview =
  | {
      /** A tree kind or mine type: gems per second before and after. */
      kind: 'rate';
      producer: string;
      resource: string;
      before: Decimal;
      after: Decimal;
    }
  | {
      /** Average damage per second before and after. */
      kind: 'damage';
      before: Decimal;
      after: Decimal;
    };

/** One upgrade on the shelf, ready to show. */
export interface ShelfItem {
  id: string;
  name: string;
  /** The effect as a sentence, e.g. "Oak output x2". */
  description: string;
  /** hidden: threshold not reached (do not show); available: can be bought (glow when affordable). */
  status: UpgradeStatus;
  cost: Price;
  /** Available and the Money is there. */
  canAfford: boolean;
  /** Kept through an ascension. */
  permanent: boolean;
  /** The condition that made it appear, e.g. "Oak level 10". */
  unlockText: string;
  /** The modifiers it grants. */
  effects: readonly ModifierData[];
  /** Before / after numbers for the effect when there is a simple one; only for available items. */
  preview: UpgradePreview | null;
}

/** Money earned from dungeons over every run. */
export function lifetimeMoney(state: GameState): Decimal {
  return state.upgrades.moneyEarned;
}

/** Adds the Money gained since `before` to the lifetime total (mutates `state`). */
export function countMoneyEarned(
  state: GameState,
  content: Content,
  before: Decimal | undefined,
): void {
  const now = state.resources[content.upgrades.currency];
  if (!now || !before) return;
  const gained = now.sub(before);
  if (gained.gt(0)) state.upgrades.moneyEarned = state.upgrades.moneyEarned.add(gained);
}

const asUpgrade = (id: string, m: ModifierData): Modifier => ({
  ...m,
  source: { kind: 'upgrade', id },
});

/** The modifiers of every owned upgrade. Read by `collectModifiers`. */
export function upgradeModifiers(state: GameState, content: Content): Modifier[] {
  return state.upgrades.owned.flatMap((id) =>
    (content.upgradeById.get(id)?.effects ?? []).map((m) => asUpgrade(id, m)),
  );
}

/** How much stronger a job's support card effects are (1 = normal), from `card.supportPower`. */
export function supportPower(
  state: GameState,
  content: Content,
  job: 'mining' | 'logging' | 'fighting',
): Decimal {
  const ups = upgradeModifiers(state, content);
  return ups.length === 0 ? new Decimal(1) : statValue('card.supportPower', 1, ups, { job });
}

/** What an ascension keeps of the shelf: permanent upgrades and the lifetime Money. */
export function keepPermanentUpgrades(state: GameState, content: Content): GameState['upgrades'] {
  return {
    owned: state.upgrades.owned.filter((id) => content.upgradeById.get(id)?.permanent),
    moneyEarned: state.upgrades.moneyEarned,
  };
}

function unlockMet(state: GameState, content: Content, u: UpgradeUnlock): boolean {
  switch (u.kind) {
    case 'treeLevel':
      return treeLevel(state, u.tree) >= u.level;
    case 'mineLevel':
      return mineLevel(state, u.mine) >= u.level;
    case 'gemMastery':
      return (state.mastery.gemTiers[u.gem] ?? 0) >= u.tier;
    case 'bossKills': {
      // Kills of the dungeon's boss: its Normal last-floor stage (DESIGN.md §6 Stage stars).
      const dungeon = content.dungeonById.get(u.dungeon);
      const key = dungeon ? stageKey(dungeon.id, 'normal', dungeon.floors) : null;
      return (key ? (state.combat.stageKills[key] ?? 0) : 0) >= u.kills;
    }
    case 'lifetimeMoney':
      return state.upgrades.moneyEarned.gte(u.amount);
  }
}

const METAL_NAMES = ['Stone', 'Bronze', 'Silver', 'Gold', 'Prismatic'];

/** The unlock condition as a short phrase ("Oak level 10", "20 Root Warden kills"). */
export function unlockText(content: Content, u: UpgradeUnlock): string {
  switch (u.kind) {
    case 'treeLevel':
      return `${content.treeById.get(u.tree)?.name ?? u.tree} level ${u.level}`;
    case 'mineLevel':
      return `${content.mineById.get(u.mine)?.name ?? u.mine} level ${u.level}`;
    case 'gemMastery':
      return `${METAL_NAMES[u.tier] ?? u.tier} ${content.resourceById.get(u.gem)?.name ?? u.gem} mastery`;
    case 'bossKills': {
      const d = content.dungeonById.get(u.dungeon);
      return `${u.kills} ${d?.name ?? u.dungeon} kills`;
    }
    case 'lifetimeMoney':
      return `${u.amount.toString()} Money earned`;
  }
}

/** Status of one upgrade: owned wins, then the threshold decides hidden / available. */
export function upgradeStatus(state: GameState, content: Content, upgrade: Upgrade): UpgradeStatus {
  if (state.upgrades.owned.includes(upgrade.id)) return 'owned';
  return unlockMet(state, content, upgrade.unlock) ? 'available' : 'hidden';
}

function previewOf(
  state: GameState,
  content: Content,
  upgrade: Upgrade,
  modifiers: readonly Modifier[],
): UpgradePreview | null {
  const withIt = [...modifiers, ...upgrade.effects.map((m) => asUpgrade(upgrade.id, m))];
  const rate = upgrade.effects.find((m) => m.stat === 'production.rate' && m.scope?.producer);
  const id = rate?.scope?.producer;
  if (id) {
    const tree = content.treeById.get(id);
    const producer = tree ?? content.mineById.get(id);
    if (producer) {
      const job = tree ? 'logging' : 'mining';
      const level = tree ? treeLevel(state, id) : mineLevel(state, id);
      return {
        kind: 'rate',
        producer: id,
        resource: producer.resource,
        before: producerRate(producer, job, modifiers, level),
        after: producerRate(producer, job, withIt, level),
      };
    }
  }
  if (upgrade.effects.some((m) => m.stat === 'combat.damage')) {
    return {
      kind: 'damage',
      before: effectiveDamage(state, content, state.activeDungeonId, modifiers),
      after: effectiveDamage(state, content, state.activeDungeonId, withIt),
    };
  }
  return null;
}

/**
 * The whole shelf in content order: hidden / available / owned, price, affordability and the
 * effect preview. Show `available` and `owned`; `hidden` ones are not revealed yet.
 */
export function upgradeShelf(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): ShelfItem[] {
  return content.upgrades.upgrades.map((u) => {
    const status = upgradeStatus(state, content, u);
    const cost: Price = { resource: u.cost.resource, amount: u.cost.amount };
    return {
      id: u.id,
      name: u.name,
      description: u.description,
      status,
      cost,
      canAfford: status === 'available' && canAfford(state, [cost]),
      permanent: u.permanent,
      unlockText: unlockText(content, u.unlock),
      effects: u.effects,
      preview: status === 'available' ? previewOf(state, content, u, modifiers) : null,
    };
  });
}

/** Buys an available upgrade with Money. */
export function buyUpgrade(state: GameState, content: Content, id: string): UpgradeBuyResult {
  const upgrade = content.upgradeById.get(id);
  if (!upgrade) return { ok: false, reason: 'unknown' };
  const status = upgradeStatus(state, content, upgrade);
  if (status === 'owned') return { ok: false, reason: 'owned' };
  if (status === 'hidden') return { ok: false, reason: 'locked' };
  const cost: Price = { resource: upgrade.cost.resource, amount: upgrade.cost.amount };
  if (!canAfford(state, [cost])) return { ok: false, reason: 'unaffordable' };
  const next = pay(state, [cost]);
  next.upgrades.owned.push(id);
  return { ok: true, state: next };
}
