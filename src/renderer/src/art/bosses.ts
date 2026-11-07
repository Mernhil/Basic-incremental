/**
 * Bosses in the sticker style (DESIGN.md 13): one flat colour per part, a single white highlight
 * and a thick white outline around the whole figure. Each has its own body shape: the Root Warden
 * wide and squat, the Cinder Lich tall and floating, the Glacier Colossus top-heavy, the Crystal
 * Sentinel a floating diamond whose four shards light up with the trial score. Drawn in a
 * 100 x 100 box.
 */
import type { BOSS_ARTS } from '../../../data';
import { INK, circ, f } from './kit';

export type BossArt = (typeof BOSS_ARTS)[number];
type Tones = readonly [string, string, string, string];

const C: Record<string, Tones> = {
  bark: ['#9a7650', '#765838', '#523c26', '#c8a276'],
  moss: ['#8ed64c', '#62ac3a', '#407e28', '#cdf27e'],
  hollow: ['#2a1a10', '#1e120a', '#120a06', '#3a2818'],
  glowG: ['#e4ff8a', '#c8f060', '#a0d040', '#ffffff'],
  shroom: ['#ee5e4e', '#c03e32', '#80221a', '#ffb4a4'],
  leaf: ['#7ae05a', '#4fbc44', '#2e8a32', '#c4ff9a'],
  bone: ['#f2e8d2', '#d2c4a8', '#a8987c', '#ffffff'],
  flame: ['#ffd83e', '#ff8e2c', '#d84c12', '#fff6b8'],
  staff: ['#6a4a34', '#523824', '#382416', '#8e6a4e'],
  glowR: ['#ffe27a', '#ffb43a', '#ff7a1e', '#ffffff'],
  gold: ['#f4c23b', '#c8901e', '#8a5a0e', '#fff2a0'],
  horn: ['#4a3a48', '#34283a', '#20162a', '#7a6a7e'],
  robe: ['#5a3474', '#3e2456', '#24143a', '#8a5aa8'],
  amethyst: ['#d29aff', '#a64dff', '#7a2ad0', '#f2e0ff'],
  ice: ['#c4eaff', '#8ec8f2', '#5c98ce', '#ffffff'],
  iced: ['#74a8d8', '#5484b6', '#38628e', '#acd6fa'],
  crys: ['#eefaff', '#ade2ff', '#6cb2ea', '#ffffff'],
  snow: ['#ffffff', '#e6eff8', '#c2d2e2', '#ffffff'],
  glowB: ['#c8fbff', '#7af0ff', '#3ad0f0', '#ffffff'],
  crys2: ['#ffe6fa', '#f2b0ec', '#c474d4', '#ffffff'],
  stone2: ['#c4c8d4', '#9aa0ae', '#727888', '#e6e9f0'],
  glowP: ['#fff2ff', '#ff9cf2', '#e062da', '#ffffff'],
  dim: ['#7a7488', '#5e586e', '#463f56', '#9a94a8'],
};
const GLOW = new Set(['glowG', 'glowR', 'glowB', 'glowP', 'flame']);

/** A filled part [path, role, highlight?] or a detail line ['L', path, role, width]. */
type Part = readonly [string, string, string?] | readonly ['L', string, string, number];

function blob(cx: number, cy: number, rx: number, ry: number, n: number, b: number): string {
  let d = '';
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * 2 * Math.PI;
    const x = cx + rx * Math.cos(a);
    const y = cy + ry * Math.sin(a);
    if (!i) {
      d += `M${f(x)} ${f(y)}`;
      continue;
    }
    const m = ((i - 0.5) / n) * 2 * Math.PI;
    d += ` Q${f(cx + rx * (1 + b) * Math.cos(m))} ${f(cy + ry * (1 + b) * Math.sin(m))} ${f(x)} ${f(y)}`;
  }
  return d + 'Z';
}
const elp = (cx: number, cy: number, rx: number, ry: number, s = 1): string =>
  `M${cx - rx} ${cy} a${rx} ${ry} 0 1 ${s} ${2 * rx} 0 a${rx} ${ry} 0 1 ${s} ${-2 * rx} 0Z`;
const dia = (x: number, y: number, w: number, h: number): string =>
  `M${x} ${y - h} L${x + w} ${y} L${x} ${y + h} L${x - w} ${y}Z`;

// The Cinder Lich was drawn on a 200-unit rig; these map it into the 100 box.
const LS = 0.44;
const LX = 6;
const LY = 4;
const sp = (d: string): string =>
  d.replace(/([MLCZl])([^MLCZl]*)/g, (_m, c: string, args: string) => {
    const n = args.trim()
      ? args
          .trim()
          .split(/[\s,]+/)
          .map(Number)
      : [];
    const rel = c === 'l';
    return c + n.map((v, i) => f(rel ? v * LS : i % 2 ? v * LS + LY : v * LS + LX)).join(' ') + ' ';
  });
const oc = (cx: number, cy: number, r: number): string => circ(cx * LS + LX, cy * LS + LY, r * LS);
const flameP = (cx: number, by: number, s: number): string =>
  sp(
    `M${cx} ${by - 30 * s} C${cx + 7 * s} ${by - 20 * s} ${cx + 13 * s} ${by - 12 * s} ${cx + 12 * s} ${by - 5 * s} C${cx + 11 * s} ${by} ${cx + 5 * s} ${by + 2 * s} ${cx} ${by + 2 * s} C${cx - 5 * s} ${by + 2 * s} ${cx - 11 * s} ${by} ${cx - 12 * s} ${by - 5 * s} C${cx - 13 * s} ${by - 13 * s} ${cx - 4 * s} ${by - 18 * s} ${cx} ${by - 30 * s}Z`,
  );

const WARDEN: Part[] = [
  ['M24 84 L10 95 L20 93 L26 97 L34 88Z', 'bark'],
  ['M76 84 L90 95 L80 93 L74 97 L66 88Z', 'bark'],
  ['M44 88 L42 97 L50 94 L58 97 L56 88Z', 'bark'],
  [
    'M22 88 C18 70 20 50 30 40 C38 33 62 33 70 40 C80 50 82 70 78 88 C66 92 34 92 22 88Z',
    'bark',
    'M28 52 C30 46 34 42 40 40',
  ],
  ['L', 'M34 66 C34 74 36 80 34 86 M66 66 C66 74 64 80 66 86 M50 74 L50 87', 'bark', 2],
  [
    'M28 50 C16 52 8 64 10 80 L6 88 L12 86 L14 90 L18 85 L22 88 L20 78 C20 68 24 62 32 60Z',
    'bark',
    'M14 64 C14 60 18 56 22 55',
  ],
  [
    'M72 50 C84 52 92 64 90 80 L94 88 L88 86 L86 90 L82 85 L78 88 L80 78 C80 68 76 62 68 60Z',
    'bark',
  ],
  [blob(50, 38, 27, 8, 11, 0.3), 'moss', 'M30 36 C40 32 60 32 70 35'],
  [blob(24, 50, 9, 5, 6, 0.3), 'moss'],
  [blob(76, 50, 9, 5, 6, 0.3), 'moss'],
  ['L', 'M50 31 C50 25 52 21 54 18', 'bark', 2.6],
  ['M54 18 C60 13 67 15 67 20 C61 23 57 22 54 18Z', 'leaf'],
  ['M51 25 C46 20 39 21 39 25 C44 28 48 27 51 25Z', 'leaf'],
  ['M38 59 C38 51 62 51 62 59 C62 67 56 71 50 71 C44 71 38 67 38 59Z', 'hollow'],
  ['L', 'M35 53 C41 48 46 50 49 54 M65 53 C59 48 54 50 51 54', 'bark', 3.4],
  [circ(44, 60, 3), 'glowG'],
  [circ(56, 60, 3), 'glowG'],
  ['M68 72 C68 65 80 65 80 72Z', 'shroom', 'M71 69 C72 67 75 66 77 67'],
  ['M72 72 L72 77 L76 77 L76 72Z', 'bone'],
  ['M24 76 C24 71 32 71 32 76Z', 'shroom'],
  ['M27 76 L27 79 L30 79 L30 76Z', 'bone'],
];

const LICH: Part[] = [
  [sp('M30 214 L54 72 L62 74 L40 214Z'), 'staff', sp('M52 90 L40 170')],
  [flameP(56, 50, 0.9), 'flame'],
  [
    sp('M42 64 C40 48 64 44 70 58 C74 68 66 78 56 78 C48 78 42 72 42 64Z'),
    'bone',
    sp('M48 56 C52 52 58 52 62 54'),
  ],
  ['L', sp('M50 62 L54 62 M60 62 L64 62'), 'hollow', 2],
  [
    sp(
      'M54 122 C48 92 72 80 100 80 C128 80 152 92 146 122 C152 160 148 186 152 206 C138 198 130 210 120 200 C112 210 100 202 94 210 C86 202 76 210 66 200 C60 206 54 204 48 206 C56 186 48 156 54 122Z',
    ),
    'robe',
    sp('M64 104 C70 92 82 88 94 86'),
  ],
  [
    'L',
    sp(
      'M70 130 C72 156 70 178 66 196 M100 130 C100 158 100 180 98 200 M130 130 C128 156 130 178 134 196',
    ),
    'robe',
    1.4,
  ],
  [sp('M58 144 L142 144 L140 156 L60 156Z'), 'gold', sp('M64 148 L90 148')],
  [sp('M96 146 l4 -3 4 3 -4 4Z'), 'glowR'],
  [
    sp('M64 88 C76 78 124 78 136 88 L128 104 C112 98 88 98 72 104Z'),
    'gold',
    sp('M74 88 C88 84 104 84 118 86'),
  ],
  [sp('M66 42 C52 32 46 16 50 2 C58 14 64 20 76 26Z'), 'horn'],
  [sp('M134 42 C148 32 154 16 150 2 C142 14 136 20 124 26Z'), 'horn'],
  [flameP(80, 28, 0.7), 'flame'],
  [flameP(100, 22, 1), 'flame'],
  [flameP(120, 28, 0.7), 'flame'],
  [
    sp(
      'M64 70 C60 38 78 22 100 22 C122 22 140 38 136 70 C134 82 126 88 126 100 L74 100 C74 88 66 82 64 70Z',
    ),
    'bone',
    sp('M74 38 C80 28 90 24 98 24'),
  ],
  ['L', sp('M84 34 L90 40 L87 48 M120 42 L115 48 L117 54'), 'bone', 1.2],
  [sp('M72 62 C76 50 92 50 96 62 C92 74 76 74 72 62Z'), 'hollow'],
  [sp('M128 62 C124 50 108 50 104 62 C108 74 124 74 128 62Z'), 'hollow'],
  [oc(84, 62, 4.6), 'glowR'],
  [oc(116, 62, 4.6), 'glowR'],
  [sp('M96 76 L100 70 L104 76 L100 82Z'), 'hollow'],
  [sp('M78 88 L122 88 L120 102 L80 102Z'), 'bone'],
  ['L', sp('M86 88 L86 102 M94 88 L94 102 M102 88 L102 102 M110 88 L110 102'), 'hollow', 1.2],
  [sp('M86 24 L90 12 L96 22 L100 8 L104 22 L110 12 L114 24Z'), 'gold'],
  [oc(100, 19, 3.4), 'amethyst'],
  [
    sp('M40 118 C38 106 54 100 64 108 C72 116 68 132 58 134 C48 136 40 128 40 118Z'),
    'bone',
    sp('M46 110 C50 106 56 106 60 108'),
  ],
  [
    sp('M134 116 C134 104 150 100 160 108 C168 116 164 132 154 134 C144 136 136 128 134 116Z'),
    'bone',
    sp('M142 108 C146 104 152 104 156 106'),
  ],
  [flameP(160, 106, 1.25), 'flame'],
];

const COLOSSUS: Part[] = [
  ['M36 82 L34 96 L48 96 L48 82Z', 'iced'],
  ['M52 82 L52 96 L66 96 L64 82Z', 'iced'],
  ['M24 42 L8 62 L12 70 L28 54Z', 'iced'],
  ['M76 42 L92 62 L88 70 L72 54Z', 'iced'],
  ['M22 40 L78 40 L66 86 L34 86Z', 'ice', 'M28 44 L58 44'],
  ['L', 'M34 56 L44 66 L56 66 L66 56 M40 76 L60 76', 'iced', 1.6],
  ['M2 70 L10 62 L22 66 L24 80 L14 88 L2 82Z', 'ice', 'M5 70 L10 65'],
  ['M98 70 L90 62 L78 66 L76 80 L86 88 L98 82Z', 'ice'],
  ['M14 44 L20 22 L28 40Z', 'crys'],
  ['M22 42 L30 12 L38 40Z', 'crys'],
  ['M9 50 L11 33 L20 46Z', 'crys'],
  ['M86 44 L80 22 L72 40Z', 'crys'],
  ['M78 42 L70 12 L62 40Z', 'crys'],
  ['M91 50 L89 33 L80 46Z', 'crys'],
  ['M12 40 L40 37 L38 50 L10 52Z', 'ice', 'M15 42 L36 40'],
  ['M88 40 L60 37 L62 50 L90 52Z', 'ice'],
  ['M40 26 L60 26 L62 42 L38 42Z', 'ice'],
  ['M42 32 L58 32 L57 36 L43 36Z', 'glowB'],
  ['M38 28 C42 21 58 21 62 28 L60 30 C56 26 44 26 40 30Z', 'snow'],
  ['M50 54 L56.9 58 L56.9 66 L50 70 L43.1 66 L43.1 58Z', 'glowB'],
];

/** The Crystal Sentinel; `level` 0..4 is how many score steps (25 / 50 / 75 / 100%) are passed. */
function sentinel(level: number): Part[] {
  const lv = (n: number): string => (level >= n ? 'glowP' : 'dim');
  return [
    [elp(50, 50, 40, 12) + elp(50, 50, 34, 8, 0), 'stone2'],
    [dia(50, 49, 20, 35), 'crys2', 'M44 24 L36 44'],
    ['L', 'M50 14 L50 84 M30 49 L70 49', 'crys2', 1.4],
    ['M40 49 C44 42 56 42 60 49 C56 56 44 56 40 49Z', 'hollow'],
    [circ(50, 49, 4.2), 'glowP'],
    [dia(16, 30, 5, 8), lv(1)],
    [dia(84, 30, 5, 8), lv(2)],
    [dia(14, 70, 5, 8), lv(3)],
    [dia(86, 70, 5, 8), lv(4)],
  ];
}

const PARTS: Record<Exclude<BossArt, 'crystal_sentinel'>, Part[]> = {
  root_warden: WARDEN,
  cinder_lich: LICH,
  glacier_colossus: COLOSSUS,
};

/** The boss in the sticker style, in a 100 x 100 box, with a soft shadow and an idle breath. */
export function bossArt(art: BossArt, level = 0): string {
  const parts = art === 'crystal_sentinel' ? sentinel(level) : PARTS[art];
  const fills = parts.filter((p): p is readonly [string, string, string?] => p[0] !== 'L');
  const sticker = fills
    .map(
      ([d]) =>
        `<path d="${d}" fill="#fff" stroke="#fff" stroke-width="9" stroke-linejoin="round"/>`,
    )
    .join('');
  const body = parts
    .map((p) => {
      if (p[0] === 'L') {
        const [, d, role, w] = p as readonly ['L', string, string, number];
        return `<path d="${d}" stroke="${C[role]![2]}" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
      }
      const [d, role, hi] = p;
      const c = C[role]!;
      const glow = GLOW.has(role)
        ? `<g class="bi-art-glow"><path d="${d}" fill="${c[1]}" opacity=".6" filter="url(#bi-art-blur)"/></g>`
        : '';
      return `${glow}<path d="${d}" fill="${c[1]}" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>${hi ? `<path d="${hi}" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".85"/>` : ''}`;
    })
    .join('');
  return `<ellipse cx="50" cy="96" rx="40" ry="5" fill="#000" opacity=".4"/><g class="bi-art-breathe">${sticker}${body}</g>`;
}

/** The trial score (0..1) as Crystal Sentinel shard steps. */
export const sentinelLevel = (score: number): number =>
  Math.max(0, Math.min(4, Math.floor(score * 4 + 1e-9)));

/** Boss art placed in the card item box (200 x 240), centred. */
export const bossInItemBox = (art: BossArt, level = 0): string =>
  `<g transform="translate(5 25) scale(1.9)">${bossArt(art, level)}</g>`;
