# Roster by tier: implementation plan

> **For the build session (Sonnet):** follow this plan step by step. It was written against `main` at 0.7.25 (commit `c0b8d509`, save format 38). Run the greps of "Where it is read today" again before you start. Delete this file in the last PR (CLAUDE.md, Workflow).

## The rule, with one example

**A weapon is pulled from Summon at its tier and stays that tier forever. The tier is the rarity. Nothing tiers up.**

Example, the sword: there are five base sword cards, the **Wooden Sword**, the **Bronze Sword**, the **Silver Sword**, the **Golden Sword** and the **Prismatic Sword**. Each is its own card with its own picture (the 55 sprites are 11 weapon types × 5 tiers). A Summon pull that rolls Silver and the sword gives the Silver Sword. It is Silver the moment it arrives, its level runs from 1 to the Silver cap of 60, further Silver Swords give it stars, and it never becomes a Golden Sword: the Golden Sword is a different card that has to be pulled. Above them, every T6 sword (Mythic Light Sword, Frostjade, Pearlbrand, …) is its own card pulled at T6, and the Heirlooms come from the Heirloom Gate as today.

**Goal:** take card rarities out, make the tier a fixed property of each card, and remove tier-ups.

**Architecture:** the roster keeps its 166 cards. In `cards.json` each card's `rarity` becomes `tier` (plus `side` on T6 and Heirloom cards). `OwnedCard.tier` leaves the save: a card's tier is read from the card, never from the player's state. Everything keyed by rarity is keyed by tier with the same numbers. All tier-up code, data and UI is deleted. Cosmetics and legacy skins keep their own rarities.

**Tech:** TypeScript, zod schemas in `src/data/schemas.ts`, content JSON in `src/data/content/`, vitest, the balance sim in `scripts/sim/`.

**Spec:** `docs/DESIGN.md` §3, §5, §7, §10, §14 and the user's words below. Read `CLAUDE.md` and `docs/PROJECT_OVERVIEW.md` first.

## The user's words (the spec)

- 2026-11-16: "we have 1 card per weapon type for t1,t2,t3,t4,t5 thats why we have only one sprite per weapon type i haver no idea where you picked that from"
- 2026-11-16: "so if this is because we have rarities take them out and letss just use the t1-t6 and heirlooms as rarities"
- 2026-11-16, asked whether a Prismatic weapon upgrades into T6: "no upgrading throught tiers each weapon its from the summon and stays the tier its in we already establoished thois"
- 2026-11-12: "i want to be sure that we have 1 locked model and thats it for t1 to t4 then we can get more than one weapon in the same weapon type as the same tier"
- 2026-11-16 (shipped in 0.7.24): a card has one name, the weapon's: material + type for T1 to T5, its own unique name at T6 and for Heirlooms.

## Global constraints

- Follow the user's words exactly. Add no feature. Every gap is a `[Default]` in `docs/DESIGN.md` and a line under Open questions (CLAUDE.md rule 5).
- No balance number changes in this work except the ones this plan names. The controller chat tunes with the sim afterwards; never put a number to the user.
- Game content stays in data files validated by schemas; logic stays out of the UI; numbers use `break_eternity.js`.
- Save format **39**, with a migration and a test on a real 0.7.25 save.
- No new art, no PixelLab: every picture needed exists.
- Test windows are hidden and muted: `BI_HIDDEN_WINDOW=1 BI_PROFILE=roster npx electron-vite dev -- --remote-debugging-port=<port> --mute-audio`; stop them when done.
- Every PR that touches `src/` updates `docs/PROJECT_OVERVIEW.md`; design edits are committed before code.

## Nothing waits on the user

The user confirmed this reading on 2026-11-16 ("yeah you got it lets start doing it"). Every remaining gap is a `[Default]`: written into `docs/DESIGN.md` where its rule lives, with a line under Open questions giving the reason. The defaults are collected in "Defaults and why" below.

## The roster (166 cards, unchanged in number)

| Class     | Cards | What they are                                                                                                                                                                   | Tier                                            |
| --------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Base      | 55    | One card per weapon type per tier. Today's Common card of a type is its Wooden card, Uncommon its Bronze, Rare its Silver, Epic its Golden, Legendary its Prismatic.            | `wood`, `bronze`, `silver`, `gold`, `prismatic` |
| T6        | 89    | Every Mythic and Void card of today that is not an Heirloom: 22 Dragon (named from `items.json`), the 45 extra weapons, 22 Leviathan. Several per type, each with its own name. | `mythic` with `side: 'mythic' \| 'void'`        |
| Heirlooms | 22    | 11 Dragon, 11 Leviathan, from the Heirloom Gate only.                                                                                                                           | `heirloom` with its `side`                      |

- **Ids, abilities, team bonuses, worker abilities, elements, roles, duel skills, enhancement lists and bonds do not change.** `ember_squire` is the Wooden Sword, `brass_vanguard` the Bronze Sword, `silver_cavalier` the Silver Sword, `gilded_knight` the Golden Sword, `prism_paladin` the Prismatic Sword, and so on for every type (the Rare scythe `reaper_test` is the Silver Scythe). Team bonuses already grow with the tier this way (+4%, +6%, +8%, +10% damage, then +12% and +8% rare drop chance; T6 +16% and +10%).
- **Names** follow the 0.7.24 rule, and every card's name is now unique and fixed: "<material> <type>" for the 55, the weapon's own name at T6 and for Heirlooms. `cardDisplayName` no longer needs the owned state.
- **Start cards:** the Wooden Sword, Wooden Axe and Wooden Pickaxe (`ember_squire`, `apprentice_feller`, `cave_digger`), as today.
- **One model per type from Wood to Prismatic** holds by construction: one card and one picture per type and tier.

### Card data shape (`src/data/schemas.ts`, `cards.json`)

- Replace `rarity` with `tier: RankTier` (`wood` … `prismatic`, `mythic`, `heirloom`), set from the map Common → wood, Uncommon → bronze, Rare → silver, Epic → gold, Legendary → prismatic, Mythic and Void → mythic (an Heirloom card → heirloom).
- Add `side: 'mythic' | 'void'`: required when `tier` is `mythic` or `heirloom` (today's rarity value), forbidden below.
- `heirloom: true` stays as it is (or is dropped in favour of `tier === 'heirloom'`; keep it if that is less churn).
- Write the new `cards.json` with a one-off script from today's file, not by hand; delete the script after.
- `loadContent` checks (`src/data/index.ts`): exactly one card per item type at each of the five base tiers (55); `side` present exactly at `mythic` and `heirloom`; only a `mythic` or `heirloom` card may have `heirloomArt`, `heirloomName`, `batch`; a card-portal pool entry's tier equals its card's.

## Levels and stars (they stay)

- **Level:** every card arrives at Lv 1 and gains XP as today. Its cap is its tier's, for good: Wood 20, Bronze 40, Silver 60, Gold 80, Prismatic 100, T6 120, Heirloom 140 (`cardRules.json` `levelCaps`, unchanged).
- **Stars:** every card arrives at ★1. Each further copy of that same card fills its star bar by one copy, and **one copy buys one star at every tier** (five copies to ★6). This is what today's table already says for a card at its top tier, so `starBar.needs` and `fillPerDuplicate` reduce to "1" and the per-rarity-per-tier tables go. A copy past ★6 pays shards by tier: 1, 1, 2, 4, 8, T6 25 (`cardRules.shards`, same numbers).
- **Star dust** stands in for a missing copy at the price today's rarity has at its top tier: Wood 5, Bronze 12, Silver 30, Gold 120, Prismatic 400, T6 500 (`starBar.dust` keyed by tier).
- **Heirlooms:** stars from their own shards, as today.
- **Stats:** unchanged numbers. Base damage and health keyed by tier with today's rarity values (Wood 7.6 / 50 … T6 62.472 / 411), times `power.statTier` of the card's tier, stars and level as today. A card is exactly as strong as that card is today at its top tier with the same stars and level.

## What replaces tier-ups

Everything below is **removed** unless a replacement is named.

| Where                                                                                                                                          | Today                                                                                                                                                                                       | After                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/game/cards.ts`                                                                                                                            | `tierUpCost`, `tierUpCheck`, `tierUp`, `RARITY_TIER_CAP`, `cardTopTier`, `lookTier`, `weaponLookRarity`, "new card at Wood", the star reset on tier-up, `CardInfo` fields for the next tier | deleted. New `cardTier(content, cardId): RankTier` reads the card. `grantCard` creates `{ stars: 1, level: 1 }` with no tier. `cardRank(card, owned)` builds `{ tier, stars }` for the UI                                                                             |
| `src/game/state.ts`, `save.ts`                                                                                                                 | `OwnedCard.tier`; the clamp of a card above its rarity's cap                                                                                                                                | field removed (format 39); clamp removed; the level is clamped to the card's tier cap                                                                                                                                                                                 |
| `cardRules.json`, `schemas.ts`                                                                                                                 | `tierUp` (five steps × three jobs)                                                                                                                                                          | removed                                                                                                                                                                                                                                                               |
| `src/game/cardStats.ts`                                                                                                                        | before/after numbers of a tier-up                                                                                                                                                           | only the star before/after                                                                                                                                                                                                                                            |
| `src/game/goals.ts`                                                                                                                            | the `tier_up` goal rule (goal tracker "tier up X")                                                                                                                                          | removed; the star-up goal stays                                                                                                                                                                                                                                       |
| `src/game/report.ts`, `progressionModel.ts`, `welcomeModel.ts`, `stage/tierUp.ts`, `copy.ts` `cardTier`                                        | the card kind of `TierUp` ("<card> is now Silver", the tier-up moment, the welcome-back line)                                                                                               | the card kind removed; the milestone, mastery, star-up and cosmetic upgrade moments stay                                                                                                                                                                              |
| `src/game/dev.ts`                                                                                                                              | the set-rank cheat sets a tier                                                                                                                                                              | sets stars and level only                                                                                                                                                                                                                                             |
| `src/game/account.ts` (enhancements), skill web                                                                                                | budget by the owned tier; a weapon circle "opens as a card of that type is upgraded", last skill at T6                                                                                      | budget by the card's tier (same numbers); a circle step opens when a card of that type **of that tier is owned**. Check the 0.7.25 skill web code for where it reads the tier                                                                                         |
| `ui/weaponPanel.ts`, `pages/weaponModel.ts`, `copy.ts` (`reach`, `tierUpTo`, `tierUp`, `nextTier`, `tierNote`, `atCap`, `topLadder`, `topEnd`) | the tier-up tag with its checklist, price chips and button; "At its level cap. Tier up to raise it."                                                                                        | removed. The panel shows level, XP, stars, Add star and star dust. At the cap: "At its level cap." The Tier tile shows the card's tier                                                                                                                                |
| `pages/cards.ts`, `cardsAdapter.ts`, `cardsModel.ts`, UI_RULES §2                                                                              | **Next tier preview** (user, 2026-11-12): steps the card's picture up its own ladder                                                                                                        | `[Default]`: the button stays and steps through the same weapon type's cards of the higher tiers (their pictures and names), so the player still sees what there is to get                                                                                            |
| `pages/detailsModel.ts`, `copy.ts` (`tierUp: 'card tier-ups'`)                                                                                 | a material's "used for" line names tier-ups                                                                                                                                                 | is dropped                                                                                                                                                                                                                                                            |
| `pages/loadoutCards.ts`, `art/items.ts`, every `lookTier(card.rarity, owned.tier)` call                                                        | picture and name from the owned tier                                                                                                                                                        | from the card's tier; `cardTierArt(card)`                                                                                                                                                                                                                             |
| `quests.json`                                                                                                                                  | five quests "Upgrade a weapon to Bronze … Mythic" (`card_tier`) and six "Get your first Uncommon … Void card" (`rarity_owned`)                                                              | they are the same thing now. Keep the six, as `card_tier` / `side_owned` conditions reworded "Get your first Bronze / Silver / Gold / Prismatic weapon", "… Mythic T6", "… Void T6"; remove the five "Upgrade" quests (their scrolls are the controller's to re-home) |
| `achievements.json`                                                                                                                            | `silver_lining`, `golden_hour`, `prismatic_dawn` (`card_tier`)                                                                                                                              | unchanged data: met by owning a card of that tier; reword the descriptions                                                                                                                                                                                            |
| Tutorial and help copy (`copy.ts`: Collection help, weapon panel, welcome)                                                                     | mentions tiering up                                                                                                                                                                         | reworded: weapons come from Summon at their tier                                                                                                                                                                                                                      |
| `scripts/sim/sim.ts`, `timeline.ts`                                                                                                            | the buyer saves for and buys tier-ups; the "heir" of a lead at its rarity's top tier; milestones First Silver / Gold / Prismatic card                                                       | tier-up buying and reserves removed; the lead is simply the hardest-hitting owned card; the milestones mean "first owned card of that tier"; First Epic and First Legendary are the same events as First Gold and First Prismatic card: keep one row each             |
| Tests                                                                                                                                          | `tiersStars`, `tierUpNeverWeakens`, `cardsFromStart`, tier-up cases in `cards`, `goals`, `weaponModel`, `simPlayer`                                                                         | tier-up cases deleted; `tierUpNeverWeakens` becomes "a higher tier's ★1 beats the tier below at ★6" from the data                                                                                                                                                     |

### The tier-up materials

| Material                                          | Other uses today                                                                    | After               |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------- |
| Money                                             | tree and mine levels, tool lines, training, milestones                              | keeps those         |
| Ironbark and Iron gems                            | Training lines                                                                      | keep those          |
| Moonwillow and Grotto gems                        | the forge (star dust)                                                               | keep that           |
| Moss, Cinder, Frost, Storm, Sanctum and Void Core | **none** (they are only dropped, and paid out by expeditions, quests, achievements) | no use, `[Default]` |
| Frost Sigil                                       | **none** (dropped, and paid out by the account reward track)                        | no use, `[Default]` |

**`[Default]`: the six Cores and the Frost Sigils have no use for now.** They keep dropping and being paid out exactly as today, stay in the save and in the material lists where they show, and their "used for" line (`pages/detailsModel.ts`) is left empty rather than naming tier-ups. Reason: the user's rule of 2026-11-08 says stars come "from copies alone", so moving the price onto stars would change a decision of theirs, and removing the materials would change dungeons, expeditions, quests and saves; leaving them changes nothing else. Open question for the user: what the Cores and Frost Sigils are for.

## Defaults and why (each goes into DESIGN.md and under Open questions)

| Default                                                                                                       | Reason                                                                                                               |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| The Cores and Frost Sigils have no use for now                                                                | above                                                                                                                |
| Each card keeps the body colour it has today, now keyed by its tier                                           | no card changes look, so nothing new needs the user's eye                                                            |
| One copy buys one star at every tier                                                                          | it is what the game already asks of a card at its top tier, and every card is now at its top tier                    |
| Star dust prices, shards, cost, base stats, worker power: today's rarity value moves to the tier              | "use the t1-t6 and heirlooms as rarities": the same numbers under the tier's name                                    |
| Pity "Prismatic or better in 90", 10-pull "Silver or better", wishlist 2 per tier, glow from Silver           | today's Legendary, Rare, per-rarity and Rare rules under the tier's name                                             |
| Next tier preview stays and steps through the same weapon type's higher-tier cards                            | keeps the user's 2026-11-12 button and its purpose (see what is still to get) without a ladder                       |
| The five "Upgrade a weapon to …" quests are removed; the six "first …" quests stay, renamed by tier           | they became the same condition; keeping both would pay twice for one pull                                            |
| Weapon circles and enhancement budgets open by the tier of the card owned                                     | the same thresholds, reached by owning the card instead of upgrading it                                              |
| Common Folk: "Only Wood weapons count"                                                                        | Common is Wood                                                                                                       |
| Save: stars, level, XP, enhancements kept; no level granted; cheap stars kept; tier-up materials not refunded | nothing is taken from the player; the card lands at its top tier for free and the save does not record what was paid |

## Rarity becomes the tier: where it is read today

Run again before starting: `grep -rn -i "rarit" src scripts tests` and `grep -rn -E "tierUp|lookTier|owned\??\.tier|\.tier\b" src scripts`. The card property is the tier everywhere; the words Common, Uncommon, Rare, Epic and Legendary no longer name a card. Mythic and Void stay only as the names of T6's two sides.

### Data

| File                | Today                                                                                                              | After                                                                                                                                                                                                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cards.json`        | `rarity`                                                                                                           | `tier`, `side`                                                                                                                                                                                                                                                                                                                             |
| `cardRules.json`    | `cost`, `health`, `baseDamage`, `shards`, `starBar.*` per rarity; `heirloomCost`; `tierUp`                         | per tier, same numbers (cost Wood 2, Bronze 3, Silver 4, Gold 6, Prismatic 9, T6 14, Heirloom 18); `starBar.dust` per tier; `starBar.needs` and `fillPerDuplicate` gone; `tierUp` gone                                                                                                                                                     |
| `production.json`   | `workers.rarityPower`                                                                                              | `workers.tierPower`: 1, 1.14, 1.33, 1.52, 1.77, T6 2.12, Heirloom 2.12                                                                                                                                                                                                                                                                     |
| `portals.json`      | Card Portal: 144 entries with `rarity`; `pity.rarity: legendary`; `tenPullGuarantee: rare`; `wishlistPerRarity: 2` | card portals: entries with `tier` (and the T6 entries their side's weight), `pity: { tier: 'prismatic', threshold: 90 }`, `tenPullGuarantee: 'silver'`, `wishlistPerTier: 2`. Rates unchanged: Wood 53.2%, Bronze 28%, Silver 13%, Gold 4%, Prismatic 1.5%, T6 0.3% (0.2% Mythic side, 0.1% Void side). Wardrobe and Legacy Gate untouched |
| `scrolls.json`      | `reveal.glowFrom`, `entranceFrom: rare`                                                                            | add `glowFromTier`, `entranceFromTier: silver` for card portals                                                                                                                                                                                                                                                                            |
| `quests.json`       | `rarity_owned`                                                                                                     | as in the tier-up table                                                                                                                                                                                                                                                                                                                    |
| `challenges.json`   | Common Folk, `commons_only`, "Only Common cards count"                                                             | `wood_only`, "Only Wood weapons count in the fighting loadout."                                                                                                                                                                                                                                                                            |
| `achievements.json` | `shardShop`: a copy of each of the 144 cards priced by rarity                                                      | same entries, the price from the card's tier (5, 8, 20, 60, 200, T6 300)                                                                                                                                                                                                                                                                   |
| `enhancements.json` | budget per tier, lists per card                                                                                    | unchanged                                                                                                                                                                                                                                                                                                                                  |
| `schemas.ts`        | `perRarity` in card rules, `rarity` on cards and card-portal entries, `rarity_owned`                               | `perTier`; `RARITIES`, `Rarity`, `rarityStyleSchema`, `perRarity` stay for cosmetics                                                                                                                                                                                                                                                       |

### Game logic (`src/game`)

| File                                                                                 | Today                                                                                     | After                                                                                                                                          |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `cards.ts`                                                                           | health, base damage, cost, star bar, dust, shards by `card.rarity`; power by `owned.tier` | all by `card.tier`; `cardSide(card)` reads `card.side`; `tierLabel(tier, side?)`; `itemName(content, kind, tier, side, card)`                  |
| `workers.ts`, `productionView.ts`                                                    | `rarityPower[card.rarity]`, passes `rarity` to the view                                   | `tierPower[card.tier]`, passes the tier                                                                                                        |
| `portals.ts`                                                                         | pool, pity, guarantee, upgrade flash, wishlist and `rates.byRarity` by rarity             | for card portals by tier (`PullResult.tier`, `rates.byTier`, wishlist `byTier`); cosmetic portals keep rarity. `focusPortal` unchanged in idea |
| `summon.ts`                                                                          | `revealPlan(rarities, config)`                                                            | `revealPlan(ranks: number[], glowFrom: number, entranceFrom: number)`: cards pass tier ranks, cosmetics rarity ranks                           |
| `quests.ts`, `achievements` conditions                                               | `rarity_owned`; `card_tier` reads `owned.tier`                                            | `card_tier` reads the card's tier; `side_owned`                                                                                                |
| `challenges.ts`                                                                      | `rarity === 'common'`                                                                     | `tier === 'wood'`                                                                                                                              |
| `expeditions.ts`, `heirlooms.ts`, `combat.ts`, `duel.ts`, `modifiers.ts`, `bonds.ts` | sort by rarity; `cardSide(card.rarity)`; card power from `owned.tier`                     | sort by tier; `card.side`; the card's tier                                                                                                     |
| `migrations.ts`, `migrationTeam.ts`                                                  | old steps name rarities and tiers                                                         | leave them alone; add `v38ToV39`                                                                                                               |
| `index.ts`                                                                           | exports the removed functions                                                             | exports `cardTier`, `cardRank`                                                                                                                 |

### Renderer (`src/renderer/src`)

| File                                                                              | Today                                                                                                                     | After                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui/card.ts`, `theme/base.css`, `theme/recipes.css`, `pages/cards.css`            | `data-rarity`: body colour, level colour, the rarity word                                                                 | `data-tier` and `data-side`. `[Default]`: **each card keeps the colour it has today** (Wood grey, Bronze green, Silver blue, Gold purple, Prismatic amber, T6 pink or black chrome), so no card changes colour; the word is the tier's name |
| `pages/cards.ts`, `cardsAdapter.ts`, `cardsModel.ts`, `views/collection`          | sort by Rarity or Rank; the line "rarity · job · role"                                                                    | sort by Tier (one sort, Rank goes); the line "tier · job · role"; the Collection groups by tier, Wood to T6, then the Heirlooms tab                                                                                                         |
| `pages/summonModel.ts`, `summon.ts`, `summon.css`, `stage/reveal.*`               | odds rows, wishlist rows, hand, glow, entrance and sound by rarity                                                        | by tier for cards: rows Wood, Bronze, Silver, Gold, Prismatic, T6 Mythic, T6 Void; the wishlist "2 per tier"; `revealSound` by tier                                                                                                         |
| `pages/achievementsModel.ts`, `ascensionModel.ts`, `shop.ts`                      | a card reward shows the card's rarity                                                                                     | shows its tier                                                                                                                                                                                                                              |
| `pages/productionStageModel.ts`, `stage/harvestParty.*`, `views/gathering/*`      | worker swatch on the rarity colour                                                                                        | on the tier colour (the same colour as today)                                                                                                                                                                                               |
| `copy.ts`                                                                         | `card.rarity` words; "Legendary or better within N pulls"; "Every ×10 holds a Rare or better"; wishlist help "per rarity" | tier words; "Prismatic or better within N pulls"; "Every ×10 holds a Silver or better"; "per tier"                                                                                                                                          |
| `gallery/gallery.ts`, `scripts/shoot-*.mjs`, `a11y-*.mjs`, `demo-progression.mjs` | cards by rarity                                                                                                           | by tier                                                                                                                                                                                                                                     |

### Untouched (cosmetic rarity)

`rarities.json`, `cosmetics.json`, `cosmeticRules.json`, `weaponSkins.json`, `sets.json`, `game/theme.ts`, `game/wardrobe.ts`, `game/cardSkins.ts`, `pages/wardrobe*`, `pages/cardSkinsModel.ts`, `ui/cosmeticSwatch.*`, `art/cosmetics.ts`, `art/pixel/*`, `art/vector/*`, `theme/*.ts`. A card's body colour may still be defined in `rarities.json` under the old key if moving it costs more than it gives; then say so in `ASSET_RULES.md`.

## Save conversion (format 39, `v38ToV39` in `src/game/migrations.ts`)

The migration does not read content: `V39_CARD_TIER` (every 0.7.25 card id → its new tier) is a snapshot constant.

For every owned card:

1. **Tier:** the saved `tier` is dropped. The card is its own tier, whatever tier it had been raised to. Almost every card was below its own tier or at it, so nearly every card gets stronger; none gets weaker (a save could never hold a card above its rarity's cap).
2. **Stars and star bar:** stars kept. `starFill` was counted in copies of that card: it stays, capped at what ★6 still needs; anything past that pays shards at the tier's rate. `[Default]`: a card that was below its own tier had cheap stars (a fraction of a copy each); it keeps them, a one-time gift, because taking stars away would read as a loss.
3. **Level and XP:** kept. The new cap is never below the old one (old cap = the tier it stood at, new cap = its own tier), so no level is ever cut; a card that sat at its old cap with 0 XP simply starts earning again. `[Default]`: no levels are granted for the higher cap.
4. **Enhancements:** kept; the budget is the card's tier's, never smaller than before.
5. **Materials spent on tier-ups are not refunded.** `[Default]`, Open question: the card ends at its top tier for free, which is worth more than the refund, and the save does not record what was paid.
6. **Heirloom cards:** unchanged.
7. Nothing else in the save names a tier of a card. Loadouts, presets, workers, trips, wishlist (already one list of card ids; "2 per rarity" is the same 2 per tier), bonds, skins and quests keep their ids. The five removed "Upgrade a weapon" quests drop out of `quests`; a claimed one stays claimed in the totals.
8. A loadout can now cost more than the cap? No: cost was by rarity and is the same number by tier. Assert it in the test.

**Fixture and test (`tests/migrateV39.test.ts`).** Add `tests/fixtures/saves/v38-0.7.25.save.txt`: a real save written by the 0.7.25 code (tag `v0.7.25` in a scratch worktree, the sim for 30 hours on one seed, written with `createSaveText`, as `v28-late-game` was; describe it in the fixtures README). Add a hand-built format 38 save for the corners. Assertions:

- the fixture loads at format 39 with no error; no owned card has a `tier` field; every owned card's stars, level and XP equal the old ones;
- an Uncommon at Wood ★4 Lv 20 becomes the Bronze card ★4 Lv 20 with XP running again toward 21; a Legendary at Wood ★1 is the Prismatic card ★1 Lv as saved; a Mythic at Gold ★3 is T6 ★3;
- each card's damage and health after are ≥ before (snapshot of the old formula);
- `starFill` above the ★6 need pays the expected shards;
- the fighting loadout's cost is unchanged and within the cap; quests met before are still met; claimed quests stay claimed;
- migrating twice gives the same state; every older fixture in `tests/fixtures/saves/` still loads through the whole chain.

## Balance flags for the controller's sim (not for the user)

1. **A pulled card arrives at full tier strength.** A Prismatic pull is ×364 a Wooden card at Lv 1 (5.2 × 70.1) where it used to arrive at ×5.2 and climb; a T6 pull ×1,669. The whole middle of the game (tier-up walls, First Silver / Gold / Prismatic card times in §14) is now pull luck: 1.5% Prismatic means one in about 67 pulls, pity at 90.
2. **Migrated saves jump:** every owned card becomes its top tier at once.
3. **Stars cost a whole copy at every tier** (they were a fraction below the top tier).
4. **Level caps are fixed per card:** a Wooden card stops at Lv 20 for good, so low-tier cards fall away faster; XP per level may need a look.
5. **Money, gems and Cores lose their biggest sink**, and the Cores and Frost Sigils have no use at all.
6. **Loadout cost** is unchanged in numbers, but four Prismatic cards (36) are now reachable by luck early, against a cap of 6 + 2 per account level.
7. **Quests:** five "Upgrade a weapon" quests go; the 156-scroll total needs re-homing.
8. **Enhancement budgets and weapon circles** open by owned tier, so by pulls, not by upgrading.

## Docs

### `docs/DESIGN.md` (rewrite in place; `[To build]` in the first commit of step A, then `[Built]` / `[Default · in game]` in the PR that builds each)

- **§3** wherever Cores and Frost Sigils are said to pay for tier-ups: they have no use for now (`[Default]`).
- **§4** Workers and Worker power: "power (rarity, level, tier and stars)" → the card's tier.
- **§5 Cards:** **Rarity**, **Uncommon and Mythic/Void numbers**, **Uncommon and Mythic/Void costs** → one rule, **The tier is the rarity** (user, 2026-11-16, both quotes; the colours). **Base roster: one card per rarity per job** and **Roster: every weapon type has a card of every rarity** → **Roster: one card per weapon type per tier** (user, 2026-11-16; the example at the top of this plan; 55 + 89 + 22). **Cost**, **At most two Heirlooms** (its example names a Legendary), **Start**, **Collection**, **Full-art layout** (the word on the plate), **Beta cards** (the Rarity column becomes Tier), **Cards that did not fit**, **The Rare scythe's name** (the Silver Scythe; the id stays).
- **§5 Weapon progression:** **Strength comes from cards** and **Base stats by rarity** (by tier). **Tier** (user, 2026-11-09) is replaced by **No tier-ups** with the user's 2026-11-16 words: a weapon comes from Summon at its tier and stays there. **Weapon looks** (user, 2026-11-11: "every card starts with its wooden weapon and each tier-up changes the picture") is rewritten the same way: a card shows the one picture of its own tier, always. **Level** ("up to its tier's cap"), **Tier looks**, **One model per type**, **Where the extra weapons show**, **More weapons from the Heirloom candidates**, **The 45 new cards' details** (they are simply T6 cards; nothing shows "below T6"), **Item names** (every name is unique; drop "cards of the same type and tier share a name" and the unowned-card default), **Rarity caps the tier** (removed), **Stars**, **Stars get dearer by tier** (removed: one copy a star), **Star bar** and its copy-cost default, **Star dust** and its prices, **Star impact**, **The tier's power step** (keep the numbers, drop "a tier-up never weakens"), **Rarity matters** → **Tier matters** (the user's 2026-11-10 intent: a higher tier always beats a lower one fresh; `scripts/sim/tiers.ts`), **Weapon identities** ("at the same tier"), **Star fill in the shard shop**, **Next tier preview** (the default above), **Level caps by tier only**, **Weapon skills** (circles open by owned tier), **Stars restart on tier-up** (removed), **Tier-up costs** and **Cores of the new dungeons** (removed; the materials have no use for now), **Base damage**, **Weapon panel** (no tier-up tag), **An Heirloom card** (its side, not its rarity), **Saves keep their cards** (new: the conversion above), **Production cards**.
- **§5 Rank visuals / Enhancements:** the base frame text (rarity word, level colour, "rarity and job line"); budgets by the card's tier; "scaled by rarity" → by tier.
- **§6** Card health ("rarity, level, rank"). **§7** Pulls, Rarer summons, Focus Portal details, Card Portal rates, Hard pity, Wishlist and its default, Reveal (tier names). **§8** Legacy skin details ("at every rarity and tier of the card"). **§10** Hidden weapon circles, Quest list and numbers, shard prices. **§13** reveal sound per tier. **§14** Pacing intent, the milestone table (First Epic / First Legendary merge into the tier rows), the sim player's choices, Tier names keep their milestones, Common Folk.
- **§16 Open questions:** one line per row of "Defaults and why", each with its reason; remove lines that no longer apply (star copy costs per rarity, the Gold step's Storm Cores, the Heirloom rarity lines).
- **§17 Changelog:** one dated line with the user's quote.

### Other docs

- `docs/PROJECT_OVERVIEW.md`: Project shape (format 39, the fixture, `sim/tiers.ts`), State, Saves, Workers, Collection, Loadouts, Level/XP/stars/tiers, Weapon look, Enhancements, Base stats, the portal and Summon entries, quests, goals, the Cards, Weapon panel and Summon page entries.
- `docs/ASSET_RULES.md`: line 86 (T6 follows the card's side; the Heirloom has its side, not a rarity), line 139 **Common look** → the Wood look, line 143 **Adding things** (a new card has a `tier`; a base tier has exactly one card per type), line 177 (`rarities.json`).
- `docs/UI_RULES.md` §2: Worker blocks, Next tier preview, The Summon view, The reveal show's deal, and the Weapon panel if it describes the tier-up tag.

## Order of work

Four PRs into `main`, in this order. Lint, typecheck, test and build pass on each. `main` is not released between them; the release comes after step D and the user's yes on the screenshots.

### Step A: data and logic (each card at its own tier, tier-ups removed, rarity replaced by tier)

The save shape does **not** change in this step: `OwnedCard.tier` stays in the state and in the save, but nothing reads it any more. That keeps this PR free of a format bump.

**First commit: the design.** The `docs/DESIGN.md` rewrites of "Docs" below, tagged `[To build]` or `[Differs]`, and the Open questions lines. Then the code, tests first in each part:

1. **Data and schemas.** `src/data/schemas.ts`, `src/data/index.ts`, `src/data/content/cards.json` (`tier`, `side`; written by a one-off script, deleted after), `cardRules.json` (per tier; `tierUp`, `starBar.needs`, `fillPerDuplicate` gone), `production.json`, `portals.json`, `scrolls.json`, `challenges.json`, `achievements.json`, `quests.json`.
   Tests: `tests/data.test.ts` (55 base cards, one per type and tier; 89 T6; 22 Heirlooms; `side` exactly at T6 and Heirloom); new `tests/rosterParity.test.ts` (every card's damage, health, cost, team bonus and worker power at ★6 and its cap equal what that card had at its top tier in 0.7.25, values pinned in the test).
2. **Fixed tiers.** `src/game/cards.ts` (`cardTier`, `cardRank`, `cardSide(card)`, `grantCard`, stats, cost, stars at one copy, dust, shards), `workers.ts`, `productionView.ts`, `account.ts` and the skill web's circle steps, `challenges.ts`, `quests.ts`, `expeditions.ts`, `heirlooms.ts`, `combat.ts`, `duel.ts`, `modifiers.ts`, `bonds.ts`, `save.ts` (the tier clamp goes; the level is clamped to the card's tier cap), `index.ts`.
   Tests: `tests/cards.test.ts`, `tests/cardsFromStart.test.ts` (a pulled Silver card is Silver ★1 Lv 1 with cap 60, whatever `OwnedCard.tier` says), `tests/tiersStars.test.ts` (one copy a star at every tier; the sixth copy pays shards), `tests/challenges.test.ts`, `tests/workers.test.ts`, `tests/quests.test.ts`, `tests/modifiers.test.ts`.
3. **Tier-ups removed.** Everything in "What replaces tier-ups" that is game code: `cards.ts`, `cardStats.ts`, `goals.ts`, `report.ts` (the card kind of `TierUp`), `dev.ts`.
   Tests: the tier-up cases deleted; `tests/goals.test.ts` (no tier-up goal); `tests/tierUpNeverWeakens.test.ts` rewritten as "a tier's ★1 beats the tier below at ★6", from the data.
4. **Summon by tier.** `src/game/portals.ts`, `summon.ts`.
   Tests: `tests/portals.test.ts` (over 200,000 seeded pulls the tier shares match the rates within 0.3 points; pity at 90 gives Prismatic or T6; a 10-pull holds a Silver or better; a pulled card is created at its own tier), `tests/wishlist.test.ts` (2 per tier; the tier shares unchanged), `tests/summon.test.ts`.
5. **Renderer, only what is needed to compile and not lie.** Calls to removed functions go, `card.rarity` reads become `card.tier`, pictures and names come from the card's tier (`art/items.ts`, `pages/loadoutCards.ts`, `cardsAdapter.ts`, `weaponModel.ts`, `summonModel.ts`, `progressionModel.ts`, `welcomeModel.ts`, `stage/tierUp.ts`, `stage/reveal.ts`). The weapon panel's tier-up tag is taken out; the wording and layout pass is step C.
6. **Sim compiles.** `scripts/sim/sim.ts`, `timeline.ts`, `table.ts`, `breakdown.ts`: the buyer no longer buys or saves for tier-ups; `scripts/sim/rarity.ts` becomes `tiers.ts`. `tests/sim.test.ts`, `tests/simPlayer.test.ts` green. The tuning run is step D.
7. **Docs.** `docs/PROJECT_OVERVIEW.md`; DESIGN tags of what this PR built.

**Done when:** `grep -rn "\.rarity" src/game src/renderer` finds only cosmetic and skin code and old migrations; no function named `tierUp*`, `lookTier`, `cardTopTier` or `RARITY_TIER_CAP` is left; a new `tests/noCardRarity.test.ts` (a grep over `src/`) keeps it so; a fresh game pulls a card and it shows its own tier, picture and name; an existing 0.7.25 save loads and plays (hidden, muted run on a dev profile).

### Step B: save format 39

`src/game/state.ts` (`OwnedCard.tier` removed), `src/game/save.ts` (`CURRENT_SAVE_VERSION = 39`, schema), `src/game/migrations.ts` (`v38ToV39`, `V39_CARD_TIER`), `tests/fixtures/saves/v38-0.7.25.save.txt` and a hand-built corner save, `tests/fixtures/saves/README.md`, `tests/migrateV39.test.ts`, `tests/helpers.ts`, `docs/PROJECT_OVERVIEW.md` (Project shape, State, Saves), DESIGN **Saves keep their cards** to `[Built]`.

**Done when:** every assertion of "Save conversion" passes on the real 0.7.25 fixture and the corner save; every older fixture still loads through the whole chain; the app opens the migrated fixture with no error in the log.

### Step C: the screens that mention rarity or tier-ups

Wording and layout only, no rule changes. Files:

- Weapon panel: `ui/weaponPanel.ts`, `pages/weaponModel.ts` (no tier-up step; the level-cap note; the Tier tile).
- Summon: `pages/summonModel.ts`, `summon.ts`, `summon.css`, `stage/reveal.ts`, `reveal.css` (odds rows and wishlist rows by tier name, glow and sound by tier).
- Collection: `pages/cards.ts`, `cardsAdapter.ts`, `cardsModel.ts`, `views/collection/index.ts` (groups by tier, one Tier sort and filter, the "tier · job · role" line, the Next tier preview across cards).
- Cards everywhere: `ui/card.ts`, `theme/base.css`, `theme/recipes.css`, `pages/cards.css` (`data-tier`, `data-side`, the same colours).
- Other pages: `pages/achievementsModel.ts`, `ascensionModel.ts`, `shop.ts`, `detailsModel.ts`, `productionStageModel.ts`, `stage/harvestParty.*`, `views/gathering/*`, `gallery/gallery.ts`.
- Quests and copy: `copy.ts` (every string in the tables above, tutorial and help copy), the names in `quests.json` and `achievements.json`.
- Scripts: `scripts/shoot-*.mjs`, `a11y-*.mjs`, `demo-progression.mjs`.
- Docs: `docs/UI_RULES.md` §2, `docs/ASSET_RULES.md`, `docs/PROJECT_OVERVIEW.md`, DESIGN tags.

Tests: `tests/cardsAdapter.test.ts`, `tests/summonModel.test.ts`, `tests/weaponModel.test.ts`, `tests/productionStageModel.test.ts`, `tests/cardKits.test.ts`; a new copy test that no card-facing string contains Common, Uncommon, Rare, Epic or Legendary, or "tier up".

**Screenshots before merge**, from the real game (hidden, muted), each at **1280×720 and 1920×1010**, on (a) a fresh game after two 10-pulls and (b) the migrated `v38-0.7.25` fixture, next to the same screens from 0.7.25 in `design/options/roster-by-tier/` (never merged into `main`):

1. Collection: the tier groups with the five swords as five different cards, the filters and sort open, and the Heirlooms tab.
2. A loadout picker: the Loadouts tab with a slot's picker open and the cost bar.
3. Summon: the gates, the Wishlist panel and the odds panel with tier names.
4. The reveal of a 10-pull holding a Silver or better, and the last hand.
5. The Weapon panel without a tier-up step, on a card below its level cap and on one at its cap.
6. A T6 card and an Heirloom on the Cards detail.
7. The Next tier preview stepped once.

Hand them to the controller for the user's yes; merge only after it.

**Done when:** the user has said yes to the screenshots; `node scripts/a11y-audit.mjs` passes on the changed screens; no screen shows a rarity word for a card or a tier-up.

### Step D: sim run and the numbers for the controller

No rule changes. Run `npx tsx scripts/sim/tiers.ts`, `npm run sim -- --hours 40 --seeds 20 --profile both` and `npx tsx scripts/sim/ranges.ts --hours 40 --seeds 1`. Send the controller: the milestone table against DESIGN §14 (first card of each tier, dungeons cleared, first Ascension), pulls per hour, the hours at which the lead card changes, how long cards sit at their level cap, and each balance flag above with its measured size. The controller sends numbers back (rates, pity, caps, XP, cost cap, quest scrolls); apply them in `src/data/content/*.json`, update the §14 results table and the affected `[Default]` lines, and run again. Do not tune on your own and do not ask the user.

**Done when:** the controller says the numbers stand; `tests/balance.test.ts` and `tests/sim.test.ts` are green; this PR deletes `docs/plans/roster-by-tier.md` and lists every `DESIGN.md` tag it changed. Then the controller decides the release.

## Review focus (what is most likely to go wrong)

1. **A place still reads a tier from the player's state.** After step A nothing reads `OwnedCard.tier` (`tests/noCardRarity.test.ts`), and after step B the field is gone, so the type checker catches the rest. Old migrations are the only code that may name a saved tier.
2. **A migrated card loses something.** Stars, level, XP and enhancements must be equal before and after; damage and health never lower (`migrateV39`).
3. **A sixth copy vanishes.** A copy for a ★6 card always pays shards (`tiersStars`, `portals`).
4. **Cosmetic portals and the Wardrobe change.** `tests/wardrobe*.test.ts`, `tests/legacySkins.test.ts`, `tests/theme.test.ts` must pass untouched; if one needs an edit, the change went too far.
5. **The other moments that share the tier-up code** (tree and mine milestones, gem mastery, star-ups, cosmetic upgrades) still play: only the card kind of `TierUp` goes.
