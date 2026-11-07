import { JOBS, loadContent, type Content } from '../src/data';
import { createInitialState, Decimal, emptyCardLoadout, type GameState } from '../src/game';

export const content: Content = loadContent();

const noMilestones = { every: 25, multiplier: new Decimal(1) };
const plainMines = content.mines.map((m) => ({
  ...m,
  level: { ...m.level, milestones: noMilestones },
}));

/**
 * The bundled content with crits (DESIGN.md 11.11) and level milestones (11.12) switched off,
 * so rule tests can set an exact damage through upgrade levels and check exact totals. Crit and
 * milestone tests use the real `content`.
 */
export const plainContent: Content = {
  ...content,
  mines: plainMines,
  mineById: new Map(plainMines.map((m) => [m.id, m])),
  combat: {
    ...content.combat,
    crit: { chance: 0, damage: new Decimal(1) },
    damageUpgrades: content.combat.damageUpgrades.map((u) => ({ ...u, milestones: noMilestones })),
  },
};

export function freshState(): GameState {
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
