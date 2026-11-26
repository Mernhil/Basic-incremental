import { describe, expect, it } from 'vitest';
import {
  ascend,
  ascensionMultiplier,
  ascensionPreview,
  buyStarlightItem,
  collectModifiers,
  createSaveText,
  Decimal,
  headStartPercent,
  keepsTraining,
  MIGRATIONS,
  openSlots,
  raidTriesLeft,
  readSave,
  skillUnlockCost,
  starlightBreakdown,
  statValue,
  type GameState,
} from '../src/game';
import { floorsContent as content, freshState, openAscension } from './helpers';

const STAR = content.prestige.currency;

/** A run that beat the Mossy Cellar's floors `floor` deep on Normal. */
function climbed(floor: number): GameState {
  const state = freshState();
  state.combat.floors['mossy_cellar'] = {
    difficulty: 'normal',
    autoChallenge: false,
    tiers: { normal: { floor, best: floor } },
  };
  return state;
}

describe('the permanent multiplier', () => {
  it('is x1 before any Ascension and grows faster with each one', () => {
    const m = (n: number) => ascensionMultiplier(content, n).toNumber();
    expect(m(0)).toBe(1);
    expect(m(1)).toBeGreaterThan(1.15);
    expect(m(2) - m(1)).toBeGreaterThan(m(1) - m(0));
    expect(m(5) - m(4)).toBeGreaterThan(m(2) - m(1));
  });

  it('multiplies all damage and all yields through the modifier pipeline', () => {
    const state = freshState();
    state.prestigeCount = 3;
    const mods = collectModifiers(state, content);
    const m = ascensionMultiplier(content, 3).toNumber();
    const plain = collectModifiers(freshState(), content);
    for (const stat of ['combat.damage', 'production.rate'] as const) {
      const ratio = statValue(stat, 10, mods)
        .div(statValue(stat, 10, plain))
        .toNumber();
      expect(ratio).toBeCloseTo(m, 6);
    }
  });
});

describe('Starlight from progress', () => {
  it('pays for floors climbed this run and for the boss, with no materials at all', () => {
    const state = climbed(9);
    const b = starlightBreakdown(state, content);
    expect(b.materials.toNumber()).toBe(0);
    expect(b.floors).toBe(9);
    expect(b.bosses).toBe(0);
    const boss = starlightBreakdown(climbed(10), content);
    expect(boss.bosses).toBe(1);
    expect(boss.progress.gt(b.progress.mul(10 / 9))).toBe(true);
  });

  it('counts only what the run climbed past where it started', () => {
    const state = climbed(10);
    state.prestige.runFloors['mossy_cellar:normal'] = 5;
    const b = starlightBreakdown(state, content);
    expect(b.floors).toBe(5);
    expect(b.bosses).toBe(1); // floor 10 is the Cellar's boss, beaten after the run began
  });

  it('pays more for a deeper dungeon and a harder difficulty', () => {
    const shallow = climbed(10);
    const deep = freshState();
    deep.combat.floors['ember_crypt'] = {
      difficulty: 'normal',
      autoChallenge: false,
      tiers: { normal: { floor: 10, best: 10 } },
    };
    const hard = freshState();
    hard.combat.floors['mossy_cellar'] = {
      difficulty: 'normal',
      autoChallenge: false,
      tiers: { hard: { floor: 10, best: 10 } },
    };
    const base = starlightBreakdown(shallow, content).progress;
    expect(starlightBreakdown(deep, content).progress.gt(base)).toBe(true);
    expect(starlightBreakdown(hard, content).progress.gt(base)).toBe(true);
  });

  it('makes pushing worth more than the same time farming: the preview adds both parts', () => {
    const state = climbed(25);
    state.mastery.harvested['oak_gem'] = new Decimal(1e12);
    openAscension(state);
    const p = ascensionPreview(state, content);
    expect(p.breakdown.progress.gt(0)).toBe(true);
    expect(p.breakdown.materials.gt(0)).toBe(true);
    expect(p.gain.toNumber()).toBe(
      Math.floor(p.breakdown.materials.add(p.breakdown.progress).toNumber()),
    );
  });
});

describe('the first Ascension', () => {
  it('opens after clearing Frostspire Vault, later ones are free', () => {
    const state = climbed(25);
    expect(ascensionPreview(state, content).locked).toBe(true);
    expect(ascensionPreview(state, content).canAscend).toBe(false);
    state.clearedDungeons.push('frostspire_vault');
    expect(ascensionPreview(state, content).canAscend).toBe(true);
    const later = climbed(25);
    later.prestigeCount = 1;
    expect(ascensionPreview(later, content).locked).toBe(false);
  });
});

describe('prizes, preview and the new run', () => {
  it('pays scrolls and Cores every time, and a guaranteed card at the listed counts', () => {
    const state = openAscension(climbed(25));
    state.prestigeCount = 3;
    const p = ascensionPreview(state, content);
    expect(p.ascension).toBe(4);
    expect(p.prizes.pull).toBe('mythic');
    const before = state.resources['summon_scroll']!.toNumber();
    const r = ascend(state, content);
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.resources['summon_scroll']!.toNumber()).toBe(
      before + content.prestige.prizes.summonScrolls.toNumber(),
    );
    expect(r.state.resources['moss_core']!.toNumber()).toBe(
      content.prestige.prizes.cores.toNumber(),
    );
    const gained = Object.keys(r.state.cards.owned).filter((id) => !state.cards.owned[id]);
    expect(gained).toHaveLength(1);
    expect(content.cardById.get(gained[0]!)!.tier).toBe('mythic');
  });

  it('gives an Heirloom at an Heirloom count', () => {
    const state = openAscension(climbed(25));
    state.prestigeCount = 7;
    expect(ascensionPreview(state, content).prizes.pull).toBe('heirloom');
    const r = ascend(state, content);
    if (!r.ok) throw new Error(r.reason);
    const gained = Object.keys(r.state.cards.owned).filter((id) => !state.cards.owned[id]);
    expect(gained).toHaveLength(1);
    expect(content.cardById.get(gained[0]!)!.heirloom).toBe(true);
  });

  it('shows the multiplier now and after, and a faster estimate that is their ratio', () => {
    const state = openAscension(climbed(25));
    state.prestigeCount = 2;
    const p = ascensionPreview(state, content);
    expect(p.multiplierNow.eq(ascensionMultiplier(content, 2))).toBe(true);
    expect(p.multiplierAfter.eq(ascensionMultiplier(content, 3))).toBe(true);
    expect(p.faster).toBeCloseTo(p.multiplierAfter.div(p.multiplierNow).toNumber(), 9);
    expect(p.faster).toBeGreaterThan(1);
  });

  it('records the floors the new run starts on, so the climb back is paid only once', () => {
    const state = openAscension(climbed(20));
    const r = ascend(state, content);
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.combat.floors['mossy_cellar']!.tiers.normal!.floor).toBe(10);
    expect(r.state.prestige.runFloors['mossy_cellar:normal']).toBe(10);
    expect(starlightBreakdown(r.state, content).floors).toBe(0);
  });
});

describe('the Starlight shop of unlocks', () => {
  const rich = (): GameState => {
    const s = freshState();
    s.resources[STAR] = new Decimal(1e6);
    return s;
  };

  it('sells unlocks, and Wider Grounds is the one yield item', () => {
    const ids = content.prestige.shop.map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(['second_hands', 'keep_training', 'head_start']));
    for (const gone of ['starlit_groves', 'starforged_edge', 'celestial_ward']) {
      expect(ids).not.toContain(gone);
    }
  });

  it('Wider Grounds raises every slot’s yield and adds no slot', () => {
    let state = rich();
    const slots = openSlots(state, content, 'forest');
    const base = statValue('production.rate', 1, collectModifiers(state, content), {
      job: 'logging',
    });
    for (let i = 0; i < 2; i += 1) {
      const r = buyStarlightItem(state, content, 'second_hands');
      if (!r.ok) throw new Error(r.reason);
      state = r.state;
    }
    const after = statValue('production.rate', 1, collectModifiers(state, content), {
      job: 'logging',
    });
    expect(after.div(base).toNumber()).toBeCloseTo(1.4, 9);
    expect(openSlots(state, content, 'forest')).toBe(slots);
  });

  it('Lasting Training keeps training levels through an Ascension, else they reset', () => {
    const state = openAscension(climbed(25));
    state.combat.training = { sharpen: 4 };
    const lost = ascend(state, content);
    if (!lost.ok) throw new Error(lost.reason);
    expect(lost.state.combat.training).toEqual({});
    state.prestige.shop['keep_training'] = 1;
    expect(keepsTraining(state, content)).toBe(true);
    const kept = ascend(state, content);
    if (!kept.ok) throw new Error(kept.reason);
    expect(kept.state.combat.training).toEqual({ sharpen: 4 });
  });

  it('Head Start starts the next run deeper than half of the best floor', () => {
    const state = openAscension(climbed(30));
    state.combat.floors['mossy_cellar']!.tiers['normal'] = { floor: 30, best: 30 };
    expect(headStartPercent(state, content)).toBe(50);
    state.prestige.shop['head_start'] = 2;
    expect(headStartPercent(state, content)).toBe(58);
    const r = ascend(state, content);
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.combat.floors['mossy_cellar']!.tiers.normal!.floor).toBe(17);
  });

  it('an Ascension turns auto-challenge on for every dungeon, and nothing in the shop gates it', () => {
    expect(content.prestige.shop.map((i) => i.id)).not.toContain('auto_push');
    const state = openAscension(climbed(25));
    state.combat.floors['mossy_cellar']!.autoChallenge = false;
    const r = ascend(state, content);
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.combat.floors['mossy_cellar']!.autoChallenge).toBe(true);
  });

  it('Faster Skill Unlocks lowers the Core price of opening a skill, 4% a level', () => {
    const base = skillUnlockCost(content, 'brass_vanguard')!;
    const state = freshState();
    state.prestige.shop['faster_skills'] = 5;
    const cheaper = skillUnlockCost(content, 'brass_vanguard', collectModifiers(state, content))!;
    expect(cheaper.resource).toBe(base.resource);
    expect(cheaper.amount).toBe(Math.round(base.amount * 0.8));
    expect(cheaper.amount).toBeLessThan(base.amount);
    expect(
      skillUnlockCost(content, 'brass_vanguard', collectModifiers(freshState(), content)),
    ).toEqual(base);
  });

  it('the third raid try adds one try a day on every boss', () => {
    const state = freshState();
    const base = raidTriesLeft(state, content, 'rootstone_titan', '2026-11-23');
    state.prestige.shop['third_raid_try'] = 1;
    expect(raidTriesLeft(state, content, 'rootstone_titan', '2026-11-23')).toBe(base + 1);
  });
});

describe('save format 46', () => {
  type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  it('pays the removed stat items back, keeps Wider Grounds levels, drops the extra slots', () => {
    const out = MIGRATIONS[45]!({
      resources: { starlight: '10' },
      camp: {
        level: 3,
        forest: [
          { material: 'oak', card: 'a' },
          { material: 'oak', card: 'b' },
          { material: 'oak', card: 'c' },
        ],
        cave: [{ material: 'copper_quarry', card: null }],
      },
      prestige: {
        runStart: {},
        shop: { second_hands: 2, starlit_groves: 3, starforged_edge: 1, long_night: 1 },
        starlightEarned: '5',
      },
    }) as Raw;
    // groves: 2 + 3 + 5 (ceil 2 x 1.5^i) = 10; edge: 3
    expect(out.resources.starlight).toBe('23');
    expect(out.prestige.shop).toEqual({ second_hands: 2, long_night: 1 });
    expect(out.prestige.runFloors).toEqual({});
    expect(out.camp.forest).toHaveLength(2); // camp level 3 opens two forest slots
  });

  it('loads at the current version with the new fields', () => {
    const text = createSaveText(freshState(), 1);
    expect(JSON.parse(text).version).toBe(47);
    expect(readSave(text, content).state.prestige.runFloors).toEqual({});
  });
});

describe('save format 47: auto-challenge is a default', () => {
  type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  const old = (shop: Record<string, number>): Record<string, unknown> => ({
    resources: { starlight: '4' },
    combat: {
      floors: {
        mossy_cellar: { difficulty: 'normal', autoChallenge: false, tiers: {} },
        ember_crypt: { difficulty: 'hard', autoChallenge: true, tiers: {} },
      },
    },
    prestige: { shop, runFloors: {} },
  });

  it('turns auto-challenge on for every dungeon and pays an Auto-push owner 6 Starlight', () => {
    const out = MIGRATIONS[46]!(old({ second_hands: 1, auto_push: 1 })) as Raw;
    expect(out.combat.floors.mossy_cellar.autoChallenge).toBe(true);
    expect(out.combat.floors.ember_crypt.autoChallenge).toBe(true);
    expect(out.prestige.shop).toEqual({ second_hands: 1 });
    expect(out.resources.starlight).toBe('10');
  });

  it('pays nothing to a save that never owned Auto-push, and does not mutate its input', () => {
    const input = old({ second_hands: 1 });
    const before = structuredClone(input);
    const out = MIGRATIONS[46]!(input) as Raw;
    expect(out.resources.starlight).toBe('4');
    expect(out.prestige.shop).toEqual({ second_hands: 1 });
    expect(input).toEqual(before);
  });

  it('a v46 save reads at the current version with auto-challenge on and no Auto-push', () => {
    const state = freshState();
    state.combat.floors['mossy_cellar'] = { difficulty: 'normal', autoChallenge: false, tiers: {} };
    state.prestige.shop['auto_push'] = 1;
    const text = JSON.parse(createSaveText(state, 1));
    text.version = 46;
    const back = readSave(JSON.stringify(text), content).state;
    expect(back.combat.floors['mossy_cellar']!.autoChallenge).toBe(true);
    expect(back.prestige.shop['auto_push']).toBeUndefined();
    expect(back.resources['starlight']!.toString()).toBe('6');
  });
});
