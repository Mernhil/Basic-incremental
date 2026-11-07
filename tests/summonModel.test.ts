import { describe, expect, it } from 'vitest';
import { Decimal, portalInfo, type PullResult } from '../src/game';
import { portalView, revealSound, revealViews } from '../src/renderer/src/pages/summonModel';
import { content, freshState } from './helpers';

const portal = content.portals[0]!;

describe('summon shelf', () => {
  it('shows prices, pity and rates of a portal', () => {
    const state = freshState();
    state.resources[portal.cost.resource] = new Decimal(1000);
    const v = portalView(portalInfo(state, content, portal.id)!, content);
    expect(v.name).toBe(portal.name);
    expect(v.single.affordable && v.ten.affordable).toBe(true);
    expect(v.ten.label).toBe('Pull ×10');
    expect(v.pity).toMatch(/or better within \d+ pulls$/);
    expect(v.pityProgress).toBe(0);
    expect(v.guarantee).toMatch(/^Every ×10 holds a /);
    expect(v.rates[0]).toMatch(/^Common: \d/);
  });

  it('cannot pull without the portal resource', () => {
    const v = portalView(portalInfo(freshState(), content, portal.id)!, content);
    expect(v.single.affordable).toBe(false);
  });
});

describe('summon reveal', () => {
  it('marks upgrade flashes and what each pull became', () => {
    const card = content.cards[0]!;
    const results: PullResult[] = [
      {
        itemId: card.id,
        rarity: 'rare',
        orb: 'common',
        pity: false,
        guaranteed: true,
        gain: { kind: 'new' },
      },
      {
        itemId: card.id,
        rarity: 'legendary',
        orb: 'legendary',
        pity: true,
        guaranteed: false,
        gain: { kind: 'duplicate', duplicates: 2 },
      },
    ];
    const [a, b] = revealViews(results, content);
    expect(a).toMatchObject({ name: card.name, upgrade: true, tags: ['New!', '×10 guarantee'] });
    expect(b).toMatchObject({ upgrade: false, tags: ['Duplicate (2)', 'Pity'] });
  });

  it('plays a reveal sound per rarity', () => {
    expect(revealSound('common')).toBe('summonCommon');
    expect(revealSound('legendary')).toBe('summonLegendary');
    expect(revealSound('void')).toBe('summonMythic');
  });
});
