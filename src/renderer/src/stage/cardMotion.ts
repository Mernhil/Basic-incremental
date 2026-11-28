import { paced } from './duelPace';

/**
 * The two card reactions the dungeon duel and the arena share (DESIGN.md §2 Attack animations):
 * the hop of a card that strikes (it lifts and a glow behind it pulses) and the soft rim of a card
 * that is hit (a warm drop-shadow that follows the card's own shape, and a small dip). Show only.
 */

/** The striking card lifts `liftPx`, comes back, and its glow pulses once; each over `ms` (paced). */
export function hopMotion(
  body: HTMLElement,
  glow: HTMLElement | null,
  ms: number,
  liftPx: number,
): void {
  body.animate(
    [
      { transform: 'translateY(0)' },
      { transform: `translateY(${-liftPx}px)`, offset: 0.45 },
      { transform: 'translateY(0)' },
    ],
    { duration: paced(ms), easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)' },
  );
  glow?.animate([{ opacity: 0 }, { opacity: 1, offset: 0.35 }, { opacity: 0 }], {
    duration: paced(ms * 1.4),
    easing: 'ease-out',
  });
}

/**
 * The "soft rim" of a hit card (user, 2026-11-24): a warm rim on `body` that peaks at 12% of 800 ms
 * and eases out, and a dip of `el` by 8 px and back over 450 ms. `big` is a little brighter. With
 * `calm` (reduced motion) there is no dip and the rim is held for 300 ms. Returns the running
 * animations so a new hit can cancel them.
 */
export function hurtMotion(
  body: HTMLElement,
  el: HTMLElement,
  big: boolean,
  calm: boolean,
): Animation[] {
  const none = 'drop-shadow(0 0 0 rgb(255 138 90 / 0)) drop-shadow(0 0 0 rgb(255 138 90 / 0))';
  const rim = big
    ? 'drop-shadow(0 0 4px rgb(255 185 140 / 1)) drop-shadow(0 0 12px rgb(255 120 80 / 0.85))'
    : 'drop-shadow(0 0 4px rgb(255 170 120 / 0.95)) drop-shadow(0 0 10px rgb(255 110 70 / 0.7))';
  if (calm)
    return [
      body.animate(
        [
          { filter: none },
          { filter: rim, offset: 0.1 },
          { filter: rim, offset: 0.96 },
          { filter: none },
        ],
        { duration: paced(300), easing: 'linear' },
      ),
    ];
  return [
    body.animate([{ filter: none }, { filter: rim, offset: 0.12 }, { filter: none }], {
      duration: paced(800),
      easing: 'ease-out',
    }),
    el.animate(
      [
        { transform: 'translateY(0)' },
        { transform: 'translateY(8px)', offset: 0.15 },
        { transform: 'translateY(0)', offset: 0.45 },
        { transform: 'translateY(0)' },
      ],
      { duration: paced(450), easing: 'ease-out' },
    ),
  ];
}
