/**
 * Bosses and the Crystal Sentinel as the approved Brave Frontier drawings (Pixel Art Round 2), the
 * source the 160 x 172 pixel bosses are baked from. Five-tone hue-shifted ramps (shadows toward
 * purple, highlights toward yellow), dark one-pixel lines between parts in each material's darkest
 * tone, gold trim with a bright top edge, small gems with a white glint. Each boss has its own body
 * shape: the Root Warden wide and squat, the Cinder Lich tall and floating, the Glacier Colossus
 * top-heavy, the Sentinel a floating one-eyed diamond in a halo ring.
 */
import { Defs, GOLD, glint, line, ramp, type Ramp } from './gems';

export const BOSS_VB = [0, -12, 160, 172] as const;

const mirrorX = (d: string, w = 160): string =>
  d.replace(
    /(-?\d+(?:\.\d+)?)[ ,](-?\d+(?:\.\d+)?)/g,
    (_, x: string, y: string) => `${w - Number(x)} ${y}`,
  );

/** Drawing helpers bound to one drawing's gradient defs. */
function kit(D: Defs) {
  const part = (
    d: string,
    R: Ramp,
    o: { cx?: number; cy?: number; r?: number; line?: string } = {},
  ): string =>
    `<path d="${d}" fill="${D.shade(R, o.cx, o.cy, o.r)}" stroke="${o.line ?? R[4]}" stroke-width="1" stroke-linejoin="round"/>`;
  const flat = (d: string, c: string, ln?: string): string =>
    `<path d="${d}" fill="${c}"${ln ? ` stroke="${ln}" stroke-width="1" stroke-linejoin="round"` : ''}/>`;
  const trim = (d: string): string =>
    line(d, GOLD[4], 3) +
    line(d, GOLD[2], 2) +
    `<path d="${d}" fill="none" stroke="${GOLD[0]}" stroke-width="1" stroke-linecap="round" transform="translate(0 -0.7)"/>`;
  const gemDot = (x: number, y: number, r: number, R: Ramp): string =>
    part(`M${x} ${y - r} L${x + r} ${y} L${x} ${y + r} L${x - r} ${y}Z`, R, { cx: 0.3, cy: 0.25 }) +
    glint(x - Math.ceil(r / 2), y - Math.ceil(r / 2), r > 3 ? 2 : 1);
  return { part, flat, trim, gemDot };
}

function warden(): string {
  const D = new Defs();
  const { part, flat } = kit(D);
  const BARK = ramp(28, 0.42, 0.4);
  const MOSS = ramp(98, 0.55, 0.48);
  const SAP = ramp(36, 0.5, 0.64);
  const HOL = ramp(28, 0.4, 0.12);
  const MUSH = ramp(4, 0.72, 0.52);
  const armL =
    'M44 86 C28 90 18 102 16 118 C15 126 14 130 13 134 L30 136 C29 128 30 120 32 114 C35 106 40 102 48 100Z';
  const fistL = 'M6 132 C3 141 9 150 19 151 C29 151 34 144 31 135 C28 128 12 126 6 132Z';
  const root = 'M42 140 C32 143 22 147 12 153 L22 156 C30 151 38 149 50 147Z';
  let s = '';
  s +=
    part(root, BARK) +
    part(mirrorX(root), BARK) +
    part('M72 146 C68 150 64 153 58 157 L68 157 C72 154 76 152 80 149Z', BARK);
  s +=
    part(armL, BARK) +
    part(mirrorX(armL), BARK) +
    part(fistL, BARK, { cx: 0.3 }) +
    part(mirrorX(fistL), BARK, { cx: 0.3 });
  const knuck = 'M10 138 C14 136 18 137 22 140 M14 146 C18 144 22 145 26 147';
  s += line(knuck, BARK[4]) + line(mirrorX(knuck), BARK[4]);
  s += part(
    'M40 146 C38 120 36 96 38 74 C38 66 44 60 52 58 L108 58 C116 60 122 66 122 74 C124 96 122 120 120 146 C100 151 60 151 40 146Z',
    BARK,
    { cx: 0.3, cy: 0.35, r: 0.85 },
  );
  s += line(
    'M50 70 C48 90 52 112 49 140 M64 114 C62 126 64 136 62 146 M96 114 C98 126 96 136 98 146 M111 72 C113 92 109 114 112 140 M80 114 L80 148',
    BARK[4],
  );
  s +=
    line('M47 76 C46 92 49 106 47 120', BARK[1]) + line('M60 112 C59 122 60 130 59 140', BARK[1]);
  s +=
    part(
      'M42 62 C42 56 58 52 80 52 C102 52 118 56 118 62 C118 68 102 72 80 72 C58 72 42 68 42 62Z',
      SAP,
      { cy: 0.3 },
    ) +
    line(
      'M56 62 C56 58 104 58 104 62 C104 66 56 66 56 62Z M68 62 C68 60 92 60 92 62 C92 64 68 64 68 62Z',
      SAP[3],
    );
  s += part(
    'M36 66 C32 56 40 46 52 48 C56 40 68 38 76 44 C84 36 98 38 102 46 C114 44 126 52 122 64 C124 70 118 73 114 69 C110 76 104 72 102 67 C96 74 88 71 86 67 C80 74 72 71 70 67 C64 74 56 71 54 67 C50 74 41 73 36 66Z',
    MOSS,
    { cx: 0.4, cy: 0.25 },
  );
  s +=
    part('M50 70 C49 76 51 80 53 80 C55 80 56 76 54 70Z', MOSS) +
    part('M100 70 C99 78 101 82 103 82 C105 82 106 78 104 70Z', MOSS) +
    part('M84 68 C83 73 85 76 86 76 C88 76 88 72 87 68Z', MOSS);
  s +=
    line('M80 42 C80 34 82 28 86 24', BARK[3], 2) +
    part('M86 24 C88 16 98 16 100 20 C96 26 90 27 86 24Z', MOSS) +
    part('M80 32 C76 26 68 26 66 30 C70 34 76 35 80 32Z', MOSS);
  s += part(
    'M58 86 C58 77 66 73 80 73 C94 73 102 77 102 86 C102 99 94 109 80 109 C66 109 58 99 58 86Z',
    HOL,
    { cx: 0.5, cy: 0.55, r: 0.7 },
  );
  const eye = 'M65 84 L74 82 L75 90 L66 91Z';
  const pupil = 'M67 85 L72 84 L72 88 L68 88Z';
  s += flat(eye, '#c8f060') + flat(pupil, '#f4ffb0') + glint(68, 85, 2);
  s += flat(mirrorX(eye), '#c8f060') + flat(mirrorX(pupil), '#f4ffb0') + glint(90, 85, 2);
  s += line('M68 100 L72 97 L76 101 L80 97 L84 101 L88 97 L92 100', '#a0d040');
  s +=
    part('M32 114 C32 105 46 102 51 110 C46 113 38 114 32 114Z', MUSH, { cy: 0.2 }) +
    flat('M40 114 L43 114 L43 120 L40 120Z', SAP[1], SAP[3]) +
    glint(37, 107, 2) +
    glint(44, 106);
  s +=
    part('M34 126 C34 120 44 118 47 124 C43 126 38 127 34 126Z', MUSH, { cy: 0.2 }) +
    glint(39, 121);
  const rune = 'M106 94 L110 99 L106 104 M112 116 L108 121 L112 126';
  s += line(rune, '#d8ff70', 2) + line(rune, '#ffffff', 1);
  return D.wrap(s);
}

function lich(): string {
  const D = new Defs();
  const { part, flat, trim, gemDot } = kit(D);
  const ROBE = ramp(276, 0.48, 0.34);
  const BONE = ramp(42, 0.35, 0.8);
  const HORN = ramp(300, 0.15, 0.32);
  const WOOD = ramp(24, 0.38, 0.3);
  const FIRE = ramp(28, 1, 0.55);
  const SOCK = ramp(20, 0.5, 0.1);
  const RUBY = ramp(350, 0.85, 0.5);
  let s = '';
  s += part('M124 28 L130 28 L135 152 L129 152Z', WOOD, { cx: 0.2 });
  s +=
    part(
      'M117 26 C117 15 137 15 137 26 C137 32 133 34 133 38 L121 38 C121 34 117 32 117 26Z',
      BONE,
    ) +
    flat('M121 26 L126 24 L126 29 L122 30Z', SOCK[2]) +
    flat('M128 24 L133 26 L132 30 L128 29Z', SOCK[2]) +
    flat('M123 26 L124 26 L124 27 L123 27Z', '#ffb43a') +
    flat('M130 26 L131 26 L131 27 L130 27Z', '#ffb43a');
  s +=
    part('M119 18 C116 10 122 6 122 -1 C126 5 130 3 130 -4 C135 4 138 11 135 18Z', FIRE, {
      cy: 0.7,
    }) + part('M123 18 C122 13 125 10 126 6 C128 10 131 12 131 18Z', ramp(48, 1, 0.7), { cy: 0.8 });
  s += part(
    'M54 66 C48 80 44 104 40 128 L36 152 L48 143 L56 154 L66 143 L76 156 L84 143 L94 154 L104 143 L114 152 L120 128 C116 104 112 80 106 66 C96 60 64 60 54 66Z',
    ROBE,
    { cx: 0.38, cy: 0.3 },
  );
  s +=
    line(
      'M58 76 C56 100 52 120 48 140 M64 84 C63 104 61 124 60 146 M98 84 C99 104 101 124 102 146 M104 76 C106 100 110 120 114 140',
      ROBE[4],
    ) + line('M59 76 C57 98 54 116 51 132 M65 86 C64 104 63 120 62 136', ROBE[1]);
  s +=
    part('M74 70 L86 70 L92 146 L68 146Z', ramp(276, 0.5, 0.24), { cx: 0.5 }) +
    trim('M74 70 L68 146') +
    trim('M86 70 L92 146') +
    trim('M42 126 C66 132 94 132 118 126');
  for (const [x, y] of [
    [80, 96],
    [80, 118],
  ] as const)
    s += gemDot(x, y, 3, RUBY);
  const sleeve = 'M54 70 C40 76 30 92 27 110 L46 113 C48 99 52 89 59 83Z';
  s +=
    part(sleeve, ROBE) +
    part(mirrorX(sleeve), ROBE) +
    trim('M27 110 L46 113') +
    trim(mirrorX('M27 110 L46 113'));
  s +=
    part('M28 112 C26 118 30 124 36 124 C42 124 44 118 42 113Z', BONE) +
    line('M31 118 L31 122 M35 119 L35 124 M39 118 L39 122', BONE[4]);
  s +=
    part('M118 102 C116 108 120 114 126 114 C132 114 134 108 132 103Z', BONE) +
    line('M121 107 L121 111 M125 108 L125 113 M129 107 L129 111', BONE[4]);
  s +=
    part('M52 70 L45 51 L60 62 L66 49 L72 62 L80 47 L88 62 L94 49 L100 62 L115 51 L108 70Z', GOLD, {
      cy: 0.2,
    }) + gemDot(80, 64, 4, RUBY);
  const horn = 'M66 30 C56 26 49 15 51 2 C57 13 64 18 71 22Z';
  s += part(horn, HORN, { cx: 0.7 }) + part(mirrorX(horn), HORN, { cx: 0.3 });
  s += part(
    'M64 44 C62 30 70 22 80 22 C90 22 98 30 96 44 C96 50 92 54 90 58 L70 58 C68 54 64 50 64 44Z',
    BONE,
    { cx: 0.38, cy: 0.3 },
  );
  const socket = 'M67 40 C67 35 74 34 76 39 C76 44 69 46 67 40Z';
  s += flat(socket, SOCK[2]) + flat(mirrorX(socket), SOCK[2]);
  s +=
    flat('M70 39 L73 39 L73 42 L70 42Z', '#ff8e2c') +
    flat('M71 40 L72 40 L72 41 L71 41Z', '#fff2a0') +
    flat('M87 39 L90 39 L90 42 L87 42Z', '#ff8e2c') +
    flat('M88 40 L89 40 L89 41 L88 41Z', '#fff2a0');
  s +=
    flat('M78 46 L82 46 L80 50Z', SOCK[2]) +
    line('M71 55 L71 59 M75 55 L75 59 M79 55 L79 59 M83 55 L83 59 M87 55 L87 59', BONE[4]) +
    line('M70 54 L90 54', BONE[3]);
  s +=
    part('M64 31 L96 31 L95 24 L65 24Z', GOLD) +
    part('M65 24 L67 13 L72 21 L80 9 L88 21 L93 13 L95 24Z', GOLD, { cy: 0.2 }) +
    gemDot(80, 27, 2, RUBY);
  s +=
    part('M66 14 C63 6 69 1 69 -6 C73 0 77 -3 80 -10 C84 -2 88 -4 91 -6 C92 1 97 6 94 14Z', FIRE, {
      cy: 0.75,
    }) +
    part('M71 14 C70 9 74 6 75 2 C78 6 80 4 82 0 C84 5 88 8 89 14Z', ramp(48, 1, 0.72), {
      cy: 0.8,
    }) +
    flat('M77 14 L79 8 L81 14Z', '#fffbe0');
  return D.wrap(s);
}

function colossus(): string {
  const D = new Defs();
  const { part, flat } = kit(D);
  const ICE = ramp(206, 0.55, 0.62);
  const DICE = ramp(214, 0.5, 0.44);
  const CRY = ramp(194, 0.75, 0.76);
  const ROCK = ramp(220, 0.18, 0.5);
  const SNOW = ramp(205, 0.3, 0.93);
  const CORE = ramp(186, 0.95, 0.6);
  let s = '';
  s +=
    part('M58 108 L74 108 L77 146 L55 146Z', DICE) +
    part('M86 108 L102 108 L105 146 L83 146Z', DICE) +
    part('M50 144 C50 138 80 138 80 144 L80 150 L50 150Z', ROCK) +
    part('M80 144 C80 138 110 138 110 144 L110 150 L80 150Z', ROCK);
  const armL = 'M40 62 C27 68 22 82 24 100 L41 100 C41 88 44 78 51 72Z';
  const fistL =
    'M9 98 C5 112 9 130 23 134 C37 136 46 126 46 112 C46 100 36 92 24 94 C18 94 12 96 9 98Z';
  s +=
    part(armL, DICE) +
    part(mirrorX(armL), DICE) +
    part(fistL, ROCK, { cx: 0.3 }) +
    part(mirrorX(fistL), ROCK, { cx: 0.3 });
  const cracks = 'M14 108 L22 112 L30 106 M18 122 L26 120';
  const cap = 'M10 100 C14 94 30 92 38 98 C30 100 18 102 10 100Z';
  s +=
    line(cracks, ROCK[4]) +
    line(mirrorX(cracks), ROCK[4]) +
    part(cap, SNOW) +
    part(mirrorX(cap), SNOW);
  s += part(
    'M40 58 C40 50 50 44 80 44 C110 44 120 50 120 58 L114 108 C104 116 56 116 46 108Z',
    ICE,
    { cx: 0.32, cy: 0.25 },
  );
  s +=
    line('M60 50 L66 84 L54 104 M100 50 L94 84 L106 104 M66 84 L94 84', ICE[4]) +
    line('M46 58 L50 96', ICE[0]) +
    line('M62 52 L67 80', ICE[1]);
  s +=
    part('M80 70 L90 75 L90 87 L80 92 L70 87 L70 75Z', CORE, { cx: 0.3, cy: 0.25 }) +
    glint(74, 75, 2) +
    glint(77, 73);
  const eye = 'M72 41 L78 42 L78 45 L72 44Z';
  s +=
    part('M70 34 L90 34 L92 52 L68 52Z', ICE, { cy: 0.2 }) +
    flat(eye, '#7af0ff') +
    flat(mirrorX(eye), '#7af0ff') +
    glint(73, 42) +
    glint(86, 42) +
    part('M66 36 C68 28 92 28 94 36 C86 34 74 34 66 36Z', SNOW);
  for (const d of [
    'M30 60 L27 30 L35 21 L42 31 L44 58Z',
    'M40 56 L41 16 L49 7 L56 20 L55 54Z',
    'M21 66 L13 44 L19 37 L29 49 L32 64Z',
  ])
    s += part(d, CRY, { cx: 0.25, cy: 0.2 }) + part(mirrorX(d), CRY, { cx: 0.75, cy: 0.2 });
  const ridges = 'M35 23 L37 54 M49 9 L49 50 M19 39 L26 62';
  s += line(ridges, CRY[0]) + line(mirrorX(ridges), CRY[1]);
  const shoulder = 'M38 58 C44 52 58 50 64 56 C54 58 46 60 38 58Z';
  s +=
    glint(47, 12, 2) +
    glint(33, 26) +
    glint(111, 12, 2) +
    part(shoulder, SNOW) +
    part(mirrorX(shoulder), SNOW);
  return D.wrap(s);
}

function sentinel(): string {
  const D = new Defs();
  const { part, flat } = kit(D);
  const C1 = ramp(312, 0.6, 0.7);
  const C2 = ramp(296, 0.55, 0.58);
  const RING = ramp(44, 0.7, 0.62);
  let s = '';
  s +=
    line('M16 86 A64 14 0 0 1 144 86', RING[4], 5) +
    line('M16 86 A64 14 0 0 1 144 86', RING[2], 3) +
    line('M18 85 A62 13 0 0 1 142 85', RING[0], 1);
  s +=
    part('M80 14 L44 84 L80 84Z', C1, { cx: 0.6, cy: 0.5 }) +
    part('M80 14 L116 84 L80 84Z', C2, { cx: 0.3, cy: 0.5 }) +
    part('M44 84 L80 154 L80 84Z', C2, { cx: 0.6, cy: 0.2 }) +
    part('M116 84 L80 154 L80 84Z', ramp(286, 0.55, 0.46), { cx: 0.3, cy: 0.2 });
  s +=
    line('M80 18 L80 80', C1[0]) + line('M50 82 L78 30', C1[0]) + glint(70, 36, 2) + glint(66, 44);
  s += part('M50 80 L110 80 L108 89 L52 89Z', GOLD, { cy: 0.2 });
  s +=
    part('M66 84 C70 74 90 74 94 84 C90 94 70 94 66 84Z', ramp(220, 0.2, 0.95), { cy: 0.3 }) +
    part('M73 84 C73 78 87 78 87 84 C87 90 73 90 73 84Z', ramp(276, 0.8, 0.5)) +
    flat('M77 82 L83 82 L83 87 L77 87Z', '#1a0a2a') +
    glint(76, 80, 2);
  s +=
    line('M16 86 A64 14 0 0 0 144 86', RING[4], 5) +
    line('M16 86 A64 14 0 0 0 144 86', RING[2], 3) +
    line('M20 89 A60 12 0 0 0 140 89', RING[1], 1);
  return D.wrap(s);
}

/** One Sentinel shard (18 x 28 box), lit or dark. */
export function shardVector(lit: boolean): string {
  const D = new Defs();
  const { part } = kit(D);
  const R = lit ? ramp(318, 0.75, 0.72) : ramp(260, 0.08, 0.48);
  return D.wrap(
    part('M8 0 L16 12 L8 26 L0 12Z', R, { cx: 0.3, cy: 0.25 }) +
      line('M8 3 L3 12', R[0]) +
      (lit ? glint(5, 8, 2) : ''),
  );
}

export type BossArtId = 'root_warden' | 'cinder_lich' | 'glacier_colossus' | 'crystal_sentinel';
/** The boss body (160 x 172 box from BOSS_VB), without the Sentinel's shards. */
export function bossVector(art: BossArtId): string {
  return art === 'root_warden'
    ? warden()
    : art === 'cinder_lich'
      ? lich()
      : art === 'glacier_colossus'
        ? colossus()
        : sentinel();
}

/** Aura colour and idle effect per boss. */
export const BOSS_LOOK: Record<
  BossArtId,
  { glow: string; fx: 'spores' | 'fire' | 'snow' | 'motes' }
> = {
  root_warden: { glow: '#b4f05a', fx: 'spores' },
  cinder_lich: { glow: '#ff8a2c', fx: 'fire' },
  glacier_colossus: { glow: '#7ae0ff', fx: 'snow' },
  crystal_sentinel: { glow: '#ff9cf2', fx: 'motes' },
};
/** The trial score (0..1) as Crystal Sentinel shard steps: one per 25, 50, 75 and 100%. */
export const sentinelLevel = (score: number): number =>
  Math.max(0, Math.min(4, Math.floor(score * 4 + 1e-9)));

/** Where the Sentinel's four shards float (BOSS_VB units, top-left of the shard box). */
export const SHARD_POS: readonly (readonly [number, number])[] = [
  [16, 30],
  [128, 30],
  [16, 116],
  [128, 116],
];
