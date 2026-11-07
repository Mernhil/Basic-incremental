"""Build the one-page options sheet (index.html) with every draft embedded as a data URI."""
import base64
import html

from b1_starlight import OPTIONS as B1_OPTS  # noqa: F401
from b2_verdant import OPTS as B2
from b3_b4_exclusives import B3, B4
from b5_b7_misc import B5, B7, BRANCHES, KIND_NAMES, KINDS
from px import HERE, OUT, SPRITES

_cache = {}


def uri(path):
    p = str(path)
    if p not in _cache:
        data = open(p, "rb").read()
        kind = "gif" if p.endswith(".gif") else "png"
        _cache[p] = f"data:image/{kind};base64," + base64.b64encode(data).decode()
    return _cache[p]


def img(path, w, h, s, alt="", cls="px"):
    return f'<img class="{cls}" src="{uri(path)}" width="{w * s}" height="{h * s}" alt="{html.escape(alt)}">'


def card(base, top, item, s, name, job, rarity, extra="", power="12.4K"):
    iw, ih = 100 * s * 3 // 4, 120 * s * 3 // 4
    cx, cy = (35 + 149) / 2 * s, (66 + 158) / 2 * s
    return f'''<div class="card" style="--s:{s};width:{183 * s}px;height:{237 * s}px">
  <img class="px" src="{uri(base)}" alt="">
  <img class="px item" src="{uri(SPRITES / (item + '.png'))}" alt="" style="width:{iw}px;height:{ih}px;left:{cx - iw / 2:.0f}px;top:{cy - ih / 2:.0f}px">
  <img class="px" src="{uri(top)}" alt="">
  <span class="t name">{name}</span><span class="t job">{job}</span>
  <span class="t lab l1">Power</span><span class="t lab l2">Tick</span>
  <span class="t val v1">{power}</span><span class="t val v2">1.0s</span>
  <span class="t rar">{rarity}</span>
  {extra}
</div>'''


def petals(path, n=6, seed=0):
    spots = [(20, 30, 40, 150), (150, 26, -30, 160), (60, 20, 26, 170), (120, 40, -20, 140), (10, 90, 50, 110), (165, 80, -46, 120)]
    out = []
    for i, (x, y, dx, dy) in enumerate(spots[:n]):
        out.append(f'<img class="px petal" src="{uri(path)}" alt="" style="left:calc({x}px*var(--s));top:calc({y}px*var(--s));--dx:{dx};--dy:{dy};animation-delay:-{(i * 1.37 + seed) % 6:.2f}s;animation-duration:{5.5 + (i % 3) * 0.9:.1f}s">')
    return "".join(out)


def motes(path):
    spots = [(14, 30), (168, 34), (20, 222), (162, 218), (40, 26)]
    return "".join(
        f'<img class="px mote" src="{uri(path)}" alt="" style="left:calc({x}px*var(--s));top:calc({y}px*var(--s));animation-delay:-{i * 0.7:.1f}s">'
        for i, (x, y) in enumerate(spots))


def amb(frames):
    return "".join(f'<img class="px amb" src="{uri(f)}" alt="" style="animation-delay:{i * 1.2:.1f}s">' for i, f in enumerate(frames))


def fig(inner, cap):
    return f'<figure>{inner}<figcaption>{cap}</figcaption></figure>'


def option(letter, title, line, body):
    return f'''<article class="opt" id="{letter}">
<header><span class="letter">{letter[-1]}</span><div><h3>{title}</h3><p>{line}</p></div></header>
<div class="opt-body">{body}</div></article>'''


sections = []

# ---------- B1 ----------
b1_lines = {
    "A": ("Silver star coin", "Approved coin rim in moon silver, one faceted four-point star in pale gold. Closest to the gem coins."),
    "B": ("Night coin", "Rim recoloured night indigo with the gold ring kept, a starry well and a five-point gold star."),
    "C": ("Bare star", "No coin: an eight-point faceted star with the white sticker ring. Its silhouette never reads as a gem coin."),
    "D": ("Prismatic coin", "The Prismatic-tier rim with a moonlit lilac star. Reads as the step beyond Prismatic."),
    "E": ("Constellation coin", "Gold rim, a dark well with five linked stars. Ties to the constellation skill tree; weakest at small size."),
}
header_strip = lambda k: f'''<div class="hdr"><img class="px" src="{uri(OUT / f'b1/starlight-{k}.png')}" width="48" height="48" alt="">
<b>1,284</b><span>Starlight</span></div>'''
opts = []
for k, (t, l) in b1_lines.items():
    p = OUT / f"b1/starlight-{k}.png"
    body = fig(img(p, 48, 48, 1, t), "1x") + fig(img(p, 48, 48, 2, t), "2x") + fig(img(p, 48, 48, 3, t), "3x") + fig(header_strip(k), "beside the count, 1x")
    opts.append(option(f"B1-{k}", t, l, body))
sections.append(("B1", "Starlight icon", "The Ascension currency, in the header and the Starlight shop. 48 x 48, built on the approved coin rims (ink, sticker ring, rim metal, dark well).", "".join(opts)))

# ---------- B2 ----------
b2_lines = {
    "A": "Three broad leaves fan out of each corner; dew drops and lime sprigs, an emerald, then a pale green halo and pink petals. Finish: a leaf-vein lattice.",
    "B": "A thin vine runs along the corner band and curls into a spiral outside the edge; dew pearls as gems. Finish: hanging vines. Lightest touch.",
    "C": "Fern fronds sweep past the corner, gold fiddleheads as the accent, an amber gem. Finish: dappled sunlight with gold pollen.",
    "D": "Chunky moss cushions on the corners with two cream mushrooms; emerald pebbles. Finish: moss creeping up the window. The most toy-like.",
    "E": "A brown twig with leaves, pink blossoms as the accent, a rose gem in the crook. Finish: a faint blossom print. The warmest palette.",
}
opts = []
for k, o in B2.items():
    d = OUT / "b2" / k
    big = card(d / "card-L5-base.png", d / "card-L5-top.png", "item-maul-epic", 2, "Elder Treant", "Logging", "Prismatic", petals(d / "petal.png"))
    smalls = "".join(fig(card(d / f"card-L{l}-base.png", d / f"card-L{l}-top.png", "item-maul-epic", 1, "Elder Treant", "Logging", "Prismatic"), f"L{l}") for l in (1, 3))
    rows = []
    for slot, w, h, s in (("attack", 0, 0, 0), ("tick", 64, 34, 2), ("numbers", 48, 14, 2), ("table", 96, 48, 2), ("cursor", 22, 24, 3)):
        cells = []
        for l in (1, 3, 5):
            if slot == "attack":
                cells.append(f'<img class="px gif" src="{uri(d / f"attack-L{l}_preview.gif")}" width="128" height="128" alt="">')
            else:
                cells.append(img(d / f"{slot}-L{l}.png", w, h, s, f"{slot} L{l}"))
        rows.append(f'<div class="slot"><span class="slot-name">{slot.capitalize()}</span>' + "".join(f'<div class="cell">{c}<small>L{l}</small></div>' for c, l in zip(cells, (1, 3, 5))) + "</div>")
    body = f'<div class="cardrow">{fig(big, "L5 (max): petals drift, at 2x")}<div class="stack">{smalls}</div></div><div class="slots">{"".join(rows)}</div>'
    opts.append(option(f"B2-{k}", o["name"], b2_lines[k], body))
sections.append(("B2", "Verdant Reverie set", "The whole set on Elder Treant at Prismatic (the rank that wears both border and finish), then its five global items. Shown as a Legendary set (max level 5): L1 shape, L2 accent, L3 gems, L4 glow, L5 drifting petals. Flourishes stay in the corner zones, reach at most 10 px past the edge, tuck under the frame's corner sockets and never enter the stars band.", "".join(opts)))

# ---------- B3 ----------
b3_lines = {
    "A": "Heartwood crescents cradle each corner, silver inlay, moonstones at the tips. Reads as a halo split into four moons.",
    "B": "Silver-barked moonwood branches fork out of the corners like antlers, gold leaves, moonstones at the forks.",
    "C": "Growth rings: quarter-arcs of heartwood rings around each corner, gold inner rings, one moonstone at the heart.",
    "D": "A luna moth rests on each corner, pink eye spots and gold dots, a moonstone body. The most animal-like.",
    "E": "A thin moon-silver arc with laurel leaves, a gold crescent, pink gems. The lightest, closest to a real halo.",
}
opts = []
for k, o in B3.items():
    d = OUT / "b3" / k
    big = card(d / "card-L5-base.png", d / "card-L5-top.png", "item-bow-mythic", 2, "Moonwood Dryad", "Logging", "Prismatic", motes(d / "mote.png"))
    ladder = "".join(fig(card(d / f"card-L{l}-base.png", d / f"card-L{l}-top.png", "item-bow-mythic", 1, "Moonwood Dryad", "Logging", "Prismatic"), f"L{l}") for l in (1, 2, 3, 4))
    body = f'<div class="cardrow">{fig(big, "L5 (max): moonlit motes fade in and out, at 2x")}<div class="ladder">{ladder}</div></div>'
    opts.append(option(f"B3-{k}", o["name"], b3_lines[k], body))
sections.append(("B3", "Heartwood Halo", "Card-exclusive border for Moonwood Dryad, worn from Prismatic 6 stars. Mythic, so five levels: shape, accent (moon silver and gold), moonstones, glow, ambient motes. The tier crest and all six sockets stay on top.", "".join(opts)))

# ---------- B4 ----------
b4_lines = {
    "A": "Concentric rings around the gauntlet; L6 sends a pulse outward ring by ring.",
    "B": "Branching power veins from the core, hot violet roots and node sparks; L6 runs light along the veins.",
    "C": "A hex lattice that grows from the core outward, a faceted core gem; L6 lights the hexes in waves.",
    "D": "Wavy magma strata across the lower window, ember gems in the seams; L6 lets heat specks rise.",
    "E": "Dotted rays from a star-cut core behind the gauntlet; L6 turns the rays half a step back and forth.",
}
opts = []
for k, o in B4.items():
    d = OUT / "b4" / k
    big = card(d / "card-L6-base.png", d / "card-L6-top.png", "item-gauntlet-exotic", 2, "Core Titan", "Mining", "Prismatic",
               amb([d / "amb" / f"frame_{i:02d}.png" for i in range(3)]))
    ladder = "".join(fig(card(d / f"card-L{l}-base.png", d / f"card-L{l}-top.png", "item-gauntlet-exotic", 1, "Core Titan", "Mining", "Prismatic"), f"L{l}") for l in (1, 2, 3, 4, 5))
    body = f'<div class="cardrow">{fig(big, "L6 (max): the pulse, at 2x")}<div class="ladder">{ladder}</div></div>'
    opts.append(option(f"B4-{k}", o["name"], b4_lines[k], body))
sections.append(("B4", "Core Pulse", "Card-exclusive finish for Core Titan, worn from Prismatic 6 stars. Exotic, so six levels: shape, more shape, violet accent, core gems, glow, ambient pulse. The finish sits under the item and the text, and stays out of the stars band.", "".join(opts)))

# ---------- B5 ----------
b5_lines = {
    "A": "Iron and brass: riveted brackets, stamped numerals, a steel slash with a brass core.",
    "B": "Carved wood and twine: twine-bound corners, carved numerals, a wood-shaving cut.",
    "C": "Ink and silver: compass-star corners, silver numerals, a comet slash in starlight blue.",
    "D": "Candy enamel: gumdrop corners, candy numerals, a pink ribbon swipe with a blue core.",
    "E": "Runestone: carved stone corner blocks, rune-green highlights, a stone cleave with a glowing core.",
}
opts = []
for k, o in B5.items():
    d = OUT / "b5" / k
    n = o["names"]
    cards = "".join(fig(card(d / f"card-L{l}-base.png", d / f"card-L{l}-top.png", "item-pickaxe-common", 1, "Cave Digger", "Mining", "Common", power="210"), f"{n[0]} L{l}") for l in (1, 2))
    items = (fig(img(d / "numbers-L1.png", 50, 16, 2) + img(d / "numbers-L2.png", 50, 16, 2), f"{n[1]} L1, L2")
             + fig(img(d / "attack-L1.png", 64, 64, 2) + img(d / "attack-L4.png", 64, 64, 2), f"{n[2]} L1, L4")
             + fig(img(d / "tick-L1.png", 56, 30, 2) + img(d / "tick-L4.png", 56, 30, 2), f"{n[3]} L1, L4"))
    opts.append(option(f"B5-{k}", o["name"], b5_lines[k], f'<div class="cardrow"><div class="stack h">{cards}</div><div class="items">{items}</div></div>'))
sections.append(("B5", "Common and Epic loose items", "Proposed pool so the Wardrobe Gate can roll Common and Epic: a Common border and Common numbers (max 2: shape, then a twinkle), an Epic attack and Epic tick (max 4: shape, accent, gem and glow, ambient sparks). The style options below set the look for all four; names follow the style.", "".join(opts)))

# ---------- B6 ----------
b6_lines = {
    "A": ("Die-cut", "The glyph alone with a thick white sticker edge, like a real die-cut sticker."),
    "B": ("Round badge", "A domed disc in the category colour with a lit rim, the glyph on top."),
    "C": ("Shield crest", "A two-tone heraldic shield with a gold edge; pairs with the Knight plate frame."),
    "D": ("Postage stamp", "A perforated white stamp edge around a coloured field; the book reads as a stamp album."),
    "E": ("Holo seal", "A scalloped seal with a rainbow rim; the most prized look, close to the Prismatic language."),
}
order = ["harvest", "kill", "slayer", "six", "prism", "owl"]
opts = []
for k, (t, l) in b6_lines.items():
    d = OUT / "b6" / k
    cells = "".join(fig(img(d / f"{kd}.png", 48, 48, 2, KIND_NAMES[KINDS.index(kd)]), KIND_NAMES[KINDS.index(kd)]) for kd in order)
    cells += fig(img(d / "locked.png", 48, 48, 2, "Locked"), "Not earned yet")
    opts.append(option(f"B6-{k}", t, l, f'<div class="grid6">{cells}</div>'))
sections.append(("B6", "Achievement stickers", "Sticker style for the 25 achievements in the sticker book (A10 C). 48 x 48, one glyph per achievement, colour by category (production green, combat red, stars gold, cards violet, night blue). Six examples plus a not-earned sticker.", "".join(opts)))

# ---------- B7 ----------
opts = []
b7_lines = {
    "A": "A round brilliant cut set in a bronze cup, like the gem coins. Calm, heavy, very readable.",
    "B": "A hexagon cut in a silver bezel; the tree reads as a honeycomb of sockets.",
    "C": "A bare rhombus gem, white sticker ring only when owned. The lightest, most star-like.",
    "D": "A five-point star cut with a bright ridge on each point, the approved medal shape.",
    "E": "A kite cut held by four gold prongs; reads as jewellery.",
}
for k, o in B7.items():
    d = OUT / "b7" / k
    rows = ""
    for name, _ in BRANCHES:
        rows += f'<div class="branch"><span>{name}</span>' + "".join(img(d / f"{name.lower()}-{st}.png", 24, 24, 2, f"{name} {st}") for st in range(3)) + "</div>"
    body = f'''<div class="cardrow"><div class="branches"><div class="branch head"><span></span><small>Locked</small><small>Open</small><small>Owned</small></div>{rows}</div>
<div class="stack">{fig(img(d / "keystone.png", 32, 32, 2), "Keystone, 32 px")}{fig(img(d / "chart.png", 200, 120, 2), "Card enhancement star chart (Summoning colour), 2x")}</div></div>'''
    opts.append(option(f"B7-{k}", o["name"], b7_lines[k], body))
sections.append(("B7", "Skill tree nodes and star chart", "Faceted gem nodes for the radial constellation (A8 A), one colour per branch, in three states, plus the card enhancement star chart where owned links are solid and open links dashed. 24 px nodes, 32 px keystones.", "".join(opts)))

nav = "".join(f'<a href="#{sid}">{sid} {html.escape(t)}</a>' for sid, t, _, _ in sections)
body = "".join(f'<section id="{sid}"><div class="sec-head"><h2><span>{sid}</span> {html.escape(t)}</h2><p>{intro}</p></div><div class="opts">{inner}</div></section>' for sid, t, intro, inner in sections)

page = f'''<title>Beta Art Check-in</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@500;700&family=Outfit:wght@400;600;800&display=swap">
<style>
/* Layout: one long night table; each item is a section of five numbered options, art first, one line of text each. */
:root {{
  --table:#15121f; --felt:#1e1a2c; --tile:#2a2233; --line:#3a3350; --ink:#efe9ff; --muted:#a9a0c4; --gold:#f2c230;
  --display:'Pixelify Sans','Outfit',system-ui,sans-serif; --body:'Outfit','Segoe UI',system-ui,sans-serif;
  color-scheme:dark;
}}
body {{ background:var(--table); color:var(--ink); font-family:var(--body); font-size:15px; line-height:1.5; }}
.wrap {{ max-width:1240px; margin:0 auto; padding-left:max(16px, env(safe-area-inset-left, 0px)); padding-right:max(16px, env(safe-area-inset-right, 0px)); padding-block:32px 64px; }}
h1 {{ font-family:var(--display); font-size:40px; line-height:1.1; margin:0 0 8px; color:var(--gold); }}
.lede {{ max-width:68ch; color:var(--muted); margin:0 0 20px; }}
nav {{ display:flex; flex-wrap:wrap; gap:8px; margin-bottom:24px; }}
nav a {{ color:var(--ink); text-decoration:none; background:var(--felt); border:1px solid var(--line); padding:4px 10px; border-radius:4px; font-size:13px; }}
nav a:hover, nav a:focus-visible {{ border-color:var(--gold); outline:none; }}
section {{ margin-top:48px; }}
.sec-head h2 {{ font-family:var(--display); font-size:28px; margin:0 0 4px; text-wrap:balance; }}
.sec-head h2 span {{ color:var(--gold); font-family:var(--body); font-weight:800; }}
.sec-head p {{ max-width:80ch; color:var(--muted); margin:0 0 16px; }}
.opts {{ display:grid; gap:16px; }}
.opt {{ background:var(--felt); border:1px solid var(--line); border-radius:6px; padding:16px; min-width:0; }}
.opt header {{ display:flex; gap:12px; align-items:flex-start; margin-bottom:12px; }}
.letter {{ font-family:var(--display); font-size:28px; line-height:1; color:var(--table); background:var(--gold); width:40px; height:40px; display:grid; place-items:center; border-radius:4px; flex:none; }}
.opt h3 {{ margin:0; font-size:18px; font-weight:800; }}
.opt header p {{ margin:2px 0 0; color:var(--muted); max-width:90ch; }}
.opt-body {{ display:flex; flex-wrap:wrap; gap:16px; align-items:flex-end; overflow-x:auto; }}
figure {{ margin:0; display:flex; flex-direction:column; gap:6px; align-items:flex-start; }}
figcaption, small {{ color:var(--muted); font-size:12px; }}
.px {{ image-rendering:pixelated; image-rendering:crisp-edges; display:block; max-width:none; }}
.cardrow {{ display:flex; flex-wrap:wrap; gap:20px; align-items:flex-start; }}
.stack {{ display:flex; flex-direction:column; gap:12px; }}
.stack.h {{ flex-direction:row; flex-wrap:wrap; }}
.ladder {{ display:flex; flex-wrap:wrap; gap:12px; align-items:flex-end; }}
.card {{ position:relative; flex:none; }}
.card > img {{ position:absolute; left:0; top:0; width:100%; height:100%; }}
.card > img.item, .card > img.petal, .card > img.mote {{ width:auto; height:auto; }}
.card .petal {{ width:calc(7px*var(--s)) !important; animation:drift 6s steps(18) infinite; }}
.card .mote {{ width:calc(5px*var(--s)) !important; animation:blink 3.4s steps(4) infinite; }}
.card .amb {{ opacity:0; animation:pulse 3.6s steps(1) infinite; }}
@keyframes drift {{ from {{ transform:translate(0,0); opacity:1; }} 85% {{ opacity:1; }} to {{ transform:translate(calc(var(--dx)*1px*var(--s)),calc(var(--dy)*1px*var(--s))); opacity:0; }} }}
@keyframes blink {{ 0%,100% {{ opacity:0; }} 50% {{ opacity:1; }} }}
@keyframes pulse {{ 0% {{ opacity:1; }} 33% {{ opacity:0; }} }}
@media (prefers-reduced-motion: reduce) {{ .card .petal, .card .mote {{ animation:none; }} .card .amb {{ animation:none; opacity:0; }} .card .amb:first-of-type {{ opacity:1; }} }}
.t {{ position:absolute; font-family:var(--body); color:#f4efff; white-space:nowrap; line-height:1; pointer-events:none; }}
.name {{ left:calc(39px*var(--s)); top:calc(49px*var(--s)); font-weight:800; font-size:calc(8.5px*var(--s)); }}
.job {{ right:calc(38px*var(--s)); top:calc(50px*var(--s)); font-size:calc(7px*var(--s)); color:#d6cfe8; }}
.lab {{ top:calc(166px*var(--s)); font-size:calc(6.5px*var(--s)); color:#cfc6e4; }}
.val {{ top:calc(176px*var(--s)); font-size:calc(11px*var(--s)); font-weight:800; }}
.l1, .v1 {{ left:calc(40px*var(--s)); }} .l2, .v2 {{ left:calc(96px*var(--s)); }}
.rar {{ left:calc(37px*var(--s)); top:calc(203px*var(--s)); font-size:calc(7px*var(--s)); font-weight:600; color:#9ff0ff; }}
.slots {{ display:grid; gap:10px; width:100%; }}
.slot {{ display:flex; flex-wrap:wrap; gap:16px; align-items:center; background:var(--tile); padding:8px 12px; border-radius:4px; }}
.slot-name {{ width:72px; font-weight:600; }}
.cell {{ display:flex; flex-direction:column; gap:4px; align-items:flex-start; }}
.items {{ display:flex; flex-wrap:wrap; gap:16px; }}
.items figure > div, .items img {{ display:inline-block; }}
.items figure {{ flex-direction:column; }}
.items figure img + img {{ margin-top:6px; }}
.grid6 {{ display:flex; flex-wrap:wrap; gap:16px; }}
.grid6 figure {{ width:110px; }}
.branches {{ display:grid; gap:6px; }}
.branch {{ display:grid; grid-template-columns:96px repeat(3, 48px); gap:10px; align-items:center; }}
.branch.head small {{ text-align:center; }}
.hdr {{ display:flex; align-items:center; gap:6px; background:#0d0b16; border:1px solid var(--line); border-radius:4px; padding:6px 10px; font-variant-numeric:tabular-nums; }}
.hdr span {{ color:var(--muted); font-size:12px; }}
.reply {{ margin-top:56px; background:var(--felt); border:1px solid var(--gold); border-radius:6px; padding:20px; }}
.reply h2 {{ font-family:var(--display); margin:0 0 8px; color:var(--gold); }}
.reply code {{ display:block; font-size:17px; color:var(--ink); background:var(--table); padding:12px; border-radius:4px; overflow-x:auto; white-space:nowrap; }}
.notes {{ color:var(--muted); max-width:80ch; font-size:13px; }}
</style>
<div class="wrap">
<h1>Beta art check-in</h1>
<p class="lede">Every piece of art the beta still needs, with five options each. All drafts are drawn on the game's own pixel grid with the approved frame ladder, coins, items and stars, so they look the way they would in the game. Nothing here is in the game yet. Pick one letter per item.</p>
<nav>{nav}</nav>
{body}
<div class="reply"><h2>How to answer</h2>
<p>One letter per item. Mixing is fine (for example "B2 A, but with E's blossoms").</p>
<code>reply like: B1 C, B2 A, B3 D, B4 B, B5 A, B6 E, B7 D</code>
<p class="notes">Assumptions to confirm with your picks: Verdant Reverie is treated as a Legendary set (5 levels). Heartwood Halo is Mythic (5 levels) and Core Pulse Exotic (6 levels), matching their cards. The B5 pool is a Common border, Common numbers, Epic attack and Epic tick; say if you want other slots. Cards show their item at the game's 0.75 item scale, and text is live text, as in the game.</p></div>
</div>'''

(HERE / "index.html").write_text(page, encoding="utf8")
print(len(page) // 1024, "KB")
