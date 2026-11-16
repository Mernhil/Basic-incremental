import { buyHeirloomNode, resolveCard, respecHeirloomTree, type GameState } from '../../../game';
import { COPY } from '../copy';
import { frame, h } from '../shell/shell';
import { attachTooltip, hide as hideTip } from '../shell/tooltip';
import { createCard } from '../ui/card';
import { fitCard } from '../ui/pixelFit';
import { glyphSvg } from '../ui/webGlyphs';
import { createCardsModel } from './cardsAdapter';
import type { CardsModel } from './cardsModel';
import {
  CARD_BOX,
  heirloomMapView,
  type ClusterView,
  type HeirloomMapView,
  type PerkView,
} from './heirloomMapModel';
import type { PageContext } from './production';
import './heirloomsMap.css';

/**
 * The Heirlooms tab (UI_RULES.md §2 The Skill Tree, pick 4c): a map you pan and zoom, one cluster
 * per Heirloom with its real card as the hub and its perks fanning out to the keystone. An Heirloom
 * you have not found is a dim striped card back. Buying is `buyHeirloomNode`; the points come from
 * the Heirloom itself (stars and levels), so nothing here is paid in materials.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const START_SCALE = 0.85;
const MIN_SCALE = 0.35;
const MAX_SCALE = 1.4;
const GOLD = '#ffd45a';

export interface HeirloomsTab {
  /** The stage frame and the side panel for the current state. */
  build(): { stage: HTMLElement; panel: HTMLElement };
  /** Changes whenever what the tab shows changes. */
  signature(): string;
  /** Perks that can be bought now. */
  affordable(): number;
  /** Puts the camera back at the first Heirloom (the tab was just opened). */
  resetView(): void;
  /** Heirlooms found / all, for the title bar. */
  counts(): { found: number; total: number };
}

export interface HeirloomsTabContext extends PageContext {
  /** Rebuild the page (after a purchase or a selection). */
  rebuild: (focusKey?: string) => void;
  sound?: (id: 'skillLearn' | 'buy') => void;
}

export function createHeirloomsTab(ctx: HeirloomsTabContext): HeirloomsTab {
  const { content } = ctx;
  const t = COPY.heirloomMap;
  let cardsModel: CardsModel | null = null;
  const camera = { scale: START_SCALE, x: 0, y: 0, placed: false };
  let selected: { card: string; perk: string } | null = null;
  let message = '';

  const view = (): HeirloomMapView => heirloomMapView(content, ctx.state());

  function pickDefault(v: HeirloomMapView): void {
    const still = selected && v.clusters.find((c) => c.cardId === selected!.card);
    if (still) return;
    const c =
      v.clusters.find((x) => x.found && x.perks.some((p) => p.affordable)) ??
      v.clusters.find((x) => x.found) ??
      v.clusters[0];
    selected = c
      ? { card: c.cardId, perk: (c.perks.find((p) => p.affordable) ?? c.perks[0])!.id }
      : null;
  }

  function cardHub(c: ClusterView): HTMLElement {
    const box = h('div', 'hmap-card');
    box.style.left = `${c.x}px`;
    box.style.top = `${c.y}px`;
    if (!c.found) {
      box.classList.add('is-back');
      box.append(h('span', 'hmap-card__q', '?'));
      return box;
    }
    cardsModel ??= createCardsModel(content);
    const state = ctx.state();
    const e = cardsModel.entries(state).find((x) => x.id === c.cardId);
    if (!e) return box;
    const view = createCard({
      name: e.name,
      label: 'Fighting',
      job: e.job,
      emblem: e.emblem,
      item: e.item,
      element: e.element,
      rank: e.rank,
      rarity: e.rarity,
      face: e.face,
      theme: resolveCard(content, state.cosmetics.loadout, {
        id: e.id,
        rank: e.rank,
        rarity: e.rarity,
      }),
    });
    view.el.removeAttribute('aria-label');
    view.el.setAttribute('aria-hidden', 'true');
    const fit = h('span', 'cp-fit cp-fit--lv');
    fit.append(view.el);
    box.append(fit);
    fitCard(box, { want: CARD_BOX.w, max: () => CARD_BOX.w });
    return box;
  }

  function perkEl(c: ClusterView, p: PerkView): HTMLElement {
    const b = h(
      'button',
      `hmap-perk is-${c.found ? p.state : 'unfound'}${p.affordable ? ' can-buy' : ''}${p.capstone ? ' is-cap' : ''}${
        selected?.card === c.cardId && selected.perk === p.id ? ' is-selected' : ''
      }`,
    );
    b.type = 'button';
    b.dataset.key = `perk-${c.cardId}-${p.id}`;
    b.style.left = `${c.x + p.dx}px`;
    b.style.top = `${c.y + p.dy}px`;
    b.setAttribute('aria-label', c.found ? p.label : t.unfoundPerk);
    b.setAttribute('aria-pressed', String(selected?.card === c.cardId && selected.perk === p.id));
    const plate = h('span', 'hmap-perk__plate');
    plate.innerHTML = c.found ? glyphSvg(p.glyph, GOLD) : glyphSvg('lock', '#8a92c0');
    b.append(plate);
    if (c.found) {
      b.append(h('span', 'hmap-perk__lv bi-num', p.state === 'bought' ? '1/1' : '0/1'));
      b.append(h('span', `hmap-perk__name${p.labelTop ? ' is-top' : ''}`, p.name));
      attachTooltip(b, () => {
        const box = h('div', 'sk-tip');
        box.append(h('p', 'shell-tip__title', p.name));
        box.append(h('p', 'sk-tip__rank', `${p.description} · ${COPY.cards.gemCost(p.cost)}`));
        return box;
      });
    }
    b.addEventListener('click', () => {
      selected = { card: c.cardId, perk: p.id };
      message = '';
      ctx.rebuild(`perk-${c.cardId}-${p.id}`);
    });
    b.addEventListener('dblclick', () => {
      if (p.affordable) buy(c, p);
    });
    return b;
  }

  function buy(c: ClusterView, p: PerkView): void {
    const r = buyHeirloomNode(ctx.state(), content, c.cardId, p.id);
    if (!r.ok) {
      message = t.reasons[r.reason] ?? '';
      ctx.rebuild();
      return;
    }
    ctx.apply(r.state);
    ctx.sound?.('skillLearn');
    message = t.bought(p.name);
    ctx.rebuild('buy');
  }

  // ---- pan and zoom ----
  function applyCamera(stage: HTMLElement, world: HTMLElement): void {
    const rect = stage.getBoundingClientRect();
    const v = view();
    if (!camera.placed && rect.width > 0) {
      // the first Heirloom sits at the left, its perks and the next one to its right; a narrow
      // window starts further out so both fit
      camera.scale = Math.min(START_SCALE, Math.max(0.5, (rect.width - 60) / 1450));
      camera.x = Math.min(210, rect.width * 0.14) - v.start.x * camera.scale;
      camera.y = rect.height * 0.42 - v.start.y * camera.scale;
      camera.placed = true;
    }
    world.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;
  }
  function zoomAt(
    stage: HTMLElement,
    world: HTMLElement,
    scale: number,
    cx: number,
    cy: number,
  ): void {
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
    const k = next / camera.scale;
    camera.x = cx - (cx - camera.x) * k;
    camera.y = cy - (cy - camera.y) * k;
    camera.scale = next;
    applyCamera(stage, world);
  }
  function enablePanZoom(stage: HTMLElement, world: HTMLElement): void {
    let drag: {
      id: number;
      sx: number;
      sy: number;
      cx: number;
      cy: number;
      moved: boolean;
    } | null = null;
    stage.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const r = stage.getBoundingClientRect();
        zoomAt(
          stage,
          world,
          camera.scale * Math.exp(-e.deltaY * 0.0015),
          e.clientX - r.left,
          e.clientY - r.top,
        );
      },
      { passive: false },
    );
    stage.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest('.sk-zoom, .sk-tabs, .sk-count'))
        return;
      drag = {
        id: e.pointerId,
        sx: e.clientX,
        sy: e.clientY,
        cx: camera.x,
        cy: camera.y,
        moved: false,
      };
    });
    stage.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.sx;
      const dy = e.clientY - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) < 5) return;
      if (!drag.moved) {
        drag.moved = true;
        stage.setPointerCapture(e.pointerId);
        stage.classList.add('is-panning');
      }
      camera.x = drag.cx + dx;
      camera.y = drag.cy + dy;
      applyCamera(stage, world);
    });
    const end = (e: PointerEvent): void => {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.moved)
        stage.addEventListener('click', (c) => c.stopPropagation(), { capture: true, once: true });
      drag = null;
      stage.classList.remove('is-panning');
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
  }
  function zoomButtons(stage: HTMLElement, world: HTMLElement): HTMLElement {
    const bar = h('div', 'sk-zoom');
    const mk = (text: string, label: string, go: () => void): void => {
      const b = h('button', 'button button--ghost sk-zoom__btn', text);
      b.type = 'button';
      b.setAttribute('aria-label', label);
      b.addEventListener('click', go);
      bar.append(b);
    };
    const mid = (): [number, number] => {
      const r = stage.getBoundingClientRect();
      return [r.width / 2, r.height / 2];
    };
    mk('+', COPY.skills.zoomIn, () => zoomAt(stage, world, camera.scale * 1.25, ...mid()));
    mk('−', COPY.skills.zoomOut, () => zoomAt(stage, world, camera.scale / 1.25, ...mid()));
    mk('⌂', COPY.skills.zoomReset, () => {
      camera.placed = false;
      applyCamera(stage, world);
    });
    bar.append(h('span', 'sk-zoom__hint', t.panHint));
    return bar;
  }

  // ---- the map ----
  function lines(v: HeirloomMapView): SVGElement {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'hmap-lines');
    svg.setAttribute('aria-hidden', 'true');
    const add = (x1: number, y1: number, x2: number, y2: number, cls: string): void => {
      const l = document.createElementNS(SVG_NS, 'line');
      l.setAttribute('x1', String(x1));
      l.setAttribute('y1', String(y1));
      l.setAttribute('x2', String(x2));
      l.setAttribute('y2', String(y2));
      l.setAttribute('class', cls);
      svg.append(l);
    };
    for (const c of v.clusters) {
      const by = new Map(c.perks.map((p) => [p.id, p]));
      for (const p of c.perks) {
        const from = p.requires.length
          ? p.requires.map((r) => by.get(r)).filter((x) => x !== undefined)
          : [];
        const on = (a: PerkView | null): string =>
          !c.found
            ? 'is-unfound'
            : p.state === 'bought' && (a === null || a.state === 'bought')
              ? 'is-on'
              : 'is-off';
        if (from.length === 0) add(c.x + CARD_BOX.w / 2, c.y, c.x + p.dx, c.y + p.dy, on(null));
        for (const a of from) add(c.x + a.dx, c.y + a.dy, c.x + p.dx, c.y + p.dy, on(a));
      }
    }
    return svg;
  }

  function caption(c: ClusterView): HTMLElement {
    const el = h('div', `hmap-caption${c.found ? '' : ' is-unfound'}`);
    el.style.left = `${c.x}px`;
    el.style.top = `${c.y + CARD_BOX.h / 2 + 30}px`;
    el.append(h('b', '', c.found ? c.title : t.unfoundName));
    el.append(h('span', '', c.found ? `${c.cardName} · ${c.pointsText}` : t.unfound));
    return el;
  }

  function stage(v: HeirloomMapView): HTMLElement {
    const el = h('section', 'frame sk-frame');
    el.setAttribute('aria-label', t.map);
    el.dataset.deal = '';
    const body = h('div', 'frame__body');
    el.append(body);
    const st = h('div', 'sk-stage hmap-stage');
    const world = h('div', 'hmap-world');
    world.append(lines(v));
    for (const c of v.clusters) world.append(cardHub(c), caption(c));
    for (const c of v.clusters) for (const p of c.perks) world.append(perkEl(c, p));
    st.append(world, zoomButtons(st, world));
    enablePanZoom(st, world);
    body.append(st);
    queueMicrotask(() => applyCamera(st, world));
    applyCamera(st, world);
    return el;
  }

  function panel(v: HeirloomMapView): HTMLElement {
    const c = v.clusters.find((x) => x.cardId === selected?.card);
    const p = c?.perks.find((x) => x.id === selected?.perk);
    const { el, body } = frame(
      p && c?.found ? p.name : t.map,
      c
        ? c.found
          ? t.sub(c.title, p ? (t.stateWord[p.state] ?? '') : '')
          : t.unfoundName
        : undefined,
    );
    el.classList.add('sk-detail', 'hmap-detail');
    el.dataset.deal = '';
    const points = h('div', 'sk-points');
    points.append(
      h('span', 'sk-points__label', c?.found ? t.pointsHeading(c.title) : t.pointsHeadingNone),
      h('span', 'sk-points__num px-display bi-num', c?.found ? String(c.free) : '0'),
    );
    el.prepend(points);
    if (!c || !p) {
      body.append(h('p', 'frame__muted', t.pick));
      return el;
    }
    if (!c.found) {
      body.append(h('p', 'frame__muted', COPY.cards.heirloomLocked));
      return el;
    }
    el.style.setProperty('--gem', GOLD);
    const art = h('div', 'sk-art');
    const plate = h('span', `hmap-bigplate is-${p.state}${p.affordable ? ' can-buy' : ''}`);
    plate.innerHTML = glyphSvg(p.glyph, GOLD);
    const text = h('div', 'sk-art__text');
    text.append(h('b', 'bi-num', p.description));
    if (p.capstone) text.append(h('span', 'sw-tag', t.keystone));
    art.append(plate, text);
    const rows = h('dl', 'sk-rows');
    const row = (label: string, value: string): void => {
      const r = h('div', 'sk-row');
      r.append(h('dt', '', label), h('dd', 'bi-num', value));
      rows.append(r);
    };
    row(COPY.skills.now, p.state === 'bought' ? p.description : COPY.skills.none);
    row(COPY.skills.afterLine, p.state === 'bought' ? t.bought2 : p.description);
    row(COPY.skills.costLine, p.state === 'bought' ? t.owned : t.cost(p.cost, c.free));
    if (p.state === 'locked') {
      const need = c.perks
        .filter((x) => p.requires.includes(x.id))
        .map((x) => x.name)
        .join(` ${t.or} `);
      row(t.needsLine, need);
    }
    body.append(art, rows);
    const b = h('button', 'button sk-buy', p.state === 'bought' ? t.owned : t.learn(p.cost));
    b.type = 'button';
    b.dataset.key = 'buy';
    b.disabled = !p.affordable;
    b.addEventListener('click', () => buy(c, p));
    body.append(b);
    if (p.state === 'open' && !p.affordable)
      body.append(h('p', 'frame__muted sk-hint', t.noPoints));
    if (message) body.append(h('p', 'frame__muted sk-hint', message));
    const respec = h('button', 'button button--ghost sk-respec__btn', t.respec(c.title));
    respec.type = 'button';
    respec.dataset.key = 'respec';
    respec.disabled = c.spent === 0;
    respec.addEventListener('click', () => {
      ctx.apply(respecHeirloomTree(ctx.state(), c.cardId));
      message = t.respecDone;
      ctx.rebuild('respec');
    });
    body.append(respec);
    return el;
  }

  return {
    build() {
      hideTip();
      const v = view();
      pickDefault(v);
      return { stage: stage(v), panel: panel(v) };
    },
    signature() {
      const s: GameState = ctx.state();
      const v = view();
      return JSON.stringify([
        s.heirlooms.trees,
        v.clusters.map((c) => [c.found, c.earned]),
        s.cosmetics.loadout.slots,
        selected,
      ]);
    },
    resetView: () => {
      camera.placed = false;
    },
    affordable: () => view().affordable,
    counts: () => {
      const v = view();
      return { found: v.found, total: v.total };
    },
  };
}
