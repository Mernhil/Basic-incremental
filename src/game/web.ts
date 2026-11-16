import type { Content, WebNode } from '../data';
import type { Modifier } from './modifiers';
import { Decimal } from './num';

/**
 * The skill web (DESIGN.md §10 The skill web): levels of the nodes in `web.json`, bought with the
 * account's skill points. Pure helpers; the points and the buying live in `account.ts`. Every level
 * gives `perLevel` (a keystone's one level gives its modifiers as written), through
 * `collectModifiers` with source `skill`.
 */

const ADDITIVE = new Set(['percent', 'flat']);

/** Skill points the next level costs when the node has `level` levels (`base` x `growth` ^ level). */
export function webNextCost(node: WebNode, level: number): number {
  return Math.round(
    new Decimal(node.cost.base).mul(Decimal.pow(node.cost.growth, level)).toNumber(),
  );
}

/** Skill points the web's levels have taken. */
export function webSpentPoints(content: Content, levels: Readonly<Record<string, number>>): number {
  let sum = 0;
  for (const node of content.web.nodes) {
    for (let l = 0; l < (levels[node.id] ?? 0); l++) sum += webNextCost(node, l);
  }
  return sum;
}

/** The node's Ascension gate is met and the node it hangs off has a level. */
export function webNodeOpen(
  node: WebNode,
  levels: Readonly<Record<string, number>>,
  prestigeCount: number,
): { gate: boolean; parent: boolean } {
  return {
    gate: (node.gate ?? 0) <= prestigeCount,
    parent: node.parent === null || (levels[node.parent] ?? 0) > 0,
  };
}

/** What a node gives at `level`: additive modifiers times the level, the rest as written. */
export function webNodeModifiers(node: WebNode, level: number): Modifier[] {
  if (level <= 0) return [];
  return node.perLevel.map((m) => ({
    ...m,
    value: ADDITIVE.has(m.kind) ? m.value.mul(level) : m.value,
    source: { kind: 'skill', id: node.id },
  }));
}

/** Every web modifier of the saved levels. */
export function webModifiers(
  content: Content,
  levels: Readonly<Record<string, number>>,
): Modifier[] {
  return content.web.nodes.flatMap((n) => webNodeModifiers(n, levels[n.id] ?? 0));
}

/**
 * Brings saved web levels in line with the web and the points earned: unknown nodes and levels above
 * a node's max are dropped, a node whose parent has no level or whose gate is closed is dropped, then
 * the nodes at the end of the web lose levels until what the web and the old tree spent fits `budget`.
 */
export function fitWebToBudget(
  content: Content,
  saved: Readonly<Record<string, number>>,
  prestigeCount: number,
  budget: number,
): Record<string, number> {
  const levels: Record<string, number> = {};
  for (const n of content.web.nodes) {
    const l = Math.min(Math.floor(saved[n.id] ?? 0), n.maxLevel);
    if (l > 0) levels[n.id] = l;
  }
  for (let changed = true; changed;) {
    changed = false;
    for (const n of content.web.nodes) {
      if (!levels[n.id]) continue;
      const open = webNodeOpen(n, levels, prestigeCount);
      if (!open.gate || !open.parent) {
        delete levels[n.id];
        changed = true;
      }
    }
  }
  const nodes = content.web.nodes;
  for (let i = nodes.length - 1; i >= 0 && webSpentPoints(content, levels) > budget; i--) {
    const n = nodes[i]!;
    while ((levels[n.id] ?? 0) > 0 && webSpentPoints(content, levels) > budget) levels[n.id]! -= 1;
    if (!levels[n.id]) delete levels[n.id];
  }
  // a node whose parent lost its last level goes too
  for (let changed = true; changed;) {
    changed = false;
    for (const n of nodes) {
      if (levels[n.id] && !webNodeOpen(n, levels, prestigeCount).parent) {
        delete levels[n.id];
        changed = true;
      }
    }
  }
  return levels;
}
