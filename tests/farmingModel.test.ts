import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/data';
import { createInitialState, newOwnedCard, setFarmTeam } from '../src/game';
import { FARM_COPY, farmingModel } from '../src/renderer/src/pages/farmingModel';

const content = loadContent();

describe('the Farming tab model', () => {
  it('shows every dungeon, shut ones with no earnings, and a plain totals line', () => {
    const model = farmingModel(createInitialState(content), content);
    expect(model.posts.map((p) => p.dungeonId)).toEqual(content.dungeons.map((d) => d.id));
    expect(model.posts.every((p) => !p.open && p.lines.length === 0)).toBe(true);
    expect(model.totalsText).toBe(FARM_COPY.noPosts);
  });

  it('lists Money, the materials and the three farming-only drops for an open post', () => {
    const s = createInitialState(content);
    const mossy = content.dungeonById.get('mossy_cellar')!;
    s.combat.floors['mossy_cellar'] = {
      difficulty: 'normal',
      autoChallenge: false,
      tiers: { normal: { floor: 1, best: mossy.floors } },
    };
    s.account.level = 20;
    s.cards.loadouts.fighting = { slots: [null, null, null, null] };
    s.cards.owned['ember_squire'] = newOwnedCard('wood');
    const placed = setFarmTeam(s, content, 'mossy_cellar', ['ember_squire', null, null, null]);
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    const card = farmingModel(placed.state, content).posts[0]!;
    expect(card.open).toBe(true);
    expect(card.lines.map((l) => l.key)).toEqual([
      'money',
      'moss_core',
      'shards',
      'scroll_fragment',
      'herb_bundle',
    ]);
    expect(card.lines.filter((l) => l.farmOnly).map((l) => l.key)).toEqual([
      'shards',
      'scroll_fragment',
      'herb_bundle',
    ]);
    expect(card.levelText).toBe(FARM_COPY.level(1));
    expect(card.traitText).toBe(FARM_COPY.nextTrait(content.farming.level.traitEvery));
    expect(card.teamCount).toBe(1);
    expect(farmingModel(placed.state, content).totalsText).toContain(FARM_COPY.totalsPosts(1));
  });
});
