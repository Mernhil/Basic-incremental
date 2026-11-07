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
- **The tier is the card's frame** (see section 13): each tier-up rebuilds the frame in a new material, fills more of its gem sockets and grows its crest, staying a border (section 13). Bronze: hammered plate. Silver: engraved polished metal. Gold: scrollwork with a velvet liner, with light and motion. Prismatic: crystal with rainbow motion.
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

### Beta portals

Decided with the user for the beta. Numbers live in data and will be tuned.

- **Pulls.** Every portal offers a **single pull** (1× cost) and a **10-pull** (10× cost). Every 10-pull **guarantees at least one Rare or better**.
- **Hard pity.** **Legendary or better at 90 pulls** without one. Pity counters are **per portal**, saved, and **kept through prestige**.
- **Rates** are shown in a hover tooltip on the portal.
- **Card Portal** costs Moss Sigils: single 10, 10-pull 100. When it ships, the **1% card drop from bosses is removed** (11.9).
- **Wardrobe Gate** costs Ember Sigils and ships **with the Wardrobe**, never before, so cosmetics are never pulled before they can be equipped or upgraded. Same pull and pity structure. Its pool holds the cosmetic sets and loose items; **duplicates feed cosmetic upgrade levels**. Any item whose source this document does not define goes in the Wardrobe Gate at its rarity.
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

### 11.11 Crits

Decided with the user for the beta.

- Two stats, `combat.critChance` (base **5%**) and `combat.critDamage` (base **×2**), through the modifier pipeline like every stat.
- **Normal hits and signature attacks can crit.**
- The account tree's **Combat** branch has crit nodes; cosmetic set bonuses may use crit stats. Card tables (11.9) stay as they are.

### 11.12 Level milestones

Decided with the user for the beta.

- **Mine levels** and the **three damage lines** give **×2** to that line's output **every 25 levels**. Milestones are data-driven per line so they can differ later.
- The next milestone is marked on the upgrade ("Lv 25: ×2"); reaching one plays a small celebration and a toast.
- Damage lines persist through prestige, so their milestones do too; mine levels reset, and their milestones with them.
- Milestones also drive the visual growth of tiles and edges (section 16).

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
9. **Tree tile stages (E4).** Trees have no levels, so a tree tile grows **one stage every 5 plots bought** (logging expansions; `tileStages` in `progression.json`), up to the top stage. All tree tiles share the stage; it resets on prestige with the plots. Mine tiles follow their mine level milestones.
10. **When mastery tiers apply.** Lifetime totals and kills grow continuously, but a new mastery tier (gem or medal) takes effect on the next whole second of play, like card levels, so online, offline and any split of time give the same totals. A save migrated from before mastery gets its tiers from its totals when loaded, without tier-up moments.
11. **What counts as harvested (E2).** Every gem gained from plots / slots, harvest bursts included, online and offline. Gems from other sources (none yet) would not count.
12. **Medal bonuses.** "+10% sigil drops" multiplies the sigils of each kill by 1.1 per tier; a fraction rounds up with that chance, so the average is exact. "+10% core drops" is +10% per tier on the Core drop chance. The **Glimmer Trial medal** (from its best score at 25 / 50 / 75 / 100%) gives +5% damage in the trial and +10% to its rewards per tier, mirroring the boss medals.
13. **Unified tier-up moments (E1).** One `TierUp` shape for gem mastery, boss medals, mine and damage line milestones, tree tile stages, card tier-ups and the Gold ★6 unique evolution. Mastery tier-ups come from the game tick (and the welcome-back summary); the others from the purchase that caused them.
14. **Goal tracker (E8).** Goals come from the rules in `progression.json`: dungeon and trial clears, tree unlocks, the next mine / damage milestone, gem mastery and boss medals at least 25% of the way, and star-ups whose duplicate is in hand. ETAs use the current rates (production with the average harvest burst, the drops of what is being fought); a boss that would knock the loadout out before dying has no ETA. Goals sort by ETA, unknown last, then by progress. Clicking jumps to Dungeons, Production or Cards.
15. **Balance sim (lite).** `npm run sim -- --hours 40` plays the real game logic with a greedy buyer: every step it buys whatever is affordable (card star-ups and tier-ups first, then tree kinds, then the purchase that spends the smallest share of the bank), spreads plots / slots evenly over the unlocked producers (remainder to the lowest tier), fills each loadout with its rarest cards within the cost cap, and fights the Glimmer Trial once it can score 100%, else a killable dungeon that drops a Core a card is waiting for, else the hardest killable dungeon. "Beta content mostly exhausted" counts as every other 11.7 milestone reached and every card owned.
16. **Portal pulls.** Pulls in a batch are rolled in order. Hard pity is checked first on every pull; the 10-pull guarantee applies to the **last** pull of a 10-pull when none of the first nine (and no pity pull) reached it, and then picks from the pool's items at or above the guarantee rarity by weight. A pity or guarantee pick keeps the pool weights among the eligible items. The reveal's upgrade flash happens on 25% of results above the pool's lowest rarity (`reveal.upgradeFlashChance`): the orb starts one rarity lower. The boss card drop and its `drops.cardChance` stat are removed with the Card Portal.
17. **Ascension details.** Starlight = floor(((Σ gems harvested this run × tier weight 1 / 10 / 100) / 2e5) ^ 0.5), through `prestige.gain`; an ascension needs at least 10 (all in `prestige.json`, tuned so the sim's first ascension lands near 8 h). Starlight is a resource of kind `prestige`, the only resource an ascension keeps. Besides DESIGN 3 and 16, an ascension also resets the burst gauges, the boss being fought (back to full HP), the loadout's health and a running Glimmer Trial attempt; it keeps boss kills, trial best scores, the rare-drop pity counters, card levels and loadouts, rare items and the active dungeon. The Starlight shop holds permanent levels (logging and mining output, damage, card health, sigils, slower price growth, offline cap), each level adding its bonus once more (source `prestige`). Prestige cosmetics: Gilded Plate at the first ascension, Aurora Veil at the second, Gilded Filigree at the third; a duplicate becomes a copy. The balance sim ascends when allowed and the gain at least matches all Starlight earned so far.
18. **Where Ascension lives.** Section 9 has no Ascension slot and the shard shop is a tab of the Achievements page (section 17), so the **Shop** page holds the Ascension gate (A9 E) with the **Starlight shop** under it; the sidebar order and labels stay as in section 9. Starlight leads the header's currency row, since it is the one currency kept forever.

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
  - Each tier gives **+5% damage** against that boss and **+10%** to that dungeon's sigil and core drops (source `mastery`, condition = dungeon).
  - The medal shows on the floor rail and next to the boss on the stage. The Glimmer Trial's medal tiers come from its **best score** instead.
- **E4 Growing tiles.**
  - Tree and mine tiles grow visually with their level, **one visible step per 25-level milestone**.
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
  - Every account level gives its skill point plus a listed reward: every 5 levels a bundle of sigils, every 10 levels a cosmetic, some levels a loadout cost cap bump.
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
