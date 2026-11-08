# Checklist before showing art

> **Rules live in `docs/ASSET_RULES.md`** (read it first; it wins over this file). This file is drawing technique only: how to draw, never what the game requires.

Run `scripts/pixel_check.py` first, then go through this by eye at 1× and at game scale.

## Rules (`docs/ASSET_RULES.md` §1 to §5)

- [ ] Native grid, whole-number scale, `image-rendering: pixelated`; no anti-aliasing, blur, gradients, soft glows, opacity fades or sub-pixel positions.
- [ ] One ink colour for outer outlines, 1 px; front-part edges in the part's own darkest tone.
- [ ] Sticker assets (bosses, tiles, coins) have the 1 px white ring; card items have the 1 px light rim.
- [ ] Lit from the top-left; 3 to 5 tones per material; white glints; sparkles are plus shapes.
- [ ] Size matches the approved size for the asset (card items 100 × 120, production tiles 58 × 64, others as approved).
- [ ] Content matches what ASSET_RULES.md says the asset shows (kind: tiered T?, unique or skin; tier look; boss body shapes; element effects).

## Craft

- [ ] Silhouette reads in one flat colour at game size.
- [ ] No orphan pixels, doubled corners, jaggy runs or banding.
- [ ] Ramps are hue-shifted; tones still distinct when desaturated.
- [ ] Detail goes where the eye should go; nothing important is under 2 px.
- [ ] Cosmetic upgrades (T1 to T6) add parts or trim, not only colour; T2 to T4 share one look; no light or animation below T5.

## Motion

- [ ] Anticipation, fast action, held impact, settle; per-frame durations vary.
- [ ] Secondary parts lag and overshoot.
- [ ] Effects end by breaking up and shrinking, not fading.
- [ ] Element effects are calm, mostly behind the item, from its own shape.
- [ ] Reduced motion stops on a good still frame.
- [ ] Looked at the GIF preview at real speed.

## Process

- [ ] Five options that differ in ways that matter, each labelled in one line.
- [ ] Drafts in `design/pixel/<asset>/`, not merged as final art.
- [ ] No reference image copied, traced or committed.
