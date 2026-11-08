/**
 * Sound registry (DESIGN.md 15): every sound effect is data, synthesized with Web Audio at play
 * time; no asset files. A future "sound pack" cosmetic can swap this table.
 *
 * A sound is a few layers. A tone layer is an oscillator gliding from `from` Hz to `to` Hz; a
 * noise layer is filtered white noise. `start` and `dur` are seconds, `gain` is 0..1 before the
 * volume settings. Each sound also says how often it may play (`max` per `windowMs`).
 */

/** Oscillator waves (the Web Audio OscillatorType, minus custom). */
export type Wave = 'sine' | 'square' | 'sawtooth' | 'triangle';

export interface ToneLayer {
  kind: 'tone';
  wave: Wave;
  from: number;
  to?: number;
  start?: number;
  dur: number;
  gain: number;
}

export interface NoiseLayer {
  kind: 'noise';
  /** Band-pass centre frequency in Hz. */
  freq: number;
  q?: number;
  start?: number;
  dur: number;
  gain: number;
}

export type SoundLayer = ToneLayer | NoiseLayer;

export interface SoundDef {
  layers: SoundLayer[];
  /** At most `max` plays per `windowMs` (DESIGN.md 15, throttle). */
  max: number;
  windowMs: number;
}

const tone = (
  wave: Wave,
  from: number,
  dur: number,
  gain: number,
  to?: number,
  start?: number,
): ToneLayer => ({
  kind: 'tone',
  wave,
  from,
  dur,
  gain,
  ...(to !== undefined ? { to } : {}),
  ...(start !== undefined ? { start } : {}),
});
const noise = (freq: number, dur: number, gain: number, q = 1, start?: number): NoiseLayer => ({
  kind: 'noise',
  freq,
  q,
  dur,
  gain,
  ...(start !== undefined ? { start } : {}),
});

/** Arpeggio helper: one short tone per note, `step` seconds apart. */
const arp = (wave: Wave, notes: number[], step: number, dur: number, gain: number) =>
  notes.map((f, i) => tone(wave, f, dur, gain, undefined, i * step));

export const SOUNDS = {
  hit: {
    layers: [noise(1800, 0.06, 0.35, 2), tone('triangle', 260, 0.08, 0.25, 140)],
    max: 4,
    windowMs: 1000,
  },
  crit: {
    layers: [
      noise(2600, 0.08, 0.4, 2),
      tone('square', 520, 0.12, 0.18, 260),
      tone('triangle', 900, 0.1, 0.12, 1200, 0.03),
    ],
    max: 3,
    windowMs: 1000,
  },
  signature: {
    layers: [
      noise(600, 0.35, 0.45, 0.7),
      tone('sawtooth', 180, 0.4, 0.25, 60),
      ...arp('triangle', [523, 659, 784, 1047], 0.05, 0.18, 0.18),
    ],
    max: 1,
    windowMs: 800,
  },
  bossHit: {
    layers: [noise(400, 0.12, 0.4, 1), tone('sine', 110, 0.18, 0.4, 55)],
    max: 2,
    windowMs: 1000,
  },
  knockout: {
    layers: [tone('sawtooth', 300, 0.6, 0.25, 70), noise(300, 0.4, 0.25, 0.8)],
    max: 1,
    windowMs: 2000,
  },
  kill: {
    layers: [noise(900, 0.25, 0.35, 0.8), ...arp('square', [392, 523, 659], 0.06, 0.12, 0.12)],
    max: 2,
    windowMs: 1000,
  },
  coin: {
    layers: [tone('square', 1319, 0.05, 0.1), tone('square', 1760, 0.12, 0.1, undefined, 0.05)],
    max: 5,
    windowMs: 1000,
  },
  // a crystal pickup: a brighter, longer chime than a coin
  crystal: {
    layers: arp('sine', [1047, 1568, 2093], 0.09, 0.4, 0.16),
    max: 2,
    windowMs: 1000,
  },
  rare: {
    layers: arp('triangle', [784, 988, 1175, 1568, 1976], 0.07, 0.3, 0.2),
    max: 1,
    windowMs: 1500,
  },
  buy: {
    layers: [tone('triangle', 660, 0.06, 0.2), tone('triangle', 990, 0.1, 0.18, undefined, 0.05)],
    max: 6,
    windowMs: 1000,
  },
  milestone: {
    layers: arp('square', [523, 659, 784, 1047, 1319], 0.06, 0.22, 0.13),
    max: 1,
    windowMs: 1000,
  },
  masteryTierUp: {
    layers: [
      ...arp('triangle', [440, 554, 659, 880], 0.08, 0.35, 0.18),
      noise(5000, 0.5, 0.08, 0.5, 0.2),
    ],
    max: 1,
    windowMs: 1200,
  },
  harvestBurst: {
    layers: [noise(3000, 0.3, 0.2, 0.6), ...arp('sine', [659, 784, 988], 0.05, 0.2, 0.2)],
    max: 1,
    windowMs: 800,
  },
  summonCommon: { layers: arp('triangle', [523, 659], 0.08, 0.2, 0.18), max: 2, windowMs: 1000 },
  summonRare: {
    layers: arp('triangle', [523, 659, 784], 0.08, 0.22, 0.18),
    max: 2,
    windowMs: 1000,
  },
  summonEpic: {
    layers: arp('square', [523, 659, 784, 1047], 0.08, 0.25, 0.14),
    max: 2,
    windowMs: 1000,
  },
  summonLegendary: {
    layers: [
      ...arp('square', [523, 659, 784, 1047, 1319], 0.08, 0.3, 0.14),
      noise(6000, 0.6, 0.08, 0.5, 0.3),
    ],
    max: 1,
    windowMs: 1000,
  },
  summonMythic: {
    layers: [
      ...arp('sawtooth', [392, 523, 659, 784, 1047, 1319], 0.07, 0.35, 0.1),
      noise(6000, 0.8, 0.1, 0.5, 0.3),
    ],
    max: 1,
    windowMs: 1000,
  },
  ascend: {
    layers: [
      tone('sine', 196, 1.4, 0.16, 784),
      ...arp('triangle', [392, 523, 659, 784, 1047, 1319, 1568], 0.09, 0.5, 0.12),
      noise(5000, 1.2, 0.07, 0.4, 0.2),
    ],
    max: 1,
    windowMs: 2000,
  },
  /** An achievement sticker slapped in: a papery slap, then a bright two-note chime. */
  achievement: {
    layers: [
      noise(900, 0.07, 0.35, 0.8),
      tone('triangle', 180, 0.08, 0.2, 90),
      ...arp('triangle', [784, 1175], 0.1, 0.3, 0.17).map((l) => ({
        ...l,
        start: (l.start ?? 0) + 0.08,
      })),
    ],
    max: 2,
    windowMs: 1200,
  },
  /** A skill gem lit: a glassy rising pair over a soft shimmer. */
  skillLearn: {
    layers: [
      tone('sine', 880, 0.14, 0.18, 1320),
      tone('triangle', 1320, 0.22, 0.12, undefined, 0.06),
      noise(7000, 0.25, 0.05, 0.6, 0.04),
    ],
    max: 4,
    windowMs: 1000,
  },
  /** Account level-up: a short fanfare that climbs and rings out. */
  levelUp: {
    layers: [
      ...arp('square', [392, 523, 659, 784], 0.07, 0.2, 0.12),
      tone('triangle', 1047, 0.6, 0.18, undefined, 0.28),
      tone('triangle', 1568, 0.5, 0.08, undefined, 0.3),
      noise(6000, 0.6, 0.06, 0.5, 0.28),
    ],
    max: 1,
    windowMs: 1500,
  },
  click: { layers: [tone('square', 1200, 0.025, 0.08, 900)], max: 8, windowMs: 1000 },
} satisfies Record<string, SoundDef>;

export type SoundId = keyof typeof SOUNDS;

export const SOUND_IDS = Object.keys(SOUNDS) as SoundId[];
