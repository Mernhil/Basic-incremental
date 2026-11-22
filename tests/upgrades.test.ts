import { describe, expect, it } from 'vitest';
import {
  bossMaxHp,
  advance,
  ascend,
  collectModifiers,
  createSaveText,
  Decimal,
  lifetimeMoney,
  lineBadges,
  lineEffect,
  milestoneStatus,
  nextLineStep,
  perkModifiers,
  pickPerk,
  readSave,
  waitingPicks,
  type GameState,
} from '../src/game';
import { bareState, constantRng, content, freshState, withDps } from './helpers';

const NOW = 1_700_000_000_000;
const ms = (id: string) => content.perkMilestoneById.get(id)!;
const SHARPEN = { kind: 'training', id: 'sharpen' } as const;

function withSharpen(state: GameState, level: number): GameState {
  state.combat.training['sharpen'] = level;
  return state;
}

describe('milestone pick content (DESIGN.md §4 Milestone picks)', () => {
  it('gives every Training line its picks at 5/15/30, and no other line has any', () => {
    const levels = (id: string) =>
      content.perks.milestones
        .filter((m) => m.line.kind === 'training' && m.line.id === id)
        .map((m) => m.level);
    for (const t of content.training) expect(levels(t.id)).toEqual([5, 15, 30]);
    expect(content.perks.milestones.every((m) => m.line.kind === 'training')).toBe(true);
  });

  it('offers two different perks at every milestone', () => {
    for (const m of content.perks.milestones) {
      expect(m.options[0].id).not.toBe(m.options[1].id);
    }
  });
});

describe('picks', () => {
  it('a milestone waits once its line reaches the level, and nothing applies before a pick', () => {
    const state = withSharpen(freshState(), 4);
    expect(milestoneStatus(state, ms('sharpen_5'))).toBe('ahead');
    expect(waitingPicks(state, content).map((m) => m.id)).not.toContain('sharpen_5');
    withSharpen(state, 5);
    expect(milestoneStatus(state, ms('sharpen_5'))).toBe('waiting');
    expect(waitingPicks(state, content).map((m) => m.id)).toContain('sharpen_5');
    expect(perkModifiers(state, content)).toEqual([]);
  });

  it('a pick applies its perk as an ordinary modifier and shows as a badge', () => {
    const state = withSharpen(freshState(), 6);
    const r = pickPerk(state, content, 'sharpen_5', 'sharpen_5_cry');
    if (!r.ok) throw new Error(r.reason);
    expect(milestoneStatus(r.state, ms('sharpen_5'))).toBe('active');
    expect(
      collectModifiers(r.state, content).some((m) => m.source.id === 'perk:sharpen_5_cry'),
    ).toBe(true);
    const badges = lineBadges(r.state, content, SHARPEN);
    expect(badges.map((b) => b.option.id)).toEqual(['sharpen_5_cry']);
  });

  it('refuses a pick that is unknown, not reached or already made', () => {
    const state = withSharpen(freshState(), 5);
    expect(pickPerk(state, content, 'nope', 'x')).toEqual({ ok: false, reason: 'unknown' });
    expect(pickPerk(state, content, 'sharpen_5', 'sharpen_15_x')).toEqual({
      ok: false,
      reason: 'unknown',
    });
    const later = ms('sharpen_15').options[0].id;
    expect(pickPerk(state, content, 'sharpen_15', later)).toEqual({
      ok: false,
      reason: 'not-reached',
    });
    const r = pickPerk(state, content, 'sharpen_5', 'sharpen_5_crit');
    if (!r.ok) throw new Error(r.reason);
    expect(pickPerk(r.state, content, 'sharpen_5', 'sharpen_5_cry')).toEqual({
      ok: false,
      reason: 'picked',
    });
  });
});

describe('ascension', () => {
  it('keeps every pick and the lifetime Money; a perk comes back when its line reaches the level', () => {
    const state = withSharpen(freshState(), 6);
    state.mastery.harvested['oak_gem'] = new Decimal(1e14);
    state.mastery.harvested['grotto_gem'] = new Decimal(1e8);
    state.upgrades.picks['sharpen_5'] = 'sharpen_5_cry';
    state.upgrades.moneyEarned = new Decimal(123456);
    const result = ascend(state, content);
    if (!result.ok) throw new Error(result.reason);
    const next = result.state;
    expect(next.upgrades.picks).toEqual({ sharpen_5: 'sharpen_5_cry' });
    expect(next.upgrades.moneyEarned.eq(123456)).toBe(true);
    expect(milestoneStatus(next, ms('sharpen_5'))).toBe('kept');
    expect(perkModifiers(next, content)).toEqual([]);
    withSharpen(next, 5);
    expect(milestoneStatus(next, ms('sharpen_5'))).toBe('active');
    expect(waitingPicks(next, content).map((m) => m.id)).not.toContain('sharpen_5');
    expect(perkModifiers(next, content).length).toBe(1);
  });
});

describe('lifetime Money earned', () => {
  it('counts the wage and purses paid with the kills', () => {
    const state = bareState();
    state.activeDungeonId = 'mossy_cellar';
    expect(lifetimeMoney(state).eq(0)).toBe(true);
    const { state: after } = advance(
      state,
      withDps(bossMaxHp(content.dungeons[0]!)),
      2000,
      constantRng(0.5),
    );
    const gained = after.resources['money']!.sub(state.resources['money']!);
    expect(gained.gt(0)).toBe(true);
    expect(lifetimeMoney(after).eq(gained)).toBe(true);
  });
});

describe('the upgrade row (DESIGN.md §4 The upgrade row)', () => {
  it('shows Sharpen as team damage per second and Tempo as hits per signature', () => {
    const state = freshState();
    const dps = lineEffect(state, content, SHARPEN, 1);
    expect(dps.kind).toBe('teamDps');
    expect(dps.after.gt(dps.now)).toBe(true);
    const tempo = lineEffect(state, content, { kind: 'training', id: 'tempo' }, 1);
    expect(tempo.kind).toBe('hitsPerSignature');
    expect(tempo.after.lt(tempo.now)).toBe(true);
  });

  it('names the next milestone: the ring, the pick, or both at one level', () => {
    const state = withSharpen(freshState(), 3);
    const step = nextLineStep(state, content, SHARPEN)!;
    expect(step.pick?.id).toBe('sharpen_5');
    expect(step.levelsToGo).toBe(step.level - 3);
  });
});

describe('saves', () => {
  it('round-trips picks and lifetime Money, dropping picks no longer in the game', () => {
    const state = freshState();
    state.upgrades.picks = {
      sharpen_5: 'sharpen_5_cry',
      gone: 'x',
      sharpen_15: 'sharpen_5_crit',
    };
    state.upgrades.moneyEarned = new Decimal('1.5e12');
    const loaded = readSave(createSaveText(state, NOW), content).state;
    expect(loaded.upgrades.picks).toEqual({ sharpen_5: 'sharpen_5_cry' });
    expect(loaded.upgrades.moneyEarned.eq('1.5e12')).toBe(true);
  });
});
