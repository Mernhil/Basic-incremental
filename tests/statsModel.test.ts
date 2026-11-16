import { describe, expect, it } from 'vitest';
import { newOwnedCard } from '../src/game';
import { statTiles } from '../src/renderer/src/pages/statsModel';
import { bareState, content } from './helpers';

/** DESIGN §5 Show the stats: DPS, health, hit speed and crits, compared with the equipped main. */
describe('card stat tiles', () => {
  const state = () => {
    const s = bareState();
    for (const id of ['ember_squire', 'silver_skirmisher', 'apprentice_feller'])
      s.cards.owned[id] = newOwnedCard();
    s.cards.loadouts.fighting = { slots: ['ember_squire', null, null, null] };
    return s;
  };

  it('a fighting card shows damage, health, hit speed and crits', () => {
    const t = statTiles(content, state(), 'silver_skirmisher');
    expect(t.tiles.map((x) => x.label)).toEqual(['Damage / s', 'Health', 'Hits every', 'Crits']);
    expect(t.tiles[2]!.value).toBe('0.8 s');
    expect(t.tiles[3]!.value).toContain('20%');
  });

  it('compares with the weakest other loadout card, and says so when it is the only one', () => {
    const t = statTiles(content, state(), 'silver_skirmisher');
    expect(t.compare).toMatch(/^vs Wooden Sword: [+−]\d+% damage, [+−]\d+% health$/);
    expect(statTiles(content, state(), 'ember_squire').compare).toBe(
      'The only card in the loadout.',
    );
  });

  it('a worker shows its output, strike speed and harvest crits', () => {
    const t = statTiles(content, state(), 'apprentice_feller');
    expect(t.tiles.map((x) => x.label)).toEqual(['Output', 'Strikes every', 'Crits']);
  });
});
