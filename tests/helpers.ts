import { JOBS, loadContent, type Content } from '../src/data';
import { createInitialState, Decimal, emptyCardLoadout, type GameState } from '../src/game';

export const content: Content = loadContent();

const noMilestones = { every: 25, multiplier: new Decimal(1) };
const plainMines = content.mines.map((m) => ({
  ...m,
  level: { ...m.level, milestones: noMilestones },
}));

/**
 * The bundled content with crits (DESIGN.md 11.11), level milestones (11.12) and mastery
 * bonuses (16, E2 and E3; tiers still settle) switched off, so rule tests can set an exact
 * damage through upgrade levels and check exact totals. Crit, milestone and mastery tests use
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
    damageUpgrades: content.combat.damageUpgrades.map((u) => ({ ...u, milestones: noMilestones })),
  },
};

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
