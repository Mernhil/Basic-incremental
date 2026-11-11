import { describe, expect, it } from 'vitest';
import {
  cardEnhancements,
  chooseEnhancement,
  collectModifiers,
  resetEnhancements,
  type GameState,
} from '../src/game';
import { RANK_TIERS } from '../src/data';
import { content, freshState } from './helpers';

const CARD = 'ember_squire';
const e = content.enhancements;
const optionsOf = (id: string) => e.cards[id]!;
const stateAt = (level: number, tier: (typeof RANK_TIERS)[number] = 'wood'): GameState => {
  const s = freshState();
  s.cards.owned[CARD]!.level = level;
  s.cards.owned[CARD]!.tier = tier;
  return s;
};

describe('Enhancements earlier and wider (DESIGN.md §5)', () => {
  it('open at Wood ★1, so a Common (whose only tier is Wood) gets some', () => {
    expect(e.unlockRank).toEqual({ tier: 'wood', stars: 1 });
    for (const tier of RANK_TIERS) expect(e.budget[tier], tier).toBeGreaterThan(0);
    const info = cardEnhancements(freshState(), content, CARD)!;
    expect(info.unlocked).toBe(true);
    expect(info.budget).toBe(e.budget.wood);
  });

  it('the budget grows with the tier', () => {
    for (let i = 1; i < RANK_TIERS.length; i++) {
      expect(e.budget[RANK_TIERS[i]!]).toBeGreaterThan(e.budget[RANK_TIERS[i - 1]!]);
    }
  });

  it('every card has five open options and one milestone option per milestone of the top tier', () => {
    expect(e.milestoneEvery).toBe(20);
    const top = content.cardRules.levelCaps.heirloom;
    for (const card of content.cards) {
      const options = optionsOf(card.id);
      expect(
        options.filter((o) => o.milestone === 0),
        card.id,
      ).toHaveLength(5);
      const milestones = options.filter((o) => o.milestone > 0).map((o) => o.milestone);
      expect(milestones, card.id).toEqual(
        Array.from({ length: Math.floor(top / e.milestoneEvery) }, (_, i) => i + 1),
      );
    }
  });

  it('milestone options differ per job template, and a worker keeps its own job', () => {
    const stats = (id: string) =>
      optionsOf(id)
        .filter((o) => o.milestone > 0)
        .map((o) => o.modifiers[0]!.stat);
    const [f, l, m] = ['fighting', 'logging', 'mining'].map((job) =>
      stats(content.cards.find((c) => c.job === job)!.id),
    );
    expect(f).not.toEqual(l);
    expect(l).toEqual(m);
    for (const card of content.cards.filter((c) => c.job !== 'fighting')) {
      for (const o of optionsOf(card.id).filter((x) => x.milestone > 0)) {
        expect(
          o.modifiers.every((x) => x.scope?.job === card.job),
          `${card.id} ${o.id}`,
        ).toBe(true);
      }
    }
  });
});

describe('Milestone options', () => {
  const milestone1 = () => optionsOf(CARD).find((o) => o.milestone === 1)!;

  it('are locked below their level and show the level that opens them', () => {
    const info = cardEnhancements(stateAt(19, 'gold'), content, CARD)!;
    const row = info.options.find((o) => o.option.id === milestone1().id)!;
    expect(row.unlockLevel).toBe(20);
    expect(row.open).toBe(false);
    expect(row.canChoose).toBe(false);
    const open = cardEnhancements(stateAt(20, 'gold'), content, CARD)!;
    expect(open.options.find((o) => o.option.id === milestone1().id)!.open).toBe(true);
    expect(open.options.find((o) => o.option.milestone === 0)!.unlockLevel).toBe(0);
  });

  it('cannot be chosen before their level, and can after', () => {
    expect(chooseEnhancement(stateAt(19, 'gold'), content, CARD, milestone1().id)).toEqual({
      ok: false,
      reason: 'level',
    });
    expect(chooseEnhancement(stateAt(20, 'gold'), content, CARD, milestone1().id).ok).toBe(true);
  });

  it('a chosen milestone option acts while the card leads; a respec is free and clears it', () => {
    const chosen = chooseEnhancement(stateAt(20, 'gold'), content, CARD, milestone1().id);
    if (!chosen.ok) throw new Error(chosen.reason);
    const mods = collectModifiers(chosen.state, content).filter(
      (m) => m.source.kind === 'enhancement',
    );
    expect(mods.map((m) => m.source.id)).toEqual([`${CARD}:${milestone1().id}`]);
    const reset = resetEnhancements(chosen.state, content, CARD);
    expect(reset.cards.owned[CARD]!.enhancements).toEqual([]);
    expect(reset.resources).toEqual(chosen.state.resources);
  });

  it('are ignored when a saved option sits above the card level', () => {
    const s = stateAt(20, 'gold');
    s.cards.owned[CARD]!.enhancements = [milestone1().id];
    s.cards.owned[CARD]!.level = 10;
    expect(collectModifiers(s, content).filter((m) => m.source.kind === 'enhancement')).toEqual([]);
  });

  it('count their cost in the spent points', () => {
    const chosen = chooseEnhancement(stateAt(20, 'gold'), content, CARD, milestone1().id);
    if (!chosen.ok) throw new Error(chosen.reason);
    expect(cardEnhancements(chosen.state, content, CARD)!.spent).toBe(milestone1().cost);
  });
});
