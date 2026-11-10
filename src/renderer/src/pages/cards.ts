import { RANK_TIERS, RARITIES } from '../../../data';
import { resolveCard, TIER_LABELS, type GameState, type TierUp } from '../../../game';
import { COPY } from '../copy';
import { frame, h } from '../shell/shell';
import { attachTooltip, hide as hideTip, tipTable } from '../shell/tooltip';
import { createCard, type CardProps } from '../ui/card';
import { fitCard } from '../ui/pixelFit';
import { createWeaponPanel } from '../ui/weaponPanel';
import { chartSky, chartStar, nodeStyle } from '../ui/skillArt';
import {
  slotChoices,
  type CardEntry,
  type CardsModel,
  type Job,
  type JobLoadout,
  type ModelResult,
} from './cardsModel';
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
const TIER_ORDER: readonly string[] = RANK_TIERS;
const TIER_NAMES: Record<string, string> = TIER_LABELS;
/**
 * Card widths wanted (CSS px); ui/pixelFit.ts snaps each to a whole pixel scale (DESIGN.md §12).
 * The collection shows the full card (132 x 186 art pixels) four across at 1x and grows to 2x when
 * four fit that big (a 1080p window); the detail card is 2x (264 x 372).
 */
const CARD_WANT = { tile: 264, detail: 264, slot: 132 } as const;
/** Cards across the collection grid, and the gap between them (CSS px). */
const GRID_COLUMNS = 4;
const GRID_GAP = 10;
/** The weapon tiles beside the detail card: the narrowest they may get, and the gap to the card. */
const DETAIL_SIDE_MIN = 150;
const DETAIL_GAP = 12;
type Fit = Parameters<typeof fitCard>[1];

/**
 * Gives `host` its whole card scale (ui/pixelFit.ts) and keeps it right as the host's width
 * changes: its width is 0 while the page is hidden, and the scale it picks depends on it.
 * `data-n` carries the scale to the CSS (the compact card drops its job label at 1x).
 */
function watchFit(host: HTMLElement, fit: Fit): void {
  const apply = (): void => {
    host.dataset['n'] = String(fitCard(host, fit));
  };
  apply();
  let width = host.clientWidth;
  new ResizeObserver(() => {
    if (host.clientWidth === width) return;
    width = host.clientWidth;
    apply();
  }).observe(host);
}

/** The width of a host's content box, for `fitCard`'s `max`. */
function innerWidth(host: HTMLElement): number {
  const style = getComputedStyle(host);
  return host.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
}

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
  /** Weapon types in their `items.json` order, for the collection groups. */
  const itemOrder: readonly string[] = content.items.types.map((type) => type.kind);
  page.classList.add('shell-page--cards');
  page.querySelector('.shell-page__title')?.classList.add('sr-only');

  // ---- view state ----
  let tab: Tab = 'collection';
  let jobFilter: Job | null = null;
  let readyOnly = false;
  let sort: Sort = 'rarity';
  let selected: string | null = null;
  /** The Enhancements star chart is open under the buttons of the selected card. */
  let enhanceOpen = false;
  /** The loadout slot being filled (0 = main, 1..3 supports): its job's cards show to pick from. */
  let pick: { job: Job; slot: number } | null = null;
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
  // the tab bar lives inside the panel's top row (Collection and Loadouts alike, UI rework 2.2)
  page.append(panel, status);

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
  function cardEl(e: CardEntry, state: GameState): HTMLElement {
    const props: CardProps = {
      name: e.name,
      label: JOB_NAMES[e.job],
      job: e.job,
      emblem: e.emblem,
      item: e.item,
      ...(e.owned ? { element: e.element } : {}),
      rank: e.rank,
      rarity: e.rarity,
      face: e.face,
      theme: resolveCard(content, state.cosmetics.loadout, {
        id: e.id,
        rank: e.rank,
        rarity: e.rarity,
      }),
    };
    const view = createCard(props);
    view.el.removeAttribute('aria-label');
    view.el.setAttribute('aria-hidden', 'true');
    const fit = h('span', `cp-fit${e.owned ? ' cp-fit--lv' : ' cp-fit--locked'}`);
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
    if (focusKey) {
      // a taken star leaves no Add star button: focus goes to the star line
      const target =
        panel.querySelector<HTMLElement>(`[data-key="${focusKey}"]`) ??
        (focusKey.startsWith('wp-') ? panel.querySelector<HTMLElement>('.wp-stars') : null);
      target?.focus();
    }
  }

  // ---- collection ----
  function collection(state: GameState, entries: CardEntry[]): HTMLElement {
    const wrap = h('div', 'cp-wrap');
    const owned = entries.filter((e) => e.owned).length;
    const el = h('section', 'frame cp-collection');
    el.setAttribute('aria-label', COPY.cards.collectionTab);

    // the top rows: the tabs and the shard count, then the filters, sort and found count
    const head = h('div', 'cp-head');
    head.append(tabBar, h('span', 'cp-shards bi-num', COPY.cards.shardsLabel(model.shards(state))));
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
    const readyCount = entries.filter(isReady).length;
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
    const count = h('span', 'cp-count bi-num', COPY.cards.found(owned, entries.length));
    const tools = h('div', 'cp-tools');
    tools.append(sortLabel, count);
    bar.append(chips, tools);

    // grid
    const shown = sorted(
      entries.filter((e) => (!jobFilter || e.job === jobFilter) && (!readyOnly || isReady(e))),
    );
    const grid = h('ul', 'cp-grid');
    watchFit(grid, {
      want: CARD_WANT.tile,
      max: () => innerWidth(grid),
      row: { count: GRID_COLUMNS, gap: GRID_GAP },
    });
    grid.setAttribute('aria-label', COPY.cards.collectionTab);
    // Owned cards first, then the unowned ones grouped by weapon type, each group with its
    // collected count (UI_RULES §2, Owned cards first).
    const heading = (text: string, key: string): void => {
      const li = h('li', 'cp-group');
      li.dataset.key = key;
      li.append(h('h3', 'cp-group__title', text));
      grid.append(li);
    };
    const mine = shown.filter((e) => e.owned);
    const kinds = [...new Set(shown.map((e) => e.itemKind))].sort(
      (a, b) => itemOrder.indexOf(a) - itemOrder.indexOf(b),
    );
    const groups: Array<{ title: string | null; key: string; list: CardEntry[] }> = [
      {
        title: mine.length > 0 ? COPY.cards.ownedGroup(mine.length) : null,
        key: 'group-owned',
        list: mine,
      },
      ...kinds.flatMap((kind) => {
        const ofKind = shown.filter((e) => e.itemKind === kind);
        const missing = ofKind.filter((e) => !e.owned);
        if (missing.length === 0) return [];
        const have = ofKind.length - missing.length;
        return [
          {
            title: COPY.cards.typeGroup(missing[0]!.itemType, have, ofKind.length),
            key: `group-${kind}`,
            list: missing,
          },
        ];
      }),
    ];
    const cell = (e: CardEntry): void => {
      const li = h('li', 'cp-cell');
      const b = h('button', 'cp-tile');
      b.type = 'button';
      b.dataset.key = `tile-${e.id}`;
      b.setAttribute('aria-pressed', String(e.id === selected));
      // the loadout role is a word for screen readers only: the full-art card carries no chips
      const role = e.role ? `, ${COPY.cards.role[e.role.slot]}` : '';
      const detail = e.owned
        ? `${COPY.cards.rankText(TIER_NAMES[e.rank.tier]!, e.rank.stars)}, ${COPY.cards.level} ${e.level}${role}${isReady(e) ? `, ${COPY.cards.readyTag}` : ''}`
        : COPY.cards.notFound;
      b.setAttribute('aria-label', COPY.cards.tileLabel(e.name, detail));
      b.append(cardEl(e, state));
      if (e.owned) {
        const lv = h('span', 'cp-lv wp-chip bi-num', String(e.level));
        lv.setAttribute('aria-hidden', 'true');
        b.append(lv);
      }
      if (isReady(e)) {
        const ready = h('span', 'cp-ready', '▲');
        ready.setAttribute('aria-hidden', 'true');
        b.append(ready);
      }
      b.addEventListener('click', () => {
        if (selected !== e.id) enhanceOpen = false;
        selected = e.id;
        message = '';
        build(`tile-${e.id}`);
      });
      li.append(b);
      grid.append(li);
    };
    for (const g of groups) {
      if (g.title) heading(g.title, g.key);
      g.list.forEach(cell);
    }
    el.append(head, bar, grid);
    const pick = entries.find((e) => e.id === selected);
    wrap.append(el, pick ? detailPanel(state, pick) : h('div'));
    return wrap;
  }

  /** A star-up or a tier-up can be taken now. */
  const isReady = (e: CardEntry): boolean => Boolean(e.next?.ready || e.tier?.ready);

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
    // "rarity · job · role" on the right of the name
    const parts = [cap1(e.rarity), JOB_NAMES[e.job]];
    if (e.owned && e.role) parts.push(COPY.cards.role[e.role.slot]);
    const { el, body } = frame(e.name, parts.join(' · '));
    el.classList.add('cp-detail');

    // the card at 2x with its large level badge, and the weapon panel's tiles beside it
    // (DESIGN.md §5, §11); the card's whole scale is picked on this row
    const main = h('div', 'cp-detail__main');
    watchFit(main, {
      want: CARD_WANT.detail,
      max: () => innerWidth(main) - DETAIL_SIDE_MIN - DETAIL_GAP,
    });
    const face = cardEl(e, state);
    const side = h('div', 'cp-detail__side');
    if (!e.owned) {
      side.append(h('p', 'frame__muted px-tile cp-locked', COPY.cards.lockedDetail));
    } else {
      const panel = createWeaponPanel({
        variant: 'card',
        content,
        state: ctx.state,
        act: (kind) => {
          act(model.upgrade(ctx.state(), e.id, kind), `wp-${kind}`);
          // A tier-up of a card whose stars are free lands at ★6: the star flash plays once.
          if (kind === 'tier' && model.entry(ctx.state(), e.id)?.rank.stars === 6) {
            const card = page.querySelector<HTMLElement>('.cp-detail .bi-card');
            card?.classList.add('is-levelup');
            window.setTimeout(() => card?.classList.remove('is-levelup'), 1200);
          }
        },
      });
      if (panel.overlay) face.append(panel.overlay);
      side.append(panel.el);
      const update = (): void => {
        const entry = entryOf(e.id);
        if (entry) panel.update(entry);
      };
      ticks.push(update);
      update();
    }
    main.append(face, side);

    // main ability, support effect and cost as three tiles
    const facts = h('dl', 'cp-facts3');
    const fact = (label: string, value: string) => {
      const d = h('div', 'px-tile cp-fact');
      d.append(h('dt', '', label), h('dd', '', value));
      facts.append(d);
    };
    fact(COPY.cards.mainAbility, e.mainAbility);
    fact(COPY.cards.supportEffect, e.supportEffect);
    fact(COPY.cards.cost, String(e.cost));
    body.append(main, facts);

    if (e.owned) {
      const chart = model.chart(state, e.id);
      const hasChart = Boolean(chart && chart.stars.length > 0);
      const actions = h('div', 'cp-actions');
      const btn = (label: string, key: string, run: () => ModelResult, gold = false) => {
        const b = h('button', `button${gold ? '' : ' button--ghost'}`, label);
        b.type = 'button';
        b.dataset.key = key;
        b.addEventListener('click', () => act(run(), key));
        actions.append(b);
      };
      if (hasChart) {
        const b = h('button', 'button cp-enh-btn', COPY.enhance.title);
        b.type = 'button';
        b.dataset.key = 'enh-toggle';
        b.setAttribute('aria-expanded', String(enhanceOpen));
        b.setAttribute('aria-controls', 'cp-enhance');
        b.addEventListener('click', () => {
          enhanceOpen = !enhanceOpen;
          build('enh-toggle');
        });
        actions.append(b);
      }
      // a button for the role the card already has would do nothing: it is left out
      if (e.role?.slot !== 'main') {
        btn(COPY.cards.setMain, 'set-main', () => model.setMain(ctx.state(), e.id));
      }
      if (e.role?.slot !== 'support') {
        btn(COPY.cards.addSupport, 'add-support', () => model.addSupport(ctx.state(), e.id));
      }
      if (e.role) btn(COPY.cards.remove, 'remove', () => model.remove(ctx.state(), e.id));
      body.append(actions);
      if (hasChart && enhanceOpen && chart) body.append(enhanceBox(e.id, chart));
    }
    return el;
  }

  function entryOf(id: string): CardEntry | undefined {
    return model.entries(ctx.state()).find((x) => x.id === id);
  }

  /**
   * Card enhancements (DESIGN.md §10b, 17; A8 A): a small star chart of the card's options over a
   * point budget bar. A lit star is chosen; clicking an open one chooses it; reset is free.
   */
  const pixelState = (st: StarView['state']): 'owned' | 'open' | 'locked' =>
    st === 'chosen' ? 'owned' : st === 'open' ? 'open' : 'locked';

  function enhanceBox(id: string, v: StarChartView): HTMLElement {
    const t = COPY.enhance;
    const box = h('section', `cp-enhance${v.unlocked ? '' : ' is-locked'}`);
    box.id = 'cp-enhance';
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

  // ---- the loadout picker: the cards a slot could take, under the slots of its job ----
  function picker(
    state: GameState,
    entries: CardEntry[],
    lo: JobLoadout,
    slot: number,
    slotName: (i: number) => string,
  ): HTMLElement {
    const box = h('section', 'cp-pick');
    box.setAttribute('aria-label', COPY.cards.pickFor(slotName(slot)));
    const head = h('div', 'cp-pick__head');
    const done = h('button', 'button button--ghost', COPY.cards.pickCancel);
    done.type = 'button';
    done.dataset.key = `pick-done-${lo.job}`;
    done.addEventListener('click', () => {
      pick = null;
      build(`slot-${lo.job}-${slot}`);
    });
    head.append(
      h('h4', 'cp-pick__title', COPY.cards.pickFor(slotName(slot))),
      h('span', 'cp-pick__hint', COPY.cards.pickHint),
      done,
    );
    box.append(head);
    const byId = new Map(entries.map((e) => [e.id, e]));
    const choices = slotChoices(entries, lo, slot);
    if (choices.length === 0) {
      box.append(h('p', 'cp-pick__hint', COPY.cards.pickNone));
      return box;
    }
    const list = h('ul', 'cp-pick__list');
    watchFit(list, { want: CARD_WANT.slot });
    for (const c of choices) {
      const e = byId.get(c.id);
      if (!e) continue;
      const li = h('li', 'cp-pick__item');
      const tag = c.current
        ? COPY.cards.pickCurrent
        : !c.fits
          ? COPY.cards.pickOver(c.costAfter, lo.cap)
          : c.from !== null
            ? COPY.cards.pickSwap(slotName(c.from))
            : '';
      const b = h('button', 'cp-tile cp-pick__card');
      b.type = 'button';
      b.dataset.key = `pick-${lo.job}-${c.id}`;
      const usable = c.fits && !c.current;
      b.setAttribute('aria-disabled', String(!usable));
      b.setAttribute(
        'aria-label',
        [e.name, COPY.cards.pickCost(c.cost), tag].filter(Boolean).join('. '),
      );
      if (c.current) b.setAttribute('aria-pressed', 'true');
      b.append(cardEl(e, state));
      b.addEventListener('click', () => {
        if (!usable) return;
        const key = `slot-${lo.job}-${slot}`;
        pick = null;
        act(model.place(ctx.state(), slot, c.id), key);
      });
      const note = h('span', 'cp-pick__note bi-num', COPY.cards.pickCost(c.cost));
      li.append(b, note);
      if (tag) li.append(h('span', `cp-pick__tag${c.fits ? '' : ' is-over'}`, tag));
      if (!usable) li.classList.add('is-off');
      list.append(li);
    }
    box.append(list);
    return box;
  }

  // ---- loadouts ----
  function loadouts(state: GameState, entries: CardEntry[]): HTMLElement {
    const wrap = h('div', 'cp-loadouts');
    const head = h('div', 'cp-head');
    head.append(tabBar);
    wrap.append(head);
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
      watchFit(slots, { want: CARD_WANT.slot });
      const picking = pick && pick.job === job ? pick.slot : null;
      const slotName = (i: number): string =>
        i === 0 ? COPY.cards.mainSlot : COPY.cards.supportSlot(i);
      lo.slots.forEach((id, i) => {
        const li = h('li', `cp-slot${picking === i ? ' is-picking' : ''}`);
        const label = slotName(i);
        li.append(h('span', 'cp-slot__label', label));
        const e = id ? byId.get(id) : undefined;
        // Click a slot to fill or change it: the cards that fit show under the slots.
        const choose = (): void => {
          pick = picking === i ? null : { job, slot: i };
          build(`slot-${job}-${i}`);
        };
        if (e) {
          const open = h('button', 'cp-tile');
          open.type = 'button';
          open.dataset.key = `slot-${job}-${i}`;
          open.setAttribute('aria-label', COPY.cards.changeCard(label, e.name));
          open.setAttribute('aria-pressed', String(picking === i));
          open.append(cardEl(e, state));
          open.addEventListener('click', choose);
          const buttons = h('div', 'cp-slot__buttons');
          const details = h('button', 'button button--ghost cp-slot__remove', COPY.cards.openCard);
          details.type = 'button';
          details.dataset.key = `open-${job}-${i}`;
          details.setAttribute('aria-label', `${COPY.cards.openCard}: ${e.name}`);
          details.addEventListener('click', () => {
            if (selected !== e.id) enhanceOpen = false;
            selected = e.id;
            pick = null;
            switchTab('collection');
            panel.querySelector<HTMLElement>(`[data-key="tile-${e.id}"]`)?.focus();
          });
          const rm = h('button', 'button button--ghost cp-slot__remove', COPY.cards.remove);
          rm.type = 'button';
          rm.dataset.key = `rm-${job}-${i}`;
          rm.setAttribute('aria-label', `${COPY.cards.remove}: ${e.name}`);
          rm.addEventListener('click', () =>
            act(model.remove(ctx.state(), e.id), `slot-${job}-${i}`),
          );
          buttons.append(details, rm);
          li.append(open, buttons);
        } else {
          const empty = h('button', 'cp-empty', COPY.cards.chooseCard);
          empty.type = 'button';
          empty.dataset.key = `slot-${job}-${i}`;
          empty.setAttribute(
            'aria-label',
            `${label}: ${COPY.cards.emptySlot}. ${COPY.cards.chooseCard}`,
          );
          empty.setAttribute('aria-pressed', String(picking === i));
          empty.addEventListener('click', choose);
          li.append(empty);
        }
        slots.append(li);
      });
      body.append(meter, slots);
      if (picking !== null) body.append(picker(state, entries, lo, picking, slotName));
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
