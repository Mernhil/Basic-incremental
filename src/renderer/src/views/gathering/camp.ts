import {
  assignSlotCard,
  campLevelCost,
  canAfford,
  cardDisplayName,
  collectModifiers,
  isOnTrip,
  openSlots,
  placeJob,
  placeSlot,
  slotAt,
  slotOfCard,
  upgradeCamp,
  workerPower,
  type CampPlace,
} from '../../../../game';
import { cardItemArt } from '../../pages/loadoutCards';
import { COPY } from '../../copy';
import { HUB_MAP_H, HUB_MAP_W, coverScale, hubOffset } from '../../hub/hubModel';
import { fmt } from '../../settings/numberFormat';
import { costMarkup } from '../../ui/costMarkup';
import { h } from '../../shell/shell';
import type { TableContext, ViewHandle } from '../../table/contract';
import { campScreen, type NodeView } from './campModel';
import {
  dimImage,
  glowImage,
  loadMapPixels,
  loadNodeMask,
  maskHit,
  nodeMaskUrl,
  SCENE_URL,
  type Mask,
} from './campScene';
import { GATHERING_COPY as T } from './copy';
import { itemSvg } from './jobModel';
import { workerPickList, workerPickTile } from './workerPick';

/**
 * The forest and the mine (DESIGN.md section 2 Base camp): the painted scene at a whole scale,
 * centred like the hub, with each material a tree or a vein lit by its mask. The slots of a node
 * stand at its foot; a slot opened by a camp level waits until the player places it on a node. The
 * camp level and its price sit in a bar at the bottom. Tools are chosen with the card picker.
 */

/** The node panel's width in scene pixels. Panels stand on the bar, whatever the scale. */
const PANEL_W = 200;
const LOCK_Y = 180;

interface Node {
  id: string;
  mask: Mask | null;
  el: HTMLElement;
  slots: HTMLElement;
  label: HTMLElement;
  labelName: HTMLElement;
  labelRate: HTMLElement;
  lock: HTMLElement;
  glow: HTMLCanvasElement;
  dim: HTMLCanvasElement;
  view: NodeView | null;
  /** Where the panel's centre stands, in scene pixels. */
  cx: number;
}

const set = (node: HTMLElement, text: string): void => {
  if (node.textContent !== text) node.textContent = text;
};

const reduced = (): boolean =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export function createCampView(host: HTMLElement, ctx: TableContext, place: CampPlace): ViewHandle {
  const { content } = ctx;
  const job = placeJob(place);
  host.classList.add('camp', `camp--${place}`, 'shell-page--stage');

  const view = h('div', 'camp__view');
  /** The painted scene: one named place for the background picture and the nodes on it. */
  const scene = h('div', 'camp__scene');
  scene.dataset['scene'] = place;
  const img = h('img', 'camp__img') as HTMLImageElement;
  img.src = SCENE_URL[place];
  img.alt = '';
  img.draggable = false;
  img.setAttribute('aria-hidden', 'true');
  scene.append(img);
  view.append(scene);

  const bar = h('section', 'camp__bar px-panel');
  const levelText = h('b', 'camp__level px-display');
  const next = h('span', 'camp__next');
  const upgrade = h('button', 'px-btn camp__upgrade');
  upgrade.type = 'button';
  upgrade.dataset['key'] = 'camp-upgrade';
  const cost = h('span', 'camp__cost bi-num');
  const total = h('span', 'camp__total bi-num');
  bar.append(levelText, next, upgrade, cost, total);

  const picker = h('div', 'camp__picker px-panel');
  picker.hidden = true;
  picker.setAttribute('role', 'dialog');
  host.append(view, bar, picker);

  let scale = 0;
  let area = '';
  let sceneData: ImageData | null = null;
  let hovered: Node | null = null;
  let selected: string | null = null;
  let picking: { index: number; material: string } | null = null;
  let sig = '';

  const nodes: Node[] = [];

  function paintGlow(n: Node): void {
    if (!n.mask || !sceneData) return;
    const g = n.glow.getContext('2d');
    g?.putImageData(glowImage(n.mask, sceneData), 0, 0);
    const d = n.dim.getContext('2d');
    d?.putImageData(dimImage(n.mask, sceneData), 0, 0);
  }

  function light(n: Node | null): void {
    if (n === hovered) return;
    hovered?.glow.classList.remove('is-hover');
    hovered = n;
    n?.glow.classList.add('is-hover');
    scene.style.cursor = n && n.view?.locked ? 'not-allowed' : n ? 'pointer' : '';
  }

  function select(n: Node): void {
    if (n.view?.locked) return;
    selected = selected === n.id ? null : n.id;
    for (const o of nodes) o.glow.classList.toggle('is-selected', o.id === selected);
    for (const o of nodes) o.el.classList.toggle('is-selected', o.id === selected);
  }

  function nodeAt(clientX: number, clientY: number): Node | null {
    if (scale === 0) return null;
    const r = scene.getBoundingClientRect();
    const x = Math.floor((clientX - r.left) / scale);
    const y = Math.floor((clientY - r.top) / scale);
    return nodes.find((n) => n.mask && maskHit(n.mask, x, y)) ?? null;
  }

  scene.addEventListener('pointermove', (e) => {
    const over = (e.target as Element).closest<HTMLElement>('.camp__node');
    light(over ? (nodes.find((n) => n.el === over) ?? null) : nodeAt(e.clientX, e.clientY));
  });
  scene.addEventListener('pointerleave', () => light(null));
  scene.addEventListener('click', (e) => {
    if ((e.target as Element).closest('.camp__node')) return;
    const n = nodeAt(e.clientX, e.clientY);
    if (n) select(n);
  });

  // read the scene's pixels and the node masks; the picture shows meanwhile
  void (async () => {
    sceneData = await loadMapPixels(SCENE_URL[place]);
    await Promise.all(
      nodes.map(async (n) => {
        const view = n.view;
        const url = view ? nodeMaskUrl(view.mask) : null;
        n.mask = url ? await loadNodeMask(url) : null;
        if (n.mask) {
          n.cx = n.mask.bounds.x + n.mask.bounds.w / 2;
          paintGlow(n);
        }
      }),
    );
    area = '';
    layout();
    update();
  })();

  function layout(): void {
    const w = view.clientWidth;
    const hh = view.clientHeight;
    const key = `${w}x${hh}`;
    if (key === area || w === 0) return;
    area = key;
    // the hub's rule: the smallest whole scale that covers the view, the overflow cut evenly
    scale = coverScale(w, hh);
    const at = hubOffset(w, hh, scale);
    scene.style.width = `${HUB_MAP_W * scale}px`;
    scene.style.height = `${HUB_MAP_H * scale}px`;
    scene.style.left = `${at.x}px`;
    scene.style.top = `${at.y}px`;
    const foot = Math.round(at.y + HUB_MAP_H * scale - (hh - (bar.offsetHeight + 20)));
    // panels stand under their node, never over each other, always inside the visible view: the
    // scene is cut at the edges, so a panel is sized and placed in screen pixels (u screen px per
    // scene pixel, the scale or less when three panels would not fit the width)
    const gap = 8;
    const u = Math.min(scale, (w - 2 * gap - (nodes.length - 1) * gap) / (nodes.length * PANEL_W));
    scene.style.setProperty('--s', String(u));
    const panel = PANEL_W * u;
    let edge = gap;
    nodes.forEach((n, i) => {
      const last = w - gap - panel - (nodes.length - 1 - i) * (panel + gap);
      const left = Math.min(Math.max(n.cx * scale + at.x - panel / 2, edge), last);
      edge = left + panel + gap;
      n.el.style.bottom = `${foot}px`;
      n.el.style.left = `${left - at.x}px`;
      n.el.style.width = `${panel}px`;
      n.lock.style.left = `${left - at.x + panel / 2}px`;
      n.lock.style.top = `${LOCK_Y * scale}px`;
    });
    host.dataset['scale'] = String(scale);
  }
  new ResizeObserver(() => layout()).observe(view);

  upgrade.addEventListener('click', () => {
    const r = upgradeCamp(ctx.state(), content);
    if (!r.ok) return;
    ctx.sound('buy');
    ctx.apply(r.state);
    update();
  });

  // ---- the node panels ----
  function buildNodes(): void {
    const model = campScreen(ctx.state(), content, place, []);
    for (const nv of model.nodes) {
      const el = h('div', 'camp__node');
      el.dataset['node'] = nv.id;
      const slots = h('div', 'camp__slots');
      const label = h('div', 'camp__label');
      const labelName = h('b', '', nv.name);
      const labelRate = h('span', 'bi-num');
      label.append(labelName, labelRate);
      el.append(slots, label);
      const lock = h('div', 'camp__lock');
      lock.dataset['lock'] = nv.id;
      const dim = h('canvas', 'camp__dim') as HTMLCanvasElement;
      const glow = h('canvas', 'camp__glow') as HTMLCanvasElement;
      for (const c of [dim, glow]) {
        c.width = HUB_MAP_W;
        c.height = HUB_MAP_H;
        c.setAttribute('aria-hidden', 'true');
      }
      scene.append(dim, glow, el, lock);
      nodes.push({
        id: nv.id,
        mask: null,
        el,
        slots,
        label,
        labelName,
        labelRate,
        lock,
        glow,
        dim,
        view: nv,
        cx: nodes.length * 205 + 117,
      });
    }
  }
  buildNodes();

  function tile(
    n: Node,
    kind: 'card' | 'empty' | 'place',
    index = 0,
    card: string | null = null,
    rate = '',
  ): HTMLElement {
    const b = h('button', `camp__tile camp__tile--${kind}`);
    b.type = 'button';
    if (kind === 'place') {
      b.dataset['key'] = `place-${n.id}`;
      b.append(h('b', 'camp__plus', '+'), h('span', '', T.placeHere));
      b.setAttribute('aria-label', T.placeOn(n.view?.name ?? ''));
      b.addEventListener('click', () => {
        const r = placeSlot(ctx.state(), content, place, n.id);
        if (!r.ok) return;
        ctx.sound('buy');
        ctx.apply(r.state);
        update();
      });
      return b;
    }
    b.dataset['key'] = `slot-${index}`;
    b.dataset['slot'] = String(index);
    if (kind === 'card' && card) {
      const s = ctx.state();
      const art = h('span', 'camp__art');
      art.setAttribute('aria-hidden', 'true');
      art.innerHTML = itemSvg(cardItemArt(content, card, s.cards.owned[card], s));
      b.append(art);
      if (rate) b.append(h('span', 'camp__tilerate bi-num', rate));
      const c = content.cardById.get(card);
      b.setAttribute('aria-label', `${c ? cardDisplayName(content, c) : card} ${rate}`.trim());
    } else {
      b.append(h('span', 'camp__empty', T.emptySlot));
      b.setAttribute('aria-label', T.slotCard(index + 1));
    }
    b.addEventListener('click', () => openPicker(index, n.id));
    return b;
  }

  function build(): void {
    const s = ctx.state();
    const model = campScreen(s, content, place, collectModifiers(s, content));
    for (const n of nodes) {
      const nv = model.nodes.find((x) => x.id === n.id)!;
      n.view = nv;
      n.el.classList.toggle('is-locked', nv.locked !== null);
      n.dim.classList.toggle('is-on', nv.locked !== null);
      n.glow.classList.toggle('is-active', nv.working && !reduced());
      n.lock.hidden = nv.locked === null;
      n.lock.replaceChildren(h('b', '', nv.name), h('span', '', nv.locked ?? ''));
      const parts: HTMLElement[] = nv.slots.map((sv) =>
        tile(n, sv.card ? 'card' : 'empty', sv.index, sv.card, sv.rate),
      );
      if (nv.canPlace) parts.push(tile(n, 'place'));
      n.slots.replaceChildren(...parts);
      n.slots.dataset['count'] = String(parts.length);
    }
  }

  // ---- the tool picker (the same cards as the forge's) ----
  function closePicker(): void {
    picking = null;
    picker.hidden = true;
    picker.replaceChildren();
  }

  function pick(cardId: string | null): void {
    if (!picking) return;
    const r = assignSlotCard(ctx.state(), content, place, picking.index, cardId);
    if (!r.ok) return;
    ctx.sound('buy');
    ctx.apply(r.state);
    closePicker();
    update();
  }

  function openPicker(index: number, material: string): void {
    picking = { index, material };
    const s = ctx.state();
    const slot = slotAt(s, place, index);
    const nodeName = nodes.find((n) => n.id === material)?.view?.name ?? '';
    const head = h('div', 'camp__pickhead');
    head.append(h('b', 'px-display', T.pickFor(nodeName)));
    const close = h('button', 'px-btn px-btn--dark', T.closeList);
    close.type = 'button';
    close.dataset['key'] = 'camp-pick-close';
    close.addEventListener('click', closePicker);
    if (slot.card) {
      const off = h('button', 'px-btn px-btn--dark', T.takeOff);
      off.type = 'button';
      off.dataset['key'] = 'camp-pick-off';
      off.addEventListener('click', () => pick(null));
      head.append(off);
    }
    head.append(close);
    const list = workerPickList();
    const items: HTMLElement[] = [];
    for (const c of content.cards) {
      if (c.job !== job || !s.cards.owned[c.id]) continue;
      const owned = s.cards.owned[c.id];
      const here = slot.card === c.id;
      const away = isOnTrip(s, c.id);
      const at = slotOfCard(s, content, c.id);
      const elsewhere = at && !(at.place === place && at.index === index);
      items.push(
        workerPickTile(content, s, {
          cardId: c.id,
          key: `camp-pick-${c.id}`,
          name: cardDisplayName(content, c),
          power: owned ? `×${fmt(workerPower(content, c.id, owned))}` : '',
          note: '',
          where: here ? T.worksHere : away ? T.away : elsewhere ? T.moves : '',
          current: here,
          disabled: away,
          onPick: () => pick(c.id),
        }),
      );
    }
    if (items.length === 0) items.push(h('li', 'camp__none', T.noToolCards));
    list.replaceChildren(...items);
    picker.replaceChildren(head, list);
    picker.hidden = false;
  }

  function signature(): string {
    const s = ctx.state();
    const owned = Object.keys(s.cards.owned).filter((id) => content.cardById.get(id)?.job === job);
    return JSON.stringify([
      s.camp.level,
      openSlots(s, content, place),
      s.camp[place],
      owned,
      s.clearedDungeons,
      s.expeditions.trips.map((t) => t.cardId),
      s.production.forge.worker,
    ]);
  }

  function update(): void {
    layout();
    const s = ctx.state();
    const mods = collectModifiers(s, content);
    const now = signature();
    const model = campScreen(s, content, place, mods);
    if (now !== sig) {
      sig = now;
      build();
    }
    for (const n of nodes) {
      const nv = model.nodes.find((x) => x.id === n.id)!;
      n.view = nv;
      set(n.labelName, nv.name);
      set(n.labelRate, nv.locked ? '' : nv.rate || '—');
    }
    set(levelText, T.campLevel(model.level));
    const prices = campLevelCost(s, content);
    const can = canAfford(s, prices);
    const costHtml = costMarkup(content, s, prices, (p) => !canAfford(s, [p]));
    if (cost.dataset['sig'] !== costHtml) {
      cost.dataset['sig'] = costHtml;
      cost.innerHTML = costHtml;
    }
    upgrade.textContent = T.raiseCamp;
    upgrade.setAttribute('aria-disabled', String(!can));
    upgrade.classList.toggle('is-no', !can);
    set(
      next,
      model.waiting > 0
        ? T.toPlace(model.waiting, place)
        : T.slotsOpen(openSlots(s, content, place)),
    );
    next.classList.toggle('is-call', model.waiting > 0);
    set(total, T.placeAll(fmt(model.total), COPY.view.titles[job] ?? ''));
  }

  host.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !picker.hidden) {
      closePicker();
      e.stopPropagation();
    }
  });

  return {
    render: update,
    opened() {
      closePicker();
    },
  };
}
