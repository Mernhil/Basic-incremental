import type { Content } from '../../../data';
import { forgeStatus, forgeWorker, workerPower, workplaceOf, type GameState } from '../../../game';
import { COPY } from '../copy';
import { fmt } from '../settings/numberFormat';
import { formatWait } from './productionModel';

/**
 * Display logic of the forge panel on the Production page (DESIGN.md §4 The forge): the recipes,
 * the worker choices, the progress bar and the status line. Pure: no game rules here.
 */

export interface ForgeRecipeView {
  id: string;
  name: string;
  /** "20K Moonwillow gem + 20K Grotto gem → 1 Star Dust". */
  text: string;
  active: boolean;
}

export interface ForgeWorkerOption {
  cardId: string;
  /** "Elder Treant · power 2.5 (works at Oak)". */
  label: string;
}

export interface ForgeView {
  recipes: ForgeRecipeView[];
  workers: ForgeWorkerOption[];
  /** The card working the forge, or '' for none. */
  worker: string;
  /** Progress to the next craft, 0..1. */
  fraction: number;
  /** One line: what it is doing, or why it is not. */
  status: string;
  /** Progress per second text ("1.25 work/s"); empty with no worker. */
  speed: string;
}

const resName = (content: Content, id: string): string => content.resourceById.get(id)?.name ?? id;

export function forgeView(state: GameState, content: Content): ForgeView {
  const status = forgeStatus(state, content)!;
  const t = COPY.forge;
  const recipes = content.production.forge.recipes.map((r) => ({
    id: r.id,
    name: r.name,
    text: t.recipe(
      r.inputs.map((i) => `${fmt(i.amount)} ${resName(content, i.resource)}`).join(' + '),
      `${fmt(r.output.amount)} ${resName(content, r.output.resource)}`,
    ),
    active: status.recipe?.id === r.id,
  }));
  const names = new Map([...content.trees, ...content.mines].map((p) => [p.id, p.name]));
  const workers: ForgeWorkerOption[] = [];
  for (const card of content.cards) {
    const owned = state.cards.owned[card.id];
    if (card.job === 'fighting' || !owned) continue;
    const at = workplaceOf(state, content, card.id);
    workers.push({
      cardId: card.id,
      label: t.worker(
        card.name,
        fmt(workerPower(content, card.id, owned)),
        at ? (names.get(at) ?? at) : null,
        owned.tier,
      ),
    });
  }
  let line: string;
  if (!status.recipe) line = t.noRecipe;
  else if (!status.worker) line = t.noWorker;
  else if (status.waitingForGems) line = t.waitingForGems;
  else if (status.secondsToCraft !== null) line = t.making(formatWait(status.secondsToCraft));
  else line = t.noWorker;
  return {
    recipes,
    workers,
    worker: forgeWorker(state, content) ?? '',
    fraction: status.fraction,
    status: line,
    speed: status.worker ? t.speed(fmt(status.speed)) : '',
  };
}
