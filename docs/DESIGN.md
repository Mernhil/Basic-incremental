# Basic Incremental — Game Design

Source of truth for game design. Anything not covered here is an open question: ask before inventing it.

## 1. Distribution

- Windows desktop game, packaged as an `.exe`. Stack: Electron + TypeScript.
- Auto-updates from GitHub Releases.
- Pushing a version tag (e.g. `v0.3.0`) triggers GitHub Actions to build the exe and publish a GitHub Release.
- The app checks for updates on launch.
- The exe is unsigned; that is acceptable.

## 2. Production

Two production jobs, **mining** and **logging**. Each produces its own resources, and higher tiers give different, better resources.

### Planning layer (plots / slots)

- Production runs on a limited, expandable number of plots (logging) or slots (mining).
- The player decides what to put in them; expanding capacity is a core progression lever.
- **Reassigning is free:** any unlocked tree kind / mine type can be put in any plot / slot, or the plot emptied, at any time and at no cost. Capacity is what the player pays for.
- **Expansion prices are exponential:** the n-th extra plot / slot costs `base × growth^n` (base and growth in data; skills and prestige can soften the growth). A new plot / slot starts empty.

### Logging

- Starts with **one tree plot**.
- Upgrades add more plots and unlock new **tree kinds**; each tree kind yields a different gem.
- Plot expansions are paid in **Money** (11.13). **Tree levels** work like mine levels: each tree kind has a level bought with Money on an exponential curve, each level adds 10% to that tree's output and every 25 levels doubles it (11.12, 11.14); tree levels reset on prestige with the plots. Each tree kind is unlocked once with the gems of the tier below (Ironbark with Oak Gems, Moonwillow with Ironbark Gems).

### Mining

- Works the same way as logging (limited slots, upgrades add capacity, higher mine types yield different gems).
- **New mine types are unlocked via dungeon expeditions.**
- Starts with **one mine slot** (Copper Quarry). Slot expansions are paid in **Money**.
- **Mine levels:** each mine type also has a level, bought with **Money** on an exponential curve; every level adds a percentage to that mine's output. Slots and mine levels both reset on prestige.
- **Trees and mines produce materials only** (the six gems). Money never comes from production (11.13).

### Resource uses (starting point)

| Resource                                    | Buys                                                                   |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| Money (dungeon drops)                       | Damage lines, mine levels, plot and slot expansions (11.13)            |
| Tree and mine gems, Cores, Frost Sigils     | Card star-ups and tier-ups of every job (11.9); tree kinds (tree gems) |
| Summon and Glamour Crystals (dungeon drops) | Summons in the Card Portal and the Wardrobe Gate (6)                   |

The resource model is the three loops of 11.13. Numbers will be tuned.

### Upgrade shelf

- Beside the level lines there is a **shelf of one-time upgrades** bought with Money (11.14): a multiplier for one tree or mine, a damage line, a dungeon's Money or crystals, a job's support cards or a burst gauge. Each appears when a threshold is reached. Per-run ones reset with the run; `permanent` ones stay.

## 3. Prestige

- Prestige **resets**: plots, mine levels, resources (gems, Money, Cores and the other materials).
- Prestige **grants**: a permanent prestige currency.
- Prestige **persists through**: damage, cards, cosmetics, unlocked dungeons / trees / mines, and the premium **crystals** (11.13).

## 4. Combat

- **Damage** is a stat bought with resources and kept through prestige.
- **Bosses** are HP walls, auto-fought in parallel with everything else (no active combat input), and they respawn so they can be farmed.
- Boss HP scales **slowly** with prestige count.
- Boss HP is shown as **stacked bars** with a **×N** count of bars left (like a fighting-game life gauge). The current bar drains over the colour of the next one. Each boss sets its number of bars.
- Attacks are automatic. Each hit plays the equipped attack animation and a floating damage number; with reduced motion the hit animations are skipped and numbers simply fade.
- New, harder **dungeons** unlock with progress.
- Dungeons drop **rare items** at low odds (e.g. 0.5%) with a **pity counter**, plus **Money and both crystals** on every kill (11.13).

### Special dungeons

- Separate from the main dungeon progression.
- They exist as **tests of the player's strength** and as the source of **cosmetic upgrade materials** and other customization bonuses.
- Inspired by how many gacha games handle this (Brave Frontier is a direct reference for the game in several respects).

## 5. Cards

- Collectible and **job-specific**: mining, logging, fighting.
- Each job has **1 main card + 3 support cards**.
- **Fighting:** the damage stat is the base power. The main card shapes how it is dealt (ticks, big hits, bursts). Support cards add bonuses or extra attacks.
- **Production jobs** work the same way: main card shapes the output, supports add bonuses.

### Rarity

Seven rarities, in order: **Common, Rare, Epic, Legendary, Mythic, Exotic, Void**. Rarity applies to cards and cosmetics.

- Rarity sets the **base colour of the card body**: steel grey, blue, purple, amber, then increasingly unusual finishes for the advanced ones: neon pink (Mythic), neon orange (Exotic), metallic black chrome (Void).
- The job (mining, logging, fighting) is shown as a label, not by colour.

### Ranks

Bronze ★1–6 → Silver ★1–6 → Gold ★1–6 → Prismatic ★1–6 (max).

- ★6 of each tier is a **big upgrade plus a visual change**.
- Star colors follow the tier; **Prismatic stars are animated**.
- **★6 shine:** at ★6 the stars get a polished light sweep that moves back and forth across the star glyphs in a loop, coloured to the tier. On Prismatic it blends with the animated stars. ★1–5 have no shine.
- **The tier is the card's frame** (see section 13): each tier-up rebuilds the frame in a new material, fills more of its gem sockets and grows its crest, staying a border (section 13). Bronze: hammered plate. Silver: engraved polished metal. Gold: scrollwork with a velvet liner, with light and motion. Prismatic: crystal with rainbow motion.
- **★6 within a tier** keeps the stars' shine and plays a one-time flash; it does not add rings. The next big visual step is the tier-up itself.
- **Prismatic is the top tier for now and must look clearly different from ★1:** wings, rainbow metal and the strongest element effect.
- **Rank visuals never clash with cosmetics:** the frame's tier ornaments (spikes, crest, wings) own the top, the sides and the area outside the edge; cosmetics change the frame's family and the card's finish (section 7). Stars are never covered.
- **Card enhancements** (Brave Frontier Omni SP style) unlock at a set card rank. See section 10.
- **Duplicates / shards add stars.**
- **Tier-ups cost a dungeon material** (see resource uses above).
- Duplicates beyond max rank convert to **shards**, spendable in a shop.

## 6. Summon portals (gacha)

- Several portals (cards, cosmetics, more later), each with its **own pool** and a **cost in a crystal** that every dungeon drops (11.13).
- **In-game currency only** — no real-money purchases.
- Rarities and **pity** apply.

### Beta portals

Decided with the user for the beta. Numbers live in data and will be tuned.

- **Pulls.** Every portal offers a **single pull** (1× cost) and a **10-pull** (10× cost). Every 10-pull **guarantees at least one Rare or better**.
- **Hard pity.** **Legendary or better at 90 pulls** without one. Pity counters are **per portal**, saved, and **kept through prestige**.
- **Rates** are shown in a hover tooltip on the portal.
- **Card Portal** costs Summon Crystals: single 10, 10-pull 100. When it ships, the **1% card drop from bosses is removed** (11.9).
- **Wardrobe Gate** costs Glamour Crystals and ships **with the Wardrobe**, never before, so cosmetics are never pulled before they can be equipped or upgraded. Same pull and pity structure. Its pool holds the cosmetic sets and loose items; **duplicates feed cosmetic upgrade levels**. Any item whose source this document does not define goes in the Wardrobe Gate at its rarity.
- **Screen.** The portals sit side by side as cards on a **shelf** (Card Portal, Wardrobe Gate), each with its pity bar and its ×1 / ×10 buttons; the reveal opens in a modal over the shelf.
- **Reveal.** The portal swirls and an **orb** drops whose colour hints the rarity, with an occasional mid-reveal **upgrade flash** to a higher colour. The card then **flips inside its frame**. A 10-pull shows a row of card backs that flip one by one. Click skips to the next; an option skips all.

## 7. Cosmetics

### Customization-driven UI

- The UI itself is part of the customization system: **nothing visual is hardcoded**. The default look is just the **starter set** of cosmetics.
- UI style: simple **card-based UI on a plain table**. More of the UI (for example colour themes or layout skins) can become customizable slots later.
- **Starter set: Gilded Nocturne.** The night-table shell and the Outfit typeface for the interface; the cards themselves follow the cel-shaded art style of section 13 with the **Knight plate** frame. Each layer of the card is a place where more extravagant cosmetics can add decoration later.
- **First unlockable set: Gilded Tradition** (classic trading card: crimson frame, gold plate, rainbow foil). The richer "Medium" gilt variant of the starter is an unlockable border.

### Slots

**Seven global slots:**

1. Card border: the **frame family**. The starter is Knight plate; other families (Dragon horn, Celestial, Crystal, Royal crest) are cosmetics. Every family grows with the tier in the same steps (section 13).
2. Card finish (holo, foil, …). Holo finishes are full-card, animated and restrained, using geometric or fluid patterns.
3. Attack animation. Attacks are automatic; one attack item contains a variant per job. Starter: a single brush-stroke slash, straight with a slight curve, that always lands on the target and varies in angle, length and thickness every hit (fighting, with sparks; logging, with chips), and an impact hit (mining and bows: shockwave, cracks, chips, dust). See section 13.
4. Tick damage style
5. Number style
6. Table background
7. Cursor

**UI-skin slots (decided 2026-11-07).** Customization is a big part of the game, so four more global slots skin parts of the interface. Like the other global slots they are always worn:

8. Starlight coin: the icon of the prestige currency.
9. Sticker style: how achievement stickers look in the sticker book.
10. Skill nodes: the gem nodes of the account tree and the card enhancement star chart.
11. Wardrobe style: the slot plates, item tiles and level ladder of the Wardrobe.

**Every option is kept (decided 2026-11-07).** All the options drawn for the beta art batch (B1–B10, mockups [Beta Art Batch](https://claude.ai/artifact/MCYUAzMXJuYwkSCnvZp52c) and [Wardrobe Options](https://claude.ai/artifact/YDW7qjLczmkvzMx4YzVAQT)) become cosmetics instead of one being picked:

- **B1 Starlight coin, B6 sticker style, B7 skill nodes, B10 Wardrobe style:** option A of each is the starter item of its UI-skin slot; options B–E are unlockable items in that slot. B6 was redrawn on 2026-11-08: all five sticker styles are now the mini card, climbing the frame ladder from a to e (section 13).
- **B2 Verdant Reverie:** option A is the Verdant Reverie set; options B–E are four more garden sets (vine, fern, moss, blossom), each a full coherent set across the seven card and table slots with its own set bonus.
- **B3 Heartwood Halo and B4 Core Pulse:** option A carries the name; options B–E are further card-exclusive borders (Moonwood Dryad) and finishes (Core Titan).
- **B5 Common and Epic loose items:** all five styles ship (forge, woodcraft, star chart, candy enamel, runestone), each with its Common border, Common numbers, Epic attack and Epic tick.
- **B8 max-level ambient particles** (rail drift, cel pop, frame orbit, slow pair, footer fountain) and **B9 corner flourishes** (acanthus scroll, pauldron plate, wing tips, gem shards, knot and cabochon) are spread across the borders and finishes, so different items reach their maximum level with different particles and corners. **Corners are pixel art** like the frames (section 13), never vector.

- Some rare cosmetics are **exclusive to one specific card** and override the global slot on that card only.
- **Wearing card cosmetics depends on the card's rank.** Any item can be owned (and its owned buff counts), but a card must reach a minimum rank to wear it; below that it shows the starter look for that slot. Starting values: card border from Gold ★1, card finish (holo) from Prismatic ★1, card-exclusive items from Prismatic ★6. Global slots (attack, tick, numbers, table, cursor) are always worn. The thresholds live in data and are expected to be tuned.
- A holo finish covers the whole card, but card text always stays above it.
- **Sources:** dungeon drops, cosmetics portal, prestige, achievements, the account reward track and the shard shop.
- **Owning** an item gives a small permanent buff.
- **Equipping a matching set** gives an extra bonus; each set must look coherent when fully equipped.

### Upgrade levels

- Cosmetics have **upgrade levels**. Each level keeps everything from the level below and adds elements, so an upgrade always reads as "more", never "different". Example: L1 corner brackets → L2 bigger flourishes with an accent colour → L3 gems and inner detail.
- Levels are unlocked with **duplicates**; each upgrade also costs **specific materials from special dungeons** (see Combat).
- **Order of additions.** Every item follows the same ladder, and a level never goes back a step:
  1. **Shape** (brackets, flourishes, patterns)
  2. **Accent colour**
  3. **Gems**
  4. **Glow**
  5. **Ambient animation**, only at the item's **maximum level**, themed to the item (floating flames, rising bubbles, stars appearing and fading, …).

  A step may span more than one level on items with a higher maximum (e.g. two shape levels), and an item with a low maximum compresses the ladder but always keeps the order and always ends on the ambient animation.

- **Ambient animations of cosmetics are small, subtle and cheap** (element effects on items follow section 13 instead): CSS only, animating `transform` and `opacity` only, at most about 6 particles per card, no per-frame scripting, paused when the card is off screen. Many cards must be on screen at once without a frame-rate cost. Under **reduced motion** they are static (a still frame of the same elements).
- **Breaking the edge.** High-level border flourishes **may extend outside the card edge**. They coexist with rank effects by zone:
  - **Corners belong to flourishes.** A flourish may reach outside the card edge by at most about 8% of the card width, only within a corner zone (the outer fifth of each side, measured from the corner).
  - **Sides and top belong to the tier ornaments** (spikes, crest gem, wings) and are never hidden by a flourish.
  - **Stars are never covered.** The rank footer is a keep-clear band: no flourish, gem or animation draws over it, and bottom-corner flourishes sit above or outside it.
  - **Where they meet at a corner**, tier spikes sit on top and the flourish tucks behind them.
  - Card tiles in grids reserve a bleed margin so flourishes are not clipped.

## 8. Saves

- JSON on disk, with **autosave**.
- **Export / import** supported.
- **Versioned with migrations.**
- **Offline progress** is capped at around **8 hours**.

## 9. Interface layout

Inspired by Brave Frontier (screen order, upgrades, the evolution / "skin" feel, the gacha), **adapted to a desktop app**: no characters, no turn-based combat, no energy or stamina timers.

- **Header bar:** account level (with XP bar) and currencies (Starlight, Money, the crystals, gems and materials).
- **Left sidebar navigation**, in this order: Home, Cards, Production, Dungeons, Summon, Skill Tree, Wardrobe, Achievements, Shop, Settings.
- **Framed panels** and **wide, multi-panel screens** that use the desktop width.
- **Hover tooltips** on stats, items, costs and modifiers.
- All of it is styled through the cosmetics / theming layer (section 7); nothing visual is hardcoded.

## 10. Skill tree

The skill tree is the **main balancing glue**. It has two layers, both in the beta. All effects are applied through the modifier system (section 11.5).

### a) Account tree

- **Account XP** comes from everything: harvests, kills, summons and prestiges. Account levels grant **skill points**.
- **Branches:** Logging, Mining, Combat, Summoning / Luck, Collection, Automation / Offline.
- **Respec** is supported.

### b) Card enhancements

- Brave Frontier Omni SP style. They **unlock at a set card rank** (the rank is data, per card).
- Each card has its **own list of options**. The card's **point budget is smaller than the total cost** of its options, so the same card can be built in different ways.
- Respec is supported.

## 11. Beta systems and content

Proposed for the beta and approved. Numbers are starting values and will be tuned.

### 11.1 Max cosmetic upgrade level by rarity

| Rarity    | Common | Rare | Epic | Legendary | Mythic | Exotic | Void |
| --------- | ------ | ---- | ---- | --------- | ------ | ------ | ---- |
| Max level | 2      | 3    | 4    | 5         | 5      | 6      | 6    |

Per the ladder in section 7, a Common (max 2) item is _shape → ambient animation_; a Void item (max 6) is shape, shape+, accent, gems, glow, ambient. The starter cosmetics stay at their current level counts, and the existing borders are moved onto this system.

### 11.2 Card levels

- Separate from ranks, in the Brave Frontier "Lv. 1/40" style.
- A card **levels up by doing its job**: fighting cards gain XP by defeating enemies in dungeons, logging and mining cards by harvesting. Only cards in a job's loadout are doing that job, so only they gain XP.
- Each star and each tier raises the **level cap**. Caps: Bronze 20 at ★1 rising to 40 at ★6; Silver 40 to 60; Gold 60 to 80; Prismatic 80 to 100 (the starting level cap is 20 and every star adds a fixed step).
- Level raises the card's base power, bonus strength and gauge speed.

### 11.3 Burst gauge ("Brave Burst") and harvest burst

- Each hit fills the **main fighting card's burst gauge**. When full, it fires a **big signature attack** (an animation per card, with a damage multiplier).
- **Support cards can fill the gauge faster.**
- **Production** has the same idea, a **harvest burst**: ticks fill a gauge on the main logging / mining card, and when full it fires a bonus harvest across all plots / slots.
- No active input; bursts fire automatically.

### 11.4 Loadout cost

- Every card has a **cost**. Each job's 1 + 3 loadout has a **cost cap** that grows with account level (and can be raised by the skill tree).
- Higher-rarity cards cost more, so strong cards force trade-offs in the supports.

### 11.5 Shared modifier system

Every tunable number (production rate, damage, drop chance, pity threshold, cost cap, offline cap, XP, costs, …) is computed through **one modifier pipeline**. Its inputs are skill trees, owned items, sets, cards and prestige. Balancing therefore means editing data.

- Each modifier has a **target** (the stat), a **kind** (flat add, percent add, multiplier, set), a **source** and an optional **condition** (job, resource, dungeon).
- Fixed order: base → flat → percent (additive within the group) → multipliers → caps / floors. Results are shown in tooltips with a breakdown by source.

### 11.6 Beta content

| Area                | Content                                                                                                                                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tree kinds (3)      | **Oak** (Oak Gem, start), **Ironbark** (Ironbark Gem), **Moonwillow** (Moonwillow Gem)                                                                                                                                        |
| Mines (3)           | **Copper Quarry** (Copper Gem, start), **Iron Deeps** (Iron Gem, unlocked by clearing Dungeon 1), **Crystal Grotto** (Grotto Gem, unlocked by clearing Dungeon 2)                                                             |
| Dungeons (3)        | **Mossy Cellar** (boss Root Warden, drops Moss Core), **Ember Crypt** (boss Cinder Lich, drops Cinder Core), **Frostspire Vault** (boss Glacier Colossus, drops Frost Core); every dungeon also drops Money and both crystals |
| Special dungeon (1) | **The Glimmer Trial**, a strength test with a fixed target and a score. Drops **Glimmer Dust** (cosmetic upgrades, shape and accent levels) and **Facet Shards** (gem, glow and ambient levels)                               |
| Cards (12)          | See below                                                                                                                                                                                                                     |
| Portals (2)         | **Card Portal** (costs Summon Crystals), **Wardrobe Gate** (costs Glamour Crystals). Frost Sigils (a material now) and the three Cores are used for card upgrades                                                             |
| Prestige            | 1 layer, **Ascension**, granting **Starlight**                                                                                                                                                                                |
| Cosmetic sets       | The two existing sets (Gilded Nocturne, Gilded Tradition) plus a new one, **Verdant Reverie** (leaf-green, moss and dew; ambient animation: drifting petals). Plus the existing loose items, and card-exclusives listed below |
| Card-exclusives (3) | Ember Crown (for Dawnblade Regent), **Heartwood Halo** (border, for Moonwood Dryad), **Core Pulse** (finish, for Core Titan)                                                                                                  |
| Achievements (25)   | Listed below                                                                                                                                                                                                                  |

**Cards (12)**: 4 per job, spread over the rarities (3 Common, 3 Rare, 2 Epic, 2 Legendary, 1 Mythic, 1 Exotic; Exotic and Void are mostly cosmetic territory in the beta, Void arrives with later content).

| Job      | Common            | Rare          | Epic / Legendary        | Top                     |
| -------- | ----------------- | ------------- | ----------------------- | ----------------------- |
| Fighting | Ember Squire      | Shield Warden | Storm Duelist (Epic)    | Dawnblade Regent (Leg.) |
| Logging  | Apprentice Feller | Grove Keeper  | Elder Treant (Epic)     | Moonwood Dryad (Mythic) |
| Mining   | Cave Digger       | Gem Cutter    | Geode Golem (Legendary) | Core Titan (Exotic)     |

**Achievements (25)**: First Harvest, First Kill, Lumberjack I / II (tree gems harvested), Prospector I / II (mine gems mined), Tree Hugger (all 3 tree kinds), Deep Delver (all 3 mines), Giant Slayer I / II / III (clear each dungeon), Glimmer Seeker (clear the special dungeon), First Summon, Ten Pulls, Pity Breaker (trigger a pity), Silver Lining (first Silver card), Golden Hour (first Gold card), Six Stars (first ★6), Prismatic Dawn (first Prismatic card), Full Loadout (fill a loadout), Dressed Up (equip a full set), Fashionista (own 10 cosmetics), Skilled (first 10 skill points spent), First Ascension, Night Owl (collect 8 h of offline progress). Cosmetic rewards from achievements are an item source.

### 11.7 Target pacing for the beta

Active play with the game left open, in hours of play:

| Milestone                                | Target |
| ---------------------------------------- | ------ |
| First dungeon cleared (Iron Deeps opens) | 0.5 h  |
| First summon                             | 0.75 h |
| First Silver card                        | 1.5 h  |
| Dungeon 2 cleared                        | 3 h    |
| First Gold card                          | 5 h    |
| First ★6                                 | 7 h    |
| First prestige (Ascension)               | 8 h    |
| Dungeon 3 cleared                        | 12 h   |
| Glimmer Trial cleared                    | 15 h   |
| First Prismatic card                     | 25 h   |
| First max-level cosmetic                 | 20 h   |
| Beta content mostly exhausted            | 40 h   |

In the balance sim (12.15), "First ★6" is the first **Gold** ★6 (the unique evolution; a lower-tier ★6 comes long before Gold) and "mostly exhausted" needs every other milestone, every card owned and a Prismatic ★6 card. The sim's median of each milestone is tuned to within about 25% of its target (12.25).

### 11.8 Combat rules

Decided with the user for Phase 5. Numbers live in data and will be tuned.

- **Clearing and unlocking.** A dungeon is **cleared after a number of boss kills set per dungeon** (`killsToClear` in data: 1 for Mossy Cellar, 10 for Ember Crypt, 50 for Frostspire Vault, see 12.25; confirmed by the user 2026-11-07). Clearing dungeon N unlocks dungeon N+1 (`unlockedBy` in data) and the mine type tied to it (Iron Deeps, Crystal Grotto).
- **Damage purchases.** One upgrade line **per mine gem**: Copper, Iron and Grotto. Each line has its own exponential **Money** price and adds flat damage per level; higher gems add much more. A line is bought once its mine is unlocked (Iron Edge with Iron Deeps, Crystal Edge with the Crystal Grotto). Levels are kept through prestige.
- **Cores** (Moss / Cinder / Frost) drop with a moderate **chance per kill** (60% / 50% / 70% for Moss / Cinder / Frost after the Phase 9 tuning, 12.25), no pity. Money and both crystals drop on every kill (11.13); the rare item keeps its low odds and pity.
- **The Glimmer Trial.** Picked like a dungeon; unlocks when Dungeon 2 is cleared. Each **attempt lasts 30 s** against a target with a **fixed HP** (no prestige scaling) and repeats automatically. **Score** = share of the target's HP dealt in the attempt (capped at 100%). Rewards are paid every attempt by **score tier**: each of 25 / 50 / 75 / 100% adds Glimmer Dust; Facet Shards only at 75% and 100%. Reaching 100% clears the trial.
- **Burst gauge.** The fighting job hits once per main-card interval (1 s while no card is equipped). Each hit fills the gauge by 1; at 20 the signature attack fires and deals **10× a hit** on top of the normal damage. Supports raise the fill per hit through modifiers.
- **Harvest burst.** Each production job ticks once per second; each tick fills that job's gauge by 1; at 30 a bonus harvest gives **10 s of the job's output** from every plot / slot at once.

### 11.9 Card rules

Decided with the user for Phase 6 (roles, star and tier-up requirements, start). Numbers live in data and will be tuned.

- **Any card in any slot.** Every card has a **main ability** (used when it leads its job) and a **support effect** (used in one of the 3 support slots). A card only goes into its own job's loadout, and once per loadout.
- **Start.** A new game owns the three Common cards (Ember Squire, Apprentice Feller, Cave Digger) at Bronze ★1, Lv 1, each leading its job. Until the Summon portals arrive, every boss kill has a small chance (1%) to drop a random card, weighted towards lower rarities.
- **Collection.** Each card is owned once, with its tier, stars, level and XP. Further copies are stored on it as **duplicates**.
- **Levels (11.2).** Cards in a loadout gain XP by doing their job: fighting cards per boss kill (more for harder dungeons), logging and mining cards per unit harvested. The cap is 20 at Bronze ★1 and rises by 4 per star (Bronze ★6 = 40, Silver ★1–6 = 40–60, and so on). Each level adds a little to the main ability's power and the support effect's strength.
- **Star-up** (★n → ★n+1 within a tier) needs **one duplicate**, the card **at its level cap** and **materials from all three loops (11.13)**: the tier's Core (Bronze: Moss Core, Silver: Cinder Core, Gold and Prismatic: Frost Core), the tier's **tree gem** and **mine gem** (Bronze: Oak and Copper, Silver: Ironbark and Iron, Gold and Prismatic: Moonwillow and Grotto) and, at Prismatic, **Frost Sigils**. The amounts grow per star, and the step to **★6, which brings the visual evolution, costs about three times the step before it**. Each gem line is scaled by the card's job (`jobShare` in `cardRules.json`, rounded up): a logging card pays 1× tree gems and 0.3× mine gems, a mining card the reverse, a fighting card 0.6× of both, so every job leans on its own loop and still uses the other. Each star adds a little power; ★6 adds a big step.
- **Tier-up** (★6 → next tier ★1) needs the card **at its level cap** and: Bronze → Silver: 6 Moss Cores + Ironbark and Iron Gems (logging 40,000 / 12,000, mining 12,000 / 20,000, fighting 24,000 / 14,000); Silver → Gold: 8 Cinder Cores + Moonwillow and Grotto Gems (logging 100,000 / 20,000, mining 30,000 / 40,000, fighting 60,000 / 28,000); Gold → Prismatic: 220 Frost Cores + 200 Frost Sigils + Moonwillow and Grotto Gems (logging 400,000 / 120,000, mining 160,000 / 240,000, fighting 240,000 / 180,000). Every job's tier-up (and star-up) must mix a Core, a tree gem and a mine gem; `validateContent` refuses a card cost that leaves one out or uses Money, crystals or Starlight. Level and XP carry over, and the new tier raises the cap. Each tier adds a big power step.
- **Levels cost nothing.** Levels stay XP-based (11.2): doing the job is the only way to level, so no resource buys a level. Glimmer Dust and Facet Shards stay the cosmetic upgrade materials (12.18), card shards stay the shard shop currency.
- **Shards.** A duplicate gained once a card is Prismatic ★6 turns into shards, more for higher rarities (Common 1, Rare 2, Epic 4, Legendary 8, Mythic 15, Exotic 25, Void 40).
- **Cost (11.4).** By rarity: Common 2, Rare 3, Epic 5, Legendary 8, Mythic 12, Exotic 16, Void 20. Each job's cap is 6 at account level 1 and grows by 2 per level (`loadout.costCap`). The main card must fit; a loadout over the cap cannot be saved.
- **Abilities.** Fighting mains shape how damage is dealt (steady ticks, fast hits that fill the gauge quickly, slow heavy hits with a stronger signature attack). Production mains shape output (steady, bigger harvest bursts, faster gauges). Supports add a percentage bonus or a gauge, drop or material bonus. All card effects go through the modifier pipeline with source kind `card`.

| Job      | Card              | Rarity    | Main ability                                       | Support effect                     |
| -------- | ----------------- | --------- | -------------------------------------------------- | ---------------------------------- |
| Fighting | Ember Squire      | Common    | Steady hits every 1 s                              | +5% damage                         |
| Fighting | Shield Warden     | Rare      | Steady hits every 1 s, +10% damage                 | +1 burst fill per hit              |
| Fighting | Storm Duelist     | Epic      | Fast hits every 0.5 s, gauge fills twice as fast   | +12% damage                        |
| Fighting | Dawnblade Regent  | Legendary | Heavy hits every 2 s, signature attack ×15         | +15% damage, +10% rare drop chance |
| Logging  | Apprentice Feller | Common    | Steady output                                      | +5% logging                        |
| Logging  | Grove Keeper      | Rare      | +10% logging                                       | +1 harvest-burst fill per tick     |
| Logging  | Elder Treant      | Epic      | Harvest bursts give 15 s of output instead of 10 s | +12% logging                       |
| Logging  | Moonwood Dryad    | Mythic    | +30% logging, harvest gauge fills faster           | +20% logging                       |
| Mining   | Cave Digger       | Common    | Steady output                                      | +5% mining                         |
| Mining   | Gem Cutter        | Rare      | +10% mining                                        | +1 harvest-burst fill per tick     |
| Mining   | Geode Golem       | Legendary | Harvest bursts give 15 s of output, +15% mining    | +15% mining                        |
| Mining   | Core Titan        | Exotic    | +40% mining, harvest gauge fills faster            | +25% mining, +5% Core drop chance  |

### 11.10 Card health

Decided with the user for the graphics overhaul, so the player can lose a fight and has a reason to upgrade. Numbers live in data and will be tuned.

- **Bosses hit back.** Every boss attacks the fighting loadout at its own rhythm with its own damage (in data per boss, growing with dungeon tier and with prestige like boss HP). A special dungeon's target does not attack.
- **One health pool.** The fighting loadout has one shared health bar. Each card adds health from its rarity, level and rank. It is shown like the boss's bar.
- **Knocked out.** When the pool reaches 0, the loadout is knocked out for a short time (30 s to start), the boss heals to full, and then the fight starts again with full health. A boss you cannot kill before your cards fall is a wall until you get stronger.
- **Protection** comes only through the modifier system: health and defence are stats, so cosmetics, set bonuses, the skill tree and card enhancements can raise them. There are no heal or shield support effects and no gem upgrade line for defence.
- **Offline** progress uses the same rules: being knocked out offline costs the same time and boss healing as online.

### 11.11 Crits

Decided with the user for the beta.

- Two stats, `combat.critChance` (base **5%**) and `combat.critDamage` (base **×2**), through the modifier pipeline like every stat.
- **Normal hits and signature attacks can crit.**
- The account tree's **Combat** branch has crit nodes; cosmetic set bonuses may use crit stats. Card tables (11.9) stay as they are.

### 11.12 Level milestones

Decided with the user for the beta.

- **Tree levels**, **mine levels** and the **three damage lines** give **×2** to that line's output **every 25 levels**. Milestones are data-driven per line so they can differ later.
- The next milestone is marked on the upgrade ("Lv 25: ×2"); reaching one plays a small celebration and a toast.
- Damage lines persist through prestige, so their milestones do too; mine levels reset, and their milestones with them.
- **Tree levels** have the same milestones (x2 every 25 levels).
- Milestones also drive the visual growth of tiles and edges (section 16).

### 11.13 The three loops: Money, materials and crystals

Decided with the user for the economy redesign (PR 1 of 4; the later PRs add tree levels and the upgrade shelf, the header and Details display, and the production stage). Numbers live in data.

- **Fighting → Money.** Money (id `money`, resource kind `currency`; its display name lives only in `resources.json`, so it can be renamed in one place) comes from **dungeons** and from nothing else. Every dungeon pays it twice: a **wage** for every second spent fighting its boss, not while the loadout is knocked out or in a special dungeon (`drops.wage`), and a **purse** on every kill (`drops.currencies`). The wage exists because a boss is an HP wall: a new player cannot reach the first kill of a 3.3e5 HP Root Warden with 1 damage, so the very first levels are paid for while fighting. Wage and purse grow with the dungeon: Mossy Cellar 50 Money per second and 12,000-18,000 per kill, Ember Crypt 260,000-390,000 per kill, Frostspire Vault 2.4-3.6 million per kill; only the first dungeon pays a wage (later ones pay by the kill, so a wall cannot be farmed idle). Both read `drops.moneyMultiplier`. A new game starts with 100 Money.
- **Money buys** mine levels, plot and slot expansions and damage lines. Every Money price is a cost curve `base × growth^n` with `resource: money`, read through `cost.multiplier` and `cost.growth`, so any later Money price (tree levels, the upgrade shelf of PR 2) is a data entry with the same curve and no new rule. Tree kind and mine type **unlocks stay paid in gems** (trees) or by clearing a dungeon (mines). Prices follow the weight of the gem each line used to be paid in (1 : 10 : 100, the Starlight tier weights): Copper Edge 10 x 1.11 (+1 damage), Iron Edge 200 x 1.12 (+10), Crystal Edge 3,000 x 1.13 (+100); mine levels 15 x 1.3, 200 x 1.32, 2,500 x 1.34; plots and slots 25 x 1.4. A **damage line is bought once its mine is unlocked** (Iron Edge with Iron Deeps, Crystal Edge with the Crystal Grotto), as the gems used to gate them.
- **Production → materials only.** Trees and mines yield only the six gems. Gems, Cores, Frost Sigils (now a **material**, dropped by the Frostspire Vault only, 1-3 per kill), Glimmer Dust and Facet Shards pay for card upgrades (11.9), cosmetic upgrades (12.18) and tree kinds. Nothing in the production loop produces Money.
- **Crystals are the premium tier.** The **Summon Crystal** (Card Portal) and the **Glamour Crystal** (Wardrobe Gate) replace the Moss and Ember Sigil. **Every dungeon drops both** on every kill and the deeper ones drop more (`drops.currencies`): Summon Crystals 2-4 / 4-6 / 6-10 and Glamour Crystals 1-2 / 2-4 / 5-8 per kill in Mossy Cellar / Ember Crypt / Frostspire Vault. Medals (`drops.crystalMultiplier`), the Starlight shop's Constellation Crystals and the account tree's Crystal Luck raise them; they do not raise Money. Only the portals spend them.
- **Ascension** resets Money to its starting amount, with the gems and Cores (a run starts from the lifetime of what the damage lines kept), and **keeps the crystals**, like Starlight and like the portal pity counters that go with them (3, 12.17). Keeping them is a recommendation of the user's, adopted here; the full pacing re-tune is pending (12.27).
- **Cores and Sigils** (Moss 80%, Cinder 50%, Frost 70% for 2 per drop; Frost Sigils 1-3 per Frostspire kill) are the dungeon materials for card upgrades, so each dungeon keeps a reason to be farmed beside Money and crystals.
- **Saves.** Format 14 renames the sigils (Moss to Summon, Ember to Glamour; the Frost Sigil keeps its id), the skill, the Starlight shop item and the shard shop bundles, keeps every level and expansion, and **pays back as Money what they would cost** at the new prices (plus the starting Money), so nothing feels lost. Gems are kept as materials.

### 11.14 Tree levels and the upgrade shelf

Decided for the economy redesign (PR 2 of 4). Numbers live in data.

- **Tree levels.** Every tree kind has a level line in `trees.json` (`level`), the same model as the mines: cost `base × growth^n` in **Money**, +10% output per level (`production.levelBonus`), x2 every 25 levels. Prices: Oak 20 × 1.3, Ironbark 250 × 1.32, Moonwillow 3,000 × 1.34. A tree must be unlocked to be levelled. Levels reset on ascension. All level lines (tree levels, mine levels, damage lines) buy x1 / x10 / x100 / Max through `bulk.ts` with before/after previews (`previews.ts`).
- **Upgrade shelf (`upgrades.json`, schema `upgradesFileSchema`).** 36 one-time upgrades paid in Money. Each has an `unlock` (kinds: `treeLevel`, `mineLevel`, `damageLevel`, `gemMastery` tier, `bossKills`, `lifetimeMoney`), a Money `cost`, a `permanent` flag and `effects` (ordinary modifiers, so the target stat, kind and scope are the "condition"). A shelf item is `hidden` until the unlock is met, then `available` (glows when affordable) and, once bought, `owned`. Effects enter the modifier pipeline with source kind `upgrade`; tooltips list them under the upgrade's name.
- **Card support effects.** "Logging cards +25% support effect" is the stat `card.supportPower` (scope job, base 1): it scales the flat, percent and mult-above-1 values of that job's support cards (the main effect is untouched). Only upgrades feed it.
- **Permanence (decided).** Money resets on ascension, so upgrades that multiply per-run production (trees, mines, logging/mining pacts and burst gauges, the production ledgers) reset with the run and are bought again; their unlock thresholds (tree and mine levels) reset too. Upgrades that touch lasting progress are `permanent`: the damage line ones, Battle Cry, the dungeon Money and crystal ones, the Vanguard Pact, Quick Hands and Finishing Blow. The data check refuses a permanent upgrade unlocked by a tree or mine level.
- **Lifetime Money earned** (`upgrades.moneyEarned`) counts the wage and purses of every run and is kept through an ascension. Old saves start it at the Money held.
- **Numbers** (first pass, to be tuned by playtest). Trees and mines: x2 at level 10 (1.2k-300k Money by tier), x3 at level 35 (400k-300M), all-trees +50% at 100k lifetime Money (50k), all-mines +50% at 200k (100k), level-bonus +50% at level 25 (25k-30k). Damage lines: x2 at line level 25 (5k / 100k / 1.5M), x3 at 75 (1M / 30M / 1G). Fighting: Battle Cry +25% damage (10 Root Warden kills, 50k), Tax Collector Mossy Cellar Money x3 (20 kills, 150k), Cinder Tithe Ember Crypt Money x2 (6M), Frost Tithe Frostspire Money x2 (60M), Crystal Lure crystals x1.5 (50 Mossy kills, 250k), Gleaming Hoard x1.5 (10M). Pacts: +25% support effect per job (40k / 40k / 100k). Bursts: Quick Hands +25% fighting fill (80k), Harvest Rhythm +25% logging and mining fill (20k), Finishing Blow x1.5 signature (4M). Ledgers: Merchant +25% all production (10M lifetime, cost 2M), Golden x1.5 (1G lifetime, cost 100M).
- **Saves.** Format 15 adds `production.treeLevels` (empty) and `upgrades` (none owned; lifetime Money starts at the Money held). The sim buys tree levels and the shelf by gain per Money.
- **Sanity sim (8 h, 2 seeds, not a tuning run).** With tree levels and the shelf in the sim everything runs; it now reaches Gold ★6 at 3.7 h, Dungeon 3 at 5.2 h and the first Prismatic at 6.1 h, faster than the 11.7 targets, and no ascension within 8 h. Pacing is deliberately left for the user's playtest and the later PRs (11.13, 12.27).

## 12. Defaults for underspecified points

Points the decisions above leave open. These defaults apply until changed.

1. **Respec cost.** Free for card enhancements; the account tree has a respec that costs a small amount of Starlight, with the first one per prestige free.
2. **Rank for card enhancements.** Silver ★1.
3. **Enhancement point budget.** Grows with rank (a few points per tier) and is about half of the total cost of the card's options.
4. **XP rates.** Tuned in the balance phase so the account level rises quickly early and slowly later.
5. **Report-an-issue contents.** The pre-filled GitHub issue carries the app version, a save summary (play time, prestige count, highest dungeon, save version), OS and Electron version, and the last 50 log lines. The player can edit it before submitting.
6. **Crits in the simulation.** The game deals crits at their **expected value** (every hit and signature attack does 1 + chance × (crit damage − 1) times its damage), so online, offline and any split of time give the same totals. The stage rolls individual crits only for show (the number and its look).
7. **Buy Max.** Max buys as many levels as the player can afford (at least one); when none is affordable it shows the next level. Its fill bar shows progress toward one more level than it can buy now. A ×N buy buys exactly N levels or nothing.
8. **Plot and slot previews.** A plot or slot preview assumes the new one runs the best unlocked producer of that job (the highest tier) and shows that gem per second before and after.
9. **Tree tile stages (E4).** Tree tiles grow with the tree's own **level milestones**, one stage per 25 levels like mine tiles (`tileStages` in `progression.json` is `level` for both jobs; DESIGN 11.14). Buying plots no longer grows tiles or fires a tile tier-up; buying tree levels that cross a milestone fires a `tree_milestone` tier-up. Levels and stages reset on prestige.
10. **When mastery tiers apply.** Lifetime totals and kills grow continuously, but a new mastery tier (gem or medal) takes effect on the next whole second of play, like card levels, so online, offline and any split of time give the same totals. A save migrated from before mastery gets its tiers from its totals when loaded, without tier-up moments.
11. **What counts as harvested (E2).** Every gem gained from plots / slots, harvest bursts included, online and offline. Gems from other sources (none yet) would not count.
12. **Medal bonuses.** "+10% crystal drops" multiplies the Summon and Glamour Crystals of each kill by 1.1 per tier (Money is not affected); a fraction rounds up with that chance, so the average is exact. "+10% core drops" is +10% per tier on the Core drop chance. The **Glimmer Trial medal** (from its best score at 25 / 50 / 75 / 100%) gives +5% damage in the trial and +10% to its rewards per tier, mirroring the boss medals.
13. **Unified tier-up moments (E1).** One `TierUp` shape for gem mastery, boss medals, mine and damage line milestones, tree tile stages, card tier-ups and the Gold ★6 unique evolution. Mastery tier-ups come from the game tick (and the welcome-back summary); the others from the purchase that caused them.
14. **Goal tracker (E8).** Goals come from the rules in `progression.json`: dungeon and trial clears, tree unlocks, the next mine / damage milestone, gem mastery and boss medals at least 25% of the way, and star-ups whose duplicate is in hand, and the next ascension once its Starlight gain is at least 25% of the minimum (progress = gain / minimum, ETA from the weighted gem points still missing at the current harvest rates; it jumps to the Shop page). ETAs use the current rates (production with the average harvest burst, the drops of what is being fought); a boss that would knock the loadout out before dying has no ETA. Goals sort by ETA, unknown last, then by progress. Clicking jumps to Dungeons, Production or Cards.
15. **Balance sim.** `npm run sim -- --hours 40 --seeds 5` plays the real game logic (mastery, milestones, crits, achievements, account levels included) for several seeds in parallel and prints, per 11.7 milestone, the target, the median, the spread (min-max) and the runs that reached it, plus the most typical run's end state. Its player (Phase 9):
    - **Always-buy purchases**, as soon as affordable: card star-ups and tier-ups, tree kinds, skill points (a fixed priority list: Might, Vigor, Keen Eye, Crystal Luck, Core Luck, the yields, ...), the cheapest useful Starlight shop level, cosmetic levels whose copy is in hand, summons (a 10-pull when affordable, else a single pull). Each card's enhancements are rebuilt as the highest-value set its budget allows (damage / output 3, health 2.5, crit / burst 2, drops 1.5, XP 1).
    - **Focus.** Card upgrades and cosmetic levels go to the most advanced item first (card: tier, stars, level; cosmetic: level, cheapest ladder first). An item that waits for a resource keeps it from every weaker one, and a Gold card short only of levels holds the Frost Cores and Sigils of its Prismatic tier-up, like a player finishing their lead card before spreading the Cores.
    - **Reservations.** The resources of the soonest waiting card upgrade (copy and level in hand) or tree kind are kept back from economy purchases.
    - **Economy purchases** (damage lines, mine levels, plots / slots), all paid in Money: the best relative gain per Money. A damage line is valued by its DPS gain (bulk buys up to the next ×2 milestone included); a mine level or a plot by its share of the weighted production (gem output × the Starlight tier weights 1 / 10 / 100), times `PRODUCTION_VALUE` (0.35), because production only feeds card upgrades now. It waits for the best one unless another costs at most 10% of it. Card upgrades cost gems and Cores only, so they never compete with Money for a reservation.
    - Plots / slots spread evenly over the unlocked producers (remainder to the lowest tier); loadouts take the rarest cards within the cost cap; complete cosmetic sets are equipped.
    - **Fighting:** the Glimmer Trial once it can score 100%; else a killable dungeon not cleared yet whose kill takes at most 10 minutes (a slower boss is not worth waiting for: the cleared dungeons are farmed for Cores meanwhile); else the cleared trial for cosmetic materials while it has had under 25% of the time since its clear; else the dungeon that drops the Core the most advanced waiting card is missing; else the hardest killable dungeon. Every dungeon pays Money and both crystals, so none is farmed for them. The ascension hold ignores missing gems (they come back within minutes) and waits for the slow dungeon materials.
    - **Ascension:** once the gain reaches the minimum, it ascends when the run's Starlight per second has fallen to 90% of its peak.
    - "Beta content mostly exhausted" counts as every other 11.7 milestone reached, every card owned and a Prismatic ★6 card. "First ★6" is the first Gold ★6.
16. **Portal pulls.** Pulls in a batch are rolled in order. Hard pity is checked first on every pull; the 10-pull guarantee applies to the **last** pull of a 10-pull when none of the first nine (and no pity pull) reached it, and then picks from the pool's items at or above the guarantee rarity by weight. A pity or guarantee pick keeps the pool weights among the eligible items. The reveal's upgrade flash happens on 25% of results above the pool's lowest rarity (`reveal.upgradeFlashChance`): the orb starts one rarity lower. The boss card drop and its `drops.cardChance` stat are removed with the Card Portal.
17. **Ascension details.** Starlight = floor(((Σ gems harvested this run × tier weight 1 / 10 / 100) / 2e5) ^ 0.4), through `prestige.gain`; an ascension needs at least 10 (all in `prestige.json`, tuned so the sim's first ascension lands near 8 h). Starlight is a resource of kind `prestige`, kept by an ascension together with the crystals (kind `crystal`; 11.13). Besides DESIGN 3 and 16, an ascension also resets the burst gauges, the boss being fought (back to full HP), the loadout's health and a running Glimmer Trial attempt; it keeps boss kills, trial best scores, the rare-drop pity counters, card levels and loadouts, rare items and the active dungeon. The Starlight shop holds permanent levels (logging and mining output, damage, card health, crystals, slower price growth, offline cap), each level adding its bonus once more (source `prestige`). Prestige cosmetics: Gilded Plate at the first ascension, Aurora Veil at the second, Gilded Filigree at the third; a duplicate becomes a copy. An ascension also drops the **per-run upgrades** of the shelf (they must be bought again) and keeps the **permanent** ones and the lifetime Money earned (11.14). The balance sim ascends when allowed and the gain at least matches all Starlight earned so far.
18. **Wardrobe details.**
    - **Levels.** A non-starter item's max level comes from its rarity (11.1, `cosmeticRules.json`); levels above its drawn ones show the top drawn level until the art arrives. The ladder for each max level is in data: 2 = shape, ambient; 3 = shape, accent, ambient; 4 = shape, accent, gems, ambient; 5 = shape, accent, gems, glow, ambient; 6 = shape, shape, accent, gems, glow, ambient.
    - **Upgrade cost.** Each level costs one duplicate plus the step's material × a rarity factor (common 1 … void 8). Shape 200 and accent 400 Glimmer Dust; gems 400, glow 800 and ambient 2000 Facet Shards, set so the sim's first max-level item lands before 20 h.
    - **Buffs.** The owned buff does not grow with the level; levels are visual.
    - **Equipping.** Equipping needs the item owned and puts it at its owned level; upgrading moves every worn copy to the new level.
    - **Dungeon drops.** A dungeon's rare drop that is a cosmetic is now owned (a copy when already owned).
    - **Wardrobe Gate pool.** It holds the items with no other source (the Gilded Tradition set, Ember Crown) plus the dungeon-drop items as a second way to get their duplicates, at the Card Portal's rarity weights. Prestige items stay prestige-only.
    - **Gate availability.** The gate is in `portals.json` with `enabled: false` until the Wardrobe screen ships; disabled portals are left out of `content.portals`.
19. **Where Ascension lives.** Section 9 has no Ascension slot and the shard shop is a tab of the Achievements page (section 17), so the **Shop** page holds the Ascension gate (A9 E) with the **Starlight shop** under it; the sidebar order and labels stay as in section 9. Starlight leads the header's currency row, since it is the one currency kept forever.
20. **Achievements and shard shop details.**
    - **Readings.** "Ten Pulls" counts 10 pulls in total. "Fashionista" counts cosmetics owned besides the starter set. "Dressed Up" needs a complete set other than the starter set. "Night Owl" needs 8 h of offline progress simulated in one session. "Skilled" waits for the account tree (Phase 8).
    - **Extra achievements.** First Milestone (a mine or damage line at Lv 25), Gem Adept (a gem at Gold mastery), Medalist (a Silver boss medal) and Masterwork (a cosmetic at its max level).
    - **Detection.** Achievements unlock once and grant their reward automatically. Cosmetic rewards: Giant Slayer I / II / III give the three dungeon-drop items. Glimmer Seeker, Golden Hour, Six Stars, Prismatic Dawn, Pity Breaker, Fashionista and Night Owl give the Gilded Tradition pieces. The rest give crystals, Cores, Glimmer Dust or Facet Shards. The tick checks them on the whole-second grid like mastery tiers, offline progress checks them after the session, and actions call `checkAchievements`. A save from before achievements unlocks what it already earned on the next tick.
    - **Shard shop.** Unlimited card copies (5 / 10 / 20 / 40 / 75 / 120 shards by rarity, Common to Exotic), crystal, Core, Glimmer Dust and Facet Shard bundles, and one Ember Crown (150 shards, once).
21. **Account details (`account.json`, `enhancements.json`).**
    - **XP rates.** Account XP comes from four sources, all through `xp.account`:
      - per gem harvested: 0.02 logging / 0.04 mining, × tier weight 1 / 5 / 25;
      - per boss kill: 10 × 4^(dungeon tier − 1);
      - 2 per Glimmer Trial attempt and 20 per pull;
      - 500 per ascension.
    - **Levels.** Level L → L + 1 costs 1100 × 1.2^(L − 1), up to level 50. In the sim this gives level 5 at about 0.6 h, 10 at 1.1 h, 20 at 3.3 h, 30 at 10 h and 40 at 31 h (quick early, slow later; 12.4). Level-ups settle on the whole-second grid like card levels.
    - **Saves from before the account.** They start at level 1 with no XP.
    - **Reward track.** Every level gives 1 skill point. Every 5 levels: 2 × level crystals or Frost Sigils (Summon Crystals to level 15, Glamour Crystals to 30, then Frost Sigils, which are a material). Every 10 levels: a cosmetic (Holo Hex, Holo Waves, Prism Pointer, Aurora Veil, Gilded Filigree; a copy when owned). Levels 3, 8, 15, 25, 35 and 45: +1 loadout cost cap for every job (source `account`), on top of the 2 per level.
    - **Account tree.** 23 nodes over the six branches, each rank adding its bonus once more (source `skill`): Combat holds Might, Keen Eye (crit chance), Brutal (crit damage), Vigor and Guard; Summoning / Luck is `luck`; Automation / Offline is `automation`. Respec refunds every point: free once per ascension, then 5 Starlight.
    - **Card enhancements.** Every card has five options from its job's template, values scaled by rarity, costing 20 points in total. Budgets: Bronze 0, Silver 4, Gold 7, Prismatic 10 (half the total at the top). Options apply while the card is in a loadout (source `enhancement`). Respec is free.
22. **Dev saves.** Dev builds take `BI_PROFILE` / `--bi-profile` or `BI_USER_DATA_DIR` so parallel dev apps never autosave over each other (`docs/WORK_SPLIT.md`).
23. **Settings page.** Four framed panels in two columns: Display, Sound, Save, Help.
    - **Reduced motion:** Follow Windows (default), On or Off, applied to every reduced-motion check (CSS and script) in the app.
    - **Number format:** Scientific (default, the game's own form), Suffixes (K, M, B … Dc, then scientific) or Engineering (exponents in steps of three). Numbers below a million always show in full. Display only; saves keep exact numbers.
    - **Autosave:** every 10 s, 30 s (default), 1 min, 2 min or 5 min. Purchases still save right away.
    - **Export:** copy to the clipboard or save a `.txt` file. **Import:** paste or load a file; the save is checked first, errors show in the page, and an in-page confirm compares both games before replacing.
    - These preferences are stored per player next to the sound settings (not in the save).
    - **Report an issue** opens the pre-filled issue of 12.5 in the browser. The log lines are the game window's own recent console lines and errors until the main process exposes its log. The link stays under about 7,500 characters by leaving out the oldest log lines. Main exposes `readLogTail(lines)` (last N lines of `main.log`, `updater.log` and `saves.log`, oldest first, at most 1000) and `getSystemInfo()` (OS, release, arch, Electron, Chrome); main logs its own uncaught errors, renderer crashes and preload errors to `main.log`.
24. **Dev cheats.** Pure cheat functions (grant resources, set a dungeon cleared, set a card's rank, add account XP, grant a cosmetic, advance time) live in the separate `game/dev` entry, not in `game/index.ts`. The renderer imports it only behind `import.meta.env.DEV` and shows the panel only when the main process says `!app.isPackaged` (`BI_NO_CHEATS=1` hides it in a dev build). `npm run build` fails if any bundle in `out/` contains the cheats' marker, so a release can never ship them.
25. **Phase 9 tuning (numbers only, all in `src/data/content`).** The sim median of every 11.7 milestone sits within about 25% of its target (table in `docs/BETA_PLAN.md`, Phase 9). What changed and why:
    - **Boss ladder.** Root Warden 3.3e5 HP (first clear about 0.55 h, with the 20 Sigils of the First Kill achievement landing on the same minute, so the first summon is about 0.55 h); Cinder Lich 6e6 HP, 10 kills to clear; Glacier Colossus 3e7 HP, attack 30 per 6 s, 50 kills to clear (the 10 and 50 kills, Mossy Cellar staying at 1, and "first ★6" meaning the first Gold ★6 are confirmed by the user 2026-11-07). The extra kills make the clear time a target while the Cores start dropping at the first kill: Gold ★6 needs Frost Cores (DESIGN 11.9) and a one-kill clear would put Dungeon 3 before the ★6, so the two targets (★6 at 7 h, Dungeon 3 at 12 h) could not both hold. The Glimmer Trial target is 6e6 HP (a 100% score needs about 2e5 damage per second, reached around 15 h).
    - **Cores.** Chance per kill 60% (Moss), 50% (Cinder), 70% (Frost, capped at 100% with medals). Star-up amounts: Bronze 1 / 2 / 3 / 5 / 15, Silver 1 / 2 / 3 / 4 / 12, Gold 1 / 1 / 2 / 2 / 6, Prismatic 22 / 26 / 31 / 37 / 111 (the ★6 step stays three times the step before). Tier-ups: Bronze → Silver 6 Moss Cores, Silver → Gold 8 Cinder Cores, Gold → Prismatic 150 Frost Cores and 175 Frost Sigils. An ascension resets the Cores and Sigils, and a run gives about 60 to 85 Frost Cores, so a Prismatic step spans two runs: the sim player does not ascend while a ready card holds at least 40% of a missing resource (up to a 12 h run), like a player finishing the lead card before spending the Cores. After #71 the sim ascended with 58 to 84 of the then 85 Cores and the first Prismatic came in only 2 of 5 seeds; with the hold and the numbers above it is 4 of 5 at about 19 h (76% of target), mostly exhausted 3 of 5 at about 28 h (71%).
    - **Economy curves.** Damage line growth 1.11 / 1.12 / 1.13 (was 1.15 / 1.17 / 1.20), mine level growth 1.30 / 1.32 / 1.34 (was 1.5 / 1.55 / 1.6), plot and slot growth 1.4 (was 1.6): the old curves flattened damage per second after about 8 h, which put Gold and Dungeon 3 out of reach.
    - **Account levels** 1100 × 1.2^(L − 1) (was 150 × 1.25^(L − 1)): level 5 (the first Sigil reward) comes after the first boss kill and the skill-point production bonuses no longer rush the first hours.
    - **Ascension.** Starlight exponent 0.4 instead of 0.5 (divisor 2e5 as before): with 0.5 the average Starlight per second kept rising while the cards improved and the sim ascended at 16 to 20 h; with 0.4 it peaks and the first ascension lands near 8 to 9 h.
    - **Cosmetics.** The Ambient step costs 800 Facet Shards (was 2000) and the Glimmer Trial pays 1 / 4 / 6 / 8 Glimmer Dust by tier and 3 / 8 Facet Shards at 75% / 100% (was 1 / 2 / 3 / 5 and 1 / 2), so a first max-level cosmetic costs about 150 full trial attempts and lands at about 20 h.
    - **Sim player.** The sim only pushes a dungeon it can kill in 10 minutes, finishes its lead card before the rest, and returns to Mossy Cellar for Sigils while a card is missing (12.15).
    - **Known spread.** Same-seed runs are reproducible, but the milestones that depend on Core runs (Silver, Prismatic, exhausted) spread widely between seeds (see the min-max column); a human player will vary more.
26. **Cosmetic content of the beta art batch (B1-B10).** 85 new items (ids in `cosmetics.json`, art ids in `docs/COSMETIC_ART_IDS.md`), no save change (a loadout only gains keys).
    - **Slots.** `starlight`, `sticker`, `nodes`, `wardrobe` (global, no tokens; the `ui-<slot>-<style>` recipe names the style). Option A is the starter (`<slot>_a`); B Rare, C Epic, D Legendary and E Mythic are `<slot>_b..e`, one level, a small owned buff (0.25 / 0.5 / 0.5 / 1 percent). Their max level is 1 (`cosmeticRules.slotMaxLevel`, a per-slot override of the rarity rule; the one drawn level has nothing to upgrade). A save level above 1 on such an item is clamped on load.
    - **Sources.** Starlight coin: Ascension 4 (B) and 6 (C), shard shop 100 / 160 (D, E). Sticker style: Medalist (B), Gem Adept (C), shard shop 100 (D), Masterwork (E). Skill nodes: Skilled (B), reward track levels 30 (C) and 50 (D), shard shop 160 (E). Wardrobe style: Dressed Up (B), reward track levels 20 (C) and 40 (D), shard shop 160 (E). `cosmeticSource` gains `track` and `shop`.
    - **Garden sets.** Verdant Reverie, Vine Wrap, Fern Fronds, Moss and Mushrooms, Blossom Branch: Legendary, 5 levels, seven slots, in the Wardrobe Gate. Each piece owns +0.2 percent of one of its set's stats; set bonuses (6 percent in total per set, like Gilded Tradition): verdant damage 3 / output 3, vine output 4 / damage 2, fern damage 4 / output 2, moss card XP 6 / output 3, blossom card XP 6 / damage 3.
    - **Exclusives and loose items.** Five Moonwood Dryad borders (Mythic, 5 levels, +1 percent damage) and five Core Titan finishes (Exotic, 6 levels, +1.5 percent output); 20 loose items (Common border and numbers, Epic attack and tick, 0.1 and 0.3 percent). Max-level motions and corners follow the manifest, and the existing items get theirs too.
    - **Gate pool.** Per-item weights keep each rarity's share sensible: Common 3 each, Epic loose 0.1, Legendary garden 0.1, Mythic 0.12, Exotic 0.06. The pool now covers Common to Exotic. The sim's first max-level cosmetic is at about 19 h.

27. **Economy redesign tuning (PR 1 of 4, full re-tune pending).** Prices, purses, wage, crystal amounts and card costs (11.9, 11.13) are first-pass numbers. A 14 h, 3-seed sanity sim gives: first clear 0.51 h, first summon 0.56 h, Silver 1.65 h, Dungeon 2 3.08 h, Gold 4.5 h, Gold ★6 5.7 h, Dungeon 3 9.6 h, Trial 11.6 h. Known off-target: the first ascension (the sim's hold waits for gems and Frost Cores, 12-13 h instead of 8 h), the first Prismatic (about 11-18 h instead of 25 h) and "mostly exhausted" (not re-run). The user will playtest and tune; the full 40 h, 5-seed run was not redone. Decisions: Money gives Moss Core 80% (was 60%) and Frost Core 2 per drop; the Glimmer Trial target is 9e6 HP; Dungeon 3 clears after 90 kills; the first max-level cosmetic milestone fires at about 1.4 h because UI-skin items have one level (also true before this change).

## 13. Art style

Decided with the user in the graphics overhaul. References (Knights & Dragons armour sets and card UI, Brave Frontier, a cartoon flame-jet effect sheet) are kept locally in `design/references/` and never committed.

**Pixel art (decided 2026-11-07).** The game switches from vector to **pixel art**. Everything already drawn in vector (card items and weapons, frames, unique evolutions, bosses, gems and coins, scenery, element effects, hit animations, icons) is redrawn as pixel art, and **each asset is approved by the user before it goes into the game**; the queue is in `docs/BETA_PLAN.md` under "Decided visuals". Until an asset is approved, the game keeps its current vector version. What the art shows (the content and rules in this section) does not change, only how it is drawn. Pixel rules:

- **Clean pixels.** Every sprite is drawn on its own native pixel grid and shown at whole-number scale with nearest-neighbour scaling (`image-rendering: pixelated`). No anti-aliasing, blur, gradients, soft glows or sub-pixel positions; never shrink vector art to make pixels.
- **Outlines.** A one-pixel dark ink outline (one ink colour) around every part. Where parts overlap, the front part gets a one-pixel edge in its own darkest tone. Stickers (bosses, tiles, coins) add a one-pixel white ring outside the ink.
- **Shading.** Flat faces lit from the top-left, three to five tones per material, white glints and sparkle specks; no stray single pixels.
- **Sizes.** Card items 100 × 120; the whole card is one grid at 132 × 186; production tiles 58 × 64; bosses 160 × 172; coins 48 × 48; medals 48 × 48; navigation plaques 64 × 64.
- **Brave Frontier technique** (learned from their sprites; never copy their art): five tones per material with shadows leaning purple and highlights leaning yellow-white, dark one-pixel lines between parts, gold trim with a bright top edge, small gems with a white glint. The body barely moves (a one-pixel bob); the life is in the effects.
- **Effects and hits (approved 2026-11-07).** Effects and hits are drawn in hard pixels on the same grid as the item, with a **soft glow** behind them. Under reduced motion they show a still frame.
- **Card items (approved 2026-11-07).** The item in the card window is a 100 × 120 pixel sprite with the black one-pixel ink outline and **light extra shading**: inside every part, the lit edge (top-left) gets a subtle two-pixel lighter band (about 30% toward white, then 12%) and the shadow edge (bottom-right) a slightly darker one (about 24% toward the ink), on top of the part's own tones. A one-pixel light rim outside the outline keeps dark items (Void) readable on dark windows, and sparkles are pixel plus-shapes. The shapes and the rarity ladder are the ones already approved in vector.

- **Approved for the beta (2026-11-07)**, mockups in [Pixel Art Batch](https://claude.ai/artifact/NLU6j4dSGJZe587PWGDXdK) and [Pixel Art Round 2](https://claude.ai/artifact/MP6BXhgJFWdRJDdyLiNcs6):
  - **Production tiles:** the in-game tree grown over the five stages (leaves in the gem's colour) and the crystal-cluster mine, on the rising plinth, with a one-pixel white sticker ring. They get a Brave Frontier pass after the beta.
  - **Unique evolutions:** the approved Flameblade, Soul Reaper and Rootbloom Staff in the card-item treatment, with their motion (edge fire, soul fire and wisps, wind, leaves and pollen) in the effects style.
  - **Gem coins:** a plain rim with eight notches, a dark well and one big faceted gem with a glint; the rim metal and outer ring show the mastery tier; a gem not found yet is a grey coin with a padlock.
  - **Bosses and the Crystal Sentinel:** redrawn at 160 pixels with the Brave Frontier technique. Idle effects: the Root Warden sheds spores and leaves, the Cinder Lich burns (crown, skull staff, embers), the Glacier Colossus has falling snow and frost mist, the Sentinel sparkles and its shards bob and light with the score.
  - **Mastery medals:** the faceted star with a bright ridge on each point and a centre stud. Gold gets a moving shine and a twinkle; Prismatic gets a holo (facets cycling through the rainbow) with the shine and twinkle.
  - **Forged edges:** the ladder strip with the in-game sword at five steps, recoloured to the line's gem; the last step is prismatic.
  - **Navigation icons:** the bronze hexagonal plaque with gold studs and a dark face, the glyph drawn with a shadow and a highlight.
  - **Achievement stickers (approved by the user 2026-11-08, B6 redo):** every achievement picture is redrawn in the cel style (ink outline, one hard shadow shape per part, a lit band and a white glint; tiered achievements get their own picture per tier, for example the three Giant Slayer skulls follow the three dungeons). The sticker is a **mini card** echoing the Knight plate frame: a chapter-coloured band, metal corner caps, a crest gem, a dark window holding the picture and a metal nameplate with three chapter pips or the tier numeral (I, II, III, 10, 25); locked is the face-down card back with a padlock. The five sticker styles climb the frame ladder on the same card, each fancier at 1×: **a mini card** (bronze caps, small crest gem; the starter), **b silver card** (corner spikes, sapphire studs), **c gold card** (side spikes, gold trim, big crest), **d legendary card** (crown crest with a glow, ruby studs, double trim), **e prismatic card** (rainbow metal, nameplate wings, radiant crown). The locked back grows the same frame, muted. Sheets: `design/pixel/achievement-stickers/` (`options.png` drafts, `final-style-a.png`, `final-styles-a-e.png`).

- **Simple but cool.** The art favours strong silhouettes and few parts, with detail only where it reads at game size.
- **Look.** Cel-shaded, like Knights & Dragons and Brave Frontier: bold dark outlines (one ink colour), flat shadow shapes and white highlights instead of gradients, saturated metals, and a chunky display font for card names.
- **The card is the showpiece.** The frame is the tier (section 5) and rarity colours the card body. **Frame ladder (approved in pixel art 2026-11-07):** every tier changes the frame in three ways at once and stays a border (nothing reaches more than a few pixels past the card edge except a small crest on top):

  | Tier      | Material                                          | Six gem sockets (four corners, top, bottom)       | Crest on top          | Light and motion                                                                    |
  | --------- | ------------------------------------------------- | ------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------- |
  | Bronze    | Hammered bronze with dents and green patina spots | All empty                                         | A plain stud          | None                                                                                |
  | Silver    | Polished silver with an engraved inner line       | The two top corners hold sapphires                | Small wings           | None                                                                                |
  | Gold      | Gold with scrollwork and a red velvet liner       | Sapphires and emeralds in the corners, a top ruby | A small crown         | A shine sweeps across the frame; the corners twinkle                                |
  | Prismatic | Crystal band cut into pastel facets               | All six hold rainbow gems                         | A small radiant crown | The band cycles through the rainbow, the shine sweeps, sparks orbit just outside it |

  Under reduced motion the Gold and Prismatic frames are still. Mockup: [Frame Ladder](https://claude.ai/artifact/BWviG6R6coWmmMLKCCY8ga).

- **Inside the card is its signature item**, not a character: a weapon, shield, tool or relic, cel-shaded like the frame. **Rarity sets how intricate the item is**, adding parts rather than only colour: Common plain; Rare a fuller, wrapped grip and gem pommel; Epic a winged guard and gem; Legendary a broader, serrated or ornate shape, gold inlay and a ribbon; Mythic neon runes and a crystal edge; Exotic forked or split shapes and floating rings; Void black chrome, glowing cracks and orbiting shards. Twinkles get more frequent with rarity.
- **Characters** (chibi armoured figures in the same style) are used for **dungeon bosses** and may appear as special card skins later. Bosses and enemies **look like their area** (a mossy root guardian for the Mossy Cellar, an ember-and-bone caster for the Ember Crypt, an ice giant for the Frostspire Vault), and each boss needs a clearly different body shape, not a recolour: the Root Warden wide and squat (a hollow stump with root arms), the Cinder Lich tall and floating (a horned skull with a gold crown of fire, a gold-collared robe, bony fists and a burning-skull staff), the Glacier Colossus top-heavy (crystal shoulders and boulder fists). Bosses are drawn in the **Brave Frontier pixel style** (approved for the beta, see the pixel rules above): hue-shifted ramps, dark lines between parts, gold trim and glints, and a soft aura in the boss colour around the figure instead of a white sticker outline. The Glimmer Trial target is the **Crystal Sentinel**: a floating one-eyed crystal diamond inside a halo ring, with four orbiting shards that light up as the attempt's score passes 25, 50, 75 and 100%.
- **Element effects.** Every card has an element; its effect is generated from the item's own shape (edges, fuller, tip), never a static picture placed on top, and always stays secondary to the item: slow and calm. Effects **wrap around** the item: most of the effect sits behind it with a smaller share in front, arcs and streams may reach past the item's outline, and auras follow the outline itself. Effects are cartoon cel animations (outlined blobs and arcs); glowing embers and branching lightning are drawn in the same cel style.

  | Element              | Effect                                                                                                     |
  | -------------------- | ---------------------------------------------------------------------------------------------------------- |
  | Fire                 | Edge fire: flames along the edges with uneven, drifting highs and lows; or a trailing stream off the tip   |
  | Storm                | Arc crackle: jagged cel lightning jumping between points on the item and off its tip                       |
  | Light                | Aura shell: outlines of the item pulsing outward, shedding sparks                                          |
  | Nature               | Spiral wrap: a ribbon of leaves and light coiling around the item                                          |
  | Earth, crystal, void | Power cracks: jagged glowing cracks inside the item, flickering like the arc crackle, in the item's colour |

- **Hits.** Slashes are single **thin** brush strokes (a white core in a yellow stroke), straight with a slight curve, tapered with dry-brush streaks, re-rolled every hit (angle, length, thickness, offset) and always centred on the target. Bows and pickaxes use the impact hit instead; there are no arrow projectiles. Hit colour follows the element.
- **Unique evolutions.** Some cards have a unique item at ★6 in place of the generic one: **Flameblade** (a sword made entirely of flame), **Soul Reaper** (a scythe) and **Rootbloom Staff** (roots at the base, petals at the head, falling leaves, wind and floating earth crystals).
- **Effects unlock with tier**: none at Bronze and Silver, the element effect from **Gold**, stronger at **Prismatic**. ★6 keeps the stars' shine and one-time flash.
- **Beta cards** (elements and items):

  | Card              | Element | Item                   |
  | ----------------- | ------- | ---------------------- |
  | Ember Squire      | Fire    | Ember Blade (sword)    |
  | Shield Warden     | Light   | Bulwark (shield)       |
  | Storm Duelist     | Storm   | Twin storm blades      |
  | Dawnblade Regent  | Fire    | Dawnblade (greatsword) |
  | Apprentice Feller | Nature  | Hatchet                |
  | Grove Keeper      | Nature  | Sapling staff          |
  | Elder Treant      | Nature  | Heartwood maul         |
  | Moonwood Dryad    | Light   | Moon bow               |
  | Cave Digger       | Earth   | Pickaxe                |
  | Gem Cutter        | Crystal | Cutting chisel         |
  | Geode Golem       | Crystal | Geode hammer           |
  | Core Titan        | Void    | Core gauntlet          |

- **Resources are carved gems.** Every production resource is a gem: its **outline** says which one (Oak round, Ironbark pentagon, Moonwillow star, Copper square, Iron hexagon, Grotto drop) and its **carved pattern** comes from its source (grain, rings and swirls for the trees, glowing veins for the mines); the pattern shows on large art only, and the pixel coin icons leave it out so they stay readable. Icons set the faceted gem in a **notched coin** with a **sticker outline in the tier colour**: the coin's metal and its outline both show the gem's **mastery tier** (stone, bronze, silver, gold, prismatic; section 16, E2), and a resource not discovered yet shows as a grey coin with a stone outline and a padlock. In the world, each tree is themed to its gem (colours and bark pattern) and hangs its gems, and each mine is rock with its gems set into it. The scenery is **faceted** like the gems: canopy, trunk, rocks and a hexagonal ground tile are cut into flat light and dark faces, with the same white sticker outline as the bosses. Navigation icons keep the hexagonal plaque.
- **Performance.** Element effects run on one shared animation loop (a small canvas behind and one in front of each item, so effects can wrap around it), only for cards on screen, at a capped frame rate. Under reduced motion they show a still frame.

## 14. Stages and juice

Decided with the user for the beta. The Dungeons and Production pages are the focus of the game, so they are **stages**, not menus. Picks from the beta review gate (`docs/BETA_PLAN.md`) are written into each part below.

### Layout

- **Stage first.** Each focus page has a large live stage on top (about 60% of the height). Management (upgrade lines, lists, unlocks) goes below or in a side rail. The dungeon list becomes a compact **floor map / rail**.
- **Dungeons: full-bleed stage.** The arena fills the page. Floors and upgrades live in a **drawer** that slides up from the bottom; collapsed, it shows one buy button for the best damage line. DPS and time-to-kill sit in the top-right corner.
- **Production: two fields stacked.** The logging field above the mining field, each a wide strip of tiles; upgrade lines (tree kinds, mine levels, plots / slots) in a **side rail**.
- **Home: command centre.** Three live mini-stages (fight, logging, mining) with their rates; clicking one opens its page. The goal tracker sits on top.

### Dungeon arena

- The sticker boss is large and centred, with an idle bob and the stacked HP bars.
- **Every hit:** a white flash and a squash. Big hits add a small shake. When an HP bar runs out it shatters and the bar counter ticks down.
- The fighting loadout stands **facing the boss** and lunges on its attacks. Its shared health bar is visible.
- **Boss attacks** land on the cards with red numbers and a card shake. A **knockout** is a visible moment, with the countdown shown on the stage.
- The **burst gauge** is visible on the main card. When it fires, the signature attack gets a screen flash, a big number and a brief slow-down.
- **On a kill** the boss pops and its drops burst out as gem coins: they **spill out with small bounces, rest for a beat, then vacuum to the header counters** (loot shower). A rare drop gets a light beam, a brief slow-down and a toast.
- Live readouts on the stage: **DPS, kills per minute, time-to-kill**.

### Production field

- Plots and mine slots are drawn as the **faceted tiles** of section 13, not icon boxes.
- Trees grow and hang their gems, which pop off on harvest. Mines show pickaxe strikes with chips.
- Every tick shows a **"+n"** rising off each plot or slot, and the coins fly to the header.
- A **harvest burst** is a wave across all plots with one big total number.

### Header, numbers and buying

- **Header counters** roll smoothly instead of jumping, show the per-second rate under them, and pulse when coins land.
- **Floating numbers** go through the **number style** cosmetic slot and the attack / tick style slots; nothing is hardcoded. Sizes scale with the hit relative to the current average. Crits and signature attacks have distinct looks. The starter number style is **sticker numerals**: chunky digits with a thick white outline, a drop shadow and a slight tilt; hits bounce in place rather than rise; a crit adds a starburst behind the number.
- **Hits reuse the existing attack effects** (`effects.ts`: brush-stroke slash, impact hit) and the item art already drawn (section 13).
- **Upgrade previews.** Every buy button shows its effect before buying, e.g. "DPS 12 → 13, time-to-kill 11h → 2h" or "Oak 4/s → 5/s".
- **Buy ×1 / ×10 / ×100 / Max** toggle on all upgrade lines. Affordable buttons glow. A small fill bar shows progress toward the next affordable level.

### Welcome back

After offline progress, a summary shows: time away (and the cap), resources gained, kills, knockouts, drops (rare ones highlighted), card XP and levels gained, and mastery tiers reached. It is a **card fan**: each category is a small card dealt onto the table one after another, then a Collect button sends the coins to the header.

### Performance

- Cap simultaneous popups (about 30) and merge rapid tick numbers.
- Pause stage animation when the page or window is hidden.
- Reuse the shared animation loop of section 13.
- Under **reduced motion** there is no shake, flash or slow-down, and numbers fade in place.

## 15. Sound

Decided with the user for the beta.

- **Procedurally synthesized SFX via Web Audio**: no external asset files, nothing copyrighted.
- Sounds: hit, crit, signature attack, boss hit on cards, knockout, kill, coin pickup, rare drop, buy, milestone, mastery tier up, harvest burst, summon reveal per rarity, UI click.
- Sounds are defined in a **data registry**, so a "sound pack" can become a cosmetic slot later (not added now).
- **Throttle** repeated sounds (at most a few per second per sound).
- Settings: master volume, SFX volume, mute, and "mute when the window is unfocused" (default on). A quick **mute toggle in the header**; the full sliders live in Settings.
- **On by default at moderate volume.** No music for now.

## 16. Progression

Decided with the user at the beta review gate (all lines accepted; picks written in).

The five metals (stone, bronze, silver, gold, prismatic), gem coins, item intricacy by rarity and frames by tier are already a visual tier language. Gameplay progression drives that language everywhere, so getting stronger is always visible.

- **E1 One metal ladder.** Stone → bronze → silver → gold → prismatic is THE progression language. Everything with tiers uses these five metals: card frames (already), coins, mastery medals, tile growth and forged edges. A tier-up of anything plays the same kind of moment: a metal flash and a short toast. **Mastery medals are faceted stars** in the metal, cut into light and dark faces like the gems and scenery.
- **E2 Gem mastery.** _Replaces "coin metal = resource tier" in section 13_ (the gem's outline shape and the tree/mine tier already tell resources apart).
  - Each production gem has a mastery tier from its **lifetime total harvested**, kept through prestige. The save counts it from now on, with a migration that starts it at the current amount owned.
  - Thresholds: **1e3 / 1e5 / 1e7 / 1e9** for bronze / silver / gold / prismatic.
  - Each tier gives **+10%** to that gem's output (modifier source `mastery`).
  - The coin's metal and outline show the gem's mastery tier, so coins visibly upgrade as you farm.
- **E3 Boss mastery.**
  - Kills per boss give medal tiers (bronze / silver / gold / prismatic at **10 / 100 / 1,000 / 10,000** kills), kept through prestige.
  - Each tier gives **+5% damage** against that boss and **+10%** to that dungeon's crystal and Core drops (source `mastery`, condition = dungeon).
  - The medal shows on the floor rail and next to the boss on the stage. The Glimmer Trial's medal tiers come from its **best score** instead.
- **E4 Growing tiles.**
  - Tree and mine tiles grow visually with their level, **one visible step per 25-level milestone** (trees have their own level line since 11.14).
  - Trees: sapling → young tree → full canopy → grand tree with more hanging gems → gem-crowned tree with a subtle ambient sparkle.
  - Mines: surface rock → open quarry → deeper shaft with more gems → glowing veins → crystal-lined cavern with a subtle ambient glint.
  - The tile's ground uses the metal ladder for its stage as a **rising plinth**: the hexagon sits on a metal plinth that gets taller every stage.
  - Each stage is drawn as its own faceted tile, not a scaled copy. A mine is **one solid faceted rock mass** with gems set in sockets; the glowing seams follow the rock's facet edges. The top tree stage turns its top canopy into the gem's own colours with a glow.
  - New plots start at the base stage; prestige resets the stages with the levels.
- **E5 Forged edges.**
  - Each damage line (Copper, Iron, Crystal Edge) shows a forged blade made from its gem.
  - At every milestone the blade steps up: bare → inlaid → gem-set → glowing runes → prismatic.
  - Each line is shown as a **ladder strip**: the five blade steps in a row with the current one lit and the buy button at the end, in the arena drawer.
- **E6 Unique ★6 evolutions** (section 13, not built yet).
  - **Flameblade** replaces Ember Squire's Ember Blade.
  - **Rootbloom Staff** replaces Grove Keeper's Sapling staff.
  - **Soul Reaper** waits for the first Void fighting card (not in the beta).
  - The unique item appears from **Gold ★6** onward and keeps the tier's element effect; its reveal gets its own evolution moment (a bigger flash than the normal ★6 flash): **a light beam drops into the card, the Gold frame rebuilds around it with an extra crest flare, then the unique item rises into the window**.
  - The art is the one already designed (Flameblade's flame blade, Rootbloom Staff's braided roots and bloom, Soul Reaper's skull scythe with soul fire).
- **E7 Account level reward track.**
  - Every account level gives its skill point plus a listed reward: every 5 levels a bundle of crystals, every 10 levels a cosmetic, some levels a loadout cost cap bump.
  - Shown BF-style as a horizontal row of upcoming rewards, opened from the account level in the header. A level-up plays a moment and lists what you got.
  - Goals and the reward track share a **quest scroll** look: a parchment panel under the header listing goals with check boxes, with the reward track as a path on it.
- **E8 Goal tracker.**
  - A small header widget always shows the next 1–3 goals with progress bars (next unlock, a milestone or mastery tier close to completion, materials missing for the next star-up).
  - Clicking a goal jumps to the right page.
  - Goals are picked by simple rules in data (nearest by estimated time), never a fixed script.
- **E9 Pacing.** Mastery, milestones and growth must not break the 11.7 targets. The balance sim includes them, and their numbers are tuned with everything else.

## 17. Screen picks for the beta

Decided at the beta review gate; each is built in its phase.

- **Wardrobe: mannequin card.** A large preview card in the centre with the seven slots around it like an equipment screen; the item grid below.
- **Skill tree: radial constellation.** Six branches radiate from a centre star; nodes are faceted gems lit in the branch colour. Card enhancements use a small star chart on the card.
- **Ascension: portal gate.** A large prismatic gate; everything that persists floats into it. Confirming walks through with a prismatic sweep.
- **Achievements: sticker book.** Each achievement is a sticker slot; unlocking slaps the sticker in with a bounce. The shard shop is its own tab.
