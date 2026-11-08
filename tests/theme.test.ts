import { describe, expect, it } from 'vitest';
import { ContentValidationError, validateContent, type RawContent, type Rank } from '../src/data';
import {
  detectSets,
  emptyLoadout,
  equip,
  equipProblem,
  globalVars,
  levelVisual,
  meetsRank,
  missingVisuals,
  rankValue,
  resolveCard,
  resolveGlobal,
  sanitizeLoadout,
  ThemeError,
  unequipCard,
} from '../src/game';
import { content } from './helpers';
import resources from '../src/data/content/resources.json';
import trees from '../src/data/content/trees.json';
import mines from '../src/data/content/mines.json';
import production from '../src/data/content/production.json';
import cards from '../src/data/content/cards.json';
import cardRules from '../src/data/content/cardRules.json';
import dungeons from '../src/data/content/dungeons.json';
import trials from '../src/data/content/trials.json';
import combat from '../src/data/content/combat.json';
import cosmetics from '../src/data/content/cosmetics.json';
import portals from '../src/data/content/portals.json';
import rarities from '../src/data/content/rarities.json';
import wearRules from '../src/data/content/wearRules.json';
import sets from '../src/data/content/sets.json';
import progression from '../src/data/content/progression.json';
import enhancements from '../src/data/content/enhancements.json';
import account from '../src/data/content/account.json';
import achievements from '../src/data/content/achievements.json';
import cosmeticRules from '../src/data/content/cosmeticRules.json';
import prestige from '../src/data/content/prestige.json';
import upgrades from '../src/data/content/upgrades.json';

const MAIN = 'dawnblade_regent';
const r = (tier: Rank['tier'], stars: number): Rank => ({ tier, stars });
const cardAt = (rank: Rank, id = MAIN) => ({ id, rank, rarity: 'epic' as const });

describe('ranks', () => {
  it('orders tiers and stars', () => {
    expect(rankValue(r('bronze', 6))).toBeLessThan(rankValue(r('silver', 1)));
    expect(meetsRank(r('gold', 1), r('gold', 1))).toBe(true);
    expect(meetsRank(r('silver', 6), r('gold', 1))).toBe(false);
  });
});

describe('equipping', () => {
  it('shows the starter in every slot of an empty loadout', () => {
    const resolved = resolveGlobal(content, emptyLoadout());
    expect(resolved.border.cosmetic.id).toBe('gn_border');
    expect(resolved.table.cosmetic.id).toBe('gn_table');
    expect(resolved.cursor.visual.recipes).toEqual(['cursor-gilded']);
  });

  it('replaces the global item and its tokens instantly', () => {
    const loadout = equip(content, emptyLoadout(), 'table', { id: 'gt_table', level: 1 });
    const { vars } = globalVars(resolveGlobal(content, loadout));
    expect(vars['--bi-table-bg']).toBe('#111a35');
    expect(vars['--bi-num-weight']).toBe('600'); // other slots unchanged
  });

  it('merges upgrade levels: later tokens win, recipes accumulate', () => {
    const veil = content.cosmeticById.get('aurora_veil')!;
    expect(levelVisual(veil, 1).recipes).toEqual(['holo-aurora']);
    const top = levelVisual(veil, 3);
    expect(top.recipes).toEqual(['holo-aurora', 'holo-aurora-flow', 'holo-sparkle']);
    expect(top.tokens['finish-opacity']).toBe('0.55');
    expect(top.tokens['finish-a']).toBeDefined(); // inherited from level 1
  });

  it('rejects wrong slots, unknown ids, bad levels and global exclusives', () => {
    const bad = [
      equipProblem(content, 'table', { id: 'gn_border', level: 1 }),
      equipProblem(content, 'border', { id: 'nope', level: 1 }),
      // Epic: max level 4 (DESIGN.md §8), whatever its drawn levels.
      equipProblem(content, 'border', { id: 'gilded_filigree', level: 5 }),
      equipProblem(content, 'border', { id: 'gilded_filigree', level: 0 }),
      equipProblem(content, 'border', { id: 'ember_crown', level: 1 }),
      equipProblem(content, 'border', { id: 'ember_crown', level: 1 }, 'shield_warden'),
      equipProblem(content, 'table', { id: 'gt_table', level: 1 }, MAIN),
    ];
    for (const problem of bad) expect(problem).toBeTypeOf('string');
    expect(equipProblem(content, 'border', { id: 'gilded_filigree', level: 4 })).toBeNull();
    expect(() => equip(content, emptyLoadout(), 'table', { id: 'gn_border', level: 1 })).toThrow(
      ThemeError,
    );
  });

  it('does not mutate the loadout it was given', () => {
    const before = emptyLoadout();
    equip(content, before, 'border', { id: 'gilded_plate', level: 1 });
    expect(before).toEqual(emptyLoadout());
  });
});

describe('wear rules (rank needed to wear, not to own)', () => {
  const plate = equip(content, emptyLoadout(), 'border', { id: 'gilded_plate', level: 1 });

  it('shows the starter border below Gold, and the item from Gold 1', () => {
    const silver = resolveCard(content, plate, cardAt(r('silver', 6)));
    expect(silver.slots.border.cosmetic.id).toBe('gn_border');
    expect(silver.slots.border.worn).toBe(false);
    expect(silver.slots.border.blocked?.id).toBe('gilded_plate');

    const gold = resolveCard(content, plate, cardAt(r('gold', 1)));
    expect(gold.slots.border.cosmetic.id).toBe('gilded_plate');
    expect(gold.vars['--bi-plate-bg']).toBe('#d9b35a');
  });

  it('only shows finishes from Prismatic 1', () => {
    const holo = equip(content, emptyLoadout(), 'finish', { id: 'holo_hex', level: 1 });
    expect(resolveCard(content, holo, cardAt(r('gold', 6))).slots.finish.worn).toBe(false);
    expect(resolveCard(content, holo, cardAt(r('prismatic', 1))).recipes).toContain('holo-hex');
  });
});

describe('card-exclusive overrides', () => {
  const crowned = equip(content, emptyLoadout(), 'border', { id: 'ember_crown', level: 1 }, MAIN);
  const withGlobal = equip(content, crowned, 'border', { id: 'gilded_plate', level: 1 });

  it('overrides the global slot on its own card only', () => {
    const own = resolveCard(content, withGlobal, cardAt(r('prismatic', 6)));
    expect(own.slots.border.cosmetic.id).toBe('ember_crown');
    expect(own.recipes).toContain('crown');

    const other = resolveCard(content, withGlobal, cardAt(r('prismatic', 6), 'shield_warden'));
    expect(other.slots.border.cosmetic.id).toBe('gilded_plate');
  });

  it('needs Prismatic 6 to be worn', () => {
    const p5 = resolveCard(content, withGlobal, cardAt(r('prismatic', 5)));
    expect(p5.slots.border.worn).toBe(false);
    expect(p5.slots.border.cosmetic.id).toBe('gn_border');
  });

  it('goes back to the global slot when removed', () => {
    const removed = unequipCard(withGlobal, MAIN, 'border');
    expect(removed.cards[MAIN]).toBeUndefined();
    expect(resolveCard(content, removed, cardAt(r('gold', 1))).slots.border.cosmetic.id).toBe(
      'gilded_plate',
    );
  });

  it('adds rarity tokens and recipes to the card', () => {
    const mythic = resolveCard(content, emptyLoadout(), {
      id: MAIN,
      rank: r('bronze', 1),
      rarity: 'mythic',
    });
    expect(mythic.vars['--bi-rarity-neon']).toBe('#ff3fb4');
    expect(mythic.recipes).toContain('neon');
  });
});

describe('set detection', () => {
  it('counts the starter set as complete on a fresh loadout', () => {
    const sets = detectSets(content, emptyLoadout());
    expect(sets.find((s) => s.set === 'gilded_nocturne')).toEqual({
      set: 'gilded_nocturne',
      equipped: 7,
      total: 7,
      complete: true,
    });
    expect(sets.find((s) => s.set === 'gilded_tradition')!.equipped).toBe(0);
  });

  it('tracks partial and complete sets as items change', () => {
    let loadout = equip(content, emptyLoadout(), 'table', { id: 'gt_table', level: 1 });
    let tradition = detectSets(content, loadout).find((s) => s.set === 'gilded_tradition')!;
    expect(tradition).toMatchObject({ equipped: 1, complete: false });
    expect(detectSets(content, loadout).find((s) => s.set === 'gilded_nocturne')!.complete).toBe(
      false,
    );

    for (const slot of ['border', 'finish', 'attack', 'tick', 'number', 'cursor'] as const) {
      loadout = equip(content, loadout, slot, { id: `gt_${slot}`, level: 1 });
    }
    tradition = detectSets(content, loadout).find((s) => s.set === 'gilded_tradition')!;
    expect(tradition).toMatchObject({ equipped: 7, total: 7, complete: true });
  });
});

describe('loading and registry checks', () => {
  it('drops invalid entries from a saved loadout', () => {
    const dirty = {
      slots: {
        border: { id: 'nope', level: 1 },
        table: { id: 'gt_table', level: 1 },
        finish: { id: 'aurora_veil', level: 9 },
      },
      cards: {
        [MAIN]: { border: { id: 'ember_crown', level: 1 } },
        ghost: { border: { id: 'ember_crown', level: 1 } },
      },
    };
    const clean = sanitizeLoadout(content, dirty);
    expect(clean.slots).toEqual({ table: { id: 'gt_table', level: 1 } });
    expect(Object.keys(clean.cards)).toEqual([MAIN]);
  });

  it('reports recipes and effects the renderer does not implement', () => {
    const problems = missingVisuals(content, {
      recipes: new Set(['cursor-gilded']),
      effects: new Set(['rise']),
    });
    expect(problems.some((p) => p.includes('unknown recipe "filigree-1"'))).toBe(true);
    expect(problems.some((p) => p.includes('unknown effect "heavy-hit"'))).toBe(true);
    expect(problems.some((p) => p.includes('rarity "mythic"'))).toBe(true);
  });
});

describe('invalid cosmetic data is rejected', () => {
  const raw = (): RawContent =>
    structuredClone({
      resources,
      trees,
      mines,
      production,
      cards,
      cardRules,
      dungeons,
      trials,
      combat,
      cosmetics,
      portals,
      rarities,
      wearRules,
      sets,
      progression,
      enhancements,
      account,
      achievements,
      cosmeticRules,
      prestige,
      upgrades,
    });
  const issues = (input: RawContent): string[] => {
    try {
      validateContent(input);
      return [];
    } catch (error) {
      if (error instanceof ContentValidationError) return error.issues;
      throw error;
    }
  };
  type RawItem = Record<string, unknown> & {
    levels: { tokens: Record<string, string>; effects?: unknown }[];
  };
  const item = (bad: RawContent, id: string) =>
    (bad.cosmetics as RawItem[]).find((c) => c['id'] === id)!;

  it('rejects a token that does not belong to the slot', () => {
    const bad = raw();
    item(bad, 'gn_table').levels[0]!.tokens['plate-bg'] = '#000';
    expect(issues(bad).join('\n')).toContain('"plate-bg" is not a table token');
  });

  it('rejects token values that could break out of CSS', () => {
    const bad = raw();
    item(bad, 'gn_table').levels[0]!.tokens['table-bg'] = 'red; color: blue';
    expect(issues(bad).join('\n')).toContain('must not contain');
  });

  it('rejects attack items without per-job effects and exclusives in global slots', () => {
    const bad = raw();
    delete item(bad, 'gt_attack').levels[0]!.effects;
    item(bad, 'gt_table')['exclusiveCard'] = MAIN;
    const text = issues(bad).join('\n');
    expect(text).toContain('attack items need an effect per job');
    expect(text).toContain('only card slots');
  });

  it('requires exactly one starter per slot and one style per rarity', () => {
    const base = raw();
    item(base, 'gt_table')['starter'] = true;
    const bad = {
      ...base,
      rarities: (base.rarities as { id: string }[]).filter((x) => x.id !== 'void'),
    };
    const text = issues(bad).join('\n');
    expect(text).toContain('slot "table" needs exactly one starter item, found 2');
    expect(text).toContain('rarity "void" needs exactly one entry, found 0');
  });

  it('rejects two items of the same set in one slot', () => {
    const bad = raw();
    item(bad, 'gilded_plate')['set'] = 'gilded_tradition';
    expect(issues(bad).join('\n')).toContain('set "gilded_tradition" already has a border item');
  });
});

describe('token inheritance', () => {
  it('fills tokens an item does not set from the slot starter', () => {
    const plate = equip(content, emptyLoadout(), 'border', { id: 'gilded_plate', level: 1 });
    const card = resolveCard(content, plate, cardAt(r('gold', 1)));
    expect(card.vars['--bi-plate-bg']).toBe('#d9b35a'); // set by the item
    expect(card.vars['--bi-panel-ink-muted']).toBe('#b4c0d4'); // inherited from Knight Plate
    expect(card.recipes).toContain('inner-gilt');
  });

  it('does not inherit the starter recipes', () => {
    const prism = equip(content, emptyLoadout(), 'cursor', { id: 'prism_pointer', level: 1 });
    expect(resolveGlobal(content, prism).cursor.visual.recipes).toEqual(['cursor-prism']);
  });
});
