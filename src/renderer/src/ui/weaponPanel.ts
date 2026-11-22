import type { Content } from '../../../data';
import type { GameState } from '../../../game';
import { COPY } from '../copy';
import type { CardEntry, StatChange, WeaponView } from '../pages/cardsModel';
import { h } from '../shell/shell';
import { setStarText } from './stars';
import { costMarkup } from './costMarkup';
import { movesView, type MovesView } from '../pages/movesModel';
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
  act: (kind: 'star' | 'dust' | 'skill') => void;
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
  const { variant } = opts;
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
  const pipEls = Array.from({ length: STARS }, (_, i) => {
    const cell = h('i', 'bi-star');
    cell.dataset['i'] = String(i);
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

  // ---- both: the card's three attacks and the skill's unlock (DESIGN.md §2 Three attacks) ----
  const attacks = h('section', 'wp-attacks');
  attacks.setAttribute('aria-label', COPY.moves.title);
  const attacksList = h('ul', 'wp-attacks__list');
  attacks.append(h('span', 'wp-tile__label', COPY.moves.title), attacksList);
  if (variant === 'card') {
    attacks.classList.add('wp-tile', 'px-tile');
    root.insertBefore(attacks, tagHost);
  } else side.append(attacks);

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
  /** The stats an upgrade changes, "now → after" with the gain in green. */
  function changeList(rows: readonly StatChange[]): HTMLElement | null {
    if (rows.length === 0) return null;
    const ul = h('ul', 'wp-changes');
    ul.setAttribute('aria-label', COPY.weapon.changesLead);
    for (const r of rows) {
      const li = h('li', 'wp-change');
      li.append(
        h('span', 'wp-change__label', r.label),
        h('span', 'wp-change__now bi-num', r.now),
        h('span', 'wp-change__arrow', '→'),
        h('span', 'wp-change__after bi-num', r.after),
      );
      if (r.gain) li.append(h('span', 'wp-change__gain bi-num', r.gain));
      ul.append(li);
    }
    return ul;
  }

  let sideSig = '';
  function drawSide(w: WeaponView): void {
    // star line
    if (w.starBar) {
      setStarText(starMain, w.starBar.text);
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

    const sig = JSON.stringify([
      w.stars,
      w.starBar?.ready,
      w.starBar?.dust,
      w.starStats,
      w.breakthrough,
      w.endNote,
    ]);
    if (sig === sideSig) return;
    sideSig = sig;
    const keep = root.contains(document.activeElement);
    const focused = (document.activeElement as HTMLElement | null)?.dataset['key'];

    starHost.replaceChildren();
    if (w.starBar?.ready) {
      const b = setStarText(h('button', 'button wp-add'), COPY.weapon.addStar(w.stars + 1));
      b.type = 'button';
      b.dataset.key = 'wp-star';
      b.addEventListener('click', () => opts.act('star'));
      starHost.append(b);
    } else if (w.starBar?.dust) {
      const d = w.starBar.dust;
      const b = setStarText(h('button', 'button wp-add'), d.label);
      b.type = 'button';
      b.dataset.key = 'wp-dust';
      if (!d.affordable) b.setAttribute('aria-disabled', 'true');
      b.addEventListener('click', () => {
        if (b.getAttribute('aria-disabled') !== 'true') opts.act('dust');
      });
      starHost.append(b);
    }
    const starChanges = w.starBar ? changeList(w.starStats) : null;
    if (starChanges) starHost.append(starChanges);

    tagHost.replaceChildren();
    // there is no tier-up step (DESIGN.md §5 No tier-ups): only the note
    if (w.breakthrough) {
      const note = h('p', 'wp-end wp-break', w.breakthrough);
      if (variant === 'card') note.classList.add('wp-tile', 'px-tile');
      tagHost.append(note);
    }
    const end = h('p', 'wp-end', w.endNote);
    if (variant === 'card') end.classList.add('wp-tile', 'px-tile');
    tagHost.append(end);
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
    plateMark.textContent = '';
    plate.classList.remove('is-open');
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
    pipEls.forEach((p, i) => p.classList.toggle('bi-star--on', i < w.stars));
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

  let movesSig = '';
  let movesAt = 0;
  let movesFor = '';
  function drawAttacks(cardId: string): void {
    // the numbers need the modifiers: read at most twice a second, redrawn only on change
    const now = Date.now();
    if (cardId === movesFor && now - movesAt < 500) return;
    movesAt = now;
    movesFor = cardId;
    const state = opts.state();
    const view: MovesView | null = movesView(state, opts.content, cardId);
    attacks.hidden = !view;
    if (!view) return;
    const sig = JSON.stringify(view);
    if (sig === movesSig) return;
    movesSig = sig;
    const keep = attacks.contains(document.activeElement);
    attacksList.replaceChildren(
      ...view.rows.map((row) => {
        const li = h('li', 'wp-attack');
        li.dataset['kind'] = row.kind;
        const head = h('p', 'wp-attack__head');
        head.append(h('span', 'wp-attack__label', row.label));
        if (row.name) head.append(h('b', 'wp-attack__name', row.name));
        li.append(head);
        if (row.text) li.append(h('p', 'wp-attack__text bi-num', row.text));
        if (row.effects.length > 0) {
          const ul = h('ul', 'wp-attack__effects');
          for (const e of row.effects) ul.append(h('li', '', e));
          li.append(ul);
        }
        if (row.note) li.append(h('p', 'wp-attack__note', row.note));
        if (row.kind === 'skill' && view.unlock) {
          const box = h('div', 'wp-unlock');
          const price = h('span', 'wp-unlock__price');
          price.innerHTML = costMarkup(
            opts.content,
            state,
            view.unlock.cost,
            () => !view.unlock!.affordable,
          );
          const b = h('button', 'button wp-add wp-unlock__open', COPY.moves.open);
          b.type = 'button';
          b.dataset.key = 'wp-skill';
          b.setAttribute('aria-label', COPY.moves.openFor);
          if (!view.unlock.affordable) {
            b.setAttribute('aria-disabled', 'true');
            b.title = COPY.moves.short;
          }
          b.addEventListener('click', () => {
            if (b.getAttribute('aria-disabled') !== 'true') opts.act('skill');
          });
          box.append(b, price);
          li.append(box);
        }
        return li;
      }),
    );
    if (keep) attacks.querySelector<HTMLElement>('[data-key="wp-skill"]')?.focus();
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
      drawAttacks(entry.id);
    },
  };
}
