import { createThrottle } from '../stage/math';
import { SOUNDS, type SoundDef, type SoundId } from './registry';
import {
  SOUND_STORE_KEY,
  effectiveVolume,
  parseSoundSettings,
  type SoundSettings,
} from './settings';

/**
 * Procedural SFX (DESIGN.md §13): plays registry sounds through Web Audio, throttled per sound,
 * at the player's volume. The audio context starts on the first click or key press (browsers
 * keep audio locked until then).
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let settings: SoundSettings = load();
let focused = typeof document !== 'undefined' ? document.hasFocus() : true;
const throttles = new Map<SoundId, ReturnType<typeof createThrottle>>();
const listeners = new Set<(s: SoundSettings) => void>();

function load(): SoundSettings {
  try {
    return parseSoundSettings(localStorage.getItem(SOUND_STORE_KEY));
  } catch {
    return parseSoundSettings(null);
  }
}

function applyVolume(): void {
  if (master && ctx)
    master.gain.setTargetAtTime(effectiveVolume(settings, focused), ctx.currentTime, 0.02);
}

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  master = ctx.createGain();
  master.connect(ctx.destination);
  applyVolume();
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return ctx;
}

/** Installs the unlock and focus listeners. Call once at startup. */
export function initSound(): void {
  const unlock = (): void => {
    void audio()?.resume();
  };
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
  window.addEventListener('focus', () => {
    focused = true;
    applyVolume();
  });
  window.addEventListener('blur', () => {
    focused = false;
    applyVolume();
  });
}

function envelope(g: GainNode, at: number, dur: number, peak: number): void {
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), at + Math.min(0.01, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
}

function render(def: SoundDef, ac: AudioContext, out: AudioNode): void {
  const t0 = ac.currentTime + 0.005;
  for (const layer of def.layers) {
    const at = t0 + (layer.start ?? 0);
    const g = ac.createGain();
    envelope(g, at, layer.dur, layer.gain);
    g.connect(out);
    if (layer.kind === 'tone') {
      const osc = ac.createOscillator();
      osc.type = layer.wave;
      osc.frequency.setValueAtTime(layer.from, at);
      if (layer.to) osc.frequency.exponentialRampToValueAtTime(layer.to, at + layer.dur);
      osc.connect(g);
      osc.start(at);
      osc.stop(at + layer.dur + 0.02);
    } else if (noiseBuffer) {
      const src = ac.createBufferSource();
      src.buffer = noiseBuffer;
      const filter = ac.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = layer.freq;
      filter.Q.value = layer.q ?? 1;
      src.connect(filter);
      filter.connect(g);
      src.start(at);
      src.stop(at + layer.dur + 0.02);
    }
  }
}

/** Plays a sound if it is not throttled and the volume is above zero. */
export function playSound(id: string): void {
  const def = (SOUNDS as Record<string, SoundDef>)[id];
  if (!def || effectiveVolume(settings, focused) <= 0) return;
  let throttle = throttles.get(id as SoundId);
  if (!throttle) {
    throttle = createThrottle(def.max, def.windowMs);
    throttles.set(id as SoundId, throttle);
  }
  if (!throttle.allow(id, performance.now())) return;
  const ac = ctx; // not created before the first gesture: stay silent until then
  if (!ac || !master || ac.state !== 'running') return;
  render(def, ac, master);
}

export const soundSettings = (): SoundSettings => settings;

export function setSoundSettings(next: Partial<SoundSettings>): void {
  settings = { ...settings, ...next };
  try {
    localStorage.setItem(SOUND_STORE_KEY, JSON.stringify(settings));
  } catch {
    /* kept for this session */
  }
  applyVolume();
  for (const fn of listeners) fn(settings);
}

export function onSoundSettings(fn: (s: SoundSettings) => void): void {
  listeners.add(fn);
}
