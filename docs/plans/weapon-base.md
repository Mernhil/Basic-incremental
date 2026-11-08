# Plan: the new weapon base (item types, tiers, rarities, Heirlooms)

Approved in the home chat on 2026-11-09. Paired with the Code prompt "Weapon base rework". The prompt opens with the document edits; this plan is the work that follows them. Delete this file in the PR that implements it (`CLAUDE.md`, Workflow).

## 1. What was decided (user, 2026-11-09)

**Item types (11).** Every card item is remade from scratch.

| Job      | Types                                                               |
| -------- | ------------------------------------------------------------------- |
| Fighting | sword, greatsword, spear, lance, dagger, hammer, bow, staff, scythe |
| Mining   | pickaxe                                                             |
| Logging  | logging axe (shown as "Axe" in item names)                          |

Removed kinds: twin_blades, hatchet, maul, chisel, geode_hammer, gauntlet.

**Rarities (6).** Common, Uncommon, Rare, Epic, Legendary, Mythic/Void. Mythic and Void are one top rarity with two sides, equal in power, differing only in look: Mythic heroic, Void villainous. Exotic is removed; Uncommon is new.

**Tiers.** Rarity caps the tier.

| Tier     | Name and item name           | Cosmetic upgrades | Look                                                                             | Light, effects                  | Highest tier for                   |
| -------- | ---------------------------- | ----------------- | -------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------- |
| T1       | Wooden + type                | 0                 | the type's base model in wood                                                    | none                            | Common                             |
| T2       | Bronze + type                | 1                 | base model in bronze                                                             | none                            | Uncommon                           |
| T3       | Silver + type                | 2                 | base model in silver                                                             | none                            | Rare                               |
| T4       | Golden + type                | 3                 | base model in gold                                                               | none                            | Epic                               |
| T5       | Prismatic + name + type      | 4                 | base model in a crystal-like material; upgrade 4 may reach the whole item        | light effects, small animations | Legendary                          |
| T6       | Mythic or Void + name + type | 5                 | heroic (Mythic) or villainous (Void) version; upgrade 5 may reach the whole item | full effects and animation      | Mythic/Void                        |
| Heirloom | its own name                 | none (fixed art)  | a separate fixed design, the pinnacle of the weapon                              | the strongest                   | Mythic/Void, by a tier-up after T6 |

- Upgrades 1 to 3 each upgrade one part, drawn per tier in that tier's material (not a recolour of the previous tier's part). Each tier keeps the earlier upgrades.
- Upgrades 4 and 5 are not tied to one part: they may reshape the whole item without replacing it, and add effects and animation. T5 is deliberately less cool and less powerful than T6, so the top tier is the goal.
- T6 and the Heirloom follow the card's side: a Mythic card shows the Mythic version, a Void card the Void version. Every type has both.
- "Unique" is renamed **Heirloom** everywhere (docs, data, code, on-screen text, saves).

**Parts per type** (demo version, user: "for a demo of the system it seems fine").

| Type        | Parts                                            | Up 1 (T2) | Up 2 (T3)  | Up 3 (T4)  |
| ----------- | ------------------------------------------------ | --------- | ---------- | ---------- |
| Sword       | grip, crossguard, pommel, blade, tip             | grip      | crossguard | pommel     |
| Greatsword  | grip, crossguard, pommel, ricasso, blade         | grip      | pommel     | crossguard |
| Dagger      | grip, guard, pommel, blade, spine                | grip      | pommel     | guard      |
| Spear       | shaft, collar, butt spike, spearhead, side wings | shaft     | butt spike | collar     |
| Lance       | grip, vamplate, shaft, pennant, point            | grip      | pennant    | vamplate   |
| Hammer      | handle, langets, butt cap, head, striking face   | handle    | butt cap   | langets    |
| Bow         | grip, arrow rest, limbs, limb tips, string       | grip      | limb tips  | arrow rest |
| Staff       | shaft, rings, butt cap, head, focus orb          | shaft     | butt cap   | rings      |
| Scythe      | shaft, hand grips, collar, blade, blade tip      | shaft     | hand grips | collar     |
| Pickaxe     | handle, langets, butt cap, head, pick points     | handle    | butt cap   | langets    |
| Logging axe | handle, langets, butt cap, head, cutting edge    | handle    | butt cap   | langets    |

**Names** (confirmed by the user).

| Type        | T5                           | T6 Mythic                    | T6 Void                 | Heirloom Mythic | Heirloom Void |
| ----------- | ---------------------------- | ---------------------------- | ----------------------- | --------------- | ------------- |
| Sword       | Prismatic Dancer Sword       | Mythic Light Sword           | Void Shadow Sword       | Solaris         | Nightfall     |
| Greatsword  | Prismatic Glacier Greatsword | Mythic Sunbreaker Greatsword | Void Ruin Greatsword    | Kingsoath       | Grimhowl      |
| Dagger      | Prismatic Whisper Dagger     | Mythic Gleam Dagger          | Void Venom Dagger       | Lumen Fang      | Nightsting    |
| Spear       | Prismatic Shard Spear        | Mythic Valor Spear           | Void Wraith Spear       | Skypiercer      | Abyss Thorn   |
| Lance       | Prismatic Mirror Lance       | Mythic Paladin Lance         | Void Dread Lance        | Sunrider        | Doomrider     |
| Hammer      | Prismatic Facet Hammer       | Mythic Thunder Hammer        | Void Quake Hammer       | Worldforge      | Grave Anvil   |
| Bow         | Prismatic Rainbow Bow        | Mythic Seraph Bow            | Void Wither Bow         | Starweaver      | Umbral String |
| Staff       | Prismatic Kaleido Staff      | Mythic Sanctum Staff         | Void Hex Staff          | Lifebloom       | Soulwell      |
| Scythe      | Prismatic Halfmoon Scythe    | Mythic Mercy Scythe          | Void Grim Scythe        | Graceharvest    | Last Breath   |
| Pickaxe     | Prismatic Vein Pickaxe       | Mythic Lodestar Pickaxe      | Void Hollowdeep Pickaxe | Heartdelver     | Deepmaw       |
| Logging axe | Prismatic Glass Axe          | Mythic Grove Axe             | Void Blight Axe         | Elderwarden     | Rotfeller     |

T1 to T4 are named "<material> <type>": Wooden Sword, Bronze Sword, Silver Sword, Golden Sword (Wooden Axe for the logging axe).

**Frames.** New frames: Wood (T1), Mythic and Void (T6), and an own Heirloom frame in a Mythic and a Void version. Bronze, Silver, Gold and Prismatic stay.

**Legacy skins.** The old art lives on only as legacy skins (the user's Keep picks from the weapon art catalogue, https://claude.ai/artifact/4uoyseanUf1bBK811xPx4J) and as style references (the Learn picks). Everything else leaves the game; git history keeps it.

| New type | Legacy skins (catalogue label → today's art)                                                                                                                                                                                                                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bow      | 7b `item-bow-rare`, 7e `item-bow-mythic`, 7h `item-bow-epic-0-red` (animated), 7i `item-bow-mythic-6-red` (animated), 18a `legacy-bow-01` Crimson Draw, 20c `legacy-bow-30` Evergreen Wrath, 20d `legacy-bow-31` Twilight Reed, 20g `legacy-bow-34` Bloodmoon Bow, 20i `legacy-bow-36` Nebula Thorn, 21h `legacy-bow-17` Plain Truth |
| Scythe   | 12d `evo-soul_reaper-0-base` (Soul Reaper, animated) and its skins 13a–13l (`skin-scythe-01..12`)                                                                                                                                                                                                                                    |
| Hammer   | 6f `item-maul-exotic`, 6g `item-maul-void`                                                                                                                                                                                                                                                                                           |
| Sword    | 12a `evo-flameblade` (Flameblade, with its live motion)                                                                                                                                                                                                                                                                              |
| Staff    | 14c `legacy-staff-03` Night Herald                                                                                                                                                                                                                                                                                                   |

The scythe skins stop being free test skins: like every legacy skin they come from the Legacy Gate.

**Style references** (Learn picks, to copy into the pixel-art skill; ★ = also Keep, the stronger references): ★6f, ★6g, ★7b, 7d, ★7e, 7f, 7g, ★7h, ★7i, ★12a, ★12d, ★13a–★13l, 15h, 16a, ★18a, 19a, 19b, 19c, 19d, 19f, 19h, 19i, 20a, 20b, ★20c, ★20d, 20e, 20f, ★20g, 20h, ★20i, 21c, ★21h, 21i. Labels map to files through the catalogue page (group titles and names).

**Picker rule.** Every choice between pictures (art, UI options, existing assets) is shown on an interactive picker page: labelled pictures (1a, 1b...), click = Keep, right-click or L = Learn, Copy list. Keep + Learn is a stronger reference than Learn only.

## 2. The work, in order

Commit the document edits from the prompt first (DESIGN.md rule 4), then:

1. **Data model.** Rarities (add `uncommon`, remove `exotic`; `mythic` and `void` equal in every rarity-keyed number); item kinds (the 11 types; remove the six old kinds); tiers T1–T6 + Heirloom with the rarity caps; a data file for item names per type and tier (T1–T4 built from material + type, T5/T6/Heirloom from the names table, T6 and Heirloom by the card's side). Schemas and `check-cards.mjs` follow.
2. **Rename Unique → Heirloom** in data, schemas (`UNIQUE_ITEM_KINDS`, `evolution`), game logic, copy and tests. Every type has Mythic and Void Heirloom names; the Heirloom tier opens for a type only when its Heirloom art is approved (as today for uniques), so no card reaches it until the art plan lands.
3. **Cards.** Logging cards carry the logging axe, mining cards the pickaxe; fighting cards keep sword/greatsword; the three that do not fit get the defaults below.
4. **Legacy skins.** Rebuild `weaponSkins.json` to exactly the table above, keyed by the new types; drop every other skin from the data. Delete the PNGs no longer used by the game **after** copying the Learn picks into the references (step 6). Old ladder art stays only as interim looks (defaults below).
5. **Saves.** One version bump and migration (`CLAUDE.md` rule 9): old tiers by name (Bronze → T2, Silver → T3, Gold → T4, Prismatic → T5, Unique → T6 of the card's side), clamped to the card's rarity cap; Exotic → defaults below; dropped skins unequipped (wearing "Original"), owned dropped legacy skins removed; equipped kept skins moved to their new type.
6. **References.** Copy the Learn picks (PNG and animation strip) into `.claude/skills/pixel-art/references/style/` with an `index.md` listing each file, its catalogue label, what it is and whether it is Keep + Learn (listed first) or Learn only. Point `SKILL.md` "Before you draw" at it.
7. **Picker tool.** A reusable script (`scripts/art/picker.mjs` or similar) that takes a folder or a list of pictures with group titles and writes the labelled picker page (Keep, Learn, Copy list, show only marked, animation strips played, light and dark). Base it on the catalogue page.
8. **Tuning with the sim** (`npm run sim -- --hours 40 --seeds 5`): level caps, tier-up costs, star bar, base stats, card cost, enhancement budgets for six tiers and six rarities. All `[Default]`, listed under Open questions.
9. **PROJECT_OVERVIEW.md** rewritten for everything touched; DESIGN.md tags moved to `[Built]` where built.

Out of scope: drawing the 99 new pictures and the new frames (an art plan per type, with PixelLab, shown on the picker page), a new card roster, the Legacy Gate screen (0.5.0 UI rework).

## 3. Defaults Claude fills in (tag `[Default]`, list under Open questions)

- **Cards that do not fit:** Storm Duelist carries a dagger; Reaper Test Card carries a scythe (it stays the skin test card); Core Titan becomes Void.
- **Uncommon:** green card body; every rarity-keyed number sits between Common and Rare. **Mythic = Void:** one value for both, tuned with the sim; Mythic keeps the neon pink body, Void the black chrome.
- **Exotic in saves:** Exotic cards become Void; Exotic cosmetics and legacy skins become Mythic.
- **Legacy skin rarities:** each kept skin keeps its rarity, Exotic → Mythic; Flameblade Mythic; Soul Reaper and its skins Void.
- **Interim looks:** until a type's new art is approved, it shows the nearest old ladder art (sword, greatsword and staff keep theirs; hammer the maul; bow the bow; pickaxe the pickaxe; logging axe the hatchet; dagger the twin blades), or a plain labelled placeholder (spear, lance, scythe). Interim frames: Wood shows the Bronze frame, Mythic, Void and the Heirloom the Prismatic frame. Old art is deleted type by type as the new art lands.
- **Migration clamp:** a card above its new cap keeps its stars and level up to the cap; the tier-up costs of the removed steps are paid back.
- **Pacing targets** keep their tier names (First Silver card = T3, First Gold card = T4, First Prismatic card = T5); the sim result is reported in the PR, and any target that cannot hold is a question for the user, not an edit.
- **Picker script** location and options.

## 4. Done when

Lint (including `check-design` and `check-workflow`), tests and build pass; the sim report is in the PR; a screenshot of the Cards page and the Wardrobe "Weapon skins" tab shows the new tier names and the kept legacy skins; this file is deleted in the same PR.
