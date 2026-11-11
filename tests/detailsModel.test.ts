import { describe, expect, it } from 'vitest';
import { Decimal } from '../src/game';
import { detailsView, mentionsResource, usedFor } from '../src/renderer/src/pages/detailsModel';
import { isCrystal, isHeaderResource, resourceIconId } from '../src/renderer/src/ui/resourceIcons';
import { content, freshState } from './helpers';

const entryOf = (id: string) =>
  detailsView(freshState(), content)
    .flatMap((g) => g.entries)
    .find((e) => e.id === id);

describe('header and details split', () => {
  it('puts only Money and the two crystals in the header', () => {
    const header = content.resources.filter(isHeaderResource).map((r) => r.id);
    expect(header).toEqual(['money', 'summon_scroll', 'glamour_scroll']);
    expect(content.resources.filter(isCrystal).map((r) => r.id)).toEqual([
      'summon_scroll',
      'glamour_scroll',
    ]);
  });

  it('gives Money a coin and each crystal its own icon id', () => {
    const icon = (id: string) => resourceIconId(content.resourceById.get(id)!);
    expect(icon('money')).toBe('coin');
    expect(icon('summon_scroll')).not.toBe(icon('glamour_scroll'));
  });
});

describe('details view', () => {
  it('groups every non-header resource and never repeats the header ones', () => {
    const groups = detailsView(freshState(), content);
    expect(groups.map((g) => g.id)).toEqual(['tree', 'mine', 'dungeon', 'prestige']);
    const ids = groups.flatMap((g) => g.entries.map((e) => e.id));
    expect(ids).not.toContain('money');
    expect(ids).not.toContain('summon_scroll');
    expect(ids).toContain('frost_sigil');
    expect(ids).toContain('starlight');
    expect(groups.find((g) => g.id === 'dungeon')!.entries.map((e) => e.id)).toEqual(
      expect.arrayContaining(['moss_core', 'glimmer_dust', 'facet_shard']),
    );
  });

  it('shows the amount, mastery and a rate only for what is produced', () => {
    const s = freshState();
    s.resources.oak_gem = new Decimal(1234);
    const oak = detailsView(s, content)
      .flatMap((g) => g.entries)
      .find((e) => e.id === 'oak_gem')!;
    expect(oak.amount).not.toBe('0');
    expect(oak.mastery).toBe('Stone mastery');
    expect(oak.masteryTier).toBe(0);
    expect(oak.rate).toMatch(/^\+.*\/s$/);
    expect(entryOf('starlight')!.rate).toBe('');
    expect(entryOf('starlight')!.masteryTier).toBe(-1);
    expect(entryOf('starlight')!.mastery).toBe('');
  });

  it('derives what a resource is used for from the data', () => {
    const uses = (id: string) => usedFor(content, content.resourceById.get(id)!);
    expect(uses('oak_gem')).toEqual(expect.arrayContaining(['unlocking Ironbark']));
    expect(uses('ironbark_gem')).toEqual(expect.arrayContaining(['card tier-ups']));
    expect(uses('money')).toEqual(expect.arrayContaining(['card tier-ups']));
    expect(uses('glimmer_dust')).toContain('cosmetic upgrades');
    expect(uses('starlight')).toContain('the Starlight shop');
    expect(entryOf('oak_gem')!.usedFor.startsWith('Used for ')).toBe(true);
  });

  it('finds a resource mentioned anywhere in a data node', () => {
    expect(mentionsResource([{ a: { resource: 'x' } }], 'x')).toBe(true);
    expect(mentionsResource({ resource: 'y' }, 'x')).toBe(false);
    expect(mentionsResource(null, 'x')).toBe(false);
  });
});
