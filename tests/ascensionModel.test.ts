import { describe, expect, it } from 'vitest';
import { Decimal, ascend, ascensionPreview, starlightShop, type GameState } from '../src/game';
import {
  gateView,
  keptViews,
  rewardView,
  starlightViews,
} from '../src/renderer/src/pages/ascensionModel';
import { content, freshState, openAscension } from './helpers';

const gem = content.resources.find((r) => r.kind === 'tree_gem' && r.tier === 1)!;

/** A run that harvested enough to ascend. */
function readyState(): GameState {
  const s = freshState();
  s.mastery.harvested[gem.id] = new Decimal(1e14);
  return openAscension(s);
}

describe('ascension gate', () => {
  it('shows progress toward the minimum before a run can ascend', () => {
    const s = freshState();
    const v = gateView(ascensionPreview(s, content), s, content);
    expect(v.canAscend).toBe(false);
    expect(v.gain).toBe('0');
    expect(v.progress).toBe(0);
    expect(v.needs).toBe(`0 of ${content.prestige.gain.minimum} needed to ascend`);
    // a new game has not cleared Frostspire Vault: the first Ascension is locked
    expect(v.button).toBe('Locked');
    expect(v.lockedText).toMatch(/^Clear Frostspire Vault on Normal/);
    const open = openAscension(freshState());
    expect(gateView(ascensionPreview(open, content), open, content).button).toBe(
      `Ascend at ${content.prestige.gain.minimum} Starlight`,
    );
    expect(v.multiplierNow).toBe('1');
    expect(Number(v.multiplierAfter)).toBeGreaterThan(1);
    expect(v.prizes.map((p) => p.id)).toEqual(['summon', 'cores']);
    expect(v.nth).toBe('Ascension 1');
  });

  it('shows the gain, the first ascension reward and what resets', () => {
    const s = readyState();
    const v = gateView(ascensionPreview(s, content), s, content);
    expect(v.canAscend).toBe(true);
    expect(Number(v.gain)).toBeGreaterThanOrEqual(content.prestige.gain.minimum);
    expect(v.progress).toBe(1);
    expect(v.needs).toBe('');
    expect(v.button).toBe('Ascend');
    expect(v.rewards.map((r) => r.id)).toEqual(['gilded_plate']);
    expect(v.rewards[0]!.text).toMatch(/^Gilded Plate, \w+ border$/);
    expect(v.resets.map((r) => r.id)).toEqual(['resources']);
    expect(v.resets.every((r) => r.label && r.detail)).toBe(true);
  });

  it('floats every kept part into the gate, with counts from the save', () => {
    const s = freshState();
    const kept = keptViews(s, content);
    const ids = kept.map((k) => k.id);
    for (const id of ['cosmetics', 'unlocks', 'mastery', 'medals', 'portal_pity', 'starlight'])
      expect(ids).toContain(id);
    const v = gateView(ascensionPreview(s, content), s, content);
    expect(v.kept.length).toBe(kept.length);
    expect(kept.find((k) => k.id === 'starlight')!.art).toEqual({ kind: 'starlight' });
    expect(kept.find((k) => k.id === 'unlocks')!.detail).toMatch(/^0 dungeons cleared/);
  });

  it('names a reward and falls back to the id for an unknown one', () => {
    expect(rewardView(content, 'gilded_plate').name).toBe('Gilded Plate');
    expect(rewardView(content, 'nope').text).toBe('nope');
  });

  it('next gate after an ascension is the second, with its own reward', () => {
    const r = ascend(readyState(), content);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = gateView(ascensionPreview(r.state, content), r.state, content);
    expect(v.nth).toBe('Ascension 2');
    expect(v.canAscend).toBe(false);
    expect(v.rewards.map((x) => x.id)).toEqual(['nodes_c']);
  });
});

describe('Starlight shop', () => {
  it('shows level, price and the effect now and next', () => {
    const s = freshState();
    s.resources[content.prestige.currency] = new Decimal(100);
    const views = starlightViews(starlightShop(s, content), s, content);
    const groves = views.find((v) => v.id === 'second_hands')!;
    expect(groves.levelText).toBe('Lv 0 / 8');
    expect(groves.maxed).toBe(false);
    expect(groves.buy.label).toBe('Buy level');
    expect(groves.buy.price).toBe('12 Starlight');
    expect(groves.buy.preview).toBe('+0% → +20%');
    expect(groves.buy.offer.affordable).toBe(true);
    expect(groves.buy.offer.progress).toBe(1);
    const night = views.find((v) => v.id === 'long_night')!;
    expect(night.buy.preview).toBe('+0 → +1');
  });

  it('fills toward the price when short, and shows max level', () => {
    const s = freshState();
    s.resources[content.prestige.currency] = new Decimal(1);
    s.prestige.shop['long_night'] = 4;
    const views = starlightViews(starlightShop(s, content), s, content);
    const groves = views.find((v) => v.id === 'second_hands')!;
    expect(groves.buy.offer.affordable).toBe(false);
    expect(groves.buy.offer.progress).toBeCloseTo(1 / 12);
    const skies = views.find((v) => v.id === 'long_night')!;
    expect(skies.maxed).toBe(true);
    expect(skies.buy.available).toBe(false);
    expect(skies.buy.label).toBe('Max level');
    expect(skies.buy.price).toBe('');
    expect(skies.buy.preview).toBe('+4, max level');
  });
});
