/// <reference types="vite/client" />
import bowSheet from '../art/fx/hit-bow.png';
import daggerSheet from '../art/fx/hit-dagger.png';
import greatswordSheet from '../art/fx/hit-greatsword.png';
import hammerSheet from '../art/fx/hit-hammer.png';
import lanceSheet from '../art/fx/hit-lance.png';
import scytheSheet from '../art/fx/hit-scythe.png';
import spearSheet from '../art/fx/hit-spear.png';
import staffSheet from '../art/fx/hit-staff.png';
import swordSheet from '../art/fx/hit-sword.png';
import crystalSlash from '../art/fx/slash-crystal.png';
import earthSlash from '../art/fx/slash-earth.png';
import fireSlash from '../art/fx/slash-fire.png';
import lightSlash from '../art/fx/slash-light.png';
import natureSlash from '../art/fx/slash-nature.png';
import stormSlash from '../art/fx/slash-storm.png';
import voidSlash from '../art/fx/slash-void.png';
import { onFrame } from './motion';
import {
  effectOf,
  ELEMENT_SHEETS,
  HIT_SHEETS,
  type HitSheet,
  WEAPON_MOTIONS,
  type ElementEffect,
  type RiseKind,
  type Stroke,
  type WeaponMotion,
} from './specialData';

export { hasSpecial } from './specialData';

/**
 * The special attack (DESIGN.md §2 Attack animations: the special attack): what a card's signature
 * attack shows when its gauge is full. The stage dims, a slanted cut-in slides in with the weapon
 * at 3x and the skill's name, the weapon leaves its card at 2x and winds up, lunges in two frames
 * with afterimages, a white impact frame, the element's slash snapping on while the weapon swipes
 * along it, a shake, element particles and the damage number, then it settles. Show only: it reads nothing but what the duel
 * passes in and never touches the game.
 *
 * The card's approved weapon sprite is never redrawn: it is the same picture, moved, scaled by whole
 * numbers and rotated in a few held poses. One motion per weapon type and one effect per element
 * live in specialData.ts, so a new type or element is one more entry there.
 *
 * Drawn on one canvas over the duel, in "logical pixels" of `u` whole device pixels each (the cards'
 * own art pixel), stepped at 25 frames a second like the rest of the pixel art.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SpecialRequest {
  kind: string;
  element: string;
  /** The card's tier: wood to prismatic play their material's sober hit instead of the element's. */
  tier?: string;
  /** The weapon sprite (the card's own picture, loaded). */
  weapon: HTMLImageElement;
  /** The card's name and its skill's name and one-line description. */
  card: string;
  skill: string;
  line: string;
  /** Boxes in CSS px relative to the host: the enemy card and the weapon on the source card. */
  foe: Box;
  rest: Box;
  /** Device pixels per logical pixel (the cards' own art pixel, a whole number) and the device ratio. */
  u: number;
  dpr: number;
  calm: boolean;
  /** Reaction hooks: dressing the cards and the arena while it plays. */
  hooks: SpecialHooks;
}

export interface SpecialHooks {
  /** `on` while the stage is dimmed (the arena adds its dimming class). */
  dim(on: boolean): void;
  /** The source card: lift or sink it by logical pixels, glow with a colour and width, hide its weapon. */
  card(o: {
    dy: number;
    glow: string | null;
    glowPx: number;
    weapon: boolean;
    flash: boolean;
  }): void;
  /** The enemy card: knock it back by logical pixels, flash it white. */
  foe(o: { dx: number; dy: number; flash: boolean }): void;
  /** The hit lands (shake, the damage number). */
  release(weight: number): void;
  /** The whole thing is over (or was cancelled). */
  done(): void;
}

const FPS = 25;
const FONT = '"Pixelify Sans", sans-serif';
/** The frame a time falls in. */
const F = (t: number): number => Math.floor(t * FPS + 1e-6);

const cl = (x: number, a = 0, b = 1): number => Math.max(a, Math.min(b, x));
const seg = (t: number, a: number, b: number): number => cl((t - a) / (b - a));
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;
const out3 = (x: number): number => 1 - Math.pow(1 - x, 3);
const back = (x: number): number => {
  const s = 1.9;
  const y = x - 1;
  return y * y * ((s + 1) * y + s) + 1;
};
const rnd = (i: number): number => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const R = Math.round;
const even = (x: number): number => Math.round(x / 2) * 2;

type Ctx = CanvasRenderingContext2D;

function tinted(img: HTMLImageElement, col: string): HTMLCanvasElement {
  const k = document.createElement('canvas');
  k.width = img.naturalWidth;
  k.height = img.naturalHeight;
  const x = k.getContext('2d')!;
  x.drawImage(img, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = col;
  x.fillRect(0, 0, k.width, k.height);
  return k;
}

function text(
  g: Ctx,
  s: string,
  px: number,
  py: number,
  size: number,
  col: string,
  align: CanvasTextAlign = 'left',
  stroke = 0,
  strokeCol = '#000',
  italic = false,
): void {
  g.font = `${italic ? 'italic ' : ''}700 ${size}px ${FONT}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  if (stroke) {
    g.lineJoin = 'miter';
    g.miterLimit = 2;
    g.lineWidth = stroke;
    g.strokeStyle = strokeCol;
    g.strokeText(s, R(px), R(py));
  }
  g.fillStyle = col;
  g.fillText(s, R(px), R(py));
}

/** Largest size at most `size` that keeps `s` inside `room`. */
const fitSize = (g: Ctx, s: string, size: number, room: number): number => {
  g.font = `italic 700 ${size}px ${FONT}`;
  const w = g.measureText(s).width;
  return w > room ? Math.max(24, Math.floor((size * room) / w)) : size;
};

interface Scene {
  g: Ctx;
  W: number;
  H: number;
  req: SpecialRequest;
  m: WeaponMotion;
  e: ElementEffect;
  /** Scale of positions against the mock-up (the enemy card's size). */
  f: number;
  /** Scale of the cut-in (the stage's size against the mock-up's). */
  band: number;
  foe: Box;
  fc: { x: number; y: number };
  rest: { x: number; y: number };
  s1: number;
  wp: HTMLImageElement;
  white: HTMLCanvasElement;
  black: HTMLCanvasElement;
  trail: HTMLCanvasElement[];
  dark: HTMLCanvasElement;
  /** The drawn hit this attack plays in place of the code-drawn one: its frames in the effect's
   *  colours, the same in black for the white impact frame, its whole scale, whether it is mirrored,
   *  whether it is an element's slash, and the angle, length and bow the cut takes from it. */
  sheet?: {
    def: HitSheet;
    img: CanvasImageSource;
    black: HTMLCanvasElement;
    scale: number;
    flip: boolean;
    element: boolean;
    rot?: number;
    half?: number;
    bulge?: number;
  };
}

const SHEET_URLS: Record<keyof typeof HIT_SHEETS, string> = {
  sword: swordSheet,
  greatsword: greatswordSheet,
  dagger: daggerSheet,
  spear: spearSheet,
  lance: lanceSheet,
  hammer: hammerSheet,
  scythe: scytheSheet,
  bow: bowSheet,
  staff: staffSheet,
};
const ELEMENT_URLS: Record<string, string> = {
  fire: fireSlash,
  storm: stormSlash,
  light: lightSlash,
  nature: natureSlash,
  earth: earthSlash,
  crystal: crystalSlash,
  void: voidSlash,
};
const sheetImages = new Map<string, HTMLImageElement>();
/** A sheet's picture once it has loaded (the first call starts the load). */
function sheetImage(url: string): HTMLImageElement | undefined {
  let img = sheetImages.get(url);
  if (!img) {
    img = new Image();
    img.src = url;
    sheetImages.set(url, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : undefined;
}

/**
 * A grey sheet in an effect's own colours: its brightness sorted into the five tones `c[0..4]`,
 * every pixel fully opaque or fully clear. The darkest and lightest are taken over the whole sheet,
 * or frame by frame with `lift` (for a sheet whose late frames are very dark).
 */
function recoloured(
  img: HTMLImageElement,
  c: readonly string[],
  frameW: number,
  lift: boolean,
): HTMLCanvasElement {
  const k = document.createElement('canvas');
  k.width = img.naturalWidth;
  k.height = img.naturalHeight;
  const x = k.getContext('2d')!;
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, k.width, k.height);
  const px = d.data;
  const tones = c.slice(0, 5).map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  const light = (i: number): number => px[i]! * 0.299 + px[i + 1]! * 0.587 + px[i + 2]! * 0.114;
  const span = lift ? frameW : k.width;
  for (let x0 = 0; x0 < k.width; x0 += span) {
    let lo = 255;
    let hi = 0;
    const each = (fn: (i: number) => void): void => {
      for (let y = 0; y < k.height; y++)
        for (let xx = x0; xx < Math.min(k.width, x0 + span); xx++) fn((y * k.width + xx) * 4);
    };
    each((i) => {
      if (px[i + 3]! < 128) return;
      lo = Math.min(lo, light(i));
      hi = Math.max(hi, light(i));
    });
    each((i) => {
      if (px[i + 3]! < 128) {
        px[i + 3] = 0;
        return;
      }
      const tone = tones[Math.min(4, Math.floor((1 - (light(i) - lo) / (hi - lo || 1)) * 5))]!;
      px[i] = tone[0]!;
      px[i + 1] = tone[1]!;
      px[i + 2] = tone[2]!;
      px[i + 3] = 255;
    });
  }
  x.putImageData(d, 0, 0);
  return k;
}

/**
 * One frame of the drawn hit on a stroke, at its whole scale and never turned (it may be mirrored).
 * A cut or a thrust is placed by the middle of its chord and shown up to `reveal` from the end its
 * travel starts at; a smash and a bow's hit sit on the hit point; a pillar stands with its foot on
 * the enemy card's foot and comes down from the top with `reveal`.
 */
function sheetFrame(s: Scene, G: Geo, index: number, reveal: number, black = false): void {
  const sh = s.sheet;
  if (!sh) return;
  const { g, foe, fc, f } = s;
  const { frame, centre } = sh.def;
  const k = sh.scale;
  const w = frame.w * k;
  const h = frame.h * k;
  const shown = Math.min(1, reveal);
  const flip = sh.flip !== G.flip;
  let x: number;
  let y: number;
  let clip: [number, number, number, number] | undefined;
  if (G.shape === 'pillar') {
    x = even(fc.x) - centre.x * k;
    y = even(foe.y + foe.h - 8 * f) - centre.y * k;
    clip = [0, 0, s.W, Math.max(0, y + h) * shown];
  } else if (G.shape === 'smash' || G.shape === 'shot') {
    const c = onCut(G, G.shape === 'shot' ? G.cap : G.hitW);
    x = even(c.x) - centre.x * k;
    y = even(c.y) - centre.y * k;
  } else {
    x = even(G.cx) - (flip ? frame.w - centre.x : centre.x) * k;
    y = even(G.cy) - centre.y * k;
    if (shown < 1) {
      const sw = Math.round(w * shown);
      // travelling to the right it appears from its left end, to the left from its right end
      clip = G.dir * G.cs >= 0 ? [x, y, sw, h] : [x + w - sw, y, sw, h];
    }
  }
  g.save();
  if (clip) {
    g.beginPath();
    g.rect(...clip);
    g.clip();
  }
  if (flip) {
    g.translate(x + w, y);
    g.scale(-1, 1);
    x = 0;
    y = 0;
  }
  g.drawImage(black ? sh.black : sh.img, index * frame.w, 0, frame.w, frame.h, x, y, w, h);
  g.restore();
}

/** The frame of a sheet's sequence `age` seconds in. */
function frameIn(
  q: { frames: number[]; step: number; loop?: boolean },
  age: number,
): number | undefined {
  const i = Math.floor(Math.max(0, age) / q.step + 1e-6);
  return q.loop
    ? q.frames[i % q.frames.length]
    : q.loop === false
      ? q.frames[Math.min(i, q.frames.length - 1)]
      : q.frames[i];
}

type Pt = { x: number; y: number };

/** The weapon sprite drawn about its grip, whole scale, held rotation. */
function weapon(
  s: Scene,
  img: CanvasImageSource,
  px: number,
  py: number,
  deg: number,
  scale: number,
): void {
  const { g, m } = s;
  g.save();
  g.translate(R(px), R(py));
  g.rotate((deg * Math.PI) / 180);
  g.drawImage(img, -m.grip.x * scale, -m.grip.y * scale, m.sprite.w * scale, m.sprite.h * scale);
  g.restore();
}

/** Where the weapon's business end is, for a grip at (px, py) turned `deg` at `scale`. */
function tipAt(s: Scene, px: number, py: number, deg: number, scale: number): Pt {
  const { m } = s;
  const a = (deg * Math.PI) / 180;
  const dx = (m.tip.x - m.grip.x) * scale;
  const dy = (m.tip.y - m.grip.y) * scale;
  return {
    x: px + dx * Math.cos(a) - dy * Math.sin(a),
    y: py + dx * Math.sin(a) + dy * Math.cos(a),
  };
}

function disc(g: Ctx, cx: number, cy: number, r: number, col: string): void {
  g.fillStyle = col;
  for (let y = -even(r); y <= r; y += 2) {
    const w = even(Math.sqrt(Math.max(0, r * r - y * y)));
    if (w > 0) g.fillRect(even(cx) - w, even(cy) + y, w * 2, 2);
  }
}

/** A streak from a to b, drawn up to `p` of the way: three bands in the element's colours. */
function streak(s: Scene, a: Pt, b: Pt, p: number, width: number): void {
  const { g, e } = s;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.floor((len * p) / 4);
  for (const [w, col] of [
    [width, e.c[3]],
    [width * 0.62, e.c[1]],
    [width * 0.3, e.c[0]],
  ] as const) {
    g.fillStyle = col;
    const sz = Math.max(2, even(w));
    for (let i = 0; i <= steps; i++) {
      const k = i / Math.max(1, len / 4);
      g.fillRect(
        even(a.x + (b.x - a.x) * k - sz / 2),
        even(a.y + (b.y - a.y) * k - sz / 2),
        sz,
        sz,
      );
    }
  }
}

// ---- what rises from the cut, one per element ----

/** One upright piece of an element's rising effect: base at (x, base), `h` tall, `w` wide. */
function riseOne(
  g: Ctx,
  e: ElementEffect,
  kind: RiseKind,
  x: number,
  base: number,
  h: number,
  w: number,
  ph: number,
  fr: number,
): void {
  const c = e.c;
  switch (kind) {
    case 'flame':
      for (let yy = 0; yy < h; yy += 2) {
        const k = yy / h;
        const sway = even(Math.sin(k * 4 + ph) * 5 * k);
        const ww = Math.max(2, even(w * Math.pow(1 - k, 0.7)));
        g.fillStyle = c[4];
        g.fillRect(even(x) + sway - ww / 2, even(base) - yy, ww, 2);
        if (k < 0.72) {
          const w2 = Math.max(2, even(ww * 0.62));
          g.fillStyle = c[3];
          g.fillRect(even(x) + sway - w2 / 2, even(base) - yy, w2, 2);
        }
        if (k < 0.5) {
          const w3 = Math.max(2, even(ww * 0.34));
          g.fillStyle = c[1];
          g.fillRect(even(x) + sway - w3 / 2, even(base) - yy, w3, 2);
        }
      }
      break;
    case 'bolt': {
      // one clear forked bolt: a halo, a body and a white core, re-rolled every other frame
      const seed = Math.floor(x) * 3 + (fr >> 1) * 31;
      let bx = x;
      let forked = false;
      for (let yy = 0; yy < h; yy += 8) {
        const to = bx + even((rnd(seed + yy * 7) - 0.5) * 30);
        const y = even(base) - yy;
        for (let q = 0; q < 4; q++) {
          const sx = even(bx + ((to - bx) * q) / 4);
          g.fillStyle = c[3];
          g.fillRect(sx - 6, y - q * 2 - 2, 12, 2);
          g.fillStyle = c[1];
          g.fillRect(sx - 4, y - q * 2 - 2, 8, 2);
          g.fillStyle = c[0];
          g.fillRect(sx - 2, y - q * 2 - 2, 4, 2);
        }
        if (!forked && yy > h * 0.4) {
          forked = true;
          const side = rnd(seed + 5) > 0.5 ? 1 : -1;
          for (let q = 0; q < 12; q++) {
            g.fillStyle = q < 8 ? c[1] : c[2];
            g.fillRect(even(bx + side * (6 + q * 3)), y - q * 2 - (q > 6 ? (q - 6) * 2 : 0), 4, 2);
          }
        }
        bx = to;
      }
      break;
    }
    case 'beam': {
      // a column of light that tapers to a point, with a bright core and sparkles
      const ww0 = Math.max(4, even(w * 0.5));
      for (let yy = 0; yy < h; yy += 2) {
        const k = yy / h;
        const ww = Math.max(2, even(ww0 * (k < 0.6 ? 1 : (1 - k) * 2.5)));
        const cx = even(x);
        g.fillStyle = c[3];
        g.fillRect(cx - ww / 2 - 2, even(base) - yy, ww + 4, 2);
        g.fillStyle = c[2];
        g.fillRect(cx - ww / 2, even(base) - yy, ww, 2);
        g.fillStyle = c[1];
        g.fillRect(cx - ww / 4, even(base) - yy, Math.max(2, even(ww / 2)), 2);
        g.fillStyle = c[0];
        g.fillRect(cx - 1, even(base) - yy, 2, 2);
      }
      for (let i = 0; i < 3; i++) {
        const sy = even(base - h * (0.3 + rnd(i + ph) * 0.7));
        const sx = even(x + (rnd(i * 3 + fr + ph) - 0.5) * ww0 * 3);
        g.fillStyle = c[0];
        g.fillRect(sx - 2, sy, 6, 2);
        g.fillRect(sx, sy - 2, 2, 6);
      }
      break;
    }
    case 'vine': {
      // a swaying stalk with leaves
      for (let yy = 0; yy < h; yy += 2) {
        const k = yy / h;
        const sx = even(x + Math.sin(yy / 16 + ph) * 12 * (0.4 + k));
        const ww = Math.max(2, even(6 * (1 - k * 0.7)));
        g.fillStyle = c[4];
        g.fillRect(sx - ww / 2 - 2, even(base) - yy, ww + 4, 2);
        g.fillStyle = c[3];
        g.fillRect(sx - ww / 2, even(base) - yy, ww, 2);
        if (yy % 28 === 12) {
          const side = (yy / 28) % 2 === 0 ? 1 : -1;
          g.fillStyle = c[2];
          g.fillRect(sx + side * 4 - (side < 0 ? 12 : 0), even(base) - yy - 2, 12, 6);
          g.fillStyle = c[1];
          g.fillRect(sx + side * 8 - (side < 0 ? 8 : 0), even(base) - yy, 6, 2);
        }
      }
      break;
    }
    case 'spike': {
      // an angular rock spike, lit from the left
      const lean = even((rnd(Math.floor(x)) - 0.5) * 18);
      for (let yy = 0; yy < h; yy += 2) {
        const k = yy / h;
        const ww = Math.max(2, even(w * 1.2 * (1 - k)));
        const cx = even(x) + R(lean * k);
        g.fillStyle = c[5];
        g.fillRect(cx - ww / 2 - 2, even(base) - yy, ww + 4, 2);
        g.fillStyle = c[3];
        g.fillRect(cx - ww / 2, even(base) - yy, ww, 2);
        g.fillStyle = c[1];
        g.fillRect(cx - ww / 2, even(base) - yy, Math.max(2, even(ww * 0.38)), 2);
      }
      break;
    }
    case 'crystal': {
      // a six-sided prism with two lit facets
      for (let yy = 0; yy < h; yy += 2) {
        const k = yy / h;
        const ww = Math.max(2, even(w * (k < 0.7 ? 0.7 + k * 0.4 : (1 - k) * 2.9)));
        const cx = even(x);
        g.fillStyle = c[5];
        g.fillRect(cx - ww / 2 - 2, even(base) - yy, ww + 4, 2);
        g.fillStyle = c[3];
        g.fillRect(cx - ww / 2, even(base) - yy, ww, 2);
        g.fillStyle = c[2];
        g.fillRect(cx - ww / 2, even(base) - yy, Math.max(2, even(ww * 0.5)), 2);
        g.fillStyle = c[0];
        g.fillRect(cx - ww / 2, even(base) - yy, Math.max(2, even(ww * 0.14)), 2);
      }
      break;
    }
    case 'wisp': {
      // a dark tendril that thins as it climbs
      for (let yy = 0; yy < h; yy += 2) {
        const k = yy / h;
        const sx = even(x + Math.sin(yy / 11 + ph) * (6 + yy * 0.12));
        const ww = Math.max(2, even(w * 0.8 * (1 - k * 0.8)));
        g.fillStyle = c[5];
        g.fillRect(sx - ww / 2 - 2, even(base) - yy, ww + 4, 2);
        g.fillStyle = c[4];
        g.fillRect(sx - ww / 2, even(base) - yy, ww, 2);
        g.fillStyle = c[2];
        g.fillRect(sx - ww / 4, even(base) - yy, Math.max(2, even(ww / 2)), 2);
        if (k < 0.5) {
          g.fillStyle = c[1];
          g.fillRect(sx - 1, even(base) - yy, 2, 2);
        }
      }
      break;
    }
  }
}

// ---- the cut: a bowed arc across the enemy card ----

const RAD = Math.PI / 180;
/** `deg` moved by whole turns to within half a turn of `ref`, so poses blend the short way. */
const near = (deg: number, ref: number): number => deg - 360 * Math.round((deg - ref) / 360);

/** A stroke placed on the stage, in logical pixels. */
interface Geo {
  cx: number;
  cy: number;
  cs: number;
  sn: number;
  /** Half-length, thickness and bow. */
  RR: number;
  T: number;
  bow: number;
  dir: 1 | -1;
  /** Nothing of the cut is drawn past this point of its travel (1 = all of it). */
  cap: number;
  /** What the stroke leaves on the enemy, where along it the hit lands, and a thrust's rings. */
  shape: 'slash' | 'pierce' | 'smash' | 'shot' | 'pillar';
  /** The stroke's drawn sheet is mirrored. */
  flip: boolean;
  /** The stroke's own thickness setting (a pillar's width against the enemy card). */
  widthRel: number;
  hitW: number;
  rings: number;
}

/** `reach` is how far the weapon's end is from the enemy: a stroke along the aim is that long. */
function geoOf(s: Scene, k: Stroke, aimDeg: number, reach: number): Geo {
  const { e, f, fc } = s;
  // a drawn sheet's own angle, length and bow win, so the weapon rides the drawn line
  const sh = s.sheet;
  const half = sh?.half ?? sh?.def.half;
  const bulge = sh?.bulge ?? sh?.def.bulge;
  const a = (sh?.rot ?? (k.rot === 'aim' ? aimDeg : k.rot)) * RAD;
  const cs = Math.cos(a);
  const sn = Math.sin(a);
  const RR =
    sh && half !== undefined
      ? half * sh.scale
      : (k.rot === 'aim' ? reach : e.slash.halfWidth * f) * k.len;
  const bow = sh && bulge !== undefined ? bulge * sh.scale : e.slash.bow * f * k.bow;
  const ox = fc.x + (k.off?.x ?? 0) * f;
  const oy = fc.y + (k.off?.y ?? 0) * f;
  let cx = ox;
  let cy = oy + 2 * f;
  if (k.hitAt !== undefined) {
    const u = k.dir * k.hitAt * RR;
    const v = -bow * (1 - k.hitAt * k.hitAt);
    cx = ox - (u * cs - v * sn);
    cy = oy - (u * sn + v * cs);
  }
  return {
    cx,
    cy,
    cs,
    sn,
    RR,
    T: e.slash.thick * f * k.thick,
    bow,
    dir: k.dir,
    cap: k.stop ? (k.hitAt ?? 0) : 1,
    shape: k.shape ?? 'slash',
    flip: k.flip === true,
    widthRel: k.thick,
    hitW: k.from,
    rings: k.rings ?? 1,
  };
}

/**
 * The point of a cut at `w` (-1 to 1 along the weapon's travel; past them the arc carries on), with
 * the unit direction of travel there and the unit normal to the side the cut bows to.
 */
function onCut(
  G: Geo,
  w: number,
): { x: number; y: number; tx: number; ty: number; nx: number; ny: number } {
  const u = G.dir * w * G.RR;
  const v = -G.bow * (1 - w * w);
  const du = G.dir * G.RR;
  const dv = 2 * G.bow * w;
  let tx = du * G.cs - dv * G.sn;
  let ty = du * G.sn + dv * G.cs;
  const tl = Math.hypot(tx, ty) || 1;
  tx /= tl;
  ty /= tl;
  let nx = ty;
  let ny = -tx;
  if (nx * G.sn - ny * G.cs < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x: G.cx + u * G.cs - v * G.sn, y: G.cy + u * G.sn + v * G.cs, tx, ty, nx, ny };
}

/** The slash of a cut. `reveal` shows it from where the travel starts; `mono` fills one colour. */
function slash(
  s: Scene,
  frame: number,
  G: Geo,
  thick: number,
  reveal: number,
  mono?: string,
): void {
  const { g, e, f } = s;
  const { cx, cy, cs, sn, RR, T, bow } = G;
  const up = T * 2.6 + Math.abs(bow);
  const hx = Math.abs(cs) * RR + Math.abs(sn) * up + 4;
  const hy = Math.abs(sn) * RR + Math.abs(cs) * up + 4;
  const shown = -RR + 2 * RR * Math.min(reveal, (G.cap + 1) / 2);
  for (let y = even(cy - hy); y < cy + hy; y += 2) {
    for (let x = even(cx - hx); x < cx + hx; x += 2) {
      const dx = x - cx;
      const dy = y - cy;
      const u = dx * cs + dy * sn;
      const v = -dx * sn + dy * cs;
      const q = 1 - (u / RR) * (u / RR);
      if (q <= 0) continue;
      if (G.dir * u > shown) continue;
      const th = T * Math.pow(q, 0.8) * thick;
      const d = v + bow * q;
      const uc = u / (14 * f) + frame * 0.37;
      const fr = uc - Math.floor(uc);
      const n = rnd(Math.floor(uc) * 7 + frame * 13) * (1 - Math.abs(fr - 0.35) * 1.5);
      const n2 = rnd(Math.floor(u / (6 * f)) * 3 + frame * 5) * (1 - Math.abs(fr - 0.5));
      const top = th * (1 + (1.5 * Math.max(0, n) + 0.4 * n2) * e.slash.rag);
      const dn = th * 0.9;
      if (d < -top || d > dn) continue;
      let ci: number;
      const a = d < 0 ? -d / th : d / dn;
      if (d < -th) ci = (-d - th) / (top - th) > 0.55 ? 4 : 3;
      else ci = a < 0.3 ? 0 : a < 0.55 ? 1 : a < 0.8 ? 2 : 3;
      // void: a dark core inside a bright rim
      if (e.edge === 'rim') ci = d < -th ? 2 : a < 0.5 ? 5 : a < 0.78 ? 4 : 0;
      g.fillStyle = mono ?? e.c[ci]!;
      g.fillRect(x, y, 2, 2);
    }
  }
  if (!mono && thick > 0.45) edgeOf(s, frame, G, thick, shown);
}

/** A small pointed shape growing from (x, y) along (nx, ny): a rock tooth, a crystal shard or a leaf,
 *  lit on its left half. */
function spike(
  g: Ctx,
  x: number,
  y: number,
  nx: number,
  ny: number,
  len: number,
  half: number,
  shape: 'tooth' | 'shard' | 'leaf',
  lit: string,
  shade: string,
  core?: string,
): void {
  for (let d = 0; d < len; d += 1.4) {
    const k = d / len;
    const prof =
      shape === 'tooth'
        ? 1 - k
        : shape === 'leaf'
          ? Math.sin(Math.PI * k)
          : k < 0.3
            ? 0.5 + (k / 0.3) * 0.5
            : (1 - k) / 0.7;
    const hw = Math.max(1, half * prof);
    for (let t = -hw; t <= hw; t += 1.4) {
      g.fillStyle = core && Math.abs(t) < 1 ? core : t < 0 ? lit : shade;
      g.fillRect(even(x + nx * d - ny * t), even(y + ny * d + nx * t), 2, 2);
    }
  }
}

/** An element's own edge on its slash: what sits on the outer side of the cut while it is held. */
function edgeOf(s: Scene, frame: number, G: Geo, thick: number, shown: number): void {
  const { g, e, f } = s;
  const kind = e.edge;
  if (!kind || kind === 'tongue' || kind === 'rim') return;
  const n = Math.max(4, Math.floor((2 * G.RR) / (30 * f)));
  for (let k = 0; k <= n; k++) {
    const w = -0.9 + (k / n) * 1.8;
    if (w * G.RR > shown) break;
    const q = 1 - w * w;
    const c = onCut(G, w);
    const th = G.T * Math.pow(q, 0.8) * thick;
    const px = c.x + c.nx * th;
    const py = c.y + c.ny * th;
    const r1 = rnd(k * 7 + 3);
    const r2 = rnd(k * 11 + (frame >> 1) * 5);
    const out = Math.atan2(c.ny, c.nx);
    if (kind === 'bolt') {
      // thin forked bolts off the edge, re-rolled every other frame
      if (r2 < 0.45) continue;
      let x = px;
      let y = py;
      let a = out;
      const len = (26 + r1 * 44) * f * Math.sqrt(q);
      for (let d = 0, j = 0; d < len; d += 2, j++) {
        if (j % 5 === 0) a = out + (rnd(k * 13 + j + (frame >> 1) * 3) - 0.5) * 1.8;
        x += Math.cos(a) * 2;
        y += Math.sin(a) * 2;
        g.fillStyle = d < len * 0.5 ? e.c[0] : e.c[1];
        g.fillRect(even(x), even(y), 2, 2);
        if (j === 8)
          for (let b = 1; b < 8; b++)
            g.fillRect(
              even(x + Math.cos(a + 0.9) * 2 * b),
              even(y + Math.sin(a + 0.9) * 2 * b),
              2,
              2,
            );
      }
    } else if (kind === 'sparkle') {
      // a clean edge with plus-shaped sparkles that blink
      if (r2 < 0.5) continue;
      const off = (6 + r1 * 22) * f;
      glint(g, px + c.nx * off, py + c.ny * off, [4, 8, 12][(k + frame) % 3]!, e.c[0]);
    } else if (kind === 'leaf') {
      const a = out + (r1 - 0.5) * 1.4;
      const off = (2 + ((frame + k) % 4) * 2) * f;
      const x = px + c.nx * off;
      const y = py + c.ny * off;
      spike(g, x, y, Math.cos(a), Math.sin(a), (14 + r1 * 10) * f, 5 * f, 'leaf', e.c[1], e.c[3]);
    } else if (kind === 'teeth') {
      const len = (14 + r1 * 18) * f * Math.sqrt(q);
      spike(g, px, py, c.nx, c.ny, len, 9 * f, 'tooth', e.c[1], e.c[4]);
    } else {
      const a = out + (r1 - 0.5) * 0.7;
      const len = (20 + r1 * 28) * f * Math.sqrt(q);
      spike(g, px, py, Math.cos(a), Math.sin(a), len, 5 * f, 'shard', e.c[1], e.c[3], e.c[0]);
    }
  }
}

/** A star of `points` rays (4 or 8; every other ray of 8 is shorter), in one colour. */
function starFlash(g: Ctx, x: number, y: number, R: number, points: number, col: string): void {
  g.fillStyle = col;
  for (let dy = even(-R); dy <= R; dy += 2) {
    for (let dx = even(-R); dx <= R; dx += 2) {
      const r = Math.hypot(dx, dy);
      if (r > R) continue;
      const ph = (Math.atan2(dy, dx) / (Math.PI * 2)) * points + points + 0.5;
      const k = Math.floor(ph);
      const tri = 1 - Math.abs(2 * (ph - k) - 1);
      const long = points === 8 && k % 2 === 1 ? 0.55 : 1;
      if (r <= R * (0.14 + (long - 0.14) * Math.pow(tri, 4)))
        g.fillRect(even(x) + dx, even(y) + dy, 2, 2);
    }
  }
}

/**
 * A hard ring that grows to `R` in three steps of two frames, then breaks into segments and goes.
 * `age` is seconds since it started; `flat` squashes it into a ring lying on the ground.
 */
function shockRing(
  s: Scene,
  x: number,
  y: number,
  R: number,
  age: number,
  px: number,
  flat = 1,
): void {
  const { g, e } = s;
  const step = Math.floor(age / 0.08 + 1e-6);
  if (age < 0 || step > 4) return;
  const r = R * [0.4, 0.72, 1, 1.05, 1.1][step]!;
  const wide = even(step < 2 ? px : step < 3 ? px * 0.75 : px * 0.5) || 2;
  const n = Math.max(16, Math.round((r * 6.3) / Math.max(2, wide - 2)));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const gone = step === 3 ? 0.4 : 0.7;
    if (step >= 3 && rnd(Math.floor((i / n) * 18) * 5 + step * 3) < gone) continue;
    const cx = x + Math.cos(a) * r;
    const cy = y + Math.sin(a) * r * flat;
    if (step < 3) {
      g.fillStyle = e.c[3];
      g.fillRect(
        even(cx - Math.cos(a) * wide - wide / 2),
        even(cy - Math.sin(a) * wide * flat - wide / 2),
        wide,
        wide,
      );
    }
    g.fillStyle = step < 2 ? e.c[0] : e.c[1];
    g.fillRect(even(cx - wide / 2), even(cy - wide / 2), wide, wide);
  }
}

/** An ellipse's outline in small squares: `rx` across the line (ax, ay), `ry` along it. */
function ring(
  g: Ctx,
  x: number,
  y: number,
  rx: number,
  ry: number,
  ax: number,
  ay: number,
  px: number,
  col: string,
): void {
  g.fillStyle = col;
  const n = Math.max(12, Math.round((rx + ry) * 1.2));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const p = Math.cos(a) * rx;
    const q = Math.sin(a) * ry;
    g.fillRect(even(x - ay * p + ax * q - px / 2), even(y + ax * p + ay * q - px / 2), px, px);
  }
}

/**
 * A thrust's mark: a straight needle of the element, widest near its head and sharp at its point,
 * with rings thrown off around the shaft where it went in. `age` is seconds since the hit.
 */
function pierce(
  s: Scene,
  frame: number,
  G: Geo,
  thick: number,
  reveal: number,
  age: number,
  mono?: string,
): void {
  const { g, e, f } = s;
  const { cx, cy, cs, sn, RR, T } = G;
  const HEAD = 0.5;
  const hx = Math.abs(cs) * RR + Math.abs(sn) * T * 1.5 + 4;
  const hy = Math.abs(sn) * RR + Math.abs(cs) * T * 1.5 + 4;
  const shown = -RR + 2 * RR * Math.min(reveal, (G.cap + 1) / 2);
  for (let y = even(cy - hy); y < cy + hy; y += 2) {
    for (let x = even(cx - hx); x < cx + hx; x += 2) {
      const dx = x - cx;
      const dy = y - cy;
      const a = G.dir * (dx * cs + dy * sn);
      if (a <= -RR || a >= RR || a > shown) continue;
      const w = a / RR;
      const prof =
        w < HEAD ? Math.pow((w + 1) / (HEAD + 1), 1.4) : Math.pow((1 - w) / (1 - HEAD), 0.8);
      const th = T * prof * thick;
      const jag =
        1 + 0.4 * e.slash.rag * Math.max(0, rnd(Math.floor(a / (8 * f)) * 5 + frame * 11));
      const d = Math.abs(-dx * sn + dy * cs);
      if (d > th * jag) continue;
      const q = d / th;
      g.fillStyle = mono ?? e.c[q < 0.28 ? 0 : q < 0.55 ? 1 : q < 0.8 ? 2 : q < 1 ? 3 : 4]!;
      g.fillRect(x, y, 2, 2);
    }
  }
  if (mono) return;
  for (let i = 0; i < G.rings; i++) {
    const p = seg(age - i * 0.03, 0, 0.22);
    if (p <= 0 || p >= 1) continue;
    const c = onCut(G, G.hitW - i * 0.2);
    const r = T * (1.1 + 3 * out3(p)) * (1 - i * 0.2);
    const px = even((p < 0.5 ? 6 : 4) * f) || 2;
    ring(g, c.x, c.y, r, r * 0.34, c.tx, c.ty, px, p < 0.5 ? e.c[0] : e.c[2]);
  }
}

/**
 * A hammer's mark: no cut at all. One frame of a white eight-point star where the head lands, then a
 * spiked burst, cracks running out, a ring growing to two and a half card widths and breaking up,
 * and chunks thrown up that fall back.
 */
function smash(s: Scene, frame: number, G: Geo, thick: number, age: number, mono?: string): void {
  const { g, e, f, foe } = s;
  const c = onCut(G, G.hitW);
  const R = foe.w * 1.25;
  if (mono) {
    starFlash(g, c.x, c.y, R * 0.8, 8, mono);
    return;
  }
  // the cracks: zigzag lines running out from the hit
  if (thick > 0.35) {
    const reach = R * out3(seg(age, 0.04, 0.16));
    for (let i = 0; i < 6; i++) {
      const base = (i / 6) * Math.PI * 2 + 0.4 + rnd(i + 60) * 0.5;
      let a = base;
      let x = c.x;
      let y = c.y;
      const len = reach * (0.65 + 0.35 * rnd(i + 70));
      for (let d = 0, k = 0; d < len; d += 4, k++) {
        if (k % 7 === 0) a = base + ((k / 7) % 2 ? 0.7 : -0.7) * (0.5 + rnd(i * 9 + k));
        x += Math.cos(a) * 4;
        y += Math.sin(a) * 4;
        const wide = d < len * 0.35 ? 10 : d < len * 0.7 ? 6 : 4;
        g.fillStyle = e.c[3];
        g.fillRect(even(x - wide / 2), even(y - wide / 2), wide, wide);
        if (wide > 4) {
          g.fillStyle = e.c[0];
          g.fillRect(even(x) - wide / 2 + 2, even(y) - wide / 2 + 2, wide - 4, wide - 4);
        }
      }
    }
  }
  shockRing(s, c.x, c.y, R, age - 0.08, even(8 * f) || 2);
  // chunks thrown up that fall back
  const up = age - 0.08;
  if (up >= 0 && up < 0.62) {
    for (let i = 0; i < 9; i++) {
      const x = c.x + (rnd(i + 80) - 0.5) * 560 * f * up;
      const y = c.y - (620 + rnd(i + 90) * 420) * f * up + 1500 * f * up * up;
      const sz = even((8 + rnd(i + 100) * 6) * f * (up > 0.45 ? 0.6 : 1)) || 2;
      const under = Math.max(2, even(sz / 3));
      g.fillStyle = e.c[2];
      g.fillRect(even(x), even(y), sz, sz);
      g.fillStyle = e.c[4];
      g.fillRect(even(x), even(y) + sz - under, sz, under);
    }
  }
  // the white star for one frame, then the burst: a star of uneven spikes, flickering and shrinking
  if (age < 0.075) {
    starFlash(g, c.x, c.y, R * 0.8, 8, '#ffffff');
    return;
  }
  const Rb = G.T * 1.6 * (1 - 0.3 * seg(age, 0.08, 0.3)) * thick;
  if (Rb < 4) return;
  const N = 11;
  for (let y = even(-Rb); y <= Rb; y += 2) {
    for (let x = even(-Rb); x <= Rb; x += 2) {
      const r = Math.hypot(x, y);
      if (r > Rb) continue;
      const ph = (Math.atan2(y, x) / (Math.PI * 2) + 0.5) * N + 0.3;
      const k = Math.floor(ph);
      const tri = 1 - Math.abs(2 * (ph - k) - 1);
      const long = 0.55 + 0.45 * rnd((k % N) * 7 + (frame >> 1) * 13);
      const edge = Rb * (0.34 + (long - 0.34) * Math.pow(tri, 1.3));
      if (r > edge) continue;
      const q = r / edge;
      g.fillStyle = e.c[q < 0.3 ? 0 : q < 0.55 ? 1 : q < 0.8 ? 2 : 3]!;
      g.fillRect(even(c.x) + x, even(c.y) + y, 2, 2);
    }
  }
}

/** A bow's mark: the thin trail of its shot ending in the enemy, a white star for one frame and a
 *  thin ring growing to two and a half card widths. */
function shot(
  s: Scene,
  frame: number,
  G: Geo,
  thick: number,
  reveal: number,
  age: number,
  mono?: string,
): void {
  slash(s, frame, G, thick, reveal, mono);
  const c = onCut(G, G.cap);
  const R = s.foe.w * 1.25;
  if (mono) {
    starFlash(s.g, c.x, c.y, R * 0.45, 4, mono);
    return;
  }
  if (age < 0.075) starFlash(s.g, c.x, c.y, R * 0.45, 4, '#ffffff');
  shockRing(s, c.x, c.y, R, age - 0.08, even(6 * s.f) || 2);
}

/**
 * A staff's mark: a pillar nearly as wide as the enemy card, from the top of the stage down onto
 * the card. It comes down with `reveal`, and as `thick` falls it narrows and breaks into pieces. A
 * flat ring spreads from its foot.
 */
function pillar(
  s: Scene,
  frame: number,
  G: Geo,
  thick: number,
  reveal: number,
  age: number,
  mono?: string,
): void {
  const { g, e, f, foe, fc } = s;
  const foot = foe.y + foe.h;
  const half = foe.w * 0.45 * thick * G.widthRel;
  const end = foot * reveal;
  for (let y = 0; y < end; y += 2) {
    // burning away: rows drop out in runs, so it breaks into pieces instead of fading
    if (thick < 0.7 && rnd(Math.floor(y / (10 * f)) * 3 + frame * 7) < (0.7 - thick) * 1.5)
      continue;
    const n = rnd(Math.floor(y / (6 * f)) * 5 + frame * 11);
    const w = half * (1 + 0.12 * e.slash.rag * n) * (y > foot - 16 * f ? 1.15 : 1);
    const bands = mono ? [1] : [1, 0.86, 0.68, 0.48, 0.24];
    for (let b = 0; b < bands.length; b++) {
      const bw = Math.max(2, even(w * bands[b]!));
      g.fillStyle = mono ?? e.c[4 - b]!;
      g.fillRect(even(fc.x) - bw, y, bw * 2, 2);
    }
  }
  if (!mono && reveal >= 1) {
    shockRing(s, fc.x, foot - 8 * f, foe.w * 1.25, age - 0.08, even(8 * f) || 2, 0.24);
  }
}

/** What a stroke leaves on the enemy: a cut, a thrust's needle, a hammer's burst, a bow's shot or a
 *  staff's pillar. */
function mark(
  s: Scene,
  frame: number,
  G: Geo,
  thick: number,
  reveal: number,
  age: number,
  mono?: string,
): void {
  if (G.shape === 'pierce') pierce(s, frame, G, thick, reveal, age, mono);
  else if (G.shape === 'smash') smash(s, frame, G, thick, age, mono);
  else if (G.shape === 'shot') shot(s, frame, G, thick, reveal, age, mono);
  else if (G.shape === 'pillar') pillar(s, frame, G, thick, reveal, age, mono);
  else slash(s, frame, G, thick, reveal, mono);
}

/**
 * Where a particle of a stroke starts (`r` is 0 to 1): anywhere along a whole cut, close to where
 * it hit on a stroke that stops there, around the way in for a thrust, under the head for a smash,
 * along the foot of a pillar.
 */
function origin(s: Scene, G: Geo, r: number, width: number): Pt {
  if (G.shape === 'pillar')
    return { x: s.fc.x + (r - 0.5) * s.foe.w, y: s.foe.y + s.foe.h - 16 * s.f };
  if (G.shape === 'smash') {
    const c = onCut(G, G.hitW);
    // along the near half of a ring around the hit
    const a = Math.PI * r;
    return { x: c.x + Math.cos(a) * G.T * 1.7, y: c.y + G.T * (0.3 + 0.55 * Math.sin(a)) };
  }
  if (G.shape === 'pierce') return onCut(G, G.hitW - 0.15 + r * 0.6);
  if (G.cap < 1) return onCut(G, G.cap - r * 0.35);
  const u = (r - 0.5) * width * G.RR;
  return { x: G.cx + u * G.cs, y: G.cy + u * G.sn };
}

type Placed = Pt & { rot: number };

/**
 * The weapon's pose with its riding point at `w` of a cut: the business end points to the side the
 * cut bows to, leaning `lean` degrees into the travel (90 = along the cut, point first).
 */
function poseOn(s: Scene, G: Geo, w: number): Placed {
  const { m } = s;
  const c = onCut(G, w);
  const l = m.lean * RAD;
  const bx = Math.cos(l) * c.nx + Math.sin(l) * c.tx;
  const by = Math.cos(l) * c.ny + Math.sin(l) * c.ty;
  const dx = m.tip.x - m.grip.x;
  const dy = m.tip.y - m.grip.y;
  const reach = Math.hypot(dx, dy) * 2 * s.s1 * m.on;
  return {
    x: c.x - bx * reach,
    y: c.y - by * reach,
    rot: (Math.atan2(by, bx) - Math.atan2(dy, dx)) / RAD,
  };
}

/** A small four-point glint where the weapon bites the cut. */
function glint(g: Ctx, x: number, y: number, r: number, col: string): void {
  g.fillStyle = col;
  g.fillRect(even(x) - r, even(y) - 2, r * 2, 4);
  g.fillRect(even(x) - 2, even(y) - r, 4, r * 2);
}

function rays(s: Scene, frame: number, col1: string, col2: string): void {
  const { g, fc, f } = s;
  for (let i = 0; i < 30; i++) {
    if ((i + frame) % 2) continue;
    const a = (i * Math.PI * 2) / 30 + rnd(i) * 0.12;
    const r0 = (250 + rnd(i + 40) * 90) * f;
    g.fillStyle = i % 4 < 2 ? col1 : col2;
    for (let r = r0; r < 900 * f; r += 8) {
      const w = even(4 + (r - r0) / 60);
      g.fillRect(even(fc.x + Math.cos(a) * r), even(fc.y + Math.sin(a) * r), w, w);
    }
  }
}

function cutin(s: Scene, t: number, still: boolean): void {
  const { g, W, e, req, band, s1, m } = s;
  const pin = still ? 1 : out3(seg(t, 0.12, 0.22));
  const pout = seg(t, m.times.leave, m.times.leave + 0.1);
  if (t < 0.12 || pout >= 1) return;
  const SH = -0.12;
  const Y0 = s.H * 0.417;
  const HB = 104 * band;
  g.save();
  g.setTransform(1, SH, 0, 1, 0, Y0);
  const x0 = R(W * pout * 1.1) - 60;
  const x1 = R((W + 120) * pin) - 60;
  g.beginPath();
  g.rect(x0, -HB - 6, x1 - x0, HB * 2 + 12);
  g.clip();
  g.fillStyle = e.c[2];
  g.fillRect(-60, -HB, W + 120, HB * 2);
  g.fillStyle = e.ink;
  g.fillRect(-60, -HB + 6, W + 120, HB * 2 - 12);
  g.fillStyle = e.c[4];
  g.fillRect(-60, -HB + 6, 420 * band, HB * 2 - 12);
  g.fillStyle = e.c[3];
  g.fillRect(-60, -HB + 6, 250 * band, HB * 2 - 12);
  if (!still) {
    for (let i = 0; i < 46; i++) {
      const len = (80 + rnd(i) * 320) * band;
      const y = even((-94 + rnd(i + 9) * 184) * band);
      const h = even(2 + rnd(i + 3) * 6);
      const sp = 1800 + rnd(i + 5) * 2200;
      const x = W + 200 - ((rnd(i + 7) * 1800 + sp * t) % (W + 600));
      g.fillStyle = [e.c[4], e.c[3], e.c[2], e.c[5]][i % 4]!;
      g.fillRect(R(x), y, R(len), h);
    }
  }
  const big = req.skill.toUpperCase();
  const size = fitSize(g, big, 104 * band, W * 0.62);
  const tx = R(
    (still ? W - 70 : lerp(W + 500, W - 70, out3(seg(t, 0.16, 0.3)))) -
      (still ? 0 : 26 * seg(t, 0.3, m.times.leave)),
  );
  text(g, req.card.toUpperCase(), tx, -62 * band, 30 * band, e.c[1], 'right', 6, e.ink);
  text(g, big, tx + 5, 9 * band, size, e.c[5], 'right', 0, '#000', true);
  text(g, big, tx, 4 * band, size, e.c[0], 'right', 10, e.ink, true);
  text(g, req.line, tx, 74 * band, 18 * band, e.c[1], 'right', 4, e.ink);
  g.restore();
  // the weapon, large: the approved sprite at a whole scale, breaking out of the band
  const sc = Math.max(2, Math.round(3 * Math.min(1, band * 1.25))) * s1;
  const sp = still ? 1 : seg(t, 0.14, 0.3);
  if (sp <= 0) return;
  const sw = req.weapon.naturalWidth * sc;
  const sh = req.weapon.naturalHeight * sc;
  const sx = R(
    lerp(-sw - 40, 110 * band, still ? 1 : back(sp)) +
      (still ? 0 : 36 * seg(t, 0.3, m.times.leave)) +
      (pout > 0 ? pout * 900 : 0),
  );
  const sy = R(Y0 + SH * (sx + 150) - sh * 0.55);
  g.drawImage(s.dark, sx + 9, sy + 9, sw, sh);
  g.drawImage(sp < 0.5 && !still ? s.white : s.wp, sx, sy, sw, sh);
}

/** One frame of the special attack at time `t`. */
function frameAt(s: Scene, t: number, calm: boolean): void {
  const { g, W, H, e, m, f, fc, rest, foe } = s;
  const T = m.times;
  const fr = F(t);
  const fLeave = F(T.leave);
  const fWind = F(T.wind);
  const fLunge = F(T.lunge);
  const fHit = F(T.hit);
  const fRel = F(T.release);
  const move = !calm;
  const draw = (img: CanvasImageSource, p: Placed): void => weapon(s, img, p.x, p.y, p.rot, sc2);
  const mix = (a: Placed, b: Placed, p: number): Placed => ({
    x: lerp(a.x, b.x, p),
    y: lerp(a.y, b.y, p),
    rot: lerp(a.rot, near(b.rot, a.rot), p),
  });

  // ---- where everything is ----
  const strokes = m.strokes;
  const last = strokes.length - 1;
  const flies = m.style === 'swing' || m.style === 'thrust';
  /** Where a bow or a staff is held while it fires, and the angle from there to the enemy. */
  const stand = {
    x: rest.x + m.wind.x * f,
    y: rest.y + m.wind.y * f - (m.style === 'cast' ? m.cock : 0),
  };
  const aim = Math.atan2(fc.y - stand.y, fc.x - stand.x) / RAD;
  const ax = Math.cos(aim * RAD);
  const ay = Math.sin(aim * RAD);
  const fwd =
    m.style === 'shot' ? (m.fwd ?? 0) : Math.atan2(m.tip.y - m.grip.y, m.tip.x - m.grip.x) / RAD;
  const aimRot = near(aim - fwd, -15);
  const sc2 = 2 * s.s1;
  const head = tipAt(s, stand.x, stand.y, aimRot, sc2);
  const geos = strokes.map((k) => geoOf(s, k, aim, Math.hypot(fc.x - head.x, fc.y - head.y)));
  const G0 = geos[0]!;
  const K0 = strokes[0]!;

  // ---- when everything happens ----
  const startOf = (i: number): number => T.hit + strokes[i]!.at;
  const endOf = (i: number): number => (i < last ? startOf(i + 1) : T.release);
  /** The frames a stroke's hit holds before the weapon swipes: the white and dark frames of the
   *  first, one flash frame for a later one. */
  const flashOf = (i: number): number => (i === 0 ? m.hold : 0.04);
  /** How far along stroke `i` the weapon is at `tt`: it holds at the hit, swipes fast and settles,
   *  and the last stroke carries on a little while the slash burns away. */
  const wAt = (i: number, tt: number): number => {
    const k = strokes[i]!;
    let w = lerp(k.from, k.to, out3(seg(tt, startOf(i) + flashOf(i), endOf(i))));
    if (i === last && tt > T.release) w += k.follow * out3(seg(tt - T.release, 0, 0.14));
    return w;
  };
  const active = (tt: number): number => {
    let i = 0;
    while (i < last && tt >= startOf(i + 1)) i++;
    return i;
  };
  /** Seconds since stroke `i` hit (long ago when nothing moves, so its mark is drawn whole). */
  const ageOf = (i: number): number => (move ? t - startOf(i) : 9);
  /** A slash snaps on in two frames, from where the hit lands to its end. */
  const revealOf = (i: number, tt: number): number => {
    if (!move) return 1;
    const start = cl((strokes[i]!.from + 1) / 2 + 0.1);
    return start + (1 - start) * seg(tt, startOf(i), startOf(i) + 0.08);
  };

  // ---- the weapon's held poses ----
  /**
   * The weapon riding a cut at `w`, turned in 15 degree steps: a sweep holds each angle for a frame
   * or two instead of creeping a few degrees a frame, which makes the sprite's pixels crawl. The
   * riding point stays on the cut.
   */
  const ride = (G: Geo, w: number): Placed => {
    const rot = Math.round(poseOn(s, G, w).rot / 15) * 15;
    const c = onCut(G, w);
    const a = rot * RAD;
    const vx = (m.tip.x - m.grip.x) * sc2 * m.on;
    const vy = (m.tip.y - m.grip.y) * sc2 * m.on;
    return {
      x: c.x - (vx * Math.cos(a) - vy * Math.sin(a)),
      y: c.y - (vx * Math.sin(a) + vy * Math.cos(a)),
      rot,
    };
  };
  const contact = flies ? ride(G0, K0.from) : { ...stand, rot: aimRot };
  const c0 = onCut(G0, K0.from);
  /** The wind-up: a swing is cocked back against its travel, a thrust or a bow pulls back along its
   *  line, a staff is raised. `p` runs 0 to 1 over the wind-up. */
  const windPose = (p: number): Placed => {
    const at = { x: rest.x + m.wind.x * f, y: rest.y + m.wind.y * f };
    if (m.style === 'swing') return { ...at, rot: contact.rot - K0.dir * m.cock };
    if (m.style === 'thrust')
      return { x: at.x - c0.tx * m.cock * p, y: at.y - c0.ty * m.cock * p, rot: contact.rot };
    if (m.style === 'shot')
      return { x: at.x - ax * m.cock * p, y: at.y - ay * m.cock * p, rot: aimRot };
    return { x: stand.x, y: stand.y + m.cock * (1 - p), rot: aimRot };
  };
  /** A bow kicks back from its shot and a staff pushes toward the enemy, then both settle. */
  const standPose = (tt: number): Placed => {
    const k = 1 - out3(seg(tt, T.hit, T.release));
    const d = m.style === 'shot' ? -8 * k : 10 * k;
    return { x: stand.x + ax * d, y: stand.y + ay * d, rot: aimRot };
  };
  const wound = windPose(1);
  const tipOf = (p: Placed): Pt => tipAt(s, p.x, p.y, p.rot, sc2);

  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  const out = move && t >= T.leave && t < T.back;
  const hostCard = { dy: 0, glow: null as string | null, glowPx: 0, weapon: !out, flash: false };
  const foeLook = { dx: 0, dy: 0, flash: false };

  /**
   * Stroke `i`'s mark right now: its drawn sheet when this attack has one, else the code-drawn
   * mark. `impact` is the white and the dark frame, `hit` the hold, `out` after the release.
   */
  const drawMark = (i: number, phase: 'impact' | 'hit' | 'out'): void => {
    const G = geos[i]!;
    const sh = s.sheet;
    const mono = phase === 'impact' && fr === fHit ? '#000000' : undefined;
    const reveal = phase === 'out' ? 1 : revealOf(i, t);
    // a code mark burns away after the release; a thrust already pulled out thins
    const thick =
      phase === 'out'
        ? 1 - seg(t - T.release, 0, 0.32)
        : G.shape === 'pierce' && i < active(t)
          ? 0.55
          : 1;
    if (!sh) {
      if (thick > 0) mark(s, fr, G, thick, reveal, ageOf(i), mono);
      return;
    }
    // a bow's sheet is only the hit: the trail of its shot stays code-drawn under it
    if (G.shape === 'shot' && thick > 0) slash(s, fr, G, thick, reveal, mono);
    const d = sh.def;
    let frame: number | undefined;
    if (!move) frame = thick > 0 ? d.still : undefined;
    else if (phase === 'impact' || reveal < 1) frame = d.still;
    else if (d.run) frame = frameIn(d.run, ageOf(i));
    else if (phase === 'hit') frame = d.hold ? frameIn(d.hold, ageOf(i)) : d.still;
    else frame = d.out ? frameIn(d.out, t - T.release) : undefined;
    if (frame !== undefined) sheetFrame(s, G, frame, reveal, mono !== undefined);
  };

  // the white impact frame and the dark one after it
  if (move && (fr === fHit || fr === fHit + 1) && t < T.release) {
    g.fillStyle = fr === fHit ? '#ffffff' : e.ink;
    g.fillRect(0, 0, W, H);
    if (fr === fHit + 1) rays(s, fr, e.c[3], e.c[4]);
    g.fillStyle = fr === fHit ? '#000000' : e.c[1];
    g.fillRect(foe.x, foe.y, foe.w, foe.h);
    drawMark(0, 'impact');
    draw(fr === fHit ? s.black : s.white, flies ? contact : standPose(t));
    s.req.hooks.card({ ...hostCard, weapon: false });
    return;
  }

  // the source card: sinks for the wind-up, glows while the stage is dimmed
  if (move) {
    hostCard.dy =
      t < 0.04
        ? 0
        : t < T.wind - 0.08
          ? -8
          : t < T.lunge
            ? 10
            : t < T.back
              ? 4
              : t < T.back + 0.08
                ? -6
                : t < T.back + 0.16
                  ? -2
                  : 0;
  }
  const end = T.release + 0.5;
  if (t >= 0.04 && t < end) {
    hostCard.glow = fr % 2 ? e.c[2] : e.c[1];
    hostCard.glowPx = move ? (fr % 2 ? 4 : 6) : 4;
  }
  hostCard.flash = move && fr === fRel + 4;
  // the enemy: white on each hit, thrown back along the last stroke on the release
  if (move && t >= T.hit && t < T.release) {
    foeLook.flash = fr === fHit + 2;
    for (let i = 1; i <= last; i++) if (fr === F(startOf(i))) foeLook.flash = true;
  }
  if (t >= T.release && move) {
    const k = [1, 0.8, 0.5, 0.3, 0.15, 0.05][fr - fRel] ?? 0;
    const c = onCut(geos[last]!, strokes[last]!.to);
    const lift = strokes[last]!.bow > 0.3 ? 0.5 : 0;
    const kx = c.tx * 0.85 + c.nx * lift;
    const ky = c.ty * 0.85 + c.ny * lift;
    const kl = Math.hypot(kx, ky) || 1;
    foeLook.dx = R((21 * k * m.knock * kx) / kl);
    foeLook.dy = R((21 * k * m.knock * ky) / kl);
    foeLook.flash = fr === fRel;
  }
  s.req.hooks.card(hostCard);
  s.req.hooks.foe(foeLook);

  // wind-up: the weapon leaves the card at 2x, is pulled back, and the element gathers on it
  if (move && t >= T.leave && t < T.lunge) {
    const p = seg(t, T.wind, T.lunge);
    const pulled = fr >= fWind + 2;
    // a heavy weapon hangs still at the top and only trembles on its last three frames
    const j = (m.heavy ? fr >= fLunge - 3 : fr >= fWind + 4) ? (fr % 2 ? 2 : -2) : 0;
    const base: Placed = pulled
      ? windPose(p)
      : { x: rest.x - 14 * f, y: rest.y - 69 * f, rot: -15 };
    const pose = { ...base, x: base.x + (pulled ? j : 0) };
    const glow = tipOf(pose);
    if (pulled) {
      if (!e.plain) disc(g, glow.x, glow.y, 44 + 46 * p, e.c[5]);
      if (!e.plain) disc(g, glow.x, glow.y, 30 + 34 * p, e.c[4]);
      disc(g, glow.x, glow.y, 14 + 22 * p, e.c[3]);
    }
    draw(fr === fLeave ? s.white : s.wp, pose);
    if (pulled) {
      for (let i = 0; i < (e.plain ? 10 : 34); i++) {
        const a = rnd(i) * 6.283;
        const r0 = (70 + rnd(i + 20) * 150) * f;
        const q = cl(p * 1.5 - rnd(i + 50) * 0.5);
        if (q <= 0 || q >= 1) continue;
        const sz = q < 0.5 ? 6 : 4;
        g.fillStyle = e.c[i % 3]!;
        g.fillRect(
          even(glow.x + Math.cos(a) * r0 * (1 - q)),
          even(glow.y + Math.sin(a) * r0 * (1 - q)),
          sz,
          sz,
        );
      }
      // a staff's orb: a bright core at its head
      if (m.style === 'cast') {
        const r = [10, 16, 24][Math.min(2, Math.floor(p * 3))]!;
        disc(g, glow.x, glow.y, r + 6, e.c[2]);
        disc(g, glow.x, glow.y, r, e.c[0]);
      }
    }
  }

  // lunge: two frames. A weapon that flies swings in along its cut's arc with its own afterimages;
  // a bow looses its shot and a staff sends its orb up, and both stay over their card.
  if (move && (fr === fLunge || fr === fLunge + 1)) {
    const second = fr === fLunge + 1;
    if (flies) {
      const far = K0.from - m.runUp;
      const entry = poseOn(s, G0, far);
      entry.rot = near(entry.rot, contact.rot);
      for (let i = 0; i < 4; i++) {
        const p = (i + 1) / 5;
        const ghost = second ? poseOn(s, G0, lerp(far, K0.from, p)) : mix(wound, entry, p);
        draw(s.trail[3 - i]!, ghost);
      }
      draw(s.white, second ? contact : entry);
    } else {
      const pose = standPose(second ? T.hit : T.hit + 9);
      const from = tipOf(pose);
      if (m.style === 'shot') {
        // the shot flies to the enemy as one thin streak and stops there
        streak(s, from, fc, second ? 1 : 0.55, 6);
        disc(g, from.x, from.y, 14, e.c[3]);
        disc(g, from.x, from.y, 8, e.c[0]);
      } else {
        // the orb flares, and a thin leader drops from the top of the stage onto the enemy
        disc(g, from.x, from.y, second ? 30 : 38, e.c[3]);
        disc(g, from.x, from.y, second ? 18 : 24, e.c[0]);
        if (second) streak(s, { x: fc.x, y: 0 }, { x: fc.x, y: foe.y + foe.h }, 1, 6);
      }
      draw(s.white, pose);
    }
  }

  /** The weapon over the enemy at `t`: swiping along its stroke, with afterimages while it is fast. */
  const drawSwipe = (white: boolean): void => {
    const i = active(t);
    const G = geos[i]!;
    const w = wAt(i, t);
    const pose = ride(G, w);
    if (i > 0 && t < startOf(i) + flashOf(i)) {
      // the jump to the next stroke: afterimages from where the last one ended
      const prev = ride(geos[i - 1]!, strokes[i - 1]!.to);
      for (let n = 0; n < 4; n++) draw(s.trail[3 - n]!, mix(prev, pose, (n + 1) / 5));
      draw(s.white, pose);
      return;
    }
    [0.03, 0.02, 0.01].forEach((d, n) => {
      const wb = wAt(i, t - d);
      if (Math.abs(w - wb) * G.RR > 10) draw(s.trail[3 - n]!, ride(G, wb));
    });
    draw(white ? s.white : s.wp, pose);
    const c = onCut(G, w);
    glint(g, c.x, c.y, fr % 2 ? 10 : 14, e.c[0]);
  };
  /** What stays lit while the hit holds: the head of a bow's shot in the enemy, the orb at a
   *  staff's head. */
  const drawSent = (): void => {
    if (m.style === 'shot') {
      const hit = onCut(G0, G0.cap);
      disc(g, hit.x, hit.y, fr % 2 ? 10 : 8, e.c[0]);
    } else {
      const tip = tipOf(standPose(t));
      disc(g, tip.x, tip.y, fr % 2 ? 22 : 18, e.c[3]);
      disc(g, tip.x, tip.y, fr % 2 ? 12 : 10, e.c[0]);
    }
  };

  // the hit: the slash snaps on, and the weapon swipes along it
  if (t >= T.hit && t < T.release) {
    if (move) rays(s, fr, e.c[3], e.c[4]);
    for (let i = 0; i <= last; i++) {
      // a thrust already pulled out thins while the next goes in
      if (t >= startOf(i)) drawMark(i, 'hit');
    }
    if (move) {
      if (flies) drawSwipe(false);
      else {
        draw(s.wp, standPose(t));
        drawSent();
      }
    }
  }
  // release: the slash burns away, the element rises from the cut, particles fall
  if (t >= T.release) {
    const tau = t - T.release;
    for (let i = 0; i <= last; i++) drawMark(i, 'out');
    if (move && fr < fRel + 4) {
      if (flies) drawSwipe(fr === fRel + 3);
      else draw(fr === fRel + 3 ? s.white : s.wp, standPose(t));
    }
    if (move) {
      const n = geos.length;
      const rise = 1 - seg(tau, 0.08, 0.5);
      if (rise > 0 && !e.plain && !s.sheet) {
        const count = e.rise === 'bolt' ? 3 : Math.max(4, Math.round(15 / n));
        geos.forEach((G, gi) => {
          for (let i = 0; i < count; i++) {
            const along = (i / (count - 1)) * 1.7 + (rnd(i + 400 + gi) - 0.5) * 0.05;
            const c =
              G.shape === 'slash' && G.cap >= 1
                ? onCut(G, -0.85 + along)
                : origin(s, G, along / 1.7, 0);
            const hh =
              (e.rise === 'bolt' ? 190 : 70 + rnd(i + 410 + gi * 7) * 110) *
              f *
              rise *
              (0.75 + 0.25 * rnd(i * 5 + fr * 3));
            riseOne(
              g,
              e,
              e.rise,
              c.x,
              c.y + 10 * f,
              hh,
              (30 + rnd(i + 420) * 22) * f,
              i + fr * 0.9,
              fr,
            );
          }
        });
      }
      const { size: grain, grav } = e.burst;
      // no code particles over an element's drawn slash: it breaks up in its own frames
      for (let i = 0; i < (e.plain ? 46 : s.sheet ? 0 : 170); i++) {
        const life = 0.35 + rnd(i + 3) * 0.6;
        if (tau > life) continue;
        const G = geos[i % n]!;
        const o = origin(s, G, rnd(i), 1.8);
        const a = -Math.PI * (0.1 + rnd(i + 1) * 0.8);
        const v0 = (220 + rnd(i + 2) * 760) * f;
        const drag = (1 - Math.exp(-4 * tau)) / 4;
        const x = o.x + Math.cos(a) * v0 * drag;
        const y = o.y - 30 * f + Math.sin(a) * v0 * drag + 160 * grav * tau * tau;
        const k = tau / life;
        const sz = even(Math.max(2, (16 - 16 * k) * grain));
        const tone = Math.min(5, Math.floor(k * 6));
        g.fillStyle = e.c[tone]!;
        g.fillRect(even(x), even(y), sz, sz);
        if (e.burst.chunk && sz >= 6) {
          // a rock chunk: a darker underside and a lit corner
          const under = Math.max(2, even(sz / 3));
          g.fillStyle = e.c[Math.min(5, tone + 2)]!;
          g.fillRect(even(x), even(y) + sz - under, sz, under);
          g.fillStyle = e.c[0];
          g.fillRect(even(x), even(y), 2, 2);
        }
      }
      for (let i = 0; i < (e.plain || s.sheet ? 0 : 70); i++) {
        const t0 = rnd(i + 200) * 0.35;
        const ee = tau - t0;
        const life = 0.6 + rnd(i + 210) * 0.5;
        if (ee < 0 || ee > life) continue;
        const G = geos[i % n]!;
        const o = origin(s, G, rnd(i + 220), 1.9);
        const x = o.x + Math.sin(ee * 7 + i) * 8;
        const y =
          o.y + (50 + rnd(i + 230) * 110) * ee * Math.sign(grav || 1) + 240 * grav * ee * ee;
        const sz = even((ee / life > 0.6 ? 2 : 4) * Math.max(1, grain * 0.8));
        g.fillStyle = e.c[1 + ((i + fr) % 3) + (ee / life > 0.7 ? 1 : 0)]!;
        g.fillRect(even(x), even(y), sz, sz);
      }
      // nothing code-drawn lingers on the enemy card: a drawn sheet per element is to replace the
      // row of small shapes that burned along its bottom edge (the user, 2026-11-21)
    }
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  cutin(s, t, calm);
  if (move && fr === 3) {
    g.fillStyle = 'rgba(255,247,214,0.55)';
    g.fillRect(0, 0, W, H);
  }
}

// ------------------------------------------------------------------------------------------------
// the controller
// ------------------------------------------------------------------------------------------------

export interface SpecialAttack {
  /** Starts the special attack; false when one is playing or just ended (the arena's queue waits). */
  play(req: SpecialRequest): boolean;
  busy(): boolean;
  /** Milliseconds until the next one may start (0 when free now). */
  waitMs(): number;
  /** Stops it at once (the window was hidden, the duel closed). */
  cancel(): void;
}

/** Milliseconds after one ends before the next may start: queued ones play back to back, never over each other. */
const COOLDOWN_MS = 300;

export function createSpecialAttack(host: HTMLElement): SpecialAttack {
  // start loading the drawn slash sheets, so the first attack already has them
  for (const url of [...Object.values(SHEET_URLS), ...Object.values(ELEMENT_URLS)]) sheetImage(url);
  let running: { cv: HTMLCanvasElement; stop: () => void; hooks: SpecialHooks } | null = null;
  let freeAt = 0;

  const finish = (): void => {
    if (!running) return;
    const r = running;
    running = null;
    r.stop();
    r.cv.remove();
    r.hooks.dim(false);
    r.hooks.card({ dy: 0, glow: null, glowPx: 0, weapon: true, flash: false });
    r.hooks.foe({ dx: 0, dy: 0, flash: false });
    r.hooks.done();
    freeAt = performance.now() + COOLDOWN_MS;
  };

  if (typeof document !== 'undefined')
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) finish();
    });

  return {
    busy: () => running !== null || performance.now() < freeAt,
    waitMs: () => (running ? 250 : Math.max(0, freeAt - performance.now())),
    cancel: finish,
    play(req) {
      if (running || performance.now() < freeAt || document.hidden) return false;
      const m = WEAPON_MOTIONS[req.kind];
      const e = effectOf(req.tier, req.element);
      if (!m || !e) return false;
      // only the game's own weapon pictures (100 x 120): any other picture keeps today's hop
      if (req.weapon.naturalWidth !== m.sprite.w || req.weapon.naturalHeight !== m.sprite.h)
        return false;
      const unit = req.u / req.dpr; // CSS px per logical pixel
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.ceil(host.clientWidth / unit));
      cv.height = Math.max(1, Math.ceil(host.clientHeight / unit));
      cv.className = 'sa-canvas';
      cv.setAttribute('aria-hidden', 'true');
      cv.style.width = `${cv.width * unit}px`;
      cv.style.height = `${cv.height * unit}px`;
      const g = cv.getContext('2d');
      if (!g) return false;
      g.imageSmoothingEnabled = false;
      const lb = (b: Box): Box => ({ x: b.x / unit, y: b.y / unit, w: b.w / unit, h: b.h / unit });
      const foe = lb(req.foe);
      const restBox = lb(req.rest);
      const s1 = Math.max(1, Math.round(restBox.w / m.sprite.w));
      const wp = req.weapon;
      const sc: Scene = {
        g,
        W: cv.width,
        H: cv.height,
        req,
        m,
        e,
        f: cl(foe.h / 277, 0.5, 2),
        band: cl(Math.min(cv.width / 1280, cv.height / 720) * 1.15, 0.5, 1),
        foe,
        fc: { x: foe.x + foe.w / 2, y: foe.y + foe.h / 2 },
        rest: { x: restBox.x + m.grip.x * s1, y: restBox.y + m.grip.y * s1 },
        s1,
        wp,
        white: tinted(wp, '#ffffff'),
        black: tinted(wp, '#000000'),
        dark: tinted(wp, e.ink),
        trail: [e.c[1], e.c[2], e.c[3], e.c[4]].map((c) => tinted(wp, c)),
      };
      // a drawn hit: the weapon's own grey sheet in a material tier (wood to prismatic), or the
      // element's slash on a weapon whose cut it fits (mythic, heirloom), once the picture is loaded
      const fit = e.plain ? undefined : m.elementSheet;
      const def: HitSheet | undefined =
        e.plain && m.sheet ? HIT_SHEETS[m.sheet] : fit ? ELEMENT_SHEETS[req.element] : undefined;
      const url = e.plain && m.sheet ? SHEET_URLS[m.sheet] : ELEMENT_URLS[req.element];
      const raw = def && url ? sheetImage(url) : undefined;
      if (def && raw) {
        sc.sheet = {
          def,
          img: e.plain ? recoloured(raw, e.c, def.frame.w, def.lift === true) : raw,
          black: tinted(raw, '#000000'),
          scale: Math.max(2, Math.round(def.scale * sc.f - 0.34)),
          flip: fit?.flip === true,
          element: !e.plain,
          ...(fit?.rot !== undefined ? { rot: fit.rot } : {}),
          ...(fit?.half !== undefined ? { half: fit.half } : {}),
          ...(fit?.bulge !== undefined ? { bulge: fit.bulge } : {}),
        };
      }
      const len = m.times.release + 0.7;
      host.append(cv);
      req.hooks.dim(true);
      let t = 0;
      let lastFrame = -1;
      let released = false;
      const stop = onFrame((dt) => {
        t += dt / 1000;
        if (t >= len) {
          finish();
          return;
        }
        const fr = F(t);
        if (fr !== lastFrame) {
          lastFrame = fr;
          frameAt(sc, t, req.calm);
        }
        if (!released && t >= m.times.release) {
          released = true;
          req.hooks.release(m.heavy ? 1.5 : 1);
        }
      });
      running = { cv, stop, hooks: req.hooks };
      frameAt(sc, 0, req.calm);
      return true;
    },
  };
}
