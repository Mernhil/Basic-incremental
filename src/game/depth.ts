import type { Content, DepthDef } from '../data';
import { Decimal } from './num';
import type { DepthProgress, GameState } from './state';

/**
 * Depth and growth (DESIGN.md §4 Depth and growth). Each mine has layers and each tree has ages
 * (`depth` in `mines.json` / `trees.json`). A layer has a hardness that the worker's digging
 * breaks, as a fighting card's damage breaks an enemy's health; breaking it moves to the next
 * layer, which multiplies that place's yield. A place with no worker does not dig.
 *
 * Digging is a rate × time, so it adds up the same however time is split. The layer itself is
 * settled on the 1 s play-time grid (`settleDepth`, tick.ts, like card levels and mastery), so the
 * yield is fixed inside every step and offline matches online. The state is `production.depth`
 * (layer, 1-based, and the hardness already broken on it); an Ascension resets it.
 *
 * This file reads nothing but its arguments, so `production.ts` can import it.
 */

const NONE: DepthProgress = { layer: 1, progress: new Decimal(0) };

/** The definition of a tree's or mine's depth, or undefined for an unknown id. */
export function depthDef(content: Content, producerId: string): DepthDef | undefined {
  return (content.treeById.get(producerId) ?? content.mineById.get(producerId))?.depth;
}

/** The deepest layer of a definition. */
export const maxLayer = (def: DepthDef): number => def.names.length;

/** Hardness of layer `layer` (1-based). */
export function layerHardness(def: DepthDef, layer: number): Decimal {
  return def.hardness.mul(def.hardnessGrowth.pow(layer - 1));
}

/** The yield multiplier of layer `layer` (1 on the first). */
export function layerYield(def: DepthDef, layer: number): Decimal {
  return def.yieldGrowth.pow(layer - 1);
}

/** A place's saved depth: layer 1 with nothing broken when it has none. */
export function depthOf(state: GameState, producerId: string): DepthProgress {
  return state.production.depth[producerId] ?? NONE;
}

/** A place's depth as the row shows it. */
export interface DepthInfo {
  /** 1-based layer or age. */
  layer: number;
  max: number;
  /** The name of the layer or age. */
  name: string;
  /** Hardness of this layer and the part of it already broken. */
  hardness: Decimal;
  progress: Decimal;
  /** Progress through this layer, 0..1 (1 at the deepest layer). */
  fraction: number;
  atMax: boolean;
  /** Yield multiplier of this layer, and of the next (null at the deepest). */
  yieldMultiplier: Decimal;
  nextYieldMultiplier: Decimal | null;
}

/** Ready-to-show depth of a place; null for an unknown id. */
export function depthInfo(
  state: GameState,
  content: Content,
  producerId: string,
): DepthInfo | null {
  const def = depthDef(content, producerId);
  if (!def) return null;
  const saved = depthOf(state, producerId);
  const layer = Math.min(maxLayer(def), Math.max(1, saved.layer));
  const atMax = layer >= maxLayer(def);
  const hardness = layerHardness(def, layer);
  return {
    layer,
    max: maxLayer(def),
    name: def.names[layer - 1]!,
    hardness,
    progress: atMax ? new Decimal(0) : saved.progress,
    fraction: atMax ? 1 : Math.min(1, Math.max(0, saved.progress.div(hardness).toNumber())),
    atMax,
    yieldMultiplier: layerYield(def, layer),
    nextYieldMultiplier: atMax ? null : layerYield(def, layer + 1),
  };
}

/** The yield multiplier of the layer a place is on now. */
export function depthYield(state: GameState, content: Content, producerId: string): Decimal {
  const def = depthDef(content, producerId);
  return def ? layerYield(def, depthInfo(state, content, producerId)!.layer) : new Decimal(1);
}

/**
 * Hardness broken per second: the definition's `digRate` × the workers' power × their strike
 * speed. 0 with no worker (`power` is 0 then) and at the deepest layer.
 */
export function digPerSecond(
  state: GameState,
  content: Content,
  producerId: string,
  power: number,
  speed: number,
): Decimal {
  const def = depthDef(content, producerId);
  if (!def || power <= 0 || speed <= 0) return new Decimal(0);
  if (depthOf(state, producerId).layer >= maxLayer(def)) return new Decimal(0);
  return def.digRate.mul(power).mul(speed);
}

/** Adds `seconds` of digging to a place (mutates `next`, a fresh clone). */
export function addDigging(
  next: GameState,
  content: Content,
  producerId: string,
  perSecond: Decimal,
  seconds: number,
): void {
  if (perSecond.lte(0) || seconds <= 0 || !depthDef(content, producerId)) return;
  const saved = depthOf(next, producerId);
  next.production.depth[producerId] = {
    layer: saved.layer,
    progress: saved.progress.add(perSecond.mul(seconds)),
  };
}

/** Whether a settle would break a layer. */
export function depthDue(state: GameState, content: Content): boolean {
  for (const [id, saved] of Object.entries(state.production.depth)) {
    const def = depthDef(content, id);
    if (def && saved.layer < maxLayer(def) && saved.progress.gte(layerHardness(def, saved.layer)))
      return true;
  }
  return false;
}

/**
 * Breaks every layer whose hardness the progress has reached (mutates `state`): the leftover
 * carries into the next layer, and the deepest layer keeps no progress. Returns the places that
 * moved down, place id -> new layer.
 */
export function settleDepth(state: GameState, content: Content): Record<string, number> {
  const moved: Record<string, number> = {};
  for (const [id, saved] of Object.entries(state.production.depth)) {
    const def = depthDef(content, id);
    if (!def) continue;
    let { layer, progress } = saved;
    layer = Math.min(maxLayer(def), Math.max(1, layer));
    while (layer < maxLayer(def) && progress.gte(layerHardness(def, layer))) {
      progress = progress.sub(layerHardness(def, layer));
      layer += 1;
    }
    if (layer >= maxLayer(def)) progress = new Decimal(0);
    if (layer !== saved.layer) moved[id] = layer;
    state.production.depth[id] = { layer, progress };
  }
  return moved;
}
