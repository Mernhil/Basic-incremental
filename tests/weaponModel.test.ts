import { describe, expect, it } from 'vitest';
import { Decimal, cardInfo, newOwnedCard, type GameState, type OwnedCard } from '../src/game';
import { weaponView } from '../src/renderer/src/pages/weaponModel';
import { content, freshState } from './helpers';

/** The weapon panel's states (the review mockups, set 3 option D) on the real game data. */
function view(
  id: string,
  patch: Partial<OwnedCard>,
  money = '0',
  extra: Record<string, string> = {},
) {
  const state: GameState = freshState();
  state.cards.owned[id] = { ...newOwnedCard(), ...patch };
  state.resources['money'] = new Decimal(money);
  for (const [k, v] of Object.entries(extra)) state.resources[k] = new Decimal(v);
  return weaponView(content, cardInfo(state, content, id)!);
}

describe('weapon panel model', () => {
  it('is null for a card that is not owned', () => {
    const state = freshState();
    const unowned = content.cards.find((c) => !state.cards.owned[c.id])!;
    expect(weaponView(content, cardInfo(state, content, unowned.id)!)).toBeNull();
  });

  it('mid level: the ring fills with XP and the tier-up waits for the cap', () => {
    const w = view('dawnblade_regent', {
      tier: 'silver',
      stars: 3,
      level: 27,
      xp: new Decimal(60),
      starFill: 4,
    })!;
    expect(w.tierName).toBe('Silver');
    expect(w.level).toBe(27);
    expect(w.cap).toBe(content.cardRules.levelCaps.silver);
    expect(w.atCap).toBe(false);
    expect(w.xp).toBeGreaterThan(0);
    expect(w.xp).toBeLessThan(1);
    expect(w.xpNow).toBe('60');
    expect(w.xpNeed).toMatch(/^[\d.]+$/);
    expect(w.tierUp?.phase).toBe('leveling');
    expect(w.tierUp?.lead).toBe(`Reach Lv ${w.cap} to tier up. It costs:`);
    expect(w.tierUp?.action).toBe('Tier up to Gold');
    expect(w.tierUp?.ready).toBe(false);
  });

  it('shows the star bar with its copies and the star impact from the data', () => {
    const w = view('ember_squire', { stars: 3, starFill: 4 })!;
    const [, , mult3, mult4] = [1, ...content.cardRules.power.starMultiplier];
    expect(w.starBar?.fill).toBe(4);
    expect(w.starBar?.text).toBe(`4 / ${w.starBar?.need} copies to ★4`);
    expect(w.starBar?.impact).toBe(`×${mult3} → ×${mult4}`);
    expect(w.starBar?.gauge).toBeCloseTo(Math.min(1, 4 / w.starBar!.need));
  });

  it('has no star bar at six stars', () => {
    expect(view('ember_squire', { stars: 6 })!.starBar).toBeNull();
  });

  it('a new card starts at Wood', () => {
    const w = view('dawnblade_regent', {})!;
    expect(w.tier).toBe('wood');
    expect(w.tierName).toBe('Wood');
    expect(w.tierUp?.toName).toBe('Bronze');
  });

  it('max level, tier-up affordable: ready, with every price met', () => {
    const price = content.cardRules.tierUp.bronze.fighting;
    const extra = Object.fromEntries(price.map((p) => [p.resource, p.amount.toString()]));
    const w = view(
      'dawnblade_regent',
      { tier: 'bronze', level: content.cardRules.levelCaps.bronze, stars: 6 },
      '0',
      extra,
    )!;
    expect(w.atCap).toBe(true);
    expect(w.xp).toBe(1);
    expect(w.xpNow).toBe('');
    expect(w.tierUp?.phase).toBe('ready');
    expect(w.tierUp?.ready).toBe(true);
    expect(w.tierUp?.costs.map((c) => c.id)).toEqual(price.map((p) => p.resource));
    expect(w.tierUp?.costs.every((c) => c.met)).toBe(true);
    expect(w.tierUp?.lead).toBe('It costs:');
    expect(w.tierUp?.levelMet).toBe(true);
    expect(w.tierUp?.starsMet).toBe(true);
    expect(w.tierUp?.blocker).toBe('');
  });

  it('the tier-up button says why it cannot be taken: stars first, then level, then prices', () => {
    const cap = content.cardRules.levelCaps.silver;
    // below ★6: "Needs ★6", even at the level cap with the prices missing
    const stars = view('dawnblade_regent', { tier: 'silver', level: cap, stars: 3 })!;
    expect(stars.tierUp?.starsMet).toBe(false);
    expect(stars.tierUp?.blocker).toBe('Needs ★6');
    // ★6 but below the level cap
    const level = view('dawnblade_regent', { tier: 'silver', level: cap - 1, stars: 6 })!;
    expect(level.tierUp?.starsMet).toBe(true);
    expect(level.tierUp?.levelMet).toBe(false);
    expect(level.tierUp?.blocker).toBe(`Needs Lv ${cap}`);
    // ★6 at the cap: it counts what is short (a single price is named instead)
    const short = view('dawnblade_regent', { tier: 'silver', level: cap, stars: 6 }, '1')!;
    expect(short.tierUp?.blocker).toBe('Missing 4 items');
    expect(short.tierUp?.ready).toBe(false);
  });

  it('max level, not enough: short, and names what is missing', () => {
    const w = view(
      'dawnblade_regent',
      { tier: 'silver', level: content.cardRules.levelCaps.silver },
      '1',
    )!;
    expect(w.tierUp?.phase).toBe('short');
    expect(w.tierUp?.ready).toBe(false);
    expect(w.tierUp?.costs.some((c) => !c.met)).toBe(true);
    expect(w.tierUp?.missing).toMatch(/^Missing .*Money.*\.$/);
  });

  it('Gold to Prismatic costs Frost Sigils', () => {
    const w = view('dawnblade_regent', { tier: 'gold', level: 80 })!;
    expect(w.tierUp?.toName).toBe('Prismatic');
    expect(w.tierUp?.heirloom).toBe(false);
    expect(w.tierUp?.costs.map((c) => c.name)).toContain('Frost Sigil');
  });

  it('a card stops at the tier its rarity allows and says so: the end note', () => {
    const common = view('ember_squire', { tier: 'wood', level: 20 })!;
    expect(common.tierUp).toBeNull();
    expect(common.endNote).toBe('Wood is as far as this weapon goes.');
    const legendary = view('dawnblade_regent', { tier: 'prismatic', level: 100 })!;
    expect(legendary.tierUp).toBeNull();
    expect(legendary.endNote).toBe('Prismatic is as far as this weapon goes.');
  });

  it('Prismatic to Mythic (T6) is a normal tier-up for a mythic card, not a reveal', () => {
    const w = view('moonwood_dryad', { tier: 'prismatic', level: 100 })!;
    expect(w.tierUp?.toName).toBe('Mythic');
    expect(w.tierUp?.heirloom).toBe(false);
    expect(w.tierUp?.action).toBe('Tier up to Mythic');
    expect(w.endNote).toBeNull();
  });

  it('at Mythic the Heirloom is the next step', () => {
    const w = view('moonwood_dryad', { tier: 'mythic', level: 120 })!;
    expect(w.tierUp?.heirloom).toBe(true);
    expect(w.tierUp?.toTier).toBe('heirloom');
  });

  it('the Heirloom is the final form', () => {
    const w = view('moonwood_dryad', { tier: 'heirloom', level: 140, stars: 6 })!;
    expect(w.tier).toBe('heirloom');
    expect(w.tierUp).toBeNull();
    expect(w.endNote).toBe('Fully upgraded. Nothing left to unlock.');
  });
});
