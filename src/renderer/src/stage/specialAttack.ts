import { onFrame } from './motion';

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
 * live below as data, so a new type or element is one more entry.
 *
 * Drawn on one canvas over the duel, in "logical pixels" of `u` whole device pixels each (the cards'
 * own art pixel), stepped at 25 frames a second like the rest of the pixel art.
 */

// ------------------------------------------------------------------------------------------------
// data: one motion per weapon type, one effect per element
// ------------------------------------------------------------------------------------------------

/** A pose of the weapon: its grip point, a rotation in degrees. Offsets are in the mock-up's units
 *  (a 1280 x 720 stage, the enemy card 204 x 277), scaled by the enemy card's size. */
export interface Pose {
  x: number;
  y: number;
  rot: number;
}

/** How a weapon type moves. Poses marked "rest" are offsets from where the weapon rests on its
 *  card; poses marked "foe" are offsets from the enemy card's centre. */
export interface WeaponMotion {
  /** The weapon sprite's size in art pixels and the point of it the hand holds. */
  sprite: { w: number; h: number };
  grip: { x: number; y: number };
  /** The weapon leaves its card (rest). */
  leave: Pose;
  /** Pulled back for the wind-up (rest). */
  wind: Pose;
  /** The two lunge frames (foe): the first, then the strike. */
  lunge: [Pose, Pose];
  /** Seconds: wind-up starts, lunge starts, the hit lands, the slash releases, the weapon returns. */
  times: { wind: number; lunge: number; hit: number; release: number; back: number };
}

export const WEAPON_MOTIONS: Record<string, WeaponMotion> = {
  sword: {
    sprite: { w: 100, h: 120 },
    grip: { x: 30, y: 90 },
    leave: { x: -14, y: -69, rot: -15 },
    wind: { x: -44, y: -35, rot: -50 },
    lunge: [
      { x: -220, y: 106, rot: 15 },
      { x: -120, y: -28, rot: 70 },
    ],
    times: { wind: 0.84, lunge: 1.08, hit: 1.16, release: 1.4, back: 1.56 },
  },
};

/** Colours and shape of an element's slash. `c` runs bright to dark (6 steps); `ink` is the near-black
 *  outline, `deep` the shade behind the weapon. */
export interface ElementEffect {
  c: [string, string, string, string, string, string];
  ink: string;
  deep: string;
  /** What rises from the cut when it releases. */
  rise: 'flame';
  slash: { rotDeg: number; halfWidth: number; thick: number; bow: number };
}

export const ELEMENT_EFFECTS: Record<string, ElementEffect> = {
  fire: {
    c: ['#fff7d6', '#ffe27a', '#ffb02e', '#f2641a', '#b8280f', '#5a1208'],
    ink: '#1a0806',
    deep: '#1a0806',
    rise: 'flame',
    slash: { rotDeg: 15, halfWidth: 340, thick: 44, bow: 56 },
  },
};

/** True when a weapon type and an element both have their entry. */
export function hasSpecial(kind: string | undefined, element: string | undefined): boolean {
  return Boolean(kind && element && WEAPON_MOTIONS[kind] && ELEMENT_EFFECTS[element]);
}

// ------------------------------------------------------------------------------------------------
// the request and the player
// ------------------------------------------------------------------------------------------------

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
const LEN = 2.1;
const FONT = '"Pixelify Sans", sans-serif';

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

/** Longest the cut-in's big word may be before it shrinks to fit the band. */
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

function disc(g: Ctx, cx: number, cy: number, r: number, col: string): void {
  g.fillStyle = col;
  for (let y = -even(r); y <= r; y += 2) {
    const w = even(Math.sqrt(Math.max(0, r * r - y * y)));
    if (w > 0) g.fillRect(even(cx) - w, even(cy) + y, w * 2, 2);
  }
}

function flame(
  g: Ctx,
  e: ElementEffect,
  x: number,
  base: number,
  h: number,
  w: number,
  ph: number,
): void {
  for (let yy = 0; yy < h; yy += 2) {
    const k = yy / h;
    const sway = even(Math.sin(k * 4 + ph) * 5 * k);
    const ww = Math.max(2, even(w * Math.pow(1 - k, 0.7)));
    g.fillStyle = e.c[4];
    g.fillRect(even(x) + sway - ww / 2, even(base) - yy, ww, 2);
    if (k < 0.72) {
      const w2 = Math.max(2, even(ww * 0.62));
      g.fillStyle = e.c[3];
      g.fillRect(even(x) + sway - w2 / 2, even(base) - yy, w2, 2);
    }
    if (k < 0.5) {
      const w3 = Math.max(2, even(ww * 0.34));
      g.fillStyle = e.c[1];
      g.fillRect(even(x) + sway - w3 / 2, even(base) - yy, w3, 2);
    }
  }
}

/** The wide slash across the enemy card. `reveal` draws it from the left; `mono` fills one colour. */
function slash(s: Scene, frame: number, thick: number, reveal: number, mono?: string): void {
  const { g, e, f, fc } = s;
  const cx = fc.x;
  const cy = fc.y + 2 * f;
  const rot = (e.slash.rotDeg * Math.PI) / 180;
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  const RR = e.slash.halfWidth * f;
  const T = e.slash.thick * f;
  const bow = e.slash.bow * f;
  const ry = 190 * f;
  const rx = 350 * f;
  for (let y = even(cy - ry); y < cy + ry; y += 2) {
    for (let x = even(cx - rx); x < cx + rx; x += 2) {
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
      const up = th * (1 + 1.5 * Math.max(0, n) + 0.4 * n2);
      const dn = th * 0.9;
      if (d < -up || d > dn) continue;
      let ci: number;
      const a = d < 0 ? -d / th : d / dn;
      if (d < -th) ci = (-d - th) / (up - th) > 0.55 ? 4 : 3;
      else ci = a < 0.3 ? 0 : a < 0.55 ? 1 : a < 0.8 ? 2 : 3;
      g.fillStyle = mono ?? e.c[ci]!;
      g.fillRect(x, y, 2, 2);
    }
  }
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
  const { g, W, e, req, band, s1 } = s;
  const pin = still ? 1 : out3(seg(t, 0.12, 0.22));
  const pout = still ? seg(t, 0.76, 0.86) : seg(t, 0.76, 0.86);
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
      g.fillStyle = [e.c[4], e.c[3], e.c[2], '#3a0d07'][i % 4]!;
      g.fillRect(R(x), y, R(len), h);
    }
  }
  const big = req.skill.toUpperCase();
  const size = fitSize(g, big, 104 * band, W * 0.62);
  const tx = R(
    (still ? W - 70 : lerp(W + 500, W - 70, out3(seg(t, 0.16, 0.3)))) -
      (still ? 0 : 26 * seg(t, 0.3, 0.76)),
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
      (still ? 0 : 36 * seg(t, 0.3, 0.76)) +
      (pout > 0 ? pout * 900 : 0),
  );
  const sy = R(Y0 + SH * (sx + 150) - sh * 0.55);
  g.drawImage(s.dark, sx + 9, sy + 9, sw, sh);
  g.drawImage(sp < 0.5 && !still ? s.white : s.wp, sx, sy, sw, sh);
}

/** One frame of the special attack at time `t`. Returns what the cards should look like. */
function frameAt(s: Scene, t: number, calm: boolean): void {
  const { g, W, H, e, m, f, fc, rest } = s;
  const { times: T } = m;
  const fr = Math.floor(t * FPS + 1e-6);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  const foe = s.foe;
  const out = !calm && t >= 0.76 && t < T.back;
  const hostCard = {
    dy: 0,
    glow: null as string | null,
    glowPx: 0,
    weapon: !out,
    flash: false,
  };
  const foeLook = { dx: 0, dy: 0, flash: false };
  const move = !calm;

  // the white impact frame and the dark one after it
  if (move && (fr === 29 || fr === 30) && t < T.hit + 0.08) {
    g.fillStyle = fr === 29 ? '#ffffff' : '#1a0603';
    g.fillRect(0, 0, W, H);
    if (fr === 30) rays(s, fr, e.c[3], e.c[4]);
    g.fillStyle = fr === 29 ? '#000000' : e.c[1];
    g.fillRect(foe.x, foe.y, foe.w, foe.h);
    slash(s, fr, 1, 1, fr === 29 ? '#000000' : undefined);
    sword(
      s,
      fr === 29 ? s.black : s.white,
      fc.x + m.lunge[1].x * f,
      fc.y + m.lunge[1].y * f,
      m.lunge[1].rot,
      2 * s.s1,
    );
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
  if (t >= 0.04 && t < 1.9) {
    hostCard.glow = fr % 2 ? e.c[2] : e.c[1];
    hostCard.glowPx = move ? (fr % 2 ? 4 : 6) : 4;
  }
  hostCard.flash = move && fr === 39;
  // the enemy: white on the hit, thrown back on the release
  if (t >= T.hit && t < T.release) foeLook.flash = move && fr === 31;
  if (t >= T.release && move) {
    const k = [1, 0.8, 0.5, 0.3, 0.15, 0.05][fr - 35] ?? 0;
    foeLook.dx = R(18 * k);
    foeLook.dy = R(-12 * k);
    foeLook.flash = fr === 35;
  }
  s.req.hooks.card(hostCard);
  s.req.hooks.foe(foeLook);

  const wsp = (x: number, y: number): [number, number] => [x, y];

  // wind-up: the weapon leaves the card at 2x, pulls back, embers gather
  if (move && t >= 0.76 && t < T.lunge) {
    const p = seg(t, T.wind, T.lunge);
    const wound = fr >= 23;
    const j = fr >= 25 ? (fr % 2 ? 2 : -2) : 0;
    const pose = wound ? m.wind : m.leave;
    const [gx, gy] = wsp(rest.x + pose.x * f + (wound ? j : 0), rest.y + pose.y * f);
    if (wound) {
      const bx = gx - 6;
      const by = gy - 150 * f;
      disc(g, bx, by, 44 + 46 * p, e.c[5]);
      disc(g, bx, by, 30 + 34 * p, e.c[4]);
      disc(g, bx, by, 14 + 22 * p, e.c[3]);
    }
    sword(s, fr === 19 ? s.white : s.wp, gx, gy, pose.rot, 2 * s.s1);
    if (wound)
      for (let i = 0; i < 34; i++) {
        const a = rnd(i) * 6.283;
        const r0 = (70 + rnd(i + 20) * 150) * f;
        const q = cl(p * 1.5 - rnd(i + 50) * 0.5);
        if (q <= 0 || q >= 1) continue;
        const sz = q < 0.5 ? 6 : 4;
        g.fillStyle = e.c[i % 3]!;
        g.fillRect(
          even(gx - 6 + Math.cos(a) * r0 * (1 - q)),
          even(gy - 150 * f + Math.sin(a) * r0 * (1 - q)),
          sz,
          sz,
        );
      }
  }
  // calm: the weapon is simply held at the strike, no travel
  // lunge: two frames, with the sprite's own afterimages
  if (move && (fr === 27 || fr === 28)) {
    const from = { x: rest.x + m.wind.x * f, y: rest.y + m.wind.y * f, r: m.wind.rot };
    const P = m.lunge[fr === 27 ? 0 : 1];
    const to = { x: fc.x + P.x * f, y: fc.y + P.y * f, r: P.rot };
    for (let i = 0; i < 4; i++) {
      const p = (i + 1) / 5;
      sword(
        s,
        s.trail[3 - i]!,
        lerp(from.x, to.x, p),
        lerp(from.y, to.y, p),
        lerp(from.r, to.r, p),
        2 * s.s1,
      );
    }
    sword(s, s.white, to.x, to.y, to.r, 2 * s.s1);
  }
  const strike = m.lunge[1];
  const sxp = fc.x + strike.x * f;
  const syp = fc.y + strike.y * f;
  // hit-stop: everything holds; the slash owns the stage
  if (t >= T.hit && t < T.release) {
    if (move) rays(s, fr, e.c[3], e.c[4]);
    slash(s, 31, 1, 1);
    if (move) sword(s, s.wp, sxp, syp, strike.rot, 2 * s.s1);
  }
  // release: the slash burns away, flames burst, embers fall
  if (t >= T.release) {
    const tau = t - T.release;
    const thick = 1 - seg(tau, 0, 0.32);
    if (thick > 0) slash(s, fr, thick, 1);
    if (move && fr < 39) sword(s, fr === 38 ? s.white : s.wp, sxp, syp, strike.rot, 2 * s.s1);
    if (move) {
      const rot = (e.slash.rotDeg * Math.PI) / 180;
      const cs = Math.cos(rot);
      const sn = Math.sin(rot);
      const SL = { cx: fc.x, cy: fc.y + 2 * f };
      const HW = e.slash.halfWidth * f;
      const bow = e.slash.bow * f;
      const rise = 1 - seg(tau, 0.08, 0.5);
      if (rise > 0 && e.rise === 'flame')
        for (let i = 0; i < 15; i++) {
          const u = (-290 + i * 41 + rnd(i + 400) * 16) * f;
          const hh = (70 + rnd(i + 410) * 110) * f * rise * (0.75 + 0.25 * rnd(i * 5 + fr * 3));
          flame(
            g,
            e,
            SL.cx + u * cs,
            SL.cy + u * sn - bow * (1 - (u / HW) ** 2) + 10 * f,
            hh,
            (30 + rnd(i + 420) * 22) * f,
            i + fr * 0.9,
          );
        }
      for (let i = 0; i < 170; i++) {
        const life = 0.35 + rnd(i + 3) * 0.6;
        if (tau > life) continue;
        const u = (rnd(i) - 0.5) * 620 * f;
        const a = -Math.PI * (0.1 + rnd(i + 1) * 0.8);
        const v0 = (220 + rnd(i + 2) * 760) * f;
        const drag = (1 - Math.exp(-4 * tau)) / 4;
        const x = SL.cx + u * cs + Math.cos(a) * v0 * drag;
        const y = SL.cy + u * sn - 30 * f + Math.sin(a) * v0 * drag + 160 * tau * tau;
        const k = tau / life;
        const sz = even(Math.max(2, 16 - 16 * k));
        g.fillStyle = e.c[Math.min(5, Math.floor(k * 6))]!;
        g.fillRect(even(x), even(y), sz, sz);
      }
      for (let i = 0; i < 70; i++) {
        const t0 = rnd(i + 200) * 0.35;
        const ee = tau - t0;
        const life = 0.6 + rnd(i + 210) * 0.5;
        if (ee < 0 || ee > life) continue;
        const u = (rnd(i + 220) - 0.5) * 640 * f;
        const x = SL.cx + u * cs + Math.sin(ee * 7 + i) * 8;
        const y = SL.cy + u * sn + (50 + rnd(i + 230) * 110) * ee + 240 * ee * ee;
        const sz = ee / life > 0.6 ? 2 : 4;
        g.fillStyle = e.c[1 + ((i + fr) % 3) + (ee / life > 0.7 ? 1 : 0)]!;
        g.fillRect(even(x), even(y), sz, sz);
      }
      const burn = 1 - seg(tau, 0.3, 0.8);
      for (let i = 0; i < 16; i++) {
        if (rnd(i + 300) > burn) continue;
        flame(
          g,
          e,
          foe.x + foeLook.dx + (10 + i * 12.5) * f,
          foe.y + foeLook.dy + foe.h,
          (18 + rnd(i * 3 + fr * 7) * 44) * f,
          14 * f,
          i + fr,
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

/** Seconds after one ends before the next may start, so a run of signatures never piles up. */
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
      const unit = req.u / req.dpr; // CSS px per logical pixel
      const cv = document.createElement('canvas');
      const hw = host.clientWidth;
      const hh = host.clientHeight;
      cv.width = Math.max(1, Math.ceil(hw / unit));
      cv.height = Math.max(1, Math.ceil(hh / unit));
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
      const f = cl(foe.h / 277, 0.5, 2);
      const wp = req.weapon;
      const sc: Scene = {
        g,
        W: cv.width,
        H: cv.height,
        req,
        m,
        e,
        f,
        band: cl(Math.min(cv.width / 1280, cv.height / 720) * 1.15, 0.5, 1),
        foe,
        fc: { x: foe.x + foe.w / 2, y: foe.y + foe.h / 2 },
        rest: { x: restBox.x + m.grip.x * s1, y: restBox.y + m.grip.y * s1 },
        s1,
        wp,
        white: tinted(wp, '#ffffff'),
        black: tinted(wp, '#000000'),
        dark: tinted(wp, e.deep),
        trail: [e.c[1], e.c[2], e.c[3], e.c[4]].map((c) => tinted(wp, c)),
      };
      host.append(cv);
      req.hooks.dim(true);
      let t = 0;
      let lastFrame = -1;
      let released = false;
      const calm = req.calm;
      const stop = onFrame((dt) => {
        t += dt / 1000;
        if (t >= LEN) {
          finish();
          return;
        }
        const fr = Math.floor(t * FPS + 1e-6);
        if (fr !== lastFrame) {
          lastFrame = fr;
          frameAt(sc, t, calm);
        }
        if (!released && t >= m.times.release) {
          released = true;
          req.hooks.release();
        }
      });
      running = { cv, stop, hooks: req.hooks };
      frameAt(sc, 0, calm);
      return true;
    },
  };
}
