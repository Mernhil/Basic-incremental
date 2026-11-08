/**
 * The signature item inside a card (DESIGN.md §12): cel-shaded, drawn in a 200 x 240 box. Rarity
 * sets how intricate it is, adding parts rather than only colour: Common plain; Rare a fuller,
 * wrapped grip and gem; Epic a bigger guard and gem; Legendary a serrated or ornate shape, gold
 * inlay and a ribbon; Mythic neon runes and a crystal edge; Exotic forked shapes and floating rings;
 * Void black chrome, glowing cracks and orbiting shards. Twinkles get more frequent with rarity.
 */
import type { Rarity } from '../../../../data';
import { INK, f, ink } from '../kit';

type V = [number, number];

interface RarityLook {
  /** Accent metal (guards, pommels, trims). */
  acc: string;
  acc2: string;
  /** Gem colour; Common has none. */
  gem: string | null;
  grip: string;
}

const LOOK: Record<Rarity, RarityLook> = {
  common: { acc: '#8d939c', acc2: '#5d636c', gem: null, grip: '#6b3a1f' },
  rare: { acc: '#4f8fe0', acc2: '#2a5aa8', gem: '#7fd3ff', grip: '#3a2a5a' },
  epic: { acc: '#a06ae8', acc2: '#6a3cb0', gem: '#d38bff', grip: '#3a1f4f' },
  legendary: { acc: '#f4c23b', acc2: '#b0700e', gem: '#ff3d4e', grip: '#5a1f1f' },
  mythic: { acc: '#ff3fb4', acc2: '#a01870', gem: '#ff9be0', grip: '#2a0f22' },
  exotic: { acc: '#ff8a1f', acc2: '#b0500a', gem: '#ffe08a', grip: '#2a150a' },
  void: { acc: '#9aa3b2', acc2: '#3a3f4a', gem: '#b47cff', grip: '#121418' },
};
const ORDER: readonly Rarity[] = [
  'common',
  'rare',
  'epic',
  'legendary',
  'mythic',
  'exotic',
  'void',
];

const PATH = (pts: readonly V[], close = true): string =>
  pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join(' ') + (close ? 'Z' : '');
const cub = (p: readonly V[], t: number): V => {
  const u = 1 - t;
  const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return [
    k[0]! * p[0]![0] + k[1]! * p[1]![0] + k[2]! * p[2]![0] + k[3]! * p[3]![0],
    k[0]! * p[0]![1] + k[1]! * p[1]![1] + k[2]! * p[2]![1] + k[3]! * p[3]![1],
  ];
};
const lerpPt = (pts: readonly V[], t: number): V => {
  const g = Math.max(0, Math.min(0.9999, t)) * (pts.length - 1);
  const i = Math.floor(g);
  const u = g - i;
  const a = pts[i]!;
  const b = pts[i + 1]!;
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
};

interface Blade {
  spine: V[];
  nor: V[];
  ws: number[];
  left: V[];
  right: V[];
  tip: V;
}

/** A blade from a cubic spine and a width profile (shared by drawing and, later, effects). */
export function makeBlade(p: readonly V[], w: (s: number) => number, n = 32): Blade {
  const b: Blade = { spine: [], nor: [], ws: [], left: [], right: [], tip: p[3]! };
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const a = cub(p, Math.max(0, s - 0.01));
    const c = cub(p, Math.min(1, s + 0.01));
    const m = cub(p, s);
    const tx = c[0] - a[0];
    const ty = c[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    const nx = -ty / l;
    const ny = tx / l;
    const ww = w(s);
    b.spine.push(m);
    b.nor.push([nx, ny]);
    b.ws.push(ww);
    b.left.push([m[0] - nx * ww, m[1] - ny * ww]);
    b.right.push([m[0] + nx * ww, m[1] + ny * ww]);
  }
  b.tip = b.spine[n]!;
  return b;
}

// ---- shared parts ----

const gem = (x: number, y: number, s: number, c: string): string =>
  `<path d="M${f(x)} ${f(y - s)} L${f(x + s * 0.85)} ${f(y)} L${f(x)} ${f(y + s)} L${f(x - s * 0.85)} ${f(y)}Z" fill="${c}" ${ink(2.4)}/><path d="M${f(x - s * 0.3)} ${f(y - s * 0.5)} L${f(x + s * 0.1)} ${f(y - s * 0.75)}" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>`;

function pommel(x: number, y: number, ri: number, l: RarityLook, rr = 6): string {
  const base = `<circle cx="${f(x)}" cy="${f(y)}" r="${f(rr + Math.min(ri, 4) * 0.8)}" fill="${ri === 6 ? '#4a4f5e' : l.acc}" ${ink(3)}/>`;
  return l.gem && ri >= 1
    ? `${base}<circle cx="${f(x)}" cy="${f(y)}" r="${f(rr * 0.5 + Math.min(ri, 3) * 0.4)}" fill="${l.gem}" ${ink(1.4)}/>`
    : base;
}

const ribbon = (x: number, y: number, ri: number, l: RarityLook): string =>
  ri >= 3
    ? `<path d="M${f(x)} ${f(y)} C${f(x - 5)} ${f(y + 10)} ${f(x + 6)} ${f(y + 15)} ${f(x - 2)} ${f(y + 22)} M${f(x + 4)} ${f(y)} C${f(x + 10)} ${f(y + 8)} ${f(x + 2)} ${f(y + 15)} ${f(x + 10)} ${f(y + 21)}" fill="none" stroke="${ri === 6 ? l.gem : '#d8322e'}" stroke-width="5" stroke-linecap="round"/>`
    : '';

const SPOTS: readonly V[] = [
  [150, 50],
  [40, 110],
  [120, 160],
  [176, 120],
  [86, 50],
  [56, 196],
];
function twinkles(ri: number, spots: readonly V[] = SPOTS): string {
  const n = [0, 0, 2, 3, 4, 5, 6][ri] ?? 0;
  return spots
    .slice(0, n)
    .map(
      ([x, y], i) =>
        `<path class="bi-art-tw" style="animation-delay:${f(i * 0.33)}s" d="M${x} ${y - 7} L${x + 2} ${y - 2} L${x + 7} ${y} L${x + 2} ${y + 2} L${x} ${y + 7} L${x - 2} ${y + 2} L${x - 7} ${y} L${x - 2} ${y - 2}Z" fill="#fff"/>`,
    )
    .join('');
}

/** Void: dark shards orbiting the item. */
function orbit(ri: number, l: RarityLook): string {
  if (ri !== 6) return '';
  const shards = [0, 1, 2, 3, 4]
    .map((i) => {
      const a = i * 1.256;
      const x = 110 + Math.cos(a) * 74;
      const y = 120 + Math.sin(a) * 74;
      return `<path d="M${f(x)} ${f(y - 7)} L${f(x + 5)} ${f(y)} L${f(x)} ${f(y + 7)} L${f(x - 5)} ${f(y)}Z" fill="#3a3f4a" ${ink(2)}/><path d="M${f(x)} ${f(y - 7)} L${f(x + 5)} ${f(y)} L${f(x)} ${f(y)}Z" fill="${l.gem}" opacity=".8"/>`;
    })
    .join('');
  return `<g class="bi-art-orbit">${shards}</g>`;
}

/** Exotic: a floating ring around a point. */
const ring = (
  x: number,
  y: number,
  ri: number,
  l: RarityLook,
  rx = 26,
  ry = 9,
  rot = -30,
): string =>
  ri === 5
    ? `<g transform="rotate(${rot} ${f(x)} ${f(y)})"><ellipse cx="${f(x)}" cy="${f(y)}" rx="${rx}" ry="${ry}" fill="none" stroke="${l.acc}" stroke-width="3"/><ellipse cx="${f(x)}" cy="${f(y)}" rx="${rx}" ry="${ry}" fill="none" ${ink(1.2)}/></g>`
    : '';

/** Mythic+: small glowing runes along a line of points. */
function runes(pts: readonly V[], ri: number, l: RarityLook): string {
  if (ri < 4 || !l.gem) return '';
  return pts
    .map(
      ([x, y], i) =>
        `<path class="bi-art-glow" style="animation-delay:${f(i * 0.3)}s" d="M${f(x - 3)} ${f(y)} l3 -4 3 4 -3 4Z" fill="${l.gem}" ${ink(1.3)}/>`,
    )
    .join('');
}

/** Void: glowing cracks at points. */
function cracks(pts: readonly V[], ri: number, l: RarityLook): string {
  if (ri !== 6) return '';
  return pts
    .map(
      ([x, y]) =>
        `<path class="bi-art-glow" d="M${f(x - 5)} ${f(y + 2)} l4 -3 3 4 5 -4" fill="none" stroke="${l.gem}" stroke-width="1.6"/>`,
    )
    .join('');
}

function steelOf(ri: number, wood = false): [string, string, string] {
  if (ri === 6) return ['#4a4f5e', '#262a36', '#b8c0d4'];
  if (wood)
    return ri >= 3
      ? [LOOK[ORDER[ri]!].acc, LOOK[ORDER[ri]!].acc2, '#fff6c8']
      : ['#9a6236', '#5e3a1c', '#d39a64'];
  return ['#e3e9f0', '#98a4b4', '#ffffff'];
}

/** A shaded blade: serrated from Legendary, a crystal edge from Mythic, runes and cracks. */
function bladeSvg(
  geo: Blade,
  ri: number,
  l: RarityLook,
  o: {
    wood?: boolean;
    smooth?: boolean;
    nofuller?: boolean;
    metal?: readonly [string, string, string];
  } = {},
): string {
  const [c0, c1, c2] = o.metal ?? steelOf(ri, o.wood);
  let left = geo.left.slice();
  let right = geo.right.slice();
  if (ri >= 3 && !o.smooth)
    left = left.map((p, i) =>
      i > 3 && i < left.length - 5 && i % 3 === 0
        ? [p[0] - geo.nor[i]![0] * 4, p[1] - geo.nor[i]![1] * 4]
        : p,
    );
  if (ri >= 4 && !o.smooth)
    right = right.map((p, i) =>
      i > 4 && i < right.length - 6 && i % 4 === 2
        ? [p[0] + geo.nor[i]![0] * 4.5, p[1] + geo.nor[i]![1] * 4.5]
        : p,
    );
  const g = [
    `<path d="${PATH([...left, ...right.slice().reverse()])}" fill="${c0}" ${ink(3.2)}/>`,
    `<path d="${PATH([...geo.spine, ...right.slice().reverse()])}" fill="${c1}" opacity=".9"/>`,
    `<path d="${PATH(
      geo.left
        .slice(1, -3)
        .map((p, i) => [p[0] + geo.nor[i + 1]![0] * 3, p[1] + geo.nor[i + 1]![1] * 3] as V),
      false,
    )}" fill="none" stroke="${c2}" stroke-width="2.2" stroke-linecap="round"/>`,
  ];
  if (ri >= 1 && !o.nofuller)
    g.push(
      `<path d="${PATH(geo.spine.slice(3, Math.round(geo.spine.length * 0.72)), false)}" fill="none" stroke="${ri >= 3 ? l.acc : c1}" stroke-width="${ri >= 3 ? 3.2 : 2.4}" stroke-linecap="round"/>`,
    );
  g.push(
    runes(
      [0.18, 0.32, 0.46, 0.6].map((t) => lerpPt(geo.spine, t)),
      ri,
      l,
    ),
  );
  g.push(
    cracks(
      [0.3, 0.52, 0.7].map((t) => lerpPt(geo.spine, t)),
      ri,
      l,
    ),
  );
  return g.join('');
}

// ---- hafted tools share one handle ----

const HAND = { a: [54, 204] as V, b: [124, 66] as V };
const handVec = (): { ux: number; uy: number; nx: number; ny: number } => {
  const dx = HAND.b[0] - HAND.a[0];
  const dy = HAND.b[1] - HAND.a[1];
  const len = Math.hypot(dx, dy);
  return { ux: dx / len, uy: dy / len, nx: -dy / len, ny: dx / len };
};

function handle(ri: number, l: RarityLook, len = 1): string {
  const { ux, uy, nx, ny } = handVec();
  const a = HAND.a;
  const b: V = [
    HAND.a[0] + (HAND.b[0] - HAND.a[0]) * len,
    HAND.a[1] + (HAND.b[1] - HAND.a[1]) * len,
  ];
  const w = ri >= 3 ? 5 : 4.2;
  const wood = ri === 6 ? '#22252c' : ri >= 3 ? '#6a3a1e' : '#8a5a32';
  let s = `<path d="${PATH([
    [a[0] + nx * w, a[1] + ny * w],
    [b[0] + nx * w, b[1] + ny * w],
    [b[0] - nx * w, b[1] - ny * w],
    [a[0] - nx * w, a[1] - ny * w],
  ])}" fill="${wood}" ${ink(3)}/>`;
  s += `<path d="M${f(a[0] + nx * (w - 2))} ${f(a[1] + ny * (w - 2))} L${f(b[0] + nx * (w - 2))} ${f(b[1] + ny * (w - 2))}" stroke="${ri === 6 ? '#3a3f4a' : '#b47a4a'}" stroke-width="1.6" opacity=".8"/>`;
  if (ri >= 1)
    for (let i = 0; i < 4; i++) {
      const t = 0.06 + i * 0.045;
      const x = a[0] + (b[0] - a[0]) * t;
      const y = a[1] + (b[1] - a[1]) * t;
      s += `<path d="M${f(x + nx * w)} ${f(y + ny * w)} L${f(x + ux * 4 - nx * w)} ${f(y + uy * 4 - ny * w)}" stroke="${ri >= 3 ? l.acc : '#c8a070'}" stroke-width="2.2"/>`;
    }
  s += `<circle cx="${a[0]}" cy="${a[1]}" r="${ri >= 2 ? 6 : 4.6}" fill="${ri === 6 ? '#4a4f5e' : ri >= 2 ? l.acc : '#6a6f78'}" ${ink(2.6)}/>`;
  if (l.gem && ri >= 2) s += `<circle cx="${a[0]}" cy="${a[1]}" r="2.6" fill="${l.gem}"/>`;
  return s;
}

/** A point on the tool head frame: `a` along the handle, `b` across it, from the handle top. */
const headPt = (a: number, b: number, k = 1): V => {
  const { ux, uy, nx, ny } = handVec();
  const t = HAND.b;
  return [t[0] + ux * a * k + nx * b * k, t[1] + uy * a * k + ny * b * k];
};
const TOOL_SPOTS: readonly V[] = [
  [40, 60],
  [170, 150],
  [120, 190],
  [60, 120],
  [180, 40],
  [100, 40],
];

// ---- the items ----

type Draw = (ri: number, l: RarityLook) => string;

/** Ember Blade (the reference sword from the item ladder). */
const sword: Draw = (ri, l) => {
  const gx = 68;
  const gy = 172;
  const tx = 162;
  const ty = 22;
  const len = Math.hypot(tx - gx, ty - gy);
  const ux = (tx - gx) / len;
  const uy = (ty - gy) / len;
  const nx = -uy;
  const ny = ux;
  const along = (s: number, off = 0): V => [
    gx + ux * len * s + nx * off,
    gy + uy * len * s + ny * off,
  ];
  const steel = steelOf(ri);
  const hw = 10 + (ri >= 3 ? 2 : 0) + (ri >= 5 ? 1 : 0);
  const left: V[] = [];
  const right: V[] = [];
  for (let i = 0; i <= 24; i++) {
    const s = i / 24;
    const w = s < 0.82 ? hw : (hw * (1 - s)) / 0.18;
    let a = along(s, -w);
    let b = along(s, w);
    if (ri >= 3 && s > 0.1 && s < 0.78 && i % 3 === 0) a = along(s, -(hw + 4));
    if (ri >= 4 && s > 0.15 && s < 0.78 && i % 4 === 2) b = along(s, hw + 5);
    left.push(a);
    right.push(b);
  }
  let outline: V[] = [...left, ...right.slice().reverse()];
  if (ri >= 5) {
    const l2 = left.slice(0, -3);
    const r2 = right.slice(0, -3).reverse();
    outline = [
      ...l2,
      along(0.9, -(hw + 1)),
      along(1.05, -7),
      along(0.92, 0),
      along(1.05, 7),
      along(0.9, hw + 1),
      ...r2,
    ];
  }
  const g: string[] = [
    `<path d="${PATH(outline)}" fill="${steel[0]}" ${ink(3.2)}/>`,
    `<path d="${PATH([...right.slice().reverse(), along(0.98, 0), along(0, 0)])}" fill="${steel[1]}" opacity=".9"/>`,
    `<path d="M${along(0.04, -hw + 3)
      .map(f)
      .join(' ')} L${along(0.8, -hw + 3)
      .map(f)
      .join(' ')}" stroke="${steel[2]}" stroke-width="2.4" stroke-linecap="round"/>`,
  ];
  if (ri >= 1)
    g.push(
      `<path d="M${along(0.08).map(f).join(' ')} L${along(0.72).map(f).join(' ')}" stroke="${ri >= 3 ? l.acc : steel[1]}" stroke-width="${ri >= 3 ? 3.4 : 2.6}" stroke-linecap="round"/>`,
    );
  g.push(
    runes(
      [0.14, 0.26, 0.38, 0.5, 0.62].map((s) => along(s)),
      ri,
      l,
    ),
  );
  g.push(
    cracks(
      [
        [0.3, -4],
        [0.5, 3],
        [0.62, -2],
      ].map(([s, o]) => along(s!, o!)),
      ri,
      l,
    ),
  );
  const gp = along;
  let guard: V[];
  if (ri === 0) guard = [gp(-0.02, -24), gp(0.02, -24), gp(0.02, 24), gp(-0.02, 24)];
  else if (ri === 1)
    guard = [
      gp(-0.03, -26),
      gp(0.01, -30),
      gp(0.04, -24),
      gp(0.04, 24),
      gp(0.01, 30),
      gp(-0.03, 26),
    ];
  else if (ri === 2)
    guard = [
      gp(-0.04, -22),
      gp(0.06, -36),
      gp(0.03, -24),
      gp(0.05, 0),
      gp(0.03, 24),
      gp(0.06, 36),
      gp(-0.04, 22),
    ];
  else
    guard = [
      gp(-0.05, -20),
      gp(0.1, -42),
      gp(0.05, -30),
      gp(0.09, -20),
      gp(0.04, -10),
      gp(0.06, 0),
      gp(0.04, 10),
      gp(0.09, 20),
      gp(0.05, 30),
      gp(0.1, 42),
      gp(-0.05, 20),
    ];
  if (ri === 6)
    g.push(
      `<path d="${PATH([gp(-0.05, -30), gp(0.05, -40), gp(0.03, -14), gp(-0.05, -12)])}" fill="#2a2e38" ${ink(3)}/><path d="${PATH([gp(-0.05, 30), gp(0.05, 40), gp(0.03, 14), gp(-0.05, 12)])}" fill="#2a2e38" ${ink(3)}/>`,
    );
  else
    g.push(
      `<path d="${PATH(guard)}" fill="${l.acc}" ${ink(3.2)}/>`,
      `<path d="M${gp(0, -18).map(f).join(' ')} L${gp(0, 18).map(f).join(' ')}" stroke="${l.acc2}" stroke-width="3" stroke-linecap="round"/>`,
    );
  g.push(ring(...gp(0.03), ri, l, 26, 9, (Math.atan2(ny, nx) * 180) / Math.PI));
  if (l.gem && ri >= 2) g.push(gem(...gp(0.03), 8, l.gem));
  g.push(
    `<path d="${PATH([gp(-0.05, -6), gp(-0.2, -5), gp(-0.2, 5), gp(-0.05, 6)])}" fill="${l.grip}" ${ink(3)}/>`,
  );
  if (ri >= 1)
    for (let i = 0; i < 4; i++)
      g.push(
        `<path d="M${gp(-0.07 - i * 0.035, -5.5)
          .map(f)
          .join(' ')} L${gp(-0.085 - i * 0.035, 5.5)
          .map(f)
          .join(' ')}" stroke="${ri >= 3 ? l.acc : '#9a6a4a'}" stroke-width="2"/>`,
      );
  const [px, py] = gp(-0.235);
  g.push(pommel(px, py, ri, l, 7), ribbon(px, py + 8, ri, l), orbit(ri, l), twinkles(ri));
  return g.join('');
};

const SCIM = makeBlade(
  [
    [72, 162],
    [66, 106],
    [102, 48],
    [162, 26],
  ],
  (s) => (s < 0.82 ? 5.5 + 9 * Math.pow(s / 0.82, 1.4) : 14.5 * Math.pow((1 - s) / 0.18, 0.8)),
);
function scimitar(ri: number, l: RarityLook): string {
  const p0 = SCIM.spine[0]!;
  const n = SCIM.nor[0]!;
  const u: V = [n[1], -n[0]];
  const at = (back: number, side: number): V => [
    p0[0] - u[0] * back + n[0] * side,
    p0[1] - u[1] * back + n[1] * side,
  ];
  const g = [
    `<path d="${PATH([at(4, 4.5), at(40, 4), at(40, -4), at(4, -4.5)])}" fill="${l.grip}" ${ink(3)}/>`,
  ];
  if (ri >= 1)
    for (let i = 1; i < 5; i++)
      g.push(
        `<path d="M${at(4 + i * 8, 4.5)
          .map(f)
          .join(' ')} L${at(8 + i * 8, -4.5)
          .map(f)
          .join(' ')}" stroke="${ri >= 3 ? l.acc : '#9a6a4a'}" stroke-width="2"/>`,
      );
  g.push(bladeSvg(SCIM, ri, l));
  g.push(
    `<path d="${PATH([at(-3, -24), at(-1, -28), at(4, -26), at(5, 26), at(-1, 28), at(-3, 24)])}" fill="${ri === 6 ? '#4a4f5e' : l.acc}" ${ink(3.2)}/>`,
  );
  if (l.gem && ri >= 2) g.push(gem(p0[0] + u[0], p0[1] + u[1], 5.5, l.gem));
  const pe = at(45, 0);
  g.push(pommel(pe[0], pe[1], ri, l, 5), ribbon(pe[0], pe[1] + 4, ri, l));
  return g.join('');
}
/** Twin storm blades: two scimitars crossed. */
const twinBlades: Draw = (ri, l) =>
  `<g transform="translate(206 4) scale(-1 1) rotate(-6 110 120)">${scimitar(ri, l)}</g><g transform="rotate(4 110 120)">${scimitar(ri, l)}</g>${ring(110, 112, ri, l, 40, 12, -20)}${orbit(ri, l)}${twinkles(ri)}`;

const CLEAVER = makeBlade(
  [
    [74, 160],
    [104, 112],
    [132, 68],
    [160, 24],
  ],
  (s) => (s > 0.84 ? 16 * Math.pow(Math.max(0, 1 - (s - 0.84) / 0.16), 0.55) : 16),
);
/** Dawnblade: a broad greatsword. */
const greatsword: Draw = (ri, l) => {
  const p0 = CLEAVER.spine[0]!;
  const n = CLEAVER.nor[0]!;
  const u: V = [n[1], -n[0]];
  const pt = (back: number, side: number): V => [
    p0[0] - u[0] * back + n[0] * side,
    p0[1] - u[1] * back + n[1] * side,
  ];
  const g = [
    `<path d="${PATH([pt(0, 5), pt(46, 5), pt(46, -5), pt(0, -5)])}" fill="${l.grip}" ${ink(3)}/>`,
  ];
  if (ri >= 1)
    for (let i = 1; i < 5; i++)
      g.push(
        `<path d="M${pt(i * 9, 5)
          .map(f)
          .join(' ')} L${pt(i * 9 + 4, -5)
          .map(f)
          .join(' ')}" stroke="${ri >= 3 ? l.acc : '#9a6a4a'}" stroke-width="2"/>`,
      );
  g.push(bladeSvg(CLEAVER, ri, l));
  const gw = 30 + (ri >= 2 ? 6 : 0);
  g.push(
    `<path d="${PATH([pt(8, -gw), pt(8, gw), pt(-8, gw), pt(-8, -gw)])}" fill="${ri === 6 ? '#4a4f5e' : l.acc}" ${ink(3.2)}/>`,
  );
  if (l.gem && ri >= 2) g.push(gem(p0[0], p0[1], 6, l.gem));
  if (ri >= 3)
    g.push(
      `<path d="M${pt(0, -gw).map(f).join(' ')} L${pt(6, -gw - 6)
        .map(f)
        .join(' ')} M${pt(0, gw).map(f).join(' ')} L${pt(6, gw + 6)
        .map(f)
        .join(' ')}" stroke="${l.acc}" stroke-width="5" stroke-linecap="round"/>`,
    );
  const pe = pt(50, 0);
  g.push(ring(p0[0], p0[1], ri, l, 34, 10, (Math.atan2(n[1], n[0]) * 180) / Math.PI));
  g.push(
    pommel(pe[0], pe[1], ri, l, 6),
    ribbon(pe[0], pe[1] + 4, ri, l),
    orbit(ri, l),
    twinkles(ri),
  );
  return g.join('');
};

const BOW = makeBlade(
  [
    [112, 20],
    [200, 78],
    [200, 162],
    [112, 220],
  ],
  (s) => 2.5 + 5 * Math.sin(Math.PI * s),
);
/** Moon bow (no arrow: bows use the impact hit). */
const bow: Draw = (ri, l) => {
  const g = [
    `<path d="M${BOW.spine[0]!.map(f).join(' ')} L${BOW.tip.map(f).join(' ')}" stroke="#f1e6c8" stroke-width="1.6"/>`,
  ];
  g.push(bladeSvg(BOW, ri, l, { wood: true, smooth: true, nofuller: true }));
  const mid = lerpPt(BOW.spine, 0.5);
  g.push(
    `<rect x="${f(mid[0] - 6)}" y="${f(mid[1] - 13)}" width="12" height="26" rx="3" fill="${l.grip}" ${ink(2.6)}/>`,
  );
  // a crescent moon charm hangs from the grip: the "moon" of the moon bow
  g.push(
    `<path d="M${f(mid[0] - 30)} ${f(mid[1] - 16)} A18 18 0 1 0 ${f(mid[0] - 30)} ${f(mid[1] + 16)} A13 13 0 1 1 ${f(mid[0] - 30)} ${f(mid[1] - 16)}Z" fill="${ri >= 2 ? l.acc : '#e8e2d0'}" ${ink(2.6)}/>`,
  );
  if (l.gem && ri >= 2)
    g.push(
      gem(BOW.spine[0]![0] + 2, BOW.spine[0]![1] + 4, 5, l.gem),
      gem(BOW.tip[0] + 2, BOW.tip[1] - 4, 5, l.gem),
    );
  if (ri >= 3) {
    const a = lerpPt(BOW.spine, 0.2);
    const b = lerpPt(BOW.spine, 0.8);
    g.push(
      `<path d="M${a.map(f).join(' ')} l14 -6 M${b.map(f).join(' ')} l14 6" stroke="${l.acc}" stroke-width="4" stroke-linecap="round"/>`,
    );
  }
  g.push(ring(mid[0], mid[1], ri, l, 30, 10, 80), orbit(ri, l), twinkles(ri));
  return g.join('');
};

const PICK = (() => {
  const { ux, uy, nx, ny } = handVec();
  const t = HAND.b;
  return makeBlade(
    [
      [t[0] - nx * 70 - ux * 20, t[1] - ny * 70 - uy * 20],
      [t[0] - nx * 30 + ux * 14, t[1] - ny * 30 + uy * 14],
      [t[0] + nx * 30 + ux * 14, t[1] + ny * 30 + uy * 14],
      [t[0] + nx * 70 - ux * 20, t[1] + ny * 70 - uy * 20],
    ],
    (s) => 2 + 9.5 * Math.pow(Math.sin(Math.PI * s), 0.75),
  );
})();
const pickaxe: Draw = (ri, l) => {
  const c = lerpPt(PICK.spine, 0.5);
  const g = [handle(ri, l, 0.96), bladeSvg(PICK, ri, l, { nofuller: true, smooth: ri < 3 })];
  g.push(
    `<rect x="${f(c[0] - 8)}" y="${f(c[1] - 8)}" width="16" height="16" rx="4" transform="rotate(26 ${f(c[0])} ${f(c[1])})" fill="${ri === 6 ? '#4a4f5e' : ri >= 3 ? l.acc : '#6a6f78'}" ${ink(3)}/>`,
  );
  if (l.gem && ri >= 2) g.push(gem(c[0], c[1], 5.5, l.gem));
  g.push(
    ribbon(HAND.a[0], HAND.a[1] + 6, ri, l),
    ring(c[0], c[1], ri, l, 30, 10, 26),
    orbit(ri, l),
    twinkles(ri, TOOL_SPOTS),
  );
  return g.join('');
};

const hatchet: Draw = (ri, l) => {
  const t = HAND.b;
  const P2 = (a: number, b: number): V => headPt(a, b, 1.25);
  const steel = steelOf(ri);
  const head = [
    P2(-2, 4),
    P2(14, 4),
    P2(28, 30),
    ...(ri >= 3 ? [P2(20, 42), P2(-4, 54), P2(-30, 44)] : [P2(8, 44), P2(-14, 46)]),
    P2(-24, 26),
    P2(-14, 4),
  ];
  const g = [handle(ri, l)];
  g.push(`<path d="${PATH(head)}" fill="${steel[0]}" ${ink(3.2)}/>`);
  g.push(
    `<path d="${PATH([P2(6, 26), P2(28, 30), ...(ri >= 3 ? [P2(20, 42), P2(-4, 54)] : [P2(8, 44)]), P2(-8, 30)])}" fill="${steel[1]}" opacity=".9"/>`,
  );
  g.push(
    `<path d="${PATH(ri >= 3 ? [P2(26, 34), P2(18, 44), P2(-4, 52), P2(-26, 44)] : [P2(26, 34), P2(8, 42), P2(-12, 44)], false)}" fill="none" stroke="${ri === 6 ? (l.gem ?? '#fff') : '#ffffff'}" stroke-width="2.4" stroke-linecap="round"/>`,
  );
  if (ri >= 4)
    g.push(
      `<path d="${PATH([P2(-2, -4), P2(10, -4), P2(18, -22), P2(-12, -26)])}" fill="${steel[0]}" ${ink(3)}/>`,
    );
  g.push(
    `<rect x="${f(t[0] - 9)}" y="${f(t[1] - 9)}" width="18" height="18" rx="4" transform="rotate(26 ${t[0]} ${t[1]})" fill="${ri === 6 ? '#3a3f4a' : ri >= 2 ? l.acc : '#6a6f78'}" ${ink(3)}/>`,
  );
  if (l.gem && ri >= 2) g.push(gem(t[0], t[1], 5.5, l.gem));
  if (ri >= 3)
    g.push(
      `<path d="${PATH([P2(-10, 16), P2(4, 14), P2(10, 30)], false)}" fill="none" stroke="${l.acc}" stroke-width="3" stroke-linecap="round"/>`,
      ribbon(HAND.a[0], HAND.a[1] + 6, ri, l),
    );
  g.push(
    runes(
      [0, 1, 2].map((i) => P2(-6 + i * 6, 34 + i * 2)),
      ri,
      l,
    ),
    ring(t[0], t[1], ri, l, 30, 10, 26),
    orbit(ri, l),
    twinkles(ri, TOOL_SPOTS),
  );
  return g.join('');
};

/** A leaf shape pointing from (x, y) at angle a. */
const leaf = (x: number, y: number, s: number, a: number, c: string): string =>
  `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(a)})"><path d="M0 0 C${f(s * 0.4)} ${f(-s * 0.5)} ${f(s * 1.2)} ${f(-s * 0.5)} ${f(s * 1.6)} 0 C${f(s * 1.2)} ${f(s * 0.5)} ${f(s * 0.4)} ${f(s * 0.5)} 0 0Z" fill="${c}" ${ink(2.2)}/><path d="M${f(s * 0.2)} 0 L${f(s * 1.3)} 0" stroke="#2a7a2e" stroke-width="1.4"/></g>`;

/** Sapling staff: a shaft that sprouts leaves; more leaves and a glowing bud with rarity. */
const staff: Draw = (ri, l) => {
  const a: V = [92, 226];
  const b: V = [114, 66];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const nx = -dy / len;
  const ny = dx / len;
  const wood = ri === 6 ? '#2a2e38' : ri >= 3 ? '#7a4a24' : '#9a6a3a';
  const w = 6;
  const at = (t: number, o = 0): V => [a[0] + dx * t + nx * o, a[1] + dy * t + ny * o];
  const g = [
    `<path d="M${f(a[0] - nx * w)} ${f(a[1] - ny * w)} C${f(at(0.4, -w - 3)[0])} ${f(at(0.4, -w - 3)[1])} ${f(at(0.7, -w + 2)[0])} ${f(at(0.7, -w + 2)[1])} ${f(b[0] - nx * w)} ${f(b[1] - ny * w)} L${f(b[0] + nx * w)} ${f(b[1] + ny * w)} C${f(at(0.7, w + 2)[0])} ${f(at(0.7, w + 2)[1])} ${f(at(0.4, w - 3)[0])} ${f(at(0.4, w - 3)[1])} ${f(a[0] + nx * w)} ${f(a[1] + ny * w)}Z" fill="${wood}" ${ink(3)}/>`,
    `<path d="M${at(0.05, -2).map(f).join(' ')} L${at(0.95, -2).map(f).join(' ')}" stroke="${ri === 6 ? '#4a4f5e' : '#c8955a'}" stroke-width="1.8" opacity=".8"/>`,
  ];
  if (ri >= 1)
    for (const t of ri >= 3 ? [0.3, 0.55, 0.78] : [0.55])
      g.push(
        `<path d="M${at(t, -w - 1)
          .map(f)
          .join(' ')} L${at(t, w + 1)
          .map(f)
          .join(' ')}" stroke="${INK}" stroke-width="5.6" stroke-linecap="round"/><path d="M${at(
          t,
          -w - 1,
        )
          .map(f)
          .join(' ')} L${at(t, w + 1)
          .map(f)
          .join(
            ' ',
          )}" stroke="${ri >= 3 ? l.acc : '#6a6f78'}" stroke-width="3" stroke-linecap="round"/>`,
      );
  const leafC = ri === 6 ? (l.gem ?? '#9a6aff') : ri >= 4 ? '#7af0a0' : '#5fd35a';
  const count = [3, 4, 5, 6, 7, 8, 8][ri] ?? 3;
  for (let i = 0; i < count; i++) {
    const t = 0.92 - (i % 4) * 0.06;
    const side = i % 2 ? 1 : -1;
    const [x, y] = at(t, side * 4);
    g.push(leaf(x, y, 14 + (i % 3) * 3, -70 + side * (40 + i * 9), leafC));
  }
  g.push(
    `<circle cx="${b[0]}" cy="${b[1] - 4}" r="${ri >= 2 ? 9 : 6}" fill="${l.gem ?? '#a6e07a'}" ${ink(2.6)}/><circle cx="${b[0] - 3}" cy="${b[1] - 7}" r="2.4" fill="#fff" opacity=".85"/>`,
  );
  if (ri >= 2)
    g.push(
      `<g class="bi-art-glow"><circle cx="${b[0]}" cy="${b[1] - 4}" r="16" fill="${l.gem ?? '#a6e07a'}" opacity=".3"/></g>`,
    );
  g.push(
    ribbon(...at(0.36, w), ri, l),
    runes(
      [0.22, 0.4, 0.62].map((t) => at(t)),
      ri,
      l,
    ),
    cracks(
      [0.3, 0.5].map((t) => at(t)),
      ri,
      l,
    ),
  );
  g.push(ring(b[0], b[1] - 4, ri, l, 24, 8, -10), orbit(ri, l), twinkles(ri));
  return g.join('');
};

/** A hammer head across the top of the handle; `stone` makes it a rock with crystals. */
function hammer(ri: number, l: RarityLook, stone: boolean): string {
  const H = (a: number, b: number): V => headPt(a, b);
  const g = [handle(ri, l, 0.92)];
  const face = stone
    ? ri === 6
      ? '#3a3f4a'
      : '#8a909c'
    : ri === 6
      ? '#2a2e38'
      : ri >= 3
        ? '#8a5228'
        : '#a0683a';
  const shade = stone ? (ri === 6 ? '#22252e' : '#5c626e') : ri === 6 ? '#16181e' : '#6a3e1c';
  const body = stone
    ? [
        H(-24, -38),
        H(-4, -46),
        H(22, -40),
        H(30, -14),
        H(28, 16),
        H(22, 40),
        H(-2, 46),
        H(-24, 36),
        H(-30, 4),
      ]
    : [H(-22, -40), H(22, -40), H(22, 40), H(-22, 40)];
  g.push(`<path d="${PATH(body)}" fill="${face}" ${ink(3.4)}/>`);
  g.push(
    `<path d="${PATH(stone ? [H(4, -42), H(22, -40), H(30, -14), H(28, 16), H(22, 40), H(4, 44)] : [H(4, -40), H(22, -40), H(22, 40), H(4, 40)])}" fill="${shade}" opacity=".85"/>`,
  );
  if (!stone) {
    // end grain rings and metal bands
    for (const side of [-1, 1]) {
      const [x, y] = H(0, side * 40);
      g.push(
        `<ellipse cx="${f(x)}" cy="${f(y)}" rx="12" ry="5" transform="rotate(-37 ${f(x)} ${f(y)})" fill="#d8a46a" ${ink(2.4)}/><ellipse cx="${f(x)}" cy="${f(y)}" rx="6" ry="2.4" transform="rotate(-37 ${f(x)} ${f(y)})" fill="none" stroke="#8a5228" stroke-width="1.4"/>`,
      );
    }
    if (ri >= 1)
      for (const b of ri >= 3 ? [-28, 28] : [-28])
        g.push(
          `<path d="${PATH([H(-23, b - 4), H(23, b - 4), H(23, b + 4), H(-23, b + 4)])}" fill="${ri >= 3 ? l.acc : '#8d939c'}" ${ink(2.4)}/>`,
        );
  } else {
    // crystals growing out of the geode, more with rarity
    const n = [2, 3, 4, 5, 6, 7, 7][ri] ?? 2;
    const crys = ri === 6 ? '#9a6aff' : '#c8a8ff';
    for (let i = 0; i < n; i++) {
      const b = -30 + (i * 60) / Math.max(1, n - 1);
      const [x, y] = H(20 + (i % 2) * 4, b);
      const h = 18 + (i % 3) * 6;
      const { ux, uy, nx, ny } = handVec();
      const tip: V = [x + ux * h, y + uy * h];
      g.push(
        `<path d="${PATH([
          [x + nx * 5, y + ny * 5],
          [tip[0] + nx * 4, tip[1] + ny * 4],
          [tip[0] + ux * 6, tip[1] + uy * 6],
          [tip[0] - nx * 4, tip[1] - ny * 4],
          [x - nx * 5, y - ny * 5],
        ])}" fill="${crys}" ${ink(2.4)}/><path d="M${f(x)} ${f(y)} L${f(tip[0] + ux * 6)} ${f(tip[1] + uy * 6)}" stroke="#fff" stroke-width="1.4" opacity=".6"/>`,
      );
    }
  }
  if (l.gem && ri >= 2) g.push(gem(...H(0, 0), 7, l.gem));
  if (ri >= 5 && !stone)
    g.push(
      `<path d="${PATH([H(-10, -40), H(0, -54), H(10, -40)])} ${PATH([H(-10, 40), H(0, 54), H(10, 40)])}" fill="${l.acc}" ${ink(2.6)}/>`,
    );
  g.push(
    ribbon(HAND.a[0], HAND.a[1] + 6, ri, l),
    runes(
      [-18, -6, 6, 18].map((b) => H(10, b)),
      ri,
      l,
    ),
    cracks([H(-8, -20), H(6, 18)], ri, l),
  );
  g.push(ring(...H(0, 0), ri, l, 44, 12, 53), orbit(ri, l), twinkles(ri, TOOL_SPOTS));
  return g.join('');
}

/** Cutting chisel: a short handle, a ferrule and a flat steel blade. */
const chisel: Draw = (ri, l) => {
  const a: V = [62, 206];
  const m: V = [102, 136];
  const tip: V = [146, 60];
  const dx = tip[0] - a[0];
  const dy = tip[1] - a[1];
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const off = (p: V, o: number, s = 0): V => [p[0] + nx * o + ux * s, p[1] + ny * o + uy * s];
  const steel = steelOf(ri);
  const wood = ri === 6 ? '#22252c' : ri >= 3 ? l.grip : '#9a6236';
  const g = [
    `<path d="${PATH([off(a, -9), off(m, -10), off(m, 10), off(a, 9)])}" fill="${wood}" ${ink(3)}/>`,
    `<path d="M${off(a, -5).map(f).join(' ')} L${off(m, -6).map(f).join(' ')}" stroke="#c8955a" stroke-width="1.8" opacity=".7"/>`,
    `<path d="${PATH([off(m, -12, -4), off(m, -12, 10), off(m, 12, 10), off(m, 12, -4)])}" fill="${ri === 6 ? '#4a4f5e' : ri >= 2 ? l.acc : '#8d939c'}" ${ink(3)}/>`,
    `<path d="${PATH([off(m, -7, 10), off(tip, -13), off(tip, 13), off(m, 7, 10)])}" fill="${steel[0]}" ${ink(3.2)}/>`,
    `<path d="${PATH([off(m, 0, 10), off(tip, 0), off(tip, 13), off(m, 7, 10)])}" fill="${steel[1]}" opacity=".9"/>`,
    `<path d="M${off(tip, -12).map(f).join(' ')} L${off(tip, 12).map(f).join(' ')}" stroke="${steel[2]}" stroke-width="2.6" stroke-linecap="round"/>`,
  ];
  if (l.gem && ri >= 2) g.push(gem(...off(m, 0, 3), 5.5, l.gem));
  if (ri >= 3)
    g.push(
      `<path d="M${off(m, -4, 16).map(f).join(' ')} L${off(tip, -6, -10).map(f).join(' ')}" stroke="${l.acc}" stroke-width="3" stroke-linecap="round"/>`,
    );
  if (ri >= 5)
    g.push(
      `<path d="${PATH([off(tip, -13), off(tip, -6, 12), off(tip, 0, 2), off(tip, 6, 12), off(tip, 13)])}" fill="${steel[0]}" ${ink(2.6)}/>`,
    );
  // a cut gem being shaped, below the edge
  g.push(
    `<g transform="translate(160 150)"><path d="M-14 -4 L-6 -14 L6 -14 L14 -4 L0 14Z" fill="${l.gem ?? '#bfe8ff'}" ${ink(2.4)}/><path d="M-14 -4 L14 -4 M-6 -14 L0 14 L6 -14" stroke="${INK}" stroke-width="1" opacity=".5" fill="none"/></g>`,
  );
  g.push(
    ribbon(a[0], a[1] + 4, ri, l),
    runes(
      [0.62, 0.72, 0.82].map((t) => off([a[0] + dx * t, a[1] + dy * t], 0)),
      ri,
      l,
    ),
    cracks([off(m, 0, 30)], ri, l),
  );
  g.push(ring(...m, ri, l, 26, 9, 30), orbit(ri, l), twinkles(ri));
  return g.join('');
};

/** Core gauntlet: an armoured fist holding its core gem in the back of the hand. */
const gauntlet: Draw = (ri, l) => {
  const metal = ri === 6 ? ['#3a3f4a', '#22252e', '#8a92a4'] : ['#c8d0da', '#8a94a4', '#ffffff'];
  const trim = ri === 6 ? '#4a4f5e' : l.acc;
  const g = [
    // cuff
    `<path d="M66 228 L64 176 L142 176 L140 228Z" fill="${metal[1]}" ${ink(3)}/>`,
    `<path d="M64 186 L142 186" stroke="${trim}" stroke-width="5"/><path d="M64 186 L142 186" stroke="${INK}" stroke-width="1" opacity=".5"/>`,
    // back of the hand
    `<path d="M56 178 C50 140 58 104 70 92 L140 92 C152 104 156 140 150 178Z" fill="${metal[0]}" ${ink(3.2)}/>`,
    `<path d="M104 92 L140 92 C152 104 156 140 150 178 L104 178Z" fill="${metal[1]}" opacity=".8"/>`,
  ];
  // four finger plates curled over the top
  for (let i = 0; i < 4; i++) {
    const x = 68 + i * 19;
    g.push(
      `<path d="M${x} 96 C${x} 70 ${x + 18} 70 ${x + 18} 96Z" fill="${metal[0]}" ${ink(2.8)}/><path d="M${x + 3} 84 C${x + 5} 76 ${x + 12} 75 ${x + 15} 80" stroke="${metal[2]}" stroke-width="1.6" fill="none"/>`,
    );
    if (ri >= 3)
      g.push(
        `<path d="M${x + 5} 74 L${x + 9} ${ri >= 5 ? 58 : 64} L${x + 13} 74Z" fill="${trim}" ${ink(2.2)}/>`,
      );
  }
  // thumb
  g.push(
    `<path d="M56 150 C40 146 34 126 44 116 C52 110 62 118 64 130Z" fill="${metal[0]}" ${ink(2.8)}/>`,
  );
  if (ri >= 1)
    g.push(
      `<path d="M62 106 L144 106" stroke="${trim}" stroke-width="4"/><path d="M62 106 L144 106" stroke="${INK}" stroke-width="1" opacity=".5"/>`,
    );
  // the core
  const core = l.gem ?? '#8a6adf';
  g.push(
    `<g class="bi-art-glow"><circle cx="104" cy="138" r="${ri >= 2 ? 26 : 18}" fill="${core}" opacity=".35"/></g>`,
  );
  g.push(
    `<circle cx="104" cy="138" r="${16 + Math.min(ri, 4)}" fill="${trim}" ${ink(3)}/><circle cx="104" cy="138" r="${11 + Math.min(ri, 4) * 0.6}" fill="${core}" ${ink(2.4)}/><circle cx="99" cy="133" r="3.4" fill="#fff" opacity=".85"/>`,
  );
  g.push(
    runes(
      [
        [72, 160],
        [136, 160],
        [72, 122],
        [136, 122],
      ],
      ri,
      l,
    ),
    cracks(
      [
        [78, 150],
        [132, 130],
      ],
      ri,
      l,
    ),
    ribbon(140, 196, ri, l),
  );
  g.push(ring(104, 138, ri, l, 40, 12, -10), orbit(ri, l), twinkles(ri));
  return g.join('');
};

/** Bulwark: a heater shield with a boss; trims, emblem, wings and cracks with rarity. */
const shield: Draw = (ri, l) => {
  const outer = 'M110 26 L172 46 L168 128 C162 176 136 202 110 218 C84 202 58 176 52 128 L48 46Z';
  const inner = 'M110 40 L160 56 L156 128 C150 168 130 190 110 202 C90 190 70 168 64 128 L60 56Z';
  const metal = ri === 6 ? ['#3a3f4a', '#22252e'] : ['#d8dee8', '#98a4b4'];
  const rimC = ri === 6 ? '#4a4f5e' : l.acc;
  const g: string[] = [];
  if (ri >= 5)
    g.push(
      `<path d="M52 80 C26 66 12 80 8 104 C20 98 28 100 34 104 C22 112 20 126 22 138 C32 128 42 126 50 128Z M168 80 C194 66 208 80 212 104 C200 98 192 100 186 104 C198 112 200 126 198 138 C188 128 178 126 170 128Z" fill="${ri === 6 ? '#2a2e38' : '#f0f4ff'}" ${ink(3)}/>`,
    );
  g.push(
    `<path d="${outer}" fill="${rimC}" ${ink(3.4)}/>`,
    `<path d="${inner}" fill="${metal[0]}" ${ink(2.4)}/>`,
  );
  g.push(
    `<path d="M110 40 L160 56 L156 128 C150 168 130 190 110 202Z" fill="${metal[1]}" opacity=".7"/>`,
  );
  g.push(
    `<path d="M66 60 L106 46" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>`,
  );
  // rivets on the rim
  for (const [x, y] of [
    [60, 52],
    [160, 52],
    [56, 126],
    [164, 126],
    [110, 210],
  ] as V[])
    g.push(
      `<circle cx="${x}" cy="${y}" r="3" fill="${ri === 6 ? '#8a92a4' : '#ffffff'}" ${ink(1.4)}/>`,
    );
  if (ri >= 3)
    g.push(
      `<path d="M110 50 L110 194 M70 110 L150 110" stroke="${INK}" stroke-width="9" stroke-linecap="round"/><path d="M110 50 L110 194 M70 110 L150 110" stroke="${l.acc}" stroke-width="5" stroke-linecap="round"/>`,
    );
  g.push(`<circle cx="110" cy="110" r="${15 + Math.min(ri, 3) * 2}" fill="${rimC}" ${ink(3)}/>`);
  if (l.gem && ri >= 1) g.push(gem(110, 110, 7 + Math.min(ri, 3), l.gem));
  g.push(
    runes(
      [
        [82, 82],
        [138, 82],
        [82, 150],
        [138, 150],
      ],
      ri,
      l,
    ),
    cracks(
      [
        [86, 90],
        [132, 150],
        [100, 170],
      ],
      ri,
      l,
    ),
    ribbon(104, 214, ri, l),
  );
  g.push(ring(110, 120, ri, l, 66, 16, -8), orbit(ri, l), twinkles(ri));
  return g.join('');
};

const DRAW: Record<string, Draw> = {
  sword,
  shield,
  twin_blades: twinBlades,
  greatsword,
  hatchet,
  staff,
  maul: (ri, l) => hammer(ri, l, false),
  bow,
  pickaxe,
  chisel,
  geode_hammer: (ri, l) => hammer(ri, l, true),
  gauntlet,
};

/** The item's SVG body for a card art window, in a box that fits the landscape window. */
export function itemVector(kind: string, rarity: Rarity): string {
  const draw = DRAW[kind];
  if (!draw) return '';
  const ri = ORDER.indexOf(rarity);
  return `<g class="bi-item">${draw(ri, LOOK[rarity])}</g>`;
}

/** viewBox for item art: the 200 x 240 drawing, centred in the card's landscape art window. */
export const ITEM_VIEWBOX = '-18 16 236 204';
export const ITEM_KINDS_DRAWN = Object.keys(DRAW);

/** Rarity window colour behind each rarity (the approved weapons page); the light rim mixes from it. */
export const RARITY_WINDOW: Record<Rarity, string> = {
  common: '#2a303c',
  rare: '#16294d',
  epic: '#2c1a4f',
  legendary: '#4a2b0d',
  mythic: '#1d0d19',
  exotic: '#1f1108',
  void: '#120d1c',
};

// ---- unique evolutions (DESIGN.md §12): approved in the batch review, 2026-11-07 ----

export const EVOLUTIONS = ['flameblade', 'soul_reaper', 'rootbloom_staff'] as const;
export type Evolution = (typeof EVOLUTIONS)[number];

/** Blade geometry each evolution's motion runs along (200 x 240 item box). */
export const EVOLUTION_GEO: Record<Evolution, Blade> = {
  flameblade: makeBlade(
    [
      [70, 178],
      [96, 128],
      [128, 76],
      [156, 26],
    ],
    (s) =>
      s < 0.84
        ? 11 + 3.2 * Math.sin(s * Math.PI * 7)
        : ((11 + 3.2 * Math.sin(0.84 * Math.PI * 7)) * (1 - s)) / 0.16,
  ),
  soul_reaper: makeBlade(
    [
      [122, 44],
      [178, 38],
      [198, 104],
      [170, 178],
    ],
    (s) => 18 * Math.pow(1 - s, 0.8) + 1.2,
  ),
  rootbloom_staff: makeBlade(
    [
      [102, 168],
      [103, 148],
      [104, 128],
      [104, 106],
    ],
    () => 10,
  ),
};
/** The rarity window each evolution is shown on. */
export const EVOLUTION_WINDOW: Record<Evolution, Rarity> = {
  flameblade: 'legendary',
  soul_reaper: 'void',
  rootbloom_staff: 'epic',
};

function flameblade(): string {
  const geo = EVOLUTION_GEO.flameblade;
  const l = LOOK.legendary;
  const g: string[] = [];
  const p0 = geo.spine[0]!;
  const n = geo.nor[0]!;
  const u: V = [n[1], -n[0]];
  // the blade is a flame: tongues licking off both edges, layered red, orange, yellow, white-hot
  const layer = (k: number, tongues: boolean): string => {
    const L: V[] = [];
    const R: V[] = [];
    geo.spine.forEach((c, i) => {
      const s0 = i / (geo.spine.length - 1);
      const nn = geo.nor[i]!;
      let w = geo.ws[i]! * k;
      if (tongues && i > 2 && i < geo.spine.length - 3)
        w += (i % 4 === 1 ? 6 : i % 4 === 3 ? 2.5 : 0) * k * (1 - s0 * 0.4);
      const lift = tongues && i % 4 === 1 ? 5 * k : 0;
      const t: V = [nn[1], -nn[0]];
      L.push([c[0] - nn[0] * w + t[0] * lift, c[1] - nn[1] * w + t[1] * lift]);
      R.push([
        c[0] + nn[0] * w * 0.92 + t[0] * lift * 0.6,
        c[1] + nn[1] * w * 0.92 + t[1] * lift * 0.6,
      ]);
    });
    const last = geo.nor[geo.nor.length - 1]!;
    const tt: V = [last[1], -last[0]];
    return PATH([...L, [geo.tip[0] + tt[0] * 14 * k, geo.tip[1] + tt[1] * 14 * k], ...R.reverse()]);
  };
  g.push(`<path d="${layer(1.05, true)}" fill="#ff3b2e" ${ink(3.2)}/>`);
  g.push(`<path d="${layer(0.78, true)}" fill="#ff8a1f"/>`);
  g.push(`<path d="${layer(0.5, false)}" fill="#ffd23a"/>`);
  g.push(
    `<path d="${PATH(geo.spine.slice(2, 27), false)}" fill="none" stroke="#fff6c8" stroke-width="3.2" stroke-linecap="round"/>`,
  );
  const at = (back: number, side: number): V => [
    p0[0] - u[0] * back + n[0] * side,
    p0[1] - u[1] * back + n[1] * side,
  ];
  g.push(
    `<path d="${PATH([at(6, 5), at(44, 4), at(44, -4), at(6, -5)])}" fill="#5a1f1f" ${ink(3)}/>`,
  );
  for (let i = 1; i < 5; i++)
    g.push(
      `<path d="M${f(at(6 + i * 8, 5)[0])} ${f(at(6 + i * 8, 5)[1])} L${f(at(10 + i * 8, -5)[0])} ${f(at(10 + i * 8, -5)[1])}" stroke="${l.acc}" stroke-width="2"/>`,
    );
  g.push(
    `<path d="${PATH([at(3, -30), at(3, 30), at(-7, 22), at(-7, -22)])}" fill="${l.acc}" ${ink(3.2)}/>`,
    gem(p0[0], p0[1] + 1, 6, '#ff3d2e'),
  );
  const pe = at(48, 0);
  g.push(pommel(pe[0], pe[1], 3, l, 6), twinkles(3));
  return g.join('');
}

function soulReaper(): string {
  const geo = EVOLUTION_GEO.soul_reaper;
  const l = LOOK.void;
  const g: string[] = [];
  g.push(`<path d="M40 216 L48 220 L126 48 L118 44Z" fill="#5a4668" ${ink(3)}/>`);
  g.push(
    bladeSvg(geo, 6, l, { smooth: true, nofuller: true, metal: ['#dcd4ea', '#8f7cb0', '#ffffff'] }),
  );
  for (const t of [0.12, 0.28, 0.44, 0.6, 0.76]) {
    const [x, y] = lerpPt(geo.spine, t);
    g.push(
      `<path d="M${f(x - 4)} ${f(y)} L${f(x + 4)} ${f(y)} M${f(x)} ${f(y - 5)} L${f(x)} ${f(y + 4)}" stroke="#b47cff" stroke-width="2.2" stroke-linecap="round"/>`,
    );
  }
  g.push(
    `<path d="M106 26 C106 12 136 12 136 26 C136 34 132 38 130 42 L130 48 L112 48 L112 42 C108 38 106 34 106 26Z" fill="#e8e2d6" ${ink(3)}/><path d="M112 30 l6 -2 2 5 -6 2Z M124 28 l6 2 -2 5 -6 -2Z" fill="#8a3cff"/><path d="M116 48 L116 42 M121 48 L121 42 M126 48 L126 42" stroke="${INK}" stroke-width="2"/>`,
  );
  g.push(
    twinkles(4, [
      [170, 196],
      [40, 80],
      [80, 150],
      [180, 60],
    ]),
  );
  return g.join('');
}

function rootbloomStaff(): string {
  const g: string[] = [];
  const cx = 104;
  const top = 100;
  const bot = 194;
  const sx = (t: number, ph: number, amp: number): number =>
    cx + Math.sin(t * 9 + ph) * amp + (1 - t) * -5;
  // roots, thick and shaded, with moss tufts
  for (const [dx, dy, c1, c2, w] of [
    [-36, 12, -4, 14, 5],
    [-18, 26, -12, 8, 6],
    [-2, 32, -2, 16, 4.6],
    [16, 26, 12, 8, 6],
    [34, 10, 8, 16, 5],
  ] as const) {
    const d = `M${cx - 5} ${bot - 10} C${f(cx - 5 + c1)} ${bot} ${f(cx - 5 + dx * 0.6)} ${f(bot + c2)} ${f(cx - 5 + dx)} ${f(bot + dy)}`;
    g.push(
      `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${f(w + 3.4)}" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#6a4224" stroke-width="${w}" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#b07a4c" stroke-width="1.4" stroke-linecap="round" transform="translate(-1 -1)"/><circle cx="${f(cx - 5 + dx)}" cy="${f(bot + dy)}" r="${f(w * 0.3)}" fill="#6a4224"/>`,
    );
  }
  for (const [x, y, r] of [
    [cx - 24, bot + 6, 6],
    [cx + 14, bot + 10, 5],
    [cx - 4, bot + 2, 4.5],
  ] as const)
    g.push(
      `<path d="M${f(x - r)} ${f(y)} q${f(r * 0.4)} ${f(-r * 1.4)} ${f(r)} ${f(-r * 0.4)} q${f(r * 0.3)} ${f(-r)} ${f(r)} 0 q${f(r * 0.5)} ${f(-r * 0.3)} ${f(r * 0.2)} ${f(r * 0.6)}Z" fill="#4fbf4a" ${ink(2)}/>`,
    );
  // braided staff: three strands, each with a highlight
  const strand = (ph: number, col: string, hi: string): string => {
    let d = '';
    for (let i = 0; i <= 44; i++) {
      const t = i / 44;
      const y = bot - (bot - top) * t;
      d += `${i ? 'L' : 'M'}${f(sx(t, ph, 5.5 - t * 1.5))} ${f(y)}`;
    }
    return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${col}" stroke-width="5" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${hi}" stroke-width="1.4" stroke-linecap="round" transform="translate(-1.4 0)"/>`;
  };
  g.push(
    strand(2.1, '#5e3a1e', '#8a5a32'),
    strand(0, '#7e5030', '#b07a4c'),
    strand(4.2, '#9a6a40', '#d4a070'),
  );
  // vine with two-tone veined leaves
  const vineAt = (t: number): V => [
    cx + Math.sin(t * 16) * 10 - (1 - t) * 4,
    bot - (bot - top) * t,
  ];
  let vine = '';
  for (let i = 0; i <= 40; i++) {
    const [x, y] = vineAt(0.12 + (i / 40) * 0.8);
    vine += `${i ? 'L' : 'M'}${f(x)} ${f(y)}`;
  }
  g.push(
    `<path d="${vine}" fill="none" stroke="${INK}" stroke-width="4.6" stroke-linecap="round"/><path d="${vine}" fill="none" stroke="#3fa84a" stroke-width="2.2" stroke-linecap="round"/>`,
  );
  const vleaf = (x: number, y: number, rot: number, sz: number): string =>
    `<g transform="translate(${f(x)} ${f(y)}) rotate(${rot}) scale(${sz})"><path d="M0 0 q 11 -10 22 -2 q -10 10 -22 2Z" fill="#3fa84a" ${ink(2.2 / sz)}/><path d="M0 0 q 11 -10 22 -2 q -11 -1 -22 2Z" fill="#7fe06a"/><path d="M2 0 L18 -2" stroke="#1f7a34" stroke-width="${f(1.1 / sz)}"/></g>`;
  for (const [t, rot, sz] of [
    [0.22, -25, 0.75],
    [0.36, 205, 0.8],
    [0.5, -35, 0.85],
    [0.64, 200, 0.9],
    [0.78, -50, 0.95],
  ] as const) {
    const [x, y] = vineAt(t);
    g.push(vleaf(x, y, rot, sz));
  }
  // glowing rune bands
  for (const t of [0.34, 0.6]) {
    const y = bot - (bot - top) * t;
    const x = sx(t, 0, 4);
    g.push(
      `<ellipse cx="${f(x)}" cy="${f(y)}" rx="10" ry="3.6" fill="none" stroke="${INK}" stroke-width="5"/><ellipse cx="${f(x)}" cy="${f(y)}" rx="10" ry="3.6" fill="none" stroke="#b8ff8a" stroke-width="2.8"/>`,
    );
  }
  // head: big two-tone petals, the bloom
  const petal = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    bend: number,
    dark: string,
    light: string,
  ): string => {
    const mx = (x0 + x1) / 2 + bend;
    const my = (y0 + y1) / 2;
    return `<path d="M${x0} ${y0} Q${f(mx - 22)} ${f(my)} ${x1} ${y1} Q${f(mx + 22)} ${f(my + 4)} ${x0} ${y0}Z" fill="${dark}" ${ink(3)}/><path d="M${x0} ${y0} Q${f(mx - 22)} ${f(my)} ${x1} ${y1} Q${f(mx - 4)} ${f(my)} ${x0} ${y0}Z" fill="${light}"/><path d="M${x0} ${y0} Q${f(mx + 1)} ${f(my + 1)} ${x1} ${y1}" fill="none" stroke="#1f6a2e" stroke-width="1.5"/>`;
  };
  g.push(
    petal(cx - 2, top + 4, cx - 48, top - 48, -20, '#2f8a3a', '#4fbf4a'),
    petal(cx + 2, top + 4, cx + 48, top - 52, 20, '#2f8a3a', '#4fbf4a'),
    petal(cx - 2, top + 2, cx - 22, top - 70, -6, '#3fa84a', '#7fe06a'),
    petal(cx + 2, top + 2, cx + 22, top - 72, 6, '#3fa84a', '#7fe06a'),
  );
  const fx = cx;
  const fy = top - 30;
  for (let i = 0; i < 7; i++) {
    const ang = i * 0.8976 - 1.4;
    const px = fx + Math.cos(ang) * 14;
    const py = fy + Math.sin(ang) * 14;
    g.push(
      `<ellipse cx="${f(px)}" cy="${f(py)}" rx="10.5" ry="6.6" transform="rotate(${f(ang * 57.3)} ${f(px)} ${f(py)})" fill="#ff6ab8" ${ink(2.6)}/><ellipse cx="${f(px)}" cy="${f(py)}" rx="6" ry="3" transform="rotate(${f(ang * 57.3)} ${f(px)} ${f(py)})" fill="#ff9ad2"/>`,
    );
  }
  for (let i = 0; i < 6; i++) {
    const ang = i * 1.047 - 0.9;
    const px = fx + Math.cos(ang) * 9;
    const py = fy + Math.sin(ang) * 9;
    g.push(
      `<ellipse cx="${f(px)}" cy="${f(py)}" rx="7.4" ry="5" transform="rotate(${f(ang * 57.3)} ${f(px)} ${f(py)})" fill="#ffd6ef" ${ink(2.2)}/><ellipse cx="${f(px - 1)}" cy="${f(py - 1.2)}" rx="2.8" ry="1.3" transform="rotate(${f(ang * 57.3)} ${f(px)} ${f(py)})" fill="#fff"/>`,
    );
  }
  g.push(
    `<circle cx="${fx}" cy="${fy}" r="7" fill="#ffd23a" ${ink(2.6)}/><circle cx="${fx}" cy="${fy}" r="3.4" fill="#ff8a1f"/>`,
  );
  for (let i = 0; i < 6; i++) {
    const a = i * 1.047;
    g.push(
      `<circle cx="${f(fx + Math.cos(a) * 4.6)}" cy="${f(fy + Math.sin(a) * 4.6)}" r=".9" fill="#fff6c8"/>`,
    );
  }
  g.push(`<circle cx="${f(fx - 2.4)}" cy="${f(fy - 2.4)}" r="1.6" fill="#fff"/>`);
  g.push(
    twinkles(4, [
      [cx + 34, top - 66],
      [cx - 36, top - 70],
      [cx + 58, top + 6],
      [cx - 60, top + 4],
    ]),
  );
  return g.join('');
}

/**
 * One floating earth crystal of the Rootbloom Staff, drawn separately so it can bob on its own
 * (whole-pixel steps) instead of being baked into the staff.
 */
export const ROOTBLOOM_CRYSTALS: readonly (readonly [number, number, number, number])[] = [
  [46, 70, 1, -18],
  [164, 82, 0.9, 20],
  [60, 126, 0.7, 8],
  [150, 136, 0.75, -12],
];
export const rootbloomCrystal = (s: number, rot: number): string =>
  `<g transform="translate(16 16) rotate(${rot}) scale(${s})"><path d="M0 -13 L8 -3 L5 11 L-5 11 L-8 -3Z" fill="#d8953a" ${ink(2.4 / s)}/><path d="M0 -13 L8 -3 L1 0Z" fill="#ffd88a"/><path d="M0 -13 L1 0 L-8 -3Z" fill="#f0b45a"/><path d="M1 0 L5 11 L-5 11Z" fill="#a8682a"/><path d="M-3 -6 L-1 -9" stroke="#fff" stroke-width="${f(1.4 / s)}" stroke-linecap="round"/></g>`;

/** The vector drawing of a unique evolution, in the 200 x 240 item box (the pixel source). */
export function evolutionVector(id: Evolution): string {
  const body =
    id === 'flameblade' ? flameblade() : id === 'soul_reaper' ? soulReaper() : rootbloomStaff();
  return `<g class="bi-item">${body}</g>`;
}
