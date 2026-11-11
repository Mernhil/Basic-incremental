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
 * - `card`: the Cards detail (UI rework 2.2). A large level badge lies on the card at 2x
 *   (`overlay`, put inside the card's host) and `el` is a column of pixel tiles to go beside it:
 *   the tier with its star pips and star bar, the card XP with its bar, the tier-up price list
 *   (missing amounts in red) and, under it, the tier-up button (dark, with the reason, when it
 *   cannot be taken).
 *
 * All numbers come from the entry's `WeaponView`; this file only draws them and forwards the two
 * buttons (add star, tier up) to `act`.
 */

export interface WeaponPanelOptions {
  variant: 'drawer' | 'card';
  content: Content;
  state: () => GameState;
  /** Takes the star-up or the tier-up (the page runs the game action and re-renders). */
  act: (kind: 'star' | 'tier' | 'dust') => void;
}

export interface WeaponPanel {
  /** The panel (drawer: stage and side; card: the column of tiles, to go beside the card). */
  el: HTMLElement;
  /** Card variant: the level badge to put on the card's host. Null in the drawer. */
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

/** A 7 x 7 pixel star, drawn as rows of whole art pixels (crisp at a whole scale). */
const PIP_PATH =
  'M3 0h1v1H3zM2 1h3v1H2zM0 2h7v1H0zM1 3h5v1H1zM2 4h3v1H2zM1 5h2v1H1zM4 5h2v1H4zM1 6h1v1H1zM5 6h1v1H5z';

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

function pipArt(): SVGSVGElement {
  const art = el('svg', {
    viewBox: '0 0 7 7',
    class: 'wp-pip-art',
    'shape-rendering': 'crispEdges',
  });
  art.setAttribute('aria-hidden', 'true');
  art.setAttribute('focusable', 'false');
  art.append(el('path', { d: PIP_PATH }));
  return art;
}

export function createWeaponPanel(opts: WeaponPanelOptions): WeaponPanel {
  const { content, variant } = opts;
  const id = `wp${++uid}`;
  const root = h('div', `wp wp--${variant}`);

  // ---- the side: star line, add star, tier-up tag ----
  const side = h('div', 'wp-side');
  const starLine = h('p', 'wp-stars bi-num');
  starLine.tabIndex = -1; // where focus lands when the button it was on goes away (a star was taken)
  const starMain = h('b');
  const starImpact = h('span');
  starLine.append(starMain, starImpact);
  const starHost = h('div', 'wp-starbtn');
  const tagHost = h('div', 'wp-taghost');
  side.append(starLine, starHost, tagHost);

  // ---- card variant: the tiles (tier and stars, card XP) ----
  const tierValue = h('b', 'wp-tile__value px-display');
  const pipEls = Array.from({ length: STARS }, () => {
    const cell = h('span', 'wp-pipcell');
    cell.append(pipArt());
    return cell;
  });
  const starGauge = h('i');
  const xpTileValue = h('b', 'wp-tile__value wp-tile__value--xp px-display');
  const xpBar = h('div', 'wp-xpbar');
  const xpFill = h('i');
  xpBar.append(xpFill);
  xpBar.setAttribute('role', 'meter');
  xpBar.setAttribute('aria-valuemin', '0');
  xpBar.setAttribute('aria-valuemax', '100');

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
    const tierTile = h('div', 'wp-tile px-tile wp-tile--tier');
    const pipRow = h('span', 'wp-pips');
    pipRow.setAttribute('aria-hidden', 'true');
    pipRow.append(...pipEls);
    const mini = h('div', 'wp-mini');
    mini.setAttribute('aria-hidden', 'true');
    mini.append(starGauge);
    tierTile.append(
      h('span', 'wp-tile__label', COPY.weapon.tierLabel),
      tierValue,
      pipRow,
      starLine,
      mini,
      starHost,
    );
    const xpTile = h('div', 'wp-tile px-tile wp-tile--xp');
    xpTile.append(h('span', 'wp-tile__label', COPY.weapon.xpLabelShort), xpTileValue, xpBar);
    root.append(tierTile, xpTile, tagHost);
  }

  // ---- card variant: the overlay (the large level badge) ----
  let overlay: HTMLElement | null = null;
  if (variant === 'card') {
    overlay = h('div', 'wp-over');
    overlay.setAttribute('aria-hidden', 'true');
    badge.classList.add('wp-chip');
    badgeNum.classList.add('px-display');
    overlay.append(badge);
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

  /** One row of the card variant's price list: art, name, then the amount (have / need if short). */
  function priceRow(
    art: Node,
    name: string,
    amounts: { have: string; need: string },
    met: boolean,
    plain: boolean,
    title: string,
  ): HTMLElement {
    const li = h(
      'li',
      `wp-cost wp-cost--row ${met ? 'is-met' : 'is-missing'}${!met && plain ? ' is-plain' : ''}`,
    );
    li.title = title;
    const slot = h('span', 'wp-cost__art');
    slot.setAttribute('aria-hidden', 'true');
    slot.append(art);
    const amount = h('span', 'wp-cost__amount bi-num');
    if (met || plain) amount.append(h('b', '', amounts.need));
    else amount.append(h('b', '', amounts.have), h('small', '', `/ ${amounts.need}`));
    li.append(slot, h('span', 'wp-cost__name', name), amount);
    return li;
  }

  function cardPriceRows(w: WeaponView, t: NonNullable<WeaponView['tierUp']>): HTMLElement[] {
    const rows: HTMLElement[] = [];
    // while the card is still levelling, the prices are not scolded in red
    const leveling = t.phase === 'leveling';
    if (!t.levelMet) {
      rows.push(
        priceRow(
          h('span', 'wp-cost__lv', 'Lv'),
          COPY.weapon.levelRow,
          { have: String(w.level), need: String(w.cap) },
          false,
          false,
          COPY.weapon.levelLabel(w.level, w.cap),
        ),
      );
    }
    for (const c of t.costs) {
      const markup = costArt(c.id);
      const art = h('span', 'wp-cost__img');
      if (markup) art.innerHTML = markup;
      else art.append(icon('material', 'wp-cost__icon'));
      rows.push(
        priceRow(
          art,
          c.name,
          { have: c.have, need: c.need },
          c.met,
          leveling,
          COPY.weapon.costTitle(c.name, c.have, c.need),
        ),
      );
    }
    rows.push(
      priceRow(
        pipArt(),
        COPY.weapon.starsRow,
        { have: String(w.stars), need: String(STARS) },
        t.starsMet,
        false,
        COPY.weapon.starOf(w.stars, STARS),
      ),
    );
    return rows;
  }

  let sideSig = '';
  function drawSide(w: WeaponView): void {
    // star line
    if (w.starBar) {
      starMain.textContent = w.starBar.text;
      starLine.title = w.starBar.title;
      starImpact.textContent = w.starBar.impact;
      starLine.hidden = false;
    } else {
      starMain.textContent = COPY.weapon.allStars;
      starLine.removeAttribute('title');
      starImpact.textContent = '';
      starLine.hidden = false;
    }
    starLine.style.setProperty('--gauge', `${((w.starBar?.gauge ?? 1) * 100).toFixed(1)}%`);

    const sig = JSON.stringify([w.stars, w.starBar?.ready, w.starBar?.dust, w.tierUp, w.endNote]);
    if (sig === sideSig) return;
    sideSig = sig;
    const keep = root.contains(document.activeElement);
    const focused = (document.activeElement as HTMLElement | null)?.dataset['key'];

    starHost.replaceChildren();
    if (w.starBar?.ready) {
      const b = h('button', 'button wp-add', COPY.weapon.addStar(w.stars + 1));
      b.type = 'button';
      b.dataset.key = 'wp-star';
      b.addEventListener('click', () => opts.act('star'));
      starHost.append(b);
    } else if (w.starBar?.dust) {
      const d = w.starBar.dust;
      const b = h('button', 'button wp-add', d.label);
      b.type = 'button';
      b.dataset.key = 'wp-dust';
      if (!d.affordable) b.setAttribute('aria-disabled', 'true');
      b.addEventListener('click', () => {
        if (b.getAttribute('aria-disabled') !== 'true') opts.act('dust');
      });
      starHost.append(b);
    }

    tagHost.replaceChildren();
    const t = w.tierUp;
    if (!t) {
      const end = h('p', 'wp-end', w.endNote ?? '');
      if (variant === 'card') end.classList.add('wp-tile', 'px-tile');
      tagHost.append(end);
    } else {
      const tiles = variant === 'card';
      const tag = h('div', `wp-tag is-${t.phase}`);
      tag.dataset.to = t.toTier;
      const lead = h('p', 'wp-lead', tiles ? COPY.weapon.tierUpTo(t.toName) : t.lead);
      lead.id = `${id}-lead`;
      const list = h('ul', 'wp-costs');
      list.setAttribute('aria-labelledby', lead.id);
      if (tiles) list.append(...cardPriceRows(w, t));
      else for (const c of t.costs) list.append(costItem(c, w.atCap));
      const go = h(
        'button',
        `button wp-go${t.ready ? ' is-ready' : ''}`,
        tiles && !t.ready ? t.blocker : t.action,
      );
      go.type = 'button';
      go.dataset.key = 'wp-tier';
      go.setAttribute('aria-disabled', String(!t.ready));
      const hint = t.missing && !tiles ? h('p', 'wp-hint', t.missing) : null;
      if (hint) hint.id = `${id}-hint`;
      go.setAttribute('aria-describedby', hint ? `${id}-lead ${id}-hint` : `${id}-lead`);
      go.addEventListener('click', () => {
        if (go.getAttribute('aria-disabled') !== 'true') opts.act('tier');
      });
      if (tiles) {
        tag.classList.add('px-tile', 'wp-tile');
        tag.append(lead, list);
        tagHost.append(tag, go);
      } else {
        tag.append(lead, list, go);
        if (hint) tag.append(hint);
        tagHost.append(tag);
      }
    }
    if (keep && focused) {
      (root.querySelector<HTMLElement>(`[data-key="${focused}"]`) ?? starLine).focus();
    }
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

  function drawTiles(w: WeaponView): void {
    tierValue.textContent = w.tierName;
    pipEls.forEach((p, i) => p.classList.toggle('is-on', i < w.stars));
    starGauge.style.width = `${((w.starBar?.gauge ?? 1) * 100).toFixed(1)}%`;
    xpTileValue.textContent = w.atCap ? COPY.weapon.xpFull : COPY.weapon.xpOf2(w.xpNow, w.xpNeed);
    xpBar.classList.toggle('is-max', w.atCap);
    xpFill.style.width = `${(w.xp * 100).toFixed(1)}%`;
    const pct = Math.round(w.xp * 100);
    xpBar.setAttribute('aria-valuenow', String(pct));
    xpBar.setAttribute('aria-label', COPY.weapon.panel(w.weapon));
    xpBar.setAttribute(
      'aria-valuetext',
      `${COPY.weapon.levelLabel(w.level, w.cap)}, ${w.atCap ? COPY.weapon.xpFull : COPY.weapon.xpLabel(pct)}`,
    );
    if (overlay) overlay.dataset.tier = w.tier;
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
      if (variant === 'card') drawTiles(w);
      drawSide(w);
    },
  };
}
