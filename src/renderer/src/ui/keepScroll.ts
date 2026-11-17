/**
 * Keeps the scroll position and the keyboard focus of a view across a re-render (UI_RULES.md §2,
 * "Scroll and focus are kept"). A view that rebuilds part of its DOM wraps the rebuild in
 * `keepScroll(root, () => ...)`: every scrolling container inside `root` (and `root` itself) is
 * read first, then put back on the matching container the rebuild made, found by its tag, first two
 * classes and place among its like. Pass `{ reset: true }` when the player goes somewhere new (a
 * different tab, a filter or a sort): the scroll then starts at the top.
 */

const SCROLLS = /auto|scroll/;

function scrollers(root: HTMLElement): Array<{ key: string; el: HTMLElement }> {
  const seen = new Map<string, number>();
  const out: Array<{ key: string; el: HTMLElement }> = [];
  for (const el of [root, ...root.querySelectorAll<HTMLElement>('*')]) {
    if (el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth) continue;
    const cs = getComputedStyle(el);
    if (!SCROLLS.test(cs.overflowY) && !SCROLLS.test(cs.overflowX)) continue;
    const cls = el.className && typeof el.className === 'string' ? el.className.split(/\s+/) : [];
    const base = `${el.tagName}.${cls.filter(Boolean).slice(0, 2).join('.')}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.push({ key: `${base}#${n}`, el });
  }
  return out;
}

/** Runs `rebuild` and restores what it would have reset; returns whatever `rebuild` returns. */
export function keepScroll<T>(
  root: HTMLElement,
  rebuild: () => T,
  opts: { reset?: boolean } = {},
): T {
  const saved = opts.reset
    ? []
    : scrollers(root).map((s) => ({ key: s.key, top: s.el.scrollTop, left: s.el.scrollLeft }));
  const active = document.activeElement;
  const focusKey =
    active instanceof HTMLElement && root.contains(active) ? (active.dataset['key'] ?? null) : null;
  const result = rebuild();
  if (saved.length > 0) {
    const now = new Map(scrollers(root).map((s) => [s.key, s.el]));
    for (const s of saved) {
      const el = now.get(s.key);
      if (!el) continue;
      el.scrollTop = s.top;
      el.scrollLeft = s.left;
    }
  }
  if (
    focusKey &&
    (document.activeElement === document.body || !root.contains(document.activeElement))
  ) {
    root
      .querySelector<HTMLElement>(`[data-key="${CSS.escape(focusKey)}"]`)
      ?.focus({ preventScroll: true });
  }
  return result;
}
