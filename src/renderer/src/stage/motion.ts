/**
 * Shared stage motion (DESIGN.md 14, Performance): one animation-frame loop for every rolling
 * counter and stage tween, paused while the window is hidden; reduced-motion checks; restartable
 * CSS reactions (flash, squash, shake) and the brief slow-down.
 */

type FrameFn = (dtMs: number, nowMs: number) => void;

const subscribers = new Set<FrameFn>();
let raf = 0;
let last = 0;

function frame(now: number): void {
  raf = 0;
  if (document.hidden) {
    last = 0;
    return; // resumed by the visibilitychange listener
  }
  const dt = last ? Math.min(100, now - last) : 16;
  last = now;
  for (const fn of subscribers) fn(dt, now);
  if (subscribers.size > 0) raf = requestAnimationFrame(frame);
}

function wake(): void {
  if (!raf && subscribers.size > 0 && !document.hidden) raf = requestAnimationFrame(frame);
}

if (typeof document !== 'undefined') document.addEventListener('visibilitychange', wake);

/** Runs `fn` every animation frame (on the shared loop) until the returned function is called. */
export function onFrame(fn: FrameFn): () => void {
  subscribers.add(fn);
  wake();
  return () => subscribers.delete(fn);
}

/** True when the stage should not animate at all (hidden window). */
export function stageHidden(): boolean {
  return document.hidden;
}

const reduceQuery =
  typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : null;

/** Reduced motion: no shake, flash or slow-down; numbers fade in place. */
export function reducedMotion(): boolean {
  return reduceQuery?.matches === true || document.documentElement.dataset['motion'] === 'reduced';
}

/** Restarts a one-shot CSS animation class on an element. */
export function replay(el: Element | null | undefined, cls: string, ms = 600): void {
  if (!el) return;
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
  const timers = (el as HTMLElement & { __replay?: Record<string, number> }).__replay ?? {};
  (el as HTMLElement & { __replay?: Record<string, number> }).__replay = timers;
  window.clearTimeout(timers[cls]);
  timers[cls] = window.setTimeout(() => el.classList.remove(cls), ms);
}

/** A small shake of the whole stage (skipped under reduced motion). */
export function shake(el: Element | null | undefined, strong = false): void {
  if (reducedMotion()) return;
  replay(el, strong ? 'st-shake--strong' : 'st-shake', strong ? 420 : 300);
}

/** A white flash over an element (skipped under reduced motion). */
export function flash(el: Element | null | undefined): void {
  if (reducedMotion()) return;
  replay(el, 'st-flash', 260);
}

/**
 * Brief slow-down of every animation inside `root` (signature attacks, rare drops). Skipped under
 * reduced motion.
 */
export function slowDown(root: Element, ms = 450, rate = 0.3): void {
  if (reducedMotion() || typeof root.getAnimations !== 'function') return;
  const slow = (): void => {
    for (const a of root.getAnimations({ subtree: true })) a.playbackRate = rate;
  };
  slow();
  const until = performance.now() + ms;
  const stop = onFrame((_dt, now) => {
    if (now < until) {
      slow(); // animations started meanwhile slow down too
      return;
    }
    stop();
    for (const a of root.getAnimations({ subtree: true })) a.playbackRate = 1;
  });
}

/** A random number in [min, max). Show-only randomness for positions and tilts. */
export const jitter = (min: number, max: number): number => min + Math.random() * (max - min);
