import { describe, expect, it } from 'vitest';
import { Decimal, buyHeirloomNode, type GameState } from '../src/game';
import {
  CLUSTER_COLUMNS,
  CLUSTER_STEP,
  PERK_SPOTS,
  heirloomMapView,
} from '../src/renderer/src/pages/heirloomMapModel';
import { content, freshState } from './helpers';

const own = (s: GameState, id: string, stars: number, level: number): void => {
  s.cards.owned[id] = {
    tier: 'heirloom',
    stars,
    level,
    xp: new Decimal(0),
    starFill: 0,
    enhancements: [],
    skillOpen: false,
  };
};

describe('the Heirlooms map (UI_RULES, The Skill Tree, pick 4c)', () => {
  const trees = content.heirlooms.trees;

  it('has one cluster for every Heirloom tree, on a grid, none found at the start', () => {
    const v = heirloomMapView(content, freshState());
    expect(v.clusters).toHaveLength(trees.length);
    expect(v.total).toBe(trees.length);
    expect(v.found).toBe(0);
    expect(v.affordable).toBe(0);
    v.clusters.forEach((c, i) => {
      expect(c.x).toBe((i % CLUSTER_COLUMNS) * CLUSTER_STEP.x);
      expect(c.y).toBe(Math.floor(i / CLUSTER_COLUMNS) * CLUSTER_STEP.y);
      expect(c.found).toBe(false);
      expect(c.perks).toHaveLength(6);
      // an Heirloom you have not found has nothing to buy
      expect(c.perks.every((p) => !p.affordable)).toBe(true);
    });
  });

  it('gives every perk a place, a name and an icon, the capstone its own name', () => {
    const v = heirloomMapView(content, freshState());
    for (const c of v.clusters) {
      for (const p of c.perks) {
        expect(PERK_SPOTS[p.id]).toBeDefined();
        expect(p.dx).toBe(PERK_SPOTS[p.id]!.dx);
        expect(p.name.length).toBeGreaterThan(0);
        expect(p.glyph.length).toBeGreaterThan(0);
      }
      const cap = c.perks.find((p) => p.capstone)!;
      expect(cap.glyph).toBe('key');
      expect(cap.name).toBe(
        trees.find((t) => t.card === c.cardId)!.nodes.find((n) => n.id === 'capstone')!.name,
      );
      // the capstone is the furthest perk from the card
      expect(Math.max(...c.perks.map((p) => p.dx))).toBe(cap.dx);
    }
  });

  it('finds an Heirloom when its card is owned, and counts its free points and affordable perks', () => {
    const s = freshState();
    const first = trees[0]!.card;
    own(s, first, 3, 40);
    const v = heirloomMapView(content, s);
    const c = v.clusters[0]!;
    expect(c.found).toBe(true);
    expect(v.found).toBe(1);
    expect(c.earned).toBeGreaterThan(0);
    expect(c.free).toBe(c.earned);
    // only the root (no requirement) is open, and it is affordable when a point is free
    const open = c.perks.filter((p) => p.state === 'open');
    expect(open.map((p) => p.id)).toEqual(['root']);
    expect(open[0]!.affordable).toBe(c.free >= open[0]!.cost);
    expect(v.affordable).toBe(c.perks.filter((p) => p.affordable).length);
    expect(v.start).toEqual({ x: c.x, y: c.y });
  });

  it('follows a purchase: the perk is bought, the next one opens, the points go down', () => {
    const s = freshState();
    const first = trees[0]!.card;
    own(s, first, 6, 140);
    const r = buyHeirloomNode(s, content, first, 'root');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = heirloomMapView(content, r.state).clusters[0]!;
    expect(c.perks.find((p) => p.id === 'root')!.state).toBe('bought');
    expect(c.perks.find((p) => p.id === 'small_a')!.state).toBe('open');
    expect(c.spent).toBe(c.perks.find((p) => p.id === 'root')!.cost);
    expect(c.free).toBe(c.earned - c.spent);
  });

  it('starts the camera on the first Heirloom with something to buy', () => {
    const s = freshState();
    const a = trees[0]!.card;
    const b = trees[1]!.card;
    own(s, a, 6, 140);
    own(s, b, 1, 1);
    // the first one has every perk bought: nothing left to buy there
    s.heirlooms.trees[a] = trees[0]!.nodes.map((n) => n.id);
    const v = heirloomMapView(content, s);
    expect(v.clusters[1]!.perks.some((p) => p.affordable)).toBe(true);
    expect(v.start).toEqual({ x: v.clusters[1]!.x, y: v.clusters[1]!.y });
  });
});
