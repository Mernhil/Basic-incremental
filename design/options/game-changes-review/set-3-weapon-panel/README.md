# Set 3: Weapon panel (review gate, mockups only)

Open `index.html` from disk. The state chips at the top flip every mock between: mid level, max level with the tier-up affordable, max level but unaffordable, Gold to Prismatic (Frost Sigils missing), star bar full, Unique available, a weapon with no Unique (Bulwark) and fully upgraded. Each option is shown in the dungeon drawer (replacing the damage lines) and in the Cards page detail.

Built with the real Light Stone theme tokens, the bundled Outfit font and the baked sprites (copied into `assets/`). Names, caps (20/40/60/80/100), the XP curve, the star table, star impact, tier power and the tier-up materials come from `src/data/content`. Placeholders: the Money price of every tier-up and every Unique cost (not in the data yet), and the XP amounts.

| Option | One line |
| --- | --- |
| A Slim strip | Three lines in one box (level and XP, star bar, tier-up row); costs are chips that only appear at the cap. Smallest. |
| B Weapon sheet | A framed sheet with the weapon, a five-dot tier ladder, level, six-star bar with a partial star and the next tier's full cost table, always visible. Largest. |
| C Tabs | Level, Stars and Tier tabs, a gold dot on the tab that has an action, opens on the one that matters. One job per view. |
| D On the weapon | XP ring around the weapon, level badge, star pips and tier plate on the art; only the action and a cost tag sit beside it. Feels like the game, needs the most art work. |
| E Forge popover | A one-row summary plus a Forge button; the popover shows the current weapon next to the next tier's new look, the costs and the action. Two clicks. |

Screenshots: `<option>-1-mid-level.png`, `-2-max-tierup-affordable`, `-3-max-tierup-unaffordable`, `-4-unique-available`, `-5-no-unique-weapon`, plus `extra-B-star.png` (star bar full) and `extra-B-sigil.png` (Gold to Prismatic with Frost Sigils).
