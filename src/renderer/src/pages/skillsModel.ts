import { fmt } from '../settings/numberFormat';
import {
  SKILL_BRANCHES,
  type CircleStep,
  type Content,
  type Rank,
  type SkillArea,
  type SkillBranch,
  type SkillKind,
} from '../../../data';
import {
  Decimal,
  type CardEnhancementInfo,
  type GameState,
  type RespecInfo,
  type SkillNodeInfo,
  type SkillPoints,
  type WeaponCircle,
  TIER_LABELS,
} from '../../../game';
import { COPY } from '../copy';
import { effectText } from '../shell/modifierText';
import { statGlyph, type WebGlyph } from '../ui/webGlyphs';

/**
 * The Skill Tree page (DESIGN.md §10, §11 "radial constellation", A8 A) and the card enhancement
 * star chart, as plain display data: positions on the constellation, node states, effect lines,
 * the respec offer. No DOM, no rules: every number comes from the game's account API.
 */

// ---- constellation geometry ---------------------------------------------------------------------

/** The web's drawing box (SVG viewBox units); the centre star sits at CENTRE. */
export const SKY = { x: -2300, y: -2300, w: 4600, h: 4600 } as const;
export const CENTRE = { x: 0, y: 0 } as const;
/**
 * The web (pick 4a): four arms leave the centre star, Logging to the left, Mining to the right,
 * Dungeon up and Cards down. Every line is one STEP between two plates: the first skill of an arm
 * is one step from the star, and a side branch forks off the first skill of its area's trunk, one
 * step from it, growing away at an angle where there is room.
 */
export const AREA_DEGREES: Record<SkillArea, number> = {
  logging: 180,
  mining: 0,
  dungeon: -90,
  cards: 90,
};
export const STEP = 140;
/** Closest two plates may sit (a plate and its name need about this). */
export const MIN_GAP = 125;
/** The weapon circles sit past the web: their centre radius, outline radius and gem radius. */
const CIRCLE_CENTRE_R = 1850;
export const CIRCLE_R = 92;
const CIRCLE_GEM_R = 58;

/** Area colours: lines, plates and names of an area's branches share one colour (pick 4a). */
export const AREA_COLOUR: Record<SkillArea, string> = {
  logging: '#74d06a',
  mining: '#f08a3c',
  dungeon: '#e8645e',
  cards: '#8f9bff',
};

/**
 * `closed`: its ring has not opened yet, or its weapon circle has not reached its step. `unknown`:
 * a "?" next to a skill you know (UI_RULES §2 The Skill Tree, pick 4a): its name and effect stay
 * hidden until the skill before it is open or learned.
 */
export type NodeState = 'locked' | 'open' | 'owned' | 'maxed' | 'closed' | 'unknown';

export interface NodeView {
  id: string;
  name: string;
  branch: SkillBranch;
  colour: string;
  /** Position in SKY units. */
  x: number;
  y: number;
  ring: number;
  kind: SkillKind;
  /** The weapon type of a circle skill. */
  circle: string | null;
  /** A keystone is drawn as a larger gem. */
  keystone: boolean;
  rank: number;
  maxRank: number;
  state: NodeState;
  /** The icon on the node's plate, from the first effect it gives. */
  glyph: WebGlyph;
  canBuy: boolean;
  cost: number;
  /** The bonus at the current rank ("+10% logging production"), empty at rank 0. */
  now: string[];
  /** The bonus at the next rank, empty at max rank. */
  next: string[];
  /** "Needs Grove Yield first" or "Opens with Ascension 2", or "" once met. */
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
  /** learned: the far gem has a rank; open: it can be learned next; locked: not reachable yet. */
  state: 'learned' | 'open' | 'locked';
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
  /** Gems of the branch with at least one rank, and all its gems. */
  learned: number;
  total: number;
}

export interface CircleView {
  kind: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  /** Shown in full; a hidden circle is a dim outline with no gems. */
  revealed: boolean;
  /** "Gold", "Prismatic"...: the furthest step reached, or "" while hidden. */
  stepText: string;
  /** Gems of the circle with at least one rank, and all its gems. */
  learned: number;
  total: number;
  label: string;
}

export interface TreeView {
  nodes: NodeView[];
  edges: EdgeView[];
  branches: BranchView[];
  circles: CircleView[];
  points: SkillPoints;
  /** Gems with at least one rank, and all gems of the tree that are in view. */
  learned: number;
  total: number;
  /** Skills you can learn a rank of right now (the header's count). */
  affordable: number;
}

const rad = (deg: number): number => (deg * Math.PI) / 180;
const round = (n: number): number => Math.round(n * 10) / 10;
const at = (deg: number, r: number, from: { x: number; y: number } = CENTRE) => ({
  x: round(from.x + r * Math.cos(rad(deg))),
  y: round(from.y + r * Math.sin(rad(deg))),
});

/** Angle of a weapon circle around the web: between two others, clockwise from the top. */
const circleAngle = (index: number, count: number): number => -90 + ((index + 0.5) * 360) / count;

type Pt = { x: number; y: number };

/**
 * The shape of a branch's fork tree: each skill's depth in it and where it sits across the arm,
 * ordered by where the skill it hangs off sits, so the links do not cross.
 */
function branchShape(infos: SkillNodeInfo[]): Map<string, { depth: number; lat: number }> {
  const byId = new Map(infos.map((i) => [i.node.id, i]));
  const depths = new Map<string, number>();
  const depthOf = (i: SkillNodeInfo): number => {
    const known = depths.get(i.node.id);
    if (known !== undefined) return known;
    // a requirement outside the branch (a side branch's trunk) is not part of the shape
    const parents = i.node.requires.map((r) => byId.get(r)).filter((p) => p !== undefined);
    const d = parents.length ? 1 + Math.max(...parents.map(depthOf)) : 0;
    depths.set(i.node.id, d);
    return d;
  };
  infos.forEach(depthOf);
  const lateral = new Map<string, number>();
  const out = new Map<string, { depth: number; lat: number }>();
  for (const d of [...new Set(depths.values())].sort((a, b) => a - b)) {
    const own = infos.filter((i) => depths.get(i.node.id) === d);
    const key = (i: SkillNodeInfo): number => {
      const p = i.node.requires.map((r) => lateral.get(r)).filter((v) => v !== undefined);
      return p.length ? p.reduce((a, v) => a + v, 0) / p.length : 0;
    };
    const ordered = own
      .map((i, index) => ({ i, index, k: key(i) }))
      .sort((a, b) => a.k - b.k || a.index - b.index);
    ordered.forEach(({ i }, n) => {
      const lat = (n - (ordered.length - 1) / 2) * STEP;
      lateral.set(i.node.id, lat);
      out.set(i.node.id, { depth: d, lat });
    });
  }
  return out;
}

/** The shape set down from `origin` (the first skill's spot), growing along `deg`. */
function setDown(
  shape: Map<string, { depth: number; lat: number }>,
  origin: Pt,
  deg: number,
): Map<string, Pt> {
  const out = new Map<string, Pt>();
  for (const [id, { depth, lat }] of shape) {
    out.set(id, at(deg + 90, lat, at(deg, depth * STEP, origin)));
  }
  return out;
}

/** The angles to try for a side branch, nearest the sides of its trunk first. */
const SIDE_TRIES = [
  60, -60, 90, -90, 30, -30, 120, -120, 45, -45, 75, -75, 105, -105, 135, -135, 15, -15, 150, -150,
  0, 180,
];

/**
 * Lays the four trunks along their arms, then each side branch off the first skill of its trunk:
 * one step from it, at the first angle where nothing is nearer than MIN_GAP.
 */
function layoutWeb(content: Content, infos: readonly SkillNodeInfo[]): Map<string, Pt> {
  const spots = new Map<string, Pt>();
  const placed: Pt[] = [CENTRE];
  const listOf = (branch: SkillBranch) =>
    infos.filter((i) => i.node.branch === branch && !i.node.circle);
  const branchRows = content.account.branches;
  const free = (pts: Map<string, Pt>): boolean =>
    [...pts.values()].every((p) =>
      placed.every((q) => Math.hypot(p.x - q.x, p.y - q.y) >= MIN_GAP),
    );
  const put = (pts: Map<string, Pt>): void => {
    for (const [id, p] of pts) {
      spots.set(id, p);
      placed.push(p);
    }
  };
  // trunks
  for (const area of Object.keys(AREA_DEGREES) as SkillArea[]) {
    const trunk = branchRows.find((b) => b.area === area && !b.forksFrom)!.branch;
    const deg = AREA_DEGREES[area];
    put(setDown(branchShape(listOf(trunk)), at(deg, STEP), deg));
  }
  // side branches
  for (const row of branchRows) {
    if (!row.forksFrom) continue;
    const trunkRoot = spots.get(`${row.forksFrom}_s1`)!;
    const axis = AREA_DEGREES[row.area];
    const shape = branchShape(listOf(row.branch));
    let best: Map<string, Pt> | null = null;
    for (const turn of SIDE_TRIES) {
      const deg = axis + turn;
      const pts = setDown(shape, at(deg, STEP, trunkRoot), deg);
      if (free(pts)) {
        best = pts;
        break;
      }
    }
    // no angle is clear: take the one with the most room (cannot happen with the shipped tree)
    put(best ?? setDown(shape, at(axis + 60, STEP, trunkRoot), axis + 60));
  }
  return spots;
}

function nodeState(i: SkillNodeInfo): NodeState {
  if (i.rank >= i.maxRank) return 'maxed';
  if (i.rank > 0) return 'owned';
  if (!i.open) return 'closed';
  return i.requiresMet ? 'open' : 'locked';
}

/** Where a circle skill sits: its gems on a small circle around the circle's centre, in order. */
function circleSpots(
  centre: { x: number; y: number },
  infos: SkillNodeInfo[],
): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  infos.forEach((i, n) => {
    out.set(i.node.id, at(-90 + (n * 360) / infos.length, CIRCLE_GEM_R, centre));
  });
  return out;
}

/** The whole constellation from `skillTree(state, content)`, the points and the weapon circles. */
export function treeView(
  content: Content,
  infos: readonly SkillNodeInfo[],
  points: SkillPoints,
  circles: readonly WeaponCircle[] = [],
): TreeView {
  const nameOf = (id: string) => content.account.tree.find((n) => n.id === id)?.name ?? id;
  const stepName = (step: string): string => COPY.skills.step[step as CircleStep] ?? step;
  const nodes: NodeView[] = [];
  const branches: BranchView[] = [];
  const spots = new Map<string, { x: number; y: number }>();

  // the web: four trunks from the star, the other branches forking off them
  const laid = layoutWeb(content, infos);
  const areaOf = (branch: SkillBranch): SkillArea =>
    content.account.branches.find((x) => x.branch === branch)!.area;
  for (const branch of SKILL_BRANCHES) {
    const list = infos.filter((i) => i.node.branch === branch && !i.node.circle);
    for (const i of list) spots.set(i.node.id, laid.get(i.node.id)!);
    const first = laid.get(`${branch}_s1`)!;
    branches.push({
      id: branch,
      name: COPY.skills.branchShort[branch],
      colour: AREA_COLOUR[areaOf(branch)],
      x: first.x,
      y: first.y,
      anchor: 'middle',
      ranks: list.reduce((a, i) => a + i.rank, 0),
      maxRanks: list.reduce((a, i) => a + i.maxRank, 0),
      learned: list.filter((i) => i.rank > 0).length,
      total: list.length,
    });
  }

  // the weapon circles: one per item type, a dim outline until it is revealed
  const circleViews: CircleView[] = circles.map((c, index) => {
    const centre = at(circleAngle(index, circles.length), CIRCLE_CENTRE_R);
    const list = infos.filter((i) => i.node.circle === c.kind);
    for (const [id, p] of circleSpots(centre, list)) spots.set(id, p);
    const learned = list.filter((i) => i.rank > 0).length;
    const stepText = c.step ? stepName(c.step) : '';
    return {
      kind: c.kind,
      name: c.noun,
      ...centre,
      radius: CIRCLE_R,
      revealed: c.revealed,
      stepText,
      learned,
      total: list.length,
      label: c.revealed
        ? COPY.skills.circleOpen(c.noun, stepText, learned, list.length)
        : COPY.skills.circleHidden,
    };
  });

  // known: learned or open to learn; a "?" is a skill one step past one you own or can learn now
  // (a root has none before it)
  const reveal = new Set(infos.filter((i) => i.rank > 0 || i.canBuy).map((i) => i.node.id));
  const known = new Set(
    infos.filter((i) => i.rank > 0 || nodeState(i) === 'open').map((i) => i.node.id),
  );
  for (const i of infos) {
    const spot = spots.get(i.node.id);
    if (!spot) continue;
    // a hidden circle shows only its outline: its gems stay out of the view
    if (i.node.circle && !circles.find((c) => c.kind === i.node.circle)?.revealed) continue;
    const isKnown = known.has(i.node.id);
    const neighbour = i.node.requires.length === 0 || i.node.requires.some((r) => reveal.has(r));
    if (!isKnown && !neighbour) continue;
    const state: NodeState = isKnown ? nodeState(i) : 'unknown';
    const missing = i.node.requires.filter(
      (r) => (infos.find((x) => x.node.id === r)?.rank ?? 0) === 0,
    );
    const needs = !i.open
      ? i.node.circle
        ? COPY.skills.needsStep(stepName(i.node.step ?? ''))
        : COPY.skills.needsRing(i.node.ring)
      : i.requiresMet
        ? ''
        : COPY.skills.needs(missing.map(nameOf).join(' and '));
    nodes.push({
      id: i.node.id,
      name: state === 'unknown' ? COPY.skills.unknownName : i.node.name,
      branch: i.node.branch,
      colour: AREA_COLOUR[areaOf(i.node.branch)],
      x: spot.x,
      y: spot.y,
      ring: i.node.ring,
      kind: i.node.kind,
      circle: i.node.circle ?? null,
      keystone: i.node.kind === 'keystone',
      rank: i.rank,
      maxRank: i.maxRank,
      state,
      glyph: state === 'unknown' ? 'lock' : statGlyph((i.next[0] ?? i.current[0])?.stat),
      canBuy: i.canBuy,
      cost: i.node.cost,
      now: state === 'unknown' ? [] : i.current.map(effectText),
      next: state === 'unknown' ? [] : i.next.map(effectText),
      needs: state === 'unknown' ? COPY.skills.unknownNote : needs,
      rankText: COPY.skills.rankShort(i.rank, i.maxRank),
      label: COPY.skills.nodeLabel(
        state === 'unknown' ? COPY.skills.unknownName : i.node.name,
        COPY.skills.state[state],
        COPY.skills.rank(i.rank, i.maxRank),
      ),
    });
  }

  const pos = new Map(nodes.map((n) => [n.id, n]));
  const edges: EdgeView[] = [];
  for (const n of nodes) {
    const info = infos.find((i) => i.node.id === n.id)!;
    const parents = info.node.requires.map((r) => pos.get(r)).filter((p) => p !== undefined);
    // a branch root hangs off the centre star; a circle root hangs off its circle's rim
    const circle = circleViews.find((c) => c.kind === n.circle);
    const from = parents.length > 0 ? parents : circle ? [{ x: circle.x, y: circle.y }] : [CENTRE];
    for (const p of from) {
      const parentLearned = !('rank' in p) || (p as NodeView).rank > 0;
      edges.push({
        x1: p.x,
        y1: p.y,
        x2: n.x,
        y2: n.y,
        colour: n.colour,
        lit: n.rank > 0,
        state: n.rank > 0 ? 'learned' : parentLearned && n.state !== 'unknown' ? 'open' : 'locked',
      });
    }
  }

  return {
    nodes,
    edges,
    branches,
    circles: circleViews,
    points,
    learned: nodes.filter((n) => n.rank > 0).length,
    total: infos.filter(
      (i) => !i.node.circle || circles.find((c) => c.kind === i.node.circle)?.revealed,
    ).length,
    affordable: nodes.filter((n) => n.canBuy).length,
  };
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

/** `level`: a milestone option the card has not reached the level of yet. */
export type StarState = 'chosen' | 'open' | 'blocked' | 'locked' | 'level';

export interface StarView {
  id: string;
  name: string;
  effect: string;
  cost: number;
  costText: string;
  x: number;
  y: number;
  /** Drawn on the chart: the options open from the start. Milestone options show in the list only
   *  (the chart's night sky is one fixed picture with room for five stars). */
  onChart: boolean;
  /** The card level that opens it (0 = from the start) and, when it is not reached, the words. */
  unlockLevel: number;
  levelText: string;
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
  /** Lines between consecutive stars on the chart; lit when both ends are chosen. */
  links: { x1: number; y1: number; x2: number; y2: number; lit: boolean }[];
  canReset: boolean;
}

const TIER_NAME: Record<Rank['tier'], string> = TIER_LABELS;

export function starChartView(info: CardEnhancementInfo): StarChartView {
  let onChart = 0;
  const stars = info.options.map((o): StarView => {
    const spot = STAR_SPOTS[o.unlockLevel === 0 ? onChart++ % STAR_SPOTS.length : 0]!;
    const state: StarState = !info.unlocked
      ? 'locked'
      : o.chosen
        ? 'chosen'
        : !o.open
          ? 'level'
          : o.canChoose
            ? 'open'
            : 'blocked';
    const levelText = o.unlockLevel > 0 && !o.open ? COPY.enhance.opensAtLevel(o.unlockLevel) : '';
    const effect = o.option.modifiers.map(effectText).join(', ');
    const costText = COPY.enhance.cost(o.option.cost);
    const stateText = {
      chosen: COPY.enhance.chosen,
      blocked: COPY.enhance.overBudget,
      open: COPY.enhance.open,
      locked: COPY.enhance.lockedStar,
      level: levelText,
    }[state];
    return {
      id: o.option.id,
      name: o.option.name,
      effect,
      cost: o.option.cost,
      costText,
      x: spot[0],
      y: spot[1],
      onChart: o.unlockLevel === 0,
      unlockLevel: o.unlockLevel,
      levelText,
      state,
      label: COPY.enhance.starLabel(o.option.name, effect, costText, stateText),
    };
  });
  const sky = stars.filter((s) => s.onChart);
  const links = sky.slice(1).map((s, i) => {
    const a = sky[i]!;
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
