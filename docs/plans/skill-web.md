# Plan: the Skill Tree as a node web (picks 4a and 4c)

Status: plan, nothing built on top of it yet. Deleted in the PR that implements it (CLAUDE.md). Balance
numbers below are shapes; the sim sets them and the controller approves them.

## What the user picked

"Fewer nodes, each with several levels, paid in materials, now > after on hover", one web from a
centre with four arms (Logging, Mining, Dungeon, Cards), "?" for unknown neighbours, skill points
only for keystones (planning chat, 2026-11-15, and pick 4a). So the tree is a content redesign:
steps 1 (layout) and 2 (economy) are one job. The 165-skill tree cannot be laid out as 4a (a
15-skill branch is 6 deep and 4 wide); a web of about 14 nodes an arm can.

## 1. The web

Rules of shape (so it can never bunch up): a node has one `parent` and a `slot` (`forward`, `up`,
`down`); a child sits exactly one step (140 px) from its parent, forward or at +-60 degrees; an arm is
at most 3 wide and 6 deep, so the four arms never meet (nearest pair of plates across two arms is
198 px). The first node of an arm is one step from the centre. A test lays the whole web out and
fails below 125 px between any two plates. Early save = the root, its forks and the "?" past them,
about 5 known nodes an arm.

Every merged node keeps the total power of the skills it absorbs at max level (small = 5 ranks, large
= 3 ranks at double value, as today), so the tree's share of total power stays what DESIGN §10 says.
Per-level numbers are max total / max level. Max level 6 to 10.

### Logging (left), 13 nodes, absorbs Logging, the logging half of Forge and Workers

| Node                     | One level gives                                        | Max | Absorbs                                         | Place                        |
| ------------------------ | ------------------------------------------------------ | --- | ----------------------------------------------- | ---------------------------- |
| Sharp Saws               | +5.5% output of every tree (Oak 3.45/s -> 3.64/s)      | 10  | Grove Yield, Old Growth                         | root, depth 0                |
| Quick Swing              | +6% strike pace                                        | 8   | Grove Rhythm, Quick Strikes                     | up from Sharp Saws           |
| Heart Strike             | +0.8% harvest crit chance                              | 10  | Keen Strikes                                    | down from Sharp Saws         |
| Wide Groves              | -0.8% level cost growth                                | 8   | Wide Groves, Deep Roots                         | forward                      |
| Grove Bounty             | +1.5 strike power                                      | 8   | Grove Bounty, Heartwood                         | up from Quick Swing          |
| Splitter                 | +0.07 harvest crit damage                              | 8   | Heavy Strikes                                   | down from Heart Strike       |
| Whetstone Hands          | +2.3% tool strength                                    | 8   | Whetstones                                      | forward from Wide Groves     |
| Lucky Swing              | +8% lucky strike payout                                | 6   | Lucky Streak                                    | up from Grove Bounty         |
| Root Diggers             | +8% depth dig rate, +4% layer yield                    | 6   | Deep Diggers, Rich Layers (trees)               | forward from Whetstone Hands |
| Ironbark Rig             | +10% Ironbark output                                   | 6   | new (the one-time Ironbark shelf upgrade stays) | down from Splitter           |
| Moonwillow Rig           | +10% Moonwillow output                                 | 6   | new                                             | forward from Root Diggers    |
| Ancient Grove (keystone) | +25% output of every tree                              | 1   | Ancient Grove                                   | end of the arm               |
| Tireless Crew (keystone) | harvest crit chance never below 20%, +25% worker power | 1   | Tireless Crew                                   | end, other fork              |

### Mining (right), 13 nodes, absorbs Mining, the mining half of Forge and Workers, the Forge

Same shape as Logging with mining names: Vein Cutter (+5.5% output), Quick Strike (pace), Keen Eye
(crit), Deep Seams (+7% level bonus: Deep Levels, Deep Shafts), Hard Strikes (strike power),
Tempered Picks (+2.3% tool strength), Iron Rig, Grotto Rig, Deep Diggers (dig rate, layer yield), and
the Forge folded in as the arm's second fork: Bellows (+4% forge speed), Fine Moulds (+2.4% forge
yield), Thrifty Smelting (+1% refund). Keystones: Heart of the Mountain (+25% output), Alchemist's
Refund (40% of a craft's gems come back, +25% forge speed).

### Dungeon (up), 14 nodes, absorbs Combat, Dungeons, Elements

Might (+1.4% team damage, 10; Might, Warlord, Spark of Insight), Vigor (+3% team health, 10; Vigor,
Bulwark), Keen Eye (+0.6% crit chance, 8), Brutal (+0.05 crit damage, 8), Guard (+1 defence, 6),
Weak Points (-1.2% boss health, 6), Trophy Hunter (+3% stage chest, 8; Trophy Hunter, Hoard), Battle
Scars (+3% star damage, 8; Battle Scars, Veteran), Spoils of War (+3% star loot, 6), Attunement
(+3% element bonus, 8; Attunement, Elemental Surge), Ward (-3% element malus, 8; Ward, Warded Soul),
Living Earth (+3% element production, 8; Green Thumb, Living Earth). Keystones: Unbroken (+25%
damage), Star Sovereign (stars +100% damage, +50% chest and loot) and Prism Heart (no element malus,
+50% element bonus); three, one per fork.

### Cards (down), 15 nodes, absorbs Collection, Luck, Automation, Ascension, the rest of Workers

Quick Study (+6% card XP, 10; Quick Study, Scholar, Field Notes, Apprentice Notes), Renown (+3%
account XP, 8; Renown, Fame, Wise Return), Deep Pockets (+0.5 loadout cost cap per 2 levels, 4), Crystal
Luck (+3% crystal drops, 8; Crystal Luck, Lucky Find), Rare Luck (+6% rare chance, 8; Rare Luck, Rare
Hunter), Core Luck (+3% material chance, 8; Core Luck, Core Hunter, Cartographer), Pity Sense (-2
summon pity, 1), Trial Focus (+6% trial reward, 8; Trial Focus, Patron), Long Watch (+1 h offline
cap, 4; Long Watch, Long Night, Long Vigil, Vigil of Ages), Starlit Mind (+3% Starlight, 8; Starlit
Mind, Ascendant, Starlit Path, Radiance), Quick Return (-1.2% level cost multiplier, 5; Quick Return,
Fresh Start), Hired Hands (+5% worker power, 6). Keystones: Grand Archive (+25% card XP, +1
expedition slot), Fortune's Favour (+25% rare chance), Eternal Return (+25% Starlight, costs x0.8).

Dropped, with the reason: Tidy Habits (+2% rate, a copy of Sharp Saws), Spark of Insight (a copy of
Might), the second Whetstones/Tempered Picks, Guard stays (it is not a copy). Weapon circles (110
skills, DESIGN §10) are a different system tied to cards; they stay as they are, paid in skill points,
outside the four arms (Open question below).

About 55 nodes and 8 keystones, down from 165 skills.

## 2. Costs

- Each node is paid in one material of its arm, by depth: Logging Oak gems (depth 0 to 1), Ironbark
  (2 to 3), Moonwillow (4); Mining Copper, Iron, Grotto gems the same way; Dungeon Moss, Cinder, Frost,
  Storm Cores (depth 0 to 3, the Core of the dungeon that drops it); Cards Glimmer Dust (depth 0 to 2)
  and Facet Shards (3 and up). Gems and Cores are what the player already earns; Cards pays in what
  also pays card and cosmetic upgrades (competition, see Open questions).
- Cost of level n: `base x growth^(n-1)`, growth 1.35 (a flat 1.35 keeps level 10 about 20 times level
  1), base about 3 minutes of that material's income at the moment the node opens. Aim: with 6 to 10
  nodes open at a time on different materials, one level is nearly always affordable; a node's last
  levels take 10 to 30 minutes. The sim tunes base and growth; the data file holds one pair per node.
- Keystones cost skill points only: 8 each (was 5 in a branch of 15 skills). Skill points are what
  account levels, stage stars and achievements give (about 43 in the first hour, 230 by 40 hours). With
  only 8 keystones (64 points) and the weapon circles (about 110 skills) still on points, the income
  is not too much: it stays for circles and keystones, and Heirloom points are a separate system.
- Nodes past depth 2 open with an Ascension (depth 3 with the first, 4 with the second, keystones with
  the third), as the rings of today.

## 3. Rules that need a default (each [Default] in DESIGN.md plus an Open questions line)

- Respec: node levels are not refunded (materials cannot be); there is nothing to regret in additive
  nodes. Keystones refund their points free once per Ascension, then 5 Starlight, as today's respec.
- Ascension: node levels and keystones are kept (as skill ranks are today); the materials reset as they
  do now, so the web keeps its power and the early nodes are re-paid from nothing only when leveled.
- Migration (save format 38 -> 39): the old `account.skills` of the 11 branches is replaced by `account.web`
  (node id -> level). Each old rank carries over: a new node gets the level that equals the power of the
  absorbed ranks (rounded down, capped at its max); a keystone owned stays; ranks with no node
  (the dropped copies) are refunded as points. Circle skills stay as they are. Nothing is paid in
  materials for a carried level.
- Data: `web.json` (arms, nodes: name, per-level modifiers, max level, parent, slot, cost, ascension
  gate, keystone points), a schema, `game/web.ts` (level, cost, buy, modifiers with source `web`), the
  model and tab on top of it; `heirlooms` untouched.
- Open questions to write: Cards paid in Glimmer Dust and Facet Shards; circle skills staying on points;
  keystone count and cost; levels carried free in the migration; no refund of node levels.

## 4. What the user sees before any PR

Real game screenshots next to 4a-1280 and 4a-1920: an early save (about 5 known nodes an arm), a
mid-game save (about half revealed), and the fully revealed web at 1280x720 and 1920x1010 with pan and
zoom, so "bunched up" cannot come back later. Only after a yes from the user does a PR go to main.
