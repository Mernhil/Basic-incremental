import { describe, expect, it } from 'vitest';
import {
  advance,
  claimableQuests,
  claimAllQuests,
  claimQuest,
  cloneState,
  createSaveText,
  CURRENT_SAVE_VERSION,
  Decimal,
  MIGRATIONS,
  newOwnedCard,
  questList,
  questPopup,
  questsByGroup,
  readSave,
  settleQuests,
  stageKey,
} from '../src/game';
import { QUEST_GROUPS, validateContent, type RawContent } from '../src/data';
import { bundledRawContent } from '../src/data';
import { constantRng, floorsContent as content, newGame } from './helpers';

const summons = (state: ReturnType<typeof newGame>): number =>
  (state.resources['summon_scroll'] ?? new Decimal(0)).toNumber();

/** The Summon Scrolls a quest pays, from the data. */
const paid = (id: string): number =>
  content.questById
    .get(id)!
    .reward.filter((r) => r.resource === 'summon_scroll')
    .reduce((n, r) => n + new Decimal(r.amount).toNumber(), 0);

describe('quest data', () => {
  it('has unique ids, every group and a reward on each quest', () => {
    const ids = content.quests.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of QUEST_GROUPS) {
      expect(content.quests.some((q) => q.group === g)).toBe(true);
    }
    expect(content.quests.every((q) => q.reward.length > 0)).toBe(true);
  });

  it('rejects a quest that names an unknown dungeon or resource', () => {
    const raw = structuredClone(bundledRawContent()) as RawContent & {
      quests: { quests: Array<Record<string, unknown>> };
    };
    raw.quests.quests[0] = {
      ...raw.quests.quests[0]!,
      condition: { kind: 'cleared', dungeon: 'nowhere' },
      reward: [{ resource: 'nothing', amount: '1' }],
    };
    expect(() => validateContent(raw)).toThrow(/unknown dungeon "nowhere"/);
    expect(() => validateContent(raw)).toThrow(/unknown resource "nothing"/);
  });

  it('pays whole scrolls, at least one, never a fraction', () => {
    for (const q of content.quests) {
      for (const r of q.reward.filter((x) => x.resource.endsWith('_scroll'))) {
        const n = new Decimal(r.amount).toNumber();
        expect(Number.isInteger(n) && n >= 1, `${q.id} pays ${n}`).toBe(true);
      }
    }
  });

  it('steps of a ladder pay more as the count grows', () => {
    const steps = content.quests
      .filter((q) => q.condition.kind === 'stage_kills' && q.condition.dungeon === 'mossy_cellar')
      .filter((q) => q.condition.kind === 'stage_kills' && q.condition.difficulty === 'normal');
    expect(steps.length).toBeGreaterThanOrEqual(3);
    const pay = steps.map((q) => new Decimal(q.reward[0]!.amount).toNumber());
    expect(pay).toEqual([...pay].sort((a, b) => a - b));
  });
});

describe('progress counting', () => {
  it('counts boss kills of the last floor on a tier', () => {
    const state = newGame();
    state.combat.stageKills[stageKey('mossy_cellar', 'normal', 10)] = 7;
    const entry = questList(state, content).find((e) => e.quest.id === 'd1_boss_10')!;
    expect(entry.value).toBe(7);
    expect(entry.target).toBe(10);
    expect(entry.progress).toBeCloseTo(0.7);
    expect(entry.done).toBe(false);
  });

  it('reads a floor reached, cards owned, a card level, the account level and Training', () => {
    const state = newGame();
    state.combat.floors['mossy_cellar'] = {
      difficulty: 'normal',
      autoChallenge: true,
      tiers: { normal: { floor: 4, best: 4 } },
    };
    state.cards.owned['ember_squire'] = { ...newOwnedCard(), level: 7 };
    state.account.level = 3;
    state.combat.training = { sharpen: 4, toughen: 2 };
    const get = (id: string) => questList(state, content).find((e) => e.quest.id === id)!;
    expect(get('d1_floor_6').value).toBe(4);
    expect(get('card_level_20').value).toBe(7);
    expect(get('account_4').value).toBe(3);
    expect(get('training_10').value).toBe(6);
    expect(get('cards_5').value).toBe(Object.keys(state.cards.owned).length);
  });

  it('a first card of a rarity is done once any owned card has it', () => {
    const state = newGame();
    const rare = content.cards.find((c) => c.rarity === 'rare')!;
    expect(questList(state, content).find((e) => e.quest.id === 'first_rare')!.done).toBe(false);
    state.cards.owned[rare.id] = newOwnedCard();
    settleQuests(state, content);
    expect(state.quests['first_rare']).toBeDefined();
  });
});

describe('settling, claiming and no double claim', () => {
  it('marks a met quest done without paying it', () => {
    const state = newGame();
    state.portals['card_portal'] = { pulls: 1, pity: 0, pityHits: 0 } as never;
    const before = summons(state);
    const fresh = settleQuests(state, content);
    expect(fresh).toContain('first_pull');
    expect(state.quests['first_pull']).toEqual({ doneAt: 0, claimed: false });
    expect(summons(state)).toBe(before);
    expect(claimableQuests(state)).toBeGreaterThan(0);
    // settling again finds nothing new
    expect(settleQuests(state, content)).toEqual([]);
  });

  it('pays a done quest once on claim and never twice', () => {
    const state = newGame();
    state.quests['d1_clear'] = { doneAt: 5, claimed: false };
    const before = summons(state);
    const first = claimQuest(state, content, 'd1_clear');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(summons(first.state) - before).toBe(paid('d1_clear'));
    expect(first.state.quests['d1_clear']!.claimed).toBe(true);
    // the input is untouched, and a second claim is refused
    expect(state.quests['d1_clear']!.claimed).toBe(false);
    expect(claimQuest(first.state, content, 'd1_clear')).toEqual({ ok: false, reason: 'claimed' });
  });

  it('refuses a quest that is not done or unknown', () => {
    const state = newGame();
    expect(claimQuest(state, content, 'd1_clear')).toEqual({ ok: false, reason: 'not-done' });
    expect(claimQuest(state, content, 'no_such')).toEqual({ ok: false, reason: 'unknown' });
    expect(claimAllQuests(state, content)).toEqual({ ok: false, reason: 'not-done' });
  });

  it('claims every waiting quest at once', () => {
    const state = newGame();
    state.quests['d1_clear'] = { doneAt: 5, claimed: false };
    state.quests['d1_floor_3'] = { doneAt: 5, claimed: false };
    state.quests['d1_floor_6'] = { doneAt: 5, claimed: true };
    settleQuests(state, content);
    for (const q of Object.values(state.quests)) q.claimed = q.claimed || q.doneAt === 0;
    const before = summons(state);
    const all = claimAllQuests(state, content);
    expect(all.ok).toBe(true);
    if (!all.ok) return;
    expect(all.quests.map((q) => q.id).sort()).toEqual(['d1_clear', 'd1_floor_3']);
    expect(summons(all.state) - before).toBe(paid('d1_clear') + paid('d1_floor_3'));
    expect(claimableQuests(all.state)).toBe(0);
  });

  it('pays materials and Glamour Scrolls where the quest does', () => {
    const state = newGame();
    state.quests['trial_clear'] = { doneAt: 1, claimed: false };
    const r = claimQuest(state, content, 'trial_clear');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.state.resources['glamour_scroll'] ?? new Decimal(0)).toNumber()).toBeGreaterThan(0);
  });

  it('the tick marks a quest done while play goes on', () => {
    const state = newGame();
    state.combat.stageKills[stageKey('mossy_cellar', 'normal', 10)] = 3;
    const { state: after } = advance(state, content, 2000, constantRng(0.5));
    expect(after.quests['d1_boss_3']?.claimed).toBe(false);
  });
});

describe('kept through Ascension', () => {
  it('a done quest stays done and a claimed one is never handed out again', () => {
    const state = newGame();
    state.combat.stageKills[stageKey('mossy_cellar', 'normal', 10)] = 10;
    settleQuests(state, content);
    const claimed = claimQuest(state, content, 'd1_boss_10');
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) return;
    // what the quest read is gone, as after a reset
    const reset = cloneState(claimed.state);
    reset.combat.stageKills = {};
    settleQuests(reset, content);
    expect(reset.quests['d1_boss_10']!.claimed).toBe(true);
    expect(claimQuest(reset, content, 'd1_boss_10')).toEqual({ ok: false, reason: 'claimed' });
  });
});

describe('the popup rows', () => {
  it('lists claimable quests first, then the nearest unfinished ones, six rows at most', () => {
    const state = newGame();
    state.quests['d1_clear'] = { doneAt: 1, claimed: false };
    state.combat.stageKills[stageKey('mossy_cellar', 'normal', 10)] = 9;
    settleQuests(state, content);
    const { claimable, next } = questPopup(state, content);
    expect(claimable.map((e) => e.quest.id)).toEqual(['d1_clear', 'd1_boss_3']);
    expect(next[0]!.quest.id).toBe('d1_boss_10');
    expect(claimable.length + next.length).toBe(6);
    expect(next.every((e) => !e.done)).toBe(true);
  });

  it('groups the full list', () => {
    const groups = questsByGroup(newGame(), content);
    expect([...groups.keys()].sort()).toEqual([...QUEST_GROUPS].sort());
  });
});

describe('saving (save format 34)', () => {
  it('round-trips quest state and drops quests removed from the game', () => {
    const state = newGame();
    state.quests = {
      d1_clear: { doneAt: 9, claimed: true },
      d1_floor_3: { doneAt: 4, claimed: false },
      gone: { doneAt: 1, claimed: false },
    };
    const loaded = readSave(createSaveText(state, 1), content).state;
    expect(loaded.quests['d1_clear']).toEqual({ doneAt: 9, claimed: true });
    expect(loaded.quests['d1_floor_3']).toEqual({ doneAt: 4, claimed: false });
    expect('gone' in loaded.quests).toBe(false);
  });

  it('migrates v33 -> v34 and the first tick marks what the save meets as done, not claimed', () => {
    expect(CURRENT_SAVE_VERSION).toBe(34);
    expect(MIGRATIONS[33]!({ a: 1 })).toEqual({ a: 1, quests: {} });
    // an old save: boss kills it proved already, a cleared dungeon
    const old = newGame();
    old.clearedDungeons = ['mossy_cellar'];
    old.combat.stageKills[stageKey('mossy_cellar', 'normal', 10)] = 12;
    const text = JSON.parse(createSaveText(old, 1)) as {
      version: number;
      state: Record<string, unknown>;
    };
    text.version = 33;
    delete text.state['quests'];
    const read = readSave(JSON.stringify(text), content).state;
    expect(read.quests).toEqual({});
    const loaded = advance(read, content, 2000, constantRng(0.5)).state;
    for (const id of ['d1_clear', 'd1_boss_3', 'd1_boss_10']) {
      expect(loaded.quests[id]).toMatchObject({ claimed: false });
    }
    expect(loaded.quests['d1_boss_25']).toBeUndefined();
    expect(Object.values(loaded.quests).every((q) => !q.claimed)).toBe(true);
  });
});
