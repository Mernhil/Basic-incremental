# Basic Incremental — Game Design

The source of truth for the game's design. It holds one version of every rule: the current one. Anything not covered here is an open question for the user.

## How this document works

Every rule starts with a status tag:

| Tag          | Meaning                                                                                                                                 |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `[Built]`    | Decided by the user and in the game as written.                                                                                         |
| `[Differs]`  | Decided by the user. The game has it but works differently: the text is the target, and the rule says what the game does today.         |
| `[To build]` | Decided by the user, not in the game yet.                                                                                               |
| `[Default]`  | Filled in by Claude; the user has not decided it. `[Default · in game]` when it is built. Every default is listed under Open questions. |
| `[Proposed]` | Suggested in a chat and waiting for the user's answer. Not built. Every proposal is listed under Open questions.                        |

Rules for keeping this file clean (they also bind every Claude session, in claude.ai and in Claude Code):

1. **One version of each rule.** This file holds only the current design. A change rewrites the rule where it lives. Never add amendment, update, addendum or "defaults" sections, and never leave an old version next to the new one.
2. **Every rule has a tag.** `npm run lint` runs `scripts/check-design.mjs`, which fails when a rule has no tag or an amendment-style section appears, so CI blocks it.
3. **Only the user decides.** When something is missing, Claude asks. If work cannot wait, Claude writes its choice where the rule belongs, tagged `[Default]`, and lists it under Open questions; it stays a default until the user confirms it. Claude never changes a decision of the user's on its own: a tuning that needs to break one is a question, not an edit.
4. **Decisions reach the repo first.** A decision made in a claude.ai chat is written as edits to this file. The prompt for Claude Code starts with those edits, and Claude Code commits them before any code. A chat decision that is not in this file is not a decision yet.
5. **Tags move with the code.** A PR that builds or changes a rule updates its tag in the same PR (`[To build]` or `[Differs]` becomes `[Built]`). A rule the game no longer matches is never left `[Built]`.
6. **Rules, not tuning.** Exact tuning numbers live in `src/data/content`, and the rule names the file. This file keeps the rules, the targets and the numbers the user decided. Tuning stories go in the PR description.
7. **Changelog.** A changed or dropped rule gets one dated line at the end: what changed and who decided it.
8. **Say where things stand.** Asked whether something exists, Claude answers with its tag (built, differs, to build, default, proposed), never just "it already exists".

The layered version this file replaced (sections 11 and 12 as amendments) is in git history at commit `ac33acd`.

## 1. The game

- [Built] A Windows desktop incremental about collectible cards: two production jobs (logging and mining) and auto-fought dungeons, with a gacha for cards and cosmetics. Customization is the main feature. Made mainly for the user, maybe for others.
- [Built] **Brave Frontier is the main reference** for style, screen order, upgrades, the evolution feel and the gacha, adapted to a desktop app: no characters as cards, no turn-based combat, no energy or stamina timers.
- [Built] **Three loops** (§3): dungeons pay Money and crystals, production pays materials, and both are spent on cards and cosmetics.

## 2. Distribution, saves and tools

- [Built] A Windows `.exe` built with Electron and TypeScript; unsigned is fine. Pushing a version tag (`vX.Y.Z`) builds it in GitHub Actions and publishes a GitHub Release. The app checks for updates on launch.
- [Built] **Saves** are JSON on disk with autosave and export / import. They are versioned: every format change bumps the version and adds a migration.
- [Built] **Offline progress** follows the same rules as online play and is capped at about 8 hours.
- [Default · in game] **Dev tools.** Dev builds take `BI_PROFILE` / `--bi-profile` or `BI_USER_DATA_DIR` so parallel dev apps never autosave over each other. Dev cheats live in the separate `game/dev` entry, show only in unpackaged builds, and `npm run build` fails if a release bundle contains them.
- [Default · in game] **Report an issue** opens a pre-filled GitHub issue with the app version, a save summary, OS and Electron versions and the last log lines, kept under about 7,500 characters. The player can edit it before submitting.

## 3. Economy: the three loops

- [Built] **Money comes only from dungeons**: a wage per second while fighting the first dungeon's boss (not while knocked out) and a purse on every kill in every dungeon (`dungeons.json`). A new game starts with 100 Money. Its display name lives only in `resources.json`.
- [Built] **Money buys** tree and mine levels, the upgrade shelf (§4) and weapon tier-ups (§5). The three damage lines it used to buy are gone (§5).
- [Built] Every Money price is a curve `base × growth^n` in the data files, read through `cost.multiplier` and `cost.growth`.
- [Built] **Production pays materials only**: the six gems. Gems, Cores, Frost Sigils, Glimmer Dust and Facet Shards pay for card upgrades, cosmetic upgrades and tree unlocks. Nothing in production pays Money.
- [Built] **Crystals are the premium tier.** The Summon Crystal pays for the Card Portal and the Glamour Crystal for the Wardrobe Gate. Every dungeon drops both on every kill, deeper dungeons more. Only the portals spend them, and Ascension keeps them.
- [Built] **Cores** (Moss, Cinder, Frost) drop with a chance per kill and **Frost Sigils** only in the Frostspire Vault, so every dungeon stays worth farming for its material (`dungeons.json`).

## 4. Production

- [Built] **One of each.** Each tree kind and mine type exists once and is levelled up. There are no plots or slots, no copies of the same tree or mine, and no expansions to buy (user, 2026-11-08). Every unlocked kind produces once, at its level.
- [Default · in game] A kind produces from level 0: unlocking it starts its output at its base rate, and levels and milestones add to that.
- [Default · in game] **Balance after plots.** Every filled plot added a full copy of a tree's output, so the base rate of every tree kind and mine type is now three times what it was (Oak 3 a second, Copper Quarry 1.5, ...; `trees.json`, `mines.json`), tuned with the sim against the pacing targets (§14). The +10% per level and the ×2 every 25 levels stay as they are. Old saves got back the Money they spent on plots and slots (save format 16, built): each expansion at its old price, 25 × 1.4ⁿ rounded up, before any modifier.
- [Built] **Trees.** Oak (start), Ironbark and Moonwillow, each yielding its own gem. A tree kind is unlocked once with gems of the tier below (`trees.json`).
- [Built] **Mines.** Copper Quarry (start), Iron Deeps (unlocked by clearing the Mossy Cellar) and Crystal Grotto (unlocked by clearing the Ember Crypt), each yielding its own gem.
- [Built] **Levels.** Each tree kind and mine type has a level bought with Money (`trees.json`, `mines.json`): +10% output per level and ×2 every 25 levels. The next milestone shows on the line ("Lv 25: ×2") and reaching it plays a small celebration. Levels reset on Ascension.
- [Built] **Upgrade shelf.** One-time Money upgrades beside the level lines (`upgrades.json`). Each appears when its unlock is met, glows when affordable and is owned once bought; its effects are ordinary modifiers. Per-run items reset on Ascension; permanent ones stay. Lifetime Money earned is counted and kept.
- [Default · in game] The six shelf upgrades that were unlocked by damage-line levels (Copper, Iron and Crystal Temper and Hardening) went with the lines, and an owned one paid its Money back (save format 17). No shelf item depends on plots or damage lines.
- [Built] **The main card plays the field.** The main logging or mining card strikes with its pattern (`cards.json` `main.harvest`: steady, chop, flurry or volley; interval, strikes per cycle and targeting sweep, random or all) and shows "+n" per strike. Strikes are show: the economy uses the expected value, so online and offline give the same totals. The targets are the unlocked kinds.
- [Built] **Harvest burst.** Each job ticks once per second and each tick fills the main card's gauge by 1. At 30 it gives 10 s of the job's output at once, played as a wave with one big total.
- [Built] **Harvest crits.** `harvest.critChance` (base 0) and `harvest.critDamage` (base ×2) per job, through the modifier pipeline. Nothing grants a chance yet.
- [Built] **Gem mastery.** Each gem's lifetime harvest gives a mastery tier at 1e3 / 1e5 / 1e7 / 1e9 (bronze to prismatic), +10% to that gem per tier, kept through Ascension. The gem's coin shows the tier in its metal.
- [Default · in game] Every gem from production counts as harvested, harvest bursts included; mastery tiers take effect on the next whole second so any split of time gives the same totals.
- [Built] **Screen: side stage.** Rows on the left, one per tree kind or mine type, in a Logging and a Mining panel: the tile (it grows with level), name, level, output per second, a bar to the next ×2 milestone and the buy button on the row. A locked kind is a greyed row with its unlock price on the button (a locked mine names the dungeon to clear). One ×1 / ×10 / ×100 / Max toggle at the top right. A sticky stage on the right shows one job at a time (a Logging / Mining tab switch): the main card at about 2x inside its loadout fan (§11), its harvest gauge, the strike pattern in words and the support effects as a list. The main card lunges toward the row it strikes and "+n" pops on that row; a burst runs a wave down the rows. The upgrade shelf is a drawer over the bottom: closed it is one line (how many upgrades are ready to buy and how many are owned). Picked by the user from five mockups (option C).
- [Default · in game] The shelf drawer starts open on a window at least 900 px tall and closed on a shorter one, then keeps the player's choice; the stage remembers its last job; "ready" counts the upgrades the player can afford now.

## 5. Cards and weapons

### Cards

- [Built] **Job-specific.** Logging, mining and fighting cards; a card only works in its own job.
- [Built] **Loadouts.** Each job has 1 main card and 3 support cards. Any card of the job fits any slot, once per loadout. Every card has a main ability (used when it leads) and a support effect (used as a support).
- [Built] **Rarity.** Common, Rare, Epic, Legendary, Mythic, Exotic, Void. Rarity sets the colour of the card body: steel grey, blue, purple, amber, then neon pink, neon orange and black chrome. The job is a label, not a colour.
- [Built] **Cost.** Each card costs by rarity (`cardRules.json`, Common 2 to Void 20) and each job's loadout has a cost cap that grows with account level (§10). A loadout over the cap cannot be saved.
- [Built] **Start.** A new game owns Ember Squire, Apprentice Feller and Cave Digger at Bronze ★1, Lv 1, each leading its job.
- [Built] **Collection.** Each card is owned once; further copies are stored on it as duplicates. Duplicates past the last star become shards for the shard shop (§10), more for higher rarities.
- [Built] **Abilities.** Fighting mains shape how damage is dealt (steady ticks, fast hits that fill the gauge quickly, slow heavy hits with a stronger signature attack). Production mains shape output and the harvest pattern. Supports add a percentage or a gauge, drop or material bonus. Every card effect goes through the modifier pipeline (source `card`).
- [Built] **Beta cards** (`cards.json`):

  | Job      | Card              | Rarity    | Element | Weapon                 | Main ability                                       | Support effect                     |
  | -------- | ----------------- | --------- | ------- | ---------------------- | -------------------------------------------------- | ---------------------------------- |
  | Fighting | Ember Squire      | Common    | Fire    | Ember Blade (sword)    | Steady hits every 1 s                              | +5% damage                         |
  | Fighting | Shield Warden     | Rare      | Light   | Bulwark (shield)       | Steady hits every 1 s, +10% damage                 | +1 burst fill per hit              |
  | Fighting | Storm Duelist     | Epic      | Storm   | Twin storm blades      | Fast hits every 0.5 s, gauge fills twice as fast   | +12% damage                        |
  | Fighting | Dawnblade Regent  | Legendary | Fire    | Dawnblade (greatsword) | Heavy hits every 2 s, signature attack ×15         | +15% damage, +10% rare drop chance |
  | Logging  | Apprentice Feller | Common    | Nature  | Hatchet                | Steady output                                      | +5% logging                        |
  | Logging  | Grove Keeper      | Rare      | Nature  | Sapling staff          | +10% logging                                       | +1 harvest-burst fill per tick     |
  | Logging  | Elder Treant      | Epic      | Nature  | Heartwood maul         | Harvest bursts give 15 s of output instead of 10 s | +12% logging                       |
  | Logging  | Moonwood Dryad    | Mythic    | Light   | Moon bow               | +30% logging, harvest gauge fills faster           | +20% logging                       |
  | Mining   | Cave Digger       | Common    | Earth   | Pickaxe                | Steady output                                      | +5% mining                         |
  | Mining   | Gem Cutter        | Rare      | Crystal | Cutting chisel         | +10% mining                                        | +1 harvest-burst fill per tick     |
  | Mining   | Geode Golem       | Legendary | Crystal | Geode hammer           | Harvest bursts give 15 s of output, +15% mining    | +15% mining                        |
  | Mining   | Core Titan        | Exotic    | Void    | Core gauntlet          | +40% mining, harvest gauge fills faster            | +25% mining, +5% Core drop chance  |

### Weapon progression

_Decided with the user on 2026-11-08. It is a gacha game: strength comes from the cards you own and how far you have taken them._

- [Built] **Strength comes from cards.** The card's rarity sets its base stats (damage and health), support cards are the passives, and the main card's weapon is the only fighting upgrade.
- [Built] **No damage lines.** Copper Edge, Iron Edge and Crystal Edge, their milestones, goals, tier-up moments, bulk buys and previews are gone (user, 2026-11-08). Fighting damage is the main card's base damage (below), then the modifier pipeline (supports, tree, mastery, crits, bursts).
- [Built] **Base stats by rarity.** Each card has a base damage and a base health set by its rarity, with the same ratios (`cardRules.json`: health Common 100 to Void 1,000; damage in the Base damage rule below). Fighting damage is the main card's base damage × its power (level, tier and stars); with no card leading, a bare-hands damage applies (`combat.json`).
- [Differs] **Level.** XP from fighting raises the weapon's level, up to its tier's cap. Levelling adds new moves or damage types. No resource buys a level. Today fighting XP and the caps are built as below, and a level adds only the small bump; it adds no moves yet.
- [Differs] **Tier.** At max level and ★6, Money plus materials upgrade the weapon to the next tier: Bronze → Silver → Gold → Prismatic → Unique (user, 2026-11-08). The stars then restart at ★1 with an empty star bar (a Bronze ★6 becomes a Silver ★1), so every tier is starred up again; the level stays and only its cap rises. Each tier gives the weapon a new look within its own family (like a single Brave Frontier unit evolving), a new frame, a higher level cap and a power step. Built: the tier-up at max level and ★6 paid with Money, Core and gems (Tier-up costs below), the star reset, the new frame, the higher cap and the power step; the checklist and the goal tracker report the missing requirement (level or stars). The new look is not: until each weapon has its own tier art the picture moves one rarity step per tier (Weapon looks, for now; the target is Tier looks below).
- [To build] **Tier looks.** Every tier upgrades the weapon's own picture, and each step must read as an upgrade, not only a new colour (user, 2026-11-08). Bronze, Silver and Gold add parts to the weapon's design and change its colours, with no glow or animation of their own. Prismatic adds more parts plus glowing details and small animations. Unique is the weapon's final form: the full design with its own animations, effects and colours (Unique weapons, §12). Each weapon is drawn as a five-step ladder, one step per tier; until a weapon's ladder is in the game it uses Weapon looks, for now.
- [To build] **Commons stop at Gold.** As in Brave Frontier, there are common and rare weapons. Common cards are the starting blocks: their tiers end at Gold, so they never reach Prismatic or Unique and never get the glow, animations and final form those tiers bring (user, 2026-11-08).
- [To build] Every card from Rare up can reach all five tiers (Unique only with a unique version, as in The Unique tier below); a Common's level cap ends at Gold's 60, and its copies past Gold ★6 become shards like any duplicate past the last star (user, 2026-11-08).
- [Built] **Stars.** Duplicates fill the card's star bar and a full bar buys a star. Stars are the weapon's prestige: they raise its base damage and health (Star impact below). A star costs only copies of the card; stars no longer raise the level cap. A tier-up needs all six stars and resets them (Stars restart on tier-up below).
- [Default · in game] **Stars balanced.** One duplicate per star was too easy and each star did too little (user). The copies per star are now tuned with the sim so the median run reaches a Gold ★6 near the 7 h target (Star bar below); the impact of each star is the Star impact step below, unchanged.
- [Built] **Unique weapon.** The last upgrade, the Unique tier, swaps in the weapon's unique version, the most meaningful step of all. Eventually every base weapon (12 kinds) gets one. Drawn so far: Flameblade (sword) and Rootbloom Staff (staff); Soul Reaper (scythe) waits for a card that uses a scythe. A card has a unique version when `cards.json` names one (`evolution`); only those cards can reach the tier.
- [Default · in game] **XP from fighting time.** A fighting card in the loadout gains XP for every second it fights (not while knocked out) plus a bonus per kill, so a card stuck at a wall still levels. The per-second rate grows with the dungeon tier like the kill bonus; the special dungeon pays the tier 1 rate. It is derived from fight time, so online and offline give the same result. Production cards keep their XP per gem harvested. Rates live in `cardRules.json`.
- [Default · in game] **Level caps by tier only:** 20 / 40 / 60 / 80 / 100 for Bronze, Silver, Gold, Prismatic and Unique (`cardRules.json`). Stars no longer raise the cap. A saved card above its new cap was set to the cap (save format 17), so it can tier up at once.
- [Built] **Small bump every level.** Each level adds a little to the card's power, support strength and gauge speed (`cardRules.json`).
- [Proposed] **Moves.** Milestone levels unlock new nodes on the card's enhancement chart, picked with points, and each star gives enhancement points. Which moves and damage types each card learns needs a content pass with the user.
- [Default · in game] **Star bar.** Each duplicate fills the card's star bar by an amount set by its rarity (1 copy for now), and each star needs more than the one before, so Commons need many copies and top rarities few. The fill is saved on the card and a star-up costs only the fill; what is left over carries to the next star. A star that needs 0 copies can be taken at once. Every tier-up needs a full ★6 climb, so the counts were cut to keep the pacing targets; sized from the Card Portal rates and tuned with the sim (`cardRules.json` `starBar`):

  | Rarity    | Copies for ★2 → ★6 | Total | Rough pulls to ★6     |
  | --------- | ------------------ | ----- | --------------------- |
  | Common    | 1, 1, 1, 2, 2      | 7     | ~30                   |
  | Rare      | 1, 1, 1, 1, 1      | 5     | ~65                   |
  | Epic      | 1, 0, 1, 1, 1      | 4     | ~130                  |
  | Legendary | 1, 0, 1, 1, 1      | 4     | ~350 (less with pity) |
  | Mythic    | 1, 0, 1, 0, 1      | 3     | ~660                  |
  | Exotic    | 1, 0, 0, 1, 0      | 2     | ~880                  |
  | Void      | 1, 0, 0, 0, 1      | 2     | not estimated         |

- [Default · in game] **Star impact.** Base damage and health are multiplied by ×1.25, ×1.6, ×2, ×2.6 and ×3.5 at ★2 to ★6, so a maxed Common (base 200) equals a fresh Legendary (base 700). The bonuses of supports and the main growth keep their smaller star step (`cardRules.json` `power`).
- [Built] **Stars restart on tier-up** (user, 2026-11-08). A tier-up needs the card at ★6 and resets it to ★1 with an empty star bar, the star colour following the new tier; each tier is starred up again from copies alone, and Cores, gems and Money go to tier-ups. Copies of a card waiting at ★6 for its tier-up still become shards. No save change was needed: saved cards keep their stars and fill, and a card above Bronze that is under ★6 cannot tier up again until it reaches ★6 (save format 18 had already moved old duplicates to an empty bar).
- [Default · in game] **Star fill in the shard shop.** The shard shop sells copies of a chosen card, and a bought copy fills its star bar like any duplicate. A copy past ★6 (or when the bar already holds every star left) becomes shards.
- [Default · in game] **Weapon looks, for now.** Until each weapon has its own tier art, every tier moves the weapon one step up its existing rarity ladder: a Common sword shows the common, rare, epic and legendary swords from Bronze to Prismatic, capped at Void; a Unique weapon shows its unique item. The proper tier looks go through the art review (§12).
- [Default · in game] **Production cards** follow the same level, tier and stars model, with XP from harvesting.
- [Default · in game] **Old saves.** Damage-line levels are removed and the Money they cost is paid back (save format 17): every level of each line at its old price (10 × 1.11ⁿ, 200 × 1.12ⁿ, 3,000 × 1.13ⁿ, each rounded up, before any modifier), plus the price of each owned Temper or Hardening.
- [Default · in game] **Tier-up costs.** Each tier-up costs Money plus the tier's Core and its tree and mine gems, the gems scaled by the card's job; Gold → Prismatic and Prismatic → Unique also cost Frost Sigils (`cardRules.json` `tierUp`). The Money prices (150k, 3M, 30M and 150M) are about ten kills of the purse of the dungeon tier of that stage. Every amount is tuned with the sim; the Frost Cores and Sigils of the last two steps are the slow part (about 750 Cores and 650 Sigils for Prismatic, 1,100 and 900 for Unique), because only the Frostspire Vault drops them and an Ascension resets them.
- [Default · in game] **Base damage.** Base damage follows the same rarity ratios as health: Common 1×, Rare 1.5×, Epic 2.25×, Legendary 3.5×, Mythic 5×, Exotic 7×, Void 10× (`cardRules.json`, Common 200). Common 200 stays; the Root Warden has 760,000 HP and hits for 0.6, so a fresh game clears it in about half an hour. Fighting damage grows with the card's level bump, tier and stars as today. The growth per level and the tier and star steps were checked against the sim and kept, so the pacing targets hold without damage lines (§14).
- [Default · in game] **The Unique tier** is open only to weapons that have a unique version (today the sword and the staff); the others stop at Prismatic until theirs is drawn, and Commons stop at Gold (Commons stop at Gold above). A Unique weapon keeps the Prismatic frame and shows its unique item, with the unique reveal (§12). Its level cap is 100, its power step ×5 and its enhancement budget the Prismatic one.

### Rank visuals

- [Built] **Stars.** Star colours follow the tier and Prismatic stars are animated. At ★6 the stars get a polished light sweep moving back and forth, coloured to the tier, and a one-time flash. Stars are never covered by anything.
- [Built] **The tier is the frame.** Each tier-up rebuilds the frame in a new material (§12 frame ladder). Prismatic must look clearly different from ★1: rainbow metal, the radiant crest and the strongest element effect.
- [Built] **Ranks never clash with cosmetics.** The frame's tier ornaments own the top, the sides and the area outside the edge; cosmetics change the frame's family and the card's finish (§8).

### Enhancements

- [Built] **Card enhancements** (Brave Frontier Omni SP style). Each card has its own options and a point budget smaller than their total cost, so the same card can be built in different ways. Options apply while the card is in a loadout (source `enhancement`). Respec is supported.
- [Default · in game] They unlock at Silver ★1. Each card has five options from its job's template, scaled by rarity and costing 20 points in total; budgets are Bronze 0, Silver 4, Gold 7, Prismatic 10 and Unique 10 (`enhancements.json`). Respec is free.

## 6. Combat and dungeons

- [Built] **Bosses** are HP walls auto-fought in parallel with everything else, with no combat input. They respawn so they can be farmed. HP shows as stacked bars with a ×N count of bars left; the current bar drains over the colour of the next.
- [Built] **Scaling.** Boss HP and attack grow slowly with the Ascension count; harder dungeons unlock with progress.
- [Built] **Dungeons.** Mossy Cellar (Root Warden, drops Moss Core), Ember Crypt (Cinder Lich, Cinder Core) and Frostspire Vault (Glacier Colossus, Frost Core and Frost Sigils). Every kill drops Money and both crystals (`dungeons.json`).
- [Differs] **Clearing.** A dungeon is cleared after a set number of boss kills: 1 for the Mossy Cellar, 10 for the Ember Crypt, 50 for the Frostspire Vault (confirmed by the user, 2026-11-07). Clearing a dungeon unlocks the next one and its mine. Today the Frostspire Vault needs 90 kills: the economy rework changed it without asking.
- [Built] **Rare drops.** Each dungeon has one rare item at 0.5% per kill with a pity counter (`dungeons.json`).
- [Built] **The Glimmer Trial** is a special dungeon that unlocks when the Ember Crypt is cleared: a strength test against the Crystal Sentinel, which has fixed HP (no Ascension scaling) and never attacks. Each attempt lasts 30 s and repeats; the score is the share of its HP dealt, up to 100%. Each of the 25 / 50 / 75 / 100% tiers pays Glimmer Dust and the top two also Facet Shards (`trials.json`); 100% clears it.
- [Built] **Hits.** The main fighting card hits at its interval (every 1 s with no card). Each hit plays the equipped attack animation and a floating number.
- [Built] **Burst gauge.** Each hit fills the main card's gauge by 1; at 20 the signature attack deals 10× a hit on top of the normal damage. Supports raise the fill.
- [Built] **Crits.** `combat.critChance` (base 5%) and `combat.critDamage` (base ×2) through the modifier pipeline. Normal hits and signature attacks can crit. The account tree's Combat branch has crit nodes.
- [Built] **Our damage lands in hits** (user, 2026-11-08). The main fighting card's damage reaches a boss, and the Glimmer Trial's target, in chunks: one hit every burst interval, each worth the damage per second times that interval, plus the signature attack on a full gauge, so the boss bar drops in steps instead of sliding. Damage within the current interval is held until its hit lands (the timer is saved with the burst gauge), so a kill can come up to one interval later than a smooth drain would give. `TickReport.playerHits` lists the hits for the stage (damage per hit, hit count, signature flag).
- [Default · in game] Damage and crits are dealt at their expected value, so online, offline and any split of time give the same totals; the stage rolls single crits only for show.
- [Built] **Card health.** Bosses hit back at their own rhythm with their own damage. The fighting loadout has one shared health pool: the sum of its cards' health (rarity, level, rank). At 0 the loadout is knocked out for 30 s, the boss heals to full, then the fight starts again at full health. Health and defence come only through modifiers; there are no heal or shield effects. Offline follows the same rules.
- [Built] **Hits land in chunks.** Each boss attack takes its damage from the pool in one chunk at the boss's rhythm, like the player's hits, with the same damage per minute so the balance holds (user, 2026-11-08). The pool takes each attack as one chunk, the loadout is knocked out on the hit that empties it, and `TickReport.bossAttacks` lists every attack. On screen (the user's pick at the review gate, "Screen edge pulse", 2026-11-08): the health bar closes at once and each hit's piece stays pale for a moment like a trailing segment, then falls off the bar, small for a light hit and wide for a slam. The red numbers on the cards come from those reported attacks, not from a timer of the stage's own.
- [Default · in game] **Boss attack pattern.** Every boss hits lightly at its rhythm, and every sixth attack is a telegraphed heavy slam: five light hits at 0.4× and one slam at 4× an attack, so the damage per minute in `dungeons.json` stays the same (`bossPattern` in `combat.json`; defence applies to every hit). Built: the attacks, their damage, `bossAttackView` (when the next attack and the next slam land, a 0..1 wind-up) and the slam flag on each reported attack. The wind-up is the screen edge pulse (the look is the user's pick, 2026-11-08): in the last 1.5 s before a slam the arena's edges pulse red, building up and breathing faster toward the hit (under 3 pulses a second and never switched fully off, so it does not strobe), then one soft red flash and a shake as the slam lands; under reduced motion it is a still glow that builds up, with no flash or shake. It follows the game's own attack clock, not a timer of the stage's. The attacks sit on the play-time clock like the harvest strikes (attack N lands at N × the boss's interval), so no new saved state is needed and online, offline and any split of time agree; a fight that starts mid-cycle meets its first slam whenever the clock says, and hits that would land during a knockout do not.
- [Default · in game] **"You fall in" readout** tells the player when the loadout would fall before it kills the boss, which can then never die. `stageReadout` gives `secondsToKnockout` (the full pool, averaged over the six places in the cycle a fight can start from), `secondsToKnockoutNow` (the health left, on the real schedule) and `fallsFirst`, and the goal tracker and the sim treat a dungeon with `fallsFirst` as a wall. On screen (the look is the user's pick, 2026-11-08): a red pill at the top of the arena that reads "You fall in 16m 40s, 42s before the boss does", shown only when `fallsFirst`; nothing shows when the loadout wins the race or in a special dungeon. Its tooltip adds the time left from the health now.
- [Built] **Boss mastery.** Kills per boss give medals at 10 / 100 / 1,000 / 10,000 kills, kept through Ascension: +5% damage against that boss and +10% to that dungeon's crystal and Core drops per tier. The Glimmer Trial's medal comes from its best score.
- [Default · in game] Medal drop bonuses round fractions by chance so the average is exact; the trial medal gives +5% damage in the trial and +10% to its rewards per tier.

## 7. Summon portals

- [Built] **Portals.** Several portals (cards, cosmetics, more later), each with its own pool and a cost in one crystal. In-game currency only, never real money.
- [Built] **Pulls.** A single pull (1× cost) and a 10-pull (10× cost); every 10-pull guarantees at least one Rare or better.
- [Built] **Hard pity.** Legendary or better at 90 pulls without one. Counters are per portal, saved and kept through Ascension.
- [Built] **Rates** show in a hover tooltip on the portal.
- [Built] **Card Portal** costs Summon Crystals (`portals.json`). Bosses no longer drop cards.
- [Built] **Wardrobe Gate** costs Glamour Crystals, with the same pulls and pity. Its pool holds the cosmetic sets and loose items, and its duplicates feed cosmetic upgrade levels. Any item with no other source goes in the Wardrobe Gate at its rarity.
- [Built] **Screen.** The portals stand side by side on a shelf, each with its pity bar and ×1 / ×10 buttons; the reveal opens in a modal.
- [Built] **Reveal.** The portal swirls and an orb drops whose colour hints the rarity, with an occasional upgrade flash to a higher colour; then the card flips inside its frame. A 10-pull flips a row of card backs one by one. A click skips to the next; an option skips all.
- [Default · in game] Pity is checked first on every pull; the 10-pull guarantee applies to the last pull when none of the first nine reached it; pity and guarantee picks keep the pool weights; the upgrade flash happens on 25% of results above the pool's lowest rarity.

## 8. Cosmetics

- [Built] **Nothing visual is hardcoded.** The UI is part of the customization system and the default look is the starter set.
- [Built] **Starter set: Gilded Nocturne.** The night-table shell and the Outfit typeface; the cards use the Knight plate frame. Each layer of the card is a place where more extravagant cosmetics can add decoration.
- [Built] **First unlockable set: Gilded Tradition** (classic trading card: crimson frame, gold plate, rainbow foil). The richer "Medium" gilt variant of the starter is an unlockable border.
- [Built] **Seven card and table slots**, global: card border (the frame family: Knight plate, Dragon horn, Celestial, Crystal, Royal crest), card finish (holo, foil), attack animation (one item holds a variant per job), tick damage style, number style, table background and cursor.
- [Built] **Four UI-skin slots**, always worn: Starlight coin, sticker style, skill nodes and Wardrobe style.
- [Built] **Every drawn option is kept** (beta art batch B1–B10). Option A of the Starlight coin, sticker style, skill nodes and Wardrobe style is the starter of its slot and B–E are unlockable. Verdant Reverie and four more garden sets (vine, fern, moss, blossom) are full seven-slot sets with their own bonus. Heartwood Halo and Core Pulse each come with four more card-exclusive variants. Five styles of loose items (forge, woodcraft, star chart, candy enamel, runestone) each have a Common border, Common numbers, an Epic attack and an Epic tick. Max-level particles and corner flourishes are spread across the borders and finishes; corners are pixel art.
- [Built] **Card-exclusives** override a global slot on one card only: Ember Crown (Dawnblade Regent), Heartwood Halo borders (Moonwood Dryad) and Core Pulse finishes (Core Titan).
- [Built] **Wearing depends on rank.** Any item can be owned and its buff counts, but a card wears a border from Gold ★1, a holo finish from Prismatic ★1 and card-exclusive items from Prismatic ★6; below that it shows the starter look (`wearRules.json`). Global slots are always worn. A holo covers the whole card, but card text stays above it.
- [Built] **Sources:** dungeon drops, the Wardrobe Gate, Ascension, achievements, the account reward track and the shard shop.
- [Built] **Buffs.** Owning an item gives a small permanent buff; equipping a full matching set gives an extra bonus, and each set must look coherent when fully worn.
- [Built] **Upgrade levels.** Each level keeps everything below it and adds elements, so an upgrade reads as "more", never "different". Levels need duplicates plus materials from the special dungeon. Every item climbs the same ladder: shape, accent colour, gems, glow, then an ambient animation only at its maximum level. A low maximum compresses the ladder but keeps the order and always ends on the ambient animation.
- [Built] **Maximum level by rarity:** Common 2, Rare 3, Epic 4, Legendary 5, Mythic 5, Exotic 6, Void 6.
- [Built] **Ambient animations are small and cheap:** CSS only, animating `transform` and `opacity`, at most about 6 particles per card, paused off screen, a still frame under reduced motion.
- [Built] **Breaking the edge.** High-level border flourishes may reach outside the card edge by at most about 8% of the card width, only in the corner zones (the outer fifth of each side). The sides and top belong to the tier ornaments, the star footer is a keep-clear band, and where they meet at a corner the tier spikes sit on top. Grids reserve a bleed margin.
- [Default · in game] **Wardrobe details.** Each level costs one duplicate plus the step's material × a rarity factor (Glimmer Dust for shape and accent, Facet Shards for gems, glow and ambient; `cosmeticRules.json`). The owned buff does not grow with the level. Equipping puts the item at its owned level and upgrading moves every worn copy. UI-skin items have one level. Garden set bonuses, exclusive buffs and gate weights are in `cosmetics.json` and `sets.json`.

## 9. Prestige: Ascension

- [Built] **One layer, Ascension,** granting Starlight, a permanent prestige currency.
- [Built] **Ascension resets** tree and mine levels, Money (back to the starting amount), gems, Cores and the other materials, and the per-run shelf upgrades.
- [Built] **Ascension keeps** cards (levels, ranks, loadouts), cosmetics, unlocked dungeons, tree kinds and mine types, the crystals, Starlight, portal pity, boss kills and medals, gem mastery, the permanent shelf upgrades and lifetime Money earned.
- [Built] **Starlight shop.** Permanent levels: logging and mining output, damage, card health, crystals, slower price growth and the offline cap (`prestige.json`).
- [Built] **Prestige cosmetics:** Gilded Plate at the first Ascension, Aurora Veil at the second, Gilded Filigree at the third.
- [Default · in game] Starlight = floor(((gems harvested this run × tier weight 1 / 10 / 100) / 6e5) ^ 0.4) and an Ascension needs at least 10 (`prestige.json`). Ascension also resets the burst gauges, the boss being fought, the loadout's health and a running trial attempt. A repeated prestige cosmetic becomes a copy.

## 10. Account, skill tree, goals and achievements

- [Built] **Account level.** Account XP comes from everything (harvests, kills, summons, Ascensions), and account levels grant skill points.
- [Default · in game] XP rates and the level curve (`account.json`): level L → L + 1 costs 1,100 × 1.2^(L − 1), up to level 50, quick early and slow later.
- [Built] **Loadout cost cap.** 6 at account level 1, +2 per level.
- [Built] **Reward track.** Every account level gives a skill point plus a listed reward: crystals every 5 levels, a cosmetic every 10 levels, and a cost cap bump on some levels. It shows Brave Frontier style as a row of upcoming rewards; a level-up plays a moment listing what you got.
- [Default · in game] Reward amounts, the cosmetics on the track and the cost cap bumps (levels 3, 8, 15, 25, 35 and 45) are in `account.json`.
- [Built] **Skill tree.** The main balancing glue, in two layers: the account tree and the card enhancements (§5). The account tree has six branches (Logging, Mining, Combat, Summoning / Luck, Collection, Automation / Offline) and supports respec. Every effect goes through the modifier pipeline (§14).
- [Default · in game] 23 nodes over the six branches; respec is free once per Ascension, then costs 5 Starlight.
- [Built] **Goal tracker.** The next 1–3 goals with progress bars, in a quest scroll under the header. Clicking one jumps to the right page. Goals are picked by rules in data (nearest by estimated time), never a fixed script.
- [Default · in game] The goal rules: clears, tree unlocks, the next milestone, mastery and medals at least 25% done, a part-filled star bar, tier-ups for cards at their level cap and the next Ascension (`progression.json`). A boss that would knock the loadout out first gets no ETA.
- [Built] **Achievements.** First Harvest, First Kill, Lumberjack I / II, Prospector I / II, Tree Hugger, Deep Delver, Giant Slayer I / II / III, Glimmer Seeker, First Summon, Ten Pulls, Pity Breaker, Silver Lining, Golden Hour, Six Stars, Prismatic Dawn, Full Loadout, Dressed Up, Fashionista, Skilled, First Ascension and Night Owl. Each unlocks once and grants its reward automatically; cosmetic rewards are an item source.
- [Default · in game] Four extra achievements (First Milestone, Gem Adept, Medalist, Masterwork), how each one is read and which reward it gives (`achievements.json`).
- [Built] **Shard shop.** A tab of the Achievements page that spends card shards on card copies, crystal, Core and material bundles, and the Ember Crown.
- [Default · in game] Shard prices: card copies 5 / 10 / 20 / 40 / 75 / 120 by rarity, Common to Exotic; Ember Crown 150, once.

## 11. Interface and screens

- [Built] **Header bar.** Account level with its XP bar, the mute toggle and only three resources: Money, Summon Crystals and Glamour Crystals, each with its rate. Everything else (gems, Cores, Frost Sigils, Glimmer Dust, Facet Shards, Starlight) sits behind a **Details** button, grouped as tree materials, mine materials, dungeon materials and prestige, each with its amount, rate, mastery and use. Crystals are drawn larger than Money and their pickups get a bigger moment; coins of other resources fly to the Details button.
- [Built] **Sidebar**, in this order: Home, Cards, Production, Dungeons, Summon, Skill Tree, Wardrobe, Achievements, Shop, Settings.
- [Built] **Panels and tooltips.** Framed panels on wide, multi-panel screens that use the desktop width. Hover tooltips on stats, items, costs and modifiers, with a breakdown by source.
- [Built] **Stage first.** The Dungeons and Production pages are the focus of the game, so they are live stages, not menus; management goes below or in a side rail.
- [Built] **Home** is a command centre: three live mini-stages (fight, logging, mining) with their rates, each opening its page, and the goal tracker on top.
- [Built] **Dungeons** is a full-bleed arena. Floors, the damage readout and the upgrade shelf live in a drawer that slides up from the bottom; DPS, kills per minute and time-to-kill sit in the top-right corner.
- [Built] **Production** is a side stage: one row per tree kind and mine type on the left, each bought and upgraded on its own row, a sticky stage with the main card on the right and the upgrade shelf in a drawer at the bottom (user, 2026-11-08; the rules are in §4).
- [Built] **Loadout fan.** A loadout shows as a fan: the main card in front and up to three support cards behind it, each peeking out at the side. A click on a support (or on its line in the list beside it) pops it out in front as a full card with its effect written out; a click on it again, anywhere else or Escape puts it back. Cards keep whole device-pixel scales and nothing is rotated, so the art stays crisp (§12). Built for the Production stage (the user's sketch, 2026-11-08).
- [To build] The same fan on the Dungeons fight screen, for the party beside the arena (the component is `ui/loadoutFan.ts`).
- [Built] **Dungeon arena.** The boss is large and centred with an idle bob and its stacked HP bars. Every hit flashes and squashes it, big hits shake, and a finished HP bar shatters. The loadout faces the boss and lunges on its attacks, with its health bar visible. Boss attacks land on the cards with red numbers and a shake; a knockout is a visible moment with its countdown. The burst gauge sits on the main card; the signature attack gets a screen flash, a big number and a brief slow-down. On a kill the boss pops and its drops spill out as coins, rest a beat, then fly to the header; a rare drop gets a light beam, a slow-down and a toast.
- [Built] **Production field.** Every strike shows "+n" off its tree or mine and the coins fly to the header; a harvest burst is a wave with one big total. The main card lunges by its pattern and its supports flash when they help. Reduced motion drops lunges, shakes and flashes.
- [Built] **Numbers.** Header counters roll smoothly and pulse when coins land. Floating numbers use the number style, attack and tick cosmetics, never hardcoded looks; their size follows the hit against the current average, and crits and signature attacks look different. The starter style is sticker numerals: chunky digits with a white outline, a drop shadow and a tilt, bouncing in place.
- [Built] **Buying.** Every buy button previews its effect (for example "DPS 12 → 13, time-to-kill 11h → 2h"). Every level line has ×1 / ×10 / ×100 / Max; affordable buttons glow and a small bar fills toward the next affordable level.
- [Default · in game] Max buys as many levels as are affordable (at least one) and otherwise shows the next level; a ×N buy buys exactly N or nothing.
- [Built] **Welcome back.** After offline progress, a card fan deals one small card per category (time away and the cap, resources, kills, knockouts, drops, card XP and levels, mastery tiers), then Collect sends the coins to the header.
- [Built] **Performance.** At most about 30 popups at once, rapid numbers merged, animation paused when the page or window is hidden, one shared animation loop. Under reduced motion: no shake, flash or slow-down, and numbers fade in place.
- [Built] **Screen picks.** Wardrobe: a mannequin card with the seven slots around it and the item grid below. Skill tree: a radial constellation with gem nodes; card enhancements are a small star chart on the card. Ascension: a prismatic portal gate. Achievements: a sticker book, with the shard shop as its own tab.
- [Default · in game] The Ascension gate and the Starlight shop live on the Shop page.
- [Built] **Settings** has reduced motion, number format, autosave interval, export / import, sound volumes and Report an issue.
- [Default · in game] Settings layout and options: four panels (Display, Sound, Save, Help); reduced motion follows Windows by default; number formats scientific (default), suffixes or engineering, numbers under a million always in full; autosave every 10 s to 5 min (30 s default). These preferences are stored per player, not in the save.
- [Proposed] **Sharp cards.** The collection grid gets its own compact card instead of shrinking the big one, and card text is real text at a readable size (cards already grow in whole-number steps, §12). Optionally the sprites are re-baked at double detail for full screen.

## 12. Art style

- [Built] **Pixel art.** Every asset is pixel art, and each one is approved by the user before it goes into the game (queue in `docs/BETA_PLAN.md`, "Decided visuals"). Reference images stay in `design/references/` and are never committed.
- [Built] **Clean pixels.** Every sprite is drawn on its own pixel grid and shown at a whole number of device pixels per art pixel (`devicePixelRatio` counts, so 125%, 150% and 200% screens each get their own whole scales), with nearest-neighbour scaling. No anti-aliasing, blur, gradients or sub-pixel sizes at rest, and art is never shrunk to make pixels. The only soft glow is the approved one behind effects and the bosses' aura. A card is a whole multiple of its 132 × 186 grid, and its frame, item and effects all share that one scale (132 × 186 CSS px on a 100% screen, 176 × 248 at 150%). Where a layout cannot fit a card at its wanted scale it takes the nearest whole scale that does, and the grid reflows (user, 2026-11-08). The scale choice is `src/renderer/src/ui/pixelScale.ts` (pure, tested) and `pixelFit.ts`; `node scripts/check-pixel-scale.mjs` measures every pixel-art element in the running app at 1x, 1.25x, 1.5x and 2x.
- [Differs] **Small art.** A few places still show art below 1x because the small drawing does not exist yet: the boss portraits in the Dungeons floor list, the card thumbnails of the Wardrobe swatches, and the forged edges (which go with the damage lines). Each needs a small version from the pixel artist; until then they are the only art not on a whole scale.
- [Default · in game] Brief motion is exempt: a hit squash, the idle breathing and bob, a sticker's tilt and a pop may scale or turn art for a moment. At rest everything is on a whole scale.
- [Built] **Pixel rules.** A one-pixel dark ink outline around every part, a one-pixel edge in the part's darkest tone where parts overlap, and a white ring outside the ink on stickers (bosses, tiles, coins). Flat faces lit from the top-left, three to five tones per material, white glints, no stray pixels.
- [Built] **Sizes.** Card items 100 × 120; the whole card is one grid of 132 × 186; production tiles 58 × 64; bosses 160 × 172; coins and medals 48 × 48; navigation plaques 64 × 64.
- [Built] **Brave Frontier technique** (learned from their sprites, never copying them): five tones per material, shadows leaning purple and highlights leaning yellow-white, dark lines between parts, gold trim with a bright top edge, small gems with a white glint. The body barely moves; the life is in the effects.
- [Built] **Card items.** A 100 × 120 sprite with the ink outline, a subtle lighter band on each part's lit edge and a darker one on its shadow edge, a one-pixel light rim outside the outline so dark items stay readable, and plus-shaped sparkles. Items made from the user's concept sheets (maul, bow, the uniques) keep their own shading instead of the bands.
- [Built] **Approved assets** (mockups: [Pixel Art Batch](https://claude.ai/artifact/NLU6j4dSGJZe587PWGDXdK), [Pixel Art Round 2](https://claude.ai/artifact/MP6BXhgJFWdRJDdyLiNcs6)): production tiles, unique weapons, gem coins, bosses and the Crystal Sentinel, mastery medals, forged edges, navigation icons, and the achievement stickers (mini cards climbing the frame ladder in five styles, `design/pixel/achievement-stickers/`). On 2026-11-08 the tiles (by script), then the gem coins, medals, Flameblade, Soul Reaper and the maul and bow ladders (with PixelLab) were redrawn from the user's concept sheets and approved again.
- [Built] **Look.** Simple but cool: strong silhouettes, few parts, detail only where it reads at game size. Cel-shaded like Knights & Dragons and Brave Frontier: bold dark outlines, flat shadow shapes and white highlights, saturated metals, a chunky display font for card names.
- [Built] **The card is the showpiece.** The frame is the tier and rarity colours the body. The frame ladder changes material, gem sockets and crest at every tier and stays a border ([Frame Ladder](https://claude.ai/artifact/BWviG6R6coWmmMLKCCY8ga)):

  | Tier      | Material                                          | Six gem sockets                                   | Crest                 | Light and motion                                                    |
  | --------- | ------------------------------------------------- | ------------------------------------------------- | --------------------- | ------------------------------------------------------------------- |
  | Bronze    | Hammered bronze with dents and green patina spots | All empty                                         | A plain stud          | None                                                                |
  | Silver    | Polished silver with an engraved inner line       | The two top corners hold sapphires                | Small wings           | None                                                                |
  | Gold      | Gold with scrollwork and a red velvet liner       | Sapphires and emeralds in the corners, a top ruby | A small crown         | A shine sweeps across the frame; the corners twinkle                |
  | Prismatic | Crystal band cut into pastel facets               | All six hold rainbow gems                         | A small radiant crown | The band cycles through the rainbow, the shine sweeps, sparks orbit |

- [Built] **The signature item.** Inside the card is a weapon, shield, tool or relic, not a character. Rarity sets how intricate it is, adding parts rather than only colour: Common plain; Rare a wrapped grip and gem pommel; Epic a winged guard and gem; Legendary a broader ornate shape, gold inlay and a ribbon; Mythic neon runes and a crystal edge; Exotic forked shapes and floating rings; Void black chrome, glowing cracks and orbiting shards. The maul and bow follow the user's concept sheet (2026-11-08) instead: the maul climbs from a plain wooden mallet through iron and gold to a crystal-headed hammer, the bow from a plain longbow to an ornate recurve and a flaming bow, one concept step per rarity. How this combines with the tier looks of §5 is an open question.
- [Built] **Unique weapons.** Flameblade (a sword made entirely of flame), Rootbloom Staff (roots, petals, falling leaves, wind and floating earth crystals) and Soul Reaper (a pale curved scythe with soul fire), with their own motion. The reveal: a light beam drops into the card, the frame rebuilds around it with a crest flare, then the unique weapon rises into the window. It belongs to the final tier (§5), the Unique tier.
- [Built] **Characters** (chibi armoured figures) are used for bosses and may become special card skins later. Each boss looks like its area and has its own body shape: the Root Warden wide and squat, the Cinder Lich tall and floating, the Glacier Colossus top-heavy; drawn in the Brave Frontier pixel style with a soft aura in the boss colour. The Glimmer Trial target is the Crystal Sentinel, a floating one-eyed crystal with four orbiting shards that light up at 25, 50, 75 and 100%.
- [Built] **Element effects.** Every card has an element. Its effect is generated from the item's own shape and stays secondary to it, slow and calm, mostly behind the item with a smaller share in front, in a cartoon cel style:

  | Element              | Effect                                                                                   |
  | -------------------- | ---------------------------------------------------------------------------------------- |
  | Fire                 | Edge fire along the edges with drifting highs and lows, or a trailing stream off the tip |
  | Storm                | Arc crackle: jagged cel lightning between points on the item and off its tip             |
  | Light                | Aura shell: outlines of the item pulsing outward, shedding sparks                        |
  | Nature               | Spiral wrap: a ribbon of leaves and light coiling around the item                        |
  | Earth, crystal, void | Power cracks: jagged glowing cracks inside the item, flickering, in the item's colour    |

- [Differs] **Effects unlock with tier:** none at Bronze and Silver, the element effect from Gold, stronger at Prismatic and strongest at Unique, where the effect is the emphasis of the final form (user, 2026-11-08). Today a Unique card keeps the Prismatic effects.
- [Built] **Hits.** A slash is one thin brush stroke (a white core in a yellow stroke), slightly curved, tapered, re-rolled every hit and centred on the target. Bows and pickaxes use the impact hit; there are no arrow projectiles. The hit colour follows the element.
- [Built] **Resources are carved gems.** Each gem's outline says which it is (Oak round, Ironbark pentagon, Moonwillow star, Copper square, Iron hexagon, Grotto drop) and its carved pattern comes from its source, shown on large art only. Icons set the gem in the centre of a round rimmed coin from the user's concept sheet, whose metal shows its mastery tier; an undiscovered gem is a dark void coin with a padlock. Trees are themed to their gem and hang it; mines are rock with their gems set in. Scenery is faceted like the gems.
- [Built] **One metal ladder.** Stone → bronze → silver → gold → prismatic is the progression language for frames, coins, medals, tiles and every other tier. A tier-up of anything plays a metal flash and a short toast. On coins and medals stone is a pale, dull bronze, and prismatic is a lilac coin and a rainbow star. Mastery medals are faceted stars.
- [Built] **Growing tiles.** Trees and mines grow one visible step per 25-level milestone, drawn from the user's concept sheets (2026-11-08) as hand-made sprites. Each stands on a floating island; the rim under it turns to metal as it grows and is rainbow at the last stage. Trees: sprout, young tree with a first fruit, full swirled canopy, fruiting tree, grand tree crowned with a big glowing fruit and sparkles; the fruit has the shape of the tree's gem and the island grows with the tree. Mines: a rock with one crystal, a bigger rock with a crystal cluster, a cave mouth under a crystal crown, cracked rock with glowing veins, a glowing crystal-lined cavern; the crystals take the mine's colour (copper orange, iron grey, grotto blue). Stages reset with the levels.
- [Built] **No forged edges.** The ladder strips of blades belonged to the damage lines and are gone; the weapon's own look on the card takes their place (§5).
- [To build] **Palette cycling** (decided 2026-11-07). Sprites may rotate dedicated colour ramps, pre-rendered into about 8 frames per sprite and animated with CSS `steps()`: the Prismatic frame band and stars, holo finishes, Void cracks, embers and lava, ice shimmer, glowing mine veins. Reduced motion shows the first frame.
- [To build] **Pixel workers** (decided 2026-11-07). The main logging and mining card walks its field as a small chibi (about 24 × 28, shown at 2–3×): idle, walk, work and a burst swing, visual only. Supports pop in for the harvest burst; the armour trim follows the card's tier metal, and after its unique upgrade it carries the unique weapon. Workers get their own small item sprites. How they fit with the cards already playing on the field is an open question.
- [Built] **Performance.** Element effects run on one shared loop with a small canvas behind and in front of each item, only for cards on screen and at a capped frame rate; a still frame under reduced motion.

## 13. Sound

- [Built] **Synthesized SFX** through Web Audio: no asset files, nothing copyrighted.
- [Built] **Sounds:** hit, crit, signature attack, boss hit on cards, knockout, kill, coin pickup, rare drop, buy, milestone, mastery tier-up, harvest burst, summon reveal per rarity and UI click.
- [Built] **Data registry,** so a sound pack can become a cosmetic slot later.
- [Built] **Throttled:** at most a few plays per second per sound.
- [Built] **Settings:** master volume, SFX volume, mute, and mute when the window is unfocused (on by default); a quick mute toggle in the header. On by default at moderate volume; no music for now.

## 14. Pacing and balance

- [Built] **One modifier pipeline.** Every tunable number (rates, damage, drop chances, pity, cost cap, offline cap, XP, costs) goes through it, with skill trees, owned items, sets, cards, upgrades and prestige as inputs. Each modifier has a target stat, a kind (flat, percent, multiplier, set), a source and an optional condition (job, resource, dungeon). The order is fixed: base, flat, percent, multipliers, then caps. Tooltips show the breakdown (`docs/MODIFIERS.md`).
- [Built] **Pacing targets** for active play with the game open:

  | Milestone                                | Target |
  | ---------------------------------------- | ------ |
  | First dungeon cleared (Iron Deeps opens) | 0.5 h  |
  | First summon                             | 0.75 h |
  | First Silver card                        | 1.5 h  |
  | Dungeon 2 cleared                        | 3 h    |
  | First Gold card                          | 5 h    |
  | First ★6 (a Gold ★6)                     | 7 h    |
  | First Ascension                          | 8 h    |
  | Dungeon 3 cleared                        | 12 h   |
  | Glimmer Trial cleared                    | 15 h   |
  | First max-level cosmetic                 | 20 h   |
  | First Prismatic card                     | 25 h   |
  | Beta content mostly exhausted            | 40 h   |

- [Built] **Balance sim.** `npm run sim -- --hours 40 --seeds 5` plays the real game logic and prints each milestone's target, median, spread and runs that reached it. Mastery, milestones and growth are part of it and must not break the targets.
- [Default · in game] The sim player's choices: what it buys first, which card it focuses, what it reserves, which dungeon it fights and when it ascends (`scripts/sim/`). The first Ascension is taken as soon as it pays the minimum, later ones when the gain at least matches all the Starlight earned and the run's Starlight per hour has passed its peak; the player finishes the fighting lead's upgrades first, saves a tier-up's Money only when it is the last thing missing, and holds an Ascension while a tier-up is three quarters funded. "Mostly exhausted" counts every other milestone, every card owned and a weapon at the Unique tier.
- [Default · in game] **On target.** The sim median of every milestone sits within about 25% of its target (`npm run sim -- --hours 40 --seeds 5`), retuned after the 2026-11-08 changes. The spread between seeds is wide, mostly pull luck: an early Legendary lead can bring the Ember Crypt forward by an hour or two and the first Prismatic card ranges over about ten hours. Fighting damage is flat between the first Gold card and the first Prismatic one (the Frost Cores for that step are the wait).

## 15. Systems chosen for the beta, not built

_The user chose these on 2026-11-07 in claude.ai. The handoff to the repo never happened, so they were in no document and nothing was built. The systems are the user's choice; the details were filled in by Claude and are defaults._

- [To build] **Elements in combat.** Each boss has a weakness and a resistance. The main card's element against the boss gives a bonus or a malus, each matching support adds a smaller bonus, and production cards get a lighter bonus on matching sources. Elements are a bonus, never a wall: the pacing must hold with the wrong elements.
- [Default] Root Warden weak to Fire and resists Nature; Cinder Lich weak to Light and resists Fire; Glacier Colossus weak to Storm and resists Crystal; the Glimmer Trial is neutral. Weakness +50%, resistance −25%, +10% per matching support; production +15% (Crystal on the Crystal Grotto, Nature on the trees, Earth on the Copper Quarry and Iron Deeps). Modifier source `element`.
- [To build] **Loadout presets.** Each dungeon remembers its own fighting loadout and switches to it when picked; production jobs get named presets.
- [Default] Three presets per production job; a preset that goes over the cost cap is flagged, not deleted.
- [To build] **Bonds.** Specific pairs of cards in the same loadout unlock a small named bonus. An undiscovered bond shows as a silhouette in a Codex until first triggered; a pixel chain links the two cards on the table.
- [Default] Oath of Dawn (Ember Squire + Dawnblade Regent: +2 burst fill per hit), Old Growth (Apprentice Feller + Elder Treant: harvest bursts +5 s), Deep Vein (Cave Digger + Geode Golem: +15% mining).
- [To build] **Dungeon floors.** Normal floors with small area enemies and a boss every 10th floor. Push moves you down a floor when you win; farm stays. A knockout drops you one floor and switches to farm, so walls work on their own. Deeper floors pay more. Ascension resets the current floor, keeps the best one and lets a run start at half of it. Boss mastery counts floor-boss kills. The Glimmer Trial has no floors.
- [Default] 30 floors per dungeon; floor 10's boss clears the dungeon; area enemies such as moss slimes, ember bats and frost imps.
- [To build] **Expeditions.** Cards not in a loadout go on timed trips to places opened by clearing dungeons and bring back that area's materials, some gems and card XP, double for a matching element. They are plain timers outside the offline cap. A card on a trip cannot be equipped.
- [Default] Trips of 1, 4 or 8 h to Mossy Outskirts, Ember Catacombs and Frostspire Pass; one slot at the start, one more from the account tree and one from the Starlight shop; recalling early returns nothing.
- [To build] **Ascension challenges.** After the first Ascension, a challenge is an Ascension run with a rule, completed by clearing a target under that rule, up to three times with harder targets, each completion giving a permanent reward. They appear as side portals around the Ascension gate and each completion is a sticker.
- [Default] Lone Wolf (no supports), Common Folk (Commons only), Bare Hands (no damage lines), Drought (production ×0.5), Glass Cannon (health ×0.25) and Single Plot (one plot and one slot); completing all six once unlocks Auto-Ascend.
- [Proposed] Bare Hands and Single Plot no longer fit the 2026-11-08 changes (no damage lines, no plots) and need replacing.
- [To build] **Autobuyers** in the Starlight shop, each with an on / off switch and a reserve per resource ("never spend below X%") so tier-up materials stay safe. Card management (stars, tiers, pulls) is never automated.
- [Default] Sold in this order: plots, mine levels, damage lines, auto-plant.
- [Proposed] With plots and damage lines gone, the autobuyers become tree levels and mine levels.
- [Default] New achievements: Bond Found, First Expedition, Rock Bottom (reach the last floor) and Challenger (first challenge completion).

## 16. Open questions

Everything tagged `[Proposed]` or `[Default]` waits here for the user. Answer a line and its rule is rewritten with the answer and tagged `[To build]` or `[Built]`.

Waiting since 2026-11-08 (`[Proposed]`):

- Weapons: the moves and damage types each card learns by level, and how they sit on the enhancement chart (§5).
- Cards on screen: the compact collection card and real text, picked at the review gate; an optional re-bake at double detail (§11, §12).
- Beta systems: replacing Bare Hands and Single Plot; the new autobuyer list (§15).

Changed without asking (to confirm or undo):

- The Frostspire Vault needs 90 kills to clear instead of the 50 the user confirmed (§6).

Defaults by Claude, never confirmed (`[Default]`):

- §2 dev tools and the Report an issue contents.
- §4 what counts as harvested and when mastery tiers apply.
- §5 the enhancement numbers (unlock at Silver ★1, five options, budgets).
- §4 the shelf drawer's first-visit state, what "ready" counts and the stage remembering its job (Production screen, built).
- §4 the balance after plots (base rates ×3) and the plot refund; a kind producing from level 0; the damage-line shelf upgrades going (built).
- §5 (filled in 2026-11-08 to build the weapon decisions) everything is built: XP from fighting time, level caps by tier, base damage by rarity (Common 200), the damage-line refund, the star bar (with a Void row, 1 fill per copy and the retuned copies per star), star impact, tier-up costs (the Money prices and the Prismatic → Unique costs), the Unique tier (power ×5, enhancement budget 10), the interim weapon looks and production cards on the same model.
- §6 (filled in 2026-11-08) the boss attack pattern and the "You fall in" readout, including how they are built: attacks on the play-time clock, no hits during a knockout, the readout's figure averaged over the cycle (built; how they look is the user's pick and is a `[Built]` rule in "Hits land in chunks").
- §6 expected-value damage and crits; medal bonus rounding and the trial medal.
- §7 the pull order, guarantee and upgrade flash details.
- §8 the Wardrobe details (level costs, buffs, equipping, UI-skin levels, set and gate numbers).
- §9 the Starlight formula and the extra Ascension resets.
- §10 account XP and level curve, reward track details, account tree nodes and respec cost, goal rules, the four extra achievements and their rewards, shard prices.
- §11 Buy Max, the Settings layout and options, the Shop page holding Ascension.
- §12 brief motion (hit squash, breathing, sticker tilt) may scale or turn art for a moment while Clean pixels holds at rest.
- §14 the sim player's choices, and the numbers retuned in 2026-11-08 (Phase 4a): tree and mine base rates ×3; Root Warden 760,000 HP and 0.6 damage, Cinder Lich 800,000 HP, Glacier Colossus 11,000,000 HP; Bronze → Silver needs 3 Moss Cores; Frost Cores and Sigils of the Prismatic and Unique steps; the star table; the Glimmer Trial's 2,000,000 HP; account XP per gem halved; the Starlight divisor 6e5; and the "mostly exhausted" definition (a Unique weapon).
- §15 every detail of the beta systems (numbers, names, lists), and whether all of them are still wanted after the 2026-11-08 changes. Dungeon floors in particular would change how a dungeon is cleared (§6).

## 17. Changelog

- 2026-11-08 — Our damage to bosses and the Glimmer Trial's target lands in hits every burst interval instead of draining the bar smoothly, and a tier-up now needs all six stars and resets them to ★1 (a Bronze ★6 becomes a Silver ★1); the old default that stars carry across tiers is dropped (user, §5, §6).
- 2026-11-08 — Built the boss-hit visuals the user picked at the review gate (option C, "Screen edge pulse"): edge pulse before each slam, the pale chunk that falls off the health bar, red numbers from the game's reported attacks, and the "You fall in" pill (§6).
- 2026-11-08 — Built the Production screen as the side stage the user picked at the review gate (rows on the left, a sticky stage with the main card, the shelf in a bottom drawer) and the loadout fan from the user's sketch, with its Dungeons use still to build (§4, §11).
- 2026-11-08 — Confirmed the Commons-at-Gold details (Rare and up reach all five tiers, Common level cap 60, copies past Gold ★6 become shards); the element effect stays at Gold and Prismatic and is strongest at Unique (user).
- 2026-11-08 — Common cards stop at Gold and are the starting blocks; Prismatic and Unique, with their glow, animations and final form, are for rarer cards (user).
- 2026-11-08 — Tier looks: Bronze, Silver and Gold add parts and colour, Prismatic adds glow and small animations, Unique is the weapon's final form with its own animations, effects and colours (user).
- 2026-11-08 — The document was rewritten as one current version with a status tag on every rule, and the rules for keeping it clean were added (user). The amendment sections (11.x) and the defaults section (12) were merged into the rules they changed; tuning stories were dropped (they live in the data and in git history at `ac33acd`).
- 2026-11-08 — Production: one of each tree kind and mine type, levelled up; no plots, slots or copies (user).
- 2026-11-08 — Fighting strength comes from cards; the three damage lines are removed; a weapon has a level, a tier and stars; the unique weapon is the final tier instead of appearing at Gold ★6; forged-edge strips go with the damage lines (user).
- 2026-11-08 — Boss hits take health in chunks instead of draining smoothly (user).
- 2026-11-08 — Elements, presets, bonds, floors, expeditions, challenges, autobuyers, palette cycling and pixel workers (chosen 2026-11-07) were written in for the first time (§12, §15).
- 2026-11-08 — Claude filled in defaults so the 2026-11-08 decisions can be built (§4, §5, §6), waiting for the user's confirmation: XP from fighting time, level caps by tier, the star bar and its impact, stars across tiers, tier-up costs, base damage, the Unique tier, interim weapon looks, the boss attack pattern and the "You fall in" readout.
- 2026-11-08 — Built tier-ups at max level paid with Money, the star bar, star impact, the Unique tier and the interim weapon looks (§5), with Claude's defaults for the numbers; save format 18.
- 2026-11-08 — Clean pixels is built (the user decided it earlier): art is shown at whole device-pixel scales, cards are whole multiples of the 132 × 186 grid, and the few places still below 1x are listed in §12 Small art.
- 2026-11-08 — Retuned the pacing after the 2026-11-08 changes with the sim (Phase 4a, Claude's defaults, waiting for the user's confirmation): tree and mine base rates, boss and trial HP, tier-up Cores, the star table and the Starlight divisor (§4, §5, §6, §9, §14).
- 2026-11-07 and earlier — see git history.
