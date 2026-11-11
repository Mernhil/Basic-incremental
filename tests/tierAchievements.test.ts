import { describe, expect, it } from 'vitest';
import { achievementList, initialProgress } from '../src/game';
import { content, freshState } from './helpers';

/** The achievements of each difficulty tier (DESIGN.md §6 Difficulty tiers). */
function unlockedIds(state: ReturnType<typeof freshState>): string[] {
  return achievementList(state, content)
    .filter((a) => a.value >= a.target)
    .map((a) => a.achievement.id);
}

function setBest(
  s: ReturnType<typeof freshState>,
  dungeonId: string,
  tier: 'hard' | 'nightmare' | 'endless',
  best: number,
): void {
  const p = s.combat.floors[dungeonId] ?? initialProgress();
  p.tiers[tier] = { floor: 1, best };
  s.combat.floors[dungeonId] = p;
}

describe('tier achievements', () => {
  it('are locked on a fresh game', () => {
    const ids = unlockedIds(freshState());
    for (const id of ['hard_won', 'nightmare_won', 'deep_diver', 'hard_starred']) {
      expect(ids).not.toContain(id);
    }
  });

  it('unlock when a last-floor boss falls on that tier, every dungeon for the "everywhere" ones', () => {
    const s = freshState();
    setBest(s, content.dungeons[0]!.id, 'hard', content.dungeons[0]!.floors);
    expect(unlockedIds(s)).toContain('hard_won');
    expect(unlockedIds(s)).not.toContain('hard_everywhere');
    expect(unlockedIds(s)).not.toContain('nightmare_won');
    for (const d of content.dungeons) setBest(s, d.id, 'hard', d.floors);
    expect(unlockedIds(s)).toContain('hard_everywhere');
  });

  it('count the deepest endless depth in any dungeon', () => {
    const s = freshState();
    setBest(s, content.dungeons[2]!.id, 'endless', 12);
    expect(unlockedIds(s)).toContain('deep_diver');
    expect(unlockedIds(s)).not.toContain('abyss_walker');
  });
});
