import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The roster by tier (DESIGN.md §5 The tier is the rarity, No tier-ups): cards have no rarity and
 * nothing tiers a card up. This keeps the old names from coming back into the game code.
 */
const root = resolve(__dirname, '..');

function files(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files(path, out);
    else if (path.endsWith('.ts')) out.push(path);
  }
  return out;
}

describe('no card rarity and no tier-up in the code', () => {
  it('cards.json gives every card a tier and no rarity', () => {
    const cards = JSON.parse(
      readFileSync(join(root, 'src/data/content/cards.json'), 'utf8'),
    ) as Record<string, unknown>[];
    for (const card of cards) {
      expect(card, String(card['id'])).not.toHaveProperty('rarity');
      expect(card, String(card['id'])).toHaveProperty('tier');
    }
  });

  it('the game and the UI name no tier-up function, cap by rarity or card rarity', () => {
    const gone =
      /\b(tierUpCost|tierUpCheck|cardTopTier|lookTier|weaponLookRarity|RARITY_TIER_CAP|rarityPower|wishlistPerRarity)\b|\bcard\.rarity\b|(?<![.\w])tierUp\(/;
    const hits: string[] = [];
    for (const dir of ['src/game', 'src/renderer/src', 'src/data', 'scripts/sim']) {
      for (const file of files(join(root, dir))) {
        // the old save steps name what the saves of their day held
        if (/migrations?\.ts$|migrationTeam\.ts$/.test(file)) continue;
        // the theme resolver's `card` is its own input (an id, a rank and a colour style), and the
        // card face reads the tier word from that style
        if (/game[\\/]theme\.ts$|ui[\\/]card\.ts$/.test(file)) continue;
        const lines = readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, i) => {
          if (gone.test(line)) hits.push(`${file.slice(root.length + 1)}:${i + 1}: ${line.trim()}`);
        });
      }
    }
    expect(hits).toEqual([]);
  });
});
