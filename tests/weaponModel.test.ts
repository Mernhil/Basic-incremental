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

  it('mid level: the ring fills with XP; there is no tier-up step', () => {
    const w = view('silver_cavalier', {
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
    expect('tierUp' in w).toBe(false);
    expect(w.endNote).toBe('A Silver weapon, for good. Weapons of other tiers come from Summon.');
  });

  it('shows the star bar with its copies and the star impact from the data', () => {
    const w = view('ember_squire', { stars: 3, starFill: 4 })!;
    const [, , mult3, mult4] = [1, ...content.cardRules.power.starMultiplier];
    expect(w.starBar?.fill).toBe(4);
    // A star costs fractions of a copy, so the bar reads as a share of the next star.
    expect(w.starBar?.text).toBe('100% to ★4');
    expect(w.starBar?.title).toBe(`4 / ${w.starBar?.need} copies to ★4`);
    expect(w.starBar?.impact).toBe(`×${mult3} → ×${mult4}`);
    expect(w.starBar?.gauge).toBeCloseTo(Math.min(1, 4 / w.starBar!.need));
  });

  it('shows a part-filled bar as a percentage, exact numbers in the title', () => {
    const w = view('ember_squire', { stars: 1, starFill: 0.05 })!;
    const need = w.starBar!.need;
    expect(w.starBar?.text).toBe(`${Math.floor((0.05 / need) * 100)}% to ★2`);
    expect(w.starBar?.title).toBe(`0.05 / ${+need.toFixed(3)} copies to ★2`);
  });

  it('has no star bar at six stars', () => {
    expect(view('ember_squire', { stars: 6 })!.starBar).toBeNull();
  });

  it('a card shows its own tier and weapon, at the cap too', () => {
    const wood = view('ember_squire', { tier: 'wood', level: 20, stars: 6 })!;
    expect(wood.tier).toBe('wood');
    expect(wood.weapon).toBe('Wooden Sword');
    expect(wood.atCap).toBe(true);
    expect(wood.xp).toBe(1);
    expect(wood.endNote).toBe('A Wood weapon, for good. Weapons of other tiers come from Summon.');
    const prismatic = view('dawnblade_regent', { tier: 'prismatic', level: 100 })!;
    expect(prismatic.tierName).toBe('Prismatic');
    expect(prismatic.weapon).toBe('Prismatic Greatsword');
    expect(prismatic.endNote).toBe(
      'A Prismatic weapon, for good. Weapons of other tiers come from Summon.',
    );
  });

  it('a T6 card is named by its side', () => {
    const w = view('moonwood_dryad', { tier: 'mythic', level: 120, stars: 6 })!;
    expect(w.tierName).toBe('Mythic');
    expect(w.endNote).toBe('A Mythic weapon, for good. Weapons of other tiers come from Summon.');
    expect(view('core_titan', { tier: 'mythic', level: 120 })!.tierName).toBe('Void');
  });

  it('an Heirloom card has no tier-up; its stars come from the gate', () => {
    const w = view('heartdelver', { tier: 'heirloom', level: 140, stars: 3 })!;
    expect(w.tier).toBe('heirloom');
    expect(w.endNote).toBe('Its stars come from its own shards in the Heirloom Gate.');
    const max = view('heartdelver', { tier: 'heirloom', level: 140, stars: 6 })!;
    expect(max.endNote).toBe('Fully upgraded. Nothing left to unlock.');
  });
});
