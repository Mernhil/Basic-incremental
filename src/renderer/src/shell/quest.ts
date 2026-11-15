import { COPY } from '../copy';
import type { GoalRow, QuestRow } from '../pages/progressionModel';
import { h } from './shell';

/**
 * The quest list (DESIGN.md §10 Quests) that drops down under the header's Goals button: the
 * quests waiting to be claimed (a Claim button each), then the unfinished ones nearest to done,
 * then one plain hint, and a "See all quests" list grouped by Dungeons, Cards, Gathering and
 * Account. A click on an unfinished quest opens the view it belongs to.
 */

export interface QuestView {
  claimable: QuestRow[];
  next: QuestRow[];
  hint: GoalRow | null;
  groups: Array<{ id: string; rows: QuestRow[] }>;
}

export interface QuestHandlers {
  claim(id: string): void;
  claimAll(): void;
  open(page: QuestRow['page'], id: string): void;
  openHint(row: GoalRow): void;
}

interface RowUi {
  root: HTMLElement;
  main: HTMLButtonElement;
  claim: HTMLButtonElement;
  count: HTMLElement;
  stamp: HTMLElement;
  fill: HTMLElement;
}

function buildRow(row: QuestRow, handlers: QuestHandlers): RowUi {
  const root = h('li', 'shell-quest__row');
  const main = h('button', 'shell-quest__goal');
  main.type = 'button';
  main.dataset['closes'] = '1';
  const text = h('span', 'shell-quest__text', row.title);
  const count = h('span', 'shell-quest__count bi-num');
  const bar = h('span', 'shell-quest__bar');
  const fill = h('i');
  bar.append(fill);
  const reward = h('span', 'shell-quest__reward', row.reward);
  main.append(text, count, bar, reward);
  main.addEventListener('click', () => handlers.open(row.page, row.id));
  const claim = h('button', 'px-btn shell-quest__claim', COPY.progress.quests.claim);
  claim.type = 'button';
  claim.setAttribute('aria-label', COPY.progress.quests.claimLabel(row.title, row.reward));
  claim.addEventListener('click', () => handlers.claim(row.id));
  const stamp = h('span', 'shell-quest__stamp');
  root.append(main, claim, stamp);
  return { root, main, claim, count, stamp, fill };
}

function paintRow(ui: RowUi, row: QuestRow): void {
  ui.fill.style.width = `${(row.progress * 100).toFixed(1)}%`;
  if (ui.count.textContent !== row.count) ui.count.textContent = row.count;
  const waiting = row.done && !row.claimed;
  ui.root.classList.toggle('is-claimable', waiting);
  ui.root.classList.toggle('is-claimed', row.claimed);
  ui.claim.hidden = !waiting;
  ui.main.setAttribute('aria-disabled', String(row.done));
  ui.main.tabIndex = row.done ? -1 : 0;
  ui.main.classList.toggle('is-static', row.done);
  ui.main.removeAttribute('data-closes');
  if (!row.done) ui.main.dataset['closes'] = '1';
  const stamp = row.claimed ? COPY.progress.quests.claimed : '';
  if (ui.stamp.textContent !== stamp) ui.stamp.textContent = stamp;
  const label = COPY.progress.quests.openLabel(row.title, row.count, row.reward);
  if (ui.main.getAttribute('aria-label') !== label) ui.main.setAttribute('aria-label', label);
}

/** A list of rows kept by quest id: rebuilt only when the ids change, painted every update. */
function createRowList(
  list: HTMLElement,
  handlers: QuestHandlers,
): (rows: QuestRow[], empty?: string) => void {
  let key = '';
  const items = new Map<string, RowUi>();
  return (rows, empty = '') => {
    const next = rows.map((r) => r.id).join('|') + (rows.length === 0 ? `~${empty}` : '');
    if (next !== key) {
      key = next;
      items.clear();
      list.replaceChildren(
        ...(rows.length === 0 && empty
          ? [h('li', 'shell-quest__none', empty)]
          : rows.map((r) => {
              const ui = buildRow(r, handlers);
              items.set(r.id, ui);
              return ui.root;
            })),
      );
    }
    for (const r of rows) {
      const ui = items.get(r.id);
      if (ui) paintRow(ui, r);
    }
  };
}

export function createQuestScroll(
  slot: HTMLElement,
  handlers: QuestHandlers,
): { update(view: QuestView): void; showList(): void } {
  // the quest list
  const listPane = h('div', 'shell-quest__pane');
  const head = h('div', 'shell-quest__head');
  const title = h('span', 'shell-quest__title', COPY.progress.quests.title);
  const claimAll = h('button', 'px-btn shell-quest__all');
  claimAll.type = 'button';
  claimAll.addEventListener('click', () => handlers.claimAll());
  head.append(title, claimAll);
  const claimList = h('ul', 'shell-quest__list');
  claimList.setAttribute('aria-label', COPY.progress.quests.title);
  const nextList = h('ul', 'shell-quest__list');
  const hint = h('button', 'shell-quest__hint');
  hint.type = 'button';
  hint.dataset['closes'] = '1';
  const hintLabel = h('span', 'shell-quest__hint-label', COPY.progress.quests.nextUp);
  const hintText = h('span', 'shell-quest__text');
  const hintEta = h('span', 'shell-quest__count bi-num');
  const hintBar = h('span', 'shell-quest__bar');
  const hintFill = h('i');
  hintBar.append(hintFill);
  hint.append(hintLabel, hintText, hintEta, hintBar);
  let hintRow: GoalRow | null = null;
  hint.addEventListener('click', () => hintRow && handlers.openHint(hintRow));
  const seeAll = h('button', 'px-btn shell-quest__see', COPY.progress.quests.seeAll);
  seeAll.type = 'button';
  listPane.append(head, claimList, nextList, hint, seeAll);

  // the full list
  const allPane = h('div', 'shell-quest__pane shell-quest__all-pane');
  allPane.hidden = true;
  const allHead = h('div', 'shell-quest__head');
  const back = h('button', 'px-btn shell-quest__see', COPY.progress.quests.back);
  back.type = 'button';
  allHead.append(h('span', 'shell-quest__title', COPY.progress.quests.title), back);
  const allBody = h('div', 'shell-quest__groups');
  allPane.append(allHead, allBody);

  const showAll = (all: boolean): void => {
    listPane.hidden = all;
    allPane.hidden = !all;
    slot.dataset['mode'] = all ? 'all' : 'list';
  };
  seeAll.addEventListener('click', () => showAll(true));
  back.addEventListener('click', () => showAll(false));
  slot.dataset['mode'] = 'list';
  slot.append(listPane, allPane);

  const paintClaimable = createRowList(claimList, handlers);
  const paintNext = createRowList(nextList, handlers);
  const groupLists = new Map<string, (rows: QuestRow[]) => void>();
  let groupKey = '';

  return {
    showList: () => showAll(false),
    update(view) {
      paintClaimable(view.claimable);
      paintNext(view.next, view.claimable.length === 0 ? COPY.progress.quests.empty : '');
      const total = view.claimable.length;
      claimAll.hidden = total < 2;
      const claimText = COPY.progress.quests.claimAll(total);
      if (claimAll.textContent !== claimText) claimAll.textContent = claimText;
      hintRow = view.hint;
      hint.hidden = view.hint === null;
      if (view.hint) {
        hintText.textContent = view.hint.title;
        hintEta.textContent = view.hint.eta;
        hintFill.style.width = `${(view.hint.progress * 100).toFixed(1)}%`;
      }
      const key = view.groups.map((g) => g.id).join('|');
      if (key !== groupKey) {
        groupKey = key;
        groupLists.clear();
        allBody.replaceChildren(
          ...view.groups.map((g) => {
            const section = h('section', 'shell-quest__group');
            const list = h('ul', 'shell-quest__list');
            const done = h('span', 'shell-quest__group-done bi-num');
            const heading = h('h3', 'shell-quest__group-title');
            heading.append(COPY.progress.quests.groups[g.id] ?? g.id, done);
            section.append(heading, list);
            const paint = createRowList(list, handlers);
            groupLists.set(g.id, (rows) => {
              paint(rows);
              const finished = rows.filter((r) => r.done).length;
              const text = `${finished} / ${rows.length}`;
              if (done.textContent !== text) done.textContent = text;
            });
            return section;
          }),
        );
      }
      for (const g of view.groups) groupLists.get(g.id)?.(g.rows);
    },
  };
}
