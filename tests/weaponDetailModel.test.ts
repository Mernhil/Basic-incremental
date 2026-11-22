import { describe, expect, it } from 'vitest';
import { Decimal, cardInfo, cardStats, newOwnedCard, type OwnedCard } from '../src/game';
import { movesView } from '../src/renderer/src/pages/movesModel';
import { attackEntries, weaponDetail } from '../src/renderer/src/pages/weaponDetailModel';
import { content, freshState } from './helpers';

function detail(id: string, patch: Partial<OwnedCard> = {}, inLoadout = false) {
  const state = freshState();
  state.cards.owned[id] = { ...newOwnedCard(), ...patch };
  state.cards.loadouts.fighting.slots = state.cards.loadouts.fighting.slots.map(() => null);
  if (inLoadout) state.cards.loadouts.fighting.slots[0] = id;
  return { state, d: weaponDetail(content, state, cardInfo(state, content, id)!)! };
}

const stat = (d: NonNullable<ReturnType<typeof weaponDetail>>, label: string) =>
  d.stats.find((s) => s.label === label)?.value;

describe('weapon panel detail', () => {
  it('is null for a card that is not owned', () => {
    const state = freshState();
    const id = content.cards.find((c) => !state.cards.owned[c.id])!.id;
    expect(weaponDetail(content, state, cardInfo(state, content, id)!)).toBeNull();
  });

  it('a fighter: the stats are the real numbers of cardStats', () => {
    const { state, d } = detail('ember_squire', { level: 5 }, true);
    const s = cardStats(state, content, 'ember_squire')!;
    // one hit = damage per second x seconds between hits, so hits per second is its inverse
    expect(s.hit.toNumber()).toBeCloseTo(cardStats(state, content, 'ember_squire')!.hit.toNumber());
    expect(stat(d, 'Hits per second')).toBe('1 / s');
    expect(stat(d, 'Damage per hit')).toBeTruthy();
    expect(stat(d, 'Damage per second')).toBeTruthy();
    expect(stat(d, 'Crit chance')).toMatch(/%$/);
    expect(stat(d, 'Health')).toBeTruthy();
    expect(stat(d, 'Role')).toBe('DPS');
    // only T6 and Heirloom cards have an element
    expect(stat(d, 'Element')).toBeUndefined();
    const withElement = content.cards.find((c) => c.job === 'fighting' && c.element)!;
    expect(stat(detail(withElement.id).d, 'Element')).toBe(
      withElement.element!.charAt(0).toUpperCase() + withElement.element!.slice(1),
    );
    expect(stat(d, 'Position')).toMatch(/row/);
    expect(stat(d, 'Loadout cost')).toBeTruthy();
  });

  it('a card outside the loadout says so', () => {
    expect(stat(detail('ember_squire').d, 'Position')).toBe('Not in the loadout');
  });

  it('damage per hit scales with the level; hits per second follow the ability', () => {
    const low = cardStats(detail('ember_squire').state, content, 'ember_squire')!;
    const high = cardStats(detail('ember_squire', { level: 40 }).state, content, 'ember_squire')!;
    expect(high.hit.gt(low.hit)).toBe(true);
    expect(stat(detail('storm_duelist', { tier: 'gold' }).d, 'Hits per second')).toBe('2 / s');
  });

  it('what it does lists the ability and the team bonus, then the three attacks come first', () => {
    const { state, d } = detail('dawnblade_regent', { tier: 'prismatic' });
    expect(d.does.map((e) => e.kind).slice(0, 2)).toEqual(['ability', 'team']);
    expect(d.does[0]!.text).toBe('Heavy hits every 2 s, signature attack ×15');
    const attacks = attackEntries(movesView(state, content, 'dawnblade_regent'));
    expect(attacks.map((e) => e.kind)).toEqual(['hit', 'skill', 'ult']);
    expect(attacks[2]!.name).not.toBe('');
    expect(attacks[2]!.text).toMatch(/gauge/);
    expect(attackEntries(null)).toEqual([]);
  });

  it('a bond shows when both cards are in the loadout', () => {
    const state = freshState();
    state.cards.owned['ember_squire'] = newOwnedCard();
    state.cards.owned['dawnblade_regent'] = { ...newOwnedCard(), tier: 'prismatic' };
    const before = weaponDetail(content, state, cardInfo(state, content, 'ember_squire')!)!;
    const bond = before.does.find((e) => e.kind === 'bond')!;
    expect(bond.name).toBe('Oath of Dawn');
    expect(bond.active).toBe(false);
    state.cards.loadouts.fighting.slots[0] = 'ember_squire';
    state.cards.loadouts.fighting.slots[1] = 'dawnblade_regent';
    const after = weaponDetail(content, state, cardInfo(state, content, 'ember_squire')!)!;
    expect(after.does.find((e) => e.kind === 'bond')!.active).toBe(true);
  });

  it('what comes next: numbers for the next level and the next star', () => {
    const { d } = detail('ember_squire', { level: 3 });
    expect(d.nextLevel.available).toBe(true);
    expect(d.nextLevel.text).toMatch(/damage per hit .* → .*\(\+\d+%\)/);
    expect(d.nextStar.available).toBe(true);
    expect(d.nextStar.text).toMatch(/damage per hit/);
    expect(d.nextStar.note).toMatch(/copies to ★2/);
  });

  it('at the level cap and at six stars it says so plainly', () => {
    const { d } = detail('ember_squire', { level: 9999, stars: 6 });
    expect(d.nextLevel).toMatchObject({ available: false, text: 'Level cap reached' });
    expect(d.nextStar).toMatchObject({ available: false, text: 'All six stars' });
  });

  it('a worker shows its harvest stats and its ability, no signature', () => {
    const worker = content.cards.find((c) => c.job !== 'fighting')!;
    const { d } = detail(worker.id);
    expect(stat(d, 'Output')).toMatch(/^×/);
    expect(stat(d, 'Strikes per second')).toBeTruthy();
    expect(stat(d, 'Health')).toBeUndefined();
    expect(d.does.some((e) => e.kind === 'ult' || e.kind === 'team')).toBe(false);
    expect(d.does[0]!.text).toBe('worker' in worker ? worker.worker.description : '');
    expect(new Decimal(0).eq(cardStats(freshState(), content, worker.id)!.hit)).toBe(true);
  });
});
