import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/data';
import {
  createInitialState,
  createSaveText,
  CURRENT_SAVE_VERSION,
  newOwnedCard,
  readSave,
} from '../src/game';

const content = loadContent();

/** Save format 48, farming posts (DESIGN.md §2 A team farms a finished dungeon). */
describe('v47 -> v48', () => {
  const state = createInitialState(content);
  const parsed = JSON.parse(createSaveText(state, 5_000)) as {
    version: number;
    state: Record<string, unknown>;
  };
  parsed.version = 47;
  delete parsed.state['farming'];
  const loaded = readSave(JSON.stringify(parsed), content);

  it('is a format 47 save and the game is newer', () => {
    expect(parsed.version).toBe(47);
    expect(CURRENT_SAVE_VERSION).toBeGreaterThanOrEqual(48);
  });

  it('starts with no posts and changes nothing else', () => {
    expect(loaded.state.farming).toEqual({ posts: {} });
    expect(Object.keys(loaded.state.cards.owned).sort()).toEqual(
      Object.keys(state.cards.owned).sort(),
    );
  });
});

describe('a save with posts', () => {
  const state = createInitialState(content);
  state.cards.loadouts.fighting = { slots: [null, null, null, null] };
  state.cards.owned['ember_squire'] = newOwnedCard('wood');
  state.farming.posts['mossy_cellar'] = {
    team: ['ember_squire', null, 'not_a_card', null],
    level: 7,
    xp: 0.5,
    traits: ['herbalist', 'not_a_trait'],
    rerolls: 2,
    upgrade: 3,
    carry: { herbs: 0.5 },
  };
  state.farming.posts['gone_dungeon'] = { ...state.farming.posts['mossy_cellar']! };

  it('round-trips, dropping what no longer exists', () => {
    const loaded = readSave(createSaveText(state, 1), content).state;
    expect(Object.keys(loaded.farming.posts)).toEqual(['mossy_cellar']);
    const post = loaded.farming.posts['mossy_cellar']!;
    expect(post.team).toEqual(['ember_squire', null, null, null]);
    expect(post.level).toBe(7);
    expect(post.traits).toEqual(['herbalist']);
    expect(post.upgrade).toBe(3);
    expect(post.carry).toEqual({ herbs: 0.5 });
  });

  it('keeps a card out of a post when the fighting loadout has it', () => {
    const s = createInitialState(content);
    s.cards.owned['ember_squire'] = newOwnedCard('wood');
    s.cards.loadouts.fighting = { slots: ['ember_squire', null, null, null] };
    s.farming.posts['mossy_cellar'] = { ...state.farming.posts['mossy_cellar']! };
    const loaded = readSave(createSaveText(s, 1), content).state;
    expect(loaded.farming.posts['mossy_cellar']!.team).toEqual([null, null, null, null]);
  });
});
