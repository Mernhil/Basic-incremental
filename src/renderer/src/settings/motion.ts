import { overrideMatches, overrideMediaText } from './motionRules';
import { onPrefs, prefs, type MotionPref } from './prefs';

/**
 * App-wide reduced-motion override (Settings, DESIGN.md §11). Every place that checks reduced
 * motion follows the player's choice without being edited:
 *
 * - `<html data-motion="reduced|full">` for code that reads the attribute (`stage/motion.ts`);
 * - `window.matchMedia('(prefers-reduced-motion: …)')` answers with the override, so script
 *   checks in the art and effects code follow it too;
 * - every CSS `@media (prefers-reduced-motion: reduce | no-preference)` block is switched on or
 *   off in the CSSOM, so each component's own reduced-motion styles apply. Style sheets added
 *   later are handled as they arrive. If a sheet cannot be read, a global fallback rule
 *   (`.motion-fallback`, pages/settings.css) stops animations under "reduced".
 */

const original = new WeakMap<CSSMediaRule, string>();
let installed = false;
let fallbackNeeded = false;

function walk(rules: CSSRuleList, pref: MotionPref): void {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSMediaRule) {
      const base = original.get(rule) ?? rule.media.mediaText;
      const next = overrideMediaText(base, pref);
      if (next !== null) {
        original.set(rule, base);
        if (rule.media.mediaText !== next) rule.media.mediaText = next;
      }
    }
    const nested = (rule as { cssRules?: CSSRuleList }).cssRules;
    if (nested) walk(nested, pref);
  }
}

function applySheets(pref: MotionPref): void {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      walk(sheet.cssRules, pref);
    } catch {
      fallbackNeeded = true;
    }
  }
  document.documentElement.classList.toggle('motion-fallback', fallbackNeeded);
}

function fakeQuery(query: string, matches: boolean): MediaQueryList {
  return Object.assign(new EventTarget(), {
    matches,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
  }) as unknown as MediaQueryList;
}

function apply(pref: MotionPref): void {
  const root = document.documentElement;
  if (pref === 'system') delete root.dataset['motion'];
  else root.dataset['motion'] = pref;
  applySheets(pref);
}

/** Installs the override and applies the stored choice. Call once, as early as possible. */
export function installMotionPref(): void {
  if (installed) return;
  installed = true;
  const native = window.matchMedia?.bind(window);
  if (native) {
    window.matchMedia = (query: string): MediaQueryList => {
      const forced = overrideMatches(query, prefs().motion);
      return forced === null ? native(query) : fakeQuery(query, forced);
    };
  }
  const reapply = (): void => apply(prefs().motion);
  reapply();
  onPrefs(reapply);
  // style sheets that arrive later (lazy pages, dev hot reload)
  new MutationObserver((records) => {
    let added = false;
    for (const r of records) {
      for (const node of Array.from(r.addedNodes)) {
        if (node instanceof HTMLStyleElement) added = true;
        if (node instanceof HTMLLinkElement) node.addEventListener('load', reapply);
      }
    }
    if (added) reapply();
  }).observe(document.head, { childList: true, subtree: true, characterData: false });
}
