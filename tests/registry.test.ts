import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { missingVisuals } from '../src/game';
import { EFFECTS, KNOWN_VISUALS, RECIPES } from '../src/renderer/src/theme/registry';
import { content } from './helpers';

describe('visual registry', () => {
  it('implements every recipe and effect named in the cosmetic data', () => {
    expect(missingVisuals(content, KNOWN_VISUALS)).toEqual([]);
  });

  it('has a CSS class for every registered recipe', () => {
    const css =
      readFileSync('src/renderer/src/theme/recipes.css', 'utf8') +
      readFileSync('src/renderer/src/theme/shellOak.css', 'utf8') + // Carved Oak draws `.r-shell-oak`
      readFileSync('src/renderer/src/theme/shellGold.css', 'utf8'); // Charcoal and Gold draws `.r-shell-gold`
    // `shell-<id>` recipes are table pictures: they need a table in content/shellArt.json instead
    const shellIds = new Set(content.shellArt.map((t) => `shell-${t.id}`));
    const missing = RECIPES.filter(
      (id) => !css.includes(`.r-${id}`) && !(id.startsWith('shell-') && shellIds.has(id)),
    );
    expect(missing).toEqual([]);
  });

  it('registers each effect once', () => {
    expect(new Set(EFFECTS).size).toBe(EFFECTS.length);
  });
});
