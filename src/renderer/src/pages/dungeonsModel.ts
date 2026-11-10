/**
 * Display logic of the Dungeons page (UI rework 2.3): the drawer tabs, the status line on the
 * drawer handle, and the small counts under the arena bars. Pure: the page turns game state into
 * these inputs; no game rules here.
 */

export type DrawerTab = 'dungeons' | 'weapon' | 'upgrades';

export const DRAWER_TABS: readonly DrawerTab[] = ['dungeons', 'weapon', 'upgrades'];

/** A remembered tab from storage; anything unknown is the first tab. */
export function parseTab(value: string | null | undefined): DrawerTab {
  return DRAWER_TABS.find((t) => t === value) ?? 'dungeons';
}

/** The tab an arrow, Home or End key moves to (tabs wrap round, as in the ARIA tabs pattern). */
export function tabAfterKey(current: DrawerTab, key: string): DrawerTab | null {
  const i = DRAWER_TABS.indexOf(current);
  const n = DRAWER_TABS.length;
  switch (key) {
    case 'ArrowRight':
      return DRAWER_TABS[(i + 1) % n]!;
    case 'ArrowLeft':
      return DRAWER_TABS[(i + n - 1) % n]!;
    case 'Home':
      return DRAWER_TABS[0]!;
    case 'End':
      return DRAWER_TABS[n - 1]!;
    default:
      return null;
  }
}

export interface StatusInput {
  /** What is being fought: nothing, a dungeon boss, or a special dungeon. */
  fight: 'none' | 'dungeon' | 'trial';
  /** Seconds the loadout stays knocked out (0 when it is up). */
  knockoutSeconds: number;
  /** Kills until the rare drop is guaranteed (null when there is none to show). */
  rareKillsLeft: number | null;
}

export type DrawerStatus =
  | { kind: 'idle' }
  | { kind: 'trial' }
  | { kind: 'knockout'; seconds: number }
  | { kind: 'pity'; kills: number }
  | { kind: 'fighting' };

/** The short line at the right of the drawer handle: the one thing worth knowing right now. */
export function drawerStatus(input: StatusInput): DrawerStatus {
  if (input.fight === 'none') return { kind: 'idle' };
  if (input.knockoutSeconds > 0) {
    return { kind: 'knockout', seconds: Math.ceil(input.knockoutSeconds) };
  }
  if (input.fight === 'trial') return { kind: 'trial' };
  if (input.rareKillsLeft !== null)
    return { kind: 'pity', kills: Math.max(1, input.rareKillsLeft) };
  return { kind: 'fighting' };
}

/** Bars of a boss already gone: "2 of 5" is `{ gone: 2, total: 5 }`. */
export function barsGone(total: number, remaining: number): { gone: number; total: number } {
  const all = Math.max(1, Math.floor(total));
  return { gone: Math.min(all, Math.max(0, all - Math.max(0, Math.floor(remaining)))), total: all };
}

/** The signature gauge as "n / size": whole points filled, never past the size. */
export function signatureCount(gauge: number, size: number): { n: number; size: number } {
  const s = Math.max(1, Math.floor(size));
  return { n: Math.min(s, Math.max(0, Math.floor(gauge + 1e-9))), size: s };
}

/** A health fraction as a whole percent for the party bar ("86%"); a sliver shows as 1%. */
export function healthPercent(fraction: number): number {
  if (!(fraction > 0)) return 0;
  return Math.min(100, Math.max(1, Math.round(fraction * 100)));
}

/** What the interim floor readout needs (DESIGN.md §6 Dungeon floors). */
export interface FloorReadoutInput {
  floor: number;
  floors: number;
  floorKind: 'wave' | 'miniboss' | 'boss';
  wave: { index: number; size: number };
  bestFloor: number;
}

/** The parts of the floor line, in order: the floor, what stands on it, the best floor. */
export type FloorPart =
  | { kind: 'floor'; floor: number; floors: number }
  /** An endless depth: it has no last floor. */
  | { kind: 'depth'; depth: number }
  | { kind: 'enemy'; index: number; size: number }
  | { kind: 'miniboss' }
  | { kind: 'boss' }
  | { kind: 'best'; best: number };

/**
 * The floor line as parts: "Floor 3 / 10" (or "Depth 12" in the endless depths), then "Enemy 2 /
 * 4" on a wave or the mini-boss / boss mark, then "best 5" once a floor has been beaten.
 */
export function floorParts(input: FloorReadoutInput): FloorPart[] {
  const parts: FloorPart[] = [
    Number.isFinite(input.floors)
      ? { kind: 'floor', floor: input.floor, floors: input.floors }
      : { kind: 'depth', depth: input.floor },
  ];
  if (input.floorKind === 'wave') {
    parts.push({ kind: 'enemy', index: input.wave.index, size: input.wave.size });
  } else parts.push({ kind: input.floorKind });
  if (input.bestFloor > 0) parts.push({ kind: 'best', best: input.bestFloor });
  return parts;
}
