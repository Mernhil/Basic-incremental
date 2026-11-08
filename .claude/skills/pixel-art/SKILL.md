---
name: pixel-art
description: Pixel art, sprite animation and pixel effects for Basic Incremental, in the cel-shaded Brave Frontier style the game uses. Use this skill for EVERY graphics task, however small - drawing or redrawing any sprite (card items, weapons, frames, gems, coins, tiles, bosses, icons, unique evolutions), animating anything (idle loops, attacks, hits, frame shine, sparkles), element effects, palette or shading tweaks, and reviewing whether existing art follows the pixel rules. Use it even when the request only says "make it look better", "tweak the colour", "fix the sword" or "add an effect".
---

# Pixel art for Basic Incremental

The game is switching from vector to pixel art (DESIGN.md §12). Your job is to make sprites and animations that look like they came from a polished mobile RPG of the Brave Frontier era: bold readable silhouettes, chunky cel shading, saturated metals, and effects with real weight and timing.

## Order of authority

1. The user's latest instruction.
2. `docs/DESIGN.md` §12 (Art style) (pixel rules, approved assets) and `docs/BETA_PLAN.md` "Decided visuals" (approval queue). These win over everything in this skill. Read them at the start of every task; they change often.
3. This skill and its references (technique).

If a technique here conflicts with DESIGN.md (for example Brave Frontier's coloured "sel-out" outlines vs the game's single ink colour), follow DESIGN.md and mention the trade-off when you show options.

## Before you draw

1. Read DESIGN.md §12 and the BETA_PLAN approval row for the asset. Note its fixed size if approved (card items 100 × 120, production tiles 58 × 64) and what has already been decided about its shapes.
2. Look at `design/references/` if it has files. They are the user's local reference images (Brave Frontier sprites, Knights & Dragons, effect sheets). Study them for technique; never copy a sprite, never commit them (they are gitignored on purpose), never trace them.
   Online sources the user approved for study (open them in the browser when a task needs a reference; the pages block plain fetches, so use the browser tool and the sheet viewer's zoom): Brave Frontier sheets at https://www.spriters-resource.com/mobile/bravefrontier/ (units with their evolutions, part sheets and attack smears) and Brave Frontier Memories at https://www.spriters-resource.com/mobile/bravefrontiermemories/ (field sprites, portraits, backgrounds). Same rules: study technique, never copy, trace or download into the repo. What has been learned from them so far is in `references/technique.md` section 10 and `references/animation.md` section 10.
3. Read `references/technique.md` for the drawing and shading craft, and `references/animation.md` when anything moves or any effect is involved. Read `references/checklist.md` before showing anything.

## How art is built in this repo

- Sprites are authored as data on their native grid (a palette plus rows of palette indices, or rects on the pixel grid), rendered to canvas or SVG `<rect>`s at whole-number scale with `image-rendering: pixelated`. Never downscale vector art into pixels.
- Art code lives in `src/renderer/src/art/` (`kit.ts`, `items.ts`, `frame.ts`, `gems.ts`, `bosses.ts`, `fx.ts`, `fxGeometry.ts`); hit effects are in `src/renderer/src/theme/effects.*`. Keep pixel data deterministic (seeded with `rnd` from `kit.ts`) so tests and screenshots are stable.
- Element effects must be generated from the item's own shape (edges, fuller, tip), never a static picture on top (DESIGN §12).
- Respect `prefers-reduced-motion`: loops stop on a good still frame, not a blank or mid-smear frame.

## Workflow for every change

1. **Five options.** Project rule: every visual change shows the user 5 options that differ in ways that matter (silhouette, palette ramp, detail density, motion timing, effect style), as a mockup page or screenshots, at 1× and at the scale used in game. Put drafts under `design/pixel/<asset>/`, never into `main` as final art. Label each option with what makes it different in one line.
2. **Check before showing.** Export each sprite or frame to PNG and run:
   `python3 .claude/skills/pixel-art/scripts/pixel_check.py <png or folder> [--max-colors N] [--scale S]`
   It flags semi-transparent (anti-aliased) pixels, blurred scaling, orphan pixels, too many colours and outline gaps. Fix every error; warnings need a reason.
3. **Preview animation honestly.** Build a sheet and an integer-scaled GIF with
   `python3 .claude/skills/pixel-art/scripts/sheet.py <frames folder> --durations 120,80,80,200 --scale 4`
   and look at it at game speed. Judge timing on the GIF, not on the frames side by side.
4. **Approval.** When the user picks, record it in DESIGN.md §12 / BETA_PLAN (status, size, treatment, mockup link) in the same style as the existing approved rows, then build it into the game. Until approved, the game keeps the current version.
5. **Verify** with `npm run lint`, `npm run typecheck`, `npm test` and a screenshot of the real screen (`scripts/shoot-*.mjs`).

## Quality bar in one paragraph

At game size, the silhouette alone tells you what the thing is. Every part has one ink outline, three to five tones lit from the top-left, and a white glint where light catches metal or gem. Nothing is mushy: no stray single pixels, no jaggy staircases in curves, no pillow shading, no banding of equal-width tone strips. Rarity adds parts, not just colour. Motion has anticipation, a fast action, a held impact and a settle, and secondary parts (ribbons, flames, hair, capes) lag one or two frames behind. Effects sit behind the item more than in front, and stay calmer than the hits.

## Learning from new references

When the user shares a new reference (a link, an image, a sheet) and asks you to learn from it, study it and add what you learned as short technique notes in your own words to the matching reference file here (technique, animation or a new effects file), with the date and the source name. Describe principles (how ramps shift hue, how many frames an impact holds, how a slash dissipates), not the picture itself.
