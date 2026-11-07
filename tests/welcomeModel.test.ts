import { describe, expect, it } from 'vitest';
import { Decimal, type OfflineSummary } from '../src/game';
import { welcomeCards } from '../src/renderer/src/pages/welcomeModel';
import { content } from './helpers';

const base = (): OfflineSummary => ({
  elapsedMs: 3_600_000,
  simulatedMs: 3_600_000,
  capMs: 8 * 3_600_000,
  capped: false,
  gains: {},
  bossKills: 0,
  drops: {},
  cardDrops: [],
  cardLevels: {},
  knockouts: 0,
  materials: {},
  cardXp: {},
  tierUps: [],
  achievements: [],
});

describe('welcome back cards', () => {
  it('always deals the time card, and nothing else when nothing happened', () => {
    const cards = welcomeCards(base(), content);
    expect(cards.map((c) => c.kind)).toEqual(['time']);
    expect(cards[0]!.lines).toEqual([]);
  });

  it('deals a card per category in order, with rare drops highlighted', () => {
    const gem = content.resources[0]!;
    const card = content.cards[0]!;
    const rareItem = content.dungeons[0]!.drops.rare.itemId;
    const summary: OfflineSummary = {
      ...base(),
      capped: true,
      gains: { [gem.id]: new Decimal(1234) },
      bossKills: 12,
      knockouts: 2,
      drops: { [rareItem]: 1 },
      materials: { moss_core: 3 },
      cardLevels: { [card.id]: { from: 3, to: 5 } },
      cardXp: { [card.id]: new Decimal(40) },
      tierUps: [{ kind: 'gem_mastery', id: gem.id, from: 0, to: 1, metal: 'bronze' }],
    };
    const cards = welcomeCards(summary, content);
    expect(cards.map((c) => c.kind)).toEqual([
      'time',
      'resources',
      'fights',
      'drops',
      'cards',
      'mastery',
    ]);
    expect(cards[0]!.lines).toHaveLength(1); // the cap
    expect(cards[1]!.lines[0]).toMatchObject({ resource: gem.id });
    expect(cards[2]!.headline).toBe('12 kills');
    const drops = cards[3]!;
    expect(drops.lines.filter((l) => l.rare)).toHaveLength(1);
    expect(drops.headline).toBe('Rare!');
    expect(cards[4]!.headline).toBe('+2 Lv');
    expect(cards[4]!.lines).toHaveLength(1); // XP of a card that levelled is not repeated
    expect(cards[5]!.lines[0]!.text).toContain('reached Bronze');
  });
});
