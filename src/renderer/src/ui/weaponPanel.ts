import type { Content } from '../../../data';
import { gemMastery, type GameState } from '../../../game';
import { gemCoin, svg } from '../art/gems';
import { COPY } from '../copy';
import type { CardEntry, CostChip, WeaponView } from '../pages/cardsModel';
import { h } from '../shell/shell';
import { icon } from '../shell/icons';
import { iconMarkup, resourceIconId } from './resourceIcons';
import './weaponPanel.css';

/**
 * The weapon panel (DESIGN.md §5, §11; review gate set 3, option D "On the weapon"): the main
 * card's level, XP, stars and next tier-up, drawn on the weapon itself. One component, two homes:
 *
 * - `drawer`: the dungeon drawer. The weapon sits in an XP ring with the level on a hex badge,
 *   the stars as pips along the ring's open end and the tier on a plate under it; the star line
 *   and the tier-up tag with its price sit beside it.
 * - `card`: the Cards detail. The level badge and a slim XP bar lie over the card at 2x (`overlay`,
 *   put inside the card's host) and the same star line and tier-up tag go under it (`el`).
 *
 * All numbers come from the entry's `WeaponView`; this file only draws them and forwards the two
 * buttons (add star, tier up) to `act`.
 */

export interface WeaponPanelOptions {
  variant: 'drawer' | 'card';
  content: Content;
  state: () => GameState;
  /** Takes the star-up or the tier-up (the page runs the game action and re-renders). */
  act: (kind: 'star' | 'tier') => void;
}

export interface WeaponPanel {
  /** The panel (drawer: stage and side; card: just the side, to go under the card). */
  el: HTMLElement;
  /** Card variant: the level badge and XP bar to put on the card's host. Null in the drawer. */
  overlay: HTMLElement | null;
  /** Re-reads the entry. Cheap every tick: the buttons and the price tag only rebuild on change. */
  update(entry: CardEntry): void;
}

const NS = 'http://www.w3.org/2000/svg';
/** The ring: a 270-degree arc (open at the bottom) in a 270 x 262 stage. */
const RING = { w: 270, h: 262, cx: 135, cy: 124, r: 112, from: 135, sweep: 270 } as const;
const STAR_PATH = 'M0 -9 L2.6 -3 L9 -2.6 L4 1.6 L5.6 8 L0 4.5 L-5.6 8 L-4 1.6 L-9 -2.6 L-2.6 -3z';
const STARS = 6;
/** The item sprite is 100 x 120 art pixels (a 200 x 240 box); the drawer shows it at 1x. */
const ITEM_BOX = '0 0 200 240';

let uid = 0;

const point = (angle: number, r: number): [number, number] => [
  RING.cx + r * Math.cos((angle * Math.PI) / 180),
  RING.cy + r * Math.sin((angle * Math.PI) / 180),
];

function arc(from: number, to: number): string {
  const [x1, y1] = point(from, RING.r);
  const [x2, y2] = point(to, RING.r);
  return `M${x1.toFixed(1)} ${y1.toFixed(1)}A${RING.r} ${RING.r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

export function createWeaponPanel(opts: WeaponPanelOptions): WeaponPanel {
  const { content, variant } = opts;
  const id = `wp${++uid}`;
  const root = h('div', `wp wp--${variant}`);

  // ---- the side: star line, add star, tier-up tag ----
  const side = h('div', 'wp-side');
  const starLine = h('p', 'wp-stars bi-num');
  const starMain = h('b');
  const starImpact = h('span');
  starLine.append(starMain, starImpact);
  const starHost = h('div', 'wp-starbtn');
  const tagHost = h('div', 'wp-taghost');
  side.append(starLine, starHost, tagHost);

  // ---- drawer: the stage ----
  let stage: HTMLElement | null = null;
  let fill: SVGPathElement | null = null;
  let pips: SVGGElement[] = [];
  let partial: SVGStopElement[] = [];
  let itemSvg: SVGSVGElement | null = null;
  const badgeNum = h('b', 'bi-num');
  const badgeSub = h('small');
  const badge = h('div', 'wp-badge');
  badge.append(badgeNum, badgeSub);
  const xpText = h('div', 'wp-xp bi-num');
  const plate = h('div', 'wp-plate');
  const plateName = h('span');
  const plateMark = h('i');
  plateMark.setAttribute('aria-hidden', 'true');
  plate.append(plateName, plateMark);

  if (variant === 'drawer') {
    stage = h('div', 'wp-stage');
    stage.setAttribute('role', 'meter');
    stage.setAttribute('aria-valuemin', '0');
    stage.setAttribute('aria-valuemax', '100');
    const ring = el('svg', { viewBox: `0 0 ${RING.w} ${RING.h}`, class: 'wp-ring' });
    ring.setAttribute('aria-hidden', 'true');
    ring.setAttribute('focusable', 'false');
    const defs = el('defs');
    const prism = el('linearGradient', { id: `${id}-prism`, x1: '0', x2: '1' });
    for (const [o, c] of [
      [0, '#ff5f9e'],
      [0.3, '#ffd24a'],
      [0.6, '#5ff0a8'],
      [1, '#5fc6ff'],
    ] as const) {
      prism.append(el('stop', { offset: String(o), 'stop-color': c }));
    }
    const glow = el('radialGradient', { id: `${id}-glow` });
    glow.append(
      el('stop', { offset: '0', 'stop-color': '#93a6bb', 'stop-opacity': '.35' }),
      el('stop', { offset: '1', 'stop-color': '#0d121b', 'stop-opacity': '0' }),
    );
    const part = el('linearGradient', { id: `${id}-part`, x1: '0', x2: '1' });
    partial = [
      el('stop', { offset: '0', 'stop-color': 'currentColor' }),
      el('stop', { offset: '0', 'stop-color': '#2a2f38' }),
    ];
    part.append(...partial);
    defs.append(prism, glow, part);
    ring.append(
      defs,
      el('circle', { cx: String(RING.cx), cy: String(RING.cy), r: '96', fill: `url(#${id}-glow)` }),
      el('ellipse', {
        cx: String(RING.cx),
        cy: String(RING.cy + 78),
        rx: '54',
        ry: '9',
        fill: 'rgba(0,0,0,.5)',
      }),
      el('path', {
        class: 'wp-track',
        d: arc(RING.from, RING.from + RING.sweep),
        fill: 'none',
        'stroke-width': '12',
        'stroke-linecap': 'round',
      }),
    );
    fill = el('path', {
      class: 'wp-fill',
      fill: 'none',
      'stroke-width': '8',
      'stroke-linecap': 'round',
    });
    ring.append(fill);
    pips = Array.from({ length: STARS }, (_, i) => {
      const angle = 90 + (i - (STARS - 1) / 2) * 17;
      const [x, y] = point(angle, RING.r);
      const g = el('g', {
        class: 'wp-pip',
        transform: `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${angle - 90})`,
      });
      g.append(el('path', { d: STAR_PATH, 'stroke-width': '2', 'stroke-linejoin': 'round' }));
      ring.append(g);
      return g;
    });
    itemSvg = el('svg', { viewBox: ITEM_BOX, class: 'wp-item' });
    itemSvg.setAttribute('aria-hidden', 'true');
    itemSvg.setAttribute('focusable', 'false');
    stage.append(ring, itemSvg, badge, xpText, plate);
    stage.querySelectorAll('.wp-badge, .wp-xp, .wp-plate').forEach((n) => {
      n.setAttribute('aria-hidden', 'true');
    });
    root.append(stage, side);
  } else {
    root.append(side);
  }

  // ---- card variant: the overlay (badge + XP bar) ----
  let overlay: HTMLElement | null = null;
  let xpFill: HTMLElement | null = null;
  if (variant === 'card') {
    overlay = h('div', 'wp-over');
    overlay.setAttribute('role', 'meter');
    overlay.setAttribute('aria-valuemin', '0');
    overlay.setAttribute('aria-valuemax', '100');
    const xpBar = h('div', 'wp-xpbar');
    xpFill = h('i');
    xpBar.append(xpFill);
    badge.setAttribute('aria-hidden', 'true');
    xpBar.setAttribute('aria-hidden', 'true');
    overlay.append(xpBar, badge);
  }

  // ---- drawing ----
  const costArt = (resource: string): string => {
    const r = content.resourceById.get(resource);
    if (r?.gem)
      return svg(gemCoin(r.gem, Math.max(0, gemMastery(opts.state(), content, resource).tier)));
    return (r ? iconMarkup(resourceIconId(r)) : null) ?? '';
  };

  function costItem(c: CostChip, showHave: boolean): HTMLElement {
    const li = h('li', `wp-cost ${c.met ? 'is-met' : 'is-missing'}`);
    li.title = COPY.weapon.costTitle(c.name, c.have, c.need);
    const art = h('span', 'wp-cost__art');
    art.setAttribute('aria-hidden', 'true');
    const markup = costArt(c.id);
    if (markup) art.innerHTML = markup;
    else art.append(icon('material', 'wp-cost__icon'));
    const amount = h('span', 'wp-cost__amount bi-num');
    if (showHave) {
      amount.append(h('b', '', c.have), h('small', '', `/ ${c.need}`));
    } else {
      amount.append(h('b', '', c.need));
    }
    li.append(art, amount, h('span', 'wp-cost__name', c.name));
    return li;
  }

  let sideSig = '';
  function drawSide(w: WeaponView): void {
    // star line
    if (w.starBar) {
      starMain.textContent = w.starBar.text;
      starImpact.textContent = w.starBar.impact;
      starLine.hidden = false;
    } else {
      starMain.textContent = COPY.weapon.allStars;
      starImpact.textContent = '';
      starLine.hidden = false;
    }
    starLine.style.setProperty('--gauge', `${((w.starBar?.gauge ?? 1) * 100).toFixed(1)}%`);

    const sig = JSON.stringify([w.stars, w.starBar?.ready, w.tierUp, w.endNote]);
    if (sig === sideSig) return;
    sideSig = sig;
    const keep = side.contains(document.activeElement);
    const focused = (document.activeElement as HTMLElement | null)?.dataset['key'];

    starHost.replaceChildren();
    if (w.starBar?.ready) {
      const b = h('button', 'button wp-add', COPY.weapon.addStar(w.stars + 1));
      b.type = 'button';
      b.dataset.key = 'wp-star';
      b.addEventListener('click', () => opts.act('star'));
      starHost.append(b);
    }

    tagHost.replaceChildren();
    const t = w.tierUp;
    if (!t) {
      tagHost.append(h('p', 'wp-end', w.endNote ?? ''));
    } else {
      const tag = h('div', `wp-tag is-${t.phase}`);
      tag.dataset.to = t.toTier;
      const lead = h('p', 'wp-lead', t.lead);
      lead.id = `${id}-lead`;
      const list = h('ul', 'wp-costs');
      list.setAttribute('aria-labelledby', lead.id);
      for (const c of t.costs) list.append(costItem(c, w.atCap));
      const go = h('button', `button wp-go${t.ready ? ' is-ready' : ''}`, t.action);
      go.type = 'button';
      go.dataset.key = 'wp-tier';
      go.setAttribute('aria-disabled', String(!t.ready));
      const hint = t.missing ? h('p', 'wp-hint', t.missing) : null;
      if (hint) hint.id = `${id}-hint`;
      go.setAttribute('aria-describedby', hint ? `${id}-lead ${id}-hint` : `${id}-lead`);
      go.addEventListener('click', () => {
        if (go.getAttribute('aria-disabled') !== 'true') opts.act('tier');
      });
      tag.append(lead, list, go);
      if (hint) tag.append(hint);
      tagHost.append(tag);
    }
    if (keep && focused) side.querySelector<HTMLElement>(`[data-key="${focused}"]`)?.focus();
  }

  let lastItem = '';
  function drawStage(entry: CardEntry, w: WeaponView): void {
    if (!stage || !fill || !itemSvg) return;
    stage.dataset.tier = w.tier;
    stage.classList.toggle('is-max', w.atCap);
    const end = RING.from + RING.sweep * Math.max(0.01, w.xp);
    fill.setAttribute('d', arc(RING.from, Math.max(end, RING.from + 3)));
    fill.style.stroke = w.atCap ? `url(#${id}-prism)` : '';
    if (entry.item !== lastItem) {
      lastItem = entry.item;
      itemSvg.innerHTML = entry.item;
    }
    const gauge = w.starBar?.gauge ?? 0;
    partial[0]?.setAttribute('offset', `${(gauge * 100).toFixed(0)}%`);
    partial[1]?.setAttribute('offset', `${(gauge * 100).toFixed(0)}%`);
    pips.forEach((g, i) => {
      const on = i < w.stars;
      const part = i === w.stars && w.stars < STARS && gauge > 0;
      g.classList.toggle('is-on', on);
      g.classList.toggle('is-part', part);
      (g.firstElementChild as SVGElement).style.fill = part ? `url(#${id}-part)` : '';
    });
    if (w.atCap) xpText.textContent = COPY.weapon.xpFull;
    else {
      xpText.replaceChildren(h('span', '', w.xpNow), h('span', '', `/ ${w.xpNeed} XP`));
    }
    xpText.classList.toggle('is-full', w.atCap);
    plateName.textContent = w.tierName;
    plateMark.textContent = w.atCap && w.tierUp ? '▲' : '';
    plate.classList.toggle('is-open', w.atCap && Boolean(w.tierUp));
    const pct = Math.round(w.xp * 100);
    stage.setAttribute('aria-valuenow', String(pct));
    stage.setAttribute('aria-label', COPY.weapon.panel(w.weapon));
    stage.setAttribute(
      'aria-valuetext',
      `${COPY.weapon.levelLabel(w.level, w.cap)}, ${w.tierName}, ${w.stars} of ${STARS} stars, ${w.atCap ? COPY.weapon.xpFull : COPY.weapon.xpLabel(pct)}`,
    );
  }

  function drawOverlay(w: WeaponView): void {
    if (!overlay || !xpFill) return;
    overlay.dataset.tier = w.tier;
    overlay.classList.toggle('is-max', w.atCap);
    xpFill.style.width = `${(w.xp * 100).toFixed(1)}%`;
    const pct = Math.round(w.xp * 100);
    overlay.setAttribute('aria-valuenow', String(pct));
    overlay.setAttribute('aria-label', COPY.weapon.panel(w.weapon));
    overlay.setAttribute(
      'aria-valuetext',
      `${COPY.weapon.levelLabel(w.level, w.cap)}, ${w.atCap ? COPY.weapon.xpFull : COPY.weapon.xpLabel(pct)}`,
    );
  }

  return {
    el: root,
    overlay,
    update(entry) {
      const w = entry.weapon;
      root.hidden = !w;
      if (overlay) overlay.hidden = !w;
      if (!w) return;
      root.dataset.tier = w.tier;
      badgeNum.textContent = String(w.level);
      badgeSub.textContent = w.atCap ? COPY.weapon.max : COPY.weapon.level;
      drawStage(entry, w);
      drawOverlay(w);
      drawSide(w);
    },
  };
}
