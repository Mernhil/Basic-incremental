# Save fixtures

Real save files, kept exactly as the game wrote them, for the migration tests.

- `v23-dev-tools.save.txt`: save format 23, written by the 0.5.3 game code after its dev cheats
  (5M Money, Ember Squire at Wood ★6 Lv 20, Mossy Cellar and Ember Crypt cleared) and ten minutes
  in the Mossy Cellar (70 boss kills, the bronze medal, a boss part-way down).
- `v25-dev-tools.save.txt`: save format 25, written by the 0.5.5 game code after its dev cheats
  (5M Money, 3,000 Summon Crystals, Ember Squire at Wood ★6 Lv 20, Apprentice Feller at ★3,
  Mossy Cellar cleared and farmed on its boss floor), one 10-pull and ten minutes of play
  (78 boss kills, part-filled logging and mining gauges).
- `v26-0.6.0.save.txt`: save format 26, written by the 0.6.0 game code (release commit 7a6c9ef)
  after its dev cheats (5M Money, 3,650 Summon and 950 Glamour Crystals, Ember Squire at Wood ★6
  Lv 20, Mossy Cellar cleared), one 10-pull and ten minutes in the Ember Crypt (Mossy Cellar
  pushing, Ember Crypt farming after a knockout, the autobuyer reserve at 25%).
- `v27-removed-cosmetics.save.txt`: save format 27 for the cosmetics cleanup (format 28). It is the
  0.6.0 fixture above carried to format 27 by the real migrations, with removed cosmetics added to
  it the way a 0.7.2 player could hold them: owned and worn attack, finish, tick, number and Prism
  Pointer items (global and on two cards), Aurora Veil at level 3, and the bow skins
  `legacy-bow-56` and `legacy-bow-58` owned (56 worn). It was made by a script, not by the game.
