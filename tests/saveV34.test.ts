import { describe, expect, it } from 'vitest';
import {
  arrangeFormation,
  cardHealth,
  createSaveText,
  CURRENT_SAVE_VERSION,
  MIGRATIONS,
  newOwnedCard,
  readSave,
} from '../src/game';
import { content, newGame } from './helpers';

type Old = { main: string | null; supports: (string | null)[] };

const save = (fighting: Old, dungeons: Record<string, Old> = {}) => ({
  cards: { owned: {}, loadouts: { fighting }, shards: 0, wishlist: [] },
  presets: { dungeons, production: { logging: [], mining: [] } },
});

type Out = {
  cards: { loadouts: { fighting: unknown } };
  presets: { dungeons: Record<string, unknown> };
};

/** v33 -> v34: the fighting loadout is four equal slots (DESIGN.md §5 Loadouts). */
describe('v33 -> v34 (four equal loadout slots)', () => {
  it('is format 34 or later', () => {
    expect(CURRENT_SAVE_VERSION).toBeGreaterThanOrEqual(34);
  });

  it('keeps the main card first and the supports after it, in the same order', () => {
    const out = MIGRATIONS[33]!(
      save({ main: 'ember_squire', supports: ['storm_duelist', null, 'rusty_brute'] }),
    ) as Out;
    expect(out.cards.loadouts.fighting).toEqual({
      slots: ['ember_squire', 'storm_duelist', null, 'rusty_brute'],
    });
  });

  it('keeps a loadout with an empty main card in place', () => {
    const out = MIGRATIONS[33]!(
      save({ main: null, supports: ['storm_duelist', null, null] }),
    ) as Out;
    expect(out.cards.loadouts.fighting).toEqual({ slots: [null, 'storm_duelist', null, null] });
  });

  it('converts every dungeon preset the same way', () => {
    const out = MIGRATIONS[33]!(
      save(
        { main: null, supports: [null, null, null] },
        {
          mossy_cellar: { main: 'ember_squire', supports: [null, null, null] },
          ember_crypt: {
            main: 'dawnblade_regent',
            supports: ['ember_squire', 'storm_duelist', null],
          },
        },
      ),
    ) as Out;
    expect(out.presets.dungeons).toEqual({
      mossy_cellar: { slots: ['ember_squire', null, null, null] },
      ember_crypt: { slots: ['dawnblade_regent', 'ember_squire', 'storm_duelist', null] },
    });
  });

  it('pads and trims to four slots, and leaves a loadout already in slots alone', () => {
    const short = MIGRATIONS[33]!(save({ main: 'ember_squire', supports: [] })) as Out;
    expect(short.cards.loadouts.fighting).toEqual({ slots: ['ember_squire', null, null, null] });
    const done = { slots: ['ember_squire', null, null, null] };
    const again = MIGRATIONS[33]!({
      cards: { loadouts: { fighting: done } },
      presets: { dungeons: {} },
    }) as Out;
    expect(again.cards.loadouts.fighting).toEqual(done);
  });

  it('does not change the input', () => {
    const input = save({ main: 'ember_squire', supports: ['storm_duelist', null, null] });
    const copy = JSON.parse(JSON.stringify(input));
    MIGRATIONS[33]!(input);
    expect(input).toEqual(copy);
  });

  it('reads a format 33 save with the same team in the same order', () => {
    const state = newGame();
    state.account.level = 10;
    const ids = ['storm_duelist', 'dawnblade_regent', 'rusty_brute'];
    for (const id of ids) state.cards.owned[id] = newOwnedCard();
    state.cards.loadouts.fighting = {
      slots: ['ember_squire', 'storm_duelist', null, 'rusty_brute'],
    };
    state.presets.dungeons['mossy_cellar'] = {
      slots: ['dawnblade_regent', 'ember_squire', null, null],
    };
    // write it as the 0.7.16 game did: a main card and three supports, format 33
    const json = JSON.parse(createSaveText(state, 1));
    json.version = 33;
    json.state.cards.loadouts.fighting = {
      main: 'ember_squire',
      supports: ['storm_duelist', null, 'rusty_brute'],
    };
    json.state.presets.dungeons['mossy_cellar'] = {
      main: 'dawnblade_regent',
      supports: ['ember_squire', null, null],
    };
    const loaded = readSave(JSON.stringify(json), content).state;
    // the two highest-health cards go to the front (slots 1 and 2), the others behind in order
    const health = (id: string) => cardHealth(content, id, newOwnedCard());
    expect(health('storm_duelist').gt(health('ember_squire'))).toBe(true);
    expect(loaded.cards.loadouts.fighting.slots).toEqual(
      arrangeFormation({ slots: ['ember_squire', 'storm_duelist', null, 'rusty_brute'] }, health)
        .slots,
    );
    expect(loaded.cards.loadouts.fighting.slots[1]).toBe('storm_duelist');
    expect(loaded.presets.dungeons['mossy_cellar']!.slots[1]).toBe('dawnblade_regent');
    expect(loaded.presets.dungeons['mossy_cellar']!.slots).toContain('ember_squire');
  });

  it('round-trips the four slots', () => {
    const state = newGame();
    state.cards.owned['storm_duelist'] = newOwnedCard();
    state.cards.loadouts.fighting = { slots: [null, 'ember_squire', null, 'storm_duelist'] };
    const loaded = readSave(createSaveText(state, 1), content).state;
    expect(loaded.cards.loadouts.fighting.slots).toEqual([
      null,
      'ember_squire',
      null,
      'storm_duelist',
    ]);
  });
});
