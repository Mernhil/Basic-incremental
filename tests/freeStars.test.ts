import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/data';
import { addCard, applyFreeStars, tierUp } from '../src/game/cards';
import { createSaveText, readSave } from '../src/game/save';
import { createInitialState, newOwnedCard } from '../src/game/state';
import { Decimal } from '../src/game/num';

// The shipped star bar: Rare and up need no copies (DESIGN.md §5, Star bar).
const content = loadContent();

describe('free stars apply themselves (DESIGN.md §5)', () => {
  it('a Rare or better card arrives at ★6, a Common at ★1', () => {
    const state = createInitialState(content);
    const rare = addCard(state, content, 'grove_keeper')!;
    expect(rare.gain).toEqual({ kind: 'new' });
    expect(rare.state.cards.owned['grove_keeper']).toMatchObject({ stars: 6, starFill: 0 });
    const common = addCard(state, content, 'rusty_brute')!;
    expect(common.state.cards.owned['rusty_brute']).toMatchObject({ stars: 1 });
  });

  it('takes only the stars that cost nothing', () => {
    const owned = newOwnedCard();
    expect(applyFreeStars(content, 'common', owned)).toBe(0);
    expect(owned.stars).toBe(1);
    expect(applyFreeStars(content, 'void', owned)).toBe(5);
    expect(owned.stars).toBe(6);
    expect(applyFreeStars(content, 'void', owned)).toBe(0);
  });

  it('a duplicate of a Rare or better card becomes shards', () => {
    const state = createInitialState(content);
    const first = addCard(state, content, 'grove_keeper')!.state;
    const again = addCard(first, content, 'grove_keeper')!;
    expect(again.gain.kind).toBe('shards');
  });

  it('a tier-up of a Rare card lands at ★6 again', () => {
    const state = createInitialState(content);
    const owned = newOwnedCard();
    owned.stars = 6;
    owned.level = 20; // the Wood cap
    state.cards.owned['grove_keeper'] = owned;
    for (const id of Object.keys(state.resources)) state.resources[id] = new Decimal(1e12);
    const result = tierUp(state, content, 'grove_keeper');
    if (!result.ok) throw new Error(result.reason);
    expect(result.state.cards.owned['grove_keeper']).toMatchObject({ tier: 'bronze', stars: 6 });
  });

  it('a save holding a Rare card below ★6 loads it at ★6', () => {
    const state = createInitialState(content);
    const owned = newOwnedCard();
    owned.stars = 2;
    state.cards.owned['grove_keeper'] = owned;
    const loaded = readSave(createSaveText(state, 1), content).state;
    expect(loaded.cards.owned['grove_keeper']!.stars).toBe(6);
  });
});
