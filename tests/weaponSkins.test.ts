import { describe, expect, it } from 'vitest';
import { ContentValidationError, bundledRawContent, validateContent } from '../src/data';
import { content } from './helpers';

describe('weapon skins content (weaponSkins.json)', () => {
  it('lists twelve free skins for the Soul Reaper scythe', () => {
    const set = content.weaponSkinsByWeapon.get('soul_reaper')!;
    const skins = set.skins;
    expect(skins.map((s) => s.id)).toEqual(
      Array.from({ length: 12 }, (_, i) => `skin-${String(i + 1).padStart(2, '0')}`),
    );
    expect(skins.map((s) => s.art)).toEqual(
      Array.from({ length: 12 }, (_, i) => `skin-scythe-${String(i + 1).padStart(2, '0')}`),
    );
    expect(set.baseArt).toBe('skin-scythe-base');
    for (const s of skins) {
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.cost).toBe(0);
    }
  });

  it('rejects duplicate skin ids within a weapon', () => {
    const rawContent = structuredClone(bundledRawContent());
    const entry = rawContent.weaponSkins as { skins: { id: string }[] }[];
    entry[0]!.skins[1]!.id = entry[0]!.skins[0]!.id;
    expect(() => validateContent(rawContent)).toThrow(ContentValidationError);
    expect(() => validateContent(rawContent)).toThrow(/duplicate/);
  });

  it('rejects an unknown weapon', () => {
    const rawContent = structuredClone(bundledRawContent());
    (rawContent.weaponSkins as { weapon: string }[])[0]!.weapon = 'banana';
    expect(() => validateContent(rawContent)).toThrow(/weaponSkins/);
  });
});
