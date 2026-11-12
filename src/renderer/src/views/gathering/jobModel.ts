import type { Content } from '../../../../data';
import {
  Decimal,
  forgeStatus,
  producersOf,
  toolLines,
  upgradeShelf,
  type GameState,
  type Modifier,
  type ProductionJob,
  type ShelfItem,
} from '../../../../game';
import { ITEM_VIEWBOX } from '../../art/items';
import { amountText } from '../../settings/coins';
import { fmt } from '../../settings/numberFormat';
import { GATHERING_COPY as T } from './copy';

/**
 * View models of the Logging, Mining and Forge views (UI_RULES.md §2; table update 9b). Display
 * logic only: the game decides every number; this picks and words them. Pure, no DOM, unit tested.
 */

/** One chip of "Upgrades for <job>": a one-time upgrade that acts on this job's places or the job. */
export interface JobUpgradeChip {
  id: string;
  name: string;
  effect: string;
  price: string;
  status: 'available' | 'owned';
  affordable: boolean;
}

/** True when an upgrade's effects are scoped to the job or to one of its places. */
export function upgradeIsFor(
  item: Pick<ShelfItem, 'effects'>,
  job: ProductionJob,
  placeIds: ReadonlySet<string>,
): boolean {
  return item.effects.some(
    (e) =>
      e.scope?.job === job ||
      (e.scope?.producer !== undefined && placeIds.has(e.scope.producer as string)),
  );
}

/** The job's upgrade chips, available first (affordable before waiting), then owned. Never hidden ones. */
export function jobUpgradeChips(
  state: GameState,
  content: Content,
  mods: readonly Modifier[],
  job: ProductionJob,
): JobUpgradeChip[] {
  const places = new Set(producersOf(content, job).map((p) => p.id));
  const chips = upgradeShelf(state, content, mods)
    .filter((i) => i.status !== 'hidden' && upgradeIsFor(i, job, places))
    .map<JobUpgradeChip>((i) => ({
      id: i.id,
      name: i.name,
      effect: i.description,
      price: amountText(content, i.cost.resource, i.cost.amount),
      status: i.status === 'owned' ? 'owned' : 'available',
      affordable: i.canAfford,
    }));
  const rank = (c: JobUpgradeChip): number => (c.status === 'owned' ? 2 : c.affordable ? 0 : 1);
  return chips
    .map((c, i) => [c, i] as const)
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1])
    .map(([c]) => c);
}

/** "Tools · 2 ready" for a job's tool lines (how many the held gems can buy now). */
export function toolsReady(
  state: GameState,
  content: Content,
  job: ProductionJob,
  mods: readonly Modifier[],
): number {
  return toolLines(state, content, job, 1, mods).filter((t) => t.offer.affordable).length;
}

/** "Worker slots: 4 of 4 in use". */
export function slotsLine(used: number, total: number): string {
  return T.slotsInUse(used, total);
}

/** A worker's one-line power and strike text: "power ×3.2 · strikes every 1 s". */
export function workerLine(power: string, strikeSeconds: number | null): string {
  const power_ = T.power(power);
  if (strikeSeconds === null || !Number.isFinite(strikeSeconds) || strikeSeconds <= 0)
    return power_;
  const s = strikeSeconds >= 10 ? Math.round(strikeSeconds) : +strikeSeconds.toFixed(1);
  return `${power_} · ${T.strikesEvery(s)}`;
}

/** "gauge 20 / 30": how many of the gauge's steps are filled. */
export function gaugeLine(gauge: number, size: number): string {
  const n = Math.min(size, Math.max(0, Math.round(gauge * size)));
  return T.gauge(n, size);
}

/** Crafts a minute of the forge, "0.8 crafts a minute", from work per second and the recipe's work. */
export function craftsPerMinute(speed: Decimal, work: Decimal): string {
  if (speed.lte(0) || work.lte(0)) return '';
  const n = speed.div(work).mul(60).toNumber();
  const text =
    n >= 10 ? String(Math.round(n)) : n >= 1 ? String(+n.toFixed(1)) : String(+n.toPrecision(2));
  return T.craftsPerMinute(text);
}

/** The forge's recipe as icons: inputs and output as resource ids with amount text. */
export interface ForgeFlow {
  inputs: Array<{ resource: string; amount: string }>;
  output: { resource: string; amount: string };
}

export function forgeFlow(state: GameState, content: Content): ForgeFlow | null {
  const recipe = forgeStatus(state, content)?.recipe;
  if (!recipe) return null;
  return {
    inputs: recipe.inputs.map((i) => ({ resource: i.resource, amount: fmt(i.amount) })),
    output: { resource: recipe.output.resource, amount: fmt(recipe.output.amount) },
  };
}

/**
 * Seconds between a worker's strikes, read from how far the next one is: `inSeconds` is what is
 * left of `1 - progress` of one period. Null with no worker, or near the end of a period (the
 * quotient is unsteady there; the caller keeps its last value).
 */
export function strikeSeconds(target: {
  worker: unknown;
  nextStrike: { progress: number; inSeconds: number };
}): number | null {
  const { progress, inSeconds } = target.nextStrike;
  if (!target.worker || progress >= 0.9 || inSeconds <= 0) return null;
  return inSeconds / (1 - progress);
}

/** An item's art markup (the `<g>` of `cardItemArt`) wrapped as a drawing of its own. */
export const itemSvg = (markup: string): string =>
  markup
    ? `<svg viewBox="${ITEM_VIEWBOX}" aria-hidden="true" focusable="false">${markup}</svg>`
    : '';
