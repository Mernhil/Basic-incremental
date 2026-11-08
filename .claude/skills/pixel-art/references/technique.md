# Drawing technique

Craft notes for static sprites in the Brave Frontier-style cel look. DESIGN.md §12 overrides anything here.

## Contents

1. What the Brave Frontier look is made of
2. Silhouette and size
3. Outlines
4. Colour ramps
5. Shading and materials
6. Lines and curves
7. Detail and rarity
8. Common mistakes
9. Learned from Brave Frontier sprites (Behance)
10. Learned from The Spriters Resource sheets

## 1. What the Brave Frontier look is made of

Brave Frontier units are mid-resolution pixel sprites (roughly 100 to 150 px tall), seen side-on at about three-quarters, with big readable weapons, flowing secondary shapes (capes, scarves, hair, ribbons) and very saturated colour. What makes them look premium rather than retro:

- **Mid resolution, chunky clusters.** Enough pixels for real anatomy and ornament, but every tone is placed in clusters of several pixels, so it still reads as pixel art, not a downsampled painting.
- **Hue-shifted ramps.** Shadows move toward cool hues (blue, violet), highlights toward warm ones (yellow, cream). A ramp is never one hue darkened and lightened.
- **Hard cel shadows with a lit rim.** One clear shadow shape per part, a highlight band on the lit edge, often a thin reflected light on the far edge to separate the part from the dark around it.
- **Metal is contrast.** Polished metal jumps from near-black to near-white within a few pixels, with a sharp specular glint; that contrast is what makes it read as metal at small size.
- **Parts-based construction.** Units are assembled from separate parts (head, torso, arms, weapon, cape pieces) that are animated as layers. That lets a few drawings produce smooth motion. See animation.md for how this works under our clean-pixel rule.
- **Effects are the show.** Skills fill the screen with layered cel effects (bright cores, coloured bodies, dark edges, particles). Our game keeps effects secondary to the item, so borrow their construction, not their size.

## 2. Silhouette and size

- Draft the silhouette in one flat colour first. If it doesn't read at 1× in game, no shading will save it.
- Exaggerate what identifies the object: a sword's guard, an axe's bite, a bow's curve. Make thin things at least 2 px thick at the narrowest point that must read (blades can taper to 1 px only at the tip).
- Keep a clear negative space between parts (grip and guard, crown points) so they don't merge into a blob.
- Lean, tilt or curve the main axis (items at a slight diagonal look more dynamic than vertical ones), but keep the same angle across a family so cards line up.
- Use the full canvas: approved sizes are fixed per asset; leave the margin the outline, light rim and sparkles need (2 to 3 px), nothing more.

## 3. Outlines

- Game rule: one ink colour (`INK` in `kit.ts`) for every outer outline, one pixel wide. Stickers (bosses, tiles, coins) add a 1 px white ring outside the ink. Card items add a 1 px light rim outside the ink for dark windows.
- Internal lines where a front part overlaps another use the front part's darkest tone, not the ink, so the interior stays lighter than the silhouette.
- Outline corners: for curves, use pixel-perfect lines (no L-shaped doubled corners). For straight edges, the outline can be continuous.
- Brave Frontier often lightens the outline on lit sides (selective coloured outlining). The game uses one ink, so get the same effect with the lit-edge band inside the outline instead (DESIGN §12 "light extra shading").

## 4. Colour ramps

- Each material gets 3 to 5 tones (DESIGN §12). Typical: shadow, base, light, highlight, plus a shared white glint.
- Build ramps with hue shift: as tones get darker, rotate hue 10 to 30 degrees toward blue or violet and raise saturation a little; as they get lighter, rotate toward yellow and lower saturation near the top.
- Keep value steps clear and even: test by desaturating; adjacent tones must still be distinguishable.
- Share tones across materials where possible (the same dark violet can be the shadow of red cloth and of blue steel). Fewer colours make a stronger, more unified sprite.
- Saturation is highest in the midtones, not in the shadow or highlight.
- Element and rarity colours already exist in the theme; pull from them so art matches the UI.

## 5. Shading and materials

- Light comes from the top-left. Shadow sits on the bottom-right of every form; the highlight on the top-left edge.
- One shadow shape per part, with a deliberate edge (hard for metal, gem facets and cloth folds; a stepped two-tone edge for round forms). No soft gradients, no dithering for smooth shading (dither only as an intentional texture, sparingly).
- Avoid pillow shading (darkening every edge equally around the centre); it flattens forms.
- **Polished metal (blades, gold):** strong dark-to-light contrast along the length, a bright edge line on the lit bevel, a 1 to 3 px white specular glint, a darker reflection band in the middle of the blade.
- **Bronze and patina:** warmer, lower contrast, a few hammer dents (a dark pixel with a light pixel beside it on the lit side), green patina clusters in recesses.
- **Gems:** faceted: a dark side, a mid side, a bright facet, a white glint at the top-left facet, and a lighter "inner glow" pixel cluster on the bottom-right inside the outline (light passing through).
- **Wood and leather wraps:** diagonal bands with a dark gap between turns; the lit side of each band gets one light pixel row.
- **Cloth and ribbons:** folds as alternating light/shadow wedges; the underside of a turned ribbon uses a darker, cooler tone.
- **Crystal and Void:** dark body, bright thin edges, glowing cracks in the element colour, white sparkle specks.
- Glints and sparkles: pixel plus-shapes (1 px centre, 1 px arms; 2 px arms for the biggest) and single bright pixels, placed where light would catch; more of them with rarity.

## 6. Lines and curves

- Straight diagonals look cleanest at slopes of 1:1, 1:2, 1:3 (pixel runs of equal length). Uneven runs read as jaggies.
- Curves: run lengths should grow or shrink steadily (1, 1, 2, 3, 3, 4…), never jump back and forth.
- No doubled corners on 1 px lines; remove the corner pixel of every L-shape.
- No orphan pixels: a single pixel of a tone surrounded by other tones is noise unless it is a deliberate glint or spark.

## 7. Detail and rarity

- Put detail where the eye goes: the head of the weapon, the gem, the crest. Leave the grip and the far side simple.
- Rarity adds parts, not only colour (DESIGN §12 has the ladder: plain → wrapped grip and gem pommel → winged guard → serrated or ornate shape with gold inlay and ribbon → neon runes and crystal edge → forked shapes and floating rings → black chrome with glowing cracks and orbiting shards).
- Each step up should be recognisable from the silhouette alone, not just from the palette.

## 8. Common mistakes

- Shrinking vector or painted art and calling it pixel art (blurry clusters, half-tone fringes).
- Too many tones (muddy) or tones too close in value (flat).
- Banding: two or more tone strips of equal width running parallel to the outline.
- Black used as shadow inside parts (it should be the ink only); use the darkest hue-shifted tone instead.
- Thin parts lost at game scale; details smaller than 2 px that turn into noise.
- Everything the same brightness, so nothing leads the eye.

## 9. Learned from "Brave Frontier / Animated Pixel Art Sprites" (Petshopbox Studio, Behance, 2026-11-07)

- **Value contrast beats colour contrast.** Each unit has one dark ink-like shade and one near-white highlight, with the mid tones carrying the hue; against a flat saturated background the unit still reads because of that value spread.
- **Hue-shifted ramps on metal.** Gold goes orange in shadow and pale yellow in light; steel goes blue-violet in shadow and near-white in light; purple gear goes toward blue in shadow and pink in light. Shadows are never plain darker greys.
- **Fire is built from edge shapes, not a texture.** Tongues are pointed, taper to a single pixel, and run from red at the base through orange to yellow at the tip. They hug the weapon's own outline and break into loose single-pixel embers. (Those orphan embers are deliberate; the checker should treat them as effects, not errors.)
- **Parts overlap at different scales.** A big weapon in front of a small body, wings and tails behind it. Overlap order is used for depth instead of shadows.
- **Small faces: eyes and a colour accent, nothing else.** At this size a face is a few pixels; hair colour and headgear carry identity.
- **Gems and orbs: ring, core, glint.** A darker rim, a lighter body, a 1 to 2 px white core, and a plus-shaped sparkle at the peak.

### Additions from the graphics session (2026-11-07, same Brave Frontier source)

- Scale: a unit's body is about 90 to 110 px tall; oversized weapons, wings and auras push the whole sprite to about 250 to 300 × 180.
- Lines between parts use the darkest tone of that material, not the ink, so parts separate without a colouring-book look; the ink stays on the silhouette.
- Gold trim around plates is 1 to 2 px wide with a one-pixel bright line on its upper edge.
- Tone shapes on large areas must follow the form (folds, plates). Concentric tone rings from a radial gradient read as banding (seen on the first Cinder Lich robe); break big areas with fold lines or hand-placed shapes.

## 10. Learned from The Spriters Resource sheets (2026-11-07, source: The Spriters Resource, "Brave Frontier" and "Brave Frontier Memories" mobile pages)

Studied the extracted sheets of a fire blob creature and a goblin (base form and evolutions) from Brave Frontier, and the field sprites and backgrounds from Brave Frontier Memories, zoomed to 3 to 4×. Principles only, in my own words; never copy their sprites.

**Battle sprites (regular units and enemies)**

- **They are small.** A regular enemy's body is about 50 to 60 px tall at 1×; the pose is compact and crouched (knees bent, head forward, wide stance). The weapon makes the sprite about 1.5× wider than the body. For this game: a 96 × 96 enemy canvas with a 56 to 64 px body, the rest for the weapon, plume and effects. Bosses stay bigger.
- **Outlines are coloured per material.** Red armour is outlined in its own darkest red, green skin in dark green, steel in dark slate; the outline lightens a little on lit edges. DESIGN §12 keeps one ink colour for the silhouette, so get the same effect with the part lines (darkest tone of the front part) and the lit-edge band, and say so when it matters.
- **Plate armour is all contrast.** Three to four tones per plate, a near-white specular on the upper rim of every plate, a 1 px steel or gold trim on plate edges, and one big round highlight on a chest plate or pauldron. Armour reads as metal because the jump from shadow to highlight is huge, not because of detail.
- **Weapons are oversized and high contrast.** A curved blade has a dark spine, a mid body and a 1 px near-white cutting edge, plus one bright streak along the length; the hilt is a small warm accent (wood or gold).
- **Faces are tiny and expressive.** One bright eye with a dark pupil, a 2 to 3 px brow line for the mood, a toothy grin with single white pixels for teeth. Big ears or a nose extend the head silhouette.
- **Accent colour on the head.** A plume, horsehair tail or flame tuft in a contrasting warm colour sits on top and is the part that moves most.
- **A flat shadow ellipse** (dark grey, no outline) sits under the feet as a separate sprite.
- **No dithering.** Every tone is placed in chunky clusters; transitions are hard steps.

**Creature blobs**

- Four to five tones per body, in broad cel bands that follow the volume (not concentric rings). A strong highlight band along the top, and a lighter reflected-light rim along the bottom edge just inside the outline, so the blob reads round on any background.
- Features are 1 to 2 px dots; the expression comes from the body shape (squash, a huge open mouth on attack) more than from the face.

**Evolutions (how forms grow)**

- Higher forms keep the base body and add parts: gold armour pieces, a crown, spikes, flame accessories, wings or shoulder blades. The silhouette grows with accessories, and gold and white-hot accents increase. This matches the game's rarity ladder (parts, not only colour), so use it for enemy tiers and boss phases too.

**Brave Frontier Memories**

- Field sprites are tiny chibis (about 24 to 32 px) with oversized heads and weapons, a dark outline and three tones per material: useful as a model for very small icons and markers.
- Its backgrounds are painted, not pixel art; the pixel sprites sit on top of painted scenery. Nothing to copy for this game's plain table, but it confirms that the sprite, not the scenery, carries the pixel look.
