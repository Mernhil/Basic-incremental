import {
  buySkill,
  collectModifiers,
  respecInfo,
  respecSkills,
  skillPoints,
  skillTree,
} from '../../../game';
import { COPY } from '../copy';
import { frame, h } from '../shell/shell';
import { attachTooltip, hide as hideTip } from '../shell/tooltip';
import type { SoundId } from '../sound/registry';
import { replay } from '../stage/motion';
import { centreStar, skillGem } from '../ui/skillArt';
import type { PageContext } from './production';
import { CENTRE, SKY, respecView, treeView, type NodeView, type TreeView } from './skillsModel';
import './skills.css';

/**
 * Skill Tree page (DESIGN.md 9, 10a, 17; A8 A "radial constellation"): six branches radiate from
 * a centre star that holds the points to spend; each node is a faceted gem lit in its branch
 * colour. Choosing a gem shows its current and next bonus in the side panel, with the buy
 * button; the respec sits under it with an in-page confirm.
 */

export interface SkillsContext extends PageContext {
  sound?: (id: SoundId) => void;
}

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

export function createSkillsPage(page: HTMLElement, ctx: SkillsContext): { render(): void } {
  const { content } = ctx;
  const t = COPY.skills;
  let selected: string | null = null;
  let confirming = false;
  let last = '';
  let message = '';

  const wrap = h('div', 'sk-wrap');
  const status = h('p', 'sk-status');
  status.setAttribute('role', 'status');
  page.append(wrap, status);

  const view = (): TreeView => {
    const s = ctx.state();
    return treeView(content, skillTree(s, content), skillPoints(s, content));
  };
  const respec = () => {
    const s = ctx.state();
    return respecView(content, s, respecInfo(s, content, collectModifiers(s, content)));
  };
  const signature = (): string => {
    const s = ctx.state();
    const r = respec();
    return JSON.stringify([s.account.skills, s.account.level, r.enabled, r.free, r.priceText]);
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
  function sky(v: TreeView): HTMLElement {
    const { el, body } = frame(
      t.tree,
      `${t.pointsAvailable(v.points.available)} · ${t.pointsOf(v.points.spent, v.points.total)}`,
    );
    el.classList.add('sk-frame');
    const box = h('div', 'sk-sky');
    box.style.aspectRatio = `${SKY.w} / ${SKY.h}`;
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
    for (const e of v.edges) {
      art.append(
        svgEl('line', {
          class: `sk-edge${e.lit ? ' is-lit' : ''}`,
          x1: e.x1,
          y1: e.y1,
          x2: e.x2,
          y2: e.y2,
          ...(e.lit ? { stroke: e.colour } : {}),
        }),
      );
    }
    for (const b of v.branches) {
      const label = svgEl('text', {
        class: 'sk-branch',
        x: b.x,
        y: b.y,
        'text-anchor': b.anchor,
        'dominant-baseline': 'middle',
        fill: b.colour,
      });
      label.textContent = b.name;
      const count = svgEl('tspan', { class: 'sk-branch__count', dx: 6 });
      count.textContent = `${b.ranks}/${b.maxRanks}`;
      label.append(count);
      art.append(label);
    }
    box.append(art);

    // centre star: the points to spend
    const centre = h('div', 'sk-centre');
    centre.style.left = px(CENTRE.x);
    centre.style.top = py(CENTRE.y);
    const star = h('span', 'sk-centre__star');
    star.innerHTML = centreStar();
    const num = h('span', 'sk-centre__num bi-num', String(v.points.available));
    const lab = h('span', 'sk-centre__label', t.points);
    centre.append(star, num, lab);
    centre.classList.toggle('has-points', v.points.available > 0);
    centre.setAttribute('aria-label', t.pointsAvailable(v.points.available));
    centre.setAttribute('role', 'img');
    box.append(centre);

    const list = h('ul', 'sk-nodes');
    list.setAttribute('aria-label', t.tree);
    for (const n of v.nodes) list.append(nodeEl(n));
    box.append(list);
    body.append(box);
    return el;
  }

  function nodeEl(n: NodeView): HTMLElement {
    const li = h('li', 'sk-node-slot');
    li.style.left = px(n.x);
    li.style.top = py(n.y);
    const b = h('button', `sk-node is-${n.state}${n.canBuy ? ' can-buy' : ''}`);
    b.type = 'button';
    b.dataset.node = n.id;
    b.dataset.key = `node-${n.id}`;
    b.style.setProperty('--gem', n.colour);
    b.setAttribute('aria-label', n.label);
    b.setAttribute('aria-pressed', String(n.id === selected));
    const gem = h('span', 'sk-node__gem');
    gem.innerHTML = skillGem();
    const rank = h('span', 'sk-node__rank bi-num', n.rankText);
    b.append(gem, rank);
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

  // ---- the side panel ----
  function detail(v: TreeView): HTMLElement {
    const n = v.nodes.find((x) => x.id === selected);
    if (!n) {
      const { el, body } = frame(t.tree);
      body.append(h('p', 'frame__muted', t.pickNode));
      return el;
    }
    const { el, body } = frame(n.name, COPY.skills.branches[n.branch]);
    el.classList.add('sk-detail');
    el.style.setProperty('--gem', n.colour);
    const head = h('div', 'sk-detail__head');
    const gem = h('span', `sk-detail__gem is-${n.state}`);
    gem.innerHTML = skillGem();
    const meta = h('div', 'sk-detail__meta');
    const pips = h('span', 'sk-pips');
    pips.setAttribute('role', 'img');
    pips.setAttribute('aria-label', t.rank(n.rank, n.maxRank));
    for (let i = 0; i < n.maxRank; i++) pips.append(h('i', i < n.rank ? 'is-on' : ''));
    meta.append(
      h('span', 'sk-detail__rank', `${t.rank(n.rank, n.maxRank)} · ${t.state[n.state]}`),
      pips,
      h('span', 'sk-detail__cost', t.cost(n.cost)),
    );
    head.append(gem, meta);

    const effects = h('dl', 'sk-effects');
    const fx = (label: string, lines: string[], empty: string, cls: string) => {
      const d = h('div', cls);
      const dd = h('dd');
      if (lines.length === 0) dd.textContent = empty;
      else for (const l of lines) dd.append(h('span', 'bi-num', l));
      d.append(h('dt', '', label), dd);
      effects.append(d);
    };
    fx(t.now, n.now, t.none, 'sk-effects__now');
    if (n.state !== 'maxed') fx(t.next, n.next, t.maxed, 'sk-effects__next');
    body.append(head, effects);
    if (n.needs) body.append(h('p', 'sk-needs', n.needs));
    if (n.state !== 'maxed') {
      const b = h('button', 'button sk-buy', t.buy(n.cost));
      b.type = 'button';
      b.dataset.key = 'buy';
      b.disabled = !n.canBuy;
      b.addEventListener('click', () => buy(n.id));
      body.append(b);
      if (!n.canBuy && !n.needs && v.points.available < n.cost) {
        body.append(h('p', 'frame__muted', t.noPoints));
      }
    }
    return el;
  }

  function respecPanel(): HTMLElement {
    const r = respec();
    const { el, body } = frame(t.respec);
    el.classList.add('sk-respec');
    if (!confirming) {
      body.append(h('p', 'frame__muted', `${t.respecNote} ${r.note}`));
      const b = h('button', 'button button--ghost', r.button);
      b.type = 'button';
      b.dataset.key = 'respec';
      b.disabled = !r.enabled;
      b.addEventListener('click', () => {
        confirming = true;
        say('');
        build('respec-go');
      });
      body.append(b);
      return el;
    }
    const box = h('div', 'sk-confirm');
    box.setAttribute('role', 'group');
    const title = h('h3', 'sk-confirm__title', r.confirmTitle);
    title.id = 'sk-confirm-title';
    box.setAttribute('aria-labelledby', title.id);
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
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        confirming = false;
        build('respec');
      }
    });
    const buttons = h('div', 'sk-confirm__buttons');
    buttons.append(go, cancel);
    box.append(title, h('p', 'sk-confirm__body', r.confirmBody), buttons);
    body.append(box);
    return el;
  }

  function build(focusKey?: string): void {
    hideTip();
    const v = view();
    last = signature();
    if (!selected || !v.nodes.some((n) => n.id === selected)) {
      selected = (v.nodes.find((n) => n.canBuy) ?? v.nodes[0])?.id ?? null;
    }
    const side = h('div', 'sk-side');
    side.append(detail(v), respecPanel());
    wrap.replaceChildren(sky(v), side);
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
