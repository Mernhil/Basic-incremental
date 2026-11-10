# Plan: fast fights, smoother curves, rarer summons

Approved by the user in the home chat on 2026-11-10. This is the first of three plans. It writes every decision from that chat into `docs/DESIGN.md`, then builds the pace and economy retune on today's boss fights. Plan 2 (card stats, weapon identities, elements) and plan 3 (floors, normal enemies, stage stars) follow later from their own home chats, because both need UI and art options first.

## Why

The v0.4.2 sim (seed 1, 12 h) showed the game is too slow and too steep:

- **Fights are too long and never dangerous.** The first Root Warden kill takes about 23 min (about 550 DPS against 760,000 HP). At 12 h the Mossy Cellar boss would need about 25 h to knock the loadout out, and only the Frostspire Vault is a real fight (834 s per kill against 1,098 s to fall).
- **Costs outrun output.** Trees and mines cost ×1.3 to ×1.34 per level but add only +10% of base output (×2 every 25 levels). Between level 25 and 50 the cost grows about 700 times while output barely triples.
- **The ladders jump unevenly.** Boss HP goes 760k → 800k → 11M. Tier-up Money goes 150k → 3M → 30M → 150M.
- **Summons are too generous.** About 22 pulls an hour and about 9.6% Epic or better per pull, so better rarities don't feel special.
- **No Silver card in 12 h** against the 1.5 h target.
- **The 56 new fighting cards (#146) are still waiting** for their balancing pass. This plan is that pass.

## Step 1: write the decisions into `docs/DESIGN.md`

Commit this before any code (CLAUDE.md rule 5). Rewrite each rule where it lives, add the changelog line in §17, and list every `[Default]` below under §16 Open questions.

### Decisions by the user (2026-11-10)

**§6 Fight pace (built in this plan).** Fights are short and both sides bleed:

- A loadout that matches the dungeon kills its boss in about 15–30 s.
- A loadout that is too weak falls in about 10–20 s.
- Bosses are no longer HP walls that cannot hurt you.

**§6 Floors pace (`[To build]`, plan 3).** On floors, a normal wave dies in a few seconds and a mini-boss in about 15–30 s.

**§6 Stage stars (`[To build]`, plan 3).** This rewrites the Boss mastery rule.

- **What gets stars:** every boss floor, meaning each mini-boss and the last-floor boss.
- **How stars are earned:** ★1 to ★4 come from kill counts. ★5 is a challenge, a kill with no knockout inside a time limit.
- **What each star gives:** better loot on that stage and a one-time crystal chest. These chests are how the player gets many crystals at once.
- **Kept through Ascension.**
- **Completion:** a stage map shows every stage's stars, with achievements for fully starred dungeons and star totals.
- **Mastery's damage bonus:** today's +5% damage per medal tier carries over as a bonus per star.

**§6 Normal enemies (unchanged).** They keep their small crystal drops (the 2026-11-09 decision, confirmed).

**§4 Production curves (built in this plan).** These follow the classic idle shape:

- Level cost growth drops to about ×1.07–1.15.
- More milestone multipliers (×2–×3) keep income close to prices.

**§3, §5, §6 Ladders (built in this plan).** Each ladder grows at one steady rate:

- **Enemy HP:** about ×1.12 per floor once floors exist. Between dungeons, the same steady rate replaces today's jumps.
- **Purses:** follow the same rate.
- **Tier-ups:** cost about the same amount of play time at each step.

**§7 Summons (built in this plan).** The rates go down and so do the crystal drops, landing near 12–15 pulls an hour and about one Epic every 2 h. Legendary pity at 90 and the 10-pull Rare guarantee stay.

**§14 Pacing targets (built in this plan).** The first Ascension stays at 8 h, and the hours before it get paced so every rarity step feels earned.

**§5 Rarity matters (built in this plan).** A higher rarity must always be worth having. A fresh card of a higher rarity beats a fresh card of a lower one, and cards keep different stats by rarity (base damage and health, `cardRules.json`) and by weapon type. The retune must not flatten these gaps.

**§6 Attack animation follows hit speed (built in this plan).** The attack animation's speed follows the main card's hit interval, so a dagger swings fast and a hammer swings slowly.

**§5 Show the stats (`[To build]`, plan 2).** Every card shows DPS, health, hit speed and crits, plus a compare line against the equipped card.

**§5 Weapon identities (`[To build]`, plan 2).** Each weapon type has its own shape, built only from mechanics combat already has: signature strength, gauge speed, crit chance, crit damage and health. Stuns, life steal, full-health bonuses and new elemental effects are out.

**Elements (`[To build]`, plan 2).** Elements move from §15 into §6, decided rather than proposed.

### Defaults Claude fills (`[Default]`, list in §16)

**Pacing targets.** Replace the §14 table with these (active play):

| Milestone                     | Target   |
| ----------------------------- | -------- |
| First summon                  | 5–10 min |
| First dungeon cleared         | 15 min   |
| First Silver card             | 1 h      |
| First Epic                    | 1.5–2 h  |
| Dungeon 2 cleared             | 1.5 h    |
| First Gold card               | 4 h      |
| First Legendary               | 4–5 h    |
| First ★6 (a Gold ★6)          | 7 h      |
| First Ascension               | 8 h      |
| Dungeon 3 cleared             | 12 h     |
| Glimmer Trial cleared         | 15 h     |
| First max-level cosmetic      | 20 h     |
| First Prismatic card          | 25 h     |
| Beta content mostly exhausted | 40 h     |

"First Epic" and "First Legendary" are new sim milestones. "First enemy killed in 2 s" waits for floors in plan 3.

**Card Portal rates.** Each rarity's chance is split equally among its 11 cards, as today.

| Rarity    | Now         | New   |
| --------- | ----------- | ----- |
| Common    | about 45%   | 53.2% |
| Uncommon  | about 30%   | 28%   |
| Rare      | about 15.5% | 13%   |
| Epic      | about 6%    | 4%    |
| Legendary | about 2.25% | 1.5%  |
| Mythic    | about 0.9%  | 0.2%  |
| Void      | about 0.45% | 0.1%  |

**Knockout.** Drops from 30 s to 10 s, so a lost fight costs little time and the next try comes quickly.

**Exact numbers.** Growth rates, milestone multipliers, boss HP and attack, purses, crystal drops and tier-up Money are tuned with the sim inside the ranges above, and the final values are written into the rules.

**Weapon identity table** (written as `[To build]` for plan 2). The hit intervals and signature multipliers are the ones #146 already set. Because each hit is worth DPS × interval, hit speed alone does not change damage; the identity comes from signature, gauge, crits and health. Plan 2 balances the types so that, at the same rarity, their total power is within about 10% of each other.

| Weapon     | Hits every | Identity                                      |
| ---------- | ---------- | --------------------------------------------- |
| Sword      | 1 s        | Balanced                                      |
| Spear      | 0.8 s      | High crit chance                              |
| Scythe     | 1 s        | Medium crit chance and crit damage            |
| Bow        | 1.2 s      | Highest crit damage, lowest health            |
| Staff      | 1.4 s      | Gauge 1.5×, so the signature comes more often |
| Lance      | 1.5 s      | Signature ×20, high health                    |
| Greatsword | 2 s        | Signature ×15, heavy hits                     |
| Hammer     | 3 s        | Signature ×30, highest health                 |
| Dagger     | 0.5 s      | Gauge ×2, low health                          |

## Step 2: the retune (code and data)

1. **Bosses.**
   - Retune `dungeons.json` HP and attack so the sim's loadout kills each boss in about 15–30 s once it is ready for that dungeon. Bosses hit often enough that a loadout which is too weak falls in about 10–20 s.
   - Keep the current clear counts (1 / 10 / 90) until plan 3 replaces them.
   - Recheck the "You fall in" readout and the slam pattern at the new pace.
2. **Knockout.** Change it to 10 s in `combat.json`.
3. **Production.** Retune tree and mine level costs and milestones (`trees.json`, `mines.json`), plus the upgrade shelf if it has the same problem.
4. **Purses, wage and tier-up Money.** Put them on steady ladders that match the new kill rate. Tier-up Money is in `cardRules.json` `tierUp`.
5. **Summons.**
   - Change `portals.json` to the new rates.
   - Retune crystal drops (`dungeons.json`) together with the account-track and achievement crystal rewards to about 12–15 pulls an hour.
   - Recheck the star bar copy counts against the rarer pulls.
6. **Sim.**
   - Add the "First Epic" and "First Legendary" milestones.
   - Set the new targets.
   - Run `npm run sim -- --hours 40 --seeds 5` until every median is within about 25% of its target.
   - Report the table in the PR. A target that cannot hold is a question for the user, not an edit.
7. **Rarity gaps.**
   - Check with the sim, or a small table in the PR, that at every point a fresh card of a higher rarity outdamages and outlasts a fresh card of a lower one.
   - Check that the star steps still land where the rule says, with a maxed Common about equal to a fresh Legendary.
   - Report the base damage and health per rarity.
8. **Attack animation speed.**
   - In the stage (`src/renderer/src/stage/director.ts` and the attack animation player), play each attack animation over a share of the main card's hit interval, so its speed follows the interval.
   - Clamp it to a readable range, so a 0.5 s dagger isn't a blur and a 3 s hammer isn't a slow crawl.
   - Keep reduced motion as it is today.
   - This changes existing animation timing only and adds no new UI. Read `docs/UI_RULES.md` before touching the stage.
9. **Saves.** The changes are data only, so no save format change is expected. If one turns out to be needed, bump the version and add a migration (rule 9).
10. **Docs.**

- Rewrite the tags of every rule this builds (`[To build]` → `[Built]` or `[Default · in game]`).
- Update `docs/PROJECT_OVERVIEW.md`.
- Delete this plan doc in the same PR.

## Out of scope

- **Plan 2:** the card stats UI and compare line, elements, and each weapon type's own stat shape (the identity table above). Until then, cards already differ by rarity, and this plan keeps those gaps.
- **Plan 3:** floors, normal enemies, stage stars, the new clear rule.
- **No new UI and no art** in this plan. The only on-screen change is the attack animation speed (step 2.8).

## Done when

- `npm run lint`, the tests and the build pass.
- The sim table is on target.
- One run confirms a boss falls in about 15–30 s and a weak loadout gets knocked out.
- In the same run, a dagger visibly swings faster than a hammer.
- The PR lists the `DESIGN.md` tags it changed.
