import { describe, expect, it } from 'vitest';
import type { Goal, TierUp } from '../src/game';
import { goalRows, medalTip, tierUpText } from '../src/renderer/src/pages/progressionModel';
import { content } from './helpers';

describe('tier-up moments', () => {
  it('names every kind of tier-up with its metal', () => {
    const gem = content.resources.find((r) => r.gem)!;
    const dungeon = content.dungeons[0]!;
    const line = content.combat.damageUpgrades[0]!;
    const cases: Array<[TierUp, RegExp]> = [
      [{ kind: 'gem_mastery', id: gem.id, from: 0, to: 1, metal: 'bronze' }, /mastery: Bronze/],
      [{ kind: 'boss_mastery', id: dungeon.id, from: 1, to: 2, metal: 'silver' }, /medal: Silver/],
      [{ kind: 'damage_milestone', id: line.id, from: 1, to: 2, metal: 'silver' }, /forged/],
      [{ kind: 'tile_stage', id: content.trees[0]!.id, from: 0, to: 1, metal: 'bronze' }, /grew/],
    ];
    for (const [u, title] of cases) expect(tierUpText(u, content).title).toMatch(title);
  });

  it('names the unique item of an evolution', () => {
    const card = content.cards.find((c) => c.evolution)!;
    const text = tierUpText(
      { kind: 'evolution', id: card.id, from: 0, to: 1, metal: 'gold' },
      content,
    );
    expect(text.title).toBe(`${card.name} evolved!`);
    expect(text.detail).toMatch(/^It now wields /);
  });
});

describe('quest scroll', () => {
  const goal = (over: Partial<Goal>): Goal => ({
    id: 'clear_dungeon:x',
    kind: 'clear_dungeon',
    targetId: 'x',
    title: 'Clear X',
    progress: 0.4,
    etaSeconds: 720,
    page: 'dungeons',
    ...over,
  });

  it('turns goals into rows with an estimate', () => {
    const [row] = goalRows([goal({})]);
    expect(row).toMatchObject({ title: 'Clear X', progress: 0.4, done: false, page: 'dungeons' });
    expect(row!.eta).toBe('~12m');
  });

  it('marks goals that can be done now and leaves unknown estimates empty', () => {
    const rows = goalRows([goal({ etaSeconds: 0, progress: 1.3 }), goal({ etaSeconds: null })]);
    expect(rows[0]).toMatchObject({ done: true, eta: 'ready', progress: 1 });
    expect(rows[1]!.eta).toBe('');
  });
});

describe('medal tip', () => {
  it('says the medal and the kills to the next one', () => {
    expect(
      medalTip({ tier: 1, metal: 'bronze', nextThreshold: 100, trial: false, value: 42 }),
    ).toBe('Bronze medal. 42 of 100 kills to the next');
    expect(
      medalTip({ tier: 0, metal: 'stone', nextThreshold: 10, trial: false, value: 3 }),
    ).toMatch(/^No medal yet/);
    expect(
      medalTip({ tier: 4, metal: 'prismatic', nextThreshold: null, trial: false, value: 1 }),
    ).toBe('Prismatic medal');
  });
});
