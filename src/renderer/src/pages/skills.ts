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
import { centreStar, nodeStyle, skillGem } from '../ui/skillArt';
import type { PageContext } from './production';
import { CENTRE, SKY, respecView, treeView, type NodeView, type TreeView } from './skillsModel';
import './skills.css';

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

  page.querySelector<HTMLElement>('.shell-page__title')?.classList.add('sr-only');
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
    return JSON.stringify([
      s.cosmetics.loadout.slots.nodes,
      s.account.skills,
      s.account.level,
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
  function sky(v: TreeView): HTMLElement {
    const { el, body } = frame(t.tree, t.learnedOf(v.learned, v.total));
    el.classList.add('sk-frame');
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
    }

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
    stage.append(box);
    body.append(stage);
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
    gem.innerHTML = skillGem(
      nodeStyle(content, ctx.state()),
      n.branch,
      n.state === 'maxed' ? 'owned' : n.state,
      n.keystone,
    );
    b.classList.toggle('is-key', n.keystone);
    b.append(gem);
    // the rank sits on the gem's corner once it has one
    if (n.rank > 0) b.append(h('span', 'sk-node__rank bi-num', n.rankText));
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
    const gem = h('span', `sk-detail__gem is-${n.state}`);
    gem.innerHTML = skillGem(
      nodeStyle(content, ctx.state()),
      n.branch,
      n.state === 'maxed' ? 'owned' : n.state,
      n.keystone,
    );
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
    row(t.costLine, n.state === 'maxed' ? t.maxed : t.pointCost(n.cost));
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

  function build(focusKey?: string): void {
    hideTip();
    const v = view();
    last = signature();
    if (!selected || !v.nodes.some((n) => n.id === selected)) {
      selected = (v.nodes.find((n) => n.canBuy) ?? v.nodes[0])?.id ?? null;
    }
    wrap.replaceChildren(sky(v), sidePanel(v));
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
