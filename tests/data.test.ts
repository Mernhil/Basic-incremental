import { describe, expect, it } from 'vitest';
import { ContentValidationError, loadContent, validateContent, type RawContent } from '../src/data';
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

type PortalRaw = {
  cost: { resource: string };
  pool: { itemId: string }[];
  pity: { threshold: number };
} & Record<string, unknown>;

function raw(overrides: Partial<RawContent> = {}): RawContent {
  return structuredClone({
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
    ...overrides,
  });
}

function issuesFor(input: RawContent): string[] {
  try {
    validateContent(input);
  } catch (error) {
    if (error instanceof ContentValidationError) return error.issues;
    throw error;
  }
  return [];
}

describe('bundled content', () => {
  it('validates and exposes the beta content (DESIGN.md §5)', () => {
    const content = loadContent();
    expect(content.resources.length).toBeGreaterThanOrEqual(3);
    expect(content.trees.map((t) => t.name)).toEqual(['Oak', 'Ironbark', 'Moonwillow']);
    expect(content.mines.map((m) => [m.name, m.unlockedByDungeon])).toEqual([
      ['Copper Quarry', null],
      ['Iron Deeps', 'mossy_cellar'],
      ['Crystal Grotto', 'ember_crypt'],
    ]);
    expect(content.cards).toHaveLength(12);
    expect(content.dungeons.map((d) => [d.name, d.boss.name])).toEqual([
      ['Mossy Cellar', 'Root Warden'],
      ['Ember Crypt', 'Cinder Lich'],
      ['Frostspire Vault', 'Glacier Colossus'],
    ]);
    expect(content.cosmetics.length).toBeGreaterThan(7);
    expect(content.portals).toHaveLength(2); // Card Portal and Wardrobe Gate (open with the Wardrobe)
    expect(content.dungeons.map((d) => d.boss.name)).toEqual([
      'Root Warden',
      'Cinder Lich',
      'Glacier Colossus',
    ]);
    expect(content.trials.map((t) => t.name)).toEqual(['The Glimmer Trial']);
  });
});

describe('gem art (DESIGN.md §12)', () => {
  it('gives every tree and mine gem a shape, carving and four colours, and every tree its colours', () => {
    const content = loadContent();
    const gems = content.resources.filter((r) => r.kind === 'tree_gem' || r.kind === 'mine_gem');
    expect(gems.map((g) => g.gem?.shape)).toEqual([
      'round',
      'pentagon',
      'star',
      'square',
      'hexagon',
      'drop',
    ]);
    for (const t of content.trees) expect(t.art.leaf).toHaveLength(4);
  });

  it('requires gem art on gems and refuses it on other resources', () => {
    const bad = raw();
    const list = bad.resources as Record<string, unknown>[];
    delete list[0]!['gem'];
    list[6]!['gem'] = list[1]!['gem'];
    const issues = issuesFor(bad);
    expect(issues).toContain('resources.json › [0] › gem: a tree_gem needs gem art');
    expect(issues).toContain('resources.json › [6] › gem: only gems have gem art');
  });

  it('rejects colours that are not #rrggbb', () => {
    const bad = raw();
    const gem = (bad.resources as { gem: { colors: string[] } }[])[0]!.gem;
    gem.colors[0] = 'orange';
    expect(issuesFor(bad)).toEqual([
      'resources.json › [0] › gem › colors › [0]: colours are #rrggbb in lowercase',
    ]);
  });
});

describe('content validation errors', () => {
  it('names the file, index and field for schema problems', () => {
    const bad = raw();
    (bad.trees as Record<string, unknown>[])[0]!['baseRate'] = 'lots';
    const issues = issuesFor(bad);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/^trees\.json › \[0\] › baseRate: /);
  });

  it('rejects unknown fields (typos) instead of ignoring them', () => {
    const bad = raw();
    (bad.dungeons as Record<string, unknown>[])[0]!['bosss'] = {};
    expect(issuesFor(bad).join('\n')).toContain('dungeons.json');
  });

  it('reports every file with problems at once', () => {
    const bad = raw({ resources: [{ id: 'Bad Id' }], cards: [{}] });
    const issues = issuesFor(bad);
    expect(issues.some((i) => i.startsWith('resources.json'))).toBe(true);
    expect(issues.some((i) => i.startsWith('cards.json'))).toBe(true);
  });

  it('catches broken cross-references', () => {
    const bad = raw();
    (bad.trees as Record<string, unknown>[])[0]!['resource'] = 'missing_wood';
    const list = bad.cosmetics as Record<string, unknown>[];
    const crown = list.findIndex((c) => c['exclusiveCard']);
    list[crown]!['exclusiveCard'] = 'missing_card';
    const issues = issuesFor(bad);
    expect(issues).toContain('trees.json › [0] › resource: unknown resource "missing_wood"');
    expect(issues).toContain(
      `cosmetics.json › [${crown}] › exclusiveCard: unknown card "missing_card"`,
    );
  });

  it('catches wrong resource kinds and duplicate ids', () => {
    const base = raw();
    (base.mines as Record<string, unknown>[])[0]!['resource'] = 'oak_gem';
    const list = base.resources as object[];
    const bad = { ...base, resources: [...list, list[0]!] };
    const issues = issuesFor(bad);
    expect(issues.some((i) => i.includes('is tree_gem, expected mine_gem'))).toBe(true);
    expect(issues.some((i) => i.includes('duplicate id "oak_gem"'))).toBe(true);
  });

  it('requires a message that explains the whole failure', () => {
    const bad = raw({ resources: 'nope' });
    expect(() => validateContent(bad)).toThrow(/Invalid game data \(\d+ problems?\)/);
  });
});

describe('card ranks and portals', () => {
  it('has the 12 beta cards of DESIGN.md §5, §6 per job, each with a main and support effect', () => {
    const content = loadContent();
    expect(content.cards).toHaveLength(12);
    for (const job of ['fighting', 'logging', 'mining'] as const) {
      expect(content.cards.filter((c) => c.job === job)).toHaveLength(4);
    }
    const rarities = content.cards.map((c) => c.rarity);
    expect(rarities.filter((r) => r === 'common')).toHaveLength(3);
    expect(rarities.filter((r) => r === 'rare')).toHaveLength(3);
    expect(rarities.filter((r) => r === 'epic')).toHaveLength(2);
    expect(rarities.filter((r) => r === 'legendary')).toHaveLength(2);
    expect(rarities.filter((r) => r === 'mythic')).toHaveLength(1);
    expect(rarities.filter((r) => r === 'exotic')).toHaveLength(1);
    for (const card of content.cards) {
      expect(card.main.description.length).toBeGreaterThan(0);
      expect(card.support.modifiers.length).toBeGreaterThan(0);
    }
    expect(content.cardRules.startCards).toEqual([
      'ember_squire',
      'apprentice_feller',
      'cave_digger',
    ]);
  });

  it('scales flat and percent card bonuses by default, and nothing else', () => {
    const content = loadContent();
    const warden = content.cardById.get('shield_warden')!;
    expect(warden.main.modifiers.map((m) => [m.kind, m.scale])).toEqual([
      ['set', 'none'],
      ['percent', 'full'],
    ]);
    expect(warden.support.modifiers[0]!.scale).toBe('none'); // explicit: +1 fill stays +1
  });

  it('catches bad card rules', () => {
    const bad = raw();
    const rules = bad.cardRules as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    rules['startCards'] = ['ember_squire', 'shield_warden', 'missing_card'];
    rules['levelCaps'].gold = 30; // below Silver's 40
    const issues = issuesFor(bad);
    expect(issues.some((i) => i.includes('startCards › [1]: a start card already leads'))).toBe(
      true,
    );
    expect(issues.some((i) => i.includes('startCards › [2]: unknown card "missing_card"'))).toBe(
      true,
    );
    expect(issues).toContain('cardRules.json › levelCaps › gold: caps must not go down');

    const short = raw();
    (short.cardRules as Record<string, any>)['levelCaps'].gold = [60, 64, 68]; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(issuesFor(short).some((i) => i.startsWith('cardRules.json › levelCaps › gold'))).toBe(
      true,
    );
  });

  it('catches unknown materials and card modifier scopes', () => {
    const bad = raw();
    const rules = bad.cardRules as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    rules['starUp'].tiers.bronze[0].resource = 'nope';
    rules['tierUp'].bronze.mining[0].resource = 'nope';
    (bad.cards as Record<string, any>[])[0]!['support'].modifiers[0].scope = { dungeon: 'nowhere' }; // eslint-disable-line @typescript-eslint/no-explicit-any
    const issues = issuesFor(bad);
    expect(issues).toContain(
      'cardRules.json › starUp › tiers › bronze › [0] › resource: unknown resource "nope"',
    );
    expect(issues).toContain(
      'cardRules.json › tierUp › bronze › mining › [0] › resource: unknown resource "nope"',
    );
    expect(issues).toContain(
      'cards.json › [0] › support › modifiers › [0] › scope › dungeon: unknown dungeon "nowhere"',
    );
  });

  it('rejects wear-rule ranks outside Bronze..Prismatic and ★1..6', () => {
    for (const rank of [
      { tier: 'diamond', stars: 1 },
      { tier: 'gold', stars: 0 },
      { tier: 'gold', stars: 7 },
      { tier: 'gold', stars: 2.5 },
    ]) {
      const bad = raw();
      (bad.wearRules as Record<string, unknown>)['border'] = rank;
      expect(issuesFor(bad).some((i) => i.startsWith('wearRules.json › border'))).toBe(true);
    }
  });

  it('catches portal cost and pool problems', () => {
    const bad = raw();
    const portal = (bad.portals as PortalRaw[])[0]!;
    portal.cost.resource = 'oak_gem';
    portal.pool[0]!.itemId = 'holo_hex'; // a cosmetic in a cards portal
    portal.pool[1]!.itemId = 'missing_card';
    const issues = issuesFor(bad);
    expect(issues.some((i) => i.includes('is tree_gem, expected crystal'))).toBe(true);
    expect(
      issues.some((i) => i.includes('pool › [0] › itemId') && i.includes('not a known card')),
    ).toBe(true);
    expect(issues.some((i) => i.includes('pool › [1] › itemId'))).toBe(true);
  });

  it('requires a non-empty pool and a valid pity threshold', () => {
    const bad = raw();
    const portal = (bad.portals as PortalRaw[])[0]!;
    portal['pool'] = [];
    portal['pity'].threshold = 0;
    const issues = issuesFor(bad);
    expect(issues.some((i) => i.startsWith('portals.json › [0] › pool'))).toBe(true);
    expect(issues.some((i) => i.startsWith('portals.json › [0] › pity › threshold'))).toBe(true);
  });

  it('has the beta Card Portal: 10 / 100 Summon Crystals, Legendary+ at 90, Rare+ per 10-pull', () => {
    const portal = loadContent().portals.find((p) => p.id === 'card_portal')!;
    expect(portal.cost.single.toNumber()).toBe(10);
    expect(portal.cost.ten.toNumber()).toBe(100);
    expect(portal.pity).toEqual({ rarity: 'legendary', threshold: 90 });
    expect(portal.tenPullGuarantee).toBe('rare');
  });

  it('checks the prestige currency, reward cosmetics and shop modifier scopes', () => {
    const bad = raw();
    const p = bad.prestige as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    p['currency'] = 'summon_crystal';
    p['rewards'][0].cosmetics = ['nope'];
    p['shop'][0].perLevel[0].scope = { dungeon: 'nowhere' };
    const issues = issuesFor(bad);
    expect(issues).toContain(
      'prestige.json › currency: "summon_crystal" is crystal, expected prestige',
    );
    expect(issues).toContain(
      'prestige.json › rewards › [0] › cosmetics › [0]: unknown cosmetic "nope"',
    );
    expect(issues).toContain(
      'prestige.json › shop › [0] › perLevel › [0] › scope › dungeon: unknown dungeon "nowhere"',
    );
  });

  it('needs a source for every non-starter cosmetic, and pool rarities that match the item', () => {
    const bad = raw();
    const gate = (bad.portals as PortalRaw[]).find((p) => p['id'] === 'wardrobe_gate')!;
    gate.pool = (gate.pool as { itemId: string; rarity: string }[])
      .filter((e) => e.itemId !== 'ember_crown')
      .map((e) => (e.itemId === 'holo_hex' ? { ...e, rarity: 'epic' } : e));
    const file = bad.achievements as { shardShop: { id: string }[] };
    file.shardShop = file.shardShop.filter((i) => i.id !== 'ember_crown');
    const issues = issuesFor(bad);
    expect(issues.some((i) => i.includes('"ember_crown" has no source'))).toBe(true);
    expect(issues.some((i) => i.includes('"holo_hex" is rare, not epic'))).toBe(true);
  });

  it('checks what achievements and the shard shop name', () => {
    const bad = raw();
    const file = bad.achievements as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    file['achievements'][8].condition = { kind: 'cleared', dungeon: 'nowhere' };
    file['achievements'][8].reward = { cosmetics: ['nope'] };
    file['achievements'][1].id = file['achievements'][0].id;
    file['shardShop'][0].reward = { kind: 'card', card: 'nobody' };
    const issues = issuesFor(bad);
    expect(issues).toContain(
      'achievements.json › achievements › [8] › condition › dungeon: unknown dungeon "nowhere"',
    );
    expect(issues).toContain(
      'achievements.json › achievements › [8] › reward › cosmetics › [0]: unknown cosmetic "nope"',
    );
    expect(issues).toContain(
      'achievements.json › achievements › [1] › id: duplicate "first_harvest"',
    );
    expect(issues).toContain('achievements.json › shardShop › [0] › reward: unknown card "nobody"');
  });

  it('checks the account tree, reward track and enhancement lists', () => {
    const bad = raw();
    const account = bad.account as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    account['tree'][1].requires = ['nowhere'];
    account['tree'][0].perRank[0].scope = { dungeon: 'nowhere' };
    account['rewardTrack'][0].cosmetics = ['nope'];
    const enh = bad.enhancements as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    delete enh['cards']['core_titan'];
    enh['cards']['nobody'] = enh['cards']['ember_squire'];
    const issues = issuesFor(bad);
    expect(issues).toContain('account.json › tree › [1] › requires › [0]: unknown node "nowhere"');
    expect(issues).toContain(
      'account.json › tree › [0] › perRank › [0] › scope › dungeon: unknown dungeon "nowhere"',
    );
    expect(issues).toContain(
      'account.json › rewardTrack › [0] › cosmetics › [0]: unknown cosmetic "nope"',
    );
    expect(issues).toContain('enhancements.json › cards › nobody: unknown card');
    expect(issues).toContain('enhancements.json › cards: "core_titan" has no enhancement options');
  });

  it('checks the cosmetic upgrade ladders', () => {
    const bad = raw();
    const rules = bad.cosmeticRules as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    rules['ladders']['3'] = ['accent', 'shape', 'ambient'];
    rules['ladders']['4'] = ['shape', 'accent', 'gems', 'glow'];
    rules['ladders']['5'] = ['shape', 'ambient'];
    const issues = issuesFor(bad);
    expect(issues).toContain('cosmeticRules.json › ladders › 3: never goes back a step');
    expect(issues).toContain('cosmeticRules.json › ladders › 4: must end on ambient');
    expect(issues).toContain('cosmeticRules.json › ladders › 5: needs 5 steps');
  });

  it('needs pool items at the pity and guarantee rarities, or they could never be met', () => {
    const bad = raw();
    const portal = (bad.portals as PortalRaw[])[0]!;
    portal.pool = (portal.pool as { itemId: string; rarity: string }[]).filter(
      (e) => e.rarity === 'common',
    );
    const issues = issuesFor(bad);
    expect(issues).toContain(
      'portals.json › [0] › pity › rarity: no pool item is legendary or better',
    );
    expect(issues).toContain(
      'portals.json › [0] › tenPullGuarantee: no pool item is rare or better',
    );
  });
});

describe('the starter table defines every table token', () => {
  it('so the screen shell never falls back to a missing value', async () => {
    const { SLOT_TOKENS } = await import('../src/data');
    const defined = Object.keys(loadContent().starterBySlot.table.levels[0]!.tokens);
    for (const key of SLOT_TOKENS.table) expect(defined).toContain(key);
  });

  it('and the starter tick item defines every tick token (outline, hurt and gain included)', async () => {
    const { SLOT_TOKENS } = await import('../src/data');
    const tokens = loadContent().starterBySlot.tick.levels[0]!.tokens;
    for (const key of SLOT_TOKENS.tick) expect(Object.keys(tokens)).toContain(key);
    expect(tokens['tick-outline']).toBe('#ffffff');
  });
});

describe('production data', () => {
  it('catches wrong cost resources and shared ids', () => {
    const bad = raw();
    const trees = bad.trees as { unlockCost: { resource: string }[] }[];
    trees[1]!.unlockCost[0]!.resource = 'copper_gem';
    const mines = bad.mines as { id: string; level: { cost: { resource: string } } }[];
    mines[0]!.level.cost.resource = 'oak_gem';
    mines[2]!.id = 'oak';
    const issues = issuesFor(bad);
    expect(issues).toContain(
      'trees.json › [1] › unlockCost › [0] › resource: "copper_gem" is mine_gem, expected tree_gem',
    );
    expect(issues).toContain(
      'mines.json › [0] › level › cost › resource: "oak_gem" is tree_gem, expected currency',
    );
    expect(issues).toContain('mines.json › [2] › id: "oak" is already a tree id');
  });

  it('has no plots, slots or expansions: only the harvest rules', () => {
    expect(Object.keys(production).sort()).toEqual(['harvest']);
  });

  it('needs a tree and a mine available from the start, since every unlocked kind produces', () => {
    const bad = raw();
    for (const t of bad.trees as { unlockCost: unknown[] }[]) {
      t.unlockCost = [{ resource: 'oak_gem', amount: '1' }];
    }
    for (const m of bad.mines as { unlockedByDungeon: string | null }[]) {
      m.unlockedByDungeon = 'mossy_cellar';
    }
    const issues = issuesFor(bad);
    expect(issues).toContain(
      'trees.json: at least one tree must be unlocked from the start (no unlockCost)',
    );
    expect(issues).toContain('mines.json: at least one mine must be available from the start');
  });

  it('rejects a cost curve that shrinks', () => {
    const bad = raw();
    (bad.mines as { level: { cost: { growth: string } } }[])[0]!.level.cost.growth = '0.9';
    expect(issuesFor(bad)).toContain(
      'mines.json › [0] › level › cost › growth: must be at least 1',
    );
  });
});

describe('the three loops (DESIGN.md §3)', () => {
  it('has Money, two crystals and a Frost Sigil that is a material', () => {
    const c = loadContent();
    const kind = (id: string) => c.resourceById.get(id)!.kind;
    expect(kind('money')).toBe('currency');
    expect(kind('summon_crystal')).toBe('crystal');
    expect(kind('glamour_crystal')).toBe('crystal');
    expect(kind('frost_sigil')).toBe('material');
    expect(c.resourceById.get('money')!.name).toBe('Money');
    expect(c.resourceById.get('money')!.startAmount!.gt(0)).toBe(true);
    expect(c.resourceById.get('moss_sigil')).toBeUndefined();
  });

  it('prices tree levels and mine levels in Money, and unlocks in gems', () => {
    const c = loadContent();
    for (const t of c.trees) expect(t.level.cost.resource).toBe('money');
    for (const m of c.mines) expect(m.level.cost.resource).toBe('money');
    for (const t of c.trees) {
      for (const cost of t.unlockCost)
        expect(c.resourceById.get(cost.resource)!.kind).toBe('tree_gem');
    }
  });

  it('makes the portals cost a crystal', () => {
    const c = loadContent();
    expect(c.allPortals.map((p) => [p.id, p.cost.resource])).toEqual([
      ['card_portal', 'summon_crystal'],
      ['wardrobe_gate', 'glamour_crystal'],
    ]);
  });

  it('refuses a dungeon that leaves out a crystal or drops a gem', () => {
    const bad = raw();
    const drops = (bad.dungeons as { drops: { currencies: { resource: string }[] } }[])[1]!.drops;
    drops.currencies = drops.currencies.filter((x) => x.resource !== 'glamour_crystal');
    drops.currencies.push({ resource: 'oak_gem', min: 1, max: 2 } as never);
    const issues = issuesFor(bad);
    expect(issues.join(String.fromCharCode(10))).toContain('"glamour_crystal" is not dropped');
    expect(issues.join(String.fromCharCode(10))).toContain(
      '"oak_gem" is tree_gem, expected currency or crystal',
    );
  });

  it('refuses card upgrades paid in Money or without both production loops', () => {
    const bad = raw();
    const rules = bad.cardRules as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    rules['starUp'].tiers.bronze[0].resource = 'money';
    rules['tierUp'].silver.mining = rules['tierUp'].silver.mining.filter(
      (x: { resource: string }) => x.resource !== 'moonwillow_gem',
    );
    const issues = issuesFor(bad).join(String.fromCharCode(10));
    expect(issues).toContain('card upgrades use gems and materials only');
    expect(issues).toContain('cardRules.json › tierUp › silver › mining: needs a tree_gem');
  });
});

describe('crit and milestone data (DESIGN.md §6, §4)', () => {
  it('rejects a crit chance above 1 and a crit multiplier below 1', () => {
    const bad = { ...combat, crit: { chance: 1.5, damage: '0.5' } };
    const issues = issuesFor(raw({ combat: bad }));
    expect(issues.some((i) => i.includes('crit › chance'))).toBe(true);
    expect(issues.some((i) => i.includes('crit › damage'))).toBe(true);
  });

  it('rejects milestones every 0 levels or with a multiplier below 1', () => {
    const bad = mines.map((m) => ({
      ...m,
      level: { ...m.level, milestones: { every: 0, multiplier: '0.5' } },
    }));
    const issues = issuesFor(raw({ mines: bad }));
    expect(issues.some((i) => i.includes('milestones › every'))).toBe(true);
    expect(issues.some((i) => i.includes('milestones › multiplier'))).toBe(true);
  });

  it('rejects upgrades that name unknown things or are permanent but unlocked by a reset level', () => {
    const input = raw();
    const list = (input as unknown as { upgrades: { upgrades: Record<string, unknown>[] } })
      .upgrades.upgrades;
    list[0]!['unlock'] = { kind: 'treeLevel', tree: 'redwood', level: 3 };
    list[1]!['permanent'] = true; // deep_roots is unlocked by an Oak level
    list[2]!['cost'] = { resource: 'oak_gem', amount: '5' };
    const found = issuesFor(input).join(' | ');
    expect(found).toMatch(/unknown tree "redwood"/);
    expect(found).toMatch(/cannot be permanent/);
    expect(found).toMatch(/cost › resource: must be "money"/);
  });
});
