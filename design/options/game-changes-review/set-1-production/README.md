# Review gate, set 1: Production screen (5 options)

Open `index.html` from disk (no server needed). Tabs A to E, each with a one-line trade-off and a "pick hint" list at the top. The mocks are live: the x1 / x10 / x100 / Max toggle recomputes every price and rate, and strikes animate (add `?still` to the URL to freeze it).

Data is real (trees.json, mines.json, upgrades.json, cards.json, rarities.json); the save is invented: Oak Lv 56, Ironbark Lv 27, Copper Quarry Lv 38, Iron Deeps Lv 12 unlocked, Moonwillow (2,000 Ironbark Gem) and Crystal Grotto (Clear Ember Crypt) locked, Money 1.83M. Sprites are the real baked tiles (growth stage = floor(level / 25)) and cards at whole scales.

| Option | Layout | Production card | Shelf | Motion |
| --- | --- | --- | --- | --- |
| A Ledger | one column, two job panels, 84 px rows | head of each job: full card at 1x with supports and gauge | below, three-column chips | strike sweeps down the rows, "+n" pops |
| B Two-up | Logging and Mining side by side, 76 px rows | one-line text chip on each job title (no art) | inline chips under each row, global ones in a strip | calm pulse and gauge tick |
| C Side stage | rows left, sticky stage right | side stage: card at 2x, lunging | bottom drawer (like the Dungeons floors drawer) | card lunges, "+n" on the row |
| D Big tabs | tabs Logging / Mining / Upgrade shelf, 152 px rows with 2x tiles | pinned strip on top (weapon at 1x, gauge, supports) | its own tab with a count badge | coins fly to the Money counter |
| E Tile board | per job a band: card at 1x, then one tall tile card per kind (tile at 2x) | first cell of the band | always-open right rail | tile hops, "+n" above it |

Screenshots: `A-ledger.png`, `B-two-up.png`, `C-side-stage.png`, `D-big-tabs.png`, `E-tile-board.png`, plus `C-side-stage-drawer-closed.png`, `D-big-tabs-mining.png`, `D-big-tabs-shelf.png`, `A-ledger-max-mode.png`.

Notes: E bends "one row per kind" into tiles (flagged on the page). Prices use the suffix format (the default scientific format would show 4.81e7 for 48.07M). The two locked kinds are Moonwillow (price) and Crystal Grotto (dungeon), because mines unlock by clearing a dungeon, not by a price.
