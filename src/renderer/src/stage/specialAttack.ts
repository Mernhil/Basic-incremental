import { onFrame } from './motion';
import {
  ELEMENT_EFFECTS,
  WEAPON_MOTIONS,
  type ElementEffect,
  type Pose,
  type RiseKind,
  type WeaponMotion,
} from './specialData';

export { hasSpecial } from './specialData';

/**
 * The special attack (DESIGN.md §2 Attack animations: the special attack): what a card's signature
 * attack shows when its gauge is full. The stage dims, a slanted cut-in slides in with the weapon
 * at 3x and the skill's name, the weapon leaves its card at 2x and winds up, lunges in two frames
 * with afterimages, a white impact frame, a hit-stop under a wide element slash, a shake, element
 * particles and the damage number, then it settles. Show only: it reads nothing but what the duel
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
  release(): void;
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
}

type Pt = { x: number; y: number };

/** The weapon sprite drawn about its grip, whole scale, held rotation. */
function sword(
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
      // a jagged forked bolt: halo, body, white core
      let bx = x;
      for (let yy = 0; yy < h; yy += 6) {
        bx += even((rnd(Math.floor(x) + yy * 7 + fr * 31) - 0.5) * 18);
        const y = even(base) - yy;
        g.fillStyle = c[3];
        g.fillRect(even(bx) - 6, y - 2, 12, 8);
        g.fillStyle = c[2];
        g.fillRect(even(bx) - 4, y - 2, 8, 8);
        g.fillStyle = c[0];
        g.fillRect(even(bx) - 2, y - 2, 4, 8);
        if (yy > h * 0.4 && rnd(yy + Math.floor(x) + fr) > 0.8) {
          g.fillStyle = c[1];
          g.fillRect(even(bx) + 6, y - 2, 12, 4);
          g.fillRect(even(bx) + 14, y + 2, 4, 8);
        }
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

interface Cut {
  rot: number;
  len: number;
  thick: number;
  bow: number;
}

/** The slash this weapon and element make: the weapon's angle, length and thickness on the element's. */
function cutOf(s: Scene, cross = false): Cut {
  const { e, m } = s;
  const c = m.cut;
  const base = c.rot ?? e.slash.rotDeg;
  return {
    rot: cross ? -base : base,
    len: c.len,
    thick: c.thick,
    bow: (c.bow ?? 1) * (cross ? 0.5 : 1),
  };
}

/** The wide slash across the enemy card. `reveal` draws it from the left; `mono` fills one colour. */
function slash(
  s: Scene,
  frame: number,
  cut: Cut,
  thick: number,
  reveal: number,
  mono?: string,
): void {
  const { g, e, f, fc } = s;
  const cx = fc.x;
  const cy = fc.y + 2 * f;
  const rot = (cut.rot * Math.PI) / 180;
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  const RR = e.slash.halfWidth * f * cut.len;
  const T = e.slash.thick * f * cut.thick;
  const bow = e.slash.bow * f * cut.bow;
  const up = T * 2.6 + Math.abs(bow);
  const hx = Math.abs(cs) * RR + Math.abs(sn) * up + 4;
  const hy = Math.abs(sn) * RR + Math.abs(cs) * up + 4;
  for (let y = even(cy - hy); y < cy + hy; y += 2) {
    for (let x = even(cx - hx); x < cx + hx; x += 2) {
      const dx = x - cx;
      const dy = y - cy;
      const u = dx * cs + dy * sn;
      const v = -dx * sn + dy * cs;
      const q = 1 - (u / RR) * (u / RR);
      if (q <= 0) continue;
      if (u > -RR + 2 * RR * reveal) continue;
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
      g.fillStyle = mono ?? e.c[ci]!;
      g.fillRect(x, y, 2, 2);
    }
  }
}

/** The weapon's cut: one slash, or two crossing. */
function slashes(s: Scene, frame: number, thick: number, reveal: number, mono?: string): void {
  slash(s, frame, cutOf(s), thick, reveal, mono);
  if (s.m.cut.cross) slash(s, frame + 3, cutOf(s, true), thick, reveal, mono);
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
  const sc2 = 2 * s.s1;
  /** A pose's grip position: from the enemy card's centre (melee) or from where the weapon rests. */
  const at = (p: Pose, from: 'foe' | 'rest'): Pt =>
    from === 'foe'
      ? { x: fc.x + p.x * f, y: fc.y + p.y * f }
      : { x: rest.x + p.x * f, y: rest.y + p.y * f };
  const anchor = m.style === 'melee' ? 'foe' : 'rest';
  type Placed = Pt & { rot: number };
  /** The two lunge poses. A slashing weapon ends with its blade across the cut at a right angle,
   *  near its middle, and swings in along the cut; other weapons use their data poses. */
  const poses = ((): [Placed, Placed] => {
    const sw = m.swing;
    if (m.style !== 'melee' || !sw)
      return [
        { ...at(m.lunge[0], anchor), rot: m.lunge[0].rot },
        { ...at(m.lunge[1], anchor), rot: m.lunge[1].rot },
      ];
    const cut = cutOf(s);
    const a = (cut.rot * Math.PI) / 180;
    const cs = Math.cos(a);
    const sn = Math.sin(a);
    const RR = e.slash.halfWidth * f * cut.len;
    const u = sw.u * RR;
    const v = -e.slash.bow * f * cut.bow * (1 - sw.u * sw.u);
    const mid = {
      x: fc.x + u * cs - v * sn,
      y: fc.y + 2 * f + u * sn + v * cs + (sw.drop ?? 0) * f,
    };
    const dx = (m.tip.x - m.grip.x) * sc2;
    const dy = (m.tip.y - m.grip.y) * sc2;
    const baseTip = (Math.atan2(m.tip.x - m.grip.x, -(m.tip.y - m.grip.y)) * 180) / Math.PI;
    const rot = (sw.side === 'up' ? cut.rot : cut.rot + 180) - baseTip + (sw.tilt ?? 0);
    const grip = (deg: number, back: number): Placed => {
      const b = (deg * Math.PI) / 180;
      const vx = dx * Math.cos(b) - dy * Math.sin(b);
      const vy = dx * Math.sin(b) + dy * Math.cos(b);
      return { x: mid.x - vx * 0.5 - back * cs, y: mid.y - vy * 0.5 - back * sn, rot: deg };
    };
    return [grip(rot - 18, 0.55 * RR), grip(rot, 0)];
  })();
  const strike = poses[1];
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  const out = move && t >= T.leave && t < T.back;
  const hostCard = { dy: 0, glow: null as string | null, glowPx: 0, weapon: !out, flash: false };
  const foeLook = { dx: 0, dy: 0, flash: false };

  // the white impact frame and the dark one after it
  if (move && (fr === fHit || fr === fHit + 1) && t < T.release) {
    g.fillStyle = fr === fHit ? '#ffffff' : e.ink;
    g.fillRect(0, 0, W, H);
    if (fr === fHit + 1) rays(s, fr, e.c[3], e.c[4]);
    g.fillStyle = fr === fHit ? '#000000' : e.c[1];
    g.fillRect(foe.x, foe.y, foe.w, foe.h);
    slashes(s, fr, 1, 1, fr === fHit ? '#000000' : undefined);
    sword(s, fr === fHit ? s.black : s.white, strike.x, strike.y, strike.rot, sc2);
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
  // the enemy: white on the hit, thrown back on the release
  if (t >= T.hit && t < T.release) foeLook.flash = move && fr === fHit + 2;
  if (t >= T.release && move) {
    const k = [1, 0.8, 0.5, 0.3, 0.15, 0.05][fr - fRel] ?? 0;
    foeLook.dx = R(18 * k * m.knock);
    foeLook.dy = R(-12 * k * m.knock);
    foeLook.flash = fr === fRel;
  }
  s.req.hooks.card(hostCard);
  s.req.hooks.foe(foeLook);

  // wind-up: the weapon leaves the card at 2x, pulls back, embers gather
  if (move && t >= T.leave && t < T.lunge) {
    const p = seg(t, T.wind, T.lunge);
    const wound = fr >= fWind + 2;
    const j = fr >= fWind + 4 ? (fr % 2 ? 2 : -2) : 0;
    const pose = wound ? m.wind : m.leave;
    const gx = rest.x + pose.x * f + (wound ? j : 0);
    const gy = rest.y + pose.y * f;
    // the glow gathers behind the grip, or at the tip of a staff or bow
    const glow =
      m.style === 'melee' ? { x: gx - 6, y: gy - 150 * f } : tipAt(s, gx, gy, pose.rot, sc2);
    if (wound) {
      disc(g, glow.x, glow.y, 44 + 46 * p, e.c[5]);
      disc(g, glow.x, glow.y, 30 + 34 * p, e.c[4]);
      disc(g, glow.x, glow.y, 14 + 22 * p, e.c[3]);
    }
    sword(s, fr === fLeave ? s.white : s.wp, gx, gy, pose.rot, sc2);
    if (wound)
      for (let i = 0; i < 34; i++) {
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
  }
  // lunge: two frames. A melee weapon flies in with its own afterimages; a bow or a staff stays and
  // sends a streak or a beam from its tip to the enemy card.
  if (move && (fr === fLunge || fr === fLunge + 1)) {
    const second = fr === fLunge + 1;
    const to = poses[second ? 1 : 0];
    const toRot = to.rot;
    if (m.style === 'melee') {
      const from = at(m.wind, 'rest');
      for (let i = 0; i < 4; i++) {
        const p = (i + 1) / 5;
        sword(
          s,
          s.trail[3 - i]!,
          lerp(from.x, to.x, p),
          lerp(from.y, to.y, p),
          lerp(m.wind.rot, toRot, p),
          sc2,
        );
      }
      sword(s, s.white, to.x, to.y, toRot, sc2);
    } else {
      const tip = tipAt(s, to.x, to.y, toRot, sc2);
      streak(s, tip, fc, second ? 1 : 0.55, m.style === 'cast' ? 26 : 10);
      disc(g, tip.x, tip.y, m.style === 'cast' ? 40 : 18, e.c[3]);
      disc(g, tip.x, tip.y, m.style === 'cast' ? 24 : 10, e.c[0]);
      sword(s, s.white, to.x, to.y, toRot, sc2);
    }
  }
  // hit-stop: everything holds; the slash owns the stage
  if (t >= T.hit && t < T.release) {
    if (move) rays(s, fr, e.c[3], e.c[4]);
    slashes(s, fHit + 2, 1, 1);
    if (move) sword(s, s.wp, strike.x, strike.y, strike.rot, sc2);
  }
  // release: the slash burns away, the element rises from the cut, particles fall
  if (t >= T.release) {
    const tau = t - T.release;
    const thick = 1 - seg(tau, 0, 0.32);
    if (thick > 0) slashes(s, fr, thick, 1);
    if (move && fr < fRel + 4) {
      // the swing finishes: the weapon carries on along the cut while the slash burns away
      let end = strike;
      const fol = m.swing?.follow;
      if (fol) {
        const cut = cutOf(s);
        const a = (cut.rot * Math.PI) / 180;
        const run = fol.dist * e.slash.halfWidth * f * cut.len * out3(seg(tau, 0, 0.14));
        end = {
          x: strike.x + Math.cos(a) * run,
          y: strike.y + Math.sin(a) * run,
          rot: strike.rot + fol.rot * out3(seg(tau, 0, 0.14)),
        };
      }
      sword(s, fr === fRel + 3 ? s.white : s.wp, end.x, end.y, end.rot, sc2);
    }
    if (move) {
      const cut = cutOf(s);
      const rot = (cut.rot * Math.PI) / 180;
      const cs = Math.cos(rot);
      const sn = Math.sin(rot);
      const SL = { cx: fc.x, cy: fc.y + 2 * f };
      const HW = e.slash.halfWidth * f * cut.len;
      const bow = e.slash.bow * f * cut.bow;
      const reach = Math.min(290, 290 * cut.len) * f;
      const rise = 1 - seg(tau, 0.08, 0.5);
      if (rise > 0) {
        const count = e.rise === 'bolt' ? 9 : 15;
        for (let i = 0; i < count; i++) {
          const u = -reach + (i / (count - 1)) * 2 * reach + (rnd(i + 400) - 0.5) * 16 * f;
          const hh = (70 + rnd(i + 410) * 110) * f * rise * (0.75 + 0.25 * rnd(i * 5 + fr * 3));
          riseOne(
            g,
            e,
            e.rise,
            SL.cx + u * cs,
            SL.cy + u * sn - bow * (1 - (u / HW) ** 2) + 10 * f,
            hh,
            (30 + rnd(i + 420) * 22) * f,
            i + fr * 0.9,
            fr,
          );
        }
      }
      const { size: grain, grav } = e.burst;
      for (let i = 0; i < 170; i++) {
        const life = 0.35 + rnd(i + 3) * 0.6;
        if (tau > life) continue;
        const u = (rnd(i) - 0.5) * 620 * f * Math.min(1, cut.len);
        const a = -Math.PI * (0.1 + rnd(i + 1) * 0.8);
        const v0 = (220 + rnd(i + 2) * 760) * f;
        const drag = (1 - Math.exp(-4 * tau)) / 4;
        const x = SL.cx + u * cs + Math.cos(a) * v0 * drag;
        const y = SL.cy + u * sn - 30 * f + Math.sin(a) * v0 * drag + 160 * grav * tau * tau;
        const k = tau / life;
        const sz = even(Math.max(2, (16 - 16 * k) * grain));
        g.fillStyle = e.c[Math.min(5, Math.floor(k * 6))]!;
        g.fillRect(even(x), even(y), sz, sz);
      }
      for (let i = 0; i < 70; i++) {
        const t0 = rnd(i + 200) * 0.35;
        const ee = tau - t0;
        const life = 0.6 + rnd(i + 210) * 0.5;
        if (ee < 0 || ee > life) continue;
        const u = (rnd(i + 220) - 0.5) * 640 * f * Math.min(1, cut.len);
        const x = SL.cx + u * cs + Math.sin(ee * 7 + i) * 8;
        const y =
          SL.cy +
          u * sn +
          (50 + rnd(i + 230) * 110) * ee * Math.sign(grav || 1) +
          240 * grav * ee * ee;
        const sz = even((ee / life > 0.6 ? 2 : 4) * Math.max(1, grain * 0.8));
        g.fillStyle = e.c[1 + ((i + fr) % 3) + (ee / life > 0.7 ? 1 : 0)]!;
        g.fillRect(even(x), even(y), sz, sz);
      }
      // the enemy card keeps shedding it for a moment
      const burn = 1 - seg(tau, 0.3, 0.8);
      for (let i = 0; i < 16; i++) {
        if (rnd(i + 300) > burn) continue;
        riseOne(
          g,
          e,
          e.rise,
          foe.x + foeLook.dx + (10 + i * 12.5) * f,
          foe.y + foeLook.dy + foe.h,
          (18 + rnd(i * 3 + fr * 7) * 44) * f,
          14 * f,
          i + fr,
          fr,
        );
      }
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
  /** Starts the special attack; false when one is playing or just ended (the caller keeps today's hop). */
  play(req: SpecialRequest): boolean;
  busy(): boolean;
  /** Stops it at once (the window was hidden, the duel closed). */
  cancel(): void;
}

/** Milliseconds after one ends before the next may start, so a run of signatures never piles up. */
const COOLDOWN_MS = 700;

export function createSpecialAttack(host: HTMLElement): SpecialAttack {
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
    cancel: finish,
    play(req) {
      if (running || performance.now() < freeAt || document.hidden) return false;
      const m = WEAPON_MOTIONS[req.kind];
      const e = ELEMENT_EFFECTS[req.element];
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
          req.hooks.release();
        }
      });
      running = { cv, stop, hooks: req.hooks };
      frameAt(sc, 0, req.calm);
      return true;
    },
  };
}
