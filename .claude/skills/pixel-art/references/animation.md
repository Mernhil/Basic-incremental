# Animation and effects

How to make pixel sprites and effects move with weight, in the Brave Frontier spirit, inside the game's clean-pixel rules (DESIGN.md 13: whole-pixel positions, no blur, no soft glows, slow and calm element effects, reduced motion respected).

## Contents

1. Timing basics
2. Parts-based animation under clean-pixel rules
3. Loops: idle, shine, sparkle
4. Action: attack, hit, hurt
5. Cel effects: how to build them
6. Element effects (DESIGN 13 table)
7. Reduced motion
8. Frame budget
9. Learned from Brave Frontier sprites (Behance)
10. Learned from The Spriters Resource sheets
11. Core animation principles in pixel terms

## 1. Timing basics

- Use per-frame durations, not one fixed frame rate. Key poses and impacts hold longer (150 to 300 ms), in-betweens are short (40 to 80 ms).
- Every action has four beats: **anticipation** (small move the other way, held), **action** (one or two very fast frames, often a smear), **impact/hold** (the strongest pose, held), **recovery/settle** (ease back, slightly overshooting then settling).
- Ease with spacing: frames bunch up near key poses and spread out in the middle of a move.
- Secondary motion (ribbons, flames, hair, capes, chains) follows the main mass and lags it by one or two frames, then overshoots and settles. This lag is most of what makes Brave Frontier sprites feel alive.
- Never move everything at once. Stagger parts by a frame.

## 2. Parts-based animation under clean-pixel rules

Brave Frontier builds units from parts animated as layers (offset, rotation, scale per frame), which gives smooth motion from few drawings. Our rules forbid sub-pixel positions and smoothed rotation, so:

- Move parts by whole pixels only. A 1 px bob reads clearly at our scale; 2 px is already a big move.
- Never rotate a pixel part by arbitrary angles in code (it creates jaggies and broken outlines). For angles beyond 90° steps, redraw the part as a new frame.
- Never scale a pixel part except by whole numbers. For grow/shrink, draw size steps.
- A cheap, clean trick: swap one part's drawing (a ribbon in three positions, a flame in four shapes) on its own timing while the rest stays still.

## 3. Loops: idle, shine, sparkle

- **Idle breathing (bosses, Crystal Sentinel):** 4 to 8 frames; body moves 1 px down, holds, moves back; appendages lag a frame; floating things bob on a slower cycle than the body so the loop doesn't feel mechanical.
- **Shine sweep (Gold and Prismatic frames):** a diagonal band 2 to 4 px wide of light tones that steps across the metal, only on metal pixels, then a long pause (the pause is part of the effect; the shine should feel occasional).
- **Twinkles:** plus-shape sparkle in 3 to 4 frames (dot → small plus → big plus → small plus → gone), random but seeded positions, frequency rises with rarity.
- **Orbiting shards and sparks:** move along a path in whole-pixel steps; when behind the item, draw them behind (and darker); in front, brighter. Depth changes are what make orbits read.
- Make loops seamless: the last frame should flow into the first, not repeat it.

## 4. Action: attack, hit, hurt

- **Slash (DESIGN 13):** a single brush stroke, straight with a slight curve, tapered, with dry-brush streaks, re-rolled every hit and centred on the target. Pixel construction: frame 1 a thin bright line (anticipation is the card's own wind-up), frame 2 the full thick arc with a near-white core and coloured edges, frame 3 hold with streaks breaking off, frames 4 to 5 the stroke thins from the back end and breaks into dashes, then gone. Colour follows the element.
- **Impact hit (bows, pickaxes):** frame 1 a white star-shaped flash (4 or 8 points), frame 2 a coloured burst with an expanding ring, frames 3 to 4 the ring thins and breaks into segments while a few square particles fly out and shrink, then gone. The first frame can be held slightly longer for punch.
- **Hurt / boss hit:** 1 frame where the whole sprite flashes to a light tone (or white), then a 1 to 2 px knockback away from the hit and a return over a few frames.
- **Dissipation:** effects end by thinning and breaking into pieces (dashes, squares, dots) that shrink, never by fading opacity. Opacity fades blur pixel art.

## 5. Cel effects: how to build them

Brave Frontier-style effects look rich because they are layered. Build each effect from:

1. **Dark edge** (the effect's outline tone, or ink for cartoon shapes) — what makes effects read on any background without soft glows.
2. **Body colour** (element mid tone).
3. **Bright core** (element light tone, then near-white in the centre).
4. **Particles**: squares, diamonds and plus shapes, 1 to 3 px, that shrink over their life.
5. **Speed lines / streaks** in the direction of motion, broken into dashes.

Glow without blur: put a 1 px ring of a lighter-than-background tone around the effect, or a checkered half-dither ring that appears for one frame only. Use these sparingly; DESIGN 13 bans soft glows.

Shape language: fire is teardrop blobs that rise and split; lightning is jagged lines with 1 px forks, redrawn every few frames; light is concentric outline copies of the item; nature is leaves (3 to 5 px) on a spiral path; earth/crystal/void is jagged cracks that flicker.

## 6. Element effects (DESIGN 13 table)

Element effects appear from the Gold tier, stronger at Prismatic, and stay secondary: slow and calm, mostly behind the item, a smaller part in front, generated from the item's own shape (`fxGeometry.ts`).

| Element              | Pixel construction                                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fire                 | Flame tongues on the edge pixels of the item, 3 to 4 shapes cycling at uneven timings so the highs and lows drift; optional stream of embers off the tip, rising and shrinking |
| Storm                | Jagged 1 px lightning between two points on the item outline or off the tip, redrawn every 2 to 4 frames, with a short pause between bursts                                    |
| Light                | Copies of the item outline stepping outward 1 px at a time and breaking into sparks                                                                                            |
| Nature               | Leaves following a spiral around the item, behind on the far side, in front on the near side                                                                                   |
| Earth, crystal, void | Cracks inside the item in its own colour, flickering bright/dim like the storm arcs                                                                                            |

## 7. Reduced motion

Under `prefers-reduced-motion`, every loop stops on one chosen still frame (the most readable one: shine at rest, sparkles off, effect at a calm pose). Hits play a single frame or none. Gold and Prismatic frames are still (DESIGN 13).

## 8. Frame budget

| Animation           | Frames                                                      |
| ------------------- | ----------------------------------------------------------- |
| Twinkle             | 3 to 4                                                      |
| Idle loop           | 4 to 8                                                      |
| Slash or impact hit | 4 to 6                                                      |
| Element effect loop | 6 to 12 (or procedural from shape)                          |
| Shine sweep         | as many steps as the band needs to cross, plus a long pause |

Prefer fewer, stronger frames with good timing to many weak in-betweens.

## 9. Learned from "Brave Frontier / Animated Pixel Art Sprites" (Petshopbox Studio, Behance, 2026-11-07)

Studied 25 animated unit sheets by watching them play and zooming into timed screenshots (frame data could not be read directly, so timings below are approximate). Principles only, in my own words:

- **Every unit is one big, readable shape with a small head.** The body is a tiny core (about a quarter of the area); the weapon, wings, cape or beast companion carries the silhouette. Details cluster on the face and gem; the rest stays flat and chunky.
- **Idle is a gentle bob plus a busy aura.** The body barely moves; the life comes from secondary layers: flames licking up in 3 to 4 uneven shapes, embers rising, cloth and hair lagging, a ring or rune floating below the feet. Layers loop at different lengths so the whole never visibly repeats.
- **Special attacks follow a clear beat sheet:** (1) the idle pose drops and a glow gathers at the chest or weapon, (2) the glow grows into one big soft orb or arc that is the brightest and biggest thing in frame, (3) a short held peak where the orb is at full size with a bright white core and a sparkle, (4) release: the effect streams away in one direction as separate small pieces (notes, shards, embers) trailing thin streaks, (5) pieces fade, the glow shrinks, the unit returns to idle. Charge and release are about equal in length; the peak is held noticeably longer than any single in-between.
- **Effect pieces are a different shape family from the body.** A music hero fires notes and staff lines; a fire hero fires flame tongues. Each piece is a few pixels, has its own tiny ramp, and trails 1 px lines in a lighter tone, so motion reads even in a still.
- **Blank beat before the loop.** Several sheets cleared to empty for a moment, then the unit pops back in. That pause makes each loop read as a fresh performance rather than a stutter; a still frame is never used as the pause.
- **Glow is the only soft thing.** Orbs and auras use a few concentric rings stepping from white to hue to a darker hue, in hard-edged bands, rather than a blur. At 1x the band steps look smooth; at 4x they show as clean contours.
- **Ground anchor.** Units stand on a ring or circle of the element's colour that pulses a little, so a floating, oversized sprite still feels placed.

How this applies here: card items should keep a calm idle (shine, small sparkles), and use the charge, held peak, release, settle beat only for hits and unlock moments. Keep effect pieces a different shape family from the item, with one lighter 1 px trail.

## 10. Learned from The Spriters Resource sheets (2026-11-07, source: The Spriters Resource, "Brave Frontier" mobile page)

From the extracted part sheets of a goblin and a fire blob creature, zoomed to 4×. Principles only, in my own words:

- **The sheets are parts, not whole frames.** Bodies, heads and effect pieces (flame tufts, plumes, blade smears) are stored separately, each drawn in several rotations. The game builds frames by placing parts with small offsets. Under the clean-pixel rule, draw each rotation as its own part instead of rotating in code.
- **Enemy idle (about 4 frames):** shoulders and arms rise and fall 1 px, the weapon tip moves 1 to 2 px, and the head accessory (plume or flame tuft) sways the most and lags a frame behind the body. The legs and the shadow stay still.
- **Enemy attack:** two anticipation frames with the weapon raised overhead and the body leaning back, then a lunge frame with the body forward and the blade extended level, with a separate pale crescent smear for the swing (draw it in hard pixels here, breaking into dashes), then a short recovery back to idle.
- **Blob creatures** squash flat on landing and stretch forward on attack with the mouth wide open; the attack is carried by the body shape, not a weapon.
- **The shadow ellipse never moves with the body**; it only shrinks a little when the creature leaves the ground.

## 11. Core animation principles in pixel terms (2026-11-07)

The user pointed to the Udemy course "Pixel Art Animation for Game Developers: Learn the Basics" (Youssef Ankousse). Its lessons are behind a paywall, so nothing here comes from the course itself. This section covers the topics in its outline that the notes above did not yet spell out, written from general animation craft and applied to this game's clean-pixel rules. If the user shares notes from the course, add them here with the source.

- **Squash and stretch keeps the volume.** When a shape squashes 2 px shorter it gets about 2 px wider, and the reverse. Squash on contact and landing, stretch on the fastest frame. In pixels, use 1 to 2 px steps for small sprites and up to 4 px for big blobs. Rigid things (blades, armour, gems) never squash; they move instead.
- **Timing and spacing are separate choices.** Timing is how long each frame holds (per-frame durations). Spacing is how far things move between frames. Pixel sprites have few frames, so get easing from spacing: big jumps in the middle of a move, 1 px steps near the key poses.
- **Arcs.** Natural motion follows curves: a weapon tip, a swinging tail, a bobbing head and a falling leaf all trace arcs, not straight lines. Plot the path of the leading point first, then place it on the arc frame by frame. Straight-line paths make pixel motion look robotic.
- **Smear frames.** A smear stands in for an in-between that would be too fast to read. Build it as one frame where the moving part is stretched along its path (a blade becomes a crescent, a fist a teardrop) or repeated as 2 to 3 outlines. Hold it for one short frame only (40 to 60 ms), then show the impact pose. In this game, smears are hard-pixel shapes in the part's own lightest tones, never motion blur.
- **Straight ahead versus pose to pose.** Use pose to pose for anything with a clear story (attacks, hits, evolutions): draw the key poses first, check the timing with just those, then add in-betweens. Use straight ahead for loose, organic motion (fire, smoke, water, falling leaves, wisps): draw one frame after another without planning keys. Mixed: key poses for the body, straight-ahead loops for the effects on top.
- **Exaggeration.** Pixel sprites are small, so poses must be pushed further than feels natural: deeper crouches, bigger wind-ups, wider mouths, longer smears. If a key pose is unreadable as a silhouette at 1×, it is not exaggerated enough.
- **Idle cycles.** Pick the 2 to 3 parts that move (chest, head accessory, weapon tip) and keep the feet and the shadow still. Offset each moving part's timing by a frame so the loop never moves as one block, and make the first and last frames flow into each other without a pop.
- **Attack keyframes.** Block in four poses first (ready, wind-up, contact, recovery), play them at game speed with holds, then add one smear between wind-up and contact and one settle frame after recovery.
- **Clean-up pass.** After the timing works, redraw each frame: fix outline breaks and doubled corners, keep every colour cluster consistent from frame to frame (a highlight must not jump around), remove single-pixel flicker that is not a deliberate sparkle, and check the GIF at real speed again.
- **Form transitions (evolutions).** For the ★6 evolution and boss phase changes: anticipation (the old form gathers light and shrinks slightly), a held flash or silhouette frame that hides the swap (full-white or single-colour silhouette for 1 to 2 frames), then the new form overshoots in size by 1 to 2 px and settles, with effect pieces (sparks, petals, shards) bursting outward. Never cross-fade between forms; opacity fades blur pixel art.
