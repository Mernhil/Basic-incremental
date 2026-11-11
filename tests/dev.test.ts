import { describe, expect, it } from 'vitest';
import {
  DEV_CHEATS_MARKER,
  devAddAccountXp,
  devAdvanceTime,
  devGrant,
  devGrantCosmetic,
  devOptions,
  devSetCardRank,
  devSetDungeonCleared,
} from '../src/game/dev';
import { isProducerUnlocked } from '../src/game';
import { content, freshState } from './helpers';

describe('dev cheats (dev builds only)', () => {
  it('grants an amount of a resource without touching the input state', () => {
    const state = freshState();
    const result = devGrant(state, content, { resource: 'summon_scroll', amount: 250 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // a new game starts with one Summon Scroll, its one free pull (DESIGN.md §3)
    expect(result.state.resources['summon_scroll']!.toNumber()).toBe(251);
    expect(state.resources['summon_scroll']!.toNumber()).toBe(1);
  });

  it('accepts a decimal string amount and refuses unknown resources or bad amounts', () => {
    const big = devGrant(freshState(), content, { resource: 'copper_gem', amount: '1e30' });
    expect(big.ok && big.state.resources['copper_gem']!.toString()).toBe('1e30');
    expect(devGrant(freshState(), content, { resource: 'nope', amount: 1 })).toEqual({
      ok: false,
      reason: 'unknown',
    });
    expect(devGrant(freshState(), content, { resource: 'oak_gem', amount: 'x' }).ok).toBe(false);
  });

  it('grants every resource at once with resource "all"', () => {
    const before = freshState();
    const result = devGrant(before, content, { resource: 'all', amount: 5 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const r of content.resources) {
      expect(result.state.resources[r.id]!.toNumber()).toBe(before.resources[r.id]!.toNumber() + 5);
    }
  });

  it('marks a dungeon cleared with its unlocks, and can un-clear it', () => {
    const result = devSetDungeonCleared(freshState(), content, 'mossy_cellar', true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.clearedDungeons).toContain('mossy_cellar');
    expect(result.state.combat.stageKills['mossy_cellar:normal:1']).toBeGreaterThanOrEqual(1);
    expect(isProducerUnlocked(result.state, content, 'mining', 'iron_deeps')).toBe(true);
    const undone = devSetDungeonCleared(result.state, content, 'mossy_cellar', false);
    expect(undone.ok && undone.state.clearedDungeons).toEqual([]);
    expect(devSetDungeonCleared(freshState(), content, 'nowhere', true).ok).toBe(false);
  });

  it('clears the Glimmer Trial with a best score of 100%', () => {
    const result = devSetDungeonCleared(freshState(), content, 'glimmer_trial', true);
    expect(result.ok && result.state.combat.trialBest['glimmer_trial']).toBe(1);
  });

  it('sets a card rank and level, owning the card if needed, level clamped to the cap', () => {
    const result = devSetCardRank(freshState(), content, 'dawnblade_regent', {
      tier: 'gold',
      stars: 6,
      level: 999,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const owned = result.state.cards.owned['dawnblade_regent']!;
    expect([owned.tier, owned.stars, owned.level]).toEqual(['gold', 6, 80]);
    expect(devSetCardRank(freshState(), content, 'nobody', { tier: 'gold', stars: 1 }).ok).toBe(
      false,
    );
    expect(
      devSetCardRank(freshState(), content, 'ember_squire', { tier: 'gold', stars: 7 }).ok,
    ).toBe(false);
  });

  it('sets the Heirloom tier now that every item type has it open', () => {
    const heirloom = devSetCardRank(freshState(), content, 'core_titan', {
      tier: 'heirloom',
      stars: 1,
    });
    expect(heirloom.ok).toBe(true);
    const mythic = devSetCardRank(freshState(), content, 'core_titan', {
      tier: 'mythic',
      stars: 1,
    });
    expect(mythic.ok).toBe(true);
  });

  it('adds account XP and settles the level-ups with their track rewards', () => {
    const result = devAddAccountXp(freshState(), content, 1e6);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.account.level).toBeGreaterThan(10);
    // Levels 5, 10 and 15 on the track give 3 Summon Scrolls in all, on top of the free pull.
    expect(result.state.resources['summon_scroll']!.toNumber()).toBeGreaterThanOrEqual(4);
  });

  it('grants a cosmetic (new, then a copy)', () => {
    const once = devGrantCosmetic(freshState(), content, 'holo_hex');
    expect(once.ok && once.state.cosmetics.owned['holo_hex']).toEqual({ level: 1, copies: 0 });
    if (!once.ok) return;
    const twice = devGrantCosmetic(once.state, content, 'holo_hex');
    expect(twice.ok && twice.state.cosmetics.owned['holo_hex']!.copies).toBe(1);
    expect(devGrantCosmetic(freshState(), content, 'nothing').ok).toBe(false);
  });

  it('advances time with the real game rules', () => {
    const result = devAdvanceTime(freshState(), content, 60);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.stats.playTimeMs).toBe(60_000);
    expect(result.state.resources['oak_gem']!.toNumber()).toBeGreaterThan(0);
    expect(devAdvanceTime(freshState(), content, -1).ok).toBe(false);
  });

  it('lists what a dev panel can pick from', () => {
    const options = devOptions(content);
    expect(options.resources.map((r) => r.id)).toContain('starlight');
    expect(options.dungeons.map((d) => d.id)).toEqual([
      'mossy_cellar',
      'ember_crypt',
      'frostspire_vault',
      'thunderpeak_aerie',
      'sunken_sanctum',
      'void_hollow',
      'glimmer_trial',
    ]);
    expect(options.cards).toHaveLength(content.cards.length);
    expect(options.tiers).toEqual([
      'wood',
      'bronze',
      'silver',
      'gold',
      'prismatic',
      'mythic',
      'heirloom',
    ]);
    expect(options.cosmetics.length).toBeGreaterThan(0);
  });

  it('carries a marker string the release bundle check looks for', () => {
    expect(DEV_CHEATS_MARKER).toMatch(/^bi-dev-cheats/);
  });
});
