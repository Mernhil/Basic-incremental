import { achievementList, type GameState } from '../../../game';
import { COPY } from '../copy';
import { svg } from '../art/gems';
import { STICKER_VIEWBOX, stickerArt } from '../art/cosmetics';
import { skinStyle } from '../ui/skins';
import { h } from '../shell/shell';
import { attachTooltip } from '../shell/tooltip';
import { reducedMotion } from '../stage/motion';
import { bookView, spread, type ChapterView, type StickerView } from './achievementsModel';
import type { PageContext } from './production';
import './achievements.css';

/**
 * Achievements page (DESIGN.md §10, UI_RULES.md §2 "Achievements: a leather sticker book"). A
 * leather-bound two-page spread, one ribbon-titled chapter per area, every achievement a sticker
 * (the equipped sticker style draws the earned and the locked art; a new one is slapped in with
 * a bounce). The book is drawn in CSS from the shell tokens. The shard shop is a counter on the
 * Shop page.
 */

export interface AchievementsContext extends PageContext {
  sound?: (id: string) => void;
}

export function createAchievementsPage(
  page: HTMLElement,
  ctx: AchievementsContext,
): { render(): void } {
  const { content } = ctx;
  const t = COPY.achievements;

  const panelBook = h('div', 'ac-panel px-panel');
  panelBook.dataset.deal = '';
  page.append(panelBook);

  // ---- sticker book ----
  const book = h('section', 'ac-book');
  book.setAttribute('aria-labelledby', 'ac-book-title');
  const head = h('header', 'ac-book__head');
  // the title and the count are in the view's title bar (UI_RULES §2, table update 9d)
  const title = h('h2', 'ac-book__title px-display sr-only', t.book);
  title.id = 'ac-book-title';
  const summary = h('p', 'ac-book__summary bi-num sr-only');
  const meter = h('span', 'ac-book__meter');
  meter.setAttribute('aria-hidden', 'true');
  const meterFill = h('i');
  meter.append(meterFill);
  head.append(title, summary, meter);
  const pages = [h('div', 'ac-sheet ac-sheet--left'), h('div', 'ac-sheet ac-sheet--right')];
  const spreadEl = h('div', 'ac-spread');
  const spine = h('i', 'ac-spine');
  spine.setAttribute('aria-hidden', 'true');
  // two ribbon bookmarks hang from the top edge, one over each page
  const marks = ['red', 'blue'].map((c) => {
    const m = h('i', `ac-mark ac-mark--${c}`);
    m.setAttribute('aria-hidden', 'true');
    return m;
  });
  spreadEl.append(pages[0]!, spine, pages[1]!, ...marks);
  // the leather cover: stitched, with a gold cap on each corner
  const cover = h('div', 'ac-cover');
  cover.append(spreadEl);
  for (const corner of ['tl', 'tr', 'bl', 'br']) {
    const cap = h('i', `ac-cap ac-cap--${corner}`);
    cap.setAttribute('aria-hidden', 'true');
    cover.append(cap);
  }
  book.append(head, cover);
  panelBook.append(book);

  type SlotUi = {
    li: HTMLElement;
    sticker: HTMLElement;
    art: HTMLElement;
    /** Style and lock state the picture was drawn for. */
    artKey: string;
    view: StickerView;
    unlocked: boolean | null;
  };
  const slots = new Map<string, SlotUi>();
  type ChapterUi = { el: HTMLElement; count: HTMLElement };
  const chapterUis = new Map<string, ChapterUi>();
  /** Stickers already shown stuck in; a newly unlocked one is slapped in on the next render. */
  const seen = new Set(
    achievementList(ctx.state(), content)
      .filter((e) => e.unlocked)
      .map((e) => e.achievement.id),
  );

  function buildBook(chapters: ChapterView[]): void {
    const [left, right] = spread(chapters);
    [left, right].forEach((list, side) => {
      for (const c of list) {
        const sec = h('section', 'ac-chapter');
        sec.dataset.chapter = c.id;
        const tape = h('h3', 'ac-tape');
        tape.id = `ac-chapter-${c.id}`;
        sec.setAttribute('aria-labelledby', tape.id);
        const count = h('span', 'ac-tape__count bi-num');
        tape.append(h('span', 'ac-tape__name px-display', c.title), count);
        const grid = h('ul', 'ac-grid');
        for (const s of c.stickers) grid.append(slot(s));
        sec.append(tape, grid);
        pages[side]!.append(sec);
        chapterUis.set(c.id, { el: sec, count });
      }
    });
  }

  function slot(s: StickerView): HTMLElement {
    const li = h('li', 'ac-slot');
    li.dataset.id = s.id;
    li.tabIndex = 0;
    li.style.setProperty('--tilt', `${s.tilt}deg`);
    const sticker = h('span', 'ac-sticker');
    sticker.setAttribute('aria-hidden', 'true');
    const art = h('span', 'ac-sticker__art');
    sticker.append(art);
    li.append(sticker, h('span', 'ac-slot__name', s.name));
    const ui: SlotUi = { li, sticker, art, artKey: '', view: s, unlocked: null };
    attachTooltip(li, () => tip(ui.view));
    slots.set(s.id, ui);
    return li;
  }

  function tip(s: StickerView): HTMLElement {
    const box = h('div', 'ac-tip');
    box.append(h('strong', '', s.name), h('span', '', s.description));
    if (s.unlocked) box.append(h('span', 'ac-tip__date', s.dateText));
    else if (s.progressText) box.append(h('span', 'ac-tip__progress bi-num', s.progressText));
    if (s.rewards.length > 0) {
      const r = h('div', 'ac-tip__reward');
      r.append(h('span', 'ac-tip__label', t.reward));
      const list = h('ul');
      for (const line of s.rewards) list.append(h('li', '', line));
      r.append(list);
      box.append(r);
    }
    return box;
  }

  function renderBook(s: GameState): void {
    const view = bookView(achievementList(s, content), content);
    if (slots.size === 0) buildBook(view.chapters);
    set(summary, view.summary);
    meterFill.style.width = `${(view.progress * 100).toFixed(1)}%`;
    for (const c of view.chapters) {
      const ui = chapterUis.get(c.id);
      if (!ui) continue;
      set(ui.count, c.count);
      ui.el.classList.toggle('is-done', c.done);
      for (const st of c.stickers) syncSlot(st);
    }
  }

  function syncSlot(s: StickerView): void {
    const ui = slots.get(s.id);
    if (!ui) return;
    ui.view = s;
    // the equipped sticker style draws the die-cut and the picture; redraw when either changes
    const style = skinStyle('sticker');
    const artKey = `${style}|${s.unlocked}`;
    if (ui.artKey !== artKey) {
      ui.artKey = artKey;
      ui.art.innerHTML = svg(stickerArt(style, s.id, s.chapter, s.unlocked), STICKER_VIEWBOX);
    }
    if (ui.unlocked !== s.unlocked) {
      ui.unlocked = s.unlocked;
      ui.li.classList.toggle('is-unlocked', s.unlocked);
      if (s.unlocked && !seen.has(s.id)) {
        seen.add(s.id);
        if (!reducedMotion()) {
          ui.li.classList.remove('is-slapping');
          void ui.li.offsetWidth;
          ui.li.classList.add('is-slapping');
          window.setTimeout(() => ui.li.classList.remove('is-slapping'), 900);
        }
      }
    }
    const label = t.stickerLabel(
      s.name,
      s.unlocked ? t.unlockedLabel : t.lockedLabel(s.progressText),
    );
    if (ui.li.getAttribute('aria-label') !== label) ui.li.setAttribute('aria-label', label);
  }

  function render(): void {
    renderBook(ctx.state());
  }

  render();
  return { render };
}

function set(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}
