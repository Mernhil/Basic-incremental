import { JOBS, loadContent, type Content } from '../src/data';
import { createInitialState, Decimal, emptyCardLoadout, type GameState } from '../src/game';

/**
 * The bundled content with the trees' and mines' base rates pinned to the round numbers the rule
 * tests count in (Oak 1, Copper Quarry 0.5 a second ...). The shipped rates are tuning, retuned
 * with the sim (DESIGN.md §14); the level, milestone and burst rules do not depend on them.
 */
function pinProductionRates(bundled: Content): Content {
  const rates: Record<string, string> = {
    oak: '1',
    ironbark: '0.5',
    moonwillow: '0.25',
    copper_quarry: '0.5',
    iron_deeps: '0.25',
    crystal_grotto: '0.1',
  };
  const pin = <T extends { id: string; baseRate: Decimal }>(list: T[]): T[] =>
    list.map((p) => ({ ...p, baseRate: new Decimal(rates[p.id] ?? p.baseRate) }));
  const trees = pin(bundled.trees);
  const mines = pin(bundled.mines);
  return {
    ...bundled,
    trees,
    treeById: new Map(trees.map((t) => [t.id, t])),
    mines,
    mineById: new Map(mines.map((m) => [m.id, m])),
  };
}

/**
 * The star bar pinned to copies for every rarity (the shipped one lets Rare and up star up for free,
 * DESIGN.md §5 Star bar), so the star bar, shard and tier-up rule tests have copies to count.
 */
function pinStarBar(bundled: Content): Content {
  const needs = {
    common: [1, 1, 1, 2, 2],
    uncommon: [1, 1, 1, 1, 2],
    rare: [1, 1, 1, 1, 1],
    epic: [1, 0, 1, 1, 1],
    legendary: [1, 0, 1, 1, 1],
    mythic: [1, 0, 1, 0, 1],
    void: [1, 0, 1, 0, 1],
  };
  return {
    ...bundled,
    cardRules: { ...bundled.cardRules, starBar: { ...bundled.cardRules.starBar, needs } },
  };
}

/**
 * Every dungeon pinned to one floor: its boss (DESIGN.md §6 Dungeon floors). The boss rule tests
 * (damage, drops, knockouts, medals) then fight the boss from the first second, as they did
 * before floors, and tuning the floor counts does not move them. Floor tests use `floorsContent`.
 */
function pinOneFloor(bundled: Content): Content {
  const dungeons = bundled.dungeons.map((d) => ({ ...d, floors: 1 }));
  return { ...bundled, dungeons, dungeonById: new Map(dungeons.map((d) => [d.id, d])) };
}

/** The pinned content with the shipped floors of every dungeon back in. */
export const floorsContent: Content = pinStarBar(pinProductionRates(loadContent()));

export const content: Content = pinOneFloor(floorsContent);

/**
 * Crystals per "pull unit": rule tests count crystals in units of a tenth of a Card Portal pull
 * (10 a pull, 100 a 10-pull), so a retune of the crystal prices and drops does not move them.
 */
export const CRYSTAL_UNIT =
  content.portals.find((p) => p.id === 'card_portal')!.cost.single.toNumber() / 10;

const noMilestones = { every: 25, multiplier: new Decimal(1) };
const plainMines = content.mines.map((m) => ({
  ...m,
  level: { ...m.level, milestones: noMilestones },
}));

/**
 * The bundled content with crits (DESIGN.md §6), level milestones (11.12) and mastery
 * bonuses (16, E2 and E3; tiers still settle) switched off, so rule tests can set an exact
 * damage (`withDps`) and check exact totals. Crit, milestone and mastery tests use
 * the real `content`.
 */
export const plainContent: Content = {
  ...content,
  progression: {
    ...content.progression,
    gemMastery: { ...content.progression.gemMastery, perTier: [] },
    bossMastery: { ...content.progression.bossMastery, perTier: [] },
    trialMastery: { ...content.progression.trialMastery, perTier: [] },
  },
  mines: plainMines,
  mineById: new Map(plainMines.map((m) => [m.id, m])),
  combat: {
    ...content.combat,
    crit: { chance: 0, damage: new Decimal(1) },
  },
};

/**
 * The same content with the Common base damage set to `dps`: a fresh game (Ember Squire, Bronze
 * ★1 Lv 1, leading) then deals exactly `dps` per second, and so does a bare-handed one (the unarmed
 * damage is set to it too). Rule tests use it where they need an exact damage; the rarity ratios stay as they are.
 */
export function withDps(dps: Decimal | number | string, base: Content = plainContent): Content {
  const common = new Decimal(dps);
  const baseDamage = Object.fromEntries(
    Object.keys(base.cardRules.baseDamage).map((rarity) => [
      rarity,
      common.mul(
        base.cardRules.baseDamage[rarity as keyof typeof base.cardRules.baseDamage].div(
          base.cardRules.baseDamage.common,
        ),
      ),
    ]),
  ) as Content['cardRules']['baseDamage'];
  return {
    ...base,
    cardRules: { ...base.cardRules, baseDamage },
    combat: { ...base.combat, unarmedDamage: common },
  };
}

/**
 * A new game for rule tests: every achievement counts as already unlocked, so their rewards
 * never change the exact totals those tests check. Achievement tests use `newGame()`.
 */
export function freshState(): GameState {
  const state = createInitialState(content);
  for (const a of content.achievements) state.achievements[a.id] = 0;
  return state;
}

/** A brand-new game exactly as the player starts it (nothing unlocked). */
export function newGame(): GameState {
  return createInitialState(content);
}

/** A new game with empty card loadouts: no card effects or level-ups, for exact rate maths. */
export function bareState(): GameState {
  const state = freshState();
  for (const job of JOBS) state.cards.loadouts[job] = emptyCardLoadout();
  return state;
}

/** Always returns the same value; handy for forcing drop/no-drop. */
export const constantRng = (value: number) => () => value;

/**
 * The same content with one dungeon's boss attack set to `damage` every `intervalSeconds`: rule
 * tests that time knockouts pin the boss they use, so tuning the dungeon data does not move them.
 */
export function withBossAttack(
  base: Content,
  dungeonId: string,
  damage: Decimal | number | string,
  intervalSeconds: number,
): Content {
  const dungeons = base.dungeons.map((d) =>
    d.id === dungeonId
      ? {
          ...d,
          boss: { ...d.boss, attack: { damage: new Decimal(damage), intervalSeconds } },
        }
      : d,
  );
  return { ...base, dungeons, dungeonById: new Map(dungeons.map((d) => [d.id, d])) };
}

/**
 * The same content with one dungeon's boss HP set to `hp`: rule tests that need a fight with no
 * kill (or a kill at an exact time) pin the boss they use, so tuning the HP does not move them.
 */
export function withBossHp(
  base: Content,
  dungeonId: string,
  hp: Decimal | number | string,
): Content {
  const dungeons = base.dungeons.map((d) =>
    d.id === dungeonId ? { ...d, boss: { ...d.boss, hp: new Decimal(hp) } } : d,
  );
  return { ...base, dungeons, dungeonById: new Map(dungeons.map((d) => [d.id, d])) };
}
