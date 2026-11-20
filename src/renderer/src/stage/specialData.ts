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
  /** What the stroke leaves on the enemy: a cut (the default), a thrust's straight needle with rings
   *  around its shaft, a hammer's burst with cracks, a ring and chunks, a bow's thin trail with a star
   *  and a ring, or a staff's pillar from the top of the stage down onto the enemy card. */
  shape?: 'slash' | 'pierce' | 'smash' | 'shot' | 'pillar';
  /** `pierce`: how many rings the thrust throws off (1 without it). */
  rings?: number;
  /** Where on the enemy card the stroke is centred, from the card's centre in the mock-up's units. */
  off?: { x: number; y: number };
}

export interface WeaponMotion {
  /** `swing` and `thrust` fly to the enemy; `shot` (a bow) and `cast` (a staff) stay over their card. */
  style: 'swing' | 'thrust' | 'shot' | 'cast';
  /** The weapon sprite's size in art pixels, the point the hand holds, and its business end: the
   *  blade's tip, or the head of a hammer or a scythe. */
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
  /** Seconds the weapon stays planted at the hit before it swipes on (the white and the dark frame
   *  are its first two frames). */
  hold: number;
  /** The drawn sheet this weapon's hit plays in place of the code-drawn one, in the material tiers
   *  (wood to prismatic). It is drawn for this weapon's own cut and is never turned. */
  sheet?: keyof typeof HIT_SHEETS;
  /** A heavy weapon: it hangs still at the top of its wind-up and trembles only on the last three
   *  frames, and the stage shakes harder when it lands. */
  heavy?: boolean;
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
    hold: 0.12,
    sheet: 'sword',
    times: T(0.76, 0.84, 1.08, 0.28),
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
    hold: 0.2,
    heavy: true,
    sheet: 'greatsword',
    times: T(0.76, 0.92, 1.4, 0.36, 0.2),
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
    hold: 0.08,
    times: T(0.76, 0.8, 0.96, 0.36, 0.1),
  },
  // a flurry: three quick jabs, point first, the last one the deepest
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
        rot: -64,
        len: 0.6,
        thick: 0.5,
        bow: 0,
        dir: 1,
        from: -0.25,
        to: 0.2,
        follow: 0,
        at: 0,
        shape: 'pierce',
        off: { x: -26, y: 34 },
      },
      {
        rot: -48,
        len: 0.6,
        thick: 0.5,
        bow: 0,
        dir: 1,
        from: -0.25,
        to: 0.2,
        follow: 0,
        at: 0.16,
        shape: 'pierce',
        off: { x: 28, y: 4 },
      },
      {
        rot: -74,
        len: 0.72,
        thick: 0.7,
        bow: 0,
        dir: 1,
        from: -0.2,
        to: 0.3,
        follow: 0.12,
        at: 0.32,
        shape: 'pierce',
        rings: 2,
        off: { x: 0, y: -30 },
      },
    ],
    knock: 1,
    hold: 0.12,
    times: T(0.76, 0.84, 1.06, 0.52),
  },
  // a heavy charge: one thick drive straight through, rings bursting off the shaft, and it throws
  // the enemy back
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
        thick: 1,
        bow: 0,
        dir: 1,
        from: -0.25,
        to: 0.8,
        follow: 0.1,
        at: 0,
        shape: 'pierce',
        rings: 3,
      },
    ],
    knock: 2,
    hold: 0.2,
    heavy: true,
    sheet: 'lance',
    times: T(0.76, 0.92, 1.36, 0.4, 0.18),
  },
  // slow and heavy: an overhead smash that lands on the enemy and stays there, in a burst with
  // cracks and a shockwave instead of a cut
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
        shape: 'smash',
      },
    ],
    knock: 1.9,
    hold: 0.24,
    heavy: true,
    sheet: 'hammer',
    times: T(0.76, 0.96, 1.48, 0.4, 0.22),
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
    hold: 0.12,
    sheet: 'scythe',
    times: T(0.76, 0.9, 1.16, 0.32, 0.16),
  },
  // drawn and loosed: the bow turns to the enemy, kicks back, and its thin shot stops in the enemy
  // with a star and a ring
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
        thick: 0.3,
        bow: 0,
        dir: 1,
        from: 0,
        to: 0,
        follow: 0,
        hitAt: 0,
        stop: true,
        at: 0,
        shape: 'shot',
      },
    ],
    knock: 0.8,
    hold: 0.12,
    times: T(0.76, 0.86, 1.1, 0.32, 0.14),
  },
  // held over its card and raised to the enemy: the orb at its head grows, and a pillar comes down
  // from the top of the stage onto the enemy card
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
        rot: 90,
        len: 0.5,
        thick: 1,
        bow: 0,
        dir: 1,
        from: -1,
        to: 1,
        follow: 0,
        at: 0,
        shape: 'pillar',
      },
    ],
    knock: 1,
    hold: 0.12,
    sheet: 'staff',
    times: T(0.76, 0.92, 1.18, 0.36, 0.16),
  },
};

/**
 * A drawn hit (PixelLab, 2026-11-21): one strip of equal frames, played in place of the code-drawn
 * mark. Each is drawn for one weapon's own stroke and is never turned. The pictures are
 * `art/fx/hit-<name>.png`; all are grey and take a material's five tones by brightness.
 */
export interface HitSheet {
  frame: { w: number; h: number };
  /** The point of a frame that is placed: the middle of the chord for a cut or a thrust, the hit
   *  point for a smash, the foot for a pillar. */
  centre: { x: number; y: number };
  /** Whole logical pixels per sheet pixel. */
  scale: number;
  /** A cut or a thrust: half the drawn chord's length and how far its middle bows off the chord, in
   *  sheet pixels. The stroke takes them, so the weapon rides the drawn line. Without them the
   *  stroke keeps its own. */
  half?: number;
  bulge?: number;
  /** The whole mark: the two snap-on frames are cut from it. */
  still: number;
  /** The frames while the hit holds (looping, or run once and kept on the last) and the frames it
   *  breaks up in after the release, with the seconds each one stays. */
  hold: { frames: number[]; step: number; loop: boolean };
  out: { frames: number[]; step: number };
}

export const HIT_SHEETS = {
  // a clean cut that shatters into shards from its middle (the user's pick B, 2026-11-21)
  sword: {
    frame: { w: 256, h: 96 },
    centre: { x: 128, y: 56 },
    scale: 3,
    still: 0,
    hold: { frames: [0, 1], step: 0.04, loop: true },
    out: { frames: [2, 3, 4, 5, 6, 7, 8, 9], step: 0.04 },
  },
  // a thick crescent descending to the right that bursts and scatters; six drawn frames, so it
  // steps slower, and it is shown at 4x to keep the greatsword's long cut
  greatsword: {
    frame: { w: 208, h: 144 },
    centre: { x: 104, y: 80 },
    scale: 4,
    half: 96,
    bulge: 17,
    still: 0,
    hold: { frames: [0, 1], step: 0.08, loop: true },
    out: { frames: [2, 3, 4, 5, 6, 7], step: 0.06 },
  },
  // an eight-point star in a ring, then rock chunks thrown out in a ring; it stops after frame 8
  hammer: {
    frame: { w: 160, h: 152 },
    centre: { x: 80, y: 76 },
    scale: 3,
    still: 0,
    hold: { frames: [0, 1, 2, 3, 4], step: 0.08, loop: false },
    out: { frames: [5, 6, 7, 8], step: 0.08 },
  },
  // a long arc descending to the right that thins from its right end, where the scythe starts
  scythe: {
    frame: { w: 256, h: 96 },
    centre: { x: 128, y: 62 },
    scale: 3,
    half: 120,
    bulge: 24,
    still: 0,
    hold: { frames: [0, 1], step: 0.08, loop: true },
    out: { frames: [2, 3, 4, 5, 6, 7, 8, 9], step: 0.04 },
  },
  // a pillar with a ring at its foot, which wavers and falls apart upward
  staff: {
    frame: { w: 96, h: 256 },
    centre: { x: 48, y: 236 },
    scale: 4,
    still: 0,
    hold: { frames: [0, 1, 2], step: 0.08, loop: true },
    out: { frames: [3, 4, 5, 6, 7, 8, 9], step: 0.05 },
  },
  // a drive line rising to the right with three rings, swelling on the hit; six drawn frames
  lance: {
    frame: { w: 256, h: 128 },
    centre: { x: 128, y: 64 },
    scale: 3,
    half: 118,
    bulge: 0,
    still: 0,
    hold: { frames: [0, 1, 2, 3], step: 0.1, loop: false },
    out: { frames: [4, 5, 6, 7], step: 0.08 },
  },
} satisfies Record<string, HitSheet>;

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
  burst: { size: number; grav: number; chunk?: boolean };
  /** What sits on the outer edge of the slash while it is held: fire's tongues (the ragged fringe
   *  itself), forked bolts, plus-shaped sparkles, leaves, rock teeth, crystal shards, or a bright rim
   *  around a dark core. Without it the edge is plain. */
  edge?: 'tongue' | 'bolt' | 'sparkle' | 'leaf' | 'teeth' | 'shard' | 'rim';
  /** A sober hit: nothing rises or burns on the enemy, and only a few sparks fly. */
  plain?: boolean;
}

export const ELEMENT_EFFECTS: Record<string, ElementEffect> = {
  fire: {
    c: ['#fff7d6', '#ffe27a', '#ffb02e', '#f2641a', '#b8280f', '#5a1208'],
    ink: '#1a0806',
    rise: 'flame',
    slash: { halfWidth: 340, thick: 44, bow: 56, rag: 1 },
    burst: { size: 1, grav: 1 },
    edge: 'tongue',
  },
  // yellow bolts on a blue glow: thin, jagged, forked
  storm: {
    c: ['#ffffff', '#fff3a0', '#ffe040', '#6aa8ff', '#3a4ad8', '#1a1460'],
    ink: '#080a30',
    rise: 'bolt',
    slash: { halfWidth: 350, thick: 26, bow: 30, rag: 0.3 },
    burst: { size: 0.7, grav: 0.4 },
    edge: 'bolt',
  },
  // white-gold and pale yellow, no orange: a thin clean blade of light with sparkles on its edge
  light: {
    c: ['#ffffff', '#fffdec', '#fff6c0', '#ffec94', '#dcc86a', '#8c7c34'],
    ink: '#1c1a08',
    rise: 'beam',
    slash: { halfWidth: 350, thick: 30, bow: 36, rag: 0 },
    burst: { size: 0.8, grav: -0.5 },
    edge: 'sparkle',
  },
  // a deep curved cut that bursts into vines and leaves
  nature: {
    c: ['#eaffc8', '#b6f27a', '#5fd35a', '#2a9a3a', '#1a5a2a', '#0a2a14'],
    ink: '#06180a',
    rise: 'vine',
    slash: { halfWidth: 330, thick: 38, bow: 92, rag: 0.2 },
    burst: { size: 1.1, grav: 0.7 },
    edge: 'leaf',
  },
  // heavy and flat: thick, with rock spikes thrown up
  earth: {
    c: ['#ffe7b0', '#e8b866', '#c4803a', '#8a5224', '#5a3216', '#2a160a'],
    ink: '#1a0c05',
    rise: 'spike',
    slash: { halfWidth: 330, thick: 58, bow: 18, rag: 0.1 },
    burst: { size: 1.6, grav: 2.2, chunk: true },
    edge: 'teeth',
  },
  // crisp and angular: a clean cut with crystal prisms growing from it
  crystal: {
    c: ['#f2ffff', '#b8fff4', '#5fe8d8', '#3ab8c8', '#2a7aa8', '#143a60'],
    ink: '#08203a',
    rise: 'crystal',
    slash: { halfWidth: 345, thick: 34, bow: 24, rag: 0 },
    burst: { size: 1.1, grav: 0.8 },
    edge: 'shard',
  },
  // a dark swirling cut with purple wisps
  void: {
    c: ['#f0d8ff', '#c48cff', '#9a4ce8', '#5f2aa8', '#33145f', '#14062a'],
    ink: '#0a0314',
    rise: 'wisp',
    slash: { halfWidth: 340, thick: 48, bow: 78, rag: 0.9 },
    burst: { size: 1.2, grav: -0.2 },
    edge: 'rim',
  },
};

/** A sober hit in a material's colours: one clean cut, a few sparks. */
const sober = (
  c: ElementEffect['c'],
  ink: string,
  edge?: ElementEffect['edge'],
): ElementEffect => ({
  c,
  ink,
  rise: 'flame',
  slash: { halfWidth: 330, thick: 30, bow: 56, rag: 0 },
  burst: { size: 0.6, grav: 1 },
  plain: true,
  ...(edge ? { edge } : {}),
});

/**
 * The hit of a weapon below the element tiers, by its card's tier: it takes its colours from what
 * the weapon is made of instead of its element. Prismatic is the crystal of the five: pale blue and
 * violet, with shards on the edge of its cut. A tier without an entry (mythic, heirloom) plays the
 * element's effect.
 */
export const MATERIAL_EFFECTS: Record<string, ElementEffect> = {
  wood: sober(['#fff6e0', '#ecd09c', '#c79a5c', '#94642f', '#5e3d1c', '#2e1c10'], '#120c06'),
  bronze: sober(['#fff1de', '#f6c896', '#d98c40', '#9e5a20', '#603412', '#2e1a0a'], '#120a04'),
  silver: sober(['#ffffff', '#eef2f7', '#c9d1dd', '#939db0', '#5d6577', '#343a48'], '#0c0e14'),
  gold: sober(['#fffde8', '#fff0a0', '#ffd23e', '#d49a12', '#8a6008', '#3e2a04'], '#141004'),
  prismatic: sober(
    ['#ffffff', '#e4fbff', '#aee8ff', '#86bdf6', '#9a86e6', '#46388a'],
    '#0c1024',
    'shard',
  ),
};

/** The effect a card's special attack plays: its material's below the element tiers, else its element's. */
export function effectOf(tier: string | undefined, element: string): ElementEffect | undefined {
  return (tier ? MATERIAL_EFFECTS[tier] : undefined) ?? ELEMENT_EFFECTS[element];
}

/** True when a weapon type and an element both have their entry. */
export function hasSpecial(kind: string | undefined, element: string | undefined): boolean {
  return Boolean(kind && element && WEAPON_MOTIONS[kind] && ELEMENT_EFFECTS[element]);
}
