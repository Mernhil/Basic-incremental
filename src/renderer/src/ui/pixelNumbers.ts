import { pixelNumberMarkup, preloadNumerals } from '../art/cosmetics';
import './pixelNumbers.css';

/**
 * Pixel numbers (DESIGN.md §8, "Number" cosmetics). When the equipped number item sets
 * `--bi-num-px`, every plain-number `.bi-num` element is drawn with `pixelNumberMarkup`.
 *
 * Pages keep writing text with `textContent`, so the real text stays in a visually hidden span
 * next to the image: `element.textContent` is unchanged (pages that compare before writing keep
 * working, screen readers read the number) and a page rewrite simply replaces both, which the
 * observer draws again. Text the pixel font cannot spell (a "/s" rate, a word) stays text.
 */

// digits and the glyphs of the pixel font (art/cosmetics.ts FONT) that read as part of a number
const SPELLABLE = /^[0-9.,+%\-xKMBTQSONDIVaceiop ]*[0-9][0-9.,+%\-xKMBTQSONDIVaceiop ]*$/;

let style = '';
let observer: MutationObserver | undefined;
let root: HTMLElement | undefined;

function restore(el: HTMLElement): void {
  const txt = el.querySelector(':scope > .bi-num__txt');
  if (txt && el.dataset['pxKey'] !== undefined) {
    delete el.dataset['pxKey'];
    el.textContent = txt.textContent;
  }
}

function enhance(el: HTMLElement): void {
  const ours = el.firstElementChild?.classList.contains('bi-num__txt') === true;
  if (!style) {
    restore(el);
    return;
  }
  if (!ours && el.childElementCount > 0) return;
  const text = el.textContent ?? '';
  if (!SPELLABLE.test(text)) {
    restore(el);
    return;
  }
  const fs = parseFloat(getComputedStyle(el).fontSize);
  if (!fs) return; // font-size 0 hides the number on purpose
  const scale = Math.max(1, Math.floor(fs / 9));
  const key = `${style}|${scale}|${text}`;
  if (ours && el.dataset['pxKey'] === key) return;
  el.dataset['pxKey'] = key;
  const markup = pixelNumberMarkup(style, text, scale);
  if (!markup) {
    delete el.dataset['pxKey'];
    return;
  }
  el.innerHTML = `<span class="bi-num__txt">${text}</span>${markup}`;
}

function owner(node: Node): HTMLElement | null {
  const e = node instanceof HTMLElement ? node : node.parentElement;
  return e?.closest<HTMLElement>('.bi-num') ?? null;
}

/** Starts drawing the plain numbers under `container` (the app shell) as pixel numbers. */
export function installPixelNumbers(container: HTMLElement): void {
  root = container;
  observer?.disconnect();
  observer = new MutationObserver((records) => {
    if (!style) return;
    const todo = new Set<HTMLElement>();
    for (const r of records) {
      const e = owner(r.target);
      if (e) todo.add(e);
      for (const n of r.addedNodes) {
        const a = owner(n);
        if (a) todo.add(a);
        if (n instanceof HTMLElement)
          n.querySelectorAll<HTMLElement>('.bi-num').forEach((x) => todo.add(x));
      }
    }
    for (const el of todo) enhance(el);
  });
  observer.observe(container, { childList: true, characterData: true, subtree: true });
  void preloadNumerals().then(refreshPixelNumbers, () => undefined);
  refreshPixelNumbers();
}

/** Re-reads the equipped number style (after a loadout change) and redraws every number. */
export function refreshPixelNumbers(): void {
  style = getComputedStyle(document.documentElement).getPropertyValue('--bi-num-px').trim();
  root?.querySelectorAll<HTMLElement>('.bi-num').forEach(enhance);
}
