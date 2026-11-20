# Basic Incremental — Design

This file holds only what the game's code cannot tell anyone: the user's standing direction, the user's decisions that are not built yet (or built differently), the questions only the user can answer, and the choices a chat made that the user never confirmed. The game as built is described in `docs/PROJECT_OVERVIEW.md`.

## How this document works

- **Section 1, Direction**: the user's standing decisions that code cannot show (a target, a reference, a style, a "never do X"). Every line carries the user's words and the date: (user, YYYY-MM-DD: "...").
- **Section 2, Decided, not built yet**: the user's decisions the game does not have yet, tagged `[To build]`, or has differently, tagged `[Differs]`. Every line carries the user's words and the date, what is wanted, and "Today:" what the game does.
- **Section 3, Open questions**: questions only the user can answer, with what the game does meanwhile. A disagreement between the user's words and the game, or between two statements of the user, is asked here with both sides stated.
- **Section 4, Choices a chat made that the user never confirmed**: one line each. `[Default · in game]` is a chat's choice that is in the game and names its overview section; `[Default]` is a chat's default that is not in the game; `[Proposed]` is a chat's proposal that is not in the game.
- A rule that gets built is removed here and described in the overview in the same PR.
- A chat's choice becomes the user's decision only on the user's explicit yes. It is then removed from section 4, or moved to section 2 with the user's words if it is not built.
- Exact tuning numbers live in `src/data/content` and are Claude's to tune with the sim, so they are not listed here.
- Each rule has one current text. There are no sections that patch older rules; git history keeps the past.

Older files and code comments still point at "DESIGN §N" of the previous layout. Those numbered sections are gone: what they described is in `docs/PROJECT_OVERVIEW.md` under the system's name.

## 1. Direction

### Pacing and numbers

- **Pacing targets win over a steady boss ladder** (user, 2026-11-11: "keep the targets"). Between dungeons each boss is set from the pacing targets, not from one steady growth rate.
- **Readable numbers** (user, 2026-11-12: "as a general direction ... we shouldn't be able to reach the scientific numbers they are hard for people to understand id set the end game to billions at max maybe into the trillions ... example 12B 3T 105B 18M 20k 2003"; "max numbers will be around the hundreds of billions not scientific numbers like now, so maybe start by doing 5-20 damage into 100s into 1k etc etc till like 100s of B"). Every number the player sees stays readable in a short format: first hits of 5 to 20 damage, growing to the hundreds of billions at the end of the content, maybe into the trillions, never scientific notation.

### Cards and Heirlooms

- **T6 and Heirlooms come in batches of one style** (user, 2026-11-14: "add t6 and heirlooms in batches of the same style"; "its got to be the same style all throughout t6 and heirlooms"). A batch is one style theme, not a group of weapon types: its T6 Mythic is the hero take, its T6 Void the villain take, and its Heirlooms share the same style, so all three read as one family. The same day the user set that each Heirloom is unique, its colours included, sharing the batch's shapes and motifs but not the T6 Mythic or Void palette, may still lean hero or villain, and looks clearly more intricate than the T6 of its batch; Heirloom backgrounds are set per batch.
- **No Mythic Heirloom and Void Heirloom pair** (user, 2026-11-14: "void heirlooms and mythic heirlooms arent a thing"). Only T6 has the Mythic and Void split; each batch has one Heirloom set.

### Fights and the endgame

- **Endgame loop: an arena and raid bosses** (user, 2026-11-15: "probably an ai arena with teasms and a ranking, and a pve boss mode with rankings based on damage dealt, like bosses that eventually kill every team other then the bestly put togheter ones, so the ones with abilities that have the best sinergy which is why we will probably need to remakle abilities"). The endgame loop is still to be brainstormed from two modes: an arena against AI teams with a ranking, and a boss mode ranked by damage dealt. The user's corrections the same day: the damage bosses, called raid bosses, can be beaten, but only by very specific card combinations, and the loop is finding the good and overpowered combinations against specific raid bosses and arena teams; combinations come from this game's own combat system, not from AFK Arena's factions; AFK Arena is a reference, adapted and not copied. Nothing is designed or built.
- **Rankings are local, against AI teams** (user, 2026-11-15: "which would have ai teams and leaderboards with rewards same as the arena"). Both endgame modes have AI teams on a leaderboard with rewards; there is no server.
- **Abilities are remade for team synergy** (user, 2026-11-15: "deal x% of base damage and debuff enemy, or buff all team with healing x/sec and atk speed x/sec etc"). An ability becomes an action with a number tied to the card's base stats plus an effect (a debuff, healing over time, an attack speed buff and every effect of that kind), not a flat bonus. The user's corrections the same day: no area attacks ("no point in adding it just for that") and no summons; attack animations are fine when they are good (user, 2026-11-20: "well if the attack animations are good its fine to implement them"; asked whether that replaces the 2026-11-15 line that had none, so attacks do get animations: "yes"; section 2); skills may unlock or grow as the card grows; teams stay four cards, two in front and two at the back. Other jobs do not design abilities in a way that blocks this remake.

### Cosmetics

- **Borders replace the base frame** (user, 2026-11-12: "sets are good and borders are decent as long as they replace the initial border"). A worn border is drawn instead of the card's base frame, never over it.
- **Finishes and damage numbers stay as categories** (user, 2026-11-12: "the finishes are all shit so id remove them as well but id keep it as a category cause if done well they could be cool, same with the damage numbers"). The finish, tick and number slots stay, empty, until items done well exist.
- **Castle Stone withdrawn** (user, 2026-11-14: "these are nothing like the ui u showed me all blurry misplaced misalgined plain missing or badly cut"). The Castle Stone table was taken out of the game because the built table did not look like the mockup the user picked.

### Goals and quests

- **Quests give lots of first summons** (user, 2026-11-15: goals "at the moment are useless they should be like the starting ways to get 'lots' of first summons like quests in afk arena, example finish area 1 or beat boss 1 on easy 10 times"). Quests, in the manner of AFK Arena's early quests, are the main way a new player gets many first summons.

## 2. Decided, not built yet

### Cards and Heirlooms

- [To build] **Starter weapon** (user, 2026-11-20: "maybe we let the player choose a t5/6 at the start or something"; told that a sealed starter breaks the rule that a weapon stays its tier: "starters would be the exception"; asked whether the starter is picked from existing art, arrives sealed at Wood strength and is unsealed in light steps paid with Cores: "Yes"). At the start of a new game the player picks one starter weapon from a small set of the game's existing unique weapons. It arrives sealed and hits like a Wood card; its seals are broken in a few light steps paid with dungeon Cores, until it is the full weapon. Starters are the one exception to "a card never moves between tiers". They use art the game already has: nothing new is drawn (user, 2026-11-20, on new art for starters: "this would mean use the last bit of tokens for pixel lab"). For example: a new player is shown the set, picks Solaris and owns it from the first minute at Wood strength; clearing a dungeon and paying its Cores breaks the first seal, and the last seal makes it the T6 card it is. Today: a new game owns the Wooden Sword, the Wooden Axe and the Wooden Pickaxe with no choice, no card changes strength by seals, and Cores have no use.
- [To build] **Attack animations: the special attack** (user, 2026-11-20, on the art controller's test of a special attack on Solaris, asked whether it reads as a big moment worth building in the real duel: "yes perfect"; on the poses rotated in code: "seemed fine to me"; asked who gets it: "every card, maybe we make t7 and heirlooms look cooler but yeah other than that every card"). A card's ultimate plays as a special attack: the stage dims, a slanted cut-in shows the weapon large with the skill's name, then a wind-up, a lunge, an impact frame, a hit-stop with a large element slash, a shake and a settle. The approved sprite is only moved, scaled and rotated in code, never redrawn. Every card gets it. It is built into the real duel first, on today's signature attack; the three attacks below follow as their own job (user, 2026-11-20, picked in the click window). The cut-in built first shows the card's current skill name; own names for the T6 and Heirloom skills come with the three attacks (user, 2026-11-20, asked whether the names wait for the kit: "lets wait"). Today: no attack animation; a signature attack and the duel's skills show through the skill and BREAK banners.
- [To build] **Three attacks per card** (user, 2026-11-20: "yeah didnt we already kinda thought about adding the afk arena combat systems with like 2/3 different attacks eaach?"; on the kit as proposed: "fair"). Every card has up to three attacks: the normal hit, a skill on its own timer (damage plus an effect) and an ultimate on the full gauge. Wood to Prismatic share one kit per weapon type (11 kits), and the tier decides how much of the kit is open; T6 and Heirloom weapons have their own named skill and ultimate. The skill is unlocked on a card with Cores, and the card stays at its tier (user, 2026-11-20, on a light raising step paid with Cores: "yes but not that much"). The kit follows "Abilities are remade for team synergy" (section 1). It is its own job after the special attack and ends with one sim. Today: a card has its normal hits and one signature attack on the full gauge, and Cores have no use.
- [To build] **Element effects match their card** (user, 2026-11-15: "we cant be having flowers and petals falling on a lava sword etc"). The element effects on cards ("the fire lighningh etc animations", user, 2026-11-15), meaning all seven elements (fire, storm, light, nature, earth, crystal, void), are redone so every effect matches the style of the card it is on, with a variant per card style: the tiers, the Dragon hero sky, the Dragon villain lava, the Leviathan sea and the unique cards. Of five options the user kept A (particles), B (rim light) and C (infusion), combined so the effect grows with tier: Gold C, Prismatic C and B, T6 and Heirloom C, B and A; D (back aura) and E (anchored loops) are wanted too ("need work but can be used for sure"). For the effect shapes, pixelfx is tried first and the shape-generated effect code stays in the repo (user, 2026-11-17: "for the shape we'll keep both and start with pixelfx then if i dont like them we go back to the other"). Today: one effect per element, drawn from the weapon's outline, the same on every card style, none below Gold, weak at Gold, strong at Prismatic, and T6 and Heirloom drawn as Prismatic.
- [To build] **Heirloom backdrop motion** (user, 2026-11-15: "keep the static backgrounds and vault the animations for now"). The moving Heirloom backdrops (the villain's flowing lava, the sea's fish and bubbles) are wanted later. Today: the backdrops are still pictures; the motion code is in the game behind one switch that is off.
- [To build] **Card backgrounds and banners** (user, 2026-11-12: "i want to add customized backgrounds for each uniques like the bo3 banners that moved if it makes sense, in order to add uniquity to heirlooms and also we can make custom banners to put on everything not mythic to add to the cosmetics"). Each Heirloom gets its own background behind the weapon, which may move, and every card that is not Mythic can wear a custom banner as a cosmetic. The slot, how it is owned and worn, and how the motion plays are not designed yet. Today: Heirlooms show their batch's still backdrop; no banner cosmetic exists.

- [Differs] **No Mythic or Void Heirlooms** (user, 2026-11-14: "void heirlooms and mythic heirlooms arent a thing"; user, 2026-11-18: "again they arent a thing void and mythic ar for t6"). Mythic and Void belong to T6 only; an Heirloom is not Mythic or Void and is never labelled so. Today: every Heirloom carries a mythic or void side in its data, used for its grade, colour and art, and its detail line and Heirloom Gate pull say "Mythic" or "Void".

### Cosmetics

- [To build] **Frames made by the user** (user, 2026-11-12: "sure we'll customize frames as well since you mentioned it but chat does that not you"). The user has ChatGPT design more card frames; Claude does not design them. Today: no frame cosmetics made by the user beyond the existing borders and card kits.
- [To build] **New finish, tick and number items** (user, 2026-11-12: "throw all away and redo a new batch"). A new batch of items for each of the three empty slots: finishes done well, and damage-number styles made for the redone number display. Today: the three slots exist with no items.

### Account

- [To build] **Account level rework** (user, 2026-11-15: "account level should probably be less incremental at cap at like 500, just as a general direction then you fix it a bit at level 0-50 early game 50-100 mid game 100-200 early endgame 200+ endgame"). Account levels get a much flatter XP curve and a cap of about 500, in four bands: 0 to 50 early game, 50 to 100 mid game, 100 to 200 early endgame, 200 and up endgame; the reward track, skill points and the loadout cost cap's growth spread over those levels. The exact numbers are Claude's to tune. Today: there is no level cap and each level costs a fixed factor more XP than the one before.

## 3. Open questions

### Pacing

- The first summon comes at minute 0, because a new game starts with a Summon Scroll, against the 5 to 10 minute target. The old doc says you accepted this until the retune, without your words, and one line calls the starter scroll your decision while another lists it as Claude's default. Is the starter scroll yours, and does the opening stay?

### Cards and Heirlooms

- Card strength and tiers: a card's tier is its identity and it never moves between tiers (user, 2026-11-18: "tiers are identifiers for that card so it cant jump between them"); the game has that. The starter weapon is the one exception (user, 2026-11-20: "starters would be the exception"; section 2). Open: a pulled card starts on the Wood power step and gains each higher tier's power step as it passes the old level caps (a chat's ruling, 2026-11-16). You said "i dont know about the second part" (2026-11-18). Keep that, or should a card have its own tier's strength from level 1?
- Stars and the tier word on the card: one statement (2026-11-10, "confirmed as built") puts the name and stars side by side on the top plate and the level and tier word on the bottom plate; later statements (2026-11-14 and 2026-11-16) put the name alone on the top plate and the stars in the bottom banner, with no tier word on the banner. The game follows the later one. Which is yours? You said on 2026-11-18: "this will probably have to be revised".
- Health bar on the cards: your pick "Screen edge pulse" (2026-11-08) describes a health bar that closes on each hit and red numbers on the cards; a later statement (2026-11-12) says "the cards carry neither a health bar nor a damage tag". Which stands? Whether the game shows either on the cards was not checked here. You said on 2026-11-18 that this will be revised ("revised", in answer to whether it will be revised like the stars point).
- Cores and Frost Sigils have no use since tier-ups left, and stars come from copies alone (2026-11-08). Cores will pay for the starter weapon's seals and for unlocking a card's skill once those are built (section 2). What else are Cores spent on, and what are Frost Sigils spent on? Meanwhile both keep dropping with nothing to spend them on (Claude's ruling, 2026-11-16).
- Starter weapon, the set: a chat filled in a set of 4 weapons taken from the T6 weapons only, not the Heirlooms, because you called Heirlooms "end game weapons" (2026-11-12) and the Heirloom Gate is their only source; you were asked about "the existing T6/Heirloom art". Is the set 4, is it T6 only, and which weapons are in it? Not in the game.
- Starter weapon, the seals: how many seals are there, and what does each one cost? Not in the game; the exact numbers will live in the data files.
- Special attack, "t7": you said "maybe we make t7 and heirlooms look cooler" (2026-11-20). There is no T7, so a chat read it as T6. Is that right, and what does "look cooler" mean for T6 and Heirlooms? Not in the game.
- Three attacks, the details: which tier opens the skill, and how much of the kit does each tier from Wood to Prismatic open? The timers, the effects, every number of the 11 kits and the unique kits and the Core prices are not set; the numbers will live in the data files. Not in the game.
- Starter weapon, the old start: what happens to the Wooden Sword a new game owns today, and to the Summon Scroll a new game starts with (Pacing above)? Meanwhile the game keeps both.
- The 45 extra T6 cards still use the old recoloured pictures, not the Dragon batch style. Are they redone in the batch style, or kept? Meanwhile they keep the old pictures (Claude's default).

### Money and coins

- With Money on the readable scale, the content ends at the Star coin, so the Moon, Sun and Crown coins are never reached. A chat proposed, and did not apply, either spacing the coins further apart so every coin is reached, or dropping the last three. Meanwhile the game keeps all eight coins as you confirmed them on 2026-11-10. Which do you want?

### Dungeons and summons

- The Shadow Slime's front-facing redraw is in the game and you have not seen it yet. Keep it or redo it?
- The small enemy packs (Bloodroot, Obsidian Crab and the small Elie sprites) look small next to the other bodies. Double them? Whether their drawn size changed since was not checked.
- The reveal show uses Claude's mockup r3 "Fan Deck". Keep it, or pick another of the five reveal mockups?

### Cosmetics

- Castle Stone was withdrawn on 2026-11-14. Is it redone, and how? Its files are still in the repo and loaded, unused, and no player can own it meanwhile.
- "Carved Oak" is a working name given by a chat; you picked the look ("Replace starter", 2026-11-16) but not the name. Keep the name? The game shows "Carved Oak".
- A worn Skill nodes style other than the starter replaces the glyph inside the skill web's plates (a chat's choice, in the game). Keep it, or should the plates keep their glyphs with the style only tinting the border, or the style stay on the card enhancement chart only?

### Project

- The Elie asset pack's licence allows use inside a finished game but not redistribution, and the repository is public with the cut sprites in it; the Coin_Gems pack and the achievement badges sheet have no licence file. Keep them, make the repository private, or replace them?
- Are all the beta systems (presets, bonds, expeditions, Ascension challenges, autobuyers) still wanted after the 2026-11-08 changes? All five are in the game.
- The web build shows the desktop layout and keeps its own save in that browser only. Do you want a phone layout, or a way to carry a save between the desktop game and a phone?

## 4. Choices a chat made that the user never confirmed

### Desktop app, web build and dev tools

- [Default · in game] **Web build layout and save**: a plain browser shows the desktop layout unchanged, keeps its own save in browser storage under chat-chosen key names, and has no updater and no dev cheats (Claude, 2026-11-17). Overview: Web build.
- [Default · in game] **Dev panel extras**: speed steps beside the user's 5x, the backup file name written before a reset, and a second button "Reset, keep cosmetics" (Claude, 2026-11-15). Overview: Sim and dev tools.
- [Default · in game] **Local dev build names**: the dev build's save folder name, its "Dev" window title and the names of its two start files (Claude, 2026-11-15). Overview: Desktop app (Electron).
- [Default · in game] **Late pacing targets**: the targets for the first Hard clear, Dungeons 4 to 6 and the first Nightmare clear, which "mostly exhausted" also asks for (Claude, 2026-11-10). Overview: Sim and dev tools.
- [Default · in game] **Tier milestones keep their targets**: the first Silver, Gold and Prismatic card milestones stand for the old rarity milestones with the same targets (Claude, 2026-11-09). Overview: Sim and dev tools.

### Production

- [Default · in game] **Price growth cuts**: a cut to price growth only takes from the growth above one and all cuts together are capped, so a price never stops growing (Claude, 2026-11-11). Overview: Production.
- [Default · in game] **Milestone shown on the level line**: the next level milestone shows on the line, reaching it plays a small celebration, and levels reset on Ascension (Claude, 2026-11-12). Overview: Production.
- [Default · in game] **How milestone picks work**: which levels offer a pick, a waiting pick never blocks buying, picks are kept through Ascension and cannot be changed, shelf purchases refunded, Vanguard Pact left out (Claude, 2026-11-15). Overview: Production.
- [Default · in game] **A gauge belongs to its place**: a worker sent away leaves the harvest gauge for the next one, and a place with no worker does not fill it (Claude, 2026-11-11). Overview: Production.
- [Default · in game] **No crits without a worker**: a tree or mine with no worker has no harvest crits (Claude, 2026-11-11). Overview: Production.
- [Default · in game] **More gem mastery tiers**: gem mastery has tiers above Prismatic that keep the Prismatic coin and give the same bonus (Claude, 2026-11-11). Overview: Production.
- [Default · in game] **Worker slots**: one worker per place, slots shared by both jobs and growing with Ascension, a second slot per place from the Starlight shop, earlier places keep theirs when slots run short (Claude, 2026-11-11). Overview: Production.
- [Default · in game] **Worker power**: a worker's power comes from its tier, level and stars and multiplies its place's output, its ability does not grow, it gains XP only at its place, an Heirloom counts as the top tier (Claude, 2026-11-11). Overview: Production.
- [Default · in game] **Tool line shape**: yield and strike speed have level milestones, crit chance and crit damage have none, and strike speed also speeds the harvest gauge and the digging (Claude, 2026-11-11). Overview: Production.
- [Default · in game] **How depth works**: worker power and strike speed break a layer's hardness, a place with no worker does not dig, a broken layer raises yield, the deepest layer is never broken (Claude, 2026-11-11). Overview: Production.
- [Default · in game] **How the forge works**: one recipe at a time, speed times worker power, any production card can work it from a shared slot filled last, waiting for gems banks at most one craft (Claude, 2026-11-11). Overview: Production.
- [Default · in game] **How lucky strikes work**: a worked place gets one at fixed moments on the play-time clock, the economy adds the average and rolls nothing, a place with no worker has none (Claude, 2026-11-11). Overview: Production.
- [Default · in game] **How the autobuyers work**: each is bought once with its own switch, one reserve is shared by all, and a pass buys the cheapest level first on the play-time grid (Claude, 2026-11-11). Overview: Production.
- [Default · in game] **Cores and Frost Sigils have no use for now**: they keep dropping and paying with nothing to spend them on since tier-ups left; Cores get their first use when the starter weapon is built, section 2 (Claude, 2026-11-16). Overview: Production.

### Cards

- [Default · in game] **Worker abilities**: each logging and mining card has one worker ability in place of an ability and a team bonus, Thrift became Keen Eye, and the Pact perks strengthen worker abilities (Claude, 2026-11-11). Overview: Cards.
- [Default · in game] **Which cards have which role**: a card's role follows its ability and duel skill, with the type-to-role table and three off-role cards, Bronze Mystic, Silver Mage and Seraph Lancer (Claude, 2026-11-15). Overview: Cards.
- [Default · in game] **Ability and Team bonus**: the two texts are named "Ability" and "Team bonus", an ability acts on the card's own hits, a team bonus counts for the whole team, the giver included (Claude, 2026-11-15). Overview: Cards.
- [Default · in game] **Card colours follow the tier**: each card keeps the body colour its old rarity gave it, read through its tier (Claude, 2026-11-16). Overview: Cards.
- [Default · in game] **The roster in the data**: which old rarity card became which tier's card, one ability per weapon type at every tier, team bonus growing with tier, the extra cards' names and kits (Claude, 2026-11-10 and 2026-11-16). Overview: Cards.
- [Default · in game] **One copy a star**: with fixed tiers a star costs one copy of that card at every tier (Claude, 2026-11-16). Overview: Cards.
- [Default · in game] **The extra T6 cards' details**: names, own weapon names, elements, the same power as their T6 peers, and a different second bonus on some fighting cards (Claude, 2026-11-12). Overview: Cards.
- [Default · in game] **Star dust never stars an Heirloom** (Claude, 2026-11-12). Overview: Cards.
- [Default · in game] **Strength comes with the card's levels**: a card gains its tier's power steps as it passes the old level caps, starting on the Wood step, with breakthrough levels that need much more XP (Claude, 2026-11-16). Overview: Cards.
- [Default · in game] **Weapon identity table**: spear crit chance, bow crit damage and lowest health, staff gauge, lance and hammer health (Claude, 2026-11-10). Overview: Cards.
- [Default · in game] **Enhancements**: they open from ★1 for every card, with a budget per tier, one more option every milestone level and an option list per job (Claude, 2026-11-11). Overview: Cards.
- [Default · in game] **Preset details**: three named presets per production job, a dungeon with nothing remembered keeps the loadout, a preset over the cost cap is flagged, a worker preset applies as far as it fits (Claude, 2026-11-11). Overview: Cards.
- [Default · in game] **The three bonds**: Oath of Dawn, Old Growth and Deep Vein with their card pairs and effects, a production pair counting while both work, found when first active (Claude, 2026-11-11). Overview: Cards.
- [Default] **Bond chain on the table**: a pixel chain links the two bonded cards on the table; not in the game (Claude, no date).
- [Default] **Starter set of four**: the player picks the starter weapon from a set of 4 (Claude, 2026-11-20). Asked under Open questions.
- [Default] **Starters are T6 weapons, not Heirlooms**: the set is taken from the T6 weapons only, since Heirlooms are end game weapons with the Heirloom Gate as their only source (Claude, 2026-11-20). Asked under Open questions.
- [Proposed] **More cards that feel like finds in the first hours**: more cards reachable in the first hours of play that feel like a find; asked whether that is what the early game lacks, the user said "this for sure" (2026-11-20). Which cards and how they are reached is not designed (Claude, 2026-11-20).
- [Default] **One motion per weapon type, one effect per element**: every card's ultimate is made from its weapon type's motion (11) and its element's effect (7), with no paid art (Claude, 2026-11-20).

### Heirlooms and batches

- [Default · in game] **Heirloom Scroll**: a fourth scroll pays for the Heirloom Gate and nothing else, and is kept through Ascension (Claude, 2026-11-12). Overview: Heirlooms and batches.
- [Default · in game] **Where Heirloom Scrolls come from**: Nightmare last-floor bosses, new endless depths, the Nightmare Mythic stage chest and later Ascensions, nothing before the first Nightmare clear (Claude, 2026-11-12). Overview: Heirlooms and batches.
- [Default · in game] **The extra T6 weapons**: the extra and Leviathan T6 cards have their own picture and weapon name, Leviathan cards are cloned from their type's Dragon T6 cards, a skin covers a card's own weapon (Claude, 2026-11-12 and 2026-11-14). Overview: Heirlooms and batches.
- [Default · in game] **Heirloom details**: each Heirloom is its own card in its own section, the strongest, only from the Heirloom Gate, unlocked and starred by its shards, with its own tree, and the Leviathan names (Claude, 2026-11-12 and 2026-11-14). Overview: Heirlooms and batches.
- [Default · in game] **An Heirloom card**: it carries the side of its lean, costs more than T6, has its own tier, cap, power step and kit, starts as strong as a T6 ★6 at cap, and is not in the shard shop (Claude, 2026-11-12 and 2026-11-14). Overview: Heirlooms and batches.
- [Default · in game] **Heirloom Gate shape**: shards unlock and star each Heirloom, repeats count as shards, extra shards become card shards, a pity counter, equal picks, no wishlist, focus or 10-pull guarantee (Claude, 2026-11-12). Overview: Heirlooms and batches.
- [Default · in game] **Heirloom trees**: six nodes in two paths with a capstone, points from the Heirloom's own stars and levels, free respec, nodes act while it is in the loadout or at its place (Claude, 2026-11-12). Overview: Heirlooms and batches.
- [Default · in game] **Signature-power nodes**: they add to the Heirloom's own signature whenever it is in the loadout (Claude, no date). Overview: Heirlooms and batches.
- [Default · in game] **Last Breath's capstone**: it has a fallback effect in place of a new duel rule (author not named, 2026-11-13). Overview: Heirlooms and batches.

### Summon and pulls

- [Default · in game] **Scroll details**: old crystals in a save become scrolls, scroll amounts may be fractions while a pull needs a whole scroll, and scrolls are kept through Ascension (Claude, 2026-11-10 and 2026-11-11). Overview: Summon and pulls.
- [Default · in game] **The field cache**: a steady scroll source paid by play time while a dungeon or the Glimmer Trial is fought, online and offline, not by kills, more in harder modes (Claude, 2026-11-11). Overview: Summon and pulls.
- [Default · in game] **Focus Portal details**: the kinds are the item types, it is the Card Portal cut to one type with each tier keeping its chance, price and pity, and it cannot be pulled with no kind chosen (Claude, no date). Overview: Summon and pulls.
- [Default · in game] **Card Portal rates by tier**: each tier's chance is split equally among its cards, and T6 is split into a Mythic side and a Void side (Claude, 2026-11-10 and 2026-11-16). Overview: Summon and pulls.
- [Default · in game] **Wishlist size**: the wishlist holds two cards per tier, per side at T6, as a placeholder (Claude, 2026-11-11). Overview: Summon and pulls.
- [Default · in game] **Wardrobe Gate pool**: the pool holds Common, Legendary and Mythic items only, while its 10-pull guarantee still names Rare (Claude, no date). Overview: Summon and pulls.
- [Default · in game] **Legacy Gate details**: a pull costs the same as a Wardrobe Gate pull, a skin's rarity comes from its source art, an owned skin pays back part of a pull in Glamour Scrolls, weights fall with rarity (Claude, 2026-11-08). Overview: Summon and pulls.
- [Default · in game] **Reveal look**: mockup r3 "Fan Deck", a summoning circle with cards dealt face down into two rows and the best card last after a film-style entrance (Claude, 2026-11-11). Overview: Summon and pulls.

### Dungeons and fights

- [Default · in game] **Challenge floor first win**: a floor's first-win scrolls pay when the best floor of a difficulty rises (Claude, no date). Overview: Dungeons, floors and stages.
- [Default · in game] **No scrolls from normal enemies**: normal enemies drop no scrolls, so pulls never grow with kill speed (Claude, 2026-11-10). Overview: Dungeons, floors and stages.
- [Default · in game] **Floor structure**: a floor is a growing share of its boss's health and attack, the same floor always holds the same wave, and the rare item and its pity belong to the last-floor boss (Claude, no date). Overview: Dungeons, floors and stages.
- [Default · in game] **Farming and Challenge**: each dungeon remembers its farmed floor per tier, the Challenge is the next floor, a lost Challenge is no knockout, changing dungeon or tier ends it (Claude, 2026-11-11). Overview: Dungeons, floors and stages.
- [Default · in game] **Challenge rules**: each dungeon has its own auto-challenge switch, a knockout while farming drops the farmed floor by one, and an Ascension turns auto-challenge on (Claude, no date). Overview: Dungeons, floors and stages.
- [Default · in game] **Difficulty tiers**: each tier has its own waves, and unlocked tiers, the chosen tier and each tier's best floor are kept through Ascension (Claude, no date). Overview: Dungeons, floors and stages.
- [Default · in game] **Depths**: a depth is a wave with a mini-boss at regular depths and never a boss, materials come in Nightmare's units, a run starts at half the best depth (Claude, no date). Overview: Dungeons, floors and stages.
- [Default · in game] **Dungeons 4 to 6 content**: their elements Storm, Light and Void, the names Sunken Sanctum and Hollow of the Void, their floor counts and rare items, no new mine or material (Claude, 2026-11-10). Overview: Dungeons, floors and stages.
- [Default · in game] **Stormwrack Cove**: Dungeon 4's name, for the cursed-sea theme the user asked for (Claude, 2026-11-11). Overview: Dungeons, floors and stages.
- [Default · in game] **Deeper pays more**: an enemy's purse grows with every floor below the first and every endless depth, harder tiers pay more, and materials do not grow with depth (Claude, 2026-11-10). Overview: Dungeons, floors and stages.
- [Default · in game] **Training gems**: Sharpen is paid in Copper Gems, Toughen in Ironbark Gems, Plunder in Iron Gems and Tempo in Oak Gems (Claude, no date). Overview: Dungeons, floors and stages.
- [Default · in game] **No timed challenge star**: the stage-star rule has no timed challenge star (Claude, 2026-11-11). Overview: Dungeons, floors and stages.
- [Default · in game] **Overflow off-stage**: wave floors follow the overflow switch of the next stage below, and the endless depths follow the Nightmare last-floor boss's switch (Claude, 2026-11-11). Overview: Dungeons, floors and stages.
- [Default · in game] **A running Challenge plays out offline**: a Challenge running when the game closes is finished offline even with auto-challenge off (Claude, 2026-11-11). Overview: Fights.
- [Default · in game] **Boss abilities**: Back Strike, Sweep and Culling Blow, spread by difficulty and by boss or mini-boss, with targets set by the user (Claude, 2026-11-15). Overview: Fights.
- [Default · in game] **The team of four**: each card hits on its own interval with its own health, a knocked-out card stops until the floor is cleared, and roles by weapon type include healers, guards, glass cannons and debuffers (Claude, 2026-11-11). Overview: Fights.
- [Default · in game] **Elements per card**: a card's element raises its damage against the boss's weakness and lowers it against its resistance, workers gain on a matching place, and each boss's pair (Claude, 2026-11-11 and 2026-11-15). Overview: Fights.

### Challenges, trials and expeditions

- [Default · in game] **More Glimmer Trial levels**: the trial score is no longer capped at 100% and extra levels pay above it, while the medal still tops out at 100% (Claude, 2026-11-11). Overview: Challenges and trials.
- [Default] **Trial materials in the forge**: Glimmer Trial materials are also spent in the forge; not in the game, where they are spent on cosmetics only (Claude, 2026-11-11).
- [Default · in game] **How Ascension challenges work**: starting one is an Ascension, a target is reaching a floor, leaving earns nothing, rules act through modifiers, a card left out does not fight (Claude, 2026-11-11 and 2026-11-15). Overview: Challenges and trials.
- [Default · in game] **The six challenges**: Lone Wolf, Common Folk, Untrained, Drought, Glass Cannon and Single Post, with their rules and target dungeons (Claude, 2026-11-11). Overview: Challenges and trials.
- [Default] **Auto-Ascend**: completing all six challenges once unlocks Auto-Ascend; only the unlock check exists and no Auto-Ascend feature is built (Claude, 2026-11-11).
- [Default · in game] **Expedition details**: three trip lengths, three places with the elements Nature, Fire and Crystal, extra slots from the skill web and the Starlight shop, an early recall returns nothing (Claude, 2026-11-11). Overview: Expeditions.

### Cosmetics

- [Default · in game] **Plum Pixel stays owned**: every save owns the Plum Pixel table, it left the Gilded Nocturne set, which takes Carved Oak, and a save that wore the old starter moves to Carved Oak (Claude, 2026-11-16). Overview: Cosmetics and themes.
- [Default · in game] **Set completion**: a set is complete when every piece it still has is worn, with the set bonus unchanged, and the empty finish, tick and number categories show as coming (Claude, 2026-11-12). Overview: Cosmetics and themes.
- [Default · in game] **Legacy skins are per card**: legacy skins are chosen per card like card skins, so there is one skin system (Claude, 2026-11-14). Overview: Cosmetics and themes.
- [Default · in game] **A skin covers a card's own T6 weapon**: a chosen skin covers it, and the legacy skin names are Claude's (Claude, 2026-11-14). Overview: Cosmetics and themes.
- [Default · in game] **Original and the tier models**: "Original" is the card's own picture, tier models are not skins, and a card's own weapon picture stays a skin for other cards (Claude, 2026-11-14). Overview: Cosmetics and themes.
- [Default · in game] **Sticker styles**: five sticker styles, the approved green staying the starter and the plan's stone step left out (Claude, 2026-11-10). Overview: Cosmetics and themes.
- [Default] **Tavern Wood's details**: Legendary, in no set, one level, from the Wardrobe Gate; not in the game (Claude, 2026-11-13).
- [Proposed] **Banner details**: a card-sized template with a calm header and footer, and a short frame loop that stands still under reduced motion; not designed yet (author not named, no date).
- [Proposed] **Sound pack cosmetic**: sounds sit in a registry so a sound pack can become a cosmetic slot later; no such slot exists (author not named, no date).

### Ascension

- [Default · in game] **Ascension and production**: an Ascension resets depth, age, tool lines and harvest gauges and keeps the workers and the forge, and a new game starts with its two start cards working (Claude, 2026-11-11). Overview: Ascension.
- [Default · in game] **Star dust survives an Ascension**: it belongs to the collection, so its resource is kept (Claude, 2026-11-11). Overview: Ascension.
- [Default · in game] **Starlight shop extras**: Second Hands gives second worker slots in order once every place has its first, and two one-level lines unlock the autobuyers (Claude, 2026-11-11). Overview: Ascension.
- [Default · in game] **Second Ascension's cosmetic**: the Bare Rhombus node style replaces the removed Aurora Veil finish as the second Ascension's reward (Claude, no date). Overview: Ascension.
- [Default · in game] **Extra Ascension resets**: an Ascension also resets burst gauges, the boss being fought, the loadout's health and a running trial, and a repeated prestige cosmetic becomes a copy (Claude, no date). Overview: Ascension.
- [Default · in game] **Web levels kept through Ascension**: skill web levels and keystones are kept through Ascension (Claude, 2026-11-16). Overview: Ascension.

### Account, skill web and quests

- [Default · in game] **Reward track past level 50**: the track repeats one reward every five levels (Claude, 2026-11-11). Overview: Account level and reward track.
- [Default · in game] **What each arm holds**: which old branches went into which of the four arms, and the ten keystone names (author not named, 2026-11-16). Overview: Skill web.
- [Default · in game] **When a weapon circle acts**: a fighting circle acts while any loadout card is of its type, once however many, and worker circles act at their card's place (Claude, 2026-11-15). Overview: Skill web.
- [Default · in game] **Skill web rules**: each Ascension opens a depth of nodes through a gate, keystones at the third, and respec gives every point back, is free once per Ascension, then costs Starlight (Claude, 2026-11-16). Overview: Skill web.
- [Default · in game] **Skill nodes cosmetic on the web**: a worn Skill nodes style other than the starter draws its gem art inside the plates in place of the glyph (Claude, 2026-11-16). Overview: Skill web.
- [Default · in game] **Skill point sources**: one skill point per achievement and per stage star level, beside the one per account level (Claude, 2026-11-11). Overview: Skill web.
- [Default · in game] **Quest list and kinds**: quests are data with a group (Dungeons, Cards, Gathering, Account), a condition, a view and a reward, mainly Summon Scrolls (Claude, 2026-11-15). Overview: Goals, quests and achievements.
- [Default · in game] **Quest steps**: a repeat-style quest is a ladder of separate quests, each with its own claim (Claude, 2026-11-15). Overview: Goals, quests and achievements.
- [Default · in game] **Quests are one-time**: a quest is done once and stays done and claimed for good, through Ascension (Claude, 2026-11-15). Overview: Goals, quests and achievements.
- [Default · in game] **Quest popup**: claimable quests first, then the nearest unfinished ones, then one hint without reward, and "See all" opens the grouped full list (Claude, 2026-11-15). Overview: Goals, quests and achievements.
- [Default · in game] **Upgrade quests removed**: the "Upgrade a weapon to" quests left and their scrolls moved onto the "Get your first weapon" quests, and Common Folk counts Wood cards (Claude, 2026-11-16). Overview: Goals, quests and achievements.
- [Default · in game] **Plum Pixel and the cosmetics quests**: Plum Pixel does not count toward the "own cosmetics" quests and achievements (Claude, 2026-11-16). Overview: Goals, quests and achievements.
- [Default · in game] **Star fill in the shard shop**: the shard shop sells copies of every card at every tier (Claude, 2026-11-11). Overview: Goals, quests and achievements.
- [Default · in game] **Added achievements and goal rules**: achievements and goal hints for stage stars, workers, the forge, the wishlist and the skill tree, none for lucky strikes (Claude, 2026-11-11). Overview: Goals, quests and achievements.
- [Default · in game] **New achievements**: Bond Found, First Expedition and Challenger, with rewards chosen by a chat (Claude, no date). Overview: Goals, quests and achievements.
- [Default] **Rock Bottom achievement**: an achievement for reaching the last floor; not in the game (Claude, no date).

### Saves

- [Default · in game] **Saved teams get a formation**: the save update puts a team's two highest-health cards in the front row and the other two at the back, order kept (Claude, 2026-11-15). Overview: Saves.
- [Default · in game] **Loadout order kept**: a saved loadout and every preset keep their cards in the same left-to-right order when the main and support slots left (Claude, 2026-11-15). Overview: Saves.
- [Default · in game] **Saves keep their Heirlooms**: a card at the old Heirloom tier comes back at T6 ★6 with the Heirloom as its own card, and removed Dragon Heirlooms merge into kept ones (Claude, 2026-11-12). Overview: Saves.
- [Default · in game] **How a save's Heirlooms move over**: level and enhancements kept up to the T6 cap, the Heirloom takes stars and level, doubles become shards, removed Heirlooms' trees dropped (Claude, 2026-11-12). Overview: Saves.
- [Default · in game] **Saves keep their cards**: every owned card stands at its own tier with stars, level, XP and enhancements kept, and tier-up spending is not paid back (Claude, 2026-11-16). Overview: Saves.
- [Default · in game] **An old save gets a team and a farmable floor**: empty loadout slots are filled with the best owned fighting cards within the cap, and the save moves to the last dungeon with a beaten floor (Claude, 2026-11-11). Overview: Saves.
- [Default · in game] **Stars of an old save**: an old save's boss kills count as kills on its Normal last floor, and their chests count as unpaid and pay on the next kill (Claude, 2026-11-11). Overview: Saves.
- [Default · in game] **Removed cosmetics**: a reward naming a removed cosmetic grants another of the same rarity and stat, and owned removed cosmetics are refunded in Glamour Scrolls, starters excepted (Claude, 2026-11-12). Overview: Saves.
- [Default · in game] **Old saves and the web**: each node gets the share of levels matching its old skills, rounded down, the rest back as points, and a keystone only when all its old skills were bought (Claude, 2026-11-16). Overview: Saves.
- [Default · in game] **Old saves and quests**: a save from before quests gets every quest it already meets marked done and waiting, never claimed by itself (Claude, 2026-11-15). Overview: Saves.

### Screens and stage

- [Default · in game] **Where picks wait**: a waiting pick shows its two cards at the top of its line's panel, one at a time, the Upgrades pile counts them and the Upgrades view lists every milestone (Claude, 2026-11-15). Overview: Screens.
- [Default · in game] **Next tier preview**: the button the user asked for steps through the same type's weapons of higher tiers up to T6, and does not show on T6 or an Heirloom (Claude, 2026-11-16). Overview: Screens.
- [Default · in game] **Compare line target**: the compare line is against the weakest other loadout card by damage per second, and shows nothing when the card is alone (Claude, 2026-11-15). Overview: Screens.
- [Default · in game] **Weapon panel card switch**: four small cards in formation order, opening on the first card, remembering the choice for the session, empty slots not offered (Claude, 2026-11-15). Overview: Screens.
- [Default · in game] **Worker blocks and the worker picker**: a worker shows as a mini card on its plate, and a picker lists every owned card of the job (Claude, 2026-11-11). Overview: Screens.
- [Default · in game] **Toasts**: toasts stand as one column under the header at the left of the dungeon window and keep that spot when a view is open (Claude, 2026-11-12). Overview: Stage effects.
