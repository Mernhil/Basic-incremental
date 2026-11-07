import { describe, expect, it } from 'vitest';
import { FRAME_METALS, cardFrame, mirror } from '../src/renderer/src/art/frame';

describe('card frame (DESIGN.md 5 and 13)', () => {
  it('mirrors a path across the card centre line', () => {
    expect(mirror('M6 30 L-10 6')).toBe('M170 30 L186 6');
  });

  it('grows with the tier and keeps every ornament from the tiers below', () => {
    const bronze = cardFrame('bronze');
    const silver = cardFrame('silver');
    const gold = cardFrame('gold');
    const prism = cardFrame('prismatic');
    const spike = 'M6 30 L-10 6 L20 13Z';
    const crest = 'M76 6 L88 -8 L100 6 L88 14Z';
    const wing = 'M4 70 C-32 50';
    expect([bronze, silver, gold, prism].map((f) => f.includes(spike))).toEqual([
      false,
      true,
      true,
      true,
    ]);
    expect([bronze, silver, gold, prism].map((f) => f.includes(crest))).toEqual([
      false,
      false,
      true,
      true,
    ]);
    expect([bronze, silver, gold, prism].map((f) => f.includes(wing))).toEqual([
      false,
      false,
      false,
      true,
    ]);
  });

  it('draws each tier in its own metal, and Prismatic in shifting rainbow metal', () => {
    expect(cardFrame('bronze')).toContain(FRAME_METALS.bronze.base);
    expect(cardFrame('gold')).toContain(FRAME_METALS.gold.gem);
    const prism = cardFrame('prismatic');
    expect(prism).toContain('<linearGradient');
    expect(prism).toContain('bi-frame__prism');
  });

  it('marks the plate rim so only the Knight plate family shows it', () => {
    expect(cardFrame('silver')).toContain('class="bi-frame__rim"');
  });

  it('never repeats an id across frames on one page', () => {
    const markup = cardFrame('prismatic') + cardFrame('prismatic') + cardFrame('gold');
    const ids = [...markup.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
