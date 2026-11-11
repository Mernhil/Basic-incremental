import { describe, expect, it } from 'vitest';
import { accountInfo, formatDecimal, rewardTrack, xpToNextAccountLevel } from '../src/game';
import { levelBadge, levelUpView, trackView } from '../src/renderer/src/pages/accountModel';
import { content as bundled, freshState, levelPointsOnly } from './helpers';

const content = levelPointsOnly(bundled);

/** The Summon Scrolls the level 10 reward gives (account.json). */
const lv10Crystals = (): string =>
  content.account.rewardTrack
    .find((r) => r.level === 10)!
    .resources!.find((r) => r.resource === 'summon_scroll')!
    .amount.toString();

describe('account level badge', () => {
  it('shows the level, the XP bar and no points on a new game', () => {
    const s = freshState();
    const v = levelBadge(accountInfo(s, content));
    expect(v.level).toBe(1);
    expect(v.fraction).toBe(0);
    expect(v.xpText).toBe(`0 / ${formatDecimal(xpToNextAccountLevel(content, 1))} XP`);
    expect(v.points).toBe(0);
    expect(v.pointsText).toBe('');
    expect(v.label).toContain('No skill points to spend');
  });

  it('counts the points to spend and says max level at the top', () => {
    const s = freshState();
    s.account.level = 6;
    s.account.skills = { logging_s1: 2 };
    const v = levelBadge(accountInfo(s, content));
    expect(v.points).toBe(3);
    expect(v.pointsText).toBe('3 skill points to spend');

    s.account.level = 80;
    const high = levelBadge(accountInfo(s, content));
    expect(high.xpText).not.toBe('Max level');
    expect(high.level).toBe(80);
  });
});

describe('reward track', () => {
  it('marks reached levels, the next one, and signposts with more than a point', () => {
    const s = freshState();
    s.account.level = 7;
    const tiles = trackView(content, rewardTrack(s, content));
    expect(tiles[0]!.level).toBe(2);
    expect(tiles.filter((t) => t.reached).map((t) => t.level)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(tiles.filter((t) => t.next).map((t) => t.level)).toEqual([8]);

    const lv3 = tiles.find((t) => t.level === 3)!;
    expect(lv3.milestone).toBe(true);
    expect(lv3.rewards.map((r) => r.kind)).toEqual(['cap', 'points']);
    expect(lv3.rewards[0]!.text).toBe('+1 loadout cost cap');

    const lv10 = tiles.find((t) => t.level === 10)!;
    // the cosmetic is the headline, then the sigils
    expect(lv10.rewards.map((r) => r.kind)).toEqual(['cosmetic', 'resource', 'points']);
    expect(lv10.rewards[1]!.text).toBe(`+${lv10Crystals()} Summon Scroll`);

    expect(tiles.find((t) => t.level === 4)!.milestone).toBe(false);
    expect(lv3.label).toBe('Level 3: +1 loadout cost cap, +1 skill point. Reached');
  });
});

describe('level-up toast', () => {
  it('sums what every level in the jump gave', () => {
    const s = freshState();
    s.account.level = 10;
    const v = levelUpView(content, rewardTrack(s, content), 7, 10);
    expect(v.title).toBe('Account level 10!');
    expect(v.lines[0]).toBe('+3 skill points');
    expect(v.lines).toContain(`+${lv10Crystals()} Summon Scroll`);
    expect(v.lines).toContain('+1 loadout cost cap');
    expect(v.lines).toContain(content.cosmeticById.get('holo_hex')!.name);
    expect(v.big).toBe(true);
  });

  it('is just the point on a plain level', () => {
    const s = freshState();
    s.account.level = 4;
    const v = levelUpView(content, rewardTrack(s, content), 3, 4);
    expect(v.lines).toEqual(['+1 skill point']);
    expect(v.big).toBe(false);
  });
});
