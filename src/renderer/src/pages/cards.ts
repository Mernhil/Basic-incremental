import { RARITIES } from '../../../data';
import { resolveCard, type GameState, type TierUp } from '../../../game';
import { COPY } from '../copy';
import { frame, h } from '../shell/shell';
import { attachTooltip, hide as hideTip, tipTable } from '../shell/tooltip';
import { createCard, type CardProps } from '../ui/card';
import { chartSky, chartStar, nodeStyle } from '../ui/skillArt';
import type { CardEntry, CardsModel, Job, ModelResult, UpgradeStep } from './cardsModel';
import { CHART, type StarChartView, type StarView } from './skillsModel';
import type { PageContext } from './production';
import './cards.css';

/**
 * Cards page, "Codex": a Collection tab (filterable grid of every card + a detail panel for the
 * selected one, with its upgrades and loadout buttons) and a Loadouts tab (each job's main card
 * and three supports under its cost cap). All rules come from the CardsModel.
 */

type Tab = 'collection' | 'loadouts';
type Sort = keyof typeof COPY.cards.sortBy;

const JOB_NAMES: Record<Job, string> = {
  fighting: 'Fighting',
  logging: 'Logging',
  mining: 'Mining',
};
const JOB_ORDER: Job[] = ['fighting', 'logging', 'mining'];
const TIER_ORDER = ['bronze', 'silver', 'gold', 'prismatic'];
const TIER_NAMES: Record<string, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  prismatic: 'Prismatic',
};
const cap1 = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export interface CardsPageContext extends PageContext {
  model: CardsModel;
  /** Plays tier-up moments (star / tier ups, evolutions). */
  onTierUps?: (list: TierUp[]) => void;
}

export function createCardsPage(
  page: HTMLElement,
  ctx: CardsPageContext,
): { render(): void; show(tab: Tab, job?: Job): void } {
  const { content, model } = ctx;

  // ---- view state ----
  let tab: Tab = 'collection';
  let jobFilter: Job | null = null;
  let readyOnly = false;
  let sort: Sort = 'rarity';
  let selected: string | null = null;
  let last = '';
  let message = '';
  let ticks: Array<() => void> = [];

  // ---- tabs ----
  const tabBar = h('div', 'cp-tabs');
  tabBar.setAttribute('role', 'tablist');
  tabBar.setAttribute('aria-label', COPY.cards.tabs);
  const tabs: Record<Tab, HTMLButtonElement> = {
    collection: h('button', 'cp-tab', COPY.cards.collectionTab),
    loadouts: h('button', 'cp-tab', COPY.cards.loadoutsTab),
  };
  const panel = h('div', 'cp-panel');
  panel.setAttribute('role', 'tabpanel');
  panel.id = 'cards-panel';
  (Object.keys(tabs) as Tab[]).forEach((id, i, all) => {
    const b = tabs[id];
    b.type = 'button';
    b.id = `cards-tab-${id}`;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', panel.id);
    b.addEventListener('click', () => switchTab(id));
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const next = all[(i + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length]!;
      switchTab(next);
      tabs[next].focus();
    });
    tabBar.append(b);
  });
  const status = h('p', 'cp-status');
  status.setAttribute('role', 'status');
  page.append(tabBar, panel, status);

  function switchTab(next: Tab, job?: Job): void {
    tab = next;
    if (job) jobFilter = job;
    message = '';
    build();
  }

  const act = (result: ModelResult, focusKey?: string): void => {
    if (!result.ok) {
      message = result.reason;
      status.textContent = message;
      return;
    }
    message = '';
    ctx.apply(result.state);
    build(focusKey);
    if (result.tierUps?.length) ctx.onTierUps?.(result.tierUps);
  };

  // ---- card faces ----
  function cardEl(e: CardEntry, state: GameState, scale: number): HTMLElement {
    const props: CardProps = {
      name: e.name,
      label: JOB_NAMES[e.job],
      job: e.job,
      emblem: e.emblem,
      item: e.item,
      ...(e.owned ? { element: e.element } : {}),
      rank: e.rank,
      stats: e.owned
        ? e.stats
        : [
            { label: '', value: '' },
            { label: '', value: '' },
          ],
      theme: resolveCard(content, state.cosmetics.loadout, {
        id: e.id,
        rank: e.rank,
        rarity: e.rarity,
      }),
    };
    const view = createCard(props);
    view.el.removeAttribute('aria-label');
    view.el.setAttribute('aria-hidden', 'true');
    const fit = h('span', `cp-fit${e.owned ? '' : ' cp-fit--locked'}`);
    fit.style.setProperty('--s', String(scale));
    fit.append(view.el);
    return fit;
  }

  // ---- build ----
  function build(focusKey?: string): void {
    hideTip();
    const state = ctx.state();
    last = model.signature(state);
    ticks = [];
    for (const id of Object.keys(tabs) as Tab[]) {
      tabs[id].setAttribute('aria-selected', String(id === tab));
      tabs[id].tabIndex = id === tab ? 0 : -1;
    }
    panel.setAttribute('aria-labelledby', tabs[tab].id);
    const entries = model.entries(state);
    if (selected === null || !entries.some((e) => e.id === selected)) {
      selected = (entries.find((e) => e.role?.slot === 'main') ?? entries[0])?.id ?? null;
    }
    panel.replaceChildren(
      tab === 'collection' ? collection(state, entries) : loadouts(state, entries),
    );
    status.textContent = message;
    if (focusKey) panel.querySelector<HTMLElement>(`[data-key="${focusKey}"]`)?.focus();
  }

  // ---- collection ----
  function collection(state: GameState, entries: CardEntry[]): HTMLElement {
    const wrap = h('div', 'cp-wrap');
    const owned = entries.filter((e) => e.owned).length;
    const note = `${COPY.cards.found(owned, entries.length)} · ${COPY.cards.shards} ${model.shards(state)}`;
    const { el, body } = frame(COPY.cards.collectionTab, note);
    el.classList.add('cp-collection');

    // toolbar
    const bar = h('div', 'cp-toolbar');
    const chips = h('div', 'cp-chips');
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', COPY.cards.filters);
    const chip = (label: string, on: boolean, key: string, onClick: () => void) => {
      const b = h('button', 'cp-chip', label);
      b.type = 'button';
      b.dataset.key = key;
      b.setAttribute('aria-pressed', String(on));
      b.addEventListener('click', () => {
        onClick();
        build(key);
      });
      return b;
    };
    chips.append(chip(COPY.cards.allJobs, jobFilter === null, 'job-all', () => (jobFilter = null)));
    for (const job of JOB_ORDER) {
      chips.append(chip(JOB_NAMES[job], jobFilter === job, `job-${job}`, () => (jobFilter = job)));
    }
    const readyCount = entries.filter((e) => e.next?.ready).length;
    chips.append(
      chip(COPY.cards.ready(readyCount), readyOnly, 'ready', () => (readyOnly = !readyOnly)),
    );
    const sortLabel = h('label', 'cp-sort');
    sortLabel.append(h('span', '', COPY.cards.sort));
    const select = h('select', 'cp-select');
    select.dataset.key = 'sort';
    for (const [value, label] of Object.entries(COPY.cards.sortBy)) {
      const o = h('option', '', label);
      o.value = value;
      o.selected = value === sort;
      select.append(o);
    }
    select.addEventListener('change', () => {
      sort = select.value as Sort;
      build('sort');
    });
    sortLabel.append(select);
    bar.append(chips, sortLabel);

    // grid
    const shown = sorted(
      entries.filter((e) => (!jobFilter || e.job === jobFilter) && (!readyOnly || e.next?.ready)),
    );
    const grid = h('ul', 'cp-grid');
    grid.setAttribute('aria-label', COPY.cards.collectionTab);
    for (const e of shown) {
      const li = h('li', 'cp-cell');
      const b = h('button', 'cp-tile');
      b.type = 'button';
      b.dataset.key = `tile-${e.id}`;
      b.setAttribute('aria-pressed', String(e.id === selected));
      const detail = e.owned
        ? `${COPY.cards.rankText(TIER_NAMES[e.rank.tier]!, e.rank.stars)}, ${COPY.cards.level} ${e.level}`
        : COPY.cards.notFound;
      b.setAttribute('aria-label', COPY.cards.tileLabel(e.name, detail));
      b.append(cardEl(e, state, 0.6));
      if (e.owned && e.duplicates > 0) b.append(h('span', 'cp-badge bi-num', `+${e.duplicates}`));
      if (e.role) b.append(h('span', 'cp-role', COPY.cards.role[e.role.slot]));
      if (e.next?.ready) b.append(h('span', 'cp-ready', '▲'));
      b.addEventListener('click', () => {
        selected = e.id;
        message = '';
        build(`tile-${e.id}`);
      });
      li.append(b);
      grid.append(li);
    }
    body.append(bar, grid);
    const pick = entries.find((e) => e.id === selected);
    wrap.append(el, pick ? detailPanel(state, pick) : h('div'));
    return wrap;
  }

  function sorted(list: CardEntry[]): CardEntry[] {
    const rarity = (e: CardEntry) => RARITIES.indexOf(e.rarity);
    const rank = (e: CardEntry) => TIER_ORDER.indexOf(e.rank.tier) * 6 + e.rank.stars;
    const by: Record<Sort, (a: CardEntry, b: CardEntry) => number> = {
      rarity: (a, b) => rarity(b) - rarity(a),
      rank: (a, b) => rank(b) - rank(a),
      level: (a, b) => b.level - a.level,
      name: (a, b) => a.name.localeCompare(b.name),
    };
    // owned first, then the chosen order, then job order for ties
    return [...list].sort(
      (a, b) =>
        Number(b.owned) - Number(a.owned) ||
        by[sort](a, b) ||
        JOB_ORDER.indexOf(a.job) - JOB_ORDER.indexOf(b.job),
    );
  }

  // ---- detail panel ----
  function detailPanel(state: GameState, e: CardEntry): HTMLElement {
    const { el, body } = frame(e.name, `${cap1(e.rarity)} · ${JOB_NAMES[e.job]}`);
    el.classList.add('cp-detail');
    const top = h('div', 'cp-detail__top');
    top.append(cardEl(e, state, 0.86));
    const side = h('div', 'cp-detail__side');
    if (!e.owned) {
      side.append(h('p', 'frame__muted', COPY.cards.lockedDetail));
    } else {
      side.append(levelMeter(e.id));
      if (e.role) {
        side.append(
          h('p', 'cp-inrole', COPY.cards.inLoadout(COPY.cards.role[e.role.slot], JOB_NAMES[e.job])),
        );
      }
    }
    top.append(side);

    const facts = h('dl', 'cp-facts');
    const fact = (label: string, value: string) => {
      const d = h('div');
      d.append(h('dt', '', label), h('dd', '', value));
      facts.append(d);
    };
    fact(COPY.cards.mainAbility, e.mainAbility);
    fact(COPY.cards.supportEffect, e.supportEffect);
    fact(COPY.cards.cost, String(e.cost));
    if (e.owned) fact(COPY.cards.duplicates, String(e.duplicates));
    body.append(top, facts);

    if (e.owned) {
      body.append(upgradeBox(e.id));
      const chart = model.chart(state, e.id);
      if (chart && chart.stars.length > 0) body.append(enhanceBox(e.id, chart));
      const actions = h('div', 'cp-actions');
      const btn = (label: string, key: string, run: () => ModelResult, disabled = false) => {
        const b = h('button', 'button button--ghost', label);
        b.type = 'button';
        b.dataset.key = key;
        b.disabled = disabled;
        b.addEventListener('click', () => act(run(), key));
        actions.append(b);
      };
      btn(
        COPY.cards.setMain,
        'set-main',
        () => model.setMain(ctx.state(), e.id),
        e.role?.slot === 'main',
      );
      btn(
        COPY.cards.addSupport,
        'add-support',
        () => model.addSupport(ctx.state(), e.id),
        e.role?.slot === 'support',
      );
      if (e.role) btn(COPY.cards.remove, 'remove', () => model.remove(ctx.state(), e.id));
      body.append(actions);
    }
    return el;
  }

  function entryOf(id: string): CardEntry | undefined {
    return model.entries(ctx.state()).find((x) => x.id === id);
  }

  function levelMeter(id: string): HTMLElement {
    const box = h('div', 'cp-level');
    const row = h('div', 'cp-level__row');
    const value = h('span', 'bi-num');
    row.append(h('span', '', COPY.cards.level), value);
    const track = h('div', 'cp-level__track');
    const fill = h('i');
    track.append(fill);
    track.setAttribute('role', 'meter');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    const note = h('p', 'cp-level__note');
    box.append(row, track, note);
    const update = () => {
      const e = entryOf(id);
      if (!e) return;
      const atCap = e.level >= e.cap;
      const f = atCap ? 1 : e.xp;
      fill.style.width = `${(f * 100).toFixed(1)}%`;
      const v = COPY.cards.levelValue(e.level, e.cap);
      if (value.textContent !== v) value.textContent = v;
      track.setAttribute('aria-valuenow', String(Math.round(f * 100)));
      track.setAttribute('aria-label', `${COPY.cards.level} ${v}`);
      const n = atCap ? COPY.cards.atCap : COPY.cards.toCap(e.cap - e.level);
      if (note.textContent !== n) note.textContent = n;
    };
    ticks.push(update);
    update();
    return box;
  }

  function upgradeBox(id: string): HTMLElement {
    const box = h('section', 'cp-upgrade');
    let shown = '';
    const draw = (step: UpgradeStep | null) => {
      const keep = document.activeElement?.closest('.cp-upgrade') === box;
      box.replaceChildren();
      if (!step) {
        box.append(h('p', 'frame__muted', COPY.cards.maxRank));
        return;
      }
      box.append(h('h3', 'cp-upgrade__title', step.title));
      const list = h('ul', 'cp-reqs');
      for (const r of step.requirements) {
        const li = h('li', `cp-req${r.met ? ' cp-req--met' : ''}`);
        const mark = h('span', 'cp-req__mark', r.met ? '✓' : '✗');
        mark.setAttribute('aria-label', r.met ? COPY.cards.met : COPY.cards.missing);
        li.append(mark, h('span', '', r.label), h('span', 'bi-num', r.value));
        list.append(li);
      }
      const b = h('button', 'button cp-upgrade__btn', step.action);
      b.type = 'button';
      b.dataset.key = 'upgrade';
      b.disabled = !step.ready;
      b.addEventListener('click', () => act(model.upgrade(ctx.state(), id), 'upgrade'));
      box.append(list, h('p', 'cp-upgrade__note', step.note), b);
      if (keep) b.focus();
    };
    const update = () => {
      const step = entryOf(id)?.next ?? null;
      const key = JSON.stringify(step);
      if (key === shown) return;
      shown = key;
      draw(step);
    };
    ticks.push(update);
    update();
    return box;
  }

  /**
   * Card enhancements (DESIGN.md 10b, 17; A8 A): a small star chart of the card's options over a
   * point budget bar. A lit star is chosen; clicking an open one chooses it; reset is free.
   */
  const pixelState = (st: StarView['state']): 'owned' | 'open' | 'locked' =>
    st === 'chosen' ? 'owned' : st === 'open' ? 'open' : 'locked';

  function enhanceBox(id: string, v: StarChartView): HTMLElement {
    const t = COPY.enhance;
    const box = h('section', `cp-enhance${v.unlocked ? '' : ' is-locked'}`);
    box.setAttribute('aria-labelledby', 'cp-enhance-title');
    const head = h('div', 'cp-enhance__head');
    const title = h('h3', 'cp-upgrade__title', t.title);
    title.id = 'cp-enhance-title';
    head.append(title);
    if (v.unlocked) head.append(h('span', 'cp-enhance__points bi-num', v.pointsText));
    box.append(head);

    const choose = (optionId: string, key: string) => {
      const name = v.stars.find((s) => s.id === optionId)?.name ?? '';
      act(model.enhance(ctx.state(), id, optionId), key);
      if (!message) status.textContent = t.picked(name);
    };

    // the chart: the pixel sky of the equipped nodes style, with a button laid over each star
    const style = nodeStyle(ctx.content, ctx.state());
    const chart = h('div', 'cp-chart');
    chart.style.aspectRatio = `${CHART.w} / ${CHART.h}`;
    chart.innerHTML = chartSky(
      style,
      v.stars.map((s) => ({ x: s.x, y: s.y, state: pixelState(s.state) })),
      v.stars.slice(1).map((_, i) => [i, i + 1] as const),
    );
    for (const s of v.stars) {
      const star = h('button', `cp-star is-${s.state}`);
      star.type = 'button';
      star.tabIndex = -1; // the list below is the keyboard way in
      star.setAttribute('aria-hidden', 'true');
      star.style.left = `${(s.x / CHART.w) * 100}%`;
      star.style.top = `${(s.y / CHART.h) * 100}%`;
      // not `disabled`: a disabled button gets no hover, and every star keeps its tooltip
      attachTooltip(star, () => tipTable(s.name, [[s.effect, s.costText]]));
      star.addEventListener('click', () => {
        if (s.state === 'open') choose(s.id, `enh-${s.id}`);
      });
      chart.append(star);
    }
    box.append(chart);

    if (!v.unlocked) {
      box.append(h('p', 'cp-enhance__locked', v.lockedText));
    } else {
      const meter = h('div', 'cp-budget');
      meter.setAttribute('role', 'meter');
      meter.setAttribute('aria-valuemin', '0');
      meter.setAttribute('aria-valuemax', String(v.budget));
      meter.setAttribute('aria-valuenow', String(v.spent));
      meter.setAttribute('aria-label', t.budgetLabel(v.spent, v.budget));
      for (const on of v.pips) meter.append(h('i', on ? 'is-on' : ''));
      box.append(meter);
    }

    // the key: every option as a row (the accessible way to choose)
    const list = h('ul', 'cp-options');
    for (const s of v.stars) {
      const li = h('li');
      const b = h('button', `cp-option is-${s.state}`);
      b.type = 'button';
      b.dataset.key = `enh-${s.id}`;
      b.setAttribute('aria-label', s.label);
      b.disabled = s.state !== 'open';
      const mark = h('span', `cp-option__star is-${s.state}`);
      mark.innerHTML = chartStar(style, pixelState(s.state));
      b.append(
        mark,
        h('span', 'cp-option__name', s.name),
        h('span', 'cp-option__effect bi-num', s.effect),
        h('span', 'cp-option__cost bi-num', s.costText),
      );
      b.addEventListener('click', () => choose(s.id, `enh-${s.id}`));
      li.append(b);
      list.append(li);
    }
    box.append(list);

    if (v.unlocked) {
      const foot = h('div', 'cp-enhance__foot');
      foot.append(h('p', 'cp-upgrade__note', t.note));
      const reset = h('button', 'button button--ghost', t.reset);
      reset.type = 'button';
      reset.dataset.key = 'enh-reset';
      reset.disabled = !v.canReset;
      reset.addEventListener('click', () => {
        act(model.resetEnhancements(ctx.state(), id), 'enh-reset');
        if (!message) status.textContent = t.cleared;
      });
      foot.append(reset);
      box.append(foot);
    }
    return box;
  }

  // ---- loadouts ----
  function loadouts(state: GameState, entries: CardEntry[]): HTMLElement {
    const wrap = h('div', 'cp-loadouts');
    const byId = new Map(entries.map((e) => [e.id, e]));
    for (const job of JOB_ORDER) {
      const lo = model.loadout(state, job);
      const { el, body } = frame(COPY.cards.jobLoadout(JOB_NAMES[job]));
      el.classList.add('cp-job');
      const meter = h('div', 'cp-level');
      const row = h('div', 'cp-level__row');
      row.append(
        h('span', '', COPY.cards.loadoutCost),
        h('span', 'bi-num', COPY.cards.costValue(lo.cost, lo.cap)),
      );
      const track = h('div', 'cp-level__track');
      const fill = h('i');
      fill.style.width = `${Math.min(100, (lo.cost / Math.max(lo.cap, 1)) * 100)}%`;
      track.append(fill);
      track.setAttribute('role', 'meter');
      track.setAttribute('aria-valuemin', '0');
      track.setAttribute('aria-valuemax', String(lo.cap));
      track.setAttribute('aria-valuenow', String(lo.cost));
      track.setAttribute(
        'aria-label',
        `${COPY.cards.loadoutCost} ${COPY.cards.costValue(lo.cost, lo.cap)}`,
      );
      meter.append(row, track);

      const slots = h('ol', 'cp-slots');
      lo.slots.forEach((id, i) => {
        const li = h('li', 'cp-slot');
        const label = i === 0 ? COPY.cards.mainSlot : COPY.cards.supportSlot(i);
        li.append(h('span', 'cp-slot__label', label));
        const e = id ? byId.get(id) : undefined;
        if (e) {
          const open = h('button', 'cp-tile');
          open.type = 'button';
          open.dataset.key = `slot-${job}-${i}`;
          open.setAttribute('aria-label', `${label}: ${e.name}`);
          open.append(cardEl(e, state, 0.5));
          open.addEventListener('click', () => {
            selected = e.id;
            switchTab('collection');
            panel.querySelector<HTMLElement>(`[data-key="tile-${e.id}"]`)?.focus();
          });
          const rm = h('button', 'button button--ghost cp-slot__remove', COPY.cards.remove);
          rm.type = 'button';
          rm.dataset.key = `rm-${job}-${i}`;
          rm.setAttribute('aria-label', `${COPY.cards.remove}: ${e.name}`);
          rm.addEventListener('click', () =>
            act(model.remove(ctx.state(), e.id), `rm-${job}-${i}`),
          );
          li.append(open, rm);
        } else {
          const empty = h('button', 'cp-empty', COPY.cards.chooseCard);
          empty.type = 'button';
          empty.dataset.key = `slot-${job}-${i}`;
          empty.setAttribute(
            'aria-label',
            `${label}: ${COPY.cards.emptySlot}. ${COPY.cards.chooseCard}`,
          );
          empty.addEventListener('click', () => {
            jobFilter = job;
            readyOnly = false;
            switchTab('collection');
          });
          li.append(empty);
        }
        slots.append(li);
      });
      body.append(meter, slots);
      wrap.append(el);
    }
    return wrap;
  }

  return {
    render() {
      const state = ctx.state();
      if (model.signature(state) !== last || panel.childElementCount === 0) build();
      else for (const t of ticks) t();
    },
    show(next, job) {
      switchTab(next, job);
    },
  };
}
