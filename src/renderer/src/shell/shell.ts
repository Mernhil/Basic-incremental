import type { CoinAmount } from '../settings/coins';
import { Decimal } from '../../../game';
import { fmt } from '../settings/numberFormat';
import { COPY } from '../copy';
import { rollToward } from '../stage/math';
import { onFrame, replay } from '../stage/motion';
import { icon, type IconName } from './icons';
import { attachTooltip, type TipContent } from './tooltip';
import './shell.css';

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = '',
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A framed panel: dark gilded body with a name-plate title, like the cards. */
export function frame(title: string, note?: string): { el: HTMLElement; body: HTMLElement } {
  const el = h('section', 'frame');
  const head = h('header', 'frame__title');
  const heading = h('h2', 'frame__heading', title);
  heading.id = `frame-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  el.setAttribute('aria-labelledby', heading.id);
  head.append(heading);
  if (note) head.append(h('span', 'frame__note', note));
  const body = h('div', 'frame__body');
  el.append(head, body);
  return { el, body };
}

export interface Currency {
  id: string;
  name: string;
  icon: IconName;
  /** Full-colour SVG markup (a gem coin). Replaces the line icon when set. */
  art?: string;
  /** Not in the header: its coins fly to the Details button instead (DESIGN.md §11). */
  inDetails?: boolean;
  /** Swappable icon id (`ui/resourceIcons.ts`), set as `data-icon` for the graphics pass. */
  iconId?: string;
  /** A crystal: bigger glyph with a glow and a slow shimmer, and a bigger pickup moment. */
  crystal?: boolean;
  tip: TipContent;
}

export interface Shell {
  /** The whole screen: the header on top, `main` under it (UI_RULES.md §2, "The table"). */
  el: HTMLElement;
  /** Where the table goes, under the header. */
  main: HTMLElement;
  /** Notices over the table (a save warning, a cleared dungeon). */
  notices: HTMLElement;
  /** The account level badge, XP bar and points to spend (pages/accountModel `levelBadge`). */
  setLevel(view: {
    level: number;
    fraction: number;
    xpText: string;
    points: number;
    label: string;
  }): void;
  /** Plays the level-up flash on the badge. */
  flashLevel(): void;
  /** The reward track panel under the header (DESIGN.md §10). */
  track: HTMLElement;
  setTrackOpen(open: boolean): void;
  levelButton: HTMLElement;
  /**
   * Sets a resource chip's amount (the chip rolls to it smoothly) and its per-second rate (null
   * hides the rate). Chips stay hidden until the amount is above zero once.
   */
  setCurrency(id: string, amount: Decimal, perSecond: Decimal | null): void;
  /** The coin glyph of a resource chip: where flying coins land (null while the chip is hidden). */
  currencyGlyph(id: string): HTMLElement | null;
  /** A short pulse on a chip when coins land. */
  pulseCurrency(id: string): void;
  /**
   * Holds back part of a chip's amount (welcome back: the gains stay off the counter until
   * collected). `null` releases it and the counter rolls up.
   */
  holdCurrency(id: string, amount: Decimal | null): void;
  /** The Details button (opens the panel with every resource the header leaves out). */
  detailsButton: HTMLButtonElement;
  /** Slot at the right end of the header for quick toggles (sound). */
  tools: HTMLElement;
  /** Replaces a resource chip's coin art (the gem's mastery metal, DESIGN.md §4). */
  setCurrencyArt(id: string, art: string): void;
  /** The goal list that drops down under the Goals button (DESIGN.md §10). */
  goals: HTMLElement;
  /** The Goals button. */
  goalsButton: HTMLButtonElement;
  /** The Goals button's count of goals shown (0 hides it). */
  setGoals(count: number): void;
  /** Rolls the goal list back up. */
  closeGoals(): void;
}

export function createShell(opts: {
  /** How a currency counts in coins (Money), or null for a plain number (DESIGN.md §3 Coins). */
  coins?: (id: string, amount: Decimal) => CoinAmount | null;
  /** The picture of a coin of the ladder (its still), for the Money chip. */
  coinArt?: (coinId: string) => string;
  version: string;
  currencies: Currency[];
  levelTip: TipContent;
  /** The account level was clicked (opens the reward track). */
  onLevel?: () => void;
}): Shell {
  const el = h('div', 'shell');

  // ---- header ----
  const header = h('header', 'shell-header');
  const brand = h('div', 'shell-brand');
  brand.append(
    h('span', 'shell-brand__name', COPY.shell.title),
    h('span', 'shell-brand__ver', opts.version),
  );

  // the account level (DESIGN.md §11, §10): opens the reward track
  const level = h('button', 'shell-level');
  level.type = 'button';
  level.setAttribute('aria-expanded', 'false');
  level.setAttribute('aria-controls', 'shell-track');
  const badge = h('span', 'shell-level__badge bi-num', '1');
  const points = h('span', 'shell-level__points bi-num');
  points.hidden = true;
  const badgeWrap = h('span', 'shell-level__badge-wrap');
  badgeWrap.append(badge, points);
  const meta = h('span', 'shell-level__meta');
  const levelLabel = h('span', 'shell-level__label', COPY.shell.level(1));
  const bar = h('span', 'shell-level__bar');
  const fill = h('span', 'shell-level__fill');
  bar.append(fill);
  const xp = h('span', 'shell-level__xp bi-num');
  meta.append(levelLabel, bar, xp);
  level.append(badgeWrap, meta);
  attachTooltip(level, opts.levelTip);
  level.addEventListener('click', () => opts.onLevel?.());

  const currencyList = h('ul', 'shell-currencies');
  currencyList.setAttribute('aria-label', COPY.shell.currencies);
  const currencyValues = new Map<string, HTMLElement>();
  const currencyItems = new Map<string, HTMLElement>();
  const currencyRates = new Map<string, HTMLElement>();
  const currencyGlyphs = new Map<string, HTMLElement>();
  const glyphArt = new Map<string, string>();
  const crystals = new Set<string>();
  /** Rolling counters (DESIGN.md §11): shown value, target and held-back part per resource. */
  const counters = new Map<string, { shown: Decimal; target: Decimal; held: Decimal }>();
  // the Details button: resources the header leaves out land their coins here
  const detailsBtn = h('button', 'shell-details');
  detailsBtn.type = 'button';
  detailsBtn.setAttribute('aria-haspopup', 'dialog');
  detailsBtn.setAttribute('aria-expanded', 'false');
  detailsBtn.setAttribute('aria-label', COPY.details.buttonLabel);
  const detailsGlyph = h('span', 'shell-details__glyph');
  detailsGlyph.append(icon('details', 'shell-icon'));
  detailsBtn.append(detailsGlyph, h('span', 'shell-details__label', COPY.details.button));
  for (const c of opts.currencies) {
    if (c.inDetails) {
      // an invisible landing spot inside the button, drawn as the resource's own coin
      const land = h('span', 'shell-details__land');
      land.setAttribute('aria-hidden', 'true');
      if (c.art) land.innerHTML = c.art;
      detailsGlyph.append(land);
      currencyGlyphs.set(c.id, land);
      continue;
    }
    const item = h(
      'li',
      `shell-currency ${c.crystal ? 'shell-currency--crystal' : 'shell-currency--money'}`,
    );
    if (c.iconId) item.dataset.icon = c.iconId;
    if (c.crystal) crystals.add(c.id);
    item.tabIndex = 0;
    const value = h('span', 'shell-currency__value bi-num', '0');
    const glyph = h('span', 'shell-currency__art');
    if (c.art) glyph.innerHTML = c.art;
    else glyph.append(icon(c.icon, 'shell-icon shell-currency__icon'));
    const amounts = h('span', 'shell-currency__amounts');
    const rate = h('span', 'shell-currency__rate bi-num');
    rate.hidden = true;
    amounts.append(value, rate);
    item.append(glyph, amounts, h('span', 'shell-currency__name', c.name));
    currencyRates.set(c.id, rate);
    currencyGlyphs.set(c.id, glyph);
    counters.set(c.id, { shown: new Decimal(0), target: new Decimal(0), held: new Decimal(0) });
    attachTooltip(item, c.tip);
    // header chips (Money and the crystals) are always shown
    currencyValues.set(c.id, value);
    currencyItems.set(c.id, item);
    currencyList.append(item);
  }
  const tools = h('div', 'shell-tools');

  // the Goals button (UI_RULES.md §2, "Goals are a header button"): the list drops down under it
  const goalsWrap = h('div', 'shell-goals');
  const goalsBtn = h('button', 'px-btn shell-goals__btn');
  goalsBtn.type = 'button';
  goalsBtn.setAttribute('aria-expanded', 'false');
  goalsBtn.setAttribute('aria-controls', 'shell-goals-list');
  const goalsCount = h('span', 'shell-goals__count bi-num');
  goalsBtn.append(h('span', 'shell-goals__label', COPY.progress.goals), goalsCount);
  const goals = h('div', 'shell-goals__list');
  goals.id = 'shell-goals-list';
  goals.hidden = true;
  goalsWrap.append(goalsBtn, goals);
  const setGoalsOpen = (open: boolean, focusBack = false): void => {
    goals.hidden = !open;
    goalsBtn.setAttribute('aria-expanded', String(open));
    if (!open && focusBack) goalsBtn.focus();
  };
  goalsBtn.addEventListener('click', () => setGoalsOpen(goals.hidden === true));
  goals.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setGoalsOpen(false, true);
    }
  });
  goalsBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !goals.hidden) {
      e.preventDefault();
      setGoalsOpen(false);
    }
  });
  // a click on a goal or anywhere outside rolls it back up
  goals.addEventListener('click', (e) => {
    if ((e.target as Element | null)?.closest('button')) setGoalsOpen(false);
  });
  document.addEventListener('pointerdown', (e) => {
    if (!goals.hidden && !goalsWrap.contains(e.target as Node)) setGoalsOpen(false);
  });

  header.append(brand, level, goalsWrap, currencyList, detailsBtn, tools);

  onFrame((dt) => {
    for (const [id, c] of counters) {
      const goal = Decimal.max(c.target.sub(c.held), 0);
      if (c.shown.eq(goal)) continue;
      c.shown = rollToward(c.shown, goal, dt);
      // whole-number amounts (crystals, cores) roll through whole numbers only
      const shown = goal.eq(goal.floor()) ? c.shown.round() : c.shown;
      const v = currencyValues.get(id)!;
      // Money counts in coins (DESIGN.md §3 Coins): the chip shows the count and names the coin.
      const coin = opts.coins?.(id, shown) ?? null;
      const text = coin ? coin.value : fmt(shown);
      if (v.textContent !== text) v.textContent = text;
      if (coin) {
        const item = currencyItems.get(id);
        const label = item?.querySelector<HTMLElement>('.shell-currency__name');
        if (label && label.textContent !== coin.coin.name) label.textContent = coin.coin.name;
        if (item && item.dataset['coin'] !== coin.coin.id) {
          item.dataset['coin'] = coin.coin.id;
          const glyph = currencyGlyphs.get(id);
          const art = opts.coinArt?.(coin.coin.id);
          if (glyph && art) {
            glyph.innerHTML = art;
            // the coins that fly to this chip spin (stage/fly.ts)
            glyph.dataset['spin'] = `money-${coin.coin.id}`;
          }
        }
      }
    }
  });

  // ---- main: the table goes here; notices float over it ----
  const main = h('main', 'shell-main-area');
  const notices = h('div', 'shell-notices');

  // the reward track drops down under the header (A16 B quest scroll)
  const track = h('div', 'shell-track');
  track.id = 'shell-track';
  track.hidden = true;

  el.append(header, main, notices, track);

  // Below this width the header drops the coin and Details names (the window can shrink to 1024px).
  const narrow = window.matchMedia('(max-width: 1120px)');
  const applyNarrow = (): void => {
    el.classList.toggle('shell--narrow', narrow.matches);
  };
  narrow.addEventListener('change', applyNarrow);
  applyNarrow();

  return {
    el,
    main,
    notices,
    setLevel(v) {
      const set = (node: HTMLElement, text: string) => {
        if (node.textContent !== text) node.textContent = text;
      };
      set(badge, String(v.level));
      set(levelLabel, COPY.shell.level(v.level));
      fill.style.width = `${(Math.min(1, Math.max(0, v.fraction)) * 100).toFixed(1)}%`;
      set(xp, v.xpText);
      points.hidden = v.points <= 0;
      set(points, v.points > 0 ? String(v.points) : '');
      if (level.getAttribute('aria-label') !== v.label) level.setAttribute('aria-label', v.label);
    },
    flashLevel() {
      replay(level, 'is-levelling', 1400);
    },
    track,
    setTrackOpen(open) {
      track.hidden = !open;
      level.setAttribute('aria-expanded', String(open));
    },
    levelButton: level,
    setCurrency(id, amount, perSecond) {
      const c = counters.get(id);
      if (c) c.target = amount;
      const rate = currencyRates.get(id);
      if (rate) {
        const show = perSecond !== null && perSecond.gt(0);
        if (rate.hidden === show) rate.hidden = !show;
        const text = show ? COPY.shell.perSecond(fmt(perSecond)) : '';
        if (rate.textContent !== text) rate.textContent = text;
      }
    },
    currencyGlyph: (id) => {
      const item = currencyItems.get(id);
      if (item) return item.hidden ? null : (currencyGlyphs.get(id) ?? null);
      // not in the header: land on the Details button
      return currencyGlyphs.get(id) ?? detailsGlyph;
    },
    pulseCurrency(id) {
      const item = currencyItems.get(id);
      replay(item ?? detailsBtn, crystals.has(id) ? 'is-pulsing-big' : 'is-pulsing', 560);
    },
    detailsButton: detailsBtn,
    holdCurrency(id, amount) {
      const c = counters.get(id);
      if (c) c.held = amount ?? new Decimal(0);
    },
    tools,
    goals,
    goalsButton: goalsBtn,
    setGoals(count) {
      const text = count > 0 ? String(count) : '';
      if (goalsCount.textContent !== text) goalsCount.textContent = text;
      goalsBtn.setAttribute('aria-label', COPY.progress.goalsButton(count));
    },
    closeGoals() {
      setGoalsOpen(false);
    },
    setCurrencyArt(id, art) {
      const glyph = currencyGlyphs.get(id);
      if (glyph && glyphArt.get(id) !== art) {
        glyphArt.set(id, art);
        glyph.innerHTML = art;
      }
    },
  };
}
