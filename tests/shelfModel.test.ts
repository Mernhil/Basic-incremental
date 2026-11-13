import { describe, expect, it } from 'vitest';
import { Decimal, collectModifiers, buyTreeLevels, type GameState } from '../src/game';
import { treeLevelViews } from '../src/renderer/src/pages/buyModel';
import { isFightingUpgrade, shelfChips } from '../src/renderer/src/pages/shelfModel';
import { content, freshState } from './helpers';

const mods = (s: GameState) => collectModifiers(s, content);

function richState(): GameState {
  const s = freshState();
  s.resources.money = new Decimal(1e12);
  return s;
}

describe('tree level views', () => {
  it('lists unlocked trees only, with a preview and the next milestone', () => {
    const s = richState();
    const views = treeLevelViews(s, content, 1, mods(s));
    expect(views.map((v) => v.id)).toEqual(['oak']);
    const oak = views[0]!;
    expect(oak.offer.affordable).toBe(true);
    expect(oak.milestone).toBe('Lv 15: ×1.15');
    expect(oak.preview).toContain('/s');
    expect(oak.label).toBe('Buy ×1');
  });

  it('follows the buy count and the level after buying', () => {
    const s = richState();
    const r = buyTreeLevels(s, content, 'oak', 10);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = treeLevelViews(r.state, content, 'max', mods(r.state))[0]!;
    expect(v.level).toBe(10);
    expect(v.label).toMatch(/^Buy max/);
  });

  it('is not affordable without Money', () => {
    const s = freshState();
    s.resources.money = new Decimal(0);
    expect(treeLevelViews(s, content, 1, mods(s))[0]!.offer.affordable).toBe(false);
  });
});

describe('upgrade shelf chips', () => {
  it('never shows hidden upgrades', () => {
    const s = richState();
    expect(shelfChips(s, content, mods(s), null)).toEqual([]);
  });

  it('shows an upgrade once its threshold is met, affordable first, then owned last', () => {
    const s = richState();
    s.production.treeLevels.oak = 10;
    s.upgrades.moneyEarned = new Decimal(1e5);
    const chips = shelfChips(s, content, mods(s), 'production');
    expect(chips.length).toBeGreaterThan(0);
    expect(chips.every((c) => c.status === 'available')).toBe(true);
    expect(chips[0]!.affordable).toBe(true);
    expect(chips.find((c) => c.id === 'keen_axes')?.preview).toContain('/s');
    s.upgrades.owned.push('keen_axes');
    const after = shelfChips(s, content, mods(s), 'production');
    expect(after.at(-1)!.id).toBe('keen_axes');
    expect(after.at(-1)!.status).toBe('owned');
    expect(after.at(-1)!.unlockText).toBe('Oak level 10');
  });

  it('splits production and fighting upgrades', () => {
    const s = richState();
    s.upgrades.moneyEarned = new Decimal(1e12);
    s.production.treeLevels.oak = 100;
    s.combat.stageKills['mossy_cellar:normal:1'] = 100;
    const prod = shelfChips(s, content, mods(s), 'production').map((c) => c.id);
    const fight = shelfChips(s, content, mods(s), 'fighting').map((c) => c.id);
    expect(prod.filter((id) => fight.includes(id))).toEqual([]);
    expect(fight.length).toBeGreaterThan(0);
    const items = content.upgrades.upgrades;
    expect(isFightingUpgrade(items.find((u) => u.id === 'keen_axes')!)).toBe(false);
  });
});
