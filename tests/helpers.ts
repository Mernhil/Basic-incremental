import { RANK_TIERS, RARITIES, loadContent, type Content } from '../src/data';
import {
  createInitialState,
  Decimal,
  emptyCardLoadout,
  stageFloors,
  stageKey,
  STAR_DIFFICULTIES,
  type GameState,
} from '../src/game';

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
  const pin = <
    T extends { id: string; baseRate: Decimal; depth: Content['trees'][number]['depth'] },
  >(
    list: T[],
  ): T[] =>
    list.map((p) => ({
      ...p,
      baseRate: new Decimal(rates[p.id] ?? p.baseRate),
      // no digging: rule tests count exact output; depth tests use `shippedContent`
      depth: { ...p.depth, digRate: new Decimal('1e-30') },
    }));
  const trees = pin(bundled.trees);
  const mines = pin(bundled.mines);
  return {
    ...bundled,
    // lucky strikes off: rule tests count exact output (lucky tests set their own)
    production: {
      ...bundled.production,
      lucky: {
        logging: { ...bundled.production.lucky.logging, payoutSeconds: 0 },
        mining: { ...bundled.production.lucky.mining, payoutSeconds: 0 },
      },
    },
    trees,
    treeById: new Map(trees.map((t) => [t.id, t])),
    mines,
    mineById: new Map(mines.map((m) => [m.id, m])),
  };
}

/**
 * The star bar pinned to one whole copy per star at every rarity and tier (the shipped one asks a
 * fraction of a copy at low tiers, DESIGN.md §5 Star bar), so the star bar, shard and tier-up rule
 * tests have whole copies to count. The shipped table is tested in cardsFromStart.test.ts.
 */
function pinStarBar(bundled: Content): Content {
  const needs = Object.fromEntries(
    RARITIES.map((r) => [r, Object.fromEntries(RANK_TIERS.map((t) => [t, 1]))]),
  ) as unknown as Content['cardRules']['starBar']['needs'];
  return {
    ...bundled,
    cardRules: { ...bundled.cardRules, starBar: { ...bundled.cardRules.starBar, needs } },
  };
}

/**
 * Stage stars (DESIGN.md §6) with no damage, loot or chests: rule tests that count exact damage,
 * drops and crystals are not moved by the star levels their kills reach. Star tests use the real
 * numbers.
 */
export function neutralStars(base: Content): Content {
  const stageStars = {
    ...base.combat.stageStars,
    damagePerLevel: 0,
    lootPerLevel: 0,
    chests: { ...base.combat.stageStars.chests, rewards: [] },
  };
  return { ...base, combat: { ...base.combat, stageStars } };
}

/**
 * Every stage of every dungeon at the star level that opens its overflow switch, with the switch
 * on (DESIGN.md §6 Overflow): leftover damage from a kill carries on everywhere. Mutates and
 * returns `state`. Use it with `neutralStars` content so the stars add nothing else.
 */
export function withOverflow(state: GameState, base: Content): GameState {
  const kills = base.combat.stageStars.kills[base.combat.stageStars.overflowFromLevel - 1]!;
  for (const dungeon of base.dungeons) {
    for (const difficulty of STAR_DIFFICULTIES) {
      for (const floor of stageFloors(base, dungeon)) {
        const key = stageKey(dungeon.id, difficulty, floor);
        state.combat.stageKills[key] = Math.max(kills, state.combat.stageKills[key] ?? 0);
        state.combat.overflow[key] = true;
      }
    }
  }
  return state;
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

/**
 * Elements (DESIGN.md §6) switched off: rule tests count exact damage and output with the starter
 * cards, which would otherwise get the weakness and matching-worker bonuses. Element tests use
 * the real `loadContent()`.
 */
function pinNoElements(bundled: Content): Content {
  const zero = new Decimal(0);
  const elements = { weakness: zero, resistance: zero, supportBonus: zero, production: zero };
  return { ...bundled, combat: { ...bundled.combat, elements } };
}

/** The pinned content with the shipped floors of every dungeon back in. */
export const floorsContent: Content = pinNoElements(pinStarBar(pinProductionRates(loadContent())));

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
    trialMastery: { ...content.progression.trialMastery, perTier: [] },
  },
  mines: plainMines,
  mineById: new Map(plainMines.map((m) => [m.id, m])),
  combat: {
    ...neutralStars(content).combat,
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

/** A new game with an empty fighting loadout and no workers: no card effects or level-ups, for
 *  exact rate maths. */
export function bareState(): GameState {
  const state = freshState();
  state.cards.loadouts.fighting = emptyCardLoadout();
  state.production.workers = {};
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

/**
 * The same content where only account levels give skill points: `freshState` counts every
 * achievement as unlocked, and each would give a point (DESIGN.md §10), so exact skill point tests
 * use this.
 */
export function levelPointsOnly(base: Content = content): Content {
  return {
    ...base,
    account: { ...base.account, levels: { ...base.account.levels, pointsPerAchievement: 0 } },
  };
}
