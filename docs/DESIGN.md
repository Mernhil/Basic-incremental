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
- [Differs] **Item types** (user, 2026-11-09). Fighting cards carry a weapon (sword, greatsword, spear, lance, dagger, hammer, bow, staff, scythe), mining cards a pickaxe and logging cards a logging axe: 11 types. Every item is remade from scratch; the old kinds (twin blades, hatchet, maul, chisel, geode hammer, gauntlet) leave the game. Built: the types, their names and the data (`items.json`). The new pictures are not drawn yet: each type shows an interim look (Weapon looks, for now below).
- [Built] **Loadouts.** Each job has 1 main card and 3 support cards. Any card of the job fits any slot, once per loadout. Every card has a main ability (used when it leads) and a support effect (used as a support).
- [Built] **Rarity.** Common, Uncommon, Rare, Epic, Legendary and Mythic/Void. Mythic and Void are one top rarity with two sides, equal in power and differing only in look: Mythic the heroic side, Void the villain side (user, 2026-11-09). Rarity sets the colour of the card body: steel grey, green, blue, purple, amber, then neon pink for Mythic and black chrome for Void. The job is a label, not a colour.
- [Default · in game] **Uncommon and Mythic/Void numbers.** The Uncommon body is green, and every rarity-keyed number for Uncommon sits between Common and Rare. Mythic and Void share one value in every rarity-keyed number (cost, base stats, health, shards, star bar, cosmetic level), tuned with the sim; Mythic keeps the neon pink body, Void the black chrome.
- [Built] **Cost.** Each card costs by rarity (`cardRules.json`, Common 2 to Mythic/Void 14) and each job's loadout has a cost cap that grows with account level (§10). A loadout over the cap cannot be saved.
- [Default · in game] **Uncommon and Mythic/Void costs.** Common 2, Uncommon 3, Rare 4, Epic 6, Legendary 9 and Mythic/Void 14 (`cardRules.json`).
- [Built] **Start.** A new game owns Ember Squire, Apprentice Feller and Cave Digger at Wood ★1, Lv 1, each leading its job.
- [Built] **Collection.** Each card is owned once; further copies are stored on it as duplicates. Duplicates past the last star become shards for the shard shop (§10), more for higher rarities.
- [Built] **Abilities.** Fighting mains shape how damage is dealt (steady ticks, fast hits that fill the gauge quickly, slow heavy hits with a stronger signature attack). Production mains shape output and the harvest pattern. Supports add a percentage or a gauge, drop or material bonus. Every card effect goes through the modifier pipeline (source `card`).
- [Proposed] **Full-art layout.** The card's signature item fills the whole card. Top plate: name and stars side by side, nothing else. Bottom plate: ability name and hit speed on one line, level and the rarity word on the next, then the progress bar. No separate chips elsewhere on the art. The tier frame (§12 frame ladder) and the cosmetic border/finish slots (§8) apply over this layout unchanged. Reference: Design canvas "Full-art weapon card concepts" at https://claude.ai/artifact/52eC1yo35gn16NrDp5btik, artboard G is the one to build; boards A-F are the trail, not alternatives (user, 2026-11-08).
- [Built] **Beta cards** (`cards.json`). The Weapon column is the item type each card carries (Item types above);:

  | Job      | Card              | Rarity    | Element | Weapon      | Main ability                                       | Support effect                     |
  | -------- | ----------------- | --------- | ------- | ----------- | -------------------------------------------------- | ---------------------------------- |
  | Fighting | Ember Squire      | Common    | Fire    | Sword       | Steady hits every 1 s                              | +5% damage                         |
  | Fighting | Storm Duelist     | Epic      | Storm   | Dagger      | Fast hits every 0.5 s, gauge fills twice as fast   | +12% damage                        |
  | Fighting | Dawnblade Regent  | Legendary | Fire    | Greatsword  | Heavy hits every 2 s, signature attack ×15         | +15% damage, +10% rare drop chance |
  | Logging  | Apprentice Feller | Common    | Nature  | Logging axe | Steady output                                      | +5% logging                        |
  | Logging  | Grove Keeper      | Rare      | Nature  | Logging axe | +10% logging                                       | +1 harvest-burst fill per tick     |
  | Logging  | Elder Treant      | Epic      | Nature  | Logging axe | Harvest bursts give 15 s of output instead of 10 s | +12% logging                       |
  | Logging  | Moonwood Dryad    | Mythic    | Light   | Logging axe | +30% logging, harvest gauge fills faster           | +20% logging                       |
  | Mining   | Cave Digger       | Common    | Earth   | Pickaxe     | Steady output                                      | +5% mining                         |
  | Mining   | Gem Cutter        | Rare      | Crystal | Pickaxe     | +10% mining                                        | +1 harvest-burst fill per tick     |
  | Mining   | Geode Golem       | Legendary | Crystal | Pickaxe     | Harvest bursts give 15 s of output, +15% mining    | +15% mining                        |
  | Mining   | Core Titan        | Void      | Void    | Pickaxe     | +40% mining, harvest gauge fills faster            | +25% mining, +5% Core drop chance  |

- [Default · in game] **Base roster: one card per rarity per job** (2026-11-09, so every tier cap has a base card to tier up to). Nine cards were added to the beta cards: fighting Hollow Spearman (Uncommon, Earth, spear; steady hits every 0.8 s; +8% damage), Seraph Lancer (Mythic, Light, lance; heavy hits every 1.5 s, signature attack ×20; +20% damage, +12% rare drop chance) and Grave Hammerer (Void, Void, hammer; slow hits every 3 s, signature attack ×30; same support); logging Moss Forager (Uncommon, Nature; +5% logging; +7% logging), Heartwood Warden (Legendary, Nature; bursts give 15 s of output, +15% logging; +15% logging) and Rotwood Sovereign (Void, Void; as Moonwood Dryad); mining Pebble Prospector (Uncommon, Earth; +5% mining; +7% mining), Prism Delver (Epic, Crystal; bursts give 15 s of output; +12% mining) and Lodestone Seer (Mythic, Light; as Core Titan). Logging and mining now hold a card of every rarity; fighting has all of them but the Rare, which is the weapon skin test card (`cards.json`, entries added to the Card Portal pool; names, elements and numbers are Claude's).
- [Default · in game] **Cards that did not fit the new types.** Storm Duelist carries a dagger, the Reaper Test Card (the weapon skin test card, §8) carries a scythe, and Core Titan, an Exotic card before Exotic left the game, becomes Void.

### Weapon progression

_Decided with the user on 2026-11-08. It is a gacha game: strength comes from the cards you own and how far you have taken them._

- [Built] **Strength comes from cards.** The card's rarity sets its base stats (damage and health), support cards are the passives, and the main card's weapon is the only fighting upgrade.
- [Built] **No damage lines.** Copper Edge, Iron Edge and Crystal Edge, their milestones, goals, tier-up moments, bulk buys and previews are gone (user, 2026-11-08). Fighting damage is the main card's base damage (below), then the modifier pipeline (supports, tree, mastery, crits, bursts).
- [Built] **Base stats by rarity.** Each card has a base damage and a base health set by its rarity, with the same ratios (`cardRules.json`: health Common 100 to Mythic/Void 700; damage in the Base damage rule below). Fighting damage is the main card's base damage × its power (level, tier and stars); with no card leading, a bare-hands damage applies (`combat.json`).
- [Differs] **Level.** XP from fighting raises the weapon's level, up to its tier's cap. Levelling adds new moves or damage types. No resource buys a level. Today fighting XP and the caps are built as below, and a level adds only the small bump; it adds no moves yet.
- [Differs] **Tier.** At max level and ★6, Money plus materials upgrade the weapon to the next tier. The ladder is T1 Wood → T2 Bronze → T3 Silver → T4 Gold → T5 Prismatic → T6 Mythic or Void (by the card's side), then the Heirloom (user, 2026-11-09). The stars then restart at ★1 with an empty star bar (a Wood ★6 becomes a Bronze ★1), so every tier is starred up again; the level stays and only its cap rises. Each tier gives the weapon a new look, a new frame, a higher level cap and a power step. Built: the six tiers and the Heirloom with the tier-ups paid with Money, Cores, gems and Frost Sigils (Tier-up costs below), the star reset, the frame, the cap, the power step, and the checklist and goal tracker; the new look of each tier is not drawn yet (Weapon looks, for now).
- [To build] **Tier looks** (user, 2026-11-09), written in full in `docs/ASSET_RULES.md` §2. T1 to T5 share one base model per item type in each material (wood, bronze, silver, gold, a crystal-like Prismatic). Upgrades 1 to 3 (T2 to T4) each upgrade one part of the item, drawn per tier in that tier's material, not a recolour of the previous tier's part; which part is in the parts table of `ASSET_RULES.md` §2 (sword: grip, then crossguard, then pommel; and so on for every type). Upgrades 4 and 5 (T5 and T6) are not tied to one part: they may reshape the whole item without replacing it and add effects and animation. T5 is deliberately less cool and less powerful than T6, so the top tier is the goal. T6 has a Mythic (heroic) and a Void (villainous) version, and the Heirloom is a separate fixed design above it.
- [Built] **Item names** (user, 2026-11-09). T1 to T4 are "<material> <type>": Wooden Sword, Bronze Sword, Silver Sword, Golden Sword (Wooden Axe for the logging axe, "Axe" in every item name). T5 is "Prismatic <name> <type>" (Prismatic Dancer Sword) and T6 "Mythic/Void <name> <type>" (Mythic Light Sword, Void Shadow Sword). Heirlooms have their own names (Solaris and Nightfall for the sword). The names of all 11 types are in `ASSET_RULES.md` §2 and, once built, in `items.json`.
- [Built] **Rarity caps the tier** (user, 2026-11-09). Common reaches T1, Uncommon T2, Rare T3, Epic T4, Legendary T5, and Mythic/Void T6 and the Heirloom. Copies past ★6 of a card's top tier become shards like any duplicate past the last star.
- [Built] **Stars.** Duplicates fill the card's star bar and a full bar buys a star. Stars are the weapon's prestige: they raise its base damage and health (Star impact below). A star costs only copies of the card; stars no longer raise the level cap. A tier-up needs all six stars and resets them (Stars restart on tier-up below).
- [Default · in game] **Stars balanced.** One duplicate per star was too easy and each star did too little (user). The copies per star are now tuned with the sim so the median run reaches a Gold ★6 near the 7 h target (Star bar below); the impact of each star is the Star impact step below, unchanged.
- [Differs] **Heirloom** (user, 2026-11-09). "Unique" is renamed Heirloom everywhere. The Heirloom is the pinnacle of the weapon: a separate fixed design with the strongest effects, reached by a tier-up after T6. Every item type (11) has a Mythic and a Void Heirloom, shown by the card's side. The Heirloom tier is built and open for every type so playtests and balance can reach it (user, 2026-11-09); until each Heirloom is drawn it shows the placeholder look of the top rarity, and the data can close a type again (`heirloomOpen`). Flameblade and the Soul Reaper live on as legacy skins (§8).
- [Default · in game] **XP from fighting time.** A fighting card in the loadout gains XP for every second it fights (not while knocked out) plus a bonus per kill, so a card stuck at a wall still levels. The per-second rate grows with the dungeon tier like the kill bonus; the special dungeon pays the tier 1 rate. It is derived from fight time, so online and offline give the same result. Production cards keep their XP per gem harvested. Rates live in `cardRules.json`.
- [Default · in game] **Level caps by tier only:** 20 / 40 / 60 / 80 / 100 / 120 / 140 for Wood, Bronze, Silver, Gold, Prismatic, Mythic/Void and Heirloom (`cardRules.json`). Stars no longer raise the cap. A saved card above its cap keeps its level up to the cap.
- [Built] **Small bump every level.** Each level adds a little to the card's power, support strength and gauge speed (`cardRules.json`).
- [Proposed] **Moves.** Milestone levels unlock new nodes on the card's enhancement chart, picked with points, and each star gives enhancement points. Which moves and damage types each card learns needs a content pass with the user.
- [Default · in game] **Star bar.** Each duplicate fills the card's star bar by an amount set by its rarity (1 copy for now), and each star needs more than the one before, so Commons need many copies and top rarities few. The fill is saved on the card and a star-up costs only the fill; what is left over carries to the next star. A star that needs 0 copies can be taken at once. Every tier-up needs a full ★6 climb, so the counts are kept short; sized from the Card Portal rates and tuned with the sim (`cardRules.json` `starBar`):

  | Rarity      | Copies for ★2 → ★6 | Total | Rough pulls to ★6     |
  | ----------- | ------------------ | ----- | --------------------- |
  | Common      | 1, 1, 1, 2, 2      | 7     | ~30                   |
  | Uncommon    | 1, 1, 1, 1, 2      | 6     | ~45                   |
  | Rare        | 1, 1, 1, 1, 1      | 5     | ~65                   |
  | Epic        | 1, 0, 1, 1, 1      | 4     | ~130                  |
  | Legendary   | 1, 0, 1, 1, 1      | 4     | ~350 (less with pity) |
  | Mythic/Void | 1, 0, 1, 0, 1      | 3     | not estimated         |

- [Default · in game] **Star impact.** Base damage and health are multiplied by ×1.25, ×1.6, ×2, ×2.6 and ×3.5 at ★2 to ★6, so a maxed Common (base 200) equals a fresh Legendary (base 700). The bonuses of supports and the main growth keep their smaller star step (`cardRules.json` `power`).
- [Built] **Stars restart on tier-up** (user, 2026-11-08). A tier-up needs the card at ★6 and resets it to ★1 with an empty star bar, the star colour following the new tier; each tier is starred up again from copies alone, and Cores, gems and Money go to tier-ups. Copies of a card waiting at ★6 for its tier-up still become shards. No save change was needed: saved cards keep their stars and fill, and a card above Bronze that is under ★6 cannot tier up again until it reaches ★6 (save format 18 had already moved old duplicates to an empty bar).
- [Default · in game] **Star fill in the shard shop.** The shard shop sells copies of a chosen card, and a bought copy fills its star bar like any duplicate. A copy past ★6 (or when the bar already holds every star left) becomes shards.
- [Default · in game] **Weapon looks, for now.** The Wood tier (T1) shows the approved T1 picture of every type (ASSET_RULES §5). Until a type has its new art for a higher tier approved, it shows the nearest old ladder art, moving one step up that ladder per tier and capped at its top (sword, greatsword and staff their own ladders; hammer the maul; bow the bow; pickaxe the pickaxe; logging axe the hatchet; dagger the twin blades), or a plain labelled placeholder (spear, lance, scythe). Interim frames: Wood shows the Bronze frame, Mythic, Void and the Heirloom the Prismatic frame. The old art is deleted type by type as the new art lands.
- [Default · in game] **Production cards** follow the same level, tier and stars model, with XP from harvesting.
- [Default · in game] **Old saves.** Damage-line levels are removed and the Money they cost is paid back (save format 17): every level of each line at its old price (10 × 1.11ⁿ, 200 × 1.12ⁿ, 3,000 × 1.13ⁿ, each rounded up, before any modifier), plus the price of each owned Temper or Hardening.
- [Default · in game] **Tier-up costs.** Each tier-up costs Money plus a Core and the tree and mine gems, the gems scaled by the card's job; T4 → T5, T5 → T6 and the Heirloom step also cost Frost Sigils (`cardRules.json` `tierUp`). Wood → Bronze is new and cheap; Bronze → Silver, Silver → Gold, Gold → Prismatic and Prismatic → Mythic/Void keep the amounts of the old Bronze → Silver, Silver → Gold, Gold → Prismatic and Prismatic → Unique steps, so each tier name keeps its price (Money 150k, 3M, 30M and 150M, about ten kills of the purse of that stage), and the Heirloom step costs the most. Tuned with the sim; the Frost Cores and Sigils of the last steps are the slow part, because only the Frostspire Vault drops them and an Ascension resets them.
- [Default · in game] **Base damage.** Base damage follows the same rarity ratios as health: Common 1×, Uncommon 1.25×, Rare 1.5×, Epic 2.25×, Legendary 3.5×, Mythic/Void 7× (`cardRules.json`, Common 200). Common 200 stays; the Root Warden has 760,000 HP and hits for 0.6, so a fresh game clears it in about half an hour. Fighting damage grows with the card's level bump, tier and stars as today. The growth per level and the tier and star steps were checked against the sim and kept, so the pacing targets hold without damage lines (§14).
- [Default · in game] **Weapon panel.** The main fighting card's level, XP, stars and next tier-up are drawn on the weapon itself, in the dungeon drawer (where the damage lines were) and on the Cards detail (Review gate pick "On the weapon", 2026-11-08). The level is a hex badge in the tier's colour; XP is a ring (a bar on the card) that turns rainbow at the level cap; the stars are pips on the ring's open end with the next star partly filled by the star bar; the tier is a plate under the weapon. Beside it: the star bar line ("4 / 7 copies to ★4", "×1.6 → ×2") with an Add star button when the bar is full, and a tag with the next tier-up: "Reach Lv 40 to tier up. It costs:" with the price chips (Money, Core, gems, Frost Sigils), then "Tier up to Silver", which lights up when the weapon is at its cap and every price is met. The step to the Heirloom reads "Reveal <Heirloom name>". A weapon with no next tier says why ("Mythic is the top tier for Dawnblade Regent until its Heirloom is drawn."). Every number comes from the game (`cardInfo`), none is hardcoded.
- [Default · in game] **The Heirloom tier** is open for every item type for playtesting, with its own approved picture per type and side (ASSET_RULES §5; the data lists which types are open and can close one), and a Common stops at T1 (Rarity caps the tier above). A weapon at the Heirloom tier keeps the Prismatic frame until its own frame is drawn and shows its Heirloom item, with the Heirloom reveal (§12). Its level cap is 140, its power step ×7 and its enhancement budget the Prismatic one.

### Rank visuals

- [Built] **Stars.** Star colours follow the tier and Prismatic stars are animated. At ★6 the stars get a polished light sweep moving back and forth, coloured to the tier, and a one-time flash. Stars are never covered by anything.
- [Differs] **The tier is the frame.** Each tier-up rebuilds the frame in a new material (§12 frame ladder): Wood, Bronze, Silver, Gold, Prismatic, Mythic and Void, plus an own Heirloom frame in a Mythic and a Void version (user, 2026-11-09). Prismatic must look clearly different from ★1: rainbow metal, the radiant crest and the strongest element effect. Today the game draws the Bronze, Silver, Gold and Prismatic frames; Wood shows the Bronze frame and Mythic, Void and the Heirloom the Prismatic frame until theirs are drawn.
- [Built] **Ranks never clash with cosmetics.** The frame's tier ornaments own the top, the sides and the area outside the edge; cosmetics change the frame's family and the card's finish (§8).

### Enhancements

- [Built] **Card enhancements** (Brave Frontier Omni SP style). Each card has its own options and a point budget smaller than their total cost, so the same card can be built in different ways. Options apply while the card is in a loadout (source `enhancement`). Respec is supported.
- [Default · in game] They unlock at Silver ★1. Each card has five options from its job's template, scaled by rarity and costing 20 points in total; budgets are Wood 0, Bronze 0, Silver 4, Gold 7, Prismatic 10, Mythic/Void 10 and Heirloom 10 (`enhancements.json`). Respec is free.

## 6. Combat and dungeons

- [Built] **Bosses** are HP walls auto-fought in parallel with everything else, with no combat input. They respawn so they can be farmed. HP shows as stacked bars with a ×N count of bars left; the current bar drains over the colour of the next.
- [Built] **Scaling.** Boss HP and attack grow slowly with the Ascension count; harder dungeons unlock with progress.
- [Built] **Dungeons.** Mossy Cellar (Root Warden, drops Moss Core), Ember Crypt (Cinder Lich, Cinder Core) and Frostspire Vault (Glacier Colossus, Frost Core and Frost Sigils). Every kill drops Money and both crystals (`dungeons.json`).
- [To build] **Dungeon floors** (user, 2026-11-09). A dungeon is a stack of floors. A normal floor is a wave of 3 to 5 small enemies auto-fought like a boss; every 10th floor holds a mini-boss and the last floor holds the dungeon's boss (today's boss: Root Warden, Cinder Lich, Glacier Colossus). The floor count is data in `dungeons.json`: 10 for the Mossy Cellar, 20 for the Ember Crypt and 30 for the Frostspire Vault. Push moves you down a floor when you win; farm stays. A knockout drops you one floor and switches to farm, so walls work on their own. Deeper floors pay more. Ascension resets the current floor, keeps the best one and lets a run start at half of it. The Glimmer Trial has no floors.
- [To build] **Clearing** (user, 2026-11-09; replaces the 1 / 10 / 50 boss kills). A dungeon is cleared the first time its last-floor boss dies. Clearing a dungeon unlocks the next one and its mine. The old kill counts and the Frostspire Vault's 90-kill difference are gone.
- [To build] **Normal enemies** (user, 2026-11-09): 3 types per dungeon, 9 in total, mixed in each wave, each with its own sprite, HP and small purse. Enemy HP and attack scale with the floor and, like bosses, slowly with Ascension. Normal enemies drop Money, crystals and Cores at lower rates than a boss; the boss floors keep today's boss drops (`dungeons.json`).
- [Default] The three types per dungeon are a moss slime, a root sprite and a bramble beast; an ember bat, a cinder imp and a magma crawler; a frost imp, an ice wisp and a snow wolf. Mini-bosses are stronger copies of one of the dungeon's enemies. Waves hit and fall in the same chunks as the boss fights, and our damage spreads across the wave in order.
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
- [Built] **Boss mastery.** Kills per boss (floors will count mini-boss and last-floor boss kills: [To build]) give medals at 10 / 100 / 1,000 / 10,000 kills, kept through Ascension: +5% damage against that boss and +10% to that dungeon's crystal and Core drops per tier. The Glimmer Trial's medal comes from its best score.
- [Default · in game] Medal drop bonuses round fractions by chance so the average is exact; the trial medal gives +5% damage in the trial and +10% to its rewards per tier.

## 7. Summon portals

- [Built] **Portals.** Several portals (cards, cosmetics, more later), each with its own pool and a cost in one crystal. In-game currency only, never real money.
- [Built] **Pulls.** A single pull (1× cost) and a 10-pull (10× cost); every 10-pull guarantees at least one Rare or better.
- [Built] **Hard pity.** Legendary or better at 90 pulls without one. Counters are per portal, saved and kept through Ascension.
- [Built] **Rates** show in a hover tooltip on the portal.
- [Built] **Card Portal** costs Summon Crystals (`portals.json`). Bosses no longer drop cards.
- [Built] **Wardrobe Gate** costs Glamour Crystals, with the same pulls and pity. Its pool holds the cosmetic sets and loose items, and its duplicates feed cosmetic upgrade levels. Any item with no other source goes in the Wardrobe Gate at its rarity.
- [To build] **Legacy Gate** (user, 2026-11-08). A third portal whose pool holds only the legacy weapon skins (§8), so their large number does not dilute the Wardrobe Gate. It costs Glamour Crystals, with the same pulls and pity. Its screen is built with the 0.5.0 UI rework (user, 2026-11-08).
- [Default] **Legacy Gate details.** A pull costs the same as a Wardrobe Gate pull; each skin's rarity is the rarity of its source art, one of the new rarities (no Exotic; art with none is Rare); a skin you already own pays back part of a pull in Glamour Crystals, since skins have no levels (`portals.json`: 20% of a single pull; a skin's pull weight falls with its rarity: Common 7, Uncommon 6, Rare 5, Epic 4, Legendary 3, Mythic/Void 2, as the staff set already does). The gate's logic and the owned skins are in the game, kept through Ascension, but the gate stays closed until its screen exists.
- [Differs] **Screen: Deck and Table (the user's pick, Nocturne panel variant).** One dark panel with a gold hairline holds the portals as card decks, Card Portal left, Wardrobe Gate in the middle and Legacy Gate right (the third deck's place is Claude's default). Today it holds only the Card Portal and the Wardrobe Gate. A deck's visible edge is 1 to 9 layers thick and follows its pity progress; each deck shows its pity count, its pity caption and Draw ×1 / Deal ×10 buttons. The odds per pull are always visible in the middle and follow the deck you hover or focus. "Your last hand" at the bottom shows the cards or items of the latest pull in a lightly fanned row, with "New!" on new ones (kept in memory only, so it is empty after a restart). The reveal still opens in a modal. CSS only, no dedicated art.
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
- [Default · in game] **Maximum level by rarity:** Common 2, Uncommon 3, Rare 3, Epic 4, Legendary 5, Mythic/Void 6 (`cosmeticRules.json`).
- [Built] **Ambient animations are small and cheap:** CSS only, animating `transform` and `opacity`, at most about 6 particles per card, paused off screen, a still frame under reduced motion.
- [Built] **Breaking the edge.** High-level border flourishes may reach outside the card edge by at most about 8% of the card width, only in the corner zones (the outer fifth of each side). The sides and top belong to the tier ornaments, the star footer is a keep-clear band, and where they meet at a corner the tier spikes sit on top. Grids reserve a bleed margin.
- [Built] **Weapon skins (test).** A weapon skin is a different look for one weapon, saved per weapon and chosen in the Wardrobe's "Weapon skins" tab: pick the weapon, preview a skin on the card, apply it. Skins are art only; the weapon's stats and colours do not change. The unskinned weapon keeps its own art and motion. The Soul Reaper and 12 of its skins become scythe legacy skins earned from the Legacy Gate (user, 2026-11-09: "if they were picked they stay as legacy skins"); Bonehandle Reaper leaves. The 13 scythe skins are legacy skins in `weaponSkins.json`.
- [Differs] **Legacy skins** (user, 2026-11-08, rewritten 2026-11-09). The set is the user's Keep picks from the weapon art catalogue, worn by the whole new item type: choosing a bow skin changes every bow card. Legacy skins are earned from the Legacy Gate (§7), and the "Weapon skins" tab lists them in a "Legacy" group under each item type, each with a short name. Everything else leaves the game (git history keeps it). The set: bow 10 (Rare bow, Mythic bow, red Epic and red Mythic animated bows, Crimson Draw, Evergreen Wrath, Twilight Reed, Bloodmoon Bow, Nebula Thorn, Plain Truth), scythe 13 (the Soul Reaper, animated, and its 12 skins), hammer 2 (the Exotic and the Void maul), sword 1 (Flameblade, with its live motion) and staff 1 (Night Herald). Katana and book art stay out until the game has cards of those types. The skins land as `skin-<type>-NN` art (`weaponSkins.json`); the set, the Legacy Gate pool and wearing are built; the Legacy Gate screen (and the "Legacy" group of the tab) wait for the 0.5.0 UI rework.
- [Default · in game] **Legacy skin details.** A legacy skin shows at every rarity and tier below Heirloom, the Heirloom keeps its own art and skins; it plays its palette-cycling strip when it has one (§12); the type's own art is always available as "Original"; the names are written by Claude. Each kept skin keeps its rarity, with Exotic becoming Mythic; Flameblade is Mythic, and the Soul Reaper and its skins are Void.
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
- [Built] **Shard shop.** A stall on the Shop page (§11) that spends card shards on card copies, crystal, Core and material bundles, and the Ember Crown.
- [Default · in game] Shard prices: card copies 5 / 10 / 20 / 40 / 75 / 120 by rarity, Common to Exotic; Ember Crown 150, once.

## 11. Interface and screens

- [Built] **Interface and screens** (shell, every screen, the loadout fan, numbers, buying, Settings, Shop) are written in `docs/UI_RULES.md`, the only UI document. Other sections say "§11" for those rules.

## 12. Art style

- [Built] **All art rules live in `docs/ASSET_RULES.md`** (section 5 holds the pixel rules, frame ladder, element effects, approved assets and the rest of this section, each with its status tag; sections 1 to 4 the weapon tiers, Heirlooms and skins; sections 6 and 7 the cosmetic art system). This section keeps only this pointer so that references to "§12" still resolve.

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
- [Default · in game] The sim player's choices: what it buys first, which card it focuses, what it reserves, which dungeon it fights and when it ascends (`scripts/sim/`). The first Ascension is taken as soon as it pays the minimum, later ones when the gain at least matches all the Starlight earned and the run's Starlight per hour has passed its peak; the player finishes the fighting lead's upgrades first, saves a tier-up's Money only when it is the last thing missing, and holds an Ascension while a tier-up is three quarters funded. "Mostly exhausted" counts every other milestone, every card owned and a weapon at T6 (Mythic or Void).
- [Default] **Tier names keep their milestones** (2026-11-09). First Silver card is T3, First Gold card T4 and First Prismatic card T5, with the same targets above. The sim result is reported in the PR; a target that cannot hold under the new rarity caps is a question for the user, not an edit.
- [Default · in game] **On target.** The sim median of every milestone sits within about 25% of its target (`npm run sim -- --hours 40 --seeds 5`), retuned after the 2026-11-08 changes. The spread between seeds is wide, mostly pull luck: an early Legendary lead can bring the Ember Crypt forward by an hour or two and the first Prismatic card ranges over about ten hours. Fighting damage is flat between the first Gold card and the first Prismatic one (the Frost Cores for that step are the wait).

## 15. Systems chosen for the beta, not built

_The user chose these on 2026-11-07 in claude.ai. The handoff to the repo never happened, so they were in no document and nothing was built. The systems are the user's choice; the details were filled in by Claude and are defaults._

- [To build] **Elements in combat.** Each boss has a weakness and a resistance. The main card's element against the boss gives a bonus or a malus, each matching support adds a smaller bonus, and production cards get a lighter bonus on matching sources. Elements are a bonus, never a wall: the pacing must hold with the wrong elements.
- [Default] Root Warden weak to Fire and resists Nature; Cinder Lich weak to Light and resists Fire; Glacier Colossus weak to Storm and resists Crystal; the Glimmer Trial is neutral. Weakness +50%, resistance −25%, +10% per matching support; production +15% (Crystal on the Crystal Grotto, Nature on the trees, Earth on the Copper Quarry and Iron Deeps). Modifier source `element`.
- [To build] **Loadout presets.** Each dungeon remembers its own fighting loadout and switches to it when picked; production jobs get named presets.
- [Default] Three presets per production job; a preset that goes over the cost cap is flagged, not deleted.
- [To build] **Bonds.** Specific pairs of cards in the same loadout unlock a small named bonus. An undiscovered bond shows as a silhouette in a Codex until first triggered; a pixel chain links the two cards on the table.
- [Default] Oath of Dawn (Ember Squire + Dawnblade Regent: +2 burst fill per hit), Old Growth (Apprentice Feller + Elder Treant: harvest bursts +5 s), Deep Vein (Cave Digger + Geode Golem: +15% mining).
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

- Full-art card layout, artboard G of the "Full-art weapon card concepts" canvas (§5).
- Weapons: the moves and damage types each card learns by level, and how they sit on the enhancement chart (§5).
- Double-detail sprites and the other UI questions: `docs/UI_RULES.md`, Open questions.
- Beta systems: replacing Bare Hands and Single Plot; the new autobuyer list (§15).

Changed without asking (to confirm or undo):

- The Frostspire Vault needs 90 kills to clear instead of the 50 the user confirmed (§6).

Waiting since 2026-11-08 (weapon skins test, §8): whether the Reaper Test Card stays or gets a real card and name.

Defaults by Claude, never confirmed (`[Default]`):

- §7 the Legacy Gate price, how its skins get a rarity and the payback for a skin you own; the Legacy Gate as the right-hand deck (2026-11-08).
- §8 legacy skins below Heirloom only, their palette-cycling strips, "Original" always available, the skin names and the skin rarities (Exotic becoming Mythic, Flameblade Mythic, the Soul Reaper and its skins Void; 2026-11-09).
- §5 (2026-11-09, weapon base) the Uncommon colour and every rarity-keyed number of Uncommon and Mythic/Void, the Uncommon and Mythic/Void costs, the cards that did not fit the new types (Storm Duelist a dagger, the Reaper Test Card a scythe, Core Titan Void), the star bar, the seven level caps, the tier-up costs of Wood and the Heirloom, the Heirloom tier (power ×7), the enhancement budgets and the interim weapon looks and frames.
- §5 (2026-11-09) the nine base roster cards: names, elements, abilities, numbers and Card Portal weights; with them the sim has the first Silver card at about 22 h (target 1.5 h), so the pacing waits for a balancing pass.
- §6 (2026-11-09) the enemy names, that mini-bosses are stronger copies of a dungeon's enemies, and that waves fall in chunks with damage spread in order. The floor counts 10 / 20 / 30, the clear rule and the wave size were approved by the user in the same chat.
- §7 the Legacy Gate weights for Uncommon and Mythic/Void; §8 the maximum cosmetic level of Uncommon and Mythic/Void.
- §14 tier names keep their milestones.

- `ASSET_RULES.md` §5 the concept ladder steps, the Common look, how concept images are stored and cut, and which image PixelLab converts (2026-11-08).
- §2 dev tools and the Report an issue contents.
- §4 what counts as harvested and when mastery tiers apply.
- §5 the enhancement numbers (unlock at Silver ★1, five options, budgets).
- §4 the shelf drawer's first-visit state, what "ready" counts and the stage remembering its job (Production screen, built).
- §4 the balance after plots (base rates ×3) and the plot refund; a kind producing from level 0; the damage-line shelf upgrades going (built).
- §5 (filled in 2026-11-08 to build the weapon decisions) XP from fighting time, base damage by rarity (Common 200), the damage-line refund, star impact and production cards on the same model (built).
- §6 (filled in 2026-11-08) the boss attack pattern and the "You fall in" readout, including how they are built: attacks on the play-time clock, no hits during a knockout, the readout's figure averaged over the cycle (built; how they look is the user's pick and is a `[Built]` rule in "Hits land in chunks").
- §5 (2026-11-08) the weapon panel on the weapon (XP ring, level badge, star pips, tier-up tag), built from the review gate pick "On the weapon" as relayed to the ui agent; the user has not confirmed it in a chat of their own. The Cards collection defaults are in `docs/UI_RULES.md`.
- §6 expected-value damage and crits; medal bonus rounding and the trial medal.
- §7 the pull order, guarantee and upgrade flash details.
- §8 the Wardrobe details (level costs, buffs, equipping, UI-skin levels, set and gate numbers).
- §9 the Starlight formula and the extra Ascension resets.
- §10 account XP and level curve, reward track details, account tree nodes and respec cost, goal rules, the four extra achievements and their rewards, shard prices.
- §11 moved to `docs/UI_RULES.md`: its defaults are listed there.
- `ASSET_RULES.md` §5 brief motion (hit squash, breathing, sticker tilt) may scale or turn art for a moment while Clean pixels holds at rest.
- §14 the sim player's choices, and the numbers retuned in 2026-11-08 (Phase 4a): tree and mine base rates ×3; Root Warden 760,000 HP and 0.6 damage, Cinder Lich 800,000 HP, Glacier Colossus 11,000,000 HP; Bronze → Silver needs 3 Moss Cores; Frost Cores and Sigils of the Prismatic and Unique steps; the star table; the Glimmer Trial's 2,000,000 HP; account XP per gem halved; the Starlight divisor 6e5; and the "mostly exhausted" definition (a T6 weapon).
- §15 every detail of the beta systems (numbers, names, lists), and whether all of them are still wanted after the 2026-11-08 changes. Dungeon floors moved to §6 on 2026-11-09 (user).

## 17. Changelog

- 2026-11-09 — Dungeon floors (user): waves of 3 to 5 normal enemies, 3 types per dungeon, a mini-boss every 10th floor and the dungeon's boss on the last floor (10 / 20 / 30 floors); a dungeon is cleared by its last-floor boss, replacing the 1 / 10 / 50 boss kills; elements stay for later (§6, §15).
- 2026-11-09 — Base roster: nine cards so every job has a card of every rarity (§5; Claude defaults).
- 2026-11-09 — Weapon base (user): 11 item types remade from scratch; rarities Common to Mythic/Void, Exotic gone, Uncommon new; tiers Wood to Mythic/Void with rarity caps; Unique renamed Heirloom, one Mythic and one Void per type; item names; old art kept only as the picked legacy skins and style references; picker page for every choice between pictures (§5, §7, §8).
- 2026-11-08 — Moved the art rules (old §12, `COSMETICS.md`, `COSMETIC_ART_IDS.md`) into `docs/ASSET_RULES.md`; tier looks now follow its T1 to T6 ladder (§5, §12; user).
- 2026-11-08 — Legacy skins (user): all weapon art made so far becomes curated legacy skins per weapon type, worn by every card of that type and earned from a new Legacy Gate; graphics are made one set at a time from now on. This drops the plan to put the redrawn bow, book, katana, maul and staff ladders into the card ladders and the summon pool (§7, §8, §12).
- 2026-11-08 — Moved section 11 "Interface and screens" to `docs/UI_RULES.md` with its UI conventions; no rule changed (user).
- 2026-11-08 — Built the weapon skins test: a Wardrobe tab, per-weapon skins saved in save format 20, the Soul Reaper scythe with 12 free skins and a test card (user). Unlock rules come later.
- 2026-11-08 — Proposed the full-art card layout (artboard G) and wrote the concept-sheet pipeline defaults: ladder steps, Common look, concept image storage and PixelLab inputs (§5, §12; user).
- 2026-11-08 — Our damage to bosses and the Glimmer Trial's target lands in hits every burst interval instead of draining the bar smoothly, and a tier-up now needs all six stars and resets them to ★1 (a Bronze ★6 becomes a Silver ★1); the old default that stars carry across tiers is dropped (user, §5, §6).
- 2026-11-08 — Built the boss-hit visuals the user picked at the review gate (option C, "Screen edge pulse"): edge pulse before each slam, the pale chunk that falls off the health bar, red numbers from the game's reported attacks, and the "You fall in" pill (§6).
- 2026-11-08 — Built the Production screen as the side stage the user picked at the review gate (rows on the left, a sticky stage with the main card, the shelf in a bottom drawer) and the loadout fan from the user's sketch, with its Dungeons use still to build (§4, §11).
- 2026-11-08 — Built the loadout fan on the Dungeons fight screen (§11); the knockout tilt and the lunge tilt of the party cards are gone, since nothing is rotated (§12).
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
- 2026-11-08 — Built the Cards collection as the full card at whole scales (1x four across, 2x on wide windows, detail card at 2x) and the weapon panel on the weapon in the dungeon drawer and the Cards detail (§5, §11), from the review gate picks; Claude's defaults, waiting for the user's confirmation. The damage readout is gone from the drawer.
- 2026-11-08 — Removed the shield: the Shield Warden card and its Bulwark item are gone (user, 2026-11-08: shields do not fit the weapon cards). Fighting has three cards, so a full four-slot loadout needs logging or mining. Saved copies were paid back in shards (save format 19).
- 2026-11-08 — Built the Shop page as Market Stalls with the Pastel Candy pixel art (§11, user pick); the shard shop moved from an Achievements tab to a Shop stall, and the Ascension gate lost its floating kept tokens for plain Kept and Reset lists.
- 2026-11-08 — Legacy bow skins (user): the 45 animated bow colourways plus ten still bows are the bow legacy set, the twin daggers and bronze hammer become legacy skins instead of Unique versions, and the weapon tier options A to E are not legacy skins (§8, §12).
- 2026-11-08 — Legacy maul, twin blades and scythe skins (user): the maul legacy set (11) and the twin blades set (2) are in, scythe art lives on as a 13th Soul Reaper skin, and the duplicate and preview pieces are left out (§8).
- 2026-11-07 and earlier — see git history.
