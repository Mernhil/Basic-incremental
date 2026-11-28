import {
  buyPostUpgrade,
  cardCost,
  cardDisplayName,
  collectModifiers,
  Decimal,
  farmTeamOf,
  farmTeamProblem,
  loadoutCost,
  loadoutCostCap,
  pickPostTrait,
  postOf,
  postTraitOffer,
  postUpgradeCost,
  rerollPostTraits,
  setFarmSlot,
  type GameState,
} from '../../../game';
import { ITEM_VIEWBOX } from '../art/items';
import { backgroundFor } from '../stage/arenaBackground';
import { fmt } from '../settings/numberFormat';
import { h } from '../shell/shell';
import { keptIconMarkup, resourceIconMarkup } from '../ui/resourceIcons';
import { cardItemArt } from './loadoutCards';
import { FARM_COPY, farmingModel, type FarmPostCard } from './farmingModel';
import type { PageContext } from './production';
import './farming.css';

/**
 * The Farming tab (DESIGN.md §2 A team farms a finished dungeon): every dungeon's post is a card on
 * one page, the totals of all posts across the top, and two dialogs (Team, Traits) over the page.
 * A post card is rebuilt only when what it shows changes; its level bar moves in place, so scroll
 * and focus stay put while the game ticks.
 */

export interface FarmingPanel {
  el: HTMLElement;
  render(): void;
}

type Dialog = { kind: 'team' | 'traits'; dungeonId: string } | null;

export function createFarmingPanel(ctx: PageContext): FarmingPanel {
  const { content } = ctx;
  const el = h('section', 'fm');
  const top = h('header', 'fm__top');
  const title = h('h3', 'fm__title px-display', FARM_COPY.title);
  const totals = h('p', 'fm__totals bi-num');
  totals.setAttribute('role', 'status');
  top.append(title, totals);
  const grid = h('div', 'fm__grid');
  const overlay = h('div', 'fm__overlay');
  overlay.hidden = true;
  el.append(top, grid, overlay);

  let dialog: Dialog = null;
  const cards = new Map<string, { el: HTMLElement; key: string; bar: HTMLElement }>();
  let dialogKey = '';

  const iconOf = (id: string): string => {
    const resource = content.resourceById.get(id);
    return keptIconMarkup(id) ?? (resource ? (resourceIconMarkup(resource) ?? '') : '');
  };
  const artOf = (s: GameState, id: string): string =>
    `<svg viewBox="${ITEM_VIEWBOX}" aria-hidden="true" focusable="false">${cardItemArt(content, id, s.cards.owned[id], s)}</svg>`;

  const apply = (next: GameState): void => {
    ctx.apply(next);
    render();
  };

  function buildPost(card: FarmPostCard, s: GameState): HTMLElement {
    const post = h('article', 'fm-post px-panel');
    post.dataset['key'] = `post-${card.dungeonId}`;
    post.classList.toggle('is-closed', !card.open);
    const scene = h('div', 'fm-post__scene');
    scene.style.backgroundImage = `url("${backgroundFor(card.background).url}")`;
    const body = h('div', 'fm-post__body');
    body.append(h('h4', 'fm-post__name px-display', card.name));
    if (!card.open) {
      body.append(h('p', 'fm-post__closed', FARM_COPY.closed));
      post.append(scene, body);
      return post;
    }
    const team = h('div', 'fm-post__team');
    for (const id of card.view.team) {
      const slot = h('div', 'fm-slot px-tile');
      if (id) {
        const c = content.cardById.get(id);
        slot.title = c ? cardDisplayName(content, c) : id;
        slot.innerHTML = artOf(s, id);
      } else {
        slot.classList.add('is-empty');
        slot.title = FARM_COPY.empty;
      }
      team.append(slot);
    }
    const levelRow = h('div', 'fm-post__level');
    const levelText = h('span', 'fm-post__lv px-display', card.levelText);
    const bar = h('div', 'fm-bar');
    bar.append(h('div', 'fm-bar__fill'));
    levelRow.append(levelText, bar);
    const trait = h('p', 'fm-post__trait', card.traitText);
    trait.classList.toggle('is-ready', card.traitReady);
    const lines = h('ul', 'fm-lines');
    if (card.teamCount === 0) lines.append(h('li', 'fm-lines__note', FARM_COPY.noTeam));
    for (const line of card.lines) {
      const li = h('li', 'fm-line');
      li.dataset['key'] = `line-${line.key}`;
      li.classList.toggle('is-zero', card.teamCount === 0);
      const icon = h('span', 'fm-line__icon');
      icon.innerHTML = iconOf(line.icon);
      li.append(icon, h('span', 'fm-line__label', line.label));
      if (line.farmOnly) li.append(h('span', 'fm-line__tag', FARM_COPY.farmOnly));
      li.append(h('span', 'fm-line__value bi-num', line.value));
      lines.append(li);
    }
    const buttons = h('div', 'fm-post__buttons');
    const teamBtn = h('button', 'px-btn fm-btn', FARM_COPY.team);
    teamBtn.type = 'button';
    teamBtn.dataset['key'] = `team-${card.dungeonId}`;
    teamBtn.addEventListener('click', () => open({ kind: 'team', dungeonId: card.dungeonId }));
    const traitBtn = h('button', 'px-btn fm-btn', FARM_COPY.traits);
    traitBtn.type = 'button';
    traitBtn.dataset['key'] = `traits-${card.dungeonId}`;
    traitBtn.classList.toggle('px-btn--gold', card.traitReady);
    traitBtn.addEventListener('click', () => open({ kind: 'traits', dungeonId: card.dungeonId }));
    buttons.append(teamBtn, traitBtn);
    body.append(team, levelRow, trait, lines, buttons);
    post.append(scene, body);
    return post;
  }

  // ---- dialogs ----
  function open(next: Dialog): void {
    dialog = next;
    dialogKey = '';
    render();
    overlay.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  }
  function close(): void {
    const was = dialog;
    dialog = null;
    dialogKey = '';
    render();
    if (was) {
      el.querySelector<HTMLElement>(`[data-key="${was.kind}-${was.dungeonId}"]`)?.focus({
        preventScroll: true,
      });
    }
  }
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  // Esc closes the dialog first (the dungeon window leaves it alone while one is open)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !dialog || overlay.hidden) return;
    e.preventDefault();
    close();
  });

  function closeButton(): HTMLButtonElement {
    const b = h('button', 'px-btn px-btn--dark fm-close', FARM_COPY.close);
    b.type = 'button';
    b.dataset['key'] = 'fm-close';
    b.addEventListener('click', close);
    return b;
  }

  function teamDialog(dungeonId: string, s: GameState): HTMLElement {
    const dungeon = content.dungeonById.get(dungeonId)!;
    const post = postOf(s, dungeonId);
    const box = h('div', 'fm-dialog px-panel');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', FARM_COPY.teamTitle(dungeon.name));
    const head = h('header', 'fm-dialog__head');
    head.append(h('h3', 'px-display', FARM_COPY.teamTitle(dungeon.name)), closeButton());
    const modifiers = collectModifiers(s, content);
    const cost = loadoutCost(content, { slots: post.team }, s.cards.owned);
    const cap = loadoutCostCap(s, content, 'fighting', modifiers);
    const costLine = h('p', 'fm-dialog__cost bi-num', FARM_COPY.teamCost(cost, cap));
    costLine.classList.toggle('is-over', cost > cap);
    const slots = h('div', 'fm-dialog__slots');
    post.team.forEach((id, slot) => {
      const t = h('button', 'fm-pick px-tile');
      t.type = 'button';
      t.dataset['key'] = `slot-${slot}`;
      if (id) {
        const c = content.cardById.get(id);
        t.title = `${FARM_COPY.remove}: ${c ? cardDisplayName(content, c) : id}`;
        t.innerHTML = artOf(s, id);
        t.addEventListener('click', () => {
          const r = setFarmSlot(s, content, dungeonId, slot, null);
          if (r.ok) apply(r.state);
        });
      } else {
        t.classList.add('is-empty');
        t.disabled = true;
        t.title = FARM_COPY.empty;
      }
      slots.append(t);
    });
    const list = h('div', 'fm-dialog__cards');
    const owned = Object.keys(s.cards.owned)
      .map((id) => content.cardById.get(id))
      .filter((c): c is NonNullable<typeof c> => !!c && c.job === 'fighting')
      .sort(
        (a, b) =>
          cardCost(content, b.id, s.cards.owned[b.id]) -
            cardCost(content, a.id, s.cards.owned[a.id]) || a.name.localeCompare(b.name),
      );
    if (owned.length === 0) list.append(h('p', 'fm-note', FARM_COPY.noCards));
    const emptySlot = post.team.indexOf(null);
    for (const c of owned) {
      const t = h('button', 'fm-card px-tile');
      t.type = 'button';
      t.dataset['key'] = `card-${c.id}`;
      const art = h('span', 'fm-card__art');
      art.innerHTML = artOf(s, c.id);
      const price = cardCost(content, c.id, s.cards.owned[c.id]);
      t.append(
        art,
        h('span', 'fm-card__name', cardDisplayName(content, c)),
        h('span', 'fm-card__cost bi-num', `Cost ${price}`),
      );
      if (post.team.includes(c.id)) {
        t.classList.add('is-in');
        t.addEventListener('click', () => {
          const r = setFarmSlot(s, content, dungeonId, post.team.indexOf(c.id), null);
          if (r.ok) apply(r.state);
        });
      } else {
        let why = '';
        const elsewhere = farmTeamOf(s, c.id, dungeonId);
        if (s.cards.loadouts.fighting.slots.includes(c.id)) why = FARM_COPY.inLoadout;
        else if (elsewhere) why = FARM_COPY.atPost(content.dungeonById.get(elsewhere)?.name ?? '');
        else if (s.expeditions.trips.some((x) => x.cardId === c.id)) why = FARM_COPY.away;
        else if (emptySlot < 0) why = FARM_COPY.full;
        else {
          const next = [...post.team];
          next[emptySlot] = c.id;
          const problem = farmTeamProblem(s, content, dungeonId, next, modifiers);
          if (problem === 'over-cost-cap') why = FARM_COPY.overCap(cost + price - cap);
          else if (problem) why = problem;
        }
        if (why) {
          t.disabled = true;
          t.title = why;
          t.append(h('span', 'fm-card__why', why));
        } else {
          t.addEventListener('click', () => {
            const r = setFarmSlot(s, content, dungeonId, emptySlot, c.id, modifiers);
            if (r.ok) apply(r.state);
          });
        }
      }
      list.append(t);
    }
    box.append(head, h('p', 'fm-note', FARM_COPY.teamHelp), slots, costLine, list);
    return box;
  }

  function traitsDialog(dungeonId: string, s: GameState): HTMLElement {
    const dungeon = content.dungeonById.get(dungeonId)!;
    const post = postOf(s, dungeonId);
    const cfg = content.farming;
    const box = h('div', 'fm-dialog px-panel');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', FARM_COPY.traitsTitle(dungeon.name));
    const head = h('header', 'fm-dialog__head');
    head.append(h('h3', 'px-display', FARM_COPY.traitsTitle(dungeon.name)), closeButton());
    const herbs = s.resources['herb_bundle'] ?? new Decimal(0);
    const herbLine = h('p', 'fm-note fm-herbs bi-num', FARM_COPY.herbs(fmt(herbs)));
    const cost = (n: number): HTMLElement => {
      const c = h('span', 'fm-cost bi-num');
      c.innerHTML = `${iconOf('herb_bundle')}<span>${n}</span>`;
      return c;
    };
    const offer = postTraitOffer(s, content, dungeonId);
    const pickBox = h('section', 'fm-dialog__sec');
    if (offer) {
      pickBox.append(h('h4', 'fm-h', FARM_COPY.pickOne));
      const row = h('div', 'fm-offer');
      for (const id of offer) {
        const trait = cfg.traits.find((t) => t.id === id)!;
        const b = h('button', 'fm-trait px-tile');
        b.type = 'button';
        b.dataset['key'] = `trait-${id}`;
        b.append(
          h('span', 'fm-trait__name px-display', trait.name),
          h('span', 'fm-trait__text', trait.text),
          h('span', 'fm-trait__pick', FARM_COPY.pick),
        );
        b.addEventListener('click', () => {
          const r = pickPostTrait(s, content, dungeonId, id);
          if (r.ok) apply(r.state);
        });
        row.append(b);
      }
      pickBox.append(row);
      const reroll = h('button', 'px-btn fm-btn', FARM_COPY.reroll);
      reroll.type = 'button';
      reroll.dataset['key'] = 'reroll';
      reroll.append(cost(cfg.rerollCost));
      reroll.disabled = herbs.lt(cfg.rerollCost);
      if (reroll.disabled) reroll.title = FARM_COPY.needHerbs;
      reroll.addEventListener('click', () => {
        const r = rerollPostTraits(s, content, dungeonId);
        if (r.ok) apply(r.state);
      });
      pickBox.append(reroll);
    }
    const done = h('section', 'fm-dialog__sec');
    done.append(h('h4', 'fm-h', FARM_COPY.chosen));
    if (post.traits.length === 0) done.append(h('p', 'fm-note', FARM_COPY.noneChosen));
    for (const id of post.traits) {
      const trait = cfg.traits.find((t) => t.id === id);
      if (!trait) continue;
      const row = h('p', 'fm-picked');
      row.append(h('strong', '', trait.name), document.createTextNode(` · ${trait.text}`));
      done.append(row);
    }
    const up = h('section', 'fm-dialog__sec');
    up.append(h('h4', 'fm-h', FARM_COPY.upgrade));
    up.append(
      h(
        'p',
        'fm-note',
        FARM_COPY.upgradeLine(post.upgrade, cfg.upgrade.maxLevel, cfg.upgrade.yieldPercent),
      ),
    );
    const price = postUpgradeCost(content, post);
    const buy = h('button', 'px-btn px-btn--gold fm-btn');
    buy.type = 'button';
    buy.dataset['key'] = 'upgrade';
    if (price === null) {
      buy.textContent = FARM_COPY.atTop;
      buy.disabled = true;
    } else {
      buy.append(h('span', '', FARM_COPY.buy), cost(price));
      buy.disabled = herbs.lt(price);
      if (buy.disabled) buy.title = FARM_COPY.needHerbs;
      buy.addEventListener('click', () => {
        const r = buyPostUpgrade(s, content, dungeonId);
        if (r.ok) apply(r.state);
      });
    }
    up.append(buy);
    box.append(head, herbLine, pickBox, done, up);
    return box;
  }

  function renderDialog(s: GameState): void {
    if (!dialog) {
      overlay.hidden = true;
      overlay.replaceChildren();
      return;
    }
    const post = postOf(s, dialog.dungeonId);
    const herbs = s.resources['herb_bundle'] ?? new Decimal(0);
    const cfg = content.farming;
    const price = postUpgradeCost(content, post);
    const key = JSON.stringify([
      dialog.kind,
      dialog.dungeonId,
      post.team,
      Math.floor(post.level / cfg.level.traitEvery),
      post.traits,
      post.rerolls,
      post.upgrade,
      herbs.gte(cfg.rerollCost),
      price !== null && herbs.gte(price),
      s.cards.loadouts.fighting.slots,
      Object.keys(s.cards.owned).length,
    ]);
    if (key !== dialogKey) {
      dialogKey = key;
      const scroll = overlay.querySelector<HTMLElement>('.fm-dialog__cards')?.scrollTop ?? 0;
      const focused = (document.activeElement as HTMLElement | null)?.dataset?.['key'];
      overlay.replaceChildren(
        dialog.kind === 'team'
          ? teamDialog(dialog.dungeonId, s)
          : traitsDialog(dialog.dungeonId, s),
      );
      const list = overlay.querySelector<HTMLElement>('.fm-dialog__cards');
      if (list) list.scrollTop = scroll;
      if (focused) {
        overlay
          .querySelector<HTMLElement>(`[data-key="${focused}"]`)
          ?.focus({ preventScroll: true });
      }
    }
    const herbText = overlay.querySelector<HTMLElement>('.fm-herbs');
    if (herbText) herbText.textContent = FARM_COPY.herbs(fmt(herbs));
    overlay.hidden = false;
  }

  function render(): void {
    const s = ctx.state();
    const model = farmingModel(s, content);
    if (totals.textContent !== model.totalsText) totals.textContent = model.totalsText;
    for (const card of model.posts) {
      let entry = cards.get(card.dungeonId);
      if (!entry || entry.key !== card.key) {
        const node = buildPost(card, s);
        if (entry) entry.el.replaceWith(node);
        else grid.append(node);
        entry = {
          el: node,
          key: card.key,
          bar: node.querySelector<HTMLElement>('.fm-bar__fill') ?? node,
        };
        cards.set(card.dungeonId, entry);
      }
      if (card.open) {
        const pct = `${Math.round(card.view.progress * 100)}%`;
        if (entry.bar.style.width !== pct) entry.bar.style.width = pct;
        entry.bar.parentElement?.setAttribute(
          'title',
          `${fmt(card.view.xp)} / ${fmt(card.view.xpNeed)} h`,
        );
      }
    }
    renderDialog(s);
  }

  return { el, render };
}
