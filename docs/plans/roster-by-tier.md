# Roster by tier: implementation plan

> **For the build session (Sonnet):** follow this plan step by step. It was written against `main` at 0.7.24 (commit `1e46c00e`, save format 37). PR #274 (skill web, save format 38) merges first: rebase on it, then re-run the two greps of "Where rarity is read" before you start, because #274 touches `account.json` and the skill pages. Delete this file in the last PR (CLAUDE.md, Workflow).

**Goal:** one card per weapon type from Wood to Prismatic, no card rarities; the tiers (Wood, Bronze, Silver, Gold, Prismatic, T6, Heirloom) are the rarity; separate cards exist only at T6 and as Heirlooms.

**Architecture:** the card schema loses `rarity`. A card is one of three classes: a base card (11, Wood to Prismatic), a T6 card (89, fixed at T6) or an Heirloom card (22, fixed at Heirloom). Everything that read `card.rarity` reads the card's **grade** instead: the tier the card stands at. Cosmetics and legacy skins keep their own rarities; only cards lose theirs.

**Tech:** TypeScript, zod schemas in `src/data/schemas.ts`, content JSON in `src/data/content/`, vitest, the balance sim in `scripts/sim/`.

**Spec:** `docs/DESIGN.md` §4, §5, §7, §10, §14 and the user's words below. Read `CLAUDE.md` and `docs/PROJECT_OVERVIEW.md` first.

## The user's words (the spec)

- 2026-11-16: "we have 1 card per weapon type for t1,t2,t3,t4,t5 thats why we have only one sprite per weapon type i haver no idea where you picked that from"
- 2026-11-16, told the repeated cards come from rarities: "so if this is because we have rarities take them out and letss just use the t1-t6 and heirlooms as rarities"
- 2026-11-12: "i want to be sure that we have 1 locked model and thats it for t1 to t4 then we can get more than one weapon in the same weapon type as the same tier"
- 2026-11-16 (shipped in 0.7.24): a card has one name, the weapon's: material + type for T1 to T5, its own unique name at T6 and for Heirlooms.

## Global constraints

- Follow the user's words exactly. Add no feature. Every gap is a `[Default]` in `docs/DESIGN.md` and a line under Open questions (CLAUDE.md rule 5).
- Balance numbers in this plan are **starting values**. The controller chat tunes them with the sim; never put a number to the user.
- Game content stays in data files validated by schemas; logic stays out of the UI; numbers use `break_eternity.js`.
- Save format **39** (38 is PR #274's), with a migration and a test on a real 0.7.24 save.
- No new art, no PixelLab. Every picture needed already exists.
- Test windows are hidden and muted: `BI_HIDDEN_WINDOW=1 BI_PROFILE=roster npx electron-vite dev -- --remote-debugging-port=<port> --mute-audio`; stop them when done.
- Every PR that touches `src/` updates `docs/PROJECT_OVERVIEW.md`; design edits are committed before code.

## Decisions waiting on the user (asked through the controller chat)

The plan is written for the recommended answer of each. The "if not" line says what changes.

| #   | Question                                                                                              | Recommended (the plan as written)                                                                                                                                                                       | If the other answer                                                                                                                                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Does the Prismatic weapon upgrade into a T6 weapon, or are T6 weapons only pulled?                    | **Only pulled.** A base card stops at Prismatic. Each T6 weapon is its own card from Summon and exists only at T6, the way an Heirloom exists only as an Heirloom.                                      | Base card caps at T6: its Prismatic → T6 tier-up turns it into the type's Dragon T6 weapon, the player picking the Mythic or the Void one (saved as `OwnedCard.side`). The 22 base Dragon T6 cards stop being separate cards and merge into the base card. The other 67 T6 cards stay pulls. |
| Q2  | What does a pull give?                                                                                | A pull rolls a tier (the rarity) at today's rates, then a weapon type. Wood to Prismatic: a copy of that type's one card, worth more star progress the higher the tier. T6: one of the T6 cards, at T6. | "The pulled tier lifts the card": a Gold pull puts a lower-tier card straight at Gold ★1. Then `grantCard` raises the tier and the tier-up materials matter less; the sim retunes everything.                                                                                                |
| Q3  | Logging and mining have one base card each, but three trees and three mines. Who works the other two? | The one Axe works every tree its worker slots allow, the one Pickaxe every mine. T6 and Heirloom workers still work one place each.                                                                     | One place per card stays: the other trees and mines produce at their plain rate until T6 workers are pulled. No code change in workers; the sim retunes production.                                                                                                                          |

## The new roster (122 cards: 11 base, 89 T6, 22 Heirlooms)

### Base cards (11)

The base card of a type keeps the **id of today's Common card** of that type (so the three start cards and most tests keep their ids) and takes the other four cards into it. `name` becomes the type's plain name ("Sword"); it is data only and shown nowhere.

| Type        | Base id (kept)      | Merged into it (ids removed)                                                | Element | Role     |
| ----------- | ------------------- | --------------------------------------------------------------------------- | ------- | -------- |
| sword       | `ember_squire`      | `brass_vanguard`, `silver_cavalier`, `gilded_knight`, `prism_paladin`       | fire    | dps      |
| dagger      | `alley_cutpurse`    | `bronze_sneak`, `silver_shiv`, `storm_duelist`, `whisper_assassin`          | storm   | dps      |
| greatsword  | `rusty_brute`       | `bronze_warden`, `silver_executioner`, `gold_warlord`, `dawnblade_regent`   | fire    | tank     |
| spear       | `militia_picket`    | `hollow_spearman`, `silver_skirmisher`, `golden_hoplite`, `shard_strider`   | earth   | dps      |
| lance       | `stable_squire`     | `bronze_jouster`, `silver_rider`, `golden_tilter`, `mirror_cavalier`        | light   | tank     |
| hammer      | `quarry_smasher`    | `bronze_forgehand`, `silver_sledger`, `golden_anvilmaster`, `facet_crusher` | earth   | tank     |
| bow         | `fieldhand_archer`  | `bronze_hunter`, `silver_ranger`, `golden_sharpshot`, `rainbow_sniper`      | nature  | dps      |
| staff       | `hedge_acolyte`     | `bronze_mystic`, `silver_mage`, `golden_sage`, `kaleido_weaver`             | crystal | support  |
| scythe      | `field_reaper`      | `bronze_gleaner`, `reaper_test`, `golden_harvester`, `halfmoon_reaper`      | void    | dps      |
| logging_axe | `apprentice_feller` | `moss_forager`, `grove_keeper`, `elder_treant`, `heartwood_warden`          | nature  | (worker) |
| pickaxe     | `cave_digger`       | `pebble_prospector`, `gem_cutter`, `prism_delver`, `geode_golem`            | earth   | (worker) |

**How the base card's ability and bonus scale by tier instead of by rarity.** The rule: _a base card at tier T has what today's card capped at T has_ (Common = Wood, Uncommon = Bronze, Rare = Silver, Epic = Gold, Legendary = Prismatic). So a base card at its tier is exactly as strong as the old card of that rarity at its top tier.

- **Fighting ability:** one `ability`, unchanged. Every rarity of a type already has the same one (hit interval, signature, gauge, crits).
- **Team bonus:** `teamBonusByTier` (wood, bronze, silver, gold, prismatic), copied from the five old cards: +4%, +6%, +8%, +10% damage, then +12% damage and +8% rare drop chance. The Rare scythe has +4% today (an old slip): the base scythe gets +8% at Silver like every other type. The small `power.tier` step still multiplies it.
- **Worker ability:** `workerByTier`, copied from the five old cards with each one's description, modifiers and harvest pattern. Axe: +20% card XP here / +15% output / +1 gauge fill per tick and +10% output / bursts give 15 s and +10% output / bursts give 15 s and +20% output. Pickaxe: +20% card XP here / +15% output / 10% harvest crit chance and +10% output / bursts give 15 s and +10% output / bursts give 15 s and +20% output.
- **Duel skill:** the type's skill (`skills.json` `weapons`). The per-card overrides of merged cards go: `bronze_mystic`, `silver_mage` (arcane_bolt) and `kaleido_weaver` (hex) leave `skills.json` `cards`; `hex_warlock` (hex) and `seraph_lancer` (dawn_grace) are T6 cards and stay. The `arcane_bolt` skill then has no card: remove it if the data check asks. `[Default]`, Open question: the glass-cannon staff and the debuffer staff below T6 leave the game.
- **Enhancements:** the base card has the template options at the Common values, and `enhancements.json` gets `tierScale` (wood 1, bronze 1, silver 1, gold 1.4, prismatic 1.6), the factors the rarities had. The option's modifier values are multiplied by the card's tier scale.

### T6 cards (89)

Every card that is Mythic or Void today and not an Heirloom, unchanged in id, ability, team bonus, element, role and picture:

- the 22 base Dragon T6 (one Mythic and one Void per type, named from `items.json`: "Mythic Light Sword", "Void Shadow Sword"; ids such as `dawn_champion`, `shadow_reaver`, `moonwood_dryad`, `core_titan`),
- the 45 extra weapons from the Heirloom candidates (own `heirloomArt` and `heirloomName`),
- the 22 Leviathan T6 (`batch: 'leviathan'`, own `heirloomName`).

A T6 card is new at T6 ★1, Lv 1, level cap 120, never tiers up, and is starred with its own copies (one copy a star, as a Mythic at Mythic today). It never shows a Wood to Prismatic picture or name.

### Heirloom cards (22)

Unchanged: 11 Dragon and 11 Leviathan, from the Heirloom Gate only.

### Card data shape (`src/data/schemas.ts`, `cards.json`)

- Remove `rarity` from the card schema.
- Add `side: 'mythic' | 'void'`: required on T6 and Heirloom cards (today's rarity value), forbidden on base cards.
- A card with `heirloom: true` is an Heirloom; with `side` and no `heirloom` a T6 card; with neither a base card.
- Base fighting cards: `ability` + `teamBonusByTier`. Base workers: `workerByTier`. T6 and Heirloom cards keep `ability` + `teamBonus` / `worker`.
- Data checks in `src/data/index.ts`: exactly one base card per item type (11); a base card has no `side`, `heirloomArt`, `heirloomName` or `batch`; every T6 and Heirloom card has a `side`; the art checks that built paths from `card.rarity` use `card.side`.

## Rules settled as `[Default]` (written into DESIGN.md, listed under Open questions)

| Topic                    | Default                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Grade                    | A card's grade is the tier it stands at: a base card's current tier, `mythic` for a T6 card, `heirloom` for an Heirloom. It is what the game calls the card's rarity.                                                                                                                                                                                                       |
| Tier to old rarity map   | Wood = Common, Bronze = Uncommon, Silver = Rare, Gold = Epic, Prismatic = Legendary, T6 = Mythic/Void. Every rarity-keyed number moves to the tier with this map.                                                                                                                                                                                                           |
| Base stats               | One base damage (7.6) and health (50). The rarity ratio moves into the tier step: `power.statTier` = old step × old ratio: wood 1, bronze 4.31, silver 18.2, gold 78.4, prismatic 364.5, mythic 1,669, heirloom 13,399. A card at tier T is as strong as the old rarity capped at T was.                                                                                    |
| Loadout cost             | By grade: Wood 2, Bronze 3, Silver 4, Gold 6, Prismatic 9, T6 14, Heirloom 18 (`cardRules.cost` keyed by tier; `heirloomCost` folds in). So a tier-up never has to be refused, the cap starts where four Prismatic cards fit: `costCap.base` 36, rising to the user's 64 (the controller sets `perLevel`). The cap then only limits how many T6 and Heirlooms a team holds. |
| Colours                  | A card takes its tier's own colours, the ones the level badge and the stars already use (wood, bronze, silver, gold, prismatic rainbow); T6 keeps Mythic neon pink or Void black chrome by its side. The green, blue, purple and amber card bodies go. Shown to the user in the screenshots before merge.                                                                   |
| Copies and stars         | A pull's copy is worth `starBar.copyValue[pulled tier]` (wood 1, bronze 4, silver 16, gold 64, prismatic 256); a star costs `starBar.needs[card's tier]` (the same five numbers; a T6 card 1 of its own copies). Past ★6 a copy pays `cardRules.shards[pulled tier]` (1, 1, 2, 4, 8; T6 25). Star dust: `starBar.dust[tier]`, today's price of the rarity at its top tier.  |
| New card                 | A base card is new at Wood ★1 whatever tier was pulled; the rest of the pulled copy's worth goes into its star bar.                                                                                                                                                                                                                                                         |
| Card Portal rates        | Wood 53.2%, Bronze 28%, Silver 13%, Gold 4%, Prismatic 1.5%, T6 0.3% (0.2% the Mythic side, 0.1% the Void side, split equally among that side's cards): today's rarity rates under tier names. Weapon type: equal, 1 in 11.                                                                                                                                                 |
| Pity and guarantee       | Prismatic or better within 90 pulls; every 10-pull holds a Silver or better (today's Legendary and Rare).                                                                                                                                                                                                                                                                   |
| Wishlist                 | Two rows: up to 2 weapon types (a Wood to Prismatic pull lands on a marked type) and up to 2 T6 cards (a T6 pull lands on a marked one). The tier odds do not change.                                                                                                                                                                                                       |
| Focus Portal             | Unchanged idea: every Wood to Prismatic pull is the chosen type's card; a T6 pull is a T6 card of that type.                                                                                                                                                                                                                                                                |
| Reveal                   | Glow and the full-screen entrance start at Silver (today's Rare); the glow is the tier's colour; the reveal sound follows the tier.                                                                                                                                                                                                                                         |
| Worker power             | `production.json` `workers.tierPower`: wood 1, bronze 1.14, silver 1.33, gold 1.52, prismatic 1.77, mythic 2.12, heirloom 2.12.                                                                                                                                                                                                                                             |
| Shard shop               | One copy entry per base card (11): its price and worth follow the card's own tier (5, 8, 20, 60, 200 shards; it fills one star). One entry per T6 card at 300. The 44 entries of merged cards go.                                                                                                                                                                           |
| Quests                   | "Get your first Uncommon / Rare / Epic / Legendary card" become "Pull your first Bronze / Silver / Gold / Prismatic weapon" (new condition `tier_pulled`); the Mythic and Void ones become "Get your first Mythic T6 / Void T6 card" (`side_owned`). Quest ids and rewards stay, so claims carry over.                                                                      |
| Challenge                | Common Folk: "Only Wood weapons count in the fighting loadout." (restriction id `commons_only` renamed `wood_only`).                                                                                                                                                                                                                                                        |
| Bonds                    | Oath of Dawn becomes Sword + Greatsword (base cards). Old Growth and the mining bond paired two cards that are now one: they pair the base card with the type's Dragon Mythic T6 (`moonwood_dryad`, `lodestone_seer`). Discovered bonds stay discovered. Open question: they become late-game bonds.                                                                        |
| Weapon circles           | A type's last hidden skill opened "at the Mythic or Void tier": it opens when the player owns a T6 card of that type.                                                                                                                                                                                                                                                       |
| Prismatic → T6 tier-up   | Gone with Q1 (`cardRules.tierUp` loses its last step). The Void Core and the Sanctum Cores and Frost Sigils of that step lose that use: the controller re-homes them with the sim. Open question.                                                                                                                                                                           |
| Cosmetics                | Cosmetics and legacy skins keep their rarities (they have no tiers): `rarities.json`, `cosmetics.json`, `cosmeticRules.json`, `weaponSkins.json`, the Wardrobe and Legacy Gates are untouched. `cosmetics.json`'s exclusive card `dawnblade_regent` becomes `rusty_brute`.                                                                                                  |
| Expedition / sim / lists | Wherever cards were sorted by rarity they sort by grade, then stars, then level.                                                                                                                                                                                                                                                                                            |

**What the player will notice (tell the controller, it is not a question):** the 11 base cards are all owned within the first pulls, so Summon after that gives star progress and the T6 hunt; a team needs four different weapon types; a base card starts weaker than a pulled Legendary did (Wood is Wood), and the sim has to re-pace the first hours.

## Where rarity is read today, and what it reads instead

Run again after rebasing: `grep -rn -i "rarit" src scripts tests` and `grep -rn -E "common|uncommon|legendary|epic" src/data/content`. Files that only style or roll **cosmetics** stay as they are and are listed at the end.

### Data (`src/data/content`, `src/data/schemas.ts`, `src/data/index.ts`)

| File                               | Today                                                                                                                        | After                                                                                                                                                                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cards.json`                       | 166 cards with `rarity`                                                                                                      | 122 cards as above                                                                                                                                                                                                    |
| `cardRules.json`                   | `cost`, `health`, `baseDamage`, `shards`, `starBar.{fillPerDuplicate,needs,dust}` per rarity; `heirloomCost`; `tierUp` to T6 | `cost`, `shards`, `starBar.needs`, `starBar.dust`, `starBar.copyValue` per tier; `health`, `baseDamage` single values; `power.statTier` as above; `costCap.base` 36; no Prismatic → T6 step                           |
| `production.json`                  | `workers.rarityPower`                                                                                                        | `workers.tierPower`                                                                                                                                                                                                   |
| `portals.json`                     | Card Portal pool of 144 entries with rarity and weight; `pity.rarity`, `tenPullGuarantee`, `wishlistPerRarity`               | Card Portal: `tierOdds`, a pool of the 89 T6 cards (weights by side), `pity: { tier: 'prismatic', threshold: 90 }`, `tenPullGuarantee: 'silver'`, `wishlist: { types: 2, t6: 2 }`. Wardrobe and Legacy Gate unchanged |
| `scrolls.json`                     | `reveal.glowFrom`, `entranceFrom` (rarity)                                                                                   | add `reveal.glowFromTier`, `entranceFromTier` (`silver`) for card portals; the rarity ones stay for cosmetics                                                                                                         |
| `enhancements.json`                | 166 option lists scaled by rarity                                                                                            | 122 lists; `tierScale`                                                                                                                                                                                                |
| `skills.json`                      | `cards` overrides for 5 ids                                                                                                  | 2 ids (`hex_warlock`, `seraph_lancer`)                                                                                                                                                                                |
| `bonds.json`                       | 3 pairs naming merged ids                                                                                                    | pairs as in the defaults                                                                                                                                                                                              |
| `quests.json`                      | 6 `rarity_owned` quests                                                                                                      | `tier_pulled` ×4, `side_owned` ×2                                                                                                                                                                                     |
| `challenges.json`                  | `commons_only`                                                                                                               | `wood_only`                                                                                                                                                                                                           |
| `achievements.json`                | `shardShop` copy of 144 cards priced by rarity                                                                               | 11 + 89 entries; base price from `shardShop.copyPrice` per tier                                                                                                                                                       |
| `heirlooms.json`, `cosmetics.json` | name card ids                                                                                                                | check ids still exist; `dawnblade_regent` → `rusty_brute`                                                                                                                                                             |
| `schemas.ts`                       | `perRarity(...)` in card rules, `rarity` on cards, `rarity_owned`, portal pity                                               | `perTier(...)`; the shapes above. `RARITIES`, `Rarity`, `rarityStyleSchema`, `perRarity` stay for cosmetics                                                                                                           |
| `index.ts` (`loadContent` checks)  | portal entry rarity equals the card's; own picture only on Mythic/Void; Heirloom is Mythic/Void; pity reachable              | the checks of "Card data shape"; T6 pool holds every T6 card once and no other; `tierOdds` sums to 100                                                                                                                |

### Game logic (`src/game`)

| File                                                                 | Today                                                                                                                                         | After                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cards.ts`                                                           | `RARITY_TIER_CAP`, `maxTier`                                                                                                                  | `cardClass(card): 'base' \| 't6' \| 'heirloom'`; `maxTier`: base `prismatic`, t6 `mythic`, heirloom `heirloom`; a T6 card is granted at `mythic`                                                                                           |
| `cards.ts`                                                           | `cardSide(rarity)`, `tierLabel(tier, rarity)`, `itemName(..., rarity, card)`, `lookTier(rarity, tier)`, `weaponLookRarity`, `CardItem.rarity` | take the card: `cardSide(card)` reads `card.side`; `tierLabel(tier, side?)`; `itemName(content, kind, tier, side, card)`; `lookTier(tier)`; delete `weaponLookRarity` and `CardItem.rarity` if nothing draws from them, else pass the tier |
| `cards.ts`                                                           | health, base damage, `cardCost`, star bar (`starFillNeeded`, dust, shards, `grantCard`'s duplicate) by `card.rarity`                          | by `cardGrade(card, owned)`; `grantCard(state, content, cardId, pulledTier?)` adds `copyValue[pulledTier]`; new `cardGrade(card, owned?): RankTier`, `cardTeamBonus(card, tier)`, `cardWorker(card, tier)`                                 |
| `modifiers.ts`, `combat.ts`, `duel.ts`, `workers.ts`, `cardStats.ts` | read `card.teamBonus` / `card.worker`                                                                                                         | read through `cardTeamBonus` / `cardWorker` with the owned tier. `workers.ts` `workerPower` uses `tierPower[grade]`                                                                                                                        |
| `workers.ts` (Q3)                                                    | one place per card; repeats dropped by `activeWorkers`                                                                                        | a base worker may be assigned to several places of its job, one slot each; T6 and Heirloom workers one place                                                                                                                               |
| `account.ts` (enhancements)                                          | option values as written                                                                                                                      | × `tierScale[tier]` for a base card                                                                                                                                                                                                        |
| `portals.ts`                                                         | pool by rarity, `pick(min rarity)`, pity, guarantee, upgrade flash, wishlist per rarity, `focusPortal`, `portalInfo.rates.byRarity`           | card portals roll `tierOdds` then a type (base) or the T6 pool; `PullResult` gets `tier` (and keeps `rarity` for cosmetic portals); pity, guarantee and flash compare tiers; wishlist rows `types` and `t6`; `rates.byTier`                |
| `summon.ts`                                                          | `revealPlan(rarities, config)`                                                                                                                | `revealPlan(ranks: number[], glowFrom, entranceFrom)` so cards pass tier ranks and cosmetics rarity ranks                                                                                                                                  |
| `quests.ts`                                                          | `rarity_owned`                                                                                                                                | `tier_pulled` (reads `summon.pulledTiers`), `side_owned`                                                                                                                                                                                   |
| `state.ts`                                                           | —                                                                                                                                             | `summon.pulledTiers: RankTier[]` (each tier ever pulled from the Card or Focus Portal)                                                                                                                                                     |
| `challenges.ts`                                                      | `rarity === 'common'`                                                                                                                         | owned tier is `wood` and the card is a base card                                                                                                                                                                                           |
| `expeditions.ts`, `productionView.ts`, `heirlooms.ts`                | sort or pass `rarity`, `cardSide(card.rarity)`                                                                                                | grade and `card.side`                                                                                                                                                                                                                      |
| `goals.ts`                                                           | wishlist text names rarity                                                                                                                    | new wording                                                                                                                                                                                                                                |
| `save.ts`                                                            | clamps a card above its rarity's cap                                                                                                          | clamps to `maxTier(card)`; a T6 card below `mythic` is set to `mythic`                                                                                                                                                                     |
| `migrations.ts`, `migrationTeam.ts`                                  | old snapshots by rarity                                                                                                                       | leave the old steps alone (they are history); add `v38ToV39`                                                                                                                                                                               |
| `index.ts`                                                           | exports `RARITY_TIER_CAP`, `weaponLookRarity`                                                                                                 | exports the new helpers                                                                                                                                                                                                                    |

### Renderer (`src/renderer/src`)

| File                                                                                        | Today                                                                                             | After                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui/card.ts`, `theme/base.css`, `theme/recipes.css`, `pages/cards.css`                      | `data-rarity` on a card: body colour, level colour, the rarity word                               | `data-grade` (the tier) and `data-side` at T6 and Heirloom; colours from the tier's tokens; the word is the tier's name                                                                              |
| `pages/cards.ts`, `cardsAdapter.ts`, `cardsModel.ts`                                        | Collection sorted by rarity, "rarity · job · role" line, Next tier preview up to the rarity's cap | groups: Weapons (the 11 base cards), T6 (by weapon type), Heirlooms (as today); sort by Tier; the line is "tier · job · role"; Next tier preview up to Prismatic for a base card, none for a T6 card |
| `pages/loadoutCards.ts`, `weaponModel.ts`, `progressionModel.ts`                            | pass `card.rarity` to names and labels                                                            | pass the card / side; the Weapon panel's end note for a Prismatic base card: "Prismatic is this weapon's top tier. T6 weapons come from Summon."                                                     |
| `pages/summonModel.ts`, `summon.ts`, `summon.css`                                           | odds rows, wishlist rows, hand and reveal by rarity                                               | Card Portal column lists Wood, Bronze, Silver, Gold, Prismatic, T6; wishlist two rows; hand and reveal carry the pulled tier                                                                         |
| `stage/reveal.ts`, `reveal.css`                                                             | glow and entrance by rarity colour, `revealSound(rarity)`                                         | by tier colour for cards; cosmetics unchanged                                                                                                                                                        |
| `pages/achievementsModel.ts`, `ascensionModel.ts`, `shop.ts`                                | card rewards show the card's rarity                                                               | show its grade                                                                                                                                                                                       |
| `pages/productionStageModel.ts`, `stage/harvestParty.*`, `views/gathering/job.*`, `forge.*` | worker swatch on the rarity colour                                                                | on the tier colour                                                                                                                                                                                   |
| `art/items.ts`                                                                              | `cardTierArt` reads `card.rarity` for the T6 side                                                 | reads `card.side`                                                                                                                                                                                    |
| `copy.ts`                                                                                   | `card.rarity` words, summon and wishlist lines, Collection help                                   | tier words; "Prismatic or better within N pulls", "Every ×10 holds a Silver or better", the wishlist help for the two rows                                                                           |
| `gallery/gallery.ts`                                                                        | cards by rarity                                                                                   | by tier                                                                                                                                                                                              |

### Scripts and tests

- `scripts/sim/rarity.ts` → `scripts/sim/tiers.ts`: fresh and at ★6, each tier beats the one below in damage and health; a fresh T6 card beats a Prismatic ★1; update the command in `docs/PROJECT_OVERVIEW.md`.
- `scripts/sim/sim.ts`, `table.ts`, `breakdown.ts`: the lead and the support order by damage then grade; the heir rule (a lead at its top tier) now only fires for a Prismatic ★6 base card with a T6 owned; the wishlist marks the two types it builds and the T6 cards it owns; `pullCardValue` values a pull by tier; the milestones "First Epic" and "First Legendary" become "First Gold pull" and "First Prismatic pull" (the controller confirms the targets).
- Screenshot and audit scripts that pass a rarity for a card (`scripts/shoot-*.mjs`, `a11y-*.mjs`, `demo-progression.mjs`): pass a tier.
- Tests that name merged ids or `rarity`: `cards`, `cardsAdapter`, `cardsFromStart`, `cardKits`, `challenges`, `combat`, `damageFromCards`, `data`, `goals`, `heirloomCards`, `heirloomGate`, `leviathanBatch`, `modifiers`, `portals`, `productionStageModel`, `quests`, `sim`, `simPlayer`, `stages`, `summon`, `summonModel`, `tierUpNeverWeakens`, `tiersStars`, `weaponIdentity`, `weaponModel`, `wishlist`, `workers`, `helpers.ts`. Tests of cosmetics, skins and themes stay.

### Untouched (cosmetic rarity)

`rarities.json`, `cosmetics.json` (but one id), `cosmeticRules.json`, `weaponSkins.json`, `sets.json`, `game/theme.ts`, `game/wardrobe.ts`, `game/cardSkins.ts`, `pages/wardrobe*`, `pages/cardSkinsModel.ts`, `ui/cosmeticSwatch.*`, `art/cosmetics.ts`, `art/pixel/*`, `art/vector/*`, `theme/registry.ts`, `theme/apply.ts`.

## Save conversion (format 39, `v38ToV39` in `src/game/migrations.ts`)

Snapshots live in the migration as constants (`V39_BASE_OF`: removed id → base id, 44 entries; `V39_RARITY`: every 0.7.24 card id → its rarity; the old `needs`, ratios, `statTier` and star multipliers), never read from content, like `V33_CARDS_BY_KIND`.

**Base cards.** For each weapon type, take the owned cards of the group (the base id and the four merged ids):

1. `power(card)` = old rarity ratio (1, 1.49, 2.18, 3.24, 5.2) × old `statTier` of its tier × star multiplier of its stars.
2. The **best** card is the one with the highest power (tie: the higher level).
3. The one card gets the **lowest tier and stars on the new ladder that are at least as strong** as the best card: the first (tier, stars), tier not below the best card's tier, where new `statTier` × star multiplier ≥ `power(best)`. A player is never weaker after the update. Example: a Legendary at Wood ★1 (5.2) becomes Bronze ★2 (5.21).
4. **Level and XP:** the highest level in the group, with that card's XP (0 at the new tier's cap; the new tier is never below the old one, so the level always fits).
5. **Enhancements and worn skin:** the best card's (option ids are the same template at every rarity).
6. **Extras become star progress.** Every other owned card of the group, and the best card's own leftover, pays in copies: one copy for the card itself, plus the copies its stars took (5 × old `needs` for each tier below its own, plus (stars − 1) × old `needs` at its tier), plus its `starFill`. Each copy counts `copyValue` of its rarity's tier. The sum goes into the one card's `starFill`, up to what ★6 at its tier takes; what is left pays shards at `shards` of that tier per copy. Nothing is deleted without a payout.
7. Money and materials spent on the extras' tier-ups are not paid back (the kept tier is set by power instead). `[Default]`, Open question.

**T6 cards.** An owned Mythic or Void card below the `mythic` tier is set to `mythic` ★1 with its level, XP and enhancements kept; the copies its stars took (same formula) go into its `starFill` at one copy a star, the rest to shards. One already at `mythic` is unchanged. Heirloom cards are unchanged.

**Everything that names a card id** is renamed through `V39_BASE_OF`: the fighting loadout, `presets.dungeons`, the three production presets per job, worker assignments (`production.workers`), `expeditions` trips, `cards.wishlist` (base ids become marked types, T6 ids stay), `cardSkins`, `discoveredBonds` (kept), the Weapon panel's remembered card.

- A loadout or preset that now holds the same card twice keeps the first and empties the other slot; empty slots of the fighting loadout are then filled with the strongest owned fighting cards the cost cap allows (the way `migrationTeam.ts` does for format 27), and the state is flagged for `arrangeFormation`.
- Two merged workers: the card keeps every place it had (Q3); if Q3 is answered "one place", it keeps the first place and the others empty.
- A trip whose card merged into one already away ends and pays as collected.
- `summon.pulledTiers` starts with the tier of every rarity the save owned a card of (so a quest already met stays met); quest ids are unchanged, so `quests` needs no change.
- The pity counter carries over.

**Test (`tests/migrateV39.test.ts`) and fixture.** Add `tests/fixtures/saves/v37-0.7.24.save.txt`: a real save written by the 0.7.24 code (check out tag `v0.7.24` in a scratch worktree, run the sim for 30 hours on one seed and write the state with `createSaveText`, as `v28-late-game` was made; describe it in `tests/fixtures/saves/README.md`). Add a second, hand-built format 37 save for the corners. Assertions:

- the fixture loads at format 39 with no error and no unknown card id anywhere in the state;
- per weapon type at most one base card is owned, and its damage and health are ≥ the best old card's (computed with the snapshot);
- a save owning Common ★3, Rare Silver ★2 and Legendary Wood ★1 swords: the one sword's tier, stars, level, `starFill` and the shards paid equal hand-computed values;
- a Mythic card at Gold ★4 becomes `mythic` ★1 with the expected `starFill`;
- a loadout with two swords ends with one sword and no duplicate; no slot names a removed id; the cost is within the cap;
- two merged workers, a merged card on a trip, a wishlist of merged ids, a worn skin on a merged card;
- migrating twice gives the same state; a format 39 save loads unchanged.

## Docs

### `docs/DESIGN.md` (rewrite in place; tags `[To build]` in step 1, `[Built]` / `[Default · in game]` in the PR that builds each)

- **§4** Workers and Worker power ("power (rarity, …)" → tier; `tierPower`); Workers "A card works one place at a time" gains the Q3 answer with the user's words.
- **§5 Cards:** replace **Rarity**, **Uncommon and Mythic/Void numbers**, **Uncommon and Mythic/Void costs**, **Base roster: one card per rarity per job**, **Roster: every weapon type has a card of every rarity**, **Cards that did not fit the new types**, **The Rare scythe's name** and its Dusk Reaper default with two rules: **Roster: one card per weapon type** (the user's two quotes of 2026-11-16 and the one of 2026-11-12; the 11 / 89 / 22 roster) and **The tiers are the rarity** (grade, colours, the map). Rewrite **Cost**, **At most two Heirlooms** (its example names a Legendary), **Start** (Wooden Sword, Wooden Axe, Wooden Pickaxe), **Collection**, **Abilities** (by tier), **Full-art layout** (the rarity word is the tier), **Beta cards** (the table becomes the 11 base cards with their per-tier bonus), **Which cards have which role** (the staff exceptions below T6 are gone).
- **§5 Weapon progression:** **Strength comes from cards**, **Base stats by rarity** → by tier, **Tier** (the ladder a base card climbs ends at Prismatic; T6 is a separate card: Q1 with the user's words), **Tier looks**, **One model per type** (now also one card), **Where the extra weapons show** and **More weapons from the Heirloom candidates** and **The 45 new cards' details** (they exist only at T6; portal chance), **Item names** (drop "tell them apart by … rarity colour": there are no same-name cards left), **Rarity caps the tier** → **A card's class sets its tiers**, **Stars**, **Stars get dearer by tier**, **Star bar** and its copy-cost default, **Star dust** prices, **The tier's power step**, **Rarity matters** → **Tier matters** (the user's 2026-11-10 intent kept: a higher tier is always worth having; `scripts/sim/tiers.ts`), **Weapon identities** ("at the same rarity" → tier), **Star fill in the shard shop**, **Next tier preview**, **Tier-up costs** and **Cores of the new dungeons** (no Prismatic → T6 step), **Base damage**, **Weapon panel** (end notes), **An Heirloom card** ("the rarity of its lean side" → its side), **Saves keep their Heirlooms** stays; add **Saves keep their cards** (the conversion above).
- **§5 Rank visuals / Enhancements:** the base frame text (rarity word, level colour, the detail title's "rarity and job line"); **Earlier and wider** and the enhancement default (scaled by tier).
- **§6** Card health ("rarity, level, rank").
- **§7** Pulls, Rarer summons, Focus Portal details, **Card Portal rates**, Hard pity, Wishlist and its default, Reveal (Wardrobe Gate, Legacy Gate and Heirloom Gate stay).
- **§10** Hidden weapon circles (last skill), Quest list, shard prices. **§13** summon reveal sound per tier. **§14** Pacing intent wording, the milestone table rows First Epic / First Legendary, the sim player's choices, Tier names keep their milestones, Common Folk.
- **§16 Open questions:** one line per `[Default]` of the table above, plus the three Q answers until the user gives them; remove the lines that no longer apply (the Leviathan cards' "share of their rarity's portal chance", the Heirloom rarity lines, star copy costs per rarity).
- **§17 Changelog:** one dated line: roster by tier, with the user's quote.

### Other docs

- `docs/PROJECT_OVERVIEW.md`: Project shape (save format 39 and what it does, the new fixture, `sim/tiers.ts`), Workers, Collection, Loadouts (cost), Level/XP/stars/tiers, Weapon look, Enhancements, Base stats, Bonds, Saves, the Summon and portal entries, quests, challenges, and the Cards, Summon and Gathering page entries.
- `docs/ASSET_RULES.md`: line 86 (T6 "follows the card's side"; the Heirloom "has the rarity of its lean side" → has its side), line 139 **Common look** (rewrite as the Wood look: every weapon starts crude and dull at T1), line 143 **Adding things** (how to add a card: a base card is never added, a T6 card needs `side`), line 177 (`rarities.json` is the cosmetics' and card bodies no longer read it). Lines about cosmetic rarities stay.
- `docs/UI_RULES.md`: §2 Worker blocks (tier colour), Next tier preview, The Summon view (odds and wishlist rows), The reveal show's deal, and its Open questions line 164.

## Order of work

Each step is one PR into `main` unless said otherwise; lint, typecheck, test and build pass on each; no release until step 4 is merged and the user has seen the screenshots.

### Step 1: design first (docs only)

Commit the `docs/DESIGN.md` rewrites above with the answers to Q1 to Q3 (stop and ask the controller if they have not arrived), every rule tagged `[To build]` or `[Differs]` with what the game does today, and the Open questions lines. No `src/` change.

- Check: `npm run lint` (`check-design.mjs`).

### Step 2: one door for rarity reads (no behaviour change)

Add accessors to `src/game/cards.ts` (exported from `src/game/index.ts`) that hide the card's fields, implemented on today's data so every number stays what it is: `cardClass(card)`, `cardSide(card)` (from the rarity for now), `cardTeamBonus(card, tier)` and `cardWorker(card, tier)` (they ignore the tier for now), and one function per rarity-keyed number that takes the card and its owned state (`cardCost`, `cardHealth`, `cardBaseDamage`, `starFillNeeded`, `starDustCost`, `duplicateShards`, `workerRarityPower`, `cardSortRank` for every list sorted by rarity). Move every card reader of the tables above to them; card code no longer touches `card.rarity`, `card.teamBonus` or `card.worker` outside `cards.ts`. Step 3 then changes only what is inside these functions. Add an ESLint `no-restricted-syntax` rule or a test (`tests/noCardRarity.test.ts`, a grep over `src/`) that fails on `.rarity` read from a card outside `cards.ts` and the cosmetic files.

- Tests: the whole suite unchanged and green; the new grep test.
- Sim check: `npm run sim -- --hours 10 --seeds 3` prints the same table before and after.
- PR line: `docs/PROJECT_OVERVIEW.md` Cards entry mentions the helpers.

### Step 3: the roster flip (data, rules, Summon, save 39)

One PR, committed in this order, tests first in each:

1. **Schemas and data:** card schema, `cards.json` (write it with a one-off script from today's file, do not hand-edit 166 entries; delete the script after), `cardRules.json`, `production.json`, `enhancements.json`, `skills.json`, `bonds.json`, `challenges.json`, `achievements.json`, `cosmetics.json` id, `loadContent` checks. Tests: `tests/data.test.ts` (11 base cards, one per type; 89 T6; 22 Heirlooms; no base card with a side; every `teamBonusByTier` / `workerByTier` has the five tiers), `tests/tiersStars.test.ts`, `tests/tierUpNeverWeakens.test.ts` (every card, every tier and star), `tests/weaponIdentity.test.ts` (types within 10% at the same tier), a new `tests/rosterParity.test.ts`: a base card at tier T ★6 has the damage, health, team bonus and worker power the old card of that rarity had at T ★6 (old values pinned in the test).
2. **Card rules:** grade-keyed cost, stats, star bar with copy values, shards, dust, enhancement scale, `maxTier`, T6 cards granted at T6, Common Folk. Tests: `tests/cards.test.ts`, `tests/cardsFromStart.test.ts`, `tests/challenges.test.ts`, `tests/modifiers.test.ts`; a new case: four Prismatic base cards fit the cost cap at account level 1, and two Heirlooms + two T6 need 64.
3. **Workers (Q3):** a base worker on several places. Tests: `tests/workers.test.ts` (the Axe on Oak and Ironbark uses two slots, gives each its power and its tier's ability; a T6 worker cannot be on two places).
4. **Summon:** `portals.json`, `portals.ts`, `summon.ts`, `scrolls.json`, quests (`tier_pulled`, `side_owned`, `summon.pulledTiers`). Tests: `tests/portals.test.ts` (over 200,000 seeded pulls the tier shares match `tierOdds` within 0.3 points and the 11 types are equal; pity at 90 gives Prismatic or T6; a 10-pull holds a Silver or better; a T6 result is a T6 card at T6), `tests/wishlist.test.ts` (a base pull lands on a marked type, a T6 pull on a marked T6 card, the tier shares unchanged), `tests/summon.test.ts`, `tests/quests.test.ts`.
5. **Save 39:** `v38ToV39`, `CURRENT_SAVE_VERSION = 39`, `save.ts` clamp, the fixture and `tests/migrateV39.test.ts` above.
6. **Renderer, the minimum to be right:** `data-grade` / `data-side`, names and labels from the card, the odds table and wishlist rows, the Collection groups, copy. Tests: `tests/cardsAdapter.test.ts`, `tests/summonModel.test.ts`, `tests/weaponModel.test.ts`, `tests/productionStageModel.test.ts`.
7. **Sim:** `scripts/sim/tiers.ts`, the sim player and milestones. Tests: `tests/sim.test.ts`, `tests/simPlayer.test.ts`.
8. **Docs:** DESIGN tags, PROJECT_OVERVIEW, ASSET_RULES, UI_RULES.

- Sim check: `npx tsx scripts/sim/tiers.ts` passes; `npm run sim -- --hours 40 --seeds 20 --profile both` — send the milestone table and pulls per hour against DESIGN §14 to the controller. Rows that miss are the controller's to tune (copy values, star needs, `costCap.perLevel`, tier odds, the re-homed Cores); apply the numbers it sends back in this PR. Do not tune on your own and do not ask the user.
- Run the app on the migrated fixture (hidden, muted) and play ten minutes of the sim's clock with the dev cheats: no error in the log, the team fights, the workers work.

### Step 4: screens the user sees, then merge

Stays on the step 3 branch (or a PR onto it): the looks only, nothing new. Then the screenshots, each at **1280×720 and 1920×1010**, from the real game on (a) a fresh game after two 10-pulls and (b) the migrated `v37-0.7.24` fixture:

1. Collection: the Weapons group (11), the T6 group, the Heirlooms tab.
2. A loadout picker (Loadouts tab, a slot's picker open with the cost bar).
3. Summon: the gates, the Wishlist panel with both rows, and the odds panel.
4. The reveal of a 10-pull holding a Silver or better, and the last hand.
5. A T6 card and an Heirloom on the Cards detail (with the Weapon panel's end note), and a Prismatic base card's detail.
6. The Logging view with the Axe working two trees (Q3).

Put them next to the same screens from 0.7.24 (`design/options/roster-by-tier/`, not merged into `main`) and hand them to the controller for the user's yes. The tier colours on the cards are a `[Default]` the user has not seen: say so with the pictures. Merge only after the yes; then the controller decides the release.

- Check: `node scripts/a11y-audit.mjs` on the changed screens; lint, typecheck, test, build.
- This PR deletes `docs/plans/roster-by-tier.md` and has the PR-description list of every `DESIGN.md` tag it changed.

## Review focus (what is most likely to go wrong)

1. **A save that owns five swords loses power or progress.** Covered by the power rule and the `migrateV39` assertions; check the late-game fixture by hand too.
2. **A team with fewer than four weapon types after the merge** fights with empty slots. The migration fills them; the test asserts no empty slot while an unused fighting card that fits is owned.
3. **A T6 pull for a T6 card already owned** must fill its stars, and past ★6 pay 25 shards, never vanish (`tests/portals.test.ts`).
4. **Cosmetic portals and the Wardrobe still roll and colour by rarity.** `tests/wardrobe*.test.ts`, `tests/legacySkins.test.ts`, `tests/theme.test.ts` must pass untouched; if one needs an edit, the change went too far.
5. **Old migrations** (`migrationTeam.ts`, `v29ToV30` … `v36ToV37`) name removed ids and rarities on purpose. Do not "fix" them; the chain 23 → 39 must still load every fixture in `tests/fixtures/saves/`.
