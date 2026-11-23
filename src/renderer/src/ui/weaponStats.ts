import { statIconUrl, type StatIcon } from '../art/statIcons';
import { COPY } from '../copy';
import type {
  DetailEntry,
  DetailStat,
  DetailStatKey,
  GraphAxis,
  WeaponDetail,
} from '../pages/cardsModel';
import { h } from '../shell/shell';
import { pixelValue } from './pixelValue';
import './weaponStats.css';

/**
 * The weapon panel's stat side (the art controller's approved layout, 2026-11-23): the power
 * plaque, the six-corner stat graph, the chip row, one plaque per stat with its icon and green
 * gains, the next-level plaque, and the skill rows with their full sentences. Pure drawing: every
 * number comes from the `WeaponDetail` model; the values are the game's pixel numerals.
 */

const NS = 'http://www.w3.org/2000/svg';
const ICON: Partial<Record<DetailStatKey, StatIcon>> = {
  hit: 'damage',
  speed: 'speed',
  dps: 'dps',
  health: 'health',
  crit: 'crit',
  critdmg: 'crit_damage',
  output: 'dps',
};
const PLAQUE_KEYS = new Set<DetailStatKey>([
  'hit',
  'speed',
  'dps',
  'health',
  'crit',
  'critdmg',
  'output',
]);
const CHIP_KEYS = new Set<DetailStatKey>(['role', 'position', 'element', 'cost', 'works']);

/** Text with its numbers picked out in colour: "+12%" green, every other number gold. */
export function highlight(text: string): Node[] {
  return text.split(/(\+\d[\d.,]*%|×?\d[\d.,]*\s?(?:%|s\b|[kMBT]\b)?)/g).map((part, i) => {
    if (i % 2 === 0) return document.createTextNode(part);
    return h('b', part.startsWith('+') ? 'wst-hl wst-hl--up' : 'wst-hl', part);
  });
}
export const richLine = (cls: string, text: string): HTMLElement => {
  const n = h('span', cls);
  n.append(...highlight(text));
  return n;
};

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

// ---- the stat graph ----
const CX = 135;
const CY = 105;
const R = 90;
export type GraphMode = 'level' | 'star' | 'none';

export interface StatGraph {
  el: HTMLElement;
  /** Which upgrade's after-shape is dashed in green. */
  show(mode: GraphMode): void;
}

export function statGraph(axes: readonly GraphAxis[]): StatGraph {
  const t = COPY.weapon.detail;
  const el = h('div', 'wst-graph');
  const root = svg('svg', { viewBox: '0 0 270 210', class: 'wst-graph__svg' });
  root.setAttribute('role', 'img');
  root.setAttribute(
    'aria-label',
    `${t.graphLabel}: ${axes.map((a) => `${t.axis[a.key as keyof typeof t.axis]} ${Math.round(a.now * 100)}%`).join(', ')}`,
  );
  const pt = (i: number, r: number): [number, number] => {
    const a = ((-90 + i * 60) * Math.PI) / 180;
    return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
  };
  const poly = (vals: readonly number[]): string =>
    vals
      .map((v, i) =>
        pt(i, R * v)
          .map((n) => n.toFixed(1))
          .join(','),
      )
      .join(' ');
  for (const f of [1, 0.5]) {
    root.append(
      svg('polygon', {
        class: f === 1 ? 'wst-graph__rim' : 'wst-graph__grid',
        points: poly(axes.map(() => f)),
      }),
    );
  }
  axes.forEach((_, i) => {
    const [x, y] = pt(i, R);
    root.append(
      svg('line', {
        class: 'wst-graph__spoke',
        x1: String(CX),
        y1: String(CY),
        x2: x.toFixed(1),
        y2: y.toFixed(1),
      }),
    );
  });
  const after = svg('polygon', { class: 'wst-graph__after' });
  root.append(
    svg('polygon', { class: 'wst-graph__shape', points: poly(axes.map((a) => a.now)) }),
    after,
  );
  axes.forEach((a, i) => {
    const [x, y] = pt(i, R + 10);
    const anchor = Math.abs(x - CX) < 6 ? 'middle' : x > CX ? 'start' : 'end';
    const label = svg('text', {
      class: 'wst-graph__label',
      'data-k': a.key,
      x: x.toFixed(1),
      y: (y + (y > CY + 8 ? 9 : y < CY - 8 ? -1 : 4)).toFixed(1),
      'text-anchor': anchor,
    });
    label.textContent = t.axis[a.key as keyof typeof t.axis];
    root.append(label);
  });
  el.append(root);
  return {
    el,
    show(mode) {
      const vals = mode === 'none' ? null : axes.map((a) => (mode === 'star' ? a.star : a.level));
      if (!vals || vals.some((v) => v === null)) {
        after.setAttribute('points', '');
        after.style.display = 'none';
        return;
      }
      after.style.display = '';
      after.setAttribute('points', poly(vals as number[]));
    },
  };
}

// ---- the power plaque ----
export function powerPlaque(d: WeaponDetail, nextStar: number, subline: string): HTMLElement {
  const t = COPY.weapon.detail;
  const box = h('div', 'wst-power');
  box.append(h('span', 'wst-power__label', t.power), pixelValue(d.power.now, 4, 'wst-power__num'));
  if (d.power.withStar) {
    const up = h('span', 'wst-power__up');
    up.append(pixelValue(d.power.withStar, 2), h('small', '', t.powerWithStar(nextStar)));
    box.append(up);
  }
  box.append(h('span', 'wst-power__sub', subline));
  return box;
}

// ---- the chip row ----
export interface ChipInfo {
  tierName: string;
  xpText: string;
}
export function chipRow(stats: readonly DetailStat[], info: ChipInfo): HTMLElement {
  const row = h('div', 'wst-chips');
  const chip = (cls: string, text: string, title = ''): void => {
    const c = h('span', `wst-chip ${cls}`, text);
    if (title) c.title = title;
    row.append(c);
  };
  for (const s of stats) {
    if (!CHIP_KEYS.has(s.key)) continue;
    const v = s.value.toUpperCase();
    if (s.key === 'role')
      chip(
        `wst-chip--role wst-chip--${s.value.toLowerCase()}`,
        `${s.label.toUpperCase()} ${s.value}`,
      );
    else if (s.key === 'element') chip(`wst-chip--element wst-chip--${s.value.toLowerCase()}`, v);
    else if (s.key === 'cost')
      chip('', `${s.label.toUpperCase().replace('LOADOUT ', '')} ${s.value}`, s.label);
    else chip('', v, s.label);
  }
  chip('wst-chip--tier', info.tierName.toUpperCase());
  if (info.xpText) chip('', `XP ${info.xpText}`);
  return row;
}

// ---- stat plaques ----
function gainChip(word: string, value: string): HTMLElement {
  const c = h('span', 'wst-gain');
  c.append(h('small', '', word), pixelValue(value, 2));
  return c;
}

export function statPlaques(stats: readonly DetailStat[]): HTMLElement {
  const t = COPY.weapon.detail;
  const grid = h('div', 'wst-plaques');
  for (const s of stats) {
    if (!PLAQUE_KEYS.has(s.key)) continue;
    const p = h('div', 'wst-plaque');
    p.dataset['k'] = s.key;
    if (s.title) p.title = s.title;
    const icon = ICON[s.key];
    const img = h('img', 'wst-icon');
    img.alt = '';
    img.draggable = false;
    if (icon) img.src = statIconUrl(icon);
    const [head, hint] = t.plaque[s.key as keyof typeof t.plaque] ?? [s.label, ''];
    const txt = h('div', 'wst-plaque__txt');
    txt.append(
      h('span', 'wst-plaque__label', hint ? `${head} · ${hint}` : head),
      pixelValue(s.value, 3, 'wst-plaque__val'),
    );
    p.append(img, txt);
    if (s.up) {
      const gains = h('span', 'wst-gains');
      if (s.up.level) gains.append(gainChip(t.upLevel, s.up.level));
      if (s.up.star) gains.append(gainChip(t.upStar, s.up.star));
      p.append(gains);
    }
    grid.append(p);
  }
  return grid;
}

// ---- next level ----
export function nextLevelPlaque(
  d: WeaponDetail,
  level: number,
  xp: number,
  capped: boolean,
): HTMLElement {
  const t = COPY.weapon.detail;
  const box = h('div', 'wst-next');
  if (capped) {
    box.classList.add('is-end');
    box.append(h('span', 'wst-next__label', t.levelCap));
    return box;
  }
  const gain = d.stats.find((s) => s.key === 'dps' || s.key === 'output')?.up?.level ?? '';
  box.append(h('span', 'wst-next__label', t.nextLevelN(level + 1)));
  if (gain) box.append(pixelValue(gain, 4, 'wst-next__pct'));
  const bar = h('div', 'wst-next__bar');
  const fill = h('i');
  fill.style.width = `${(xp * 100).toFixed(1)}%`;
  bar.append(fill);
  box.append(bar);
  if (d.power.levelGain) {
    const sub = h('span', 'wst-next__power');
    sub.append(pixelValue(`+${d.power.levelGain}`, 2), h('small', '', t.powerWord));
    box.append(sub);
  }
  return box;
}

// ---- skills ----
export function skillRow(e: DetailEntry, unlock: HTMLElement | null): HTMLElement {
  const li = h('li', `wst-row wst-row--${e.kind}`);
  if (e.title) li.title = e.title;
  li.classList.toggle('is-active', Boolean(e.active));
  li.classList.toggle('is-locked', e.state === 'locked');
  li.classList.toggle('is-none', e.state === 'none');
  const head = h('p', 'wst-row__head');
  head.append(h('b', 'wst-row__kind', e.kindLabel));
  if (e.name) head.append(h('span', 'wst-row__name', e.name));
  if (e.state === 'locked')
    head.append(h('span', 'wst-row__state', COPY.weapon.detail.stateLocked));
  else if (e.state === 'none')
    head.append(h('span', 'wst-row__state', COPY.weapon.detail.stateNone));
  li.append(head);
  if (e.text) li.append(richLine('wst-row__text', e.text));
  if (e.effects?.length) {
    const fx = h('span', 'wst-fx');
    for (const f of e.effects) {
      const c = h('span', 'wst-fx__chip');
      c.append(...highlight(f));
      fx.append(c);
    }
    li.append(fx);
  }
  if (e.note) li.append(h('span', 'wst-row__note', e.note));
  if (e.values.length) {
    const vals = h('span', 'wst-fx');
    for (const v of e.values) vals.append(h('span', 'wst-fx__chip wst-fx__chip--state', v));
    li.append(vals);
  }
  if (unlock) li.append(unlock);
  return li;
}
