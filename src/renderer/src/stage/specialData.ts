/**
 * The special attack's data (stage/specialAttack.ts draws it): one motion per weapon type and one
 * effect per element. A new type or element is one more entry here and nothing else.
 */

/** A pose of the weapon: where its grip is and its rotation in degrees. Offsets are in the
 *  mock-up's units (a 1280 x 720 stage, the enemy card 204 x 277), scaled by the enemy card's size. */
export interface Pose {
  x: number;
  y: number;
  rot: number;
}

/**
 * How a weapon type moves. `melee` weapons fly to the enemy card (poses from its centre); `shot`
 * (a bow) and `cast` (a staff) stay over their own card (poses from where the weapon rests) and
 * send a streak or a beam from their tip to the enemy.
 */
export interface WeaponMotion {
  style: 'melee' | 'shot' | 'cast';
  /** The weapon sprite's size in art pixels, the point of it the hand holds, and its business end. */
  sprite: { w: number; h: number };
  grip: { x: number; y: number };
  tip: { x: number; y: number };
  /** The weapon leaves its card, then is pulled back for the wind-up (both from where it rests). */
  leave: Pose;
  wind: Pose;
  /** The two lunge frames: the first, then the strike (from the enemy card's centre; from the rest
   *  position for `shot` and `cast`). */
  lunge: [Pose, Pose];
  /** The slash this weapon cuts: its angle in degrees (else the element's), length and thickness
   *  against the element's, how much it bows, and whether a second one crosses it. */
  cut: { rot?: number; len: number; thick: number; bow?: number; cross?: boolean };
  /** How far the enemy card is thrown back (1 = a sword's). */
  knock: number;
  /** Seconds: leaves the card, wind-up starts, lunge starts, the hit lands, the slash releases, the
   *  weapon returns. The hit lands 0.08 s after the lunge (two frames). */
  times: { leave: number; wind: number; lunge: number; hit: number; release: number; back: number };
}

const T = (
  leave: number,
  wind: number,
  lunge: number,
  hold: number,
  back = 0.16,
): WeaponMotion['times'] => ({
  leave,
  wind,
  lunge,
  hit: lunge + 0.08,
  release: lunge + 0.08 + hold,
  back: lunge + 0.08 + hold + back,
});

export const WEAPON_MOTIONS: Record<string, WeaponMotion> = {
  // the approved mock-up's own motion
  sword: {
    style: 'melee',
    sprite: { w: 100, h: 120 },
    grip: { x: 30, y: 90 },
    tip: { x: 86, y: 14 },
    leave: { x: -14, y: -69, rot: -15 },
    wind: { x: -44, y: -35, rot: -50 },
    lunge: [
      { x: -220, y: 106, rot: 15 },
      { x: -120, y: -28, rot: 70 },
    ],
    cut: { len: 1, thick: 1 },
    knock: 1,
    times: T(0.76, 0.84, 1.08, 0.24),
  },
  // slower and heavier: raised high, a bigger cut
  greatsword: {
    style: 'melee',
    sprite: { w: 100, h: 120 },
    grip: { x: 28, y: 90 },
    tip: { x: 82, y: 10 },
    leave: { x: -14, y: -69, rot: -15 },
    wind: { x: -34, y: -60, rot: -68 },
    lunge: [
      { x: -210, y: 70, rot: 10 },
      { x: -110, y: -24, rot: 78 },
    ],
    cut: { rot: 24, len: 1.12, thick: 1.35 },
    knock: 1.4,
    times: T(0.76, 0.92, 1.2, 0.3, 0.2),
  },
  // fast and short: two crossing cuts
  dagger: {
    style: 'melee',
    sprite: { w: 100, h: 120 },
    grip: { x: 30, y: 78 },
    tip: { x: 82, y: 32 },
    leave: { x: -14, y: -60, rot: -15 },
    wind: { x: -30, y: -30, rot: -40 },
    lunge: [
      { x: -140, y: 70, rot: 25 },
      { x: -50, y: -8, rot: 95 },
    ],
    cut: { rot: 28, len: 0.72, thick: 0.62, cross: true },
    knock: 0.7,
    times: T(0.76, 0.8, 0.94, 0.16, 0.1),
  },
  // a thrust: a long thin line
  spear: {
    style: 'melee',
    sprite: { w: 100, h: 120 },
    grip: { x: 36, y: 80 },
    tip: { x: 88, y: 12 },
    leave: { x: -14, y: -69, rot: -15 },
    wind: { x: -70, y: 0, rot: -55 },
    lunge: [
      { x: -190, y: 120, rot: 20 },
      { x: -70, y: 10, rot: 38 },
    ],
    cut: { rot: -8, len: 1.18, thick: 0.46, bow: 0.3 },
    knock: 1,
    times: T(0.76, 0.86, 1.1, 0.22),
  },
  // a heavier thrust
  lance: {
    style: 'melee',
    sprite: { w: 100, h: 120 },
    grip: { x: 30, y: 88 },
    tip: { x: 86, y: 14 },
    leave: { x: -14, y: -69, rot: -15 },
    wind: { x: -70, y: -4, rot: -52 },
    lunge: [
      { x: -210, y: 130, rot: 15 },
      { x: -80, y: 12, rot: 36 },
    ],
    cut: { rot: -4, len: 1.28, thick: 0.72, bow: 0.25 },
    knock: 1.3,
    times: T(0.76, 0.9, 1.14, 0.26, 0.18),
  },
  // slow and heavy: an overhead smash and a hard slam
  hammer: {
    style: 'melee',
    sprite: { w: 100, h: 120 },
    grip: { x: 38, y: 88 },
    tip: { x: 66, y: 34 },
    leave: { x: -14, y: -69, rot: -15 },
    wind: { x: -24, y: -70, rot: -78 },
    lunge: [
      { x: -80, y: -140, rot: 40 },
      { x: -40, y: -24, rot: 125 },
    ],
    cut: { rot: 80, len: 0.8, thick: 1.6, bow: 0.2 },
    knock: 1.8,
    times: T(0.76, 0.96, 1.3, 0.34, 0.22),
  },
  // a chop
  logging_axe: {
    style: 'melee',
    sprite: { w: 100, h: 120 },
    grip: { x: 36, y: 86 },
    tip: { x: 72, y: 30 },
    leave: { x: -14, y: -69, rot: -15 },
    wind: { x: -40, y: -50, rot: -60 },
    lunge: [
      { x: -150, y: 40, rot: 30 },
      { x: -76, y: -22, rot: 100 },
    ],
    cut: { rot: 52, len: 0.86, thick: 1.25 },
    knock: 1.2,
    times: T(0.76, 0.88, 1.12, 0.26, 0.16),
  },
  // a pick: short and sharp
  pickaxe: {
    style: 'melee',
    sprite: { w: 100, h: 120 },
    grip: { x: 32, y: 90 },
    tip: { x: 90, y: 22 },
    leave: { x: -14, y: -69, rot: -15 },
    wind: { x: -40, y: -45, rot: -62 },
    lunge: [
      { x: -150, y: 50, rot: 25 },
      { x: -70, y: -18, rot: 105 },
    ],
    cut: { rot: 38, len: 0.74, thick: 0.85, bow: 0.5 },
    knock: 1,
    times: T(0.76, 0.86, 1.08, 0.22, 0.14),
  },
  // a wide sweeping curve
  scythe: {
    style: 'melee',
    sprite: { w: 100, h: 120 },
    grip: { x: 26, y: 92 },
    tip: { x: 22, y: 22 },
    leave: { x: -14, y: -69, rot: -15 },
    wind: { x: -50, y: -30, rot: -75 },
    lunge: [
      { x: -270, y: 60, rot: -5 },
      { x: -110, y: -18, rot: 80 },
    ],
    cut: { rot: -12, len: 1.32, thick: 0.9, bow: 1.5 },
    knock: 1,
    times: T(0.76, 0.9, 1.14, 0.26, 0.16),
  },
  // drawn and loosed: the bow stays over its card, a streak flies from it
  bow: {
    style: 'shot',
    sprite: { w: 100, h: 120 },
    grip: { x: 64, y: 82 },
    tip: { x: 62, y: 44 },
    leave: { x: -14, y: -69, rot: -15 },
    wind: { x: -30, y: -52, rot: -34 },
    lunge: [
      { x: 6, y: -118, rot: -46 },
      { x: 10, y: -128, rot: -48 },
    ],
    cut: { rot: -20, len: 1, thick: 0.62, bow: 0.4 },
    knock: 0.8,
    times: T(0.76, 0.86, 1.08, 0.22, 0.14),
  },
  // raised and pointed: a charged orb, then a beam
  staff: {
    style: 'cast',
    sprite: { w: 100, h: 120 },
    grip: { x: 32, y: 88 },
    tip: { x: 84, y: 14 },
    leave: { x: -14, y: -69, rot: -15 },
    wind: { x: -20, y: -90, rot: -30 },
    lunge: [
      { x: 0, y: -126, rot: -12 },
      { x: 10, y: -132, rot: 4 },
    ],
    cut: { rot: 0, len: 0.9, thick: 1.1, bow: 0.8 },
    knock: 0.9,
    times: T(0.76, 0.9, 1.16, 0.26, 0.16),
  },
};

/** What rises from the cut when it releases, and what the enemy card keeps shedding after. */
export type RiseKind = 'flame' | 'bolt' | 'beam' | 'vine' | 'spike' | 'crystal' | 'wisp';

/** Colours and shape of an element's slash. `c` runs bright to dark (6 steps); `ink` is the near-black
 *  outline and the shade behind the weapon. */
export interface ElementEffect {
  c: [string, string, string, string, string, string];
  ink: string;
  rise: RiseKind;
  /** The slash: its angle, half-length, thickness, bow and how ragged its upper edge is. */
  slash: { rotDeg: number; halfWidth: number; thick: number; bow: number; rag: number };
  /** The burst's grain size (x) and how hard it falls (negative floats up). */
  burst: { size: number; grav: number };
}

export const ELEMENT_EFFECTS: Record<string, ElementEffect> = {
  fire: {
    c: ['#fff7d6', '#ffe27a', '#ffb02e', '#f2641a', '#b8280f', '#5a1208'],
    ink: '#1a0806',
    rise: 'flame',
    slash: { rotDeg: 15, halfWidth: 340, thick: 44, bow: 56, rag: 1 },
    burst: { size: 1, grav: 1 },
  },
  // yellow bolts on a blue glow: thin, jagged, forked
  storm: {
    c: ['#ffffff', '#fff3a0', '#ffe040', '#6aa8ff', '#3a4ad8', '#1a1460'],
    ink: '#080a30',
    rise: 'bolt',
    slash: { rotDeg: 20, halfWidth: 350, thick: 26, bow: 30, rag: 2.6 },
    burst: { size: 0.7, grav: 0.4 },
  },
  // clean white and gold: a thin bright blade of light with a wide glow
  light: {
    c: ['#ffffff', '#fff6c8', '#ffe27a', '#ffc94a', '#c98a1c', '#6a4208'],
    ink: '#2a1a04',
    rise: 'beam',
    slash: { rotDeg: 10, halfWidth: 350, thick: 30, bow: 36, rag: 0.25 },
    burst: { size: 0.8, grav: -0.5 },
  },
  // a deep curved cut that bursts into vines and leaves
  nature: {
    c: ['#eaffc8', '#b6f27a', '#5fd35a', '#2a9a3a', '#1a5a2a', '#0a2a14'],
    ink: '#06180a',
    rise: 'vine',
    slash: { rotDeg: 12, halfWidth: 330, thick: 38, bow: 92, rag: 0.7 },
    burst: { size: 1.1, grav: 0.7 },
  },
  // heavy and flat: thick, with rock spikes thrown up
  earth: {
    c: ['#ffe7b0', '#e8b866', '#c4803a', '#8a5224', '#5a3216', '#2a160a'],
    ink: '#1a0c05',
    rise: 'spike',
    slash: { rotDeg: 6, halfWidth: 330, thick: 58, bow: 18, rag: 0.5 },
    burst: { size: 1.6, grav: 2.2 },
  },
  // crisp and angular: a clean cut with crystal prisms growing from it
  crystal: {
    c: ['#f2ffff', '#b8fff4', '#5fe8d8', '#3ab8c8', '#2a7aa8', '#143a60'],
    ink: '#08203a',
    rise: 'crystal',
    slash: { rotDeg: 18, halfWidth: 345, thick: 34, bow: 24, rag: 0.15 },
    burst: { size: 1.1, grav: 0.8 },
  },
  // a dark swirling cut with purple wisps
  void: {
    c: ['#f0d8ff', '#c48cff', '#9a4ce8', '#5f2aa8', '#33145f', '#14062a'],
    ink: '#0a0314',
    rise: 'wisp',
    slash: { rotDeg: 14, halfWidth: 340, thick: 48, bow: 78, rag: 1.4 },
    burst: { size: 1.2, grav: -0.2 },
  },
};

/** True when a weapon type and an element both have their entry. */
export function hasSpecial(kind: string | undefined, element: string | undefined): boolean {
  return Boolean(kind && element && WEAPON_MOTIONS[kind] && ELEMENT_EFFECTS[element]);
}
