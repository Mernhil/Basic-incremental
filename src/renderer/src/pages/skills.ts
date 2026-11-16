import {
  buySkill,
  collectModifiers,
  respecInfo,
  respecSkills,
  skillPoints,
  skillTree,
  weaponCircles,
} from '../../../game';
import { COPY } from '../copy';
import { frame, h } from '../shell/shell';
import { attachTooltip, hide as hideTip } from '../shell/tooltip';
import type { SoundId } from '../sound/registry';
import { replay } from '../stage/motion';
import { nodeStyle, skillGem } from '../ui/skillArt';
import { glyphSvg } from '../ui/webGlyphs';
import { createHeirloomsTab } from './heirloomsMap';
import type { PageContext } from './production';
import {
  BRANCH_COLOUR,
  CENTRE,
  SKY,
  respecView,
  treeView,
  type NodeView,
  type TreeView,
} from './skillsModel';
import './skills.css';
import './skillWeb.css';

/**
 * Skill Tree page (DESIGN.md §11, §10a, 17; UI_RULES.md §2, the Skill tree screen pick): six
 * branches radiate from a centre star that holds the points to spend; each node is a pixel gem of
 * the equipped skill-node style in its branch colour, at a whole scale. Links are solid when
 * learned, dashed when open and dim when locked. Choosing a gem shows its current and next bonus in
 * the side panel, with the Learn button; the respec sits at the bottom of that panel with an
 * in-page confirm.
 */

export interface SkillsContext extends PageContext {
  sound?: (id: SoundId) => void;
  /** The view's title-bar subtitle ("21 of 275 learned"), set on every rebuild. */
  subtitle?: (learned: number, total: number) => void;
  /** The same bar's text on the Heirlooms tab. */
  subtitleText?: (text: string) => void;
}

/** Pixels per sky unit: the first view, and how far the sky zooms out and in. */
const START_SCALE = 0.62;
const MIN_SCALE = 0.2;
const MAX_SCALE = 1.7;

const SVG_NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag: string, attrs: Record<string, string | number>): SVGElement => {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};
/** SKY units to a percentage of the sky box. */
const px = (x: number): string => `${(((x - SKY.x) / SKY.w) * 100).toFixed(3)}%`;
const py = (y: number): string => `${(((y - SKY.y) / SKY.h) * 100).toFixed(3)}%`;

/** A fixed field of faint stars behind the constellation (seeded, so it never jumps). */
function starField(): SVGElement {
  const g = svgEl('g', { class: 'sk-field' });
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 90; i++) {
    g.append(
      svgEl('circle', {
        cx: (SKY.x + rnd() * SKY.w).toFixed(1),
        cy: (SKY.y + rnd() * SKY.h).toFixed(1),
        r: (0.6 + rnd() * 1.3).toFixed(2),
        opacity: (0.15 + rnd() * 0.45).toFixed(2),
      }),
    );
  }
  return g;
}

/** The gem art knows locked, open and owned: a closed gem is drawn locked, a maxed one owned. */
const gemState = (n: NodeView): 'locked' | 'open' | 'owned' =>
  n.state === 'maxed'
    ? 'owned'
    : n.state === 'closed' || n.state === 'unknown'
      ? 'locked'
      : n.state;

export function createSkillsPage(page: HTMLElement, ctx: SkillsContext): { render(): void } {
  const { content } = ctx;
  const t = COPY.skills;
  let tab: 'tree' | 'heirlooms' = 'tree';
  let selected: string | null = null;
  let confirming = false;
  let last = '';
  let message = '';

  page.querySelector<HTMLElement>('.shell-page__title')?.classList.add('sr-only');
  const wrap = h('div', 'sk-wrap');
  const status = h('p', 'sk-status');
  status.setAttribute('role', 'status');
  page.append(wrap, status);

  const view = (): TreeView => {
    const s = ctx.state();
    return treeView(
      content,
      skillTree(s, content),
      skillPoints(s, content),
      weaponCircles(s, content),
    );
  };
  const respec = () => {
    const s = ctx.state();
    return respecView(content, s, respecInfo(s, content, collectModifiers(s, content)));
  };
  const heirlooms = createHeirloomsTab({
    ...ctx,
    rebuild: (key) => build(key),
    ...(ctx.sound ? { sound: ctx.sound } : {}),
  });
  const signature = (): string => {
    const s = ctx.state();
    const r = respec();
    return JSON.stringify([
      tab,
      heirlooms.signature(),
      s.cosmetics.loadout.slots.nodes,
      s.account.skills,
      s.account.level,
      s.prestigeCount,
      weaponCircles(s, content).map((c) => c.step),
      Object.keys(s.achievements).length,
      r.enabled,
      r.free,
      r.priceText,
    ]);
  };

  function say(text: string): void {
    message = text;
    status.textContent = text;
  }

  function buy(id: string): void {
    const result = buySkill(ctx.state(), content, id);
    if (!result.ok) {
      say(t.reasons[result.reason]);
      return;
    }
    ctx.apply(result.state);
    ctx.sound?.('skillLearn');
    const node = view().nodes.find((n) => n.id === id);
    say(node ? t.bought(node.name, node.rank) : '');
    build('buy');
    replay(wrap.querySelector<HTMLElement>(`[data-node="${id}"]`), 'is-flash', 700);
  }

  function doRespec(): void {
    const refund = respec().refund;
    const result = respecSkills(ctx.state(), content, collectModifiers(ctx.state(), content));
    confirming = false;
    if (!result.ok) {
      say(t.reasons[result.reason]);
      build('respec');
      return;
    }
    ctx.apply(result.state);
    ctx.sound?.('buy');
    say(t.respecDone(refund));
    build('respec');
  }

  // ---- the constellation ----

  /** Pan and zoom of the sky: pixels per sky unit and the box's offset in the stage. */
  const camera = { scale: START_SCALE, x: 0, y: 0, placed: false, touched: false, width: 0 };
  /** The skills in view (sky units): the first view fits them, so the web you have opens whole. */
  let fit: { x0: number; y0: number; x1: number; y1: number } | null = null;
  /** The branch titles in view, so the first view keeps them whole inside the frame. */
  let titles: { x: number; y: number; anchor: 'start' | 'middle' | 'end'; w: number }[] = [];
  /** Every plate and its name, for hiding the names that would touch something. */
  let plates: { n: NodeView; name: HTMLElement | null }[] = [];
  let titleEls: HTMLElement[] = [];
  const clampScale = (s: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

  /** Sizes and places the sky box in its stage from the camera (gems keep their pixel size). */
  function applyCamera(stage: HTMLElement, box: HTMLElement): void {
    const rect = stage.getBoundingClientRect();
    // a window resized before you moved the sky gets the fitted first view again
    if (camera.placed && !camera.touched && Math.abs(rect.width - camera.width) > 40) {
      camera.placed = false;
    }
    if (!camera.placed && rect.width > 0) {
      camera.width = rect.width;
      // first view: everything you know, and the "?" next to it, inside the frame (under the tabs)
      const f0 = fit ?? { x0: 0, y0: 0, x1: 0, y1: 0 };
      let f = f0;
      let scale = camera.scale;
      // a few passes: a title is a fixed width in pixels, so its reach in sky units depends on the scale
      for (let pass = 0; pass < 3; pass++) {
        f = { ...f0 };
        for (const t of titles) {
          const reach = t.w / scale;
          const left =
            t.anchor === 'start' ? t.x : t.anchor === 'end' ? t.x - reach : t.x - reach / 2;
          f.x0 = Math.min(f.x0, left);
          f.x1 = Math.max(f.x1, left + reach);
          f.y0 = Math.min(f.y0, t.y - 14 / scale);
          f.y1 = Math.max(f.y1, t.y + 14 / scale);
        }
        scale = clampScale(
          Math.min(
            (rect.width - 90) / Math.max(f.x1 - f.x0, 1),
            (rect.height - (rect.width < 1000 ? 190 : 215)) / Math.max(f.y1 - f.y0, 1),
            1,
          ),
        );
      }
      camera.scale = scale;
      camera.x = rect.width / 2 - ((f.x0 + f.x1) / 2 - SKY.x) * camera.scale;
      camera.y = rect.height / 2 + 8 - ((f.y0 + f.y1) / 2 - SKY.y) * camera.scale;
      camera.placed = true;
    }
    box.classList.toggle('is-far', camera.scale < 0.25);
    box.classList.toggle('is-micro', camera.scale < 0.3);
    box.classList.toggle('is-tiny', camera.scale < 0.42);
    box.style.width = `${SKY.w * camera.scale}px`;
    box.style.height = `${SKY.h * camera.scale}px`;
    box.style.left = `${camera.x}px`;
    box.style.top = `${camera.y}px`;
    declutter();
  }

  /** Hides each name that would touch another name or a plate (the chosen skill always shows its own). */
  function declutter(): void {
    const k = camera.scale;
    const reach = (n: NodeView): number => (n.keystone ? 38 : k < 0.3 ? 15 : k < 0.42 ? 21 : 30);
    type R = { x0: number; y0: number; x1: number; y1: number };
    const boxes = plates.map(({ n }) => ({
      id: n.id,
      x0: n.x * k - reach(n),
      y0: n.y * k - reach(n),
      x1: n.x * k + reach(n),
      y1: n.y * k + reach(n),
    }));
    const hit = (a: R, b: R): boolean =>
      a.x0 < b.x1 + 3 && a.x1 > b.x0 - 3 && a.y0 < b.y1 + 3 && a.y1 > b.y0 - 3;
    const rank = (n: NodeView): number =>
      n.id === selected ? 0 : n.canBuy ? 1 : n.rank > 0 ? 2 : 3;
    const shown: R[] = [];
    for (const { n, name } of [...plates].sort((a, b) => rank(a.n) - rank(b.n))) {
      if (!name) continue;
      const w = name.offsetWidth;
      const hgt = name.offsetHeight;
      if (w === 0) continue;
      // under the plate, or over it when that is free
      const below: R = {
        x0: n.x * k - w / 2,
        y0: n.y * k + reach(n) + 6,
        x1: n.x * k + w / 2,
        y1: n.y * k + reach(n) + 6 + hgt,
      };
      const above: R = { ...below, y0: n.y * k - reach(n) - 6 - hgt, y1: n.y * k - reach(n) - 6 };
      const free = (r: R): boolean =>
        !boxes.some((b) => b.id !== n.id && hit(r, b)) && !shown.some((o) => hit(r, o));
      const spot = free(below) ? below : free(above) ? above : null;
      const forced = n.id === selected;
      name.classList.toggle('is-above', spot === above);
      name.classList.toggle('is-hidden', spot === null && !forced);
      if (spot || forced) shown.push(spot ?? below);
    }
    // two titles that touch drop their counts ("Workers", "Automation"), so none runs into another
    const seen: DOMRect[] = [];
    for (const el of titleEls) {
      el.classList.remove('is-short');
      let r = el.getBoundingClientRect();
      const over = (o: DOMRect): boolean =>
        r.left < o.right + 4 && r.right > o.left - 4 && r.top < o.bottom && r.bottom > o.top;
      el.style.marginLeft = '';
      if (seen.some(over)) {
        el.classList.add('is-short');
        r = el.getBoundingClientRect();
      }
      // still touching: slide it sideways, away from the title it meets
      const meets = seen.find(over);
      if (meets) {
        const left = r.left + r.width / 2 < meets.left + meets.width / 2;
        const shift = left ? meets.left - 6 - r.right : meets.right + 6 - r.left;
        el.style.marginLeft = `${shift}px`;
        r = el.getBoundingClientRect();
      }
      seen.push(r);
    }
  }

  /** Zooms to `scale`, keeping the point under (cx, cy) of the stage where it is. */
  function zoomAt(
    stage: HTMLElement,
    box: HTMLElement,
    scale: number,
    cx: number,
    cy: number,
  ): void {
    const next = clampScale(scale);
    camera.touched = true;
    const k = next / camera.scale;
    camera.x = cx - (cx - camera.x) * k;
    camera.y = cy - (cy - camera.y) * k;
    camera.scale = next;
    applyCamera(stage, box);
  }

  function enablePanZoom(stage: HTMLElement, box: HTMLElement): void {
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
          box,
          camera.scale * Math.exp(-e.deltaY * 0.0015),
          e.clientX - r.left,
          e.clientY - r.top,
        );
      },
      { passive: false },
    );
    stage.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest('.sk-zoom')) return;
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
      camera.touched = true;
      camera.x = drag.cx + dx;
      camera.y = drag.cy + dy;
      applyCamera(stage, box);
    });
    const end = (e: PointerEvent): void => {
      if (!drag || e.pointerId !== drag.id) return;
      // a drag is not a click on the gem it ended over
      if (drag.moved) {
        stage.addEventListener('click', (c) => c.stopPropagation(), { capture: true, once: true });
      }
      drag = null;
      stage.classList.remove('is-panning');
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
  }

  function zoomButtons(stage: HTMLElement, box: HTMLElement): HTMLElement {
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
    mk('+', t.zoomIn, () => zoomAt(stage, box, camera.scale * 1.25, ...mid()));
    mk('−', t.zoomOut, () => zoomAt(stage, box, camera.scale / 1.25, ...mid()));
    mk('⌂', t.zoomReset, () => {
      camera.scale = START_SCALE;
      camera.placed = false;
      camera.touched = false;
      applyCamera(stage, box);
    });
    bar.append(h('span', 'sk-zoom__hint', t.panHint));
    return bar;
  }

  function sky(v: TreeView): HTMLElement {
    titleEls = [];
    // the title and the learned count are in the view's title bar (UI_RULES §2, table update 9d)
    const el = h('section', 'frame sk-frame');
    el.setAttribute('aria-label', t.tree);
    el.dataset.deal = '';
    const body = h('div', 'frame__body');
    el.append(body);
    const stage = h('div', 'sk-stage');
    const box = h('div', 'sk-sky');
    const art = svgEl('svg', {
      class: 'sk-lines',
      viewBox: `${SKY.x} ${SKY.y} ${SKY.w} ${SKY.h}`,
      'aria-hidden': 'true',
    });
    art.append(starField());
    // faint rays behind each branch
    for (const b of v.branches) {
      art.append(
        svgEl('line', {
          class: 'sk-ray',
          x1: CENTRE.x,
          y1: CENTRE.y,
          x2: b.x,
          y2: b.y,
          stroke: b.colour,
        }),
      );
    }
    // the weapon circles: a dim outline while hidden
    for (const c of v.circles) {
      art.append(
        svgEl('circle', {
          class: `sk-circle${c.revealed ? '' : ' is-hidden'}`,
          cx: c.x,
          cy: c.y,
          r: c.radius,
        }),
      );
    }
    // links: learned solid in the branch colour, open dashed, locked dim
    for (const e of v.edges) {
      art.append(
        svgEl('line', {
          class: `sk-edge is-${e.state}`,
          x1: e.x1,
          y1: e.y1,
          x2: e.x2,
          y2: e.y2,
          ...(e.state === 'locked' ? {} : { stroke: e.colour }),
        }),
      );
    }
    box.append(art);

    // circle names under their outline
    for (const c of v.circles) {
      const label = h('span', `sk-circle-label${c.revealed ? '' : ' is-hidden'}`);
      label.style.left = px(c.x);
      label.style.top = py(c.y + c.radius + 12);
      label.append(c.revealed ? `${c.name} · ${c.stepText}` : '?');
      label.setAttribute('role', 'img');
      label.setAttribute('aria-label', c.label);
      box.append(label);
    }

    // branch labels with learned / total (HTML, so the text stays sharp at every size)
    for (const b of v.branches) {
      const label = h('span', `sk-branch sk-branch--${b.anchor}`);
      label.style.left = px(b.x);
      label.style.top = py(b.y);
      label.style.color = b.colour;
      label.append(b.name, ' ', h('span', 'sk-branch__count bi-num', `${b.learned}/${b.total}`));
      label.setAttribute('role', 'img');
      label.setAttribute('aria-label', t.branchLearned(b.name, b.learned, b.total));
      box.append(label);
      titleEls.push(label);
    }

    // the branches only: the far weapon circles are for panning to
    plates = [];
    titles = v.branches.map((b) => ({
      x: b.x,
      y: b.y,
      anchor: b.anchor,
      w: (b.name.length + 6) * 9 + 12,
    }));
    const arms = v.nodes.filter((n) => !n.circle);
    const xs = [CENTRE.x, ...arms.map((n) => n.x)];
    const ys = [CENTRE.y, ...arms.map((n) => n.y)];
    fit = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };

    // the hub: a gold node with a star, the points to spend on its rim
    const centre = h('div', 'sk-centre');
    centre.style.left = px(CENTRE.x);
    centre.style.top = py(CENTRE.y);
    const star = h('span', 'sk-centre__star');
    star.innerHTML = glyphSvg('key', '#ffd45a');
    const num = h('span', 'sk-centre__num bi-num', String(v.points.available));
    centre.append(star, num);
    centre.classList.toggle('has-points', v.points.available > 0);
    centre.setAttribute('aria-label', t.pointsAvailable(v.points.available));
    centre.setAttribute('role', 'img');
    box.append(centre);

    const list = h('ul', 'sk-nodes');
    list.setAttribute('aria-label', t.tree);
    for (const n of v.nodes) list.append(nodeEl(n));
    box.append(list);
    stage.append(box, zoomButtons(stage, box));
    enablePanZoom(stage, box);
    body.append(stage);
    // the stage has no size until it is in the page: place the sky once it is
    if (typeof ResizeObserver !== 'undefined')
      new ResizeObserver(() => applyCamera(stage, box)).observe(stage);
    queueMicrotask(() => applyCamera(stage, box));
    applyCamera(stage, box);
    return el;
  }

  function nodeEl(n: NodeView): HTMLElement {
    const li = h('li', 'sk-node-slot');
    li.style.left = px(n.x);
    li.style.top = py(n.y);
    const b = h(
      'button',
      `sk-node is-${n.state}${n.canBuy ? ' can-buy' : ''}${n.kind === 'large' ? ' is-large' : ''}`,
    );
    b.type = 'button';
    b.dataset.node = n.id;
    b.dataset.key = `node-${n.id}`;
    b.style.setProperty('--gem', n.colour);
    b.setAttribute('aria-label', n.label);
    b.setAttribute('aria-pressed', String(n.id === selected));
    let nameEl: HTMLElement | null = null;
    const gem = h('span', 'sk-node__gem');
    // the equipped node art (a style other than the starter) shows in the plate in place of the glyph
    const style = nodeStyle(content, ctx.state());
    if (n.state === 'unknown') gem.append(h('span', 'sk-node__q', '?'));
    else if (style !== 'a') {
      gem.innerHTML = skillGem(style, n.branch, gemState(n), n.keystone);
      gem.classList.add('has-art');
    } else gem.innerHTML = glyphSvg(n.glyph, n.colour);
    b.classList.toggle('is-key', n.keystone);
    b.classList.toggle('is-affordable', n.canBuy);
    b.append(gem);
    // the rank sits on the plate's lower edge, "2/5"; the name under it
    if (n.state !== 'unknown') {
      b.append(h('span', 'sk-node__rank bi-num', n.rankText));
      nameEl = h('span', 'sk-node__name', n.name);
      b.append(nameEl);
    }
    plates.push({ n, name: nameEl });
    attachTooltip(b, () => tip(n));
    b.addEventListener('click', () => {
      selected = n.id;
      confirming = false;
      say('');
      build(`node-${n.id}`);
    });
    b.addEventListener('dblclick', () => {
      if (n.canBuy) buy(n.id);
    });
    li.append(b);
    return li;
  }

  function tip(n: NodeView): HTMLElement {
    const box = h('div', 'sk-tip');
    box.append(h('p', 'shell-tip__title', n.name));
    box.append(h('p', 'sk-tip__rank', `${t.rank(n.rank, n.maxRank)} · ${t.cost(n.cost)}`));
    const rows = h('dl', 'shell-tip__rows');
    const row = (label: string, value: string) => {
      rows.append(h('dt', '', label), h('dd', '', value));
    };
    row(t.now, n.now.join(', ') || t.none);
    row(t.next, n.next.join(', ') || t.maxed);
    box.append(rows);
    if (n.needs) box.append(h('p', 'sk-tip__needs', n.needs));
    return box;
  }

  // ---- the side panel: points, the gem, now / after / cost, Learn, then the respec ----
  function sidePanel(v: TreeView): HTMLElement {
    const n = v.nodes.find((x) => x.id === selected);
    const { el, body } = frame(
      n ? n.name : t.tree,
      n ? t.branchRank(t.branchShort[n.branch], n.rank, n.maxRank) : undefined,
    );
    el.classList.add('sk-detail');
    el.dataset.deal = '';
    const points = h('div', 'sk-points');
    points.append(
      h('span', 'sk-points__label', t.pointsHeading),
      h('span', 'sk-points__num px-display bi-num', String(v.points.available)),
    );
    points.setAttribute('aria-label', t.pointsAvailable(v.points.available));
    el.prepend(points);
    if (!n) {
      body.append(h('p', 'frame__muted', t.pickNode), respecBlock());
      return el;
    }
    el.style.setProperty('--gem', n.colour);
    const art = h('div', 'sk-art');
    const gem = h(
      'span',
      `sk-detail__gem sk-plate is-${n.state}${n.canBuy ? ' is-affordable' : ''}`,
    );
    if (n.state === 'unknown') gem.append(h('span', 'sk-node__q', '?'));
    else gem.innerHTML = glyphSvg(n.glyph, n.colour);
    gem.classList.toggle('is-key', n.keystone);
    const text = h('div', 'sk-art__text');
    const effect = n.state === 'maxed' ? n.now : n.next;
    for (const l of effect.length ? effect : [t.none]) text.append(h('b', 'bi-num', l));
    text.append(h('span', 'sk-art__note', n.needs || t.state[n.state]));
    art.append(gem, text);

    const rows = h('dl', 'sk-rows');
    const row = (label: string, value: string): void => {
      const r = h('div', 'sk-row');
      r.append(h('dt', '', label), h('dd', 'bi-num', value));
      rows.append(r);
    };
    row(t.now, n.now.join(', ') || t.none);
    row(t.afterLine, n.next.join(', ') || t.maxed);
    if (n.state !== 'unknown') {
      const pips = h('span', 'sk-pips');
      for (let i = 0; i < n.maxRank; i++) pips.append(h('i', i < n.rank ? 'is-on' : ''));
      const r = h('div', 'sk-row');
      r.append(h('dt', '', t.levelLine), h('dd', '', ''));
      r.lastElementChild!.append(pips);
      rows.append(r);
    }
    row(t.costLine, n.state === 'maxed' ? t.maxed : t.pointCost(n.cost));
    if (n.keystone) text.append(h('span', 'sw-tag', t.keystoneTag));
    body.append(art, rows);

    const b = h('button', 'button sk-buy', n.state === 'maxed' ? t.maxed : t.learn(n.cost));
    b.type = 'button';
    b.dataset.key = 'buy';
    b.disabled = !n.canBuy;
    b.addEventListener('click', () => buy(n.id));
    body.append(b);
    if (n.state !== 'maxed' && !n.canBuy && !n.needs && v.points.available < n.cost) {
      body.append(h('p', 'frame__muted sk-hint', t.noPoints));
    }
    body.append(respecBlock());
    return el;
  }

  function respecBlock(): HTMLElement {
    const r = respec();
    const box = h('section', 'sk-respec');
    box.setAttribute('aria-label', t.respec);
    if (!confirming) {
      box.append(h('p', 'frame__muted', `${t.respecNote} ${r.note}`));
      const b = h('button', 'button button--ghost sk-respec__btn', r.button);
      b.type = 'button';
      b.dataset.key = 'respec';
      b.disabled = !r.enabled;
      b.addEventListener('click', () => {
        confirming = true;
        say('');
        build('respec-go');
      });
      box.append(b);
      return box;
    }
    const conf = h('div', 'sk-confirm');
    conf.setAttribute('role', 'group');
    const title = h('h3', 'sk-confirm__title', r.confirmTitle);
    title.id = 'sk-confirm-title';
    conf.setAttribute('aria-labelledby', title.id);
    const go = h('button', 'button sk-confirm__go', t.respecGo);
    go.type = 'button';
    go.dataset.key = 'respec-go';
    go.addEventListener('click', doRespec);
    const cancel = h('button', 'button button--ghost', t.respecCancel);
    cancel.type = 'button';
    cancel.dataset.key = 'respec-cancel';
    cancel.addEventListener('click', () => {
      confirming = false;
      build('respec');
    });
    conf.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        confirming = false;
        build('respec');
      }
    });
    const buttons = h('div', 'sk-confirm__buttons');
    buttons.append(go, cancel);
    conf.append(title, h('p', 'sk-confirm__body', r.confirmBody), buttons);
    box.append(conf);
    return box;
  }

  /** The tab strip, the count of what can be bought and the legend, laid over the stage (pick 4a, 4c). */
  function chrome(frameEl: HTMLElement, affordable: number, points?: number): void {
    const stage = frameEl.querySelector<HTMLElement>('.sk-stage');
    if (!stage) return;
    const count = h('p', 'sk-count');
    count.append(h('b', 'bi-num', String(affordable)), ` ${t.canBuyNow(affordable)}`);
    const tabs = h('div', 'sk-tabs');
    tabs.setAttribute('role', 'tablist');
    const ready = { tree: view().affordable, heirlooms: heirlooms.affordable() };
    for (const [id, label] of [
      ['tree', COPY.heirloomMap.tabSkills],
      ['heirlooms', COPY.heirloomMap.tabHeirlooms],
    ] as const) {
      const b = h('button', `sk-tab${tab === id ? ' is-on' : ''}`);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(tab === id));
      b.dataset.key = `tab-${id}`;
      b.append(h('span', '', label));
      if (ready[id] > 0) b.append(h('em', 'bi-num', COPY.heirloomMap.ready(ready[id])));
      b.addEventListener('click', () => {
        if (tab === id) return;
        tab = id;
        if (id === 'heirlooms') heirlooms.resetView();
        say('');
        build(`tab-${id}`);
      });
      tabs.append(b);
    }
    const legend = h('div', 'sk-legend');
    if (points !== undefined) {
      for (const [id, colour] of Object.entries(BRANCH_COLOUR)) {
        const item = h('span', 'sk-legend__item sk-legend__item--branch');
        const dot = h('i', 'sk-legend__dot is-branch');
        dot.style.background = colour;
        dot.style.borderColor = colour;
        item.append(dot, t.branchShort[id as keyof typeof t.branchShort]);
        legend.append(item);
      }
    }
    for (const [cls, text] of [
      ['is-maxed', t.legend.maxed],
      ['is-owned', t.legend.owned],
      ['is-affordable', t.legend.affordable],
      ['is-open', t.legend.poor],
      ['is-unknown', t.legend.unknown],
    ] as const) {
      const item = h('span', 'sk-legend__item');
      item.append(h('i', `sk-legend__dot ${cls}`), text);
      legend.append(item);
    }
    stage.append(tabs, count, legend);
    if (points !== undefined) {
      const chips = h('div', 'sk-chips');
      const chip = h('span', 'sk-chip');
      chip.innerHTML = glyphSvg('key', '#ffd45a');
      chip.append(h('b', 'bi-num', String(points)), ` ${t.points}`);
      chips.append(chip);
      stage.append(chips);
    }
  }

  function build(focusKey?: string): void {
    hideTip();
    const v = view();
    last = signature();
    if (!selected || !v.nodes.some((n) => n.id === selected)) {
      selected = (v.nodes.find((n) => n.canBuy) ?? v.nodes[0])?.id ?? null;
    }
    if (tab === 'tree') {
      const stage = sky(v);
      chrome(stage, v.affordable, v.points.available);
      wrap.replaceChildren(stage, sidePanel(v));
      ctx.subtitle?.(v.learned, v.total);
    } else {
      const h2 = heirlooms.build();
      chrome(h2.stage, heirlooms.affordable());
      wrap.replaceChildren(h2.stage, h2.panel);
      const c = heirlooms.counts();
      ctx.subtitleText?.(COPY.heirloomMap.subtitle(c.found, c.total));
    }
    status.textContent = message;
    if (focusKey) {
      const target =
        wrap.querySelector<HTMLElement>(`[data-key="${focusKey}"]:not(:disabled)`) ??
        (focusKey === 'buy' && selected
          ? wrap.querySelector<HTMLElement>(`[data-key="node-${selected}"]`)
          : null);
      target?.focus();
    }
  }

  return {
    render() {
      if (signature() === last && wrap.childElementCount > 0) return;
      // a level-up mid-visit rebuilds the page; keep the keyboard where it was
      const focused = document.activeElement?.closest<HTMLElement>('[data-key]');
      build(focused && wrap.contains(focused) ? focused.dataset.key : undefined);
    },
  };
}
