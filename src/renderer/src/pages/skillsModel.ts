import { fmt } from '../settings/numberFormat';
import { SKILL_BRANCHES, type Content, type Rank, type SkillBranch } from '../../../data';
import {
  Decimal,
  type CardEnhancementInfo,
  type GameState,
  type RespecInfo,
  type SkillNodeInfo,
  type SkillPoints,
} from '../../../game';
import { COPY } from '../copy';
import { effectText } from '../shell/modifierText';

/**
 * The Skill Tree page (DESIGN.md §10, §11 "radial constellation", A8 A) and the card enhancement
 * star chart, as plain display data: positions on the constellation, node states, effect lines,
 * the respec offer. No DOM, no rules: every number comes from the game's account API.
 */

// ---- constellation geometry ---------------------------------------------------------------------

/** The constellation's drawing box (SVG viewBox units); the centre star sits at CENTRE. */
export const SKY = { x: -430, y: -352, w: 860, h: 704 } as const;
export const CENTRE = { x: 0, y: 0 } as const;
/** Ring radius per depth (1 = the gems next to the centre star). */
const RING = [0, 122, 206, 288] as const;
/** Where the branch name sits, past the outer ring. */
const LABEL_R = 330;
/** Angle between two neighbouring gems of a branch, in degrees... */
const SLOT_DEG = 20;
/** ...but never closer than this along the ring (SKY units), so inner gems keep apart. */
const SLOT_GAP = 66;
const slotDeg = (r: number): number => Math.max(SLOT_DEG, ((SLOT_GAP / r) * 180) / Math.PI);

/** Branch colours: each branch lights its gems in its own colour (DESIGN.md §11). */
export const BRANCH_COLOUR: Record<SkillBranch, string> = {
  logging: '#74d06a',
  mining: '#5cb8f0',
  combat: '#f0694f',
  luck: '#b98cff',
  collection: '#f5c24c',
  automation: '#4fd8c4',
};

export type NodeState = 'locked' | 'open' | 'owned' | 'maxed';

export interface NodeView {
  id: string;
  name: string;
  branch: SkillBranch;
  colour: string;
  /** Position in SKY units. */
  x: number;
  y: number;
  depth: number;
  /** An outermost gem (the ring's far end) is drawn as a larger keystone. */
  keystone: boolean;
  rank: number;
  maxRank: number;
  state: NodeState;
  canBuy: boolean;
  cost: number;
  /** The bonus at the current rank ("+10% logging production"), empty at rank 0. */
  now: string[];
  /** The bonus at the next rank, empty at max rank. */
  next: string[];
  /** "Needs Grove Yield first", or "" once met. */
  needs: string;
  rankText: string;
  label: string;
}

export interface EdgeView {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  colour: string;
  /** The gem at the far end has at least one rank. */
  lit: boolean;
}

export interface BranchView {
  id: SkillBranch;
  name: string;
  colour: string;
  /** Label position and anchor in SKY units. */
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
  /** Ranks learned / all ranks in the branch. */
  ranks: number;
  maxRanks: number;
}

export interface TreeView {
  nodes: NodeView[];
  edges: EdgeView[];
  branches: BranchView[];
  points: SkillPoints;
}

const rad = (deg: number): number => (deg * Math.PI) / 180;
const round = (n: number): number => Math.round(n * 10) / 10;
const at = (deg: number, r: number) => ({
  x: round(CENTRE.x + r * Math.cos(rad(deg))),
  y: round(CENTRE.y + r * Math.sin(rad(deg))),
});

/** Ray angle of a branch: Logging at the top, then clockwise in DESIGN.md §10 order. */
export const branchAngle = (branch: SkillBranch): number =>
  -90 + SKILL_BRANCHES.indexOf(branch) * (360 / SKILL_BRANCHES.length);

/**
 * Lays one branch out as a small tree along its ray: depth = longest chain of requirements, each
 * leaf gets its own slot across the ray, and a gem with children sits in the middle of them.
 */
function layoutBranch(infos: SkillNodeInfo[]): Map<string, { deg: number; depth: number }> {
  const ids = new Set(infos.map((i) => i.node.id));
  const parentsOf = (i: SkillNodeInfo) => i.node.requires.filter((r) => ids.has(r));
  const byId = new Map(infos.map((i) => [i.node.id, i]));
  const depth = new Map<string, number>();
  const depthOf = (id: string, seen = new Set<string>()): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    const info = byId.get(id)!;
    if (seen.has(id)) return 1; // a cycle in data: keep the drawing finite
    seen.add(id);
    const d = 1 + Math.max(0, ...parentsOf(info).map((p) => depthOf(p, seen)));
    depth.set(id, d);
    return d;
  };
  for (const i of infos) depthOf(i.node.id);
  const children = new Map<string, string[]>();
  for (const i of infos) {
    const first = parentsOf(i)[0];
    if (first) children.set(first, [...(children.get(first) ?? []), i.node.id]);
  }
  // slots: leaves left to right in data order (depth first), parents centred on their children
  const slot = new Map<string, number>();
  let leaves = 0;
  const place = (id: string): number => {
    const kids = children.get(id) ?? [];
    const s = kids.length === 0 ? leaves++ : kids.map(place).reduce((a, b) => a + b) / kids.length;
    slot.set(id, s);
    return s;
  };
  for (const i of infos) if (parentsOf(i).length === 0) place(i.node.id);
  for (const i of infos) if (!slot.has(i.node.id)) place(i.node.id);
  const out = new Map<string, { deg: number; depth: number }>();
  for (const i of infos) {
    const s = slot.get(i.node.id)!;
    const d = Math.min(depth.get(i.node.id)!, RING.length - 1);
    // a branch stays inside its sixth of the circle
    const step = leaves > 1 ? Math.min(slotDeg(RING[d]!), 52 / (leaves - 1)) : 0;
    out.set(i.node.id, { deg: (s - (leaves - 1) / 2) * step, depth: d });
  }
  return out;
}

function nodeState(i: SkillNodeInfo): NodeState {
  if (i.rank >= i.maxRank) return 'maxed';
  if (i.rank > 0) return 'owned';
  return i.requiresMet ? 'open' : 'locked';
}

/** The whole constellation from `skillTree(state, content)` and the skill points. */
export function treeView(
  content: Content,
  infos: readonly SkillNodeInfo[],
  points: SkillPoints,
): TreeView {
  const nameOf = (id: string) => content.account.tree.find((n) => n.id === id)?.name ?? id;
  const nodes: NodeView[] = [];
  const branches: BranchView[] = [];
  for (const branch of SKILL_BRANCHES) {
    const list = infos.filter((i) => i.node.branch === branch);
    const ray = branchAngle(branch);
    const layout = layoutBranch(list);
    for (const i of list) {
      const { deg, depth } = layout.get(i.node.id)!;
      const pos = at(ray + deg, RING[depth]!);
      const state = nodeState(i);
      const rankText = COPY.skills.rankShort(i.rank, i.maxRank);
      const missing = i.node.requires.filter(
        (r) => (infos.find((x) => x.node.id === r)?.rank ?? 0) === 0,
      );
      nodes.push({
        id: i.node.id,
        name: i.node.name,
        branch,
        colour: BRANCH_COLOUR[branch],
        ...pos,
        depth,
        keystone: depth >= RING.length - 1,
        rank: i.rank,
        maxRank: i.maxRank,
        state,
        canBuy: i.canBuy,
        cost: i.node.cost,
        now: i.current.map(effectText),
        next: i.next.map(effectText),
        needs: i.requiresMet ? '' : COPY.skills.needs(missing.map(nameOf).join(' and ')),
        rankText,
        label: COPY.skills.nodeLabel(
          i.node.name,
          COPY.skills.state[state],
          COPY.skills.rank(i.rank, i.maxRank),
        ),
      });
    }
    const cos = Math.cos(rad(ray));
    branches.push({
      id: branch,
      name: COPY.skills.branchShort[branch],
      colour: BRANCH_COLOUR[branch],
      ...at(ray, LABEL_R),
      anchor: cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle',
      ranks: list.reduce((a, i) => a + i.rank, 0),
      maxRanks: list.reduce((a, i) => a + i.maxRank, 0),
    });
  }
  const pos = new Map(nodes.map((n) => [n.id, n]));
  const edges: EdgeView[] = [];
  for (const n of nodes) {
    const info = infos.find((i) => i.node.id === n.id)!;
    const parents = info.node.requires.map((r) => pos.get(r)).filter((p) => p !== undefined);
    // a root gem hangs off the centre star; the line starts at the star's rim
    const from = parents.length > 0 ? parents : [at(branchAngle(n.branch), 40)];
    for (const p of from) {
      edges.push({ x1: p.x, y1: p.y, x2: n.x, y2: n.y, colour: n.colour, lit: n.rank > 0 });
    }
  }
  return { nodes, edges, branches, points };
}

// ---- respec -------------------------------------------------------------------------------------

export interface RespecView {
  /** Points spent (refunded by a respec); 0 disables it. */
  refund: number;
  free: boolean;
  priceText: string;
  affordable: boolean;
  enabled: boolean;
  button: string;
  note: string;
  confirmTitle: string;
  confirmBody: string;
}

export function respecView(content: Content, state: GameState, info: RespecInfo): RespecView {
  const priceText = info.price
    ? `${fmt(info.price.amount)} ${content.resourceById.get(info.price.resource)?.name ?? info.price.resource}`
    : '';
  const have = info.price ? (state.resources[info.price.resource] ?? new Decimal(0)) : null;
  const affordable = !info.price || (have !== null && have.gte(info.price.amount));
  const enabled = info.refund > 0 && affordable;
  return {
    refund: info.refund,
    free: info.free,
    priceText,
    affordable,
    enabled,
    button: info.free ? COPY.skills.respecFree : COPY.skills.respecPaid(priceText),
    note:
      info.refund === 0
        ? COPY.skills.respecNothing
        : !affordable
          ? COPY.skills.respecPoor(priceText)
          : info.free
            ? COPY.skills.respecFreeNote
            : COPY.skills.respecPaidNote,
    confirmTitle: COPY.skills.respecConfirmTitle(info.refund),
    confirmBody: info.free
      ? COPY.skills.respecConfirmFree
      : COPY.skills.respecConfirmPaid(priceText),
  };
}

// ---- card enhancement star chart ----------------------------------------------------------------

/** The star chart's drawing box and star spots (a small constellation, left to right). */
export const CHART = { w: 200, h: 120 } as const;
const STAR_SPOTS = [
  [24, 78],
  [66, 31],
  [104, 84],
  [143, 36],
  [179, 87],
  [100, 20],
] as const;

export type StarState = 'chosen' | 'open' | 'blocked' | 'locked';

export interface StarView {
  id: string;
  name: string;
  effect: string;
  cost: number;
  costText: string;
  x: number;
  y: number;
  state: StarState;
  label: string;
}

export interface StarChartView {
  unlocked: boolean;
  lockedText: string;
  budget: number;
  spent: number;
  pointsText: string;
  /** Budget pips: chosen points lit, the rest open. */
  pips: boolean[];
  stars: StarView[];
  /** Lines between consecutive stars; lit when both ends are chosen. */
  links: { x1: number; y1: number; x2: number; y2: number; lit: boolean }[];
  canReset: boolean;
}

const TIER_NAME: Record<Rank['tier'], string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  prismatic: 'Prismatic',
};

export function starChartView(info: CardEnhancementInfo): StarChartView {
  const stars = info.options.map((o, i): StarView => {
    const spot = STAR_SPOTS[i % STAR_SPOTS.length]!;
    const state: StarState = !info.unlocked
      ? 'locked'
      : o.chosen
        ? 'chosen'
        : o.canChoose
          ? 'open'
          : 'blocked';
    const effect = o.option.modifiers.map(effectText).join(', ');
    const costText = COPY.enhance.cost(o.option.cost);
    const stateText = {
      chosen: COPY.enhance.chosen,
      blocked: COPY.enhance.overBudget,
      open: COPY.enhance.open,
      locked: COPY.enhance.lockedStar,
    }[state];
    return {
      id: o.option.id,
      name: o.option.name,
      effect,
      cost: o.option.cost,
      costText,
      x: spot[0],
      y: spot[1],
      state,
      label: COPY.enhance.starLabel(o.option.name, effect, costText, stateText),
    };
  });
  const links = stars.slice(1).map((s, i) => {
    const a = stars[i]!;
    return {
      x1: a.x,
      y1: a.y,
      x2: s.x,
      y2: s.y,
      lit: a.state === 'chosen' && s.state === 'chosen',
    };
  });
  const rank = `${TIER_NAME[info.unlockRank.tier]} ★${info.unlockRank.stars}`;
  return {
    unlocked: info.unlocked,
    lockedText: COPY.enhance.locked(rank),
    budget: info.budget,
    spent: info.spent,
    pointsText: COPY.enhance.points(info.spent, info.budget),
    pips: Array.from({ length: info.budget }, (_, i) => i < info.spent),
    stars,
    links,
    canReset: info.spent > 0,
  };
}
