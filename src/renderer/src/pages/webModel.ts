import type { Content, WebArm, WebNode } from '../../../data';
import { webNextCost, webSpentPoints, type GameState } from '../../../game';
import { COPY } from '../copy';
import { effectText } from '../shell/modifierText';
import { statGlyph } from '../ui/webGlyphs';
import { AREA_COLOUR, CENTRE, type EdgeView, type NodeState, type NodeView } from './skillsModel';

/**
 * The skill web as display data (UI_RULES.md §2 The Skill Tree, pick 4a; DESIGN.md §10 The skill web):
 * where each node sits (one step from its parent), what state it is in, what a level gives now and
 * next, what the next level costs. No DOM; the rules of buying are the game's, not here.
 */

/** One step between two plates, and the nearest two plates may sit (a plate and its name). */
export const STEP = 140;
export const MIN_GAP = 125;

type Pt = { x: number; y: number };
const rad = (deg: number): number => (deg * Math.PI) / 180;
const SLOT_TURN = { forward: 0, left: -60, right: 60 } as const;

/** A node's place: its parent's, one step on in the arm's direction turned by its slot. */
export function webPositions(content: Content): Map<string, Pt> {
  const out = new Map<string, Pt>();
  const degrees = new Map(content.web.arms.map((a) => [a.id, a.degrees]));
  for (const n of content.web.nodes) {
    const from = n.parent === null ? CENTRE : out.get(n.parent)!;
    const deg = degrees.get(n.arm)! + SLOT_TURN[n.slot];
    out.set(n.id, {
      x: Math.round((from.x + STEP * Math.cos(rad(deg))) * 10) / 10,
      y: Math.round((from.y + STEP * Math.sin(rad(deg))) * 10) / 10,
    });
  }
  return out;
}

/** The skill-point price of the next level of a node that has `level` (the node's `cost` object). */
export const nextLevelCost = webNextCost;

/** Skill points the web's levels have taken so far. */
export const webSpent = webSpentPoints;

const ARM_NAME: Record<WebArm, string> = {
  logging: COPY.skills.areas.logging,
  mining: COPY.skills.areas.mining,
  dungeon: COPY.skills.areas.dungeon,
  cards: COPY.skills.areas.cards,
};
/** The gem art of the old tree that a web node borrows when a Skill nodes style is worn. */
const ART_BRANCH = {
  logging: 'logging',
  mining: 'mining',
  dungeon: 'combat',
  cards: 'collection',
} as const;

export interface WebView {
  nodes: NodeView[];
  edges: EdgeView[];
  /** Nodes you can buy a level of now. */
  affordable: number;
  /** Nodes with at least one level, and every node in the web. */
  learned: number;
  total: number;
  /** Skill points left after the web's levels (the old tree's are taken off by the caller). */
  spent: number;
}

/**
 * The web from the saved levels. `free` is the skill points to spend. A node is known when it has a
 * level or its parent does and its Ascension gate is met; a "?" is a node one step past one you
 * own or can buy; the rest of the web stays hidden.
 */
export function webView(content: Content, state: GameState, free: number): WebView {
  const levels = state.account.web;
  const pos = webPositions(content);
  const byId = content.webNodeById;
  const level = (id: string): number => levels[id] ?? 0;
  const gateMet = (n: WebNode): boolean => (n.gate ?? 0) <= state.prestigeCount;
  const parentOwned = (n: WebNode): boolean => n.parent === null || level(n.parent) > 0;
  const stateOf = (n: WebNode): NodeState => {
    if (level(n.id) >= n.maxLevel) return 'maxed';
    if (level(n.id) > 0) return 'owned';
    if (!gateMet(n)) return 'closed';
    return parentOwned(n) ? 'open' : 'locked';
  };
  const canBuy = (n: WebNode): boolean => {
    const l = level(n.id);
    return l < n.maxLevel && gateMet(n) && parentOwned(n) && nextLevelCost(n, l) <= free;
  };
  // known: owned or open; "?" next to what you own or can buy
  const known = new Set(
    content.web.nodes
      .filter((n) => ['owned', 'maxed', 'open'].includes(stateOf(n)))
      .map((n) => n.id),
  );
  const reveal = new Set(
    content.web.nodes.filter((n) => level(n.id) > 0 || canBuy(n)).map((n) => n.id),
  );

  const nodes: NodeView[] = [];
  for (const n of content.web.nodes) {
    const isKnown = known.has(n.id);
    const next = n.parent === null || (n.parent !== null && reveal.has(n.parent));
    if (!isKnown && !next) continue;
    const l = level(n.id);
    const st: NodeState = isKnown ? stateOf(n) : 'unknown';
    const at = (lv: number) =>
      n.perLevel.map((m) =>
        effectText({
          ...m,
          value: ['percent', 'flat'].includes(m.kind) ? m.value.mul(lv) : m.value,
        }),
      );
    const parent = n.parent ? byId.get(n.parent) : undefined;
    const spot = pos.get(n.id)!;
    const arm = n.arm;
    nodes.push({
      id: n.id,
      name: st === 'unknown' ? COPY.skills.unknownName : n.name,
      branch: ART_BRANCH[arm],
      colour: AREA_COLOUR[arm],
      x: spot.x,
      y: spot.y,
      ring: n.gate ?? 0,
      kind: n.keystone ? 'keystone' : 'small',
      circle: null,
      keystone: n.keystone === true,
      rank: l,
      maxRank: n.maxLevel,
      state: st,
      glyph: st === 'unknown' ? 'lock' : n.keystone ? 'key' : statGlyph(n.perLevel[0]?.stat),
      canBuy: canBuy(n),
      cost: nextLevelCost(n, l),
      now: st === 'unknown' ? [] : l > 0 ? at(l) : [],
      next: st === 'unknown' || l >= n.maxLevel ? [] : at(l + 1),
      needs:
        st === 'unknown'
          ? COPY.skills.unknownNote
          : !gateMet(n)
            ? COPY.skills.needsRing(n.gate ?? 0)
            : !parentOwned(n) && parent
              ? COPY.skills.needs(parent.name)
              : '',
      rankText: COPY.skills.rankShort(l, n.maxLevel),
      label: COPY.skills.nodeLabel(
        st === 'unknown' ? COPY.skills.unknownName : n.name,
        COPY.skills.state[st],
        COPY.skills.rank(l, n.maxLevel),
      ),
      areaLabel: ARM_NAME[arm],
      what: st === 'unknown' ? '' : n.description,
    });
  }
  const shown = new Map(nodes.map((n) => [n.id, n]));
  const edges: EdgeView[] = [];
  for (const wn of content.web.nodes) {
    const to = shown.get(wn.id);
    if (!to) continue;
    const from = wn.parent === null ? undefined : shown.get(wn.parent);
    if (wn.parent !== null && !from) continue;
    const a = from ?? CENTRE;
    const parentLearned = from ? from.rank > 0 : true;
    edges.push({
      x1: a.x,
      y1: a.y,
      x2: to.x,
      y2: to.y,
      colour: to.colour,
      lit: to.rank > 0,
      state: to.rank > 0 ? 'learned' : parentLearned && to.state !== 'unknown' ? 'open' : 'locked',
    });
  }
  return {
    nodes,
    edges,
    affordable: nodes.filter((n) => n.canBuy).length,
    learned: content.web.nodes.filter((n) => level(n.id) > 0).length,
    total: content.web.nodes.length,
    spent: webSpent(content, levels),
  };
}
