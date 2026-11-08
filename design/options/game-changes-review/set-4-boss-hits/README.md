# Set 4: Boss hits (review gate, mockups only)

Open `index.html` from disk. The page animates the fight on one clock for all five options: five light hits (0.4x), the wind-up, the slam (4x), then the pale trailing segment catching up. Controls: boss (Root Warden: you fall first; Glacier Colossus: you survive; Glimmer Trial: never attacks), pace (Demo 1.4 s hits, or Real, the boss's own rhythm with a 1.5 s wind-up), pause and a timeline scrubber. Player hits are left out so the boss's rhythm stays readable.

Numbers: Glacier Colossus 30 per 6 s gives 12 and 120 against 825 base health (100+150+225+350). Root Warden 1 per 10 s gives 0.4 and 4 against 100 health: time-to-kill 17 min 22 s against 100 health lasting 16 min 40 s. The Glacier DPS (190,000) is illustrative.

| Option | Wind-up | Chunk | Readout |
| --- | --- | --- | --- |
| A The boss charges | Boss rears back, red glow and a "!" mark, then lunges | Plain pale trailing segment, holds then slides | Fourth tile "You fall in", red when it falls first |
| B Ground marker | Red zone fills the floor under the party with "Slam in 0.8 s" | Bar notched in slam-sized blocks; the lost block turns hatched and crumbles | Race bars (boss falls in / you fall in) with the gap written out |
| C Screen edge pulse | Red vignette pulses at the edges, faster toward the hit, then a flash | The lost piece detaches and falls off the bar | Top banner, only when red: "You fall in 16m 40s, 42 s before the boss does" |
| D Bar pre-flash | The slam's slice of the health bar lights up in hazard stripes with a countdown | Ember trail, hot orange cooling to pale, white edge at impact | Line under the bar: "Knocked out in 16m 40s, before the boss (17m 22s)" |
| E Countdown ring | Ring beside the boss: five light segments fill one by one, the long red slam segment fills in the wind-up | Pale segment slides off fast, a "-120" label rises, the bar jolts | Stacked in the Time to kill tile: second line "You fall in 16m 40s" |

Screenshots per option: `-1-windup`, `-2-slam-impact`, `-3-trailing-segment` (Glacier Colossus), `-4-readout-root-warden` (red state in place), `-5-readout-states` (red, neutral, none side by side).
