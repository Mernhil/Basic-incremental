# UI check log

## 2026-11-27 — commit fe58afed — scope: all (hub, dungeon, 15 views) — viewed by running the app

How: dev app hidden and muted (profile `uicheck`), save fixture `tests/fixtures/saves/v38-0.7.25.save.txt`, shots at 1920x1080 and 1280x720 in `design/options/ui-check-all/`, contrast sweep (`scripts/lib/contrast.mjs`) and a DOM probe (clipped text, small targets, unlabeled controls) per screen. Screens eyeballed: hub, dungeon, forest, cards, summon, wardrobe, shop, settings, ascension, training, upgrades. The rest (mine, skills, achievements, forge, expeditions, raids) were probed only.

Counts (CSS in `src/renderer/src`, 59 files): 387 distinct hex colours (+100 distinct `rgba()`), 85 distinct `font-size` values (about 40 computed sizes at runtime), 50 distinct padding/margin/gap lengths, 23 distinct `border-radius` values, 88 distinct `box-shadow` values, 5 `font-family` declarations (3 variables).

| #   | Finding                                                                                                                     | Status                            |
| --- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 1   | Training ground: plain leftover look, 19 px buttons, native selects, duplicate title and line, does not fill                | open                              |
| 2   | Upgrades: Logging and Mining panels are empty with no empty-state line (`views/meta/upgradesView.ts:20-28`)                 | open                              |
| 3   | Silver card names 2.41:1 contrast in the Cards grid (15 cards) and the dungeon hand                                         | open                              |
| 4   | Shop price digit 1.54:1 (`.shop-price__txt`, dark on dark)                                                                  | open                              |
| 5   | Screens that do not fill the area under the header: Settings, Training, Shop, Cards detail gutter                           | open                              |
| 6   | Wardrobe tile names truncated or touching the tile edge (5 names)                                                           | open                              |
| 7   | Buttons 16–20 px high (summon type chips 16, `px-btn` 19, cp-select 22)                                                     | open                              |
| 8   | Card text 8 / 8.5 px (`theme/base.css:431,435,622`) against the 11 px floor in UI_RULES                                     | open                              |
| 9   | Camp tile focus ring removed, only a background change (`views/gathering/camp.css:115-118`)                                 | open                              |
| 10  | "Not unlocked" shown in the green gain colour (Ascension, Lasting Training)                                                 | open                              |
| 11  | Copy "empty slot + pick a tool" (`views/gathering/copy.ts:8`)                                                               | open                              |
| 12  | 1203 of 2414 pixel PNGs are byte-identical copies (`art/pixel/hand` vs `sprites`, badge variants)                           | open (bundle effect not measured) |
| Q   | UI_RULES.md still describes the table, dock, Carved Oak and three Shop counters; the code is the hub with charcoal and gold | question for the user             |

### Fixes (branch ui/ui-check-fixes, user: "Fix all but Training", 2026-11-27)

| #   | Status           | What changed                                                                                                                                                                           |
| --- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | won't fix (user) | Training ground left as it is                                                                                                                                                          |
| 2   | fixed            | Upgrades builds one panel per board group: the dead Logging and Mining panels are gone                                                                                                 |
| 3   | fixed            | silver and bronze card names use dark ink (`theme/base.css`): sweep 15 low-contrast names to 0                                                                                         |
| 4   | fixed            | affordable Shop price chip wears the gold action piece and ink (`theme/shellGold.css`)                                                                                                 |
| 5   | partly fixed     | Settings fills the view height. Cards (1700 px cap) and Shop (760 px column) need a layout decision: widening them blew the cards and tiles up to 3 per row, so both stay as they were |
| 6   | fixed            | Wardrobe tile names wrap to two lines                                                                                                                                                  |
| 7   | fixed            | `.px-btn`, `.button`, `.shop-cancel`, `.cp-select` are at least 24 design px high                                                                                                      |
| 8   | partly fixed     | the `hits every` line takes the 11 px floor; the 8 px tier and level line stays (11 px made PRISMATIC run off the card)                                                                |
| 9   | fixed            | camp tiles show a gold focus ring                                                                                                                                                      |
| 10  | fixed            | "Not unlocked" reads muted, not green                                                                                                                                                  |
| 11  | fixed            | "Empty slot: pick a tool"                                                                                                                                                              |
| 12  | open             | duplicate PNGs: deleting art files needs the user's call                                                                                                                               |
