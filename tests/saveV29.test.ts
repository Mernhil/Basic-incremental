import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CURRENT_SAVE_VERSION,
  Decimal,
  MIGRATIONS,
  V29_SCALE,
  ascensionPreview,
  createSaveText,
  readSave,
} from '../src/game';
import { content } from './helpers';

/** Save format 29: readable numbers (DESIGN.md §14 Readable numbers). */
/** A raw save state of any format, read as loose JSON. */
type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const fixture = (name: string): string =>
  readFileSync(resolve(__dirname, 'fixtures/saves', name), 'utf8');
const FIXTURES = [
  'v23-dev-tools.save.txt',
  'v25-dev-tools.save.txt',
  'v26-0.6.0.save.txt',
  'v27-removed-cosmetics.save.txt',
  'v28-late-game.save.txt',
];
const late = JSON.parse(fixture('v28-late-game.save.txt')) as {
  version: number;
  state: Raw;
};

/** The level prices of format 28 (a snapshot): base × growth^level, before modifiers. */
const OLD_CURVES: Record<string, [number, number]> = {
  oak: [200, 1.13],
  ironbark: [2500, 1.14],
  moonwillow: [30000, 1.15],
  copper_quarry: [150, 1.13],
  iron_deeps: [2000, 1.14],
  crystal_grotto: [25000, 1.15],
};
const levelOf = (state: Raw, id: string): number =>
  state.production.treeLevels[id] ?? state.production.mineLevels[id] ?? 0;
const newCurve = (id: string) => (content.treeById.get(id) ?? content.mineById.get(id))!.level.cost;

describe('v28 -> v29 (readable numbers)', () => {
  it('is the Castle Stone shell format (31), and the late-game fixture is format 28', () => {
    expect(CURRENT_SAVE_VERSION).toBe(31);
    expect(late.version).toBe(28);
  });

  it('loads every fixture at the current format and saves and loads to the same state', () => {
    for (const name of FIXTURES) {
      const { state } = readSave(fixture(name), content);
      const text = createSaveText(state, 1);
      expect(JSON.parse(text).version, name).toBe(CURRENT_SAVE_VERSION);
      expect(readSave(text, content).state, name).toEqual(state);
      for (const [id, amount] of Object.entries(state.resources))
        expect(amount.isFinite() && amount.gte(0), `${name} ${id}`).toBe(true);
    }
  });

  it('moves Money the way the level prices moved: whoever could afford the next level still can', () => {
    const migrated = MIGRATIONS[28]!(late.state) as Raw;
    const oldMoney = Number(late.state.resources.money);
    const newMoney = Number(migrated.resources.money);
    expect(newMoney).toBeCloseTo(V29_SCALE.moneyFactor * Math.pow(oldMoney, V29_SCALE.k), -1);
    for (const [id, [base, growth]] of Object.entries(OLD_CURVES)) {
      const level = levelOf(late.state, id);
      const oldPrice = base * Math.pow(growth, level);
      const curve = newCurve(id);
      const newPrice = curve.base.mul(curve.growth.pow(level)).toNumber();
      // the new price is the old one through the same map (the data rounds its base)
      const mapped = V29_SCALE.moneyFactor * Math.pow(oldPrice, V29_SCALE.k);
      expect(Math.abs(Math.log(newPrice / mapped)), id).toBeLessThan(0.08);
      // affordability keeps its side unless the two were within the rounding
      if (Math.abs(Math.log(oldMoney / oldPrice)) > 0.1)
        expect(newMoney >= newPrice, id).toBe(oldMoney >= oldPrice);
    }
  });

  it('maps gems held and harvested with the gem map, so mastery tiers stay or rise by one', () => {
    const migrated = MIGRATIONS[28]!(late.state) as Raw;
    const map = (x: number): number =>
      V29_SCALE.gemAnchor * Math.pow(x / V29_SCALE.gemAnchor, V29_SCALE.gem);
    for (const gem of ['oak_gem', 'copper_gem', 'grotto_gem']) {
      const before = Number(late.state.resources[gem]);
      if (before > 0) expect(Number(migrated.resources[gem]) / map(before)).toBeCloseTo(1, 6);
      // the lifetime harvest is the gem map's, or more where the run's Starlight needs it
      const harvested = Number(late.state.mastery.harvested[gem] ?? 0);
      if (harvested > 0)
        expect(Number(migrated.mastery.harvested[gem]) / map(harvested)).toBeGreaterThan(1 - 1e-9);
    }
    const { state } = readSave(fixture('v28-late-game.save.txt'), content);
    for (const [gem, tier] of Object.entries(late.state.mastery.gemTiers) as [string, number][]) {
      expect(state.mastery.gemTiers[gem]!, gem).toBeGreaterThanOrEqual(tier);
      expect(state.mastery.gemTiers[gem]!, gem).toBeLessThanOrEqual(tier + 1);
    }
  });

  it('keeps the Starlight the run would give at an Ascension', () => {
    const old = V29_SCALE.starlightOld;
    const tier: Record<string, number> = {
      oak_gem: 1,
      copper_gem: 1,
      ironbark_gem: 2,
      iron_gem: 2,
      moonwillow_gem: 3,
      grotto_gem: 3,
    };
    let points = 0;
    for (const [gem, total] of Object.entries(late.state.mastery.harvested) as [string, string][]) {
      const run = Math.max(0, Number(total) - Number(late.state.prestige.runStart[gem] ?? 0));
      points += run * old.weights[(tier[gem] ?? 1) - 1]!;
    }
    const before = Math.floor(Math.pow(points / old.divisor, old.exponent));
    const { state } = readSave(fixture('v28-late-game.save.txt'), content);
    const after = ascensionPreview(state, content).gain.toNumber();
    expect(before).toBeGreaterThan(0);
    expect(Math.abs(after - before)).toBeLessThanOrEqual(1);
  });

  it('keeps the run start below the harvest, so the run keeps its own gems', () => {
    const migrated = MIGRATIONS[28]!(late.state) as Raw;
    for (const [gem, start] of Object.entries(migrated.prestige.runStart)) {
      const total = new Decimal(migrated.mastery.harvested[gem] ?? 0);
      expect(new Decimal(start as string).lte(total), gem).toBe(true);
    }
  });

  it('keeps levels, cards, floors and counts, keeps the share of XP and depth, and starts the fight fresh', () => {
    const migrated = MIGRATIONS[28]!(late.state) as Raw;
    for (const key of ['cards', 'clearedDungeons', 'stats', 'cosmetics', 'portals'] as const)
      expect(migrated[key], key).toEqual(late.state[key]);
    expect(migrated.production.treeLevels).toEqual(late.state.production.treeLevels);
    expect(migrated.production.mineLevels).toEqual(late.state.production.mineLevels);
    expect(migrated.combat.floors).toEqual(late.state.combat.floors);
    expect(migrated.combat.training).toEqual(late.state.combat.training);
    for (const id of ['moss_core', 'frost_sigil', 'summon_scroll', 'star_dust', 'starlight'])
      expect(migrated.resources[id], id).toEqual(late.state.resources[id]);
    expect(migrated.account.level).toBe(late.state.account.level);
    const share = Math.pow(
      V29_SCALE.accountGrowthNew / V29_SCALE.accountGrowthOld,
      late.state.account.level - 1,
    );
    expect(Number(migrated.account.xp)).toBeCloseTo(Number(late.state.account.xp) * share, 0);
    for (const [id, d] of Object.entries(late.state.production.depth) as [string, Raw][]) {
      const s = Math.pow(V29_SCALE.hardnessGrowthNew / V29_SCALE.hardnessGrowthOld, d.layer - 1);
      expect(migrated.production.depth[id].layer).toBe(d.layer);
      expect(Number(migrated.production.depth[id].progress)).toBeCloseTo(Number(d.progress) * s, 3);
    }
    expect(migrated.bossHp).toBeNull();
    expect(migrated.combat.cardDamage).toEqual({});
    expect(migrated.combat.cardsOut).toEqual([]);
  });

  it('loads and keeps a Glimmer Trial best score over 100% (the score has no cap)', () => {
    // a format 28 save as 0.7.x wrote it after a 617% attempt (it used to fall back to the backup)
    const old = JSON.parse(fixture('v28-late-game.save.txt'));
    old.state.combat.trialBest = { glimmer_trial: 6.17 };
    const { state } = readSave(JSON.stringify(old), content);
    expect(state.combat.trialBest['glimmer_trial']).toBe(6.17);
    // and saved again at the current format
    const again = readSave(createSaveText(state, 1), content).state;
    expect(again.combat.trialBest['glimmer_trial']).toBe(6.17);
  });

  it('leaves an empty or fresh save loadable', () => {
    const fresh = JSON.parse(fixture('v27-removed-cosmetics.save.txt'));
    const at28 = MIGRATIONS[27]!(fresh.state);
    const at29 = MIGRATIONS[28]!(at28) as Raw;
    expect(Number(at29.resources.money)).toBeGreaterThan(0);
    expect(at29.bossHp).toBeNull();
  });
});
