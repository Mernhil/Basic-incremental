/**
 * The card frame (DESIGN.md 5 and 13). The tier is the frame: each tier-up rebuilds it in the
 * next metal and adds ornament, like an armour set. Drawn over a 176 x 248 card; ornaments may
 * reach outside the edge.
 *
 * - Tier ornaments (rank layer, every card): Silver spikes at the top corners, Gold side spikes
 *   and a crest gem, Prismatic plate wings and rainbow metal. Each tier keeps the ones below.
 * - The plate rim and rivets belong to the starter frame family, Knight plate; CSS shows them only
 *   on cards wearing it (`.r-knight-plate`).
 */
import type { RankTier } from '../../../data';
import { INK, f, ink, uid } from './kit';

export interface FrameMetal {
  base: string;
  shade: string;
  hi: string;
  gem: string;
}

export const FRAME_METALS: Record<RankTier, FrameMetal> = {
  bronze: { base: '#d0843f', shade: '#8a4a1e', hi: '#ffc987', gem: '#ff6a3d' },
  silver: { base: '#c9d3de', shade: '#7c8898', hi: '#ffffff', gem: '#4fc3ff' },
  gold: { base: '#f4c23b', shade: '#b0700e', hi: '#fff5b8', gem: '#ff3d6e' },
  prismatic: { base: '#f08bd8', shade: '#8a4bd0', hi: '#ffffff', gem: '#6effe0' },
};

const TIER_ORDER: readonly RankTier[] = ['bronze', 'silver', 'gold', 'prismatic'];
/** How wide the Prismatic wings are drawn: 0.5 keeps them within ~27px of the card edge. */
const WING_SCALE = 0.5;
const W = 176;
const H = 248;

/** Mirrors every x of an absolute path across the card's vertical centre line. */
export const mirror = (d: string): string =>
  d.replace(
    /(-?\d+(?:\.\d+)?)[ ,](-?\d+(?:\.\d+)?)/g,
    (_, x: string, y: string) => `${W - Number(x)} ${y}`,
  );
const both = (d: string): string => `${d} ${mirror(d)}`;

const roundRect = (x: number, y: number, w: number, h: number, r: number): string =>
  `M${x + r} ${y} H${x + w - r} A${r} ${r} 0 0 1 ${x + w} ${y + r} V${y + h - r} A${r} ${r} 0 0 1 ${x + w - r} ${y + h} H${x + r} A${r} ${r} 0 0 1 ${x} ${y + h - r} V${y + r} A${r} ${r} 0 0 1 ${x + r} ${y}Z`;

const OUTER = roundRect(1, 1, W - 2, H - 2, 14);
const INNER = roundRect(9, 9, W - 18, H - 18, 9);

function metalFill(tier: RankTier, m: FrameMetal): { defs: string; fill: string } {
  if (tier !== 'prismatic') return { defs: '', fill: m.base };
  const id = uid();
  return {
    defs: `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff7ad9"/><stop offset=".33" stop-color="#ffd36a"/><stop offset=".66" stop-color="#6effe0"/><stop offset="1" stop-color="#8a7bff"/></linearGradient>`,
    fill: `url(#${id})`,
  };
}

/** The Knight plate rim: shaded metal plate around the card body, with rivets. */
function rim(tier: RankTier, m: FrameMetal, fill: string): string {
  const clip = uid();
  const rivet = (x: number, y: number): string =>
    `<circle cx="${x}" cy="${y}" r="2.3" fill="${m.hi}" ${ink(1.4)}/><circle cx="${f(x - 0.7)}" cy="${f(y - 0.7)}" r=".8" fill="#fff"/>`;
  const rivets = [60, 124, 200].flatMap((y) => [rivet(5, y), rivet(W - 5, y)]).join('');
  return (
    `<g class="bi-frame__rim${tier === 'prismatic' ? ' bi-frame__prism' : ''}">` +
    `<clipPath id="${clip}"><path d="${OUTER} ${INNER}" clip-rule="evenodd"/></clipPath>` +
    `<g clip-path="url(#${clip})"><rect x="0" y="0" width="${W}" height="${H}" fill="${fill}"/>` +
    `<path d="M0 ${H} L${W} ${H} L${W} 110 C130 150 60 140 0 190Z" fill="${m.shade}" opacity=".6"/>` +
    `<path d="M5 34 L5 18 C5 10 10 5 18 5 L112 5" stroke="${m.hi}" stroke-width="2.2" stroke-linecap="round" fill="none"/></g>` +
    `<path d="${OUTER}" fill="none" ${ink(3)}/><path d="${INNER}" fill="none" ${ink(2.2)}/>${rivets}</g>`
  );
}

/** Ornaments for a tier and every tier below it. */
function ornaments(tier: RankTier, m: FrameMetal, fill: string): { back: string; front: string } {
  const level = TIER_ORDER.indexOf(tier);
  const back: string[] = [];
  const front: string[] = [];
  if (level >= 1) {
    // Silver: pauldron spikes at the top corners
    front.push(
      `<path d="${both('M6 30 L-10 6 L20 13Z')}" fill="${fill}" ${ink(3)}/>`,
      `<path d="${both('M0 22 L-6 12')}" stroke="${m.hi}" stroke-width="2" stroke-linecap="round" fill="none"/>`,
    );
  }
  if (level >= 2) {
    // Gold: side spikes and a crest gem on the nameplate
    front.push(
      `<path d="${both('M2 90 L-14 100 L2 110Z M2 150 L-12 160 L2 170Z')}" fill="${fill}" ${ink(3)}/>`,
      `<path d="M76 6 L88 -8 L100 6 L88 14Z" fill="${m.gem}" ${ink(3)}/>`,
      `<path d="M82 4 L88 -2" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`,
    );
  }
  if (level >= 3) {
    // Prismatic: plate wings from the sides
    // Drawn at full width, then narrowed to ~half so they fit the gap between cards on the table.
    const wing =
      `<path d="M4 70 C-32 50 -46 70 -50 100 C-38 92 -28 94 -22 98 C-36 108 -40 124 -38 140 C-26 128 -16 126 -8 128 C-18 140 -18 154 -14 166 C-6 150 0 146 4 146Z" fill="#d9e6ff" ${ink(3)} vector-effect="non-scaling-stroke"/>` +
      `<path d="M-32 80 C-22 76 -12 78 -2 84 M-28 118 C-18 114 -10 116 0 122" stroke="#8a7bff" stroke-width="2.4" fill="none" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
    const k = WING_SCALE;
    back.push(
      `<g class="bi-frame__prism"><g transform="matrix(${k} 0 0 1 ${f(4 * (1 - k))} 0)">${wing}</g>` +
        `<g transform="matrix(${-k} 0 0 1 ${f(W - 4 * (1 - k))} 0)">${wing}</g></g>`,
    );
  }
  return { back: back.join(''), front: front.join('') };
}

/** The whole frame for a tier: wings behind, the rim, then spikes and the crest in front. */
export function cardFrame(tier: RankTier): string {
  const m = FRAME_METALS[tier];
  const { defs, fill } = metalFill(tier, m);
  const o = ornaments(tier, m, fill);
  return `<defs>${defs}</defs>${o.back}${rim(tier, m, fill)}${o.front}`;
}

/** The frame's outline colour, exported for tests and for effects that trace the edge. */
export const FRAME_INK = INK;
