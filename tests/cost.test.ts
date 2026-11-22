import { describe, expect, it } from 'vitest';
import { Decimal } from '../src/game';
import { costLabel, costText, hasCostArt } from '../src/renderer/src/settings/cost';
import { content } from './helpers';

describe('a cost is shown once, with the material sprite', () => {
  it('Money is the coin amount alone: "5.12", never "5.12 Silver"', () => {
    expect(hasCostArt(content, 'money')).toBe(true);
    expect(costText(content, 'money', new Decimal(5120))).toBe('5.12');
  });

  it('gems and scrolls have a sprite, so their cost is the number alone', () => {
    expect(costText(content, 'copper_gem', new Decimal(40))).toBe('40');
    expect(costText(content, 'summon_scroll', new Decimal(10))).toBe('10');
  });

  it('Cores, Dust, Shards, Sigils and Starlight have a sprite, so their cost is the number alone', () => {
    for (const id of [
      'moss_core',
      'frost_sigil',
      'facet_shard',
      'star_dust',
      'glimmer_dust',
      'starlight',
    ])
      expect(hasCostArt(content, id)).toBe(true);
    expect(costText(content, 'frost_core', new Decimal(8))).toBe('8');
  });

  it('a resource with no sprite keeps its name in words', () => {
    expect(hasCostArt(content, 'no_such_resource')).toBe(false);
  });

  it('the label always names the material, for the tooltip', () => {
    expect(costLabel(content, 'money', new Decimal(5120))).toBe('5.12 Silver');
  });
});
