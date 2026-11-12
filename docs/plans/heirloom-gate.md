# Plan: Heirlooms from their own gate

Heirlooms leave the upgrade ladder and become 22 separate cards pulled from a fourth gate, each with its own shards, stars and skill tree (DESIGN.md §3 Heirloom Scrolls, §5 Heirlooms, An Heirloom card, One model per type from Wood to Gold, §7 Heirloom Gate, §10 Heirloom trees; UI_RULES §2 The Heirloom Gate and the Heirlooms section). The rules are the user's of 2026-11-12; every number here is a Claude `[Default]`, drafted before the number rescale ("Readable numbers") and tuned with the sim after it.

This file is deleted in the PR that builds it.

## Phase 1 (this PR, draft): design, data drafts, previews

- DESIGN.md, UI_RULES.md and ASSET_RULES.md rewritten in place (committed first).
- This plan.
- Previews in `design/options/heirloom-gate/` (not committed): group 1, the Heirloom Gate in the Summon view; group 2, the Heirlooms section of the Cards view with an Heirloom's detail panel and tree. Five each, picked on `pick.html`.

## Phase 2 starts only after the rescale is merged

The planning session sends the word. The rescale changes `cardRules.json`, `dungeons.json`, the migrations and most balance data, and bumps the save format, so phase 2 rebases onto it, takes the next save format and re-reads the scaled numbers before writing any of the data below.

## 1. The Heirloom Gate (data drafts)

`portals.json` gets an `heirloomGate` entry (not a pool of cards: a pull picks one of the 22 Heirlooms).

| Number                 | Draft                                 | Why                                                          |
| ---------------------- | ------------------------------------- | ------------------------------------------------------------ |
| Price                  | 1 Heirloom Scroll a pull (10-pull 10) | Same as every portal (§7 Pulls)                              |
| Whole Heirloom         | 2% a pull                             | "low drop chance"                                            |
| Otherwise              | 5 to 10 shards of one Heirloom        | "everything else it drops is materials for random heirlooms" |
| Which Heirloom         | equal chance among the 22             | random, no wishlist or focus                                 |
| Pity                   | whole Heirloom on the 60th pull       | resets on any whole Heirloom                                 |
| Unlock                 | 30 shards (= one whole Heirloom)      |                                                              |
| Stars ★2 to ★6         | 10, 15, 20, 25, 30 shards (100)       | a whole repeat counts as 30 shards                           |
| Past ★6                | each shard → 10 card shards           | feeds the shard shop (§10)                                   |
| Kept through Ascension | shards, pity, Heirloom Scrolls        | collection, like the other scrolls and pity                  |

A Monte Carlo of these numbers (400 runs, a scratch script): the first Heirloom near pull 22 (mostly from shards), the first ★6 of any Heirloom near pull 200, all 22 unlocked near pull 220. Two other drafts tried: 3 to 6 shards (first ★6 at 302 pulls) and 3% / pity 50 / 40 to unlock (first ★6 at 211, first Heirloom at 15).

### Heirloom Scroll sources (`scrolls.json` `heirloom`)

| Source                                       | Amount                                 |
| -------------------------------------------- | -------------------------------------- |
| First win of a Nightmare last-floor boss     | 5 (6 bosses: 30)                       |
| Each later Nightmare last-floor boss kill    | 0.004 (about 1 an hour of farming one) |
| Every 10th endless depth, first time reached | 1                                      |
| Mythic stage star chest on Nightmare         | 3 per stage                            |
| Each Ascension from the third on             | 2                                      |

Target for the sim: the first scroll near the first Nightmare clear (24 h target), the first Heirloom by about 40 h, an Heirloom at ★6 by 200 h at most (§14 A maxed weapon), so about 200 pulls in the first 200 hours. The 0.004 a kill and the chest sizes are the levers.

## 2. An Heirloom card's stats

Heirloom cards are 22 new entries of `cards.json` with `heirloom: true` (an Heirloom field set: `heirloomOf: { kind, side }`) and the rarity of their side. They sit at the fixed tier `heirloom` (it stays in `RANK_TIERS` as the tier of Heirloom cards only; no ladder card reaches it).

| Thing                 | Draft                                                         |
| --------------------- | ------------------------------------------------------------- |
| Rarity                | Mythic or Void by side (base damage and health ×12 of Common) |
| Loadout cost          | 18 (Mythic/Void 14)                                           |
| Level cap             | 140                                                           |
| `statTier.heirloom`   | ×6,260 = 529 (T6) × 3.5 (★6) × 3.38 (Lv 120)                  |
| `power.tier.heirloom` | ×7 (card effects)                                             |
| Stars                 | ×1.25 to ×3.5 like every card                                 |
| Enhancement budget    | 16                                                            |
| Main ability          | its type's Mythic card's (interval, signature)                |
| Support               | +25% damage and a +15% second bonus                           |
| Duel skill            | its type's, until the tree's capstone changes it              |

So a fresh Heirloom (★1 Lv 1) is as strong as a maxed Mythic or Void weapon (T6 ★6 Lv 120), and a maxed Heirloom (★6 Lv 140) is ×3.5 × 3.78 ≈ ×13 that, about ×3.4 the old Heirloom ★6. If the sim shows the top running away, the first lever is a smaller per-level step for Heirlooms (`power.perLevelHeirloom`), not a lower start.

Elements (Claude): Solaris Fire, Kingsoath Light, Skypiercer Storm, Sunrider Light, Lumen Fang Light, Worldforge Fire, Starweaver Light, Lifebloom Nature, Graceharvest Nature, Heartdelver Crystal, Elderwarden Nature; Nightfall Void, Grimhowl Void, Abyss Thorn Storm, Doomrider Void, Nightsting Void, Grave Anvil Earth, Umbral String Void, Soulwell Void, Last Breath Void, Deepmaw Earth, Rotfeller Void.

## 3. The 22 Heirloom trees (`heirloomTrees.json`)

Every tree: Root (1 point) → Small A and Small B (1 each) → Large A after Small A and Large B after Small B (2 each) → Capstone after either Large (3). 10 points in all; points: one per star and one at Lv 35, 70, 105 and 140. All values one rank. Stats are `STATS` of `src/data/schemas.ts`; "skill" means a new entry in `skills.json` built only from the fields it has today (`guard`, `signature.kind` strike or heal with `share`, `damage`, `health`, `weaken`). Fighting trees act while the Heirloom is in the fighting loadout; pickaxe and axe trees at the place it works. ⚠ marks a node that needs a rule the game does not have.

| Heirloom (type, side)        | Tree         | Root              | Small A              | Small B            | Large A                  | Large B                            | Capstone (unique)                                                                                                          |
| ---------------------------- | ------------ | ----------------- | -------------------- | ------------------ | ------------------------ | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Solaris (sword, M)           | Sunforged    | +8% damage        | +2% crit chance      | +10% health        | +0.3 crit damage         | +15% health                        | **High Noon**: +50% element bonus (`element.bonus`) and +3 signature power (`burst.power`)                                 |
| Nightfall (sword, V)         | Duskblade    | +8% damage        | +2% crit chance      | +0.25 crit damage  | +15% damage              | +15% health                        | **Eclipse**: skill = Cleave that also weakens the enemy 20% at full damage (`weaken` 0.2, `damage` 1)                      |
| Kingsoath (greatsword, M)    | Royal Oath   | +8% health        | +8% damage           | +2 signature power | +20% health              | +3 signature power                 | **Oath of Kings**: skill = guard (hit first) with ×1.4 health                                                              |
| Grimhowl (greatsword, V)     | Wolfblood    | +8% damage        | +2 signature power   | +0.25 crit damage  | +15% damage              | +20% gauge fill                    | **Howl**: skill = glass cannon, ×1.6 damage and ×0.6 health                                                                |
| Skypiercer (spear, M)        | Skyward      | +2% crit chance   | +8% damage           | +0.25 crit damage  | +3% crit chance          | +0.5 crit damage                   | **Heaven's Reach**: +12% crit chance and +1 crit damage                                                                    |
| Abyss Thorn (spear, V)       | Undertow     | +2% crit chance   | +8% damage           | +10% health        | +15% damage              | +0.5 crit damage                   | **Abyssal Pierce**: no element malus (`element.resist` set 0) and +25% element bonus                                       |
| Sunrider (lance, M)          | Dawnride     | +10% health       | +8% damage           | +10% health        | +20% health              | +15% damage                        | **Dawn Charge**: skill = guard whose signature heals every standing card 25%                                               |
| Doomrider (lance, V)         | Doom March   | +10% health       | +8% damage           | +2 signature power | +20% health              | +4 signature power                 | **Doom Charge**: skill = guard with ×1.25 health, and +10 signature power                                                  |
| Lumen Fang (dagger, M)       | Glintstep    | +10% gauge fill   | +8% damage           | +2% crit chance    | +20% gauge fill          | +0.3 crit damage                   | **Flash Step**: +100% gauge fill (the dagger's gauge fills four times as fast)                                             |
| Nightsting (dagger, V)       | Venom Kiss   | +8% damage        | +10% gauge fill      | +0.25 crit damage  | +3% crit chance          | +15% damage                        | **Venom**: skill = Flurry that weakens the enemy 15% at full damage, and +0.5 crit damage                                  |
| Worldforge (hammer, M)       | Forgeheart   | +10% health       | +2 signature power   | +8% damage         | +20% health              | +4 signature power                 | **Anvil of Worlds**: skill = guard with ×1.5 health                                                                        |
| Grave Anvil (hammer, V)      | Gravetoll    | +8% damage        | +2 signature power   | +10% health        | +4 signature power       | +15% damage                        | **Grave Toll**: +15 signature power (the hammer's ×30 becomes ×45)                                                         |
| Starweaver (bow, M)          | Star Loom    | +0.25 crit damage | +2% crit chance      | +8% damage         | +0.5 crit damage         | +20% stage star damage             | **Constellation**: stage star damage +100% and stage star loot +50% (`stars.damage`, `stars.loot`)                         |
| Umbral String (bow, V)       | Shadowdraw   | +0.25 crit damage | +8% damage           | +2% crit chance    | +1 crit damage           | +3% crit chance                    | **Shadow Volley**: +3 crit damage (the bow's ×5 crit becomes ×8)                                                           |
| Lifebloom (staff, M)         | Evergreen    | +10% health       | +10% gauge fill      | +8% damage         | +20% health              | +20% gauge fill                    | **Full Bloom**: skill = Mend that heals every standing card 50% (it heals 30%)                                             |
| Soulwell (staff, V)          | Soul Cistern | +10% gauge fill   | +8% damage           | +10% health        | +15% damage              | +20% gauge fill                    | **Soul Drain**: skill = Hex that weakens the enemy 30% at full damage (Hex weakens 20% at 80%)                             |
| Graceharvest (scythe, M)     | Gleaning     | +8% damage        | +10% material chance | +2% crit chance    | +20% material chance     | +0.3 crit damage                   | **Harvest of Grace**: +50% material chance and +25% material amount                                                        |
| Last Breath (scythe, V)      | Final Hours  | +2% crit chance   | +8% damage           | +0.25 crit damage  | +15% damage              | +0.5 crit damage                   | ⚠ **Last Breath**: double damage to an enemy under 20% of its HP (new rule). Fallback: +10% crit chance and +1 crit damage |
| Heartdelver (pickaxe, M)     | Deep Heart   | +10% output       | +20% dig rate        | +2% harvest crit   | +30% dig rate            | +15% layer yield                   | **Heart of the Mountain**: dig rate ×2 (`depth.digRate` +100%) and +25% layer yield                                        |
| Deepmaw (pickaxe, V)         | The Maw      | +10% output       | +3% harvest crit     | +20% lucky payout  | +0.5 harvest crit damage | +40% lucky payout                  | **Bottomless**: lucky strikes pay double (`lucky.payout` +100%) and +10% harvest crit chance                               |
| Elderwarden (logging axe, M) | Old Rings    | +10% output       | +20% card XP         | +10% strike speed  | +20% output              | +20% growth rate (`depth.digRate`) | **Eldest Ring**: +60% output and +25% worker power at its tree                                                             |
| Rotfeller (logging axe, V)   | Rot Feast    | +10% output       | +3% harvest crit     | +10% strike speed  | +0.5 harvest crit damage | +20% gauge fill                    | **Rot Feast**: harvest bursts give 20 s of output (`burst.power` set 20; Elder Treant's give 15)                           |

Notes on the trees:

- Every node but one uses a stat or a skill field the game has today. The one flagged node (Last Breath's capstone) needs a new duel rule; it ships with its fallback unless the user wants the new rule.
- The capstones that change the duel skill (Nightfall, Kingsoath, Grimhowl, Sunrider, Doomrider, Nightsting, Worldforge, Lifebloom, Soulwell) add one entry each to `skills.json`, given to that Heirloom by its capstone in place of its type's skill. `skills.json` maps skills by card today (`cards`), so the tree adds a conditional mapping: the Heirloom's own skill while its capstone is bought.
- The fighting nodes act on the whole team through the pipeline, like the weapon circles; the duel's per-card skill is the Heirloom's own.
- Sizes: a full tree is worth roughly a fighting card's five enhancements, so it never outweighs the Heirloom's own ×13 stat jump. The sim checks the share.

## 4. Build plan (phase 2)

### Data and schemas

- `src/data/schemas.ts`: card schema gains `heirloomOf: { kind, side }` (an Heirloom card); `RANK_TIERS` keeps `heirloom` as the tier of Heirloom cards; `tierUp` loses the `mythic` step; `CIRCLE_STEPS` keeps four steps, the last one `{ step: 'heirloom', tier: 'mythic', stars: 6 }` (a `stars` field on `circleSteps`); new `heirloomTreesSchema`, `heirloomGateSchema` (in `portals.json`), `scrolls.json` `heirloom`; items schema drops `heirloomOpen`. A card with its own picture or name below Prismatic is refused (One model per type from Wood to Gold).
- `src/data/content/`: `cards.json` +22 Heirloom cards (names = the Heirloom names of `items.json`), the 45 extra cards keep `heirloomArt` / `heirloomName` renamed `ownArt` / `ownName` (shown at T6); `cardRules.json` drops `tierUp.mythic`, `levelCaps.heirloom` stays (Heirloom cards), `statTier.heirloom` 6,260, `starBar.needs` / `dust` lose the ladder's Heirloom entries, cost gains Heirloom 18, the Void Core moves to `tierUp.prismatic`; `account.json` `circleSteps` last step at Mythic ★6; `enhancements.json` budget unchanged; `portals.json` `heirloomGate`; `scrolls.json` `heirloom`; `resources.json` `heirloom_scroll` (kept on Ascension); new `heirloomTrees.json` (22 trees); `skills.json` nine capstone skills; `achievements.json` First Heirloom, Heirloom ★6, all 22 unlocked (scroll and star dust rewards); `items.json` drops `heirloomOpen`.
- `src/data/index.ts`: load and cross-check the trees (one per Heirloom, ids, requires), the gate, the Heirloom cards against `items.json` names and pictures.

### Game logic

- `src/game/cards.ts`: `cardTopTier`, `nextTierOf`, `RARITY_TIER_CAP` stop at `mythic`; `heirloomTierUps` and the `heirloom` tier-up moment go; `cardItem` shows an Heirloom card's own item and a card's own T6 weapon (`ownArt`, `ownName`) at `mythic`; Heirloom star-ups by shards (`heirloomStarUp`).
- New `src/game/heirlooms.ts`: gate pull (`pullHeirloomGate`, odds, pity, shards, unlock, stars, overflow to card shards), Heirloom tree (points, buy, respec, modifiers of source `heirloom`, the capstone skill).
- `src/game/summon.ts`, `portals.ts`: the fourth gate and its reveal plan.
- `src/game/modifiers.ts` (`collectModifiers`): Heirloom tree modifiers while the Heirloom is at work.
- `src/game/duel.ts`: the Heirloom's capstone skill in place of its type's.
- `src/game/account.ts` `weaponCircles`: steps can need stars.
- `src/game/stageStars.ts`, `floors.ts`, `prestige.ts`: Heirloom Scroll sources.
- `src/game/state.ts`, `save.ts`, `migrations.ts`: state `heirlooms: { shards, pity, trees }`; new save format with the migration of DESIGN §5 Saves keep their Heirlooms; `save.ts` clamp at 665 to 683 no longer treats Heirloom as a ladder step.
- `src/game/migrationTeam.ts` (`RANK_ORDER`), `goals.ts` (tier names, a goal "Heirloom shards"), `report.ts` (`heirloom` tier-up kind goes; a new `heirloomUnlocked` moment), `wardrobe.ts` (skins: an Heirloom card keeps its art; a card's own T6 weapon is not skinned), `dev.ts` (cheats: Heirloom shards and scrolls instead of the Heirloom tier), `index.ts` exports.

### Renderer

- `pages/summon.ts`, `summon.css`, `summonModel.ts`: the gate deck in the picked layout.
- `pages/cards.ts`, `cards.css`, `cardsModel.ts`, `cardsAdapter.ts`: the Heirlooms section, detail panel and tree in the picked layout; the Next tier preview stops at T6.
- `pages/weaponModel.ts`: no "Reveal" step; the T6 ★6 message; the Heirloom card's shard line.
- `pages/progressionModel.ts`, `stage/tierUp.ts`, `copy.ts`: the Heirloom moment becomes "unlocked" from the gate.
- `art/items.ts`: `itemArt` draws a card's own T6 picture; Heirloom cards draw `item-<type>-hm|hv`.
- `art/frame.ts`, `ui/card.ts`, `art/vector/frame.ts`: Heirloom frames stay for Heirloom cards.
- `stage/reveal.ts`: shard results in the reveal.

### Sim, tests, docs

- `scripts/sim/sim.ts`: the sim player pulls the gate, buys trees, and the maxed weapon is an Heirloom ★6; 200 h run of 2 seeds for §14 A maxed weapon, 40 h of 20 seeds for the bands.
- `scripts/demo-progression.mjs`: the Heirloom moment.
- Tests to change: `tiersStars`, `heirloomCards`, `stages`, `weaponModel`, `data`, `skillTree`, `dev`, `cardsAdapter`, `cards`, `legacySkins`, `progressionModel`, `treeContent`, `sim`, `migrations`, `lookSteps`, `enhancements`, `damageFromCards`, `cardsFromStart`. New: `heirloomGate.test.ts` (odds over many pulls, pity, unlock, stars, overflow, Ascension keeps), `heirloomTrees.test.ts` (points, paths, modifiers only at work, capstone skill), `migrations` (an Heirloom-tier card becomes T6 ★6 plus its Heirloom card; two cards to one Heirloom), `oneModel.test.ts` (no card art or name below Prismatic).
- `docs/PROJECT_OVERVIEW.md` rewritten for every system touched; DESIGN tags move to `[Built]`; this file deleted.

## 5. Where the old Heirloom tier is wired today

Found with a search for "heirloom" in `src/`, `scripts/` and `tests/` at release 0.7.5:

- `src/data/schemas.ts`: `RANK_TIERS` (`heirloom`, line 437), items `heirloom` names and `heirloomOpen` (495 to 498), card `heirloomArt` / `heirloomName` (520), tier tables keyed by every tier (563), `tierUp` (565, 655), `levelCaps` (601), `CIRCLE_STEPS` (1555).
- `src/data/index.ts`: tier loops (936), Heirloom name and picture checks (973 to 999).
- `src/data/content/cardRules.json`: `levelCaps.heirloom` 140, `power.tier.heirloom` 7, `power.statTier.heirloom` 1,852, `tierUp.mythic` (the Heirloom step: 100M Money, Frost, Void Cores, gems), `starBar.needs.*.heirloom`, `starBar.dust.*.heirloom`.
- `src/data/content/enhancements.json`: `budget.heirloom` 16.
- `src/data/content/account.json`: `circleSteps` `heirloom` step and the 11 circles' `*_heirloom` keystones.
- `src/data/content/items.json`: `heirloom` names and `heirloomOpen` for 11 types.
- `src/data/content/cards.json`: 45 cards with `heirloomArt` / `heirloomName`.
- `src/game/cards.ts`: `RARITY_TIER_CAP`, `TIER_LABELS`, `itemName` (heirloom case), `cardItem` (`heirloom` flag), `weaponLookRarity`, `heirloomTierUps`, `cardTopTier` (`heirloomOpen`), `nextTierOf`, the tier-up check (718) and the tier-up result (844).
- `src/game/save.ts`: rank clamp (665 to 683). `src/game/migrations.ts` (55). `src/game/migrationTeam.ts` `RANK_ORDER`. `src/game/goals.ts` tier names. `src/game/report.ts` `heirloom` tier-up kind. `src/game/wardrobe.ts` skins stop at the Heirloom tier (413 to 422). `src/game/dev.ts` Heirloom tier cheat (153). `src/game/index.ts` exports and comments. `src/game/account.ts` `weaponCircles` (tier-only steps).
- Renderer: `art/items.ts` (`TIER_ART`, `itemArt` heirloom case, `cardArt`), `art/frame.ts` and `art/vector/frame.ts` (Heirloom frames), `art/pixel/manifest.ts` (frame entries), `ui/card.ts` (Heirloom shown with the Prismatic band), `pages/cardsAdapter.ts` (preview walks to the Heirloom), `pages/cardsModel.ts` (`heirloom` step flag), `pages/weaponModel.ts` ("Reveal <name>" step), `pages/progressionModel.ts` (Heirloom moment), `stage/tierUp.ts` (Heirloom reveal), `copy.ts` (995, 1140, 1318).
- Scripts: `scripts/sim/sim.ts` (2481 maxed weapon, 3202 report), `scripts/demo-progression.mjs`.
- Tests: `tiersStars` (38 mentions), `heirloomCards` (24), `stages` (17), `weaponModel` (8), `data` (7), `skillTree` (6), `dev` (5), `cardsAdapter` (5), `cards` (5), `legacySkins` (4), `progressionModel` (3), `treeContent` (2), and one each in `sim`, `migrations`, `lookSteps`, `enhancements`, `damageFromCards`, `cardsFromStart`.
