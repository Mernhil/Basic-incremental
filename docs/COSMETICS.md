# Cosmetic system

How the customization-driven UI is built, so new cosmetics and slots stay consistent. Game rules live in `DESIGN.md`; this file is the technical pattern.

## Pieces

| Piece         | Where                                | What it is                                                                              |
| ------------- | ------------------------------------ | --------------------------------------------------------------------------------------- |
| Cosmetic data | `src/data/content/cosmetics.json`    | Every item: slot, set, rarity, exclusive card, starter flag, owned buff, upgrade levels |
| Rarity styles | `src/data/content/rarities.json`     | Card body colour per rarity, plus optional recipes (neon, chrome)                       |
| Wear rules    | `src/data/content/wearRules.json`    | Minimum card rank to wear a border, a finish, or a card-exclusive item                  |
| Schemas       | `src/data/schemas.ts`                | Validation, including which tokens each slot may set                                    |
| Theming logic | `src/game/theme.ts`                  | Pure functions: equip, per-card overrides, wear rules, level merging, set detection     |
| Application   | `src/renderer/src/theme/apply.ts`    | Writes the resolved tokens and recipe classes onto `<html>` and card elements           |
| Recipes       | `src/renderer/src/theme/recipes.css` | CSS for visuals a token cannot express                                                  |
| Effects       | `src/renderer/src/theme/effects.ts`  | One-shot animations for attacks and tick numbers                                        |
| Registry      | `src/renderer/src/theme/registry.ts` | The recipe and effect ids the renderer implements                                       |

## Three kinds of visual value

1. **Tokens.** Plain values (colours, sizes, fonts). A token key `plate-bg` becomes the CSS variable `--bi-plate-bg`. Rarity tokens get a `rarity-` prefix: `--bi-rarity-body`. Each slot may only set the keys listed in `SLOT_TOKENS`; anything else fails validation with a clear message. Values cannot contain `; { } < >` or a backslash.
2. **Recipes.** Named CSS classes (`.r-<id>`) for decorations and patterns: filigree corners, holo lattices, neon tubes. Data names them; `recipes.css` implements them.
3. **Effects.** Named animations. Attack items give one effect per job (`fighting`, `mining`, `logging`); tick items give one effect.

An item only lists what it changes: tokens it does not set are inherited from the starter item of its slot. Recipes and effects are not inherited.

## Screen shell

The header, sidebar, framed panels and tooltips (DESIGN.md §11) are skinned by the **table** item, so equipping a table re-skins the whole screen. Token groups, each following the card's `<surface>-bg / -line / -ink / -ink-muted` pattern:

| Group      | Tokens                                                                            | Used by                     |
| ---------- | --------------------------------------------------------------------------------- | --------------------------- |
| `chrome-*` | `bg`, `rail-bg`, `line`, `ink`, `ink-muted`, `accent`, `active-bg`                | Header and sidebar          |
| `frame-*`  | `bg`, `radius`, `line`, `title-bg`, `title-line`, `title-ink`, `ink`, `ink-muted` | Framed panels on every page |
| `tip-*`    | `bg`, `line`, `ink`, `ink-muted`                                                  | Hover and focus tooltips    |

The starter table must set every table token (a test checks this). Code: `src/renderer/src/shell/` (shell, tooltip, icons, stat breakdowns). `node scripts/a11y-shell.mjs` (with the app running on `--remote-debugging-port=9222`) checks contrast on every page for every table item, keyboard reach and focus rings.

## Layers on a card

From back to front: rarity body, panel backgrounds (plate, art window, stats), finish, decoration, card text, rank footer. Rank effects (star-6 rings, prismatic aura) sit outside the card edge, so rank and cosmetics never cover each other.

## Upgrade levels

`levels` is a list, lowest first. Level N shows levels 1..N merged: later tokens win, recipes accumulate (level 3 of Gilded Filigree applies `filigree-1`, `filigree-2` and `filigree-3`), effects are replaced. Design each level to add one visible thing.

## Adding things

- **A new cosmetic using existing recipes:** add an entry to `cosmetics.json`. No code.
- **A new recipe:** add `.r-<id>` to `recipes.css` and the id to `RECIPES` in `registry.ts`. Tests fail if data names a recipe that is not registered, or a registered recipe has no CSS.
- **A new effect:** implement it in `effects.ts` and add the id to `EFFECTS`.
- **A new slot** (for example a colour theme or a layout skin): add it to `COSMETIC_SLOTS` and `SLOT_TOKENS` in `schemas.ts`, add one starter item in `cosmetics.json`, and use its tokens in CSS. If it is drawn per card, also add it to `CARD_SLOTS` and `wearRules`. Components read tokens, so they do not need rewriting. Adding a slot changes saved loadouts only by adding a key, so old saves stay valid.

## Checks

- Startup validates all data and throws a readable error listing every problem.
- `assertVisualsImplemented` fails at startup if data names a recipe or effect that does not exist.
- `npm test` covers equipping, card-exclusive overrides, wear rules, level merging, set detection and invalid data.
- `node scripts/a11y-audit.mjs` (with `npm run dev` running) checks text contrast across every table x border x rarity, reduced motion and keyboard access.
