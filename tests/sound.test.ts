import { describe, expect, it } from 'vitest';
import { SOUNDS, SOUND_IDS } from '../src/renderer/src/sound/registry';
import {
  DEFAULT_SOUND,
  effectiveVolume,
  parseSoundSettings,
} from '../src/renderer/src/sound/settings';

describe('sound registry', () => {
  it('has every sound DESIGN.md §13 lists', () => {
    for (const id of [
      'hit',
      'crit',
      'signature',
      'bossHit',
      'knockout',
      'kill',
      'coin',
      'rare',
      'buy',
      'milestone',
      'masteryTierUp',
      'harvestBurst',
      'summonCommon',
      'summonRare',
      'summonEpic',
      'summonLegendary',
      'summonMythic',
      'ascend',
      'click',
    ]) {
      expect(SOUND_IDS).toContain(id);
    }
  });

  it('keeps every sound short, quiet enough and throttled', () => {
    for (const def of Object.values(SOUNDS)) {
      expect(def.layers.length).toBeGreaterThan(0);
      expect(def.max).toBeGreaterThan(0);
      expect(def.max).toBeLessThanOrEqual(8);
      for (const layer of def.layers) {
        expect(layer.gain).toBeGreaterThan(0);
        expect(layer.gain).toBeLessThanOrEqual(0.5);
        expect((layer.start ?? 0) + layer.dur).toBeLessThanOrEqual(1.5);
      }
    }
  });
});

describe('sound settings', () => {
  it('defaults to on at a moderate volume, muted when unfocused', () => {
    expect(parseSoundSettings(null)).toEqual(DEFAULT_SOUND);
    expect(DEFAULT_SOUND.muted).toBe(false);
    expect(DEFAULT_SOUND.muteUnfocused).toBe(true);
    expect(effectiveVolume(DEFAULT_SOUND, true)).toBeGreaterThan(0.2);
    expect(effectiveVolume(DEFAULT_SOUND, true)).toBeLessThan(0.8);
  });

  it('repairs broken or partial stored settings', () => {
    expect(parseSoundSettings('not json')).toEqual(DEFAULT_SOUND);
    expect(parseSoundSettings('{"master": 7, "muted": "yes", "sfx": 0.5}')).toEqual({
      ...DEFAULT_SOUND,
      master: 1,
      sfx: 0.5,
    });
  });

  it('is silent when muted, or unfocused with mute-when-unfocused on', () => {
    expect(effectiveVolume({ ...DEFAULT_SOUND, muted: true }, true)).toBe(0);
    expect(effectiveVolume(DEFAULT_SOUND, false)).toBe(0);
    expect(effectiveVolume({ ...DEFAULT_SOUND, muteUnfocused: false }, false)).toBeGreaterThan(0);
  });
});
