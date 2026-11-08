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
 * Achievements page (DESIGN.md §10, §11 "sticker book", A10 C). The sticker book, a two-page spread with one chapter per area where every achievement is a sticker slot
 * (locked: a dashed outline with a faint print of the art and a progress bar; unlocked: the
 *  sticker slapped in with a bounce). The shard shop is a stall on the Shop page.
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

  const panelBook = h('div', 'ac-panel ac-panel--book');
  page.append(panelBook);

  // ---- sticker book ----
  const book = h('section', 'ac-book');
  book.setAttribute('aria-labelledby', 'ac-book-title');
  const head = h('header', 'ac-book__head');
  const title = h('h2', 'ac-book__title', t.book);
  title.id = 'ac-book-title';
  const summary = h('p', 'ac-book__summary bi-num');
  const meter = h('span', 'ac-book__meter');
  meter.setAttribute('aria-hidden', 'true');
  const meterFill = h('i');
  meter.append(meterFill);
  head.append(title, summary, meter);
  const pages = [h('div', 'ac-sheet ac-sheet--left'), h('div', 'ac-sheet ac-sheet--right')];
  const spreadEl = h('div', 'ac-spread');
  spreadEl.append(...pages);
  book.append(head, spreadEl);
  panelBook.append(book);

  type SlotUi = {
    li: HTMLElement;
    sticker: HTMLElement;
    art: HTMLElement;
    /** Style and lock state the picture was drawn for. */
    artKey: string;
    meta: HTMLElement;
    fill: HTMLElement;
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
        tape.append(h('span', 'ac-tape__name', c.title), count);
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
    const bar = h('i', 'ac-slot__bar');
    bar.setAttribute('aria-hidden', 'true');
    const fill = h('i');
    bar.append(fill);
    const meta = h('span', 'ac-slot__meta bi-num');
    li.append(sticker, h('span', 'ac-slot__name', s.name), bar, meta);
    const ui: SlotUi = { li, sticker, art, artKey: '', meta, fill, view: s, unlocked: null };
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
    set(ui.meta, s.unlocked ? s.dateText : s.progressText || t.locked);
    ui.fill.style.width = `${(s.progress * 100).toFixed(1)}%`;
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
