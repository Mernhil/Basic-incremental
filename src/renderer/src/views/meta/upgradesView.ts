import { pickPerk } from '../../../../game';
import { COPY } from '../../copy';
import { h } from '../../shell/shell';
import type { TableContext, ViewApi, ViewHandle } from '../../table/contract';
import { pickCards } from '../../ui/perkPick';
import { milestoneBoard, type MilestoneLine } from './upgradesModel';

/**
 * The Upgrades view (UI_RULES §2 "The Upgrades view"; DESIGN.md §4 Milestone picks): three panels,
 * Logging, Mining and Training, each listing its lines and every milestone on them. A waiting pick
 * shows its two cards (a click picks one), a pick made its badge, and a milestone ahead its level
 * and both perks, dimmed. A foot bar keeps the lifetime Money earned.
 */

export function mountUpgrades(host: HTMLElement, ctx: TableContext, api: ViewApi): ViewHandle {
  host.classList.add('mv-upgrades', 'mv-picks');
  const subtitle = h('span', 'mv-subtitle');
  api.setTools(subtitle);
  const panels = new Map<string, { el: HTMLElement; list: HTMLElement; sig: string }>();
  // one panel per group the board has (only Training now: Logging and Mining have no milestones)
  for (const { key } of milestoneBoard(ctx.state(), ctx.content).groups) {
    const el = h('section', `px-panel mv-up-panel mv-mp-panel mv-mp-panel--${key}`);
    el.dataset.deal = '';
    const head = h('header', 'mv-up-head');
    head.append(h('h2', 'px-display mv-up-title', COPY.picks.groups[key]));
    const list = h('div', 'mv-mp-lines');
    el.append(head, list);
    panels.set(key, { el, list, sig: '' });
  }
  const foot = h('footer', 'px-panel mv-up-foot');
  foot.dataset.deal = '';
  const lifetime = h('strong', 'mv-up-lifetime bi-num');
  foot.append(h('span', 'mv-up-foot__label', COPY.picks.lifetime), lifetime);
  host.append(...[...panels.values()].map((p) => p.el), foot);

  const pick = (milestoneId: string, optionId: string): void => {
    const r = pickPerk(ctx.state(), ctx.content, milestoneId, optionId);
    if (!r.ok) return;
    ctx.apply(r.state);
    ctx.sound('buy');
    render();
  };

  const lineEl = (line: MilestoneLine): HTMLElement => {
    const el = h('div', 'mv-mp-line');
    const head = h('div', 'mv-mp-line__head');
    head.append(
      h('b', 'mv-mp-line__name', line.name),
      h('span', 'mv-mp-line__lv bi-num', line.levelText),
    );
    el.append(head);
    for (const item of line.items) {
      const row = h('div', `mv-mp-item mv-mp-item--${item.status}`);
      row.dataset.key = `ms-${item.milestone.id}`;
      row.append(h('span', 'mv-mp-item__lv bi-num', item.levelText));
      if (item.status === 'waiting') {
        row.append(pickCards(ctx.content, item.milestone, (o) => pick(item.milestone.id, o)));
      } else if (item.picked) {
        const chip = h('span', 'ur__badge', item.picked.name);
        chip.title = item.picked.description;
        row.append(
          chip,
          h('span', 'mv-mp-item__what', item.picked.description),
          h('span', 'mv-mp-item__note', item.note),
        );
      } else {
        const [a, b] = item.milestone.options;
        const both = h('span', 'mv-mp-item__what');
        both.append(
          h('b', '', a.name),
          ` ${a.description} · `,
          h('b', '', b.name),
          ` ${b.description}`,
        );
        row.append(both);
      }
      el.append(row);
    }
    return el;
  };

  function render(): void {
    const s = ctx.state();
    const board = milestoneBoard(s, ctx.content);
    for (const group of board.groups) {
      const panel = panels.get(group.key)!;
      const sig = JSON.stringify(
        group.lines.map((l) => [l.levelText, l.items.map((i) => [i.status, i.picked?.id ?? ''])]),
      );
      if (sig === panel.sig) continue;
      panel.sig = sig;
      panel.list.replaceChildren(...group.lines.map(lineEl));
    }
    const text = board.waiting > 0 ? COPY.picks.toChoose(board.waiting) : COPY.picks.none;
    if (subtitle.textContent !== text) subtitle.textContent = text;
    if (lifetime.textContent !== board.lifetime) lifetime.textContent = board.lifetime;
  }
  render();
  return { render };
}
