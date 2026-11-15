/**
 * Stars drawn as pixel sprites wherever the game used to write a "★" character (UI_RULES Rank stars,
 * ASSET_RULES Rank stars). Two helpers share the card's 11 x 11 star sprites:
 *  - `stagePips`: the six stage-star pips (Wood .. Mythic) of a stage; the caller lights them with
 *    `lightStagePips` and styles them with `.dp-pip` (dungeons.css);
 *  - `setStarText`: text with each "★" replaced by a small inline star sprite (`.bi-glyph-star`, rank.css).
 */

/** Six unlit stage-star pips; pip `i` takes the colour of ladder level `i + 1` once lit. */
export function stagePips(): HTMLElement[] {
  return Array.from({ length: 6 }, (_, i) => {
    const p = document.createElement('i');
    p.className = 'dp-pip';
    p.dataset['level'] = String(i + 1);
    return p;
  });
}

/** Lights the first `level` pips of `stagePips()`. */
export function lightStagePips(pips: HTMLElement[], level: number): void {
  pips.forEach((p, i) => p.classList.toggle('is-on', i < level));
}

/** The nodes of `text` with every "★" an inline star sprite (an image named "star"). */
export function starTextNodes(text: string): Node[] {
  const out: Node[] = [];
  text.split('★').forEach((part, i) => {
    if (i > 0) {
      const s = document.createElement('i');
      s.className = 'bi-glyph-star';
      s.setAttribute('role', 'img');
      s.setAttribute('aria-label', 'star');
      out.push(s);
    }
    if (part) out.push(document.createTextNode(part));
  });
  return out;
}

/**
 * Sets `el`'s text with the "★" characters drawn as sprites (each one an image named "star", so the
 * label still reads "50% to star 3"). A repeat call with the same text does nothing.
 */
export function setStarText<T extends HTMLElement>(el: T, text: string): T {
  if (el.dataset['text'] === text) return el;
  el.dataset['text'] = text;
  if (!text.includes('★')) {
    el.textContent = text;
    return el;
  }
  el.replaceChildren(...starTextNodes(text));
  return el;
}
