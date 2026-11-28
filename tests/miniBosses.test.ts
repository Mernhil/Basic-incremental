import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/data';
import { floorCount, floorKind, floorSpec, miniBossAt } from '../src/game';
import { MANIFEST } from '../src/renderer/src/art/pixel/manifest';

const content = loadContent();

/** The 10th-floor stops of each dungeon, in order (the user's list, 2026-11-23). */
const STOPS: Record<string, string[]> = {
  // the boss holds floor 10, so no stage stop; the entry only serves the endless depths
  thistledown_farm: ['crow_king', 'giant_sprout'],
  mossy_cellar: [],
  ember_crypt: ['blood_duchess'],
  frostspire_vault: ['glacierbreaker_knight', 'ivory_direwolf'],
  thunderpeak_aerie: [
    'abyssal_sharkfang_raider',
    'drowned_leviathanbeard_high_admiral',
    'storm_siren',
  ],
  sunken_sanctum: ['ivory_sun_priestess', 'holy_judiciar', 'marble_guardian', 'plague_doctor'],
  void_hollow: [
    'gothic_bloodhunter',
    'plague_lantern_keeper',
    'void_witch',
    'hollow_armour',
    'rift_maw',
  ],
};

describe('a mini-boss at every 10-floor stop', () => {
  it('resolves each stop of each dungeon to its listed mini-boss', () => {
    for (const d of content.allDungeons) {
      const want = STOPS[d.id]!;
      const listed = want.length === 0 ? d.miniBosses.slice(1) : d.miniBosses;
      expect(
        listed.map((m) => m.id),
        d.id,
      ).toEqual(want);
      expect(want, d.id).toBeDefined();
      const stops: number[] = [];
      for (let f = 1; f < floorCount(d, 'normal'); f++) {
        if (floorKind(content, d, f) === 'miniboss') stops.push(f);
      }
      expect(stops, d.id).toEqual(want.map((_, i) => (i + 1) * 10));
      stops.forEach((f, i) => {
        const e = floorSpec(content, d, 'normal', f).enemies[0]!;
        expect(e.id, `${d.id} ${f}`).toBe(want[i]);
        expect(e.kind).toBe('miniboss');
        expect(e.name).toBe(miniBossAt(content, d, f)!.name);
        expect(e.name.length).toBeGreaterThan(0);
        // the same stats the dungeon's mini-boss always had: only the character changes
        expect(e.hp.eq(floorSpec(content, d, 'normal', f).hp)).toBe(true);
      });
    }
  });

  it('gives the endless depths the same list again, and the Cellar its own', () => {
    const sanctum = content.dungeonById.get('sunken_sanctum')!;
    expect(floorSpec(content, sanctum, 'endless', 10).enemies[0]!.id).toBe('ivory_sun_priestess');
    expect(floorSpec(content, sanctum, 'endless', 50).enemies[0]!.id).toBe('ivory_sun_priestess');
    expect(floorSpec(content, sanctum, 'endless', 40).enemies[0]!.id).toBe('plague_doctor');
    const cellar = content.dungeonById.get('mossy_cellar')!;
    expect(floorSpec(content, cellar, 'endless', 10).enemies[0]!.id).toBe('plague_lantern_keeper');
    expect(floorKind(content, cellar, 10)).toBe('boss');
  });

  it('shows every enemy, mini-boss and boss with a picture', () => {
    for (const d of content.allDungeons) {
      for (const e of [...d.enemies, ...d.miniBosses]) {
        expect(MANIFEST[`foe-${e.sprite}`], e.id).toMatchObject({ w: 160, h: 172 });
      }
    }
  });
});
