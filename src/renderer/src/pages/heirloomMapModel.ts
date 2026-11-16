import type { Content } from '../../../data';
import { heirloomTreeInfo, type GameState } from '../../../game';
import { COPY } from '../copy';
import { statGlyph, type WebGlyph } from '../ui/webGlyphs';

/**
 * The Heirlooms tab of the Skill Tree view (UI_RULES.md §2 The Skill Tree, pick 4c): every
 * Heirloom's tree on one scrollable map, each Heirloom's real card as the hub with its six perks
 * fanning out to the right, the capstone furthest. Plain display data: positions, states, texts.
 * The rules (points, what a node needs, buying) are `heirloomTreeInfo` and `buyHeirloomNode`.
 */

/** Where a perk sits from the centre of its card, in map units; `top` puts its label above it. */
export const PERK_SPOTS: Record<string, { dx: number; dy: number; top: boolean }> = {
  root: { dx: 150, dy: 0, top: false },
  small_a: { dx: 262, dy: -66, top: true },
  small_b: { dx: 262, dy: 66, top: false },
  large_a: { dx: 374, dy: -66, top: true },
  large_b: { dx: 374, dy: 66, top: false },
  capstone: { dx: 490, dy: 0, top: true },
};
/** The card's own size on the map (card units). */
export const CARD_BOX = { w: 176, h: 248 } as const;
/** Distance between two clusters, and how many sit in a row. */
export const CLUSTER_STEP = { x: 780, y: 440 } as const;
export const CLUSTER_COLUMNS = 4;

export type PerkState = 'bought' | 'open' | 'locked';

export interface PerkView {
  id: string;
  name: string;
  /** "+8% damage". */
  description: string;
  cost: number;
  state: PerkState;
  affordable: boolean;
  /** Offset from the card's centre. */
  dx: number;
  dy: number;
  labelTop: boolean;
  capstone: boolean;
  glyph: WebGlyph;
  requires: string[];
  label: string;
}

export interface ClusterView {
  cardId: string;
  /** The Heirloom's name ("Sunforged"). */
  title: string;
  /** The card's own name ("Solaris"). */
  cardName: string;
  found: boolean;
  /** Centre of the card on the map. */
  x: number;
  y: number;
  earned: number;
  spent: number;
  free: number;
  pointsText: string;
  perks: PerkView[];
}

export interface HeirloomMapView {
  clusters: ClusterView[];
  /** Perks you can buy now, over every found Heirloom. */
  affordable: number;
  found: number;
  total: number;
  /** Where the camera starts: the first Heirloom with a perk to buy, else the first found, else the first. */
  start: { x: number; y: number };
}

/** What a perk is called: its own name (the capstone), else the stat it raises, else its place in the tree. */
export function perkName(id: string, name: string | undefined, stat?: string): string {
  return (
    name ?? (stat ? COPY.heirloomMap.statNames[stat] : undefined) ?? COPY.cards.gemName[id] ?? id
  );
}

export function heirloomMapView(content: Content, state: GameState): HeirloomMapView {
  const clusters = content.heirlooms.trees.map((tree, index): ClusterView => {
    const info = heirloomTreeInfo(state, content, tree.card)!;
    const found = state.cards.owned[tree.card] !== undefined;
    const x = (index % CLUSTER_COLUMNS) * CLUSTER_STEP.x;
    const y = Math.floor(index / CLUSTER_COLUMNS) * CLUSTER_STEP.y;
    const perks = info.nodes.map((n): PerkView => {
      const spot = PERK_SPOTS[n.node.id] ?? PERK_SPOTS['root']!;
      const name = perkName(n.node.id, n.node.name, n.node.modifiers?.[0]?.stat);
      const stateWord = COPY.cards.gemState[n.state] ?? n.state;
      return {
        id: n.node.id,
        name,
        description: n.node.description,
        cost: n.node.cost,
        state: n.state,
        affordable: n.affordable,
        dx: spot.dx,
        dy: spot.dy,
        labelTop: spot.top,
        capstone: n.node.id === 'capstone',
        glyph: n.node.id === 'capstone' ? 'key' : statGlyph(n.node.modifiers?.[0]?.stat),
        requires: n.node.requires,
        label: COPY.cards.gemLabel(name, n.node.description, n.node.cost, stateWord),
      };
    });
    return {
      cardId: tree.card,
      title: tree.name,
      cardName: content.cardById.get(tree.card)?.name ?? tree.card,
      found,
      x,
      y,
      earned: info.earned,
      spent: info.spent,
      free: info.free,
      pointsText: COPY.cards.treePoints(info.free, info.earned),
      perks,
    };
  });
  const firstBuy = clusters.find((c) => c.found && c.perks.some((p) => p.affordable));
  const first = firstBuy ?? clusters.find((c) => c.found) ?? clusters[0];
  return {
    clusters,
    affordable: clusters.reduce(
      (a, c) => a + (c.found ? c.perks.filter((p) => p.affordable).length : 0),
      0,
    ),
    found: clusters.filter((c) => c.found).length,
    total: clusters.length,
    start: first ? { x: first.x, y: first.y } : { x: 0, y: 0 },
  };
}
