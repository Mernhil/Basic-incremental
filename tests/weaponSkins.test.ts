import { describe, expect, it } from 'vitest';
import { ContentValidationError, bundledRawContent, validateContent } from '../src/data';
import { content } from './helpers';

type RawSet = { weapon: string; skins: { id: string }[] };
const rawSet = (raw: ReturnType<typeof bundledRawContent>, weapon: string): RawSet =>
  (raw.weaponSkins as RawSet[]).find((s) => s.weapon === weapon)!;

describe('weapon skins content (weaponSkins.json)', () => {
  it('lists the thirteen legacy scythe skins, none free and none with base art', () => {
    const set = content.weaponSkinsByWeapon.get('scythe')!;
    expect(set.baseArt).toBeUndefined();
    expect(set.skins.map((s) => s.id)).toEqual(
      Array.from({ length: 13 }, (_, i) => `legacy-scythe-${String(i + 1).padStart(2, '0')}`),
    );
    expect(set.skins.map((s) => s.art)).toEqual([
      'evo-soul_reaper-0-base',
      ...Array.from({ length: 12 }, (_, i) => `skin-scythe-${String(i + 1).padStart(2, '0')}`),
    ]);
    for (const s of set.skins) {
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.legacy).toBe(true);
      expect(s.rarity).toBe('void');
    }
  });

  it('rejects duplicate skin ids within a weapon', () => {
    const raw = structuredClone(bundledRawContent());
    const scythe = rawSet(raw, 'scythe');
    scythe.skins[1]!.id = scythe.skins[0]!.id;
    expect(() => validateContent(raw)).toThrow(ContentValidationError);
    expect(() => validateContent(raw)).toThrow(/duplicate/);
  });

  it('rejects an unknown weapon', () => {
    const raw = structuredClone(bundledRawContent());
    rawSet(raw, 'scythe').weapon = 'banana';
    expect(() => validateContent(raw)).toThrow(/weaponSkins/);
  });
});
