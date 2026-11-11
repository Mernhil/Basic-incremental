import { dealDelay } from './stagger';
import './motion.css';

export { dealDelay };

/**
 * Motion E helpers (UI_RULES.md §2, "Motion E tokens and moments"): deal a group of elements in,
 * one by one, from where they came from; send a view back to its opener. The timings are the CSS
 * tokens in `motion.css`. Only transform and opacity animate (Web Animations API), every helper
 * stops what it started before starting again (interruptible), and nothing blocks clicks.
 * Reduced motion (Windows or Settings: `settings/motion.ts` answers `matchMedia`) collapses every
 * helper to a short fade or nothing.
 */

export interface DealTokens {
  ease: string;
  exitEase: string;
  dur: number;
  step: number;
  stepMin: number;
  max: number;
  scale: number;
  reach: number;
  exitDur: number;
  fade: number;
  fadeReduced: number;
}

const FALLBACK: DealTokens = {
  ease: 'cubic-bezier(0.22, 1, 0.36, 1)',
  exitEase: 'cubic-bezier(0.4, 0, 1, 1)',
  dur: 440,
  step: 90,
  stepMin: 40,
  max: 7,
  scale: 0.92,
  reach: 0.6,
  exitDur: 220,
  fade: 180,
  fadeReduced: 120,
};

const ms = (v: string, d: number): number => {
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return d;
  return /ms\s*$/.test(v) ? n : /s\s*$/.test(v) ? n * 1000 : n;
};

/** The motion tokens as numbers (ms), read from `:root`. */
export function dealTokens(): DealTokens {
  const css = getComputedStyle(document.documentElement);
  const get = (name: string): string => css.getPropertyValue(name).trim();
  const num = (name: string, d: number): number => {
    const n = parseFloat(get(name));
    return Number.isFinite(n) ? n : d;
  };
  return {
    ease: get('--deal-ease') || FALLBACK.ease,
    exitEase: get('--deal-exit-ease') || FALLBACK.exitEase,
    dur: ms(get('--deal-dur'), FALLBACK.dur),
    step: ms(get('--deal-step'), FALLBACK.step),
    stepMin: ms(get('--deal-step-min'), FALLBACK.stepMin),
    max: Math.max(1, Math.round(num('--deal-max', FALLBACK.max))),
    scale: num('--deal-scale', FALLBACK.scale),
    reach: num('--deal-reach', FALLBACK.reach),
    exitDur: ms(get('--deal-exit-dur'), FALLBACK.exitDur),
    fade: ms(get('--deal-fade'), FALLBACK.fade),
    fadeReduced: ms(get('--deal-fade-reduced'), FALLBACK.fadeReduced),
  };
}

/** True when motion is reduced (Windows' setting or the Settings override). */
export function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

const running = new WeakMap<Element, Animation>();

/** Stops the deal or exit running on `el`; it shows at its resting place at once. */
export function stopMotion(el: Element): void {
  const a = running.get(el);
  if (!a) return;
  running.delete(el);
  a.cancel();
}

function track(el: Element, a: Animation): Animation {
  running.set(el, a);
  const done = (): void => {
    if (running.get(el) === a) running.delete(el);
  };
  // an exit holds its end state (fill: forwards) until stopMotion cancels it, so it stays tracked
  if (a.effect?.getTiming().fill !== 'forwards') a.addEventListener('finish', done);
  a.addEventListener('cancel', done);
  return a;
}

const centre = (r: DOMRect): { x: number; y: number } => ({
  x: r.left + r.width / 2,
  y: r.top + r.height / 2,
});

export interface DealOptions {
  /** Where the items come from (the opener's box); null: they rise from just below. */
  from?: DOMRect | null;
  /** Extra delay before the first item (ms). */
  delay?: number;
  /** A fixed offset instead of `from` (px), for example a wing sliding in from its side. */
  offset?: { x: number; y: number };
}

/**
 * Deals `items` in, one by one, from `from` toward their places (motion E). Items stay clickable
 * the whole time. Returns the animations (empty under reduced motion).
 */
export function dealIn(items: readonly HTMLElement[], opts: DealOptions = {}): Animation[] {
  for (const el of items) stopMotion(el);
  if (reducedMotion() || typeof Element.prototype.animate !== 'function') return [];
  const t = dealTokens();
  const origin = opts.from ? centre(opts.from) : null;
  return items.map((el, i) => {
    let dx = opts.offset?.x ?? 0;
    let dy = opts.offset?.y ?? (origin ? 0 : 24);
    if (origin && !opts.offset) {
      const c = centre(el.getBoundingClientRect());
      dx = (origin.x - c.x) * t.reach;
      dy = (origin.y - c.y) * t.reach;
    }
    const a = el.animate(
      [
        {
          transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${t.scale})`,
          opacity: 0,
        },
        { transform: 'none', opacity: 1 },
      ],
      {
        duration: t.dur,
        delay: (opts.delay ?? 0) + dealDelay(i, t),
        easing: t.ease,
        fill: 'backwards',
      },
    );
    return track(el, a);
  });
}

/** Fades `el` in (the view's backdrop; under reduced motion the whole view). */
export function fadeIn(el: HTMLElement): Animation | null {
  stopMotion(el);
  if (typeof Element.prototype.animate !== 'function') return null;
  const t = dealTokens();
  const duration = reducedMotion() ? t.fadeReduced : t.fade;
  return track(el, el.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing: t.ease }));
}

/**
 * Sends `el` back toward `to` all at once and fades it (a closing view). Resolves when done; at
 * once under reduced motion.
 */
export function dealOut(el: HTMLElement, to: DOMRect | null): Promise<void> {
  stopMotion(el);
  if (reducedMotion() || typeof Element.prototype.animate !== 'function') return Promise.resolve();
  const t = dealTokens();
  let dx = 0;
  let dy = 24;
  if (to) {
    const a = centre(to);
    const b = centre(el.getBoundingClientRect());
    dx = (a.x - b.x) * t.reach;
    dy = (a.y - b.y) * t.reach;
  }
  const anim = track(
    el,
    el.animate(
      [
        { transform: 'none', opacity: 1 },
        {
          transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${t.scale})`,
          opacity: 0,
        },
      ],
      { duration: t.exitDur, easing: t.exitEase, fill: 'forwards' },
    ),
  );
  return new Promise((resolve) => {
    const end = (): void => resolve();
    anim.addEventListener('finish', end);
    anim.addEventListener('cancel', end);
  });
}
