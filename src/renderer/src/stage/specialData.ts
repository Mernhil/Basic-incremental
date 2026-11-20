/**
 * The special attack's data (stage/specialAttack.ts draws it): one motion per weapon type and one
 * effect per element. A new type or element is one more entry here and nothing else.
 *
 * Every motion is built on one model. A weapon makes one or more strokes; a stroke is a cut across
 * the enemy card, a bowed arc. The player stands below the fight, so the arc bows away from the
 * hand that swings it, and a swung weapon points outward from that hand: its business end rides the
 * cut, at a right angle to it, leaning a little into its travel. The weapon swipes along the cut
 * after the hit lands. A thrust is the same with the weapon lying along the cut, point first. A bow
 * and a staff stay over their own card and send the stroke to the enemy.
 */

/** One cut and the weapon's travel along it. Positions along a cut run from -1 (where the travel
 *  starts) to 1 (where it ends); 0 is its middle. */
export interface Stroke {
  /** The cut's angle in degrees: 0 runs left to right, positive descends to the right, 90 runs top
   *  to bottom. `aim` lies along the shot, from the weapon to the enemy. */
  rot: number | 'aim';
  /** Length, thickness and bow against the element's own slash. An `aim` cut's length is instead
   *  against the distance from the weapon's end to the enemy (1 = it starts at the weapon). */
  len: number;
  thick: number;
  bow: number;
  /** Which way the weapon travels the cut: 1 follows `rot`, -1 runs it backwards (right to left). */
  dir: 1 | -1;
  /** Where the hit lands and where the swipe after it ends. */
  from: number;
  to: number;
  /** How much further the weapon carries while the slash burns away. */
  follow: number;
  /** The point of the cut that sits on the enemy card's centre; without it the cut's chord does. */
  hitAt?: number;
  /** The cut ends where it hits (`hitAt`, or its middle): a shot or a bolt that stops in the enemy. */
  stop?: boolean;
  /** Seconds after the first hit that this stroke starts (0 for the first). */
  at: number;
}

export interface WeaponMotion {
  /** `swing` and `thrust` fly to the enemy; `shot` (a bow) and `cast` (a staff) stay over their card. */
  style: 'swing' | 'thrust' | 'shot' | 'cast';
  /** The weapon sprite's size in art pixels, the point the hand holds, and its business end: the
   *  blade's tip, or the head of a hammer, axe, pickaxe or scythe. */
  sprite: { w: number; h: number };
  grip: { x: number; y: number };
  tip: { x: number; y: number };
  /** How far from the grip to the tip the weapon rides the cut (1 = the tip itself). */
  on: number;
  /** Degrees the business end leans into its travel (90 = point first, a thrust). */
  lean: number;
  /** The wind-up: where the grip is held (from where the weapon rests on its card, in the mock-up's
   *  units) and how far it is cocked back: degrees for a swing, pixels pulled back for the others. */
  wind: { x: number; y: number };
  cock: number;
  /** How far back along the cut's arc the weapon is on the first lunge frame. */
  runUp: number;
  /** `shot`: the angle (degrees, 0 = right, 90 = down) the sprite shoots toward as it is drawn. */
  fwd?: number;
  strokes: Stroke[];
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

const SPRITE = { w: 100, h: 120 } as const;

export const WEAPON_MOTIONS: Record<string, WeaponMotion> = {
  // a rising diagonal cut, left to right: the blade leans into the swing and sweeps through
  sword: {
    style: 'swing',
    sprite: SPRITE,
    grip: { x: 30, y: 90 },
    tip: { x: 87, y: 13 },
    on: 0.86,
    lean: 32,
    wind: { x: -44, y: -40 },
    cock: 62,
    runUp: 0.3,
    strokes: [
      { rot: -16, len: 1, thick: 1, bow: 1, dir: 1, from: -0.6, to: 0.4, follow: 0.3, at: 0 },
    ],
    knock: 1,
    times: T(0.76, 0.84, 1.08, 0.24),
  },
  // slow and heavy: raised high, a big cleave down to the right
  greatsword: {
    style: 'swing',
    sprite: SPRITE,
    grip: { x: 28, y: 90 },
    tip: { x: 84, y: 12 },
    on: 0.8,
    lean: 24,
    wind: { x: -30, y: -64 },
    cock: 80,
    runUp: 0.35,
    strokes: [
      {
        rot: 30,
        len: 1.15,
        thick: 1.4,
        bow: 1.1,
        dir: 1,
        from: -0.6,
        to: 0.35,
        follow: 0.25,
        at: 0,
      },
    ],
    knock: 1.5,
    times: T(0.76, 0.92, 1.24, 0.32, 0.2),
  },
  // fast and short: two quick cuts that cross
  dagger: {
    style: 'swing',
    sprite: SPRITE,
    grip: { x: 32, y: 78 },
    tip: { x: 82, y: 32 },
    on: 0.8,
    lean: 36,
    wind: { x: -30, y: -44 },
    cock: 50,
    runUp: 0.3,
    strokes: [
      { rot: 30, len: 0.66, thick: 0.6, bow: 0.7, dir: 1, from: -0.7, to: 0.6, follow: 0, at: 0 },
      {
        rot: -30,
        len: 0.66,
        thick: 0.6,
        bow: 0.7,
        dir: -1,
        from: -0.7,
        to: 0.55,
        follow: 0.3,
        at: 0.2,
      },
    ],
    knock: 0.7,
    times: T(0.76, 0.8, 0.96, 0.36, 0.1),
  },
  // a quick thrust: point first along a long thin line
  spear: {
    style: 'thrust',
    sprite: SPRITE,
    grip: { x: 36, y: 82 },
    tip: { x: 90, y: 12 },
    on: 1,
    lean: 90,
    wind: { x: -40, y: -50 },
    cock: 34,
    runUp: 0.45,
    strokes: [
      {
        rot: -58,
        len: 1.15,
        thick: 0.42,
        bow: 0.1,
        dir: 1,
        from: -0.3,
        to: 0.7,
        follow: 0.12,
        at: 0,
      },
    ],
    knock: 1,
    times: T(0.76, 0.84, 1.06, 0.2),
  },
  // a heavy charge: slower, thicker, and it throws the enemy back
  lance: {
    style: 'thrust',
    sprite: SPRITE,
    grip: { x: 24, y: 92 },
    tip: { x: 86, y: 14 },
    on: 1,
    lean: 90,
    wind: { x: -50, y: -40 },
    cock: 50,
    runUp: 0.5,
    strokes: [
      {
        rot: -22,
        len: 1.3,
        thick: 0.8,
        bow: 0.08,
        dir: 1,
        from: -0.25,
        to: 0.55,
        follow: 0.1,
        at: 0,
      },
    ],
    knock: 1.6,
    times: T(0.76, 0.92, 1.2, 0.28, 0.18),
  },
  // slow and heavy: an overhead smash that lands on the enemy and stays there
  hammer: {
    style: 'swing',
    sprite: SPRITE,
    grip: { x: 34, y: 88 },
    tip: { x: 66, y: 36 },
    on: 1,
    lean: 12,
    wind: { x: -24, y: -70 },
    cock: 95,
    runUp: 1.1,
    strokes: [
      {
        rot: 74,
        len: 0.7,
        thick: 1.7,
        bow: 1.3,
        dir: 1,
        from: 0.45,
        to: 0.55,
        follow: 0.04,
        hitAt: 0.5,
        at: 0,
      },
    ],
    knock: 1.9,
    times: T(0.76, 0.96, 1.32, 0.32, 0.22),
  },
  // a chop: the axe's edge faces left, so it comes down from the right, edge first
  logging_axe: {
    style: 'swing',
    sprite: SPRITE,
    grip: { x: 36, y: 84 },
    tip: { x: 62, y: 32 },
    on: 1,
    lean: 14,
    wind: { x: -36, y: -56 },
    cock: 80,
    runUp: 0.35,
    strokes: [
      {
        rot: -48,
        len: 0.9,
        thick: 1.25,
        bow: 1,
        dir: -1,
        from: -0.55,
        to: 0.3,
        follow: 0.2,
        at: 0,
      },
    ],
    knock: 1.2,
    times: T(0.76, 0.88, 1.14, 0.26, 0.16),
  },
  // a pick: short and sharp, the point lands and bites
  pickaxe: {
    style: 'swing',
    sprite: SPRITE,
    grip: { x: 28, y: 90 },
    tip: { x: 72, y: 24 },
    on: 1,
    lean: 10,
    wind: { x: -36, y: -50 },
    cock: 85,
    runUp: 1,
    strokes: [
      {
        rot: 56,
        len: 0.72,
        thick: 0.8,
        bow: 0.9,
        dir: 1,
        from: 0.2,
        to: 0.45,
        follow: 0.12,
        hitAt: 0.3,
        at: 0,
      },
    ],
    knock: 1,
    times: T(0.76, 0.86, 1.1, 0.22, 0.14),
  },
  // a wide reaping arc, right to left: the scythe's blade points left, so it leads
  scythe: {
    style: 'swing',
    sprite: SPRITE,
    grip: { x: 24, y: 96 },
    tip: { x: 72, y: 22 },
    on: 1,
    lean: 18,
    wind: { x: -30, y: -50 },
    cock: 70,
    runUp: 0.3,
    strokes: [
      {
        rot: 10,
        len: 1.3,
        thick: 0.9,
        bow: 1.5,
        dir: -1,
        from: -0.65,
        to: 0.45,
        follow: 0.3,
        at: 0,
      },
    ],
    knock: 1,
    times: T(0.76, 0.9, 1.16, 0.28, 0.16),
  },
  // drawn and loosed: the bow turns to the enemy, kicks back, and its shot stops in the enemy
  bow: {
    style: 'shot',
    sprite: SPRITE,
    grip: { x: 57, y: 78 },
    tip: { x: 57, y: 78 },
    on: 1,
    lean: 90,
    wind: { x: 20, y: -120 },
    cock: 14,
    runUp: 0,
    fwd: 49.5,
    strokes: [
      {
        rot: 'aim',
        len: 1,
        thick: 0.5,
        bow: 0,
        dir: 1,
        from: 0,
        to: 0,
        follow: 0,
        hitAt: 0,
        stop: true,
        at: 0,
      },
    ],
    knock: 0.8,
    times: T(0.76, 0.86, 1.1, 0.2, 0.14),
  },
  // raised to the enemy: an orb charges at its head and its bolt bursts on the enemy
  staff: {
    style: 'cast',
    sprite: SPRITE,
    grip: { x: 34, y: 84 },
    tip: { x: 82, y: 14 },
    on: 1,
    lean: 90,
    wind: { x: -50, y: 20 },
    cock: 16,
    runUp: 0,
    strokes: [
      {
        rot: 'aim',
        len: 1,
        thick: 1.1,
        bow: 0,
        dir: 1,
        from: 0,
        to: 0,
        follow: 0,
        hitAt: 0,
        stop: true,
        at: 0,
      },
    ],
    knock: 1,
    times: T(0.76, 0.92, 1.18, 0.26, 0.16),
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
  /** The slash: its half-length, thickness, bow and how ragged its outer edge is. */
  slash: { halfWidth: number; thick: number; bow: number; rag: number };
  /** The burst's grain size (x) and how hard it falls (negative floats up). */
  burst: { size: number; grav: number };
}

export const ELEMENT_EFFECTS: Record<string, ElementEffect> = {
  fire: {
    c: ['#fff7d6', '#ffe27a', '#ffb02e', '#f2641a', '#b8280f', '#5a1208'],
    ink: '#1a0806',
    rise: 'flame',
    slash: { halfWidth: 340, thick: 44, bow: 56, rag: 1 },
    burst: { size: 1, grav: 1 },
  },
  // yellow bolts on a blue glow: thin, jagged, forked
  storm: {
    c: ['#ffffff', '#fff3a0', '#ffe040', '#6aa8ff', '#3a4ad8', '#1a1460'],
    ink: '#080a30',
    rise: 'bolt',
    slash: { halfWidth: 350, thick: 26, bow: 30, rag: 2.6 },
    burst: { size: 0.7, grav: 0.4 },
  },
  // clean white and gold: a thin bright blade of light with a wide glow
  light: {
    c: ['#ffffff', '#fff6c8', '#ffe27a', '#ffc94a', '#c98a1c', '#6a4208'],
    ink: '#2a1a04',
    rise: 'beam',
    slash: { halfWidth: 350, thick: 30, bow: 36, rag: 0.25 },
    burst: { size: 0.8, grav: -0.5 },
  },
  // a deep curved cut that bursts into vines and leaves
  nature: {
    c: ['#eaffc8', '#b6f27a', '#5fd35a', '#2a9a3a', '#1a5a2a', '#0a2a14'],
    ink: '#06180a',
    rise: 'vine',
    slash: { halfWidth: 330, thick: 38, bow: 92, rag: 0.7 },
    burst: { size: 1.1, grav: 0.7 },
  },
  // heavy and flat: thick, with rock spikes thrown up
  earth: {
    c: ['#ffe7b0', '#e8b866', '#c4803a', '#8a5224', '#5a3216', '#2a160a'],
    ink: '#1a0c05',
    rise: 'spike',
    slash: { halfWidth: 330, thick: 58, bow: 18, rag: 0.5 },
    burst: { size: 1.6, grav: 2.2 },
  },
  // crisp and angular: a clean cut with crystal prisms growing from it
  crystal: {
    c: ['#f2ffff', '#b8fff4', '#5fe8d8', '#3ab8c8', '#2a7aa8', '#143a60'],
    ink: '#08203a',
    rise: 'crystal',
    slash: { halfWidth: 345, thick: 34, bow: 24, rag: 0.15 },
    burst: { size: 1.1, grav: 0.8 },
  },
  // a dark swirling cut with purple wisps
  void: {
    c: ['#f0d8ff', '#c48cff', '#9a4ce8', '#5f2aa8', '#33145f', '#14062a'],
    ink: '#0a0314',
    rise: 'wisp',
    slash: { halfWidth: 340, thick: 48, bow: 78, rag: 1.4 },
    burst: { size: 1.2, grav: -0.2 },
  },
};

/** True when a weapon type and an element both have their entry. */
export function hasSpecial(kind: string | undefined, element: string | undefined): boolean {
  return Boolean(kind && element && WEAPON_MOTIONS[kind] && ELEMENT_EFFECTS[element]);
}
