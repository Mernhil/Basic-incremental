/**
 * The beta-batch cosmetic art (DESIGN.md §8 "UI-skin slots" and "Every option is kept", drawn in
 * the pixel rules of section 13). Borders, finishes, tables and cursors are baked layers shown by
 * recipes (theme/recipes.css); this module gives the art that code places: the Starlight coin,
 * the attack sheets and the pixel numerals of the tick and number styles.
 *
 * Numerals are drawn at run time from a 5 x 7 pixel font in the style's own five-tone ramp (top
 * rows in the light tones), with the ink outline, and then the style's level steps: a motif or gem,
 * a dew drop, the white sticker ring, the glow ring and the max-level particle, exactly as the
 * drafts. Everything is whole pixels; callers scale by whole numbers with `image-rendering:
 * pixelated`.
 */
import { OCTAGON_BADGES } from './pixel/badges.gen';
import { COSMETIC_META } from './pixel/cosmetics.gen';
import { PIXELATED, sprite, spriteImage, type SpriteInfo } from './pixel/sprites';
import { INK } from './pixel/raster';

export { AMBIENT_MOTIONS, CORNER_SHAPES, PIXEL_EFFECTS, PIXEL_RECIPES } from './cosmeticIds';

export type SkinStyle = 'a' | 'b' | 'c' | 'd' | 'e';
export const SKIN_STYLES: readonly SkinStyle[] = ['a', 'b', 'c', 'd', 'e'];

// ---- B1 Starlight coin ---------------------------------------------------------------------

export const STARLIGHT_VIEWBOX = '0 0 48 48';

/** The Starlight coin of a style (option A is the starter), as SVG markup on a 48 x 48 viewBox. */
export function starlightCoin(styleId: SkinStyle | string): string {
  return spriteImage(`cos-starlight-${styleId}`, 0, 0, 48, 48);
}

// ---- attacks ---------------------------------------------------------------------------------

export interface AttackSheet {
  sprite: SpriteInfo;
  frames: number;
  /** One frame's size in pixels (square). */
  size: number;
  /** Frame durations in ms: snap, held hit, thin, break. */
  durations: readonly number[];
}

type AttackMeta = { levels: number; frames: number; size: number };
const ATTACKS = COSMETIC_META.attacks as unknown as Record<string, AttackMeta>;

/** The baked slash of an attack effect id (`px-slash-<style>-<level>`), or undefined. */
export function attackSheet(effectId: string): AttackSheet | undefined {
  const m = /^px-slash-([a-z]+)-(\d+)$/.exec(effectId);
  if (!m) return undefined;
  const a = ATTACKS[m[1]!];
  const s = sprite(`cos-atk-${m[1]}-${m[2]}`);
  if (!a || !s) return undefined;
  return { sprite: s, frames: a.frames, size: a.size, durations: [50, 130, 90, 110] };
}

// ---- pixel numerals ----------------------------------------------------------------------------

/** 5 x 7 numeral font (also the suffixes the number formats use). '#' is a lit pixel. */
const FONT: Record<string, readonly string[]> = {
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  '.': ['..', '..', '..', '..', '..', '##', '##'],
  ',': ['..', '..', '..', '..', '..', '.#', '#.'],
  '-': ['...', '...', '...', '###', '...', '...', '...'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '%': ['##..#', '##.#.', '...#.', '..#..', '.#...', '.#.##', '#..##'],
  ' ': ['..', '..', '..', '..', '..', '..', '..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  N: ['#...#', '##..#', '#.#.#', '#.#.#', '#..##', '#...#', '#...#'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  V: ['#...#', '#...#', '#...#', '#...#', '.#.#.', '.#.#.', '..#..'],
  a: ['....', '....', '.##.', '...#', '.###', '#..#', '.###'],
  c: ['....', '....', '.###', '#...', '#...', '#...', '.###'],
  e: ['....', '....', '.##.', '#..#', '####', '#...', '.###'],
  i: ['.#', '..', '##', '.#', '.#', '.#', '.#'],
  o: ['....', '....', '.##.', '#..#', '#..#', '#..#', '.##.'],
  p: ['....', '....', '###.', '#..#', '###.', '#...', '#...'],
  x: ['....', '....', '#..#', '#..#', '.##.', '#..#', '#..#'],
};

/** A small RGBA grid with the few operations the numerals need. */
class Px {
  readonly d: (string | null)[];
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.d = new Array<string | null>(w * h).fill(null);
  }
  get(x: number, y: number): string | null {
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.d[y * this.w + x]!;
  }
  set(x: number, y: number, c: string): void {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = c;
  }
  /** A one-pixel ring of c around everything opaque (4-neighbour, like the baked stickers). */
  ring(c: string): void {
    const add: number[] = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (
          !this.get(x, y) &&
          (this.get(x + 1, y) || this.get(x - 1, y) || this.get(x, y + 1) || this.get(x, y - 1))
        )
          add.push(y * this.w + x);
    for (const i of add) this.d[i] = c;
  }
  /** Paste a decoded sprite's pixels. */
  paste(src: Px, ox: number, oy: number): void {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const c = src.get(x, y);
        if (c) this.set(ox + x, oy + y, c);
      }
  }
  plus(x: number, y: number, c: string, core = '#ffffff'): void {
    this.set(x, y, core);
    this.set(x + 1, y, c);
    this.set(x - 1, y, c);
    this.set(x, y + 1, c);
    this.set(x, y - 1, c);
  }
  toCanvas(): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = this.w;
    cv.height = this.h;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(this.w, this.h);
    this.d.forEach((c, i) => {
      if (!c) return;
      img.data[i * 4] = parseInt(c.slice(1, 3), 16);
      img.data[i * 4 + 1] = parseInt(c.slice(3, 5), 16);
      img.data[i * 4 + 2] = parseInt(c.slice(5, 7), 16);
      img.data[i * 4 + 3] = 255;
    });
    ctx.putImageData(img, 0, 0);
    return cv;
  }
}

/** Column masks of a string (unknown characters are skipped), optionally bold (doubled). */
function mask(text: string, bold: boolean): boolean[][] {
  let cols: boolean[][] = [];
  for (const ch of text) {
    const g = FONT[ch];
    if (!g) continue;
    for (let x = 0; x < g[0]!.length; x++) cols.push(g.map((row) => row[x] === '#'));
    cols.push(new Array<boolean>(7).fill(false));
    if (bold) cols.push(new Array<boolean>(7).fill(false));
  }
  cols = cols.slice(0, Math.max(0, cols.length - (bold ? 2 : 1)));
  if (!bold) return cols;
  const out = Array.from({ length: cols.length + 1 }, () => new Array<boolean>(7).fill(false));
  cols.forEach((c, x) =>
    c.forEach((on, y) => {
      if (on) out[x]![y] = out[x + 1]![y] = true;
    }),
  );
  return out;
}

/** The numeral: ramp tones by row (light on top), ink outline or a hard ink drop shadow. */
function numeral(text: string, ramp: readonly string[], scale: number, shadow: boolean): Px {
  const m = mask(text, true);
  const w = m.length * scale;
  const h = 7 * scale;
  const g = new Px(w + 4, h + 4);
  m.forEach((col, x) =>
    col.forEach((on, y) => {
      if (!on) return;
      const tone = y < 2 ? ramp[4]! : y < 4 ? ramp[3]! : ramp[2]!;
      for (let j = 0; j < scale; j++)
        for (let i = 0; i < scale; i++) g.set(1 + x * scale + i, 1 + y * scale + j, tone);
    }),
  );
  if (!shadow) {
    g.ring(INK);
    return g;
  }
  const s = new Px(g.w, g.h);
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) if (g.get(x, y)) s.set(x + 1, y + 1, INK);
  s.paste(g, 0, 0);
  return s;
}

const decoded = new Map<string, Px>();
/** Decoded pixels of the small decoration sprites, loaded once (sync after `preloadNumerals`). */
function deco(name: string): Px | undefined {
  return decoded.get(name);
}

/** Loads the decoration sprites the numerals use; resolves when they can be drawn. */
export async function preloadNumerals(): Promise<void> {
  const names = new Set<string>(['cos-deco-dew']);
  for (const t of Object.values(TICKS)) {
    if (t.motif) names.add(`cos-${t.motif}`);
    if (t.gem) names.add(`cos-${t.gem}`);
    if (t.petal) names.add(`cos-${t.petal}`);
  }
  await Promise.all(
    [...names].map(async (n) => {
      const s = sprite(n);
      if (!s || decoded.has(n)) return;
      const img = new Image();
      img.src = s.url;
      await img.decode();
      const cv = document.createElement('canvas');
      cv.width = s.w;
      cv.height = s.h;
      const ctx = cv.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, s.w, s.h).data;
      const g = new Px(s.w, s.h);
      for (let i = 0; i < s.w * s.h; i++)
        if (d[i * 4 + 3]! > 127)
          g.d[i] =
            '#' +
            [d[i * 4]!, d[i * 4 + 1]!, d[i * 4 + 2]!]
              .map((v) => v.toString(16).padStart(2, '0'))
              .join('');
      decoded.set(n, g);
    }),
  );
}

interface TickMeta {
  family: 'garden' | 'loose';
  levels: number;
  ramp: readonly string[];
  acc?: readonly string[];
  glow?: string;
  motif?: string;
  gem?: string;
  petal?: string;
}
const TICKS = COSMETIC_META.ticks as unknown as Record<string, TickMeta>;
const NUMBERS = COSMETIC_META.numbers as unknown as Record<string, TickMeta>;

/** Splits `verdant-3` into a style id and a level. */
function parseStyle(style: string): [string, number] | undefined {
  const m = /^([a-z]+)-(\d+)$/.exec(style.trim());
  return m ? [m[1]!, Number(m[2])] : undefined;
}

/**
 * A tick number in a pixel tick style (`<style>-<level>`, the value of `--bi-tick-px`) as a canvas
 * on its native grid, or undefined for an unknown style. Draw it at 2 css px per pixel.
 */
export function pixelTick(style: string, text: string): HTMLCanvasElement | undefined {
  const p = parseStyle(style);
  const t = p && TICKS[p[0]];
  if (!p || !t) return undefined;
  const lv = Math.min(p[1], t.levels);
  const garden = t.family === 'garden';
  const ramp = !garden && lv >= 2 && t.acc ? t.acc : t.ramp;
  const n = numeral(text, ramp, 2, false);
  const g = new Px(n.w + 16, n.h + 10);
  const ox = 4;
  const oy = 4;
  g.paste(n, ox, oy);
  const right = ox + n.w;
  if (garden) {
    const motif = t.motif ? deco(`cos-${t.motif}`) : undefined;
    if (lv >= 2 && motif) g.paste(motif, right - 4, 0);
    const dew = deco('cos-deco-dew');
    if (lv >= 3 && dew) g.paste(dew, 0, 1);
    g.ring('#ffffff');
    if (lv >= 4 && t.glow) g.ring(t.glow);
    const petal = t.petal ? deco(`cos-${t.petal}`) : undefined;
    if (lv >= 5 && petal) g.paste(petal, right, g.h - petal.h);
  } else {
    const gem = t.gem ? deco(`cos-${t.gem}`) : undefined;
    if (lv >= 3 && gem) g.paste(gem, right - 2, 0);
    g.ring('#ffffff');
    if (lv >= 3 && t.glow) g.ring(t.glow);
    if (lv >= 4 && t.acc) g.plus(right + 4, g.h - 4, t.acc[4]!);
  }
  return g.toCanvas();
}

/**
 * A number in a pixel number style (`<style>-<level>`, the value of `--bi-num-px`) as a canvas on
 * its native grid: one-pixel bold numerals with a hard drop shadow; higher levels add a sparkle
 * and a glow ring. Undefined for an unknown style.
 */
export function pixelNumber(style: string, text: string): HTMLCanvasElement | undefined {
  const p = parseStyle(style);
  const t = p && NUMBERS[p[0]];
  if (!p || !t) return undefined;
  const lv = Math.min(p[1], t.levels);
  const n = numeral(text, t.ramp, 1, true);
  const g = new Px(n.w + 6, n.h + 3);
  g.paste(n, 2, 2);
  if (t.family === 'garden') {
    if (lv >= 3) {
      g.set(g.w - 3, 1, '#ffffff');
      g.set(g.w - 4, 2, t.ramp[3]!);
    }
    if (lv >= 4 && t.glow) g.ring(t.glow);
  } else if (lv >= 2 && t.acc) g.plus(g.w - 3, 2, t.acc[4]!);
  return g.toCanvas();
}

/** Markup for a pixel number at a whole-number scale (an <img> on the native grid). */
export function pixelNumberMarkup(style: string, text: string, scale = 2): string {
  const cv = pixelNumber(style, text);
  if (!cv) return '';
  return `<img class="bi-pxnum" alt="" src="${cv.toDataURL()}" width="${cv.width * scale}" height="${cv.height * scale}" style="${PIXELATED}">`;
}

// ---- B6 sticker styles -------------------------------------------------------------------------

export type StickerChapter = 'gathering' | 'battle' | 'cards' | 'wardrobe' | 'journey';
export const STICKER_VIEWBOX = '0 0 74 74';
const STICKERS = COSMETIC_META.stickers as unknown as {
  achievements: readonly string[];
  numerals: Readonly<Record<string, string>>;
  art: number;
  window: readonly [number, number];
  plate: readonly [number, number, number, number];
};

/**
 * An achievement sticker as SVG markup on a 74 x 74 viewBox: a mini card (DESIGN.md §12) whose
 * frame is the style's step on the card-tier ladder and whose band is the chapter colour, with the
 * achievement's cel-shaded picture in its window and, for tiered achievements, the numeral on its
 * nameplate (otherwise three chapter pips). Locked stickers are the style's face-down card back
 * with a padlock. Pass anything that is not an achievement id (for example the chapter) for an
 * empty card.
 */
export function stickerArt(
  styleId: SkinStyle | string,
  achievementId: string,
  chapter: StickerChapter,
  unlocked: boolean,
): string {
  // the achievement badges (art/pixel/hand/badge-*, ASSET_RULES section 5): 32 x 32 at 2x, centred
  // in the 74 box; a locked one is the blank base, dimmed
  const badge = unlocked
    ? `badge-${styleId}-${achievementId}`
    : `badge-locked-${OCTAGON_BADGES.has(achievementId) ? 'octagon' : 'round'}`;
  if (sprite(badge)) return spriteImage(badge, 5, 5, 64, 64);
  const base = spriteImage(`cos-sticker-${styleId}-${unlocked ? chapter : 'locked'}`, 0, 0, 74, 74);
  if (!unlocked || !STICKERS.achievements.includes(achievementId)) return base;
  const [wx, wy] = STICKERS.window;
  let out = base + spriteImage(`cos-ach-${achievementId}`, wx, wy, STICKERS.art, STICKERS.art);
  const numeral = STICKERS.numerals[achievementId];
  if (numeral) {
    const [px, py, pw, ph] = STICKERS.plate;
    out += spriteImage(`cos-sticker-${styleId}-plate-${numeral}`, px, py, pw, ph);
  }
  return out;
}

/** The card-shard icon (32 x 32, viewBox '0 0 32 32'). */
export function cardShardIcon(): string {
  return spriteImage('cos-card-shard', 0, 0, 32, 32);
}

// ---- B7 skill nodes and the star chart ---------------------------------------------------------

export type SkillBranch = 'logging' | 'mining' | 'combat' | 'luck' | 'collection' | 'automation';
export type NodeState = 'locked' | 'open' | 'owned';

/** A skill-tree gem node as SVG markup on its own viewBox (24 x 24, keystones 32 x 32). */
export function skillNode(
  styleId: SkinStyle | string,
  branch: SkillBranch | string,
  state: NodeState,
  keystone = false,
): string {
  const n = keystone ? 32 : 24;
  return spriteImage(`cos-${keystone ? 'key' : 'node'}-${styleId}-${branch}-${state}`, 0, 0, n, n);
}

export interface ChartStar {
  /** Position on the 200 x 120 chart grid (whole pixels). */
  x: number;
  y: number;
  state: NodeState;
  major?: boolean;
}

export const STAR_CHART_VIEWBOX = '0 0 200 120';

/**
 * The card enhancement star chart as SVG markup on a '0 0 200 120' viewBox: the night-sky panel,
 * links as one-pixel dotted lines (solid and lit once both ends are owned) and a star per option.
 * Positions are the caller's (whole pixels on the chart grid).
 */
export function starChart(
  styleId: SkinStyle | string,
  stars: readonly ChartStar[],
  links: readonly (readonly [number, number])[],
): string {
  const c = (COSMETIC_META.nodes as unknown as { chart: { line: string; lit: string } }).chart;
  let out = spriteImage(`cos-chartsky-${styleId}`, 0, 0, 200, 120);
  for (const [a, b] of links) {
    const p = stars[a];
    const q = stars[b];
    if (!p || !q) continue;
    const on = p.state === 'owned' && q.state === 'owned';
    const n = Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y), 1);
    for (let i = 0; i <= n; i++) {
      if (!on && i % 4 >= 2) continue;
      const x = Math.round(p.x + ((q.x - p.x) * i) / n);
      const y = Math.round(p.y + ((q.y - p.y) * i) / n);
      out += `<rect x="${x}" y="${y}" width="1" height="1" fill="${on ? c.lit : c.line}"/>`;
    }
  }
  for (const s of stars) {
    const n = s.major ? 24 : 18;
    const name = `cos-${s.major ? 'chartmajor' : 'chart'}-${styleId}-${s.state}`;
    out += spriteImage(name, s.x - n / 2, s.y - n / 2, n, n);
  }
  return `<g shape-rendering="crispEdges">${out}</g>`;
}

// ---- B10 Wardrobe chrome -------------------------------------------------------------------------

export type WardrobePart =
  | 'plate'
  | 'plate-on'
  | 'tile'
  | 'tile-on'
  | 'socket'
  | 'rung-off'
  | 'rung-next'
  | 'rung-done'
  | 'link'
  | 'link-done';

export interface ChromePiece extends SpriteInfo {
  /** Nine-slice inset in pixels (0: draw as is). Use with `border-image` at a whole scale. */
  slice: number;
}

const WD = COSMETIC_META.wardrobe as unknown as {
  perRarity: readonly string[];
  parts: Record<string, readonly [number, number, number]>;
};

/**
 * A Wardrobe chrome piece of a style. Style 'e' (rarity glass) is drawn per rarity: pass the
 * item's rarity for its plates, tiles and rungs.
 */
export function wardrobeChrome(
  styleId: SkinStyle | string,
  part: WardrobePart,
  rarity = 'common',
): ChromePiece | undefined {
  const perRarity =
    WD.perRarity.includes(styleId) && !['socket', 'link', 'link-done'].includes(part);
  const s = sprite(`cos-wd-${styleId}-${part}${perRarity ? `-${rarity}` : ''}`);
  const p = WD.parts[part];
  return s && p ? { ...s, slice: p[2] } : undefined;
}

/** CSS declarations that draw a chrome piece on an element (nine-slice border for plates, tiles). */
export function chromeCss(piece: ChromePiece, scale = 2): string {
  if (!piece.slice) return `background:url('${piece.url}') 0 0/100% 100% no-repeat;${PIXELATED}`;
  const b = piece.slice * scale;
  return `border:${b}px solid transparent;border-image:url('${piece.url}') ${piece.slice} fill / ${b}px stretch;${PIXELATED}`;
}
