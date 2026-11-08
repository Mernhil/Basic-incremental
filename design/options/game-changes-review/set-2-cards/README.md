# Review gate, set 2: Cards on screen (5 options)

Open `index.html` from disk. Tabs A to E, each with a one-line trade-off and a pick-hint list at the top. A "Preview state" bar (B to E) switches between the collection and its detail view; click any card to select or open it.

Everything on the card is real: the frame sprites (bronze to prismatic), the 100 x 120 item sprites, the rarity body colours, and the text of the 12 beta cards from cards.json (main and support effects, cost by rarity, level caps by tier). The collection state is invented (mixed tiers and stars, two unfound cards). The detail card is Dawnblade Regent (greatsword, Legendary, Gold star 3). The card is built on the 132 x 186 grid and only drawn at 1x, 2x or 3x with nearest-neighbour; text is real browser text sized per scale.

| Option | Compact card | Detail card | Stats |
| --- | --- | --- | --- |
| A Full card, 1x | the full card at 1x, four across | side panel, card at 2x | on the card |
| B Half-grid mini | 66 x 93 mini (item at 50 x 60) with a text name strip | modal, card at 3x | tooltip on hover or focus |
| C List rows | row with a half-scale thumbnail, no card art | full page, card at 3x | in the row columns, both effects as text |
| D Window card | item at 1x on its rarity colour in a flat tier border, name under it | drawer over the grid, card at 2x | pips and one line under the tile |
| E 2x showcase | the full card at 2x, three across | spotlight band above the grid, card at 3x | as text under each card |

Screenshots: `A-full-card-1x.png`, and for B to E a `-collection.png` and a `-detail.png` each.

Notes: the half-size art in B and C is illustrative (the baked sprites sampled at 50%); a real mini would need its own bake from the pixel-art agent. E is tall because 12 cards at 2x need four rows.
