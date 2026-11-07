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
- Plot expansions are paid in **Oak Gems**. Each tree kind is unlocked once with the gems of the tier below (Ironbark with Oak Gems, Moonwillow with Ironbark Gems).

### Mining

- Works the same way as logging (limited slots, upgrades add capacity, higher mine types yield different gems).
- **New mine types are unlocked via dungeon expeditions.**
- Starts with **one mine slot** (Copper Quarry). Slot expansions are paid in **Copper Gems**.
- **Mine levels:** each mine type also has a level, bought with its own gems on an exponential curve; every level adds a percentage to that mine's output. Slots and mine levels both reset on prestige.

### Resource uses (starting point)

| Resource         | Buys                            |
| ---------------- | ------------------------------- |
| Mine gems        | Damage, mine upgrades           |
| Tree gems        | Plot expansions, new tree kinds |
| Higher-tier gems | Card tier-ups                   |

This is a starting point and will be tuned.

## 3. Prestige

- Prestige **resets**: plots, mine levels, resources.
- Prestige **grants**: a permanent prestige currency.
- Prestige **persists through**: damage, cards, cosmetics, and unlocked dungeons / trees / mines.

## 4. Combat

- **Damage** is a stat bought with resources and kept through prestige.
- **Bosses** are HP walls, auto-fought in parallel with everything else (no active combat input), and they respawn so they can be farmed.
- Boss HP scales **slowly** with prestige count.
- Boss HP is shown as **stacked bars** with a **×N** count of bars left (like a fighting-game life gauge). The current bar drains over the colour of the next one. Each boss sets its number of bars.
- Attacks are automatic. Each hit plays the equipped attack animation and a floating damage number; with reduced motion the hit animations are skipped and numbers simply fade.
- New, harder **dungeons** unlock with progress.
- Dungeons drop **rare items** at low odds (e.g. 0.5%) with a **pity counter**, plus **portal resources**.

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
- **The tier is the card's frame** (see section 13): each tier-up rebuilds the frame in the next metal and adds ornament, like an armour set going from basic to epic. Bronze: plain riveted plate. Silver: spikes at the top corners. Gold: side spikes and a crest gem. Prismatic: plate wings and a rainbow-shifting metal.
- **★6 within a tier** keeps the stars' shine and plays a one-time flash; it does not add rings. The next big visual step is the tier-up itself.
- **Prismatic is the top tier for now and must look clearly different from ★1:** wings, rainbow metal and the strongest element effect.
- **Rank visuals never clash with cosmetics:** the frame's tier ornaments (spikes, crest, wings) own the top, the sides and the area outside the edge; cosmetics change the frame's family and the card's finish (section 7). Stars are never covered.
- **Card enhancements** (Brave Frontier Omni SP style) unlock at a set card rank. See section 10.
- **Duplicates / shards add stars.**
- **Tier-ups cost a dungeon material** (see resource uses above).
- Duplicates beyond max rank convert to **shards**, spendable in a shop.

## 6. Summon portals (gacha)

- Several portals (cards, cosmetics, more later), each with its **own pool** and a **cost resource from specific dungeons**.
- **In-game currency only** — no real-money purchases.
- Rarities and **pity** apply.

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

- Some rare cosmetics are **exclusive to one specific card** and override the global slot on that card only.
- **Wearing card cosmetics depends on the card's rank.** Any item can be owned (and its owned buff counts), but a card must reach a minimum rank to wear it; below that it shows the starter look for that slot. Starting values: card border from Gold ★1, card finish (holo) from Prismatic ★1, card-exclusive items from Prismatic ★6. Global slots (attack, tick, numbers, table, cursor) are always worn. The thresholds live in data and are expected to be tuned.
- A holo finish covers the whole card, but card text always stays above it.
- **Sources:** dungeon drops, cosmetics portal, prestige, achievements.
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

- **Header bar:** account level (with XP bar) and currencies.
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
| Dungeons (3)        | **Mossy Cellar** (boss Root Warden, drops Moss Sigil and Moss Core), **Ember Crypt** (boss Cinder Lich, drops Ember Sigil and Cinder Core), **Frostspire Vault** (boss Glacier Colossus, drops Frost Sigil and Frost Core)    |
| Special dungeon (1) | **The Glimmer Trial**, a strength test with a fixed target and a score. Drops **Glimmer Dust** (cosmetic upgrades, shape and accent levels) and **Facet Shards** (gem, glow and ambient levels)                               |
| Cards (12)          | See below                                                                                                                                                                                                                     |
| Portals (2)         | **Card Portal** (costs Moss Sigils), **Wardrobe Gate** (costs Ember Sigils). Frost Sigils and the three Cores are used for tier-ups                                                                                           |
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

### 11.8 Combat rules

Decided with the user for Phase 5. Numbers live in data and will be tuned.

- **Clearing and unlocking.** A dungeon is **cleared on its first boss kill** (`killsToClear` in data, 1 for now). Clearing dungeon N unlocks dungeon N+1 (`unlockedBy` in data) and the mine type tied to it (Iron Deeps, Crystal Grotto).
- **Damage purchases.** One upgrade line **per mine gem**: Copper, Iron and Grotto. Each line has its own exponential price in that gem and adds flat damage per level; higher gems add much more. Levels are kept through prestige.
- **Cores** (Moss / Cinder / Frost) drop with a moderate **chance per kill** (10% to start), no pity. Sigils drop on every kill; the rare item keeps its low odds and pity.
- **The Glimmer Trial.** Picked like a dungeon; unlocks when Dungeon 2 is cleared. Each **attempt lasts 30 s** against a target with a **fixed HP** (no prestige scaling) and repeats automatically. **Score** = share of the target's HP dealt in the attempt (capped at 100%). Rewards are paid every attempt by **score tier**: each of 25 / 50 / 75 / 100% adds Glimmer Dust; Facet Shards only at 75% and 100%. Reaching 100% clears the trial.
- **Burst gauge.** The fighting job hits once per main-card interval (1 s while no card is equipped). Each hit fills the gauge by 1; at 20 the signature attack fires and deals **10× a hit** on top of the normal damage. Supports raise the fill per hit through modifiers.
- **Harvest burst.** Each production job ticks once per second; each tick fills that job's gauge by 1; at 30 a bonus harvest gives **10 s of the job's output** from every plot / slot at once.

### 11.9 Card rules

Decided with the user for Phase 6 (roles, star and tier-up requirements, start). Numbers live in data and will be tuned.

- **Any card in any slot.** Every card has a **main ability** (used when it leads its job) and a **support effect** (used in one of the 3 support slots). A card only goes into its own job's loadout, and once per loadout.
- **Start.** A new game owns the three Common cards (Ember Squire, Apprentice Feller, Cave Digger) at Bronze ★1, Lv 1, each leading its job. Until the Summon portals arrive, every boss kill has a small chance (1%) to drop a random card, weighted towards lower rarities.
- **Collection.** Each card is owned once, with its tier, stars, level and XP. Further copies are stored on it as **duplicates**.
- **Levels (11.2).** Cards in a loadout gain XP by doing their job: fighting cards per boss kill (more for harder dungeons), logging and mining cards per unit harvested. The cap is 20 at Bronze ★1 and rises by 4 per star (Bronze ★6 = 40, Silver ★1–6 = 40–60, and so on). Each level adds a little to the main ability's power and the support effect's strength.
- **Star-up** (★n → ★n+1 within a tier) needs **one duplicate**, the card **at its level cap** and **materials**: the tier's Core (Bronze: Moss Core, Silver: Cinder Core, Gold and Prismatic: Frost Core). The amount grows per star, and the step to **★6, which brings the visual evolution, costs about three times the step before it**. Each star adds a little power; ★6 adds a big step.
- **Tier-up** (★6 → next tier ★1) needs the card **at its level cap** and: Bronze → Silver: Moss Cores + Ironbark Gems (logging) or Iron Gems (mining, fighting); Silver → Gold: Cinder Cores + Moonwillow Gems or Grotto Gems; Gold → Prismatic: Frost Cores + Frost Sigils. Level and XP carry over, and the new tier raises the cap. Each tier adds a big power step.
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

## 12. Defaults for underspecified points

Points the decisions above leave open. These defaults apply until changed.

1. **Respec cost.** Free for card enhancements; the account tree has a respec that costs a small amount of Starlight, with the first one per prestige free.
2. **Rank for card enhancements.** Silver ★1.
3. **Enhancement point budget.** Grows with rank (a few points per tier) and is about half of the total cost of the card's options.
4. **XP rates.** Tuned in the balance phase so the account level rises quickly early and slowly later.

## 13. Art style

Decided with the user in the graphics overhaul. References (Knights & Dragons armour sets and card UI, Brave Frontier, a cartoon flame-jet effect sheet) are kept locally in `design/references/` and never committed.

- **Simple but cool.** Everything is vector, so the art favours strong silhouettes and few parts, with detail only where it reads at game size.
- **Look.** Cel-shaded, like Knights & Dragons and Brave Frontier: bold dark outlines (one ink colour, about 3 px at card size), flat shadow shapes and white highlights instead of gradients, saturated metals, and a chunky display font for card names.
- **The card is the showpiece.** The frame is the tier (section 5): the Knight plate frame grows from plain plate (Bronze) to spikes (Silver), side spikes and a crest gem (Gold) and plate wings with rainbow metal (Prismatic). Rarity colours the card body.
- **Inside the card is its signature item**, not a character: a weapon, shield, tool or relic, cel-shaded like the frame. **Rarity sets how intricate the item is**, adding parts rather than only colour: Common plain; Rare a fuller, wrapped grip and gem pommel; Epic a winged guard and gem; Legendary a broader, serrated or ornate shape, gold inlay and a ribbon; Mythic neon runes and a crystal edge; Exotic forked or split shapes and floating rings; Void black chrome, glowing cracks and orbiting shards. Twinkles get more frequent with rarity.
- **Characters** (chibi armoured figures in the same style) are used for **dungeon bosses** and may appear as special card skins later. Bosses and enemies **look like their area** (a mossy root guardian for the Mossy Cellar, an ember-and-bone caster for the Ember Crypt, an ice giant for the Frostspire Vault), and each boss needs a clearly different body shape, not a recolour: the Root Warden wide and squat (a hollow stump with root arms), the Cinder Lich tall and floating (a horned skull with a gold crown of fire, a gold-collared robe, bony fists and a burning-skull staff), the Glacier Colossus top-heavy (crystal shoulders and boulder fists). Bosses are drawn in the **sticker style**: one flat colour per part, a single white highlight and a thick white sticker outline with a drop shadow around the whole figure. The Glimmer Trial target is the **Crystal Sentinel**: a floating one-eyed crystal diamond inside a halo ring, with four orbiting shards that light up as the attempt's score passes 25, 50, 75 and 100%.
- **Element effects.** Every card has an element; its effect is generated from the item's own shape (edges, fuller, tip), never a static picture placed on top, and always stays secondary to the item: slow and calm. Effects **wrap around** the item: most of the effect sits behind it with a smaller share in front, arcs and streams may reach past the item's outline, and auras follow the outline itself. Effects are cartoon cel animations (outlined blobs and arcs); glowing embers and branching lightning are drawn in the same cel style.

  | Element              | Effect                                                                                                     |
  | -------------------- | ---------------------------------------------------------------------------------------------------------- |
  | Fire                 | Edge fire: flames along the edges with uneven, drifting highs and lows; or a trailing stream off the tip   |
  | Storm                | Arc crackle: jagged cel lightning jumping between points on the item and off its tip                       |
  | Light                | Aura shell: outlines of the item pulsing outward, shedding sparks                                          |
  | Nature               | Spiral wrap: a ribbon of leaves and light coiling around the item                                          |
  | Earth, crystal, void | Power cracks: jagged glowing cracks inside the item, flickering like the arc crackle, in the item's colour |

- **Hits.** Slashes are single brush strokes, straight with a slight curve, tapered with dry-brush streaks, re-rolled every hit (angle, length, thickness, offset) and always centred on the target. Bows and pickaxes use the impact hit instead; there are no arrow projectiles. Hit colour follows the element.
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

- **Resources are carved gems.** Every production resource is a gem: its **outline** says which one (Oak round, Ironbark pentagon, Moonwillow star, Copper square, Iron hexagon, Grotto drop) and its **carved pattern** comes from its source (grain, rings and swirls for the trees, glowing veins for the mines). Icons set the faceted gem in a **notched coin** with a **sticker outline in the tier colour**: the coin's metal and its outline both show the tier (stone, bronze, silver, gold, prismatic), and a resource not discovered yet shows as a grey coin with a stone outline and a padlock. In the world, each tree is themed to its gem (colours and bark pattern) and hangs its gems, and each mine is rock with its gems set into it. The scenery is **faceted** like the gems: canopy, trunk, rocks and a hexagonal ground tile are cut into flat light and dark faces, with the same white sticker outline as the bosses. Navigation icons keep the hexagonal plaque.
- **Performance.** Element effects run on one shared animation loop (a small canvas behind and one in front of each item, so effects can wrap around it), only for cards on screen, at a capped frame rate. Under reduced motion they show a still frame.
