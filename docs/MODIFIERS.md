# Modifier system

Every tunable number in the game goes through one pipeline (DESIGN.md §14), so balancing means editing data. Code: `src/game/modifiers.ts`. Stats and data shape: `STATS` and `modifierSchema` in `src/data/schemas.ts`.

## A modifier

```json
{ "stat": "production.rate", "kind": "percent", "value": "5", "scope": { "job": "logging" } }
```

- **stat**: one of `STATS` (production rate, damage, boss HP, drop chance, card drop chance, pity, portal amount, portal multiplier (base 1; a fraction rounds up with that chance so the average is exact), material chance and amount, burst interval / size / fill / power, special dungeon rewards, offline cap, XP, loadout cost cap, summon pity, cost multiplier, cost growth, mine level bonus).
- **kind** and the fixed order they apply in:
  1. `flat`: added (all flats summed)
  2. `percent`: all percents summed, then applied once (`"5"` = +5%)
  3. `mult`: each one multiplies
  4. `set`: replaces the value (last one wins)
  5. `min`: floor (the highest floor applies)
  6. `max`: cap (the lowest cap applies, and a cap beats a floor)
- **scope** (optional): `job`, `producer`, `resource`, `dungeon` (dungeons and special dungeons), `portal`. Every key given must match where the stat is read; no scope means it applies everywhere. Unknown ids fail validation.

## Sources

`collectModifiers(state, content)` gathers every active modifier with its source (`cosmetic`, `set`, `skill`, `enhancement`, `card`, `prestige`, `achievement`, `mastery`). Today it reads:

- owned cosmetics (`ownedModifiers` in `cosmetics.json`), worn or not;
- fully equipped sets (`modifiers` in `sets.json`);
- cards in the three loadouts (`cardModifiers` in `src/game/cards.ts`): the main card's `main` modifiers plus the job's `mainGrowth` from `cardRules.json`, and each support card's `support` modifiers. Card modifiers carry a `scale` (`full` grows with the card's power from level, stars and tier; `none` stays fixed; default `full` for flat and percent, `none` otherwise);
- mastery (`masteryModifiers` in `src/game/mastery.ts`, DESIGN.md §4/E3): the `perTier` bonuses in `progression.json`, each value multiplied by the settled tier. Gem mastery is scoped to the gem (`resource`), boss and special dungeon medals to the `dungeon`. Source id = the gem or dungeon id. Tiers settle on the 1 s play-time grid like card levels, so splitting time never changes totals.
- Starlight shop (`prestigeModifiers` in `src/game/prestige.ts`, DESIGN.md §9): each shop item's `perLevel` modifiers in `prestige.json`, each value multiplied by the level bought. Source kind `prestige`, id = the shop item id.

New systems add their modifiers inside `collectModifiers`; callers never change.

### Stats of the skill tree (balance update)

Some stats are read where the system already has its modifiers: `worker.power`, `depth.digRate` and `depth.yield` (`workSites`, scope job and producer), `lucky.payout` (`luckyFactor`), `forge.speed`, `forge.yield` and `forge.refund` (`forge.ts`), `stars.damage` and `stars.loot` (`stageDamageFactor`, `stageLootFactor`, scope dungeon) and `stars.chest` (`stageChest`). Four act on the finished list at the end of `collectModifiers` (`strengthen`): `tool.strength` (scope job) scales what the tool lines give, and `element.bonus`, `element.resist` and `element.production` scale the `element` modifiers (a bonus, a malus, a worker's +15%). They read only the skills' own modifiers, so a `set` on `element.resist` removes the malus.

A weapon circle skill (`account.json` `circles`) is added to the list only while a card of its item type is at work, scoped to the worker's place for the pickaxe and logging axe.

## Reading a stat

- `computeStat(stat, base, modifiers, context)` returns the value plus the modifiers that applied, in order, for tooltip breakdowns.
- `statValue(...)` returns only the value.
- Game helpers that already use it: `producerRate`, `curvePrice` (mine and tree levels), `treeUnlockCost`, `baseDamage`, `damageStat` / `effectiveDamage`, `bossMaxHp`, `effectiveDrops`, `burstStats`, `trialRewards`, `offlineCapMs`, `loadoutCostCap`, `cardDropChance`, `fightingXpPerKill` / `fightingXpPerSecond` / `productionXpPerUnit` (`xp.card`), `starUpCost` / `tierUpCost` (`cost.multiplier`).
- Prices: exponential prices read `cost.growth` for the growth factor: its modifiers act on the part above 1 (a −10% cut turns ×1.2 into ×1.18) and together take at most half of it (`effectiveGrowth`, `MAX_GROWTH_CUT`), so a price always grows; then every price is scaled by `cost.multiplier` (base 1, never below 0) and rounded up. Both get the job, producer and resource in their context.

## Adding a stat

Add it to `STATS` with a comment saying which scope keys it reads, then read it with `statValue` where the number is used. Clamp in the caller when a stat has natural limits (chances 0..1, counts at least 1).
