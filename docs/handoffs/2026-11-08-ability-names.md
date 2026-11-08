# Handoff: ability names for the full-art card face

From: `ui` (branch `feat/full-art-card`). To: `mechanics` (owns `src/data/**`, `src/game/**`).

## What the UI needs

The bottom plate of the full-art card (DESIGN.md §5 "Full-art layout") shows an **ability name** on its first line, e.g. "Ember Slash", next to the hit speed ("hits every 1s"). The card data has no such field: `card.main.description` is a sentence ("Steady hits every 1 s") and `card.item.name` is the weapon ("Ember Blade").

Until it exists the UI shows `card.item.name` on that line (`src/renderer/src/pages/cardFaceModel.ts`, one line, marked with a comment pointing here).

## Shape wanted

In `cards.json` and `cardSchema` (`src/data/schemas.ts`), a short name for the main ability:

```ts
main: cardEffectSchema.extend({
  /** Short name shown on the card face, e.g. "Ember Slash" (max ~16 characters). */
  name: z.string().min(1).max(20),
  harvest: harvestPatternSchema.optional(),
});
```

Optionally the same for `support` (not used by the face today). The card is about 150 box units wide and the line also holds "hits every 1s", so names over about 16 characters get an ellipsis.

## Why

Without it the line repeats the weapon's name, which the art already shows. When the field lands the UI changes one line (`ability: card.main.name`) and the DESIGN.md tag for Full-art layout can go from [Proposed] to [Built].

## Nothing else is missing

Hit speed (`burstStats`, `main.harvest`), level and cap (`cardInfo`), progress (`owned.xp` / `xpToNext`) and rarity all come from the existing exports.
