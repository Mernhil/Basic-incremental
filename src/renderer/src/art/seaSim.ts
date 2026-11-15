/**
 * The Leviathan backdrop's motion as a pure simulation (DESIGN.md §5 Heirloom backdrops): fish and
 * bubbles over time, in art pixels and seconds, with the timings of the approved preview. Drawing
 * it is `backdrop.ts`.
 */

/**
 * THE OFF SWITCH for every Heirloom backdrop animation (the villain's lava strip, the sea's fish and
 * bubbles). Vaulted 2026-11-15 (user: "keep the static backgrounds and vault the animations for
 * now"): false shows the still pictures only and starts no loop, timer or fish. Set it to true to
 * bring the motion back; nothing else needs to change (DESIGN.md §5 Heirloom backdrops).
 */
export const BACKDROP_MOTION = false;

/** What a backdrop draws: its pictures and which motions run, for a switch position (default: the switch above). */
export interface BackdropLayers {
  bg: string;
  /** The layer over the fish; only needed while fish swim (its pixels are the picture's own). */
  front?: string;
  /** Play the picture's strip, when it has one. */
  strip: boolean;
  /** Fish and bubbles. */
  swim: boolean;
}
export function backdropLayers(
  spec: { bg: string; front?: string; motion?: 'sea' },
  motion: boolean = BACKDROP_MOTION,
): BackdropLayers {
  return {
    bg: spec.bg,
    ...(motion && spec.front ? { front: spec.front } : {}),
    strip: motion,
    swim: motion && spec.motion === 'sea',
  };
}

/** The backdrop picture's size in art pixels; it sits at x 38, y 34 of the kit picture. */
export const BACKDROP = { w: 136, h: 160, x: 38, y: 34 } as const;

const SMALL_VARIANTS = 64;
const BIG_VARIANTS = 16;

export interface SeaFish {
  /** Sprite name (`bgfish-r<n>` small, `bgbig-b<n>` big). */
  sprite: string;
  size: number;
  x: number;
  y: number;
  speed: number;
  bobPhase: number;
  big: boolean;
}
export interface SeaBubble {
  x: number;
  y: number;
  speed: number;
  phase: number;
  size: number;
}

const between = (r: () => number, a: number, b: number): number => a + r() * (b - a);

/** The sea's fish and bubbles over time (all numbers are art pixels and seconds). */
export class SeaSim {
  fish: SeaFish[] = [];
  bubbles: SeaBubble[] = [];
  /** The sim's own clock (s): drives the fish bob. */
  t = 0;
  private nextBig = 3;
  private nextSmall = 0;
  private nextBubble = 1.6;
  private bigIndex: number;

  constructor(private readonly rand: () => number = Math.random) {
    this.bigIndex = Math.floor(rand() * BIG_VARIANTS);
  }

  step(dt: number): void {
    this.t += dt;
    for (const f of this.fish) f.x += f.speed * dt;
    this.fish = this.fish.filter((f) => f.x < BACKDROP.w + 4);
    for (const b of this.bubbles) b.y -= b.speed * dt;
    this.bubbles = this.bubbles.filter((b) => b.y > -4);
    // a big fish every 25 to 35 s, the first after about 3 s
    if (this.t >= this.nextBig) {
      this.nextBig = this.t + between(this.rand, 25, 35);
      this.fish.push(this.swimmer(true));
      this.bigIndex = (this.bigIndex + 1 + Math.floor(this.rand() * 3)) % BIG_VARIANTS;
    }
    // a small fish every 6 to 10 s, two at most (the first at once)
    if (this.t >= this.nextSmall) {
      this.nextSmall = this.t + between(this.rand, 6, 10);
      if (this.fish.filter((f) => !f.big).length < 2) this.fish.push(this.swimmer(false));
    }
    // a bubble every 1.6 s
    if (this.t >= this.nextBubble) {
      this.nextBubble += 1.6;
      this.bubbles.push({
        x: between(this.rand, 4, BACKDROP.w - 4),
        y: BACKDROP.h,
        speed: between(this.rand, 10, 18),
        phase: between(this.rand, 0, 6.28),
        size: this.rand() < 0.7 ? 2 : 3,
      });
    }
  }

  private swimmer(big: boolean): SeaFish {
    const size = big ? 64 : 32;
    return {
      sprite: big
        ? `bgbig-b${this.bigIndex}`
        : `bgfish-r${Math.floor(this.rand() * SMALL_VARIANTS)}`,
      size,
      x: -size,
      y: Math.round(big ? between(this.rand, 30, 90) : between(this.rand, 8, 88)),
      speed: big ? 9 : between(this.rand, 12, 18),
      bobPhase: between(this.rand, 0, 6.28),
      big,
    };
  }
}

/** A fish's bob (whole pixels): a gentle 1.5 px swing. */
export const fishBob = (f: SeaFish, t: number): number =>
  Math.round(Math.sin(t * (1000 / 700) + f.bobPhase) * 1.5);
/** A bubble's sideways wobble (whole pixels). */
export const bubbleWobble = (b: SeaBubble, t: number): number =>
  Math.round(Math.sin(t * 2.5 + b.phase));
