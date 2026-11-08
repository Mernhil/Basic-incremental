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
    const w = view('ember_squire', {
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

  it('max level, tier-up affordable: ready, with every price met', () => {
    const price = content.cardRules.tierUp.bronze.fighting;
    const extra = Object.fromEntries(price.map((p) => [p.resource, p.amount.toString()]));
    const w = view('ember_squire', { tier: 'bronze', level: 20, stars: 6 }, '0', extra)!;
    expect(w.atCap).toBe(true);
    expect(w.xp).toBe(1);
    expect(w.xpNow).toBe('');
    expect(w.tierUp?.phase).toBe('ready');
    expect(w.tierUp?.ready).toBe(true);
    expect(w.tierUp?.costs.map((c) => c.id)).toEqual(price.map((p) => p.resource));
    expect(w.tierUp?.costs.every((c) => c.met)).toBe(true);
    expect(w.tierUp?.lead).toBe('It costs:');
  });

  it('max level, not enough: short, and names what is missing', () => {
    const w = view('ember_squire', { tier: 'silver', level: 40 }, '1')!;
    expect(w.tierUp?.phase).toBe('short');
    expect(w.tierUp?.ready).toBe(false);
    expect(w.tierUp?.costs.some((c) => !c.met)).toBe(true);
    expect(w.tierUp?.missing).toMatch(/^Missing .*Money.*\.$/);
  });

  it('Gold to Prismatic costs Frost Sigils', () => {
    const w = view('ember_squire', { tier: 'gold', level: 60 })!;
    expect(w.tierUp?.toName).toBe('Prismatic');
    expect(w.tierUp?.costs.map((c) => c.name)).toContain('Frost Sigil');
  });

  it('Prismatic to Unique reveals the unique weapon', () => {
    const w = view('ember_squire', { tier: 'prismatic', level: 80 })!;
    expect(w.tierUp?.unique).toBe(true);
    expect(w.tierUp?.action).toBe('Reveal Flameblade');
    expect(w.endNote).toBeNull();
  });

  it('a weapon without a unique version stops at Prismatic and says so', () => {
    const w = view('shield_warden', { tier: 'prismatic', level: 80 })!;
    expect(w.tierUp).toBeNull();
    expect(w.endNote).toBe(
      'Prismatic is the top tier for Bulwark until its unique weapon is drawn.',
    );
  });

  it('the unique weapon is the final form', () => {
    const w = view('ember_squire', { tier: 'unique', level: 100, stars: 6 })!;
    expect(w.weapon).toBe('Flameblade');
    expect(w.tierUp).toBeNull();
    expect(w.endNote).toBe('Fully upgraded. Nothing left to unlock.');
  });
});
