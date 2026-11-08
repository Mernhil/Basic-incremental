"""Writes index.html (the review page). Called by build.py after the sprites exist."""
from __future__ import annotations

from html import escape
from pathlib import Path

HERE = Path(__file__).resolve().parent
TIERS = ["bronze", "silver", "gold", "prismatic", "unique"]
TIER_NAMES = {"bronze": "Bronze", "silver": "Silver", "gold": "Gold", "prismatic": "Prismatic", "unique": "Unique"}
RARITY_OF = {"bronze": "common", "silver": "rare", "gold": "epic", "prismatic": "legendary"}
UNIQUES = {"sword": "evo-flameblade", "staff": "evo-rootbloom_staff"}
WEAPON_NAMES = {"sword": "Sword", "staff": "Staff", "bow": "Bow", "maul": "Maul"}

OPTIONS = [
    {
        "id": "A",
        "name": "Re-forged",
        "line": "The same blade, forged again in a richer metal with more engraving at every tier.",
        "tiers": {
            "bronze": "Hammered bronze, dents and green patina spots, bare grip.",
            "silver": "Polished steel, a groove down the blade, an engraved guard.",
            "gold": "Gilded blade with scroll dots, red velvet grip, ruby guard and pommel.",
            "prismatic": "Cut crystal in cyan, pink and violet facets, jewelled guard and pommel.",
            "unique": "Flameblade, the existing unique.",
        },
        "others": [
            ("Sword, greatsword, twin blades", "Blade metal and engraving, as shown."),
            ("Hatchet, pickaxe, chisel", "Head metal and one engraved line; the haft keeps its wrap."),
            ("Maul, geode hammer", "Head metal, bands and a gem; crystal head in two hues at Prismatic."),
            ("Shield, gauntlet", "Face plate or knuckle plate metal, rivets and an engraved rim."),
            ("Staff, bow", "Wraps and cup (staff), limb metal (bow); a crystal shaft or limb at Prismatic."),
        ],
        "cost": "About 25 SE: 12 hand-drawn bodies plus 36 re-forges (new ramp and 10 to 30 px of ornament each). No new silhouettes.",
        "cost_n": 25,
        "read": "The silhouette never changes, so the family is recognised at once at 1x. The tier shows as a metal colour, which holds at 1x. Bronze and Gold are the closest pair (both warm); the red grip, the gems and the sparkles separate them.",
        "style": "It is the one metal ladder of DESIGN.md section 12 (bronze, silver, gold, prismatic) applied to the weapon, the same language as frames, coins and medals. Five-tone cel ramps, one ink outline.",
        "rarity": "Layers well. Rarity keeps the parts (winged guard, ribbon, runes) and its accent colour; tier takes the blade or head metal. Caveat: a Silver tier Common and a Rare card both read as blue-grey steel.",
        "weak": "A Silver sword is not visibly stronger than a Bronze one, only richer. The jump from Prismatic crystal to the Unique flame has no ramp.",
    },
    {
        "id": "B",
        "name": "Grows",
        "line": "One steel family that gets longer, wider and gains parts: a bigger weapon at every tier.",
        "tiers": {
            "bronze": "A short gladius with a plain bar guard.",
            "silver": "A longer blade with up-curved quillons and a groove.",
            "gold": "A broadsword with feathered wings, a ruby guard and a gem pommel.",
            "prismatic": "A great blade with a crystal core, wide wings and three hovering crystals.",
            "unique": "Flameblade, the existing unique (the same size class as Prismatic).",
        },
        "others": [
            ("Sword, greatsword, twin blades", "Longer blades, then a winged guard, then hovering crystals."),
            ("Hatchet, pickaxe, chisel", "Bigger head, a second blade or spike, then wing spikes and a crystal."),
            ("Maul, geode hammer", "Bigger head, side spikes, a back spike, hovering crystals (geode cluster grows)."),
            ("Shield, gauntlet", "Bigger, then wings or spikes on the rim, then a crest and floating shards."),
            ("Staff, bow", "Taller staff with a cup, wings, a ring and crystals; taller bow with tip blades and riser wings."),
        ],
        "cost": "About 41 SE: every tier is a new silhouette (a new body at Bronze, then 0.8 SE each for the next three) across 12 weapons. The most expensive option.",
        "cost_n": 41,
        "read": "Strongest at 1x: size and silhouette tell the tier in one flat colour. But Bronze fills about 55% of the card window and looks small, and Prismatic fills the whole 100 x 120 box, leaving no room for the aura and sparkles that Gold and above already get.",
        "style": "The closest to a Brave Frontier unit evolving: the thing itself grows. Cel style is intact. Material stays one steel, so it does not use the metal ladder.",
        "rarity": "Collides. Rarity already adds a winged guard at Epic and an ornate shape at Legendary, so a Gold tier Common would look like an Epic card. It needs a rule: tier owns size, rarity owns ornament.",
        "weak": "Every weapon needs its own growth plan, and bows, shields and gauntlets grow awkwardly (a bigger shield stops fitting the window).",
    },
    {
        "id": "C",
        "name": "Aura",
        "line": "The weapon never changes shape; the element wakes up around it, stronger at every tier.",
        "tiers": {
            "bronze": "Bare steel sword.",
            "silver": "A thin edge glint in the element colour, three sparks (new warm-up step).",
            "gold": "The element effect from the outline: edge fire for the sword, leaf spiral for the staff, arcs for the bow, power cracks for the maul.",
            "prismatic": "The same effect, bigger, inside a rainbow shell with orbiting sparks.",
            "unique": "Flameblade, the existing unique (the aura finally eats the blade).",
        },
        "others": [
            ("Every weapon", "Its element effect from its own outline: fire, storm, light, nature, earth, crystal, void (section 12 table)."),
            ("Weapons with no element yet", "Silver glint and Prismatic shell use the tier colours instead."),
            ("Shield, gauntlet", "Light aura shell pulses outward; storm and earth crack the plates."),
            ("Hatchet, pickaxe, chisel", "Edge fire or arcs along the head; cracks through the head."),
            ("Maul, geode hammer", "Power cracks in the head, a rainbow shell at Prismatic."),
        ],
        "cost": "About 3 SE of new art: the 12 Common bodies already exist and the effects are generated from the outline by the existing fx loop. New work is the Silver warm-up, the rainbow shell and per-weapon tuning.",
        "cost_n": 3,
        "read": "Best for recognising the weapon, since the picture is identical at every tier. The tier reads as a glow, which works at 1x on a dark window, but Silver is only 1 to 2 px and light windows (Common) eat the contrast. Effects must stay calmer than hits.",
        "style": "Exactly what section 12 already says (effects from the item's own shape, none at Bronze and Silver, from Gold, stronger at Prismatic). Hard pixels only in the drafts; in game they are the existing live loop.",
        "rarity": "Orthogonal, which is its best point: rarity picks the body, tier picks the aura, so no clash and no matrix of looks.",
        "weak": "It is an effect upgrade, not a new look. Section 5 asks for a new look within the family, and a still screenshot of Bronze and Gold (effects frozen) shows the same sword.",
    },
    {
        "id": "D",
        "name": "Rarity ladder (interim rule)",
        "line": "The baseline in DESIGN.md today: each tier moves one step up the existing rarity sprites.",
        "tiers": {
            "bronze": "The Common sword.",
            "silver": "The Rare sword (blue wrap).",
            "gold": "The Epic sword (purple, winged guard).",
            "prismatic": "The Legendary sword (gold inlay, ribbon).",
            "unique": "Flameblade.",
        },
        "others": [
            ("Every weapon", "Common, Rare, Epic, Legendary sprites in order (these are the game's own approved sprites, shown unchanged)."),
            ("Rare or better cards", "They start higher on the ladder and are capped at Void; a Legendary card at Prismatic would show the Void sprite."),
        ],
        "cost": "0 SE: already drawn; only wiring. It is the cost of not deciding.",
        "cost_n": 0,
        "read": "These are approved sprites and read fine on their own. But Bronze and Silver differ only by the guard colour, which is hard to see at card size, and the tier is not told by shape until Epic.",
        "style": "Fully consistent: it is the approved art. It is the only option here that is not new work.",
        "rarity": "Collides head on: tier and rarity are the same axis. A Common card at Silver is indistinguishable from a Rare card, and a Mythic card has almost nowhere to go.",
        "weak": "Players cannot tell 'this card is rare' from 'this card is upgraded'; that is the reason section 5 calls it temporary.",
    },
    {
        "id": "E",
        "name": "Frame kit (hybrid)",
        "line": "The weapon wears its tier's frame: the same metal on the hilt, the same gem sockets, the same crest.",
        "tiers": {
            "bronze": "Bronze guard and a stud pommel; the gem sockets are empty dents.",
            "silver": "Silver wings on the guard and two sapphires.",
            "gold": "A gold crown on the guard with a sapphire, an emerald and a ruby.",
            "prismatic": "A cut-crystal crown, six rainbow gems and sparks.",
            "unique": "Flameblade, the existing unique.",
        },
        "others": [
            ("Sword, greatsword", "Guard is the crest slot; sockets on the guard ends and blade."),
            ("Twin blades", "Crest where the blades cross; sockets on the two guards."),
            ("Hatchet, pickaxe, chisel", "Crest on the head's top; sockets on the head and the bolster."),
            ("Maul, geode hammer, shield, gauntlet", "Crest above the head, boss or knuckle; sockets on the plate corners."),
            ("Staff, bow", "Crest under the orb or on the riser; sockets along the shaft or limb tips."),
        ],
        "cost": "About 11 SE: reuse the Common body, add 12 anchor points, one shared kit of 4 crest and 6 gem decals, and 48 trim palette swaps. The trim must be a separate part of each baked sprite.",
        "cost_n": 11,
        "read": "The crest changes the silhouette at Silver (wings) and Gold (crown), so it reads at 1x. The gems are 4 to 5 px dots and do not read at 1x; they pay off at 2x. The blade stays plain, so the weapon stays recognisable.",
        "style": "One visual language for the whole card: wings mean Silver, a crown means Gold, on the frame and the weapon. Cel style fits. It also tells the tier twice, since the frame already does.",
        "rarity": "Layers, with one rule needed: rarity colours the guard today (blue, purple, gold, pink), and tier trim would take that over. Let tier own the metal and rarity own the gem and ribbon colour.",
        "weak": "The weapon never feels more powerful, only more decorated, and 12 weapons end up with similar-looking crests.",
    },
]

CSS = """
:root{
  --bg:#1b1e26; --panel:#262b35; --panel2:#2f3542; --line:#434b5c; --ink:#f6e7c8; --muted:#c3c9d6; --dim:#9aa2b3;
  --win:#2a303c; --accent:#ffd84c; --good:#8ff0b8; --warn:#ffb066;
  --display:'Bahnschrift','Segoe UI Variable Display','Segoe UI',system-ui,sans-serif;
  --body:'Segoe UI Variable Text','Segoe UI',system-ui,sans-serif;
}
*{box-sizing:border-box}
html{color-scheme:dark}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 var(--body)}
img{image-rendering:pixelated;image-rendering:crisp-edges;display:block}
a{color:var(--accent)}
:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.wrap{max-width:1400px;margin:0 auto;padding:0 20px 80px}
header.top{padding:36px 0 18px}
h1{font:700 40px/1.1 var(--display);margin:0 0 10px;letter-spacing:.2px}
h2{font:700 28px/1.2 var(--display);margin:0}
h3{font:700 18px/1.3 var(--display);margin:0 0 8px;color:var(--ink)}
p{margin:0 0 10px;max-width:74ch}
.lede{color:var(--muted);font-size:18px;max-width:70ch}
.nav{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 0;padding:0;list-style:none}
.nav a{display:block;padding:8px 14px;border:2px solid var(--line);border-radius:6px;text-decoration:none;color:var(--ink);background:var(--panel);font:600 15px var(--display)}
.nav a:hover{border-color:var(--accent)}
section.block{margin-top:44px}
.glance{width:100%;table-layout:fixed;border-collapse:separate;border-spacing:0 6px;margin-top:14px}
.glance th{font:600 13px var(--display);color:var(--muted);text-align:center;padding:4px 6px}
.glance td.rowhead{padding:10px 12px;width:170px;vertical-align:middle;background:var(--panel);border-radius:6px 0 0 6px}
.glance td.rowhead b{font:700 17px var(--display);display:block}
.glance td.rowhead span{color:var(--dim);font-size:13px}
.glance td.cell{background:var(--win);padding:6px;text-align:center;border-left:2px solid var(--bg)}
.glance td.cell img{margin:0 auto}
.glance td.last{border-radius:0 6px 6px 0}
.glance td.cost{background:var(--panel);width:74px;text-align:center;font:700 22px var(--display);color:var(--accent)}
.glance td.cost small{display:block;font:500 12px var(--body);color:var(--dim)}
.opt{margin-top:56px;padding-top:6px;border-top:3px solid var(--line)}
.opt header{display:flex;gap:18px;align-items:baseline;flex-wrap:wrap;margin:18px 0 6px}
.letter{font:800 56px/1 var(--display);color:var(--accent)}
.line{color:var(--muted);font-size:18px;margin:0 0 16px;max-width:80ch}
.ladder{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:8px 0}
.slot{background:var(--win);border:2px solid var(--line);border-radius:6px;padding:8px 6px 10px;text-align:center}
.slot img{margin:0 auto}
.slot .t{font:700 15px var(--display);margin:6px 0 2px}
.slot .d{font-size:13px;color:var(--muted);line-height:1.35;text-align:left;padding:0 4px}
.empty{height:240px;display:flex;align-items:center;justify-content:center;color:var(--dim);font-size:13px;border:2px dashed var(--line);border-radius:4px;margin:0 6px;text-align:center;padding:10px}
.strip{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0;background:var(--win);padding:6px;border-radius:6px;width:max-content;max-width:100%}
.label{font:600 13px var(--display);color:var(--dim);margin:14px 0 4px}
.scroll{overflow-x:auto;background:var(--panel);border-radius:6px;padding:6px}
.rows{display:grid;grid-template-columns:90px repeat(5,1fr);gap:8px;align-items:center;margin:6px 0}
.rows .wname{font:700 16px var(--display);color:var(--muted)}
.rows .c{background:var(--win);border:2px solid var(--line);border-radius:6px;padding:4px;display:flex;justify-content:center;min-height:250px;align-items:center}
.facts{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin:18px 0}
.fact{background:var(--panel);border-radius:6px;padding:12px 14px;border-left:4px solid var(--line)}
.fact p{margin:0;font-size:15px;color:var(--muted)}
.fact.cost{border-left-color:var(--accent)} .fact.weak{border-left-color:var(--warn)}
table.apply{border-collapse:collapse;margin:6px 0;width:100%;font-size:15px}
table.apply td,table.apply th{border-bottom:1px solid var(--line);padding:6px 10px;text-align:left;vertical-align:top}
table.apply th{color:var(--muted);font:600 13px var(--display)}
.anim{display:flex;gap:10px;flex-wrap:wrap}
.anim figure{margin:0;background:var(--win);padding:6px;border-radius:6px;text-align:center;font-size:13px;color:var(--muted)}
details{margin:8px 0}
summary{cursor:pointer;font:600 14px var(--display);color:var(--muted);padding:4px 0}
.notes li{margin-bottom:6px;color:var(--muted)}
.costtable{width:100%;border-collapse:collapse;margin-top:10px}
.costtable td,.costtable th{border-bottom:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}
.costtable th{font:600 13px var(--display);color:var(--muted)}
@media (max-width:900px){.ladder{grid-template-columns:repeat(2,1fr)}.facts{grid-template-columns:1fr}.rows{grid-template-columns:70px repeat(5,minmax(80px,1fr));overflow-x:auto}.glance{display:block;overflow-x:auto}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
"""


def spr(opt: str, w: str, t: str) -> str | None:
    """Relative path of a sprite, or None when that weapon has no drawing for the step."""
    if t == "unique":
        n = UNIQUES.get(w)
        return f"existing/{n}.png" if n else None
    if opt == "D":
        return f"existing/item-{w}-{RARITY_OF[t]}.png"
    return f"sprites/{opt}/{w}-{t}.png"


def img(src: str, w: int, h: int, alt: str, z: int = 1) -> str:
    return f'<img src="{src}" width="{w * z}" height="{h * z}" alt="{escape(alt)}">'


def build(costs: dict | None = None) -> None:
    out: list[str] = []
    out.append('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">')
    out.append("<title>Weapon tier looks</title>")
    out.append(f"<style>{CSS}</style></head><body><div class=\"wrap\">")
    out.append('<header class="top"><h1>Weapon tier looks</h1>')
    out.append('<p class="lede">How one weapon family evolves from Bronze to Silver, Gold, Prismatic and Unique, like a single Brave Frontier unit evolving (DESIGN.md section 5, Tier). Five options, each shown on the sword ladder and then on a staff, a bow and a maul. Drafts only: nothing here is in the game, and the Unique step is always the existing Flameblade or Rootbloom Staff.</p>')
    out.append('<p class="lede">Every sprite is drawn on the card item grid (100 x 120). Each picture is shown at 2x (the full-screen card scale), at 1x (the native pixels) and inside its tier frame at 1x and 2x. The card mock is an approximation of the real card layout: the shipped frame sprite, a dark body and the item at its true size.</p>')
    out.append('<ul class="nav">')
    out.append('<li><a href="#glance">All five side by side</a></li>')
    for o in OPTIONS:
        out.append(f'<li><a href="#opt-{o["id"]}">{o["id"]}: {escape(o["name"])}</a></li>')
    out.append('<li><a href="#costs">Art cost</a></li><li><a href="#notes">Method and gaps</a></li></ul></header>')

    # ---------- glance
    out.append('<section class="block" id="glance"><h2>All five side by side</h2>')
    out.append('<p>The sword ladder of each option at 2x. Read each row left to right as one weapon evolving. The right column is the new art needed for 12 weapons across all four tiers, in sprite-equivalents (SE, one hand-shaded 100 x 120 weapon from scratch).</p>')
    out.append('<table class="glance"><colgroup><col style="width:170px"><col><col><col><col><col><col style="width:74px"></colgroup><thead><tr><th></th>')
    for t in TIERS:
        out.append(f"<th>{TIER_NAMES[t]}</th>")
    out.append("<th>New art</th></tr></thead><tbody>")
    for o in OPTIONS:
        out.append(f'<tr><td class="rowhead"><b>{o["id"]}: {escape(o["name"])}</b></td>')
        for t in TIERS:
            s = spr(o["id"], "sword", t)
            out.append(f'<td class="cell">{img(s, 100, 120, f"{o["name"]} {TIER_NAMES[t]} sword", 2)}</td>')
        out.append(f'<td class="cost">{o["cost_n"]}<small>SE</small></td></tr>')
    out.append("</tbody></table></section>")

    # ---------- options
    for o in OPTIONS:
        oid = o["id"]
        out.append(f'<section class="opt" id="opt-{oid}"><header><span class="letter">{oid}</span><h2>{escape(o["name"])}</h2></header>')
        out.append(f'<p class="line">{escape(o["line"])}</p>')
        out.append('<div class="label">Sword ladder at 2x</div><div class="ladder">')
        for t in TIERS:
            s = spr(oid, "sword", t)
            out.append('<div class="slot">' + img(s, 100, 120, f'{o["name"]} {TIER_NAMES[t]} sword', 2) + f'<div class="t">{TIER_NAMES[t]}</div><div class="d">{escape(o["tiers"][t])}</div></div>')
        out.append("</div>")
        out.append('<div class="label">The same five at 1x (native pixels)</div><div class="strip">')
        for t in TIERS:
            out.append(img(spr(oid, "sword", t), 100, 120, f'{TIER_NAMES[t]} sword at native size'))
        out.append("</div>")
        out.append('<div class="label">In its tier frame at 1x (the Unique keeps the Prismatic frame)</div>')
        out.append(f'<div class="scroll">{img(f"cards/{oid}-sword-1x.png", 951, 243, f"{o["name"]} sword ladder inside the tier frames")}</div>')
        out.append(f'<details><summary>In its tier frame at 2x (full-screen scale)</summary><div class="scroll">{img(f"cards/{oid}-sword-2x.png", 951, 243, f"{o["name"]} sword ladder inside the tier frames at 2x", 2)}</div></details>')

        # other weapons
        out.append('<div class="label">The same approach on a staff, a bow and a maul (2x; a note means no unique is drawn for that weapon yet)</div>')
        out.append('<div class="rows"><div></div>' + "".join(f'<div class="wname" style="text-align:center">{TIER_NAMES[t]}</div>' for t in TIERS) + "</div>")
        for w in ("staff", "bow", "maul"):
            out.append(f'<div class="rows"><div class="wname">{WEAPON_NAMES[w]}</div>')
            for t in TIERS:
                s = spr(oid, w, t)
                if s:
                    out.append(f'<div class="c">{img(s, 100, 120, f"{o["name"]} {TIER_NAMES[t]} {w}", 2)}</div>')
                else:
                    out.append('<div class="c"><span style="color:var(--dim);font-size:12px;text-align:center">No unique<br>drawn yet</span></div>')
            out.append("</div>")
        out.append(f'<details><summary>All four weapons in one sheet at 2x, and the staff, bow and maul in their frames</summary><div class="scroll">{img(f"sheets/{oid}-2x.png", 1072, 1020, f"{o["name"]} ladders for all four weapons at 2x")}</div>')
        for w in ("staff", "bow", "maul"):
            out.append(f'<div class="scroll" style="margin-top:8px">{img(f"cards/{oid}-{w}-1x.png", 951 if w == "staff" else 762, 243, f"{o["name"]} {w} inside the tier frames")}</div>')
        out.append("</details>")

        if oid == "C":
            out.append('<div class="label">Motion preview: the effects are generated from each weapon\'s outline and drift upward (3x, 6 frames, real speed)</div><div class="anim">')
            for n, cap in (("c-sword-gold", "Sword, Gold: edge fire"), ("c-sword-prismatic", "Sword, Prismatic: fire inside a rainbow shell"), ("c-staff-prismatic", "Staff, Prismatic: leaf spiral and shell"), ("c-bow-gold", "Bow, Gold: arc crackle")):
                out.append(f'<figure><img src="anim/{n}_preview.gif" width="300" height="360" alt="{escape(cap)}">{escape(cap)}</figure>')
            out.append("</div>")

        out.append('<div class="label">How the same approach applies to the other 11 weapons</div><table class="apply"><thead><tr><th>Weapons</th><th>What changes per tier</th></tr></thead><tbody>')
        for a, b in o["others"]:
            out.append(f"<tr><td>{escape(a)}</td><td>{escape(b)}</td></tr>")
        out.append("</tbody></table>")
        out.append('<div class="facts">')
        out.append(f'<div class="fact cost"><h3>Art cost</h3><p>{escape(o["cost"])}</p></div>')
        out.append(f'<div class="fact"><h3>Readable at card size</h3><p>{escape(o["read"])}</p></div>')
        out.append(f'<div class="fact"><h3>Cel-shaded style</h3><p>{escape(o["style"])}</p></div>')
        out.append(f'<div class="fact"><h3>With rarity</h3><p>{escape(o["rarity"])}</p></div>')
        out.append(f'<div class="fact weak"><h3>Weak point</h3><p>{escape(o["weak"])}</p></div>')
        out.append("</div></section>")

    # ---------- cost table
    out.append('<section class="block" id="costs"><h2>Art cost, side by side</h2>')
    out.append('<p>SE (sprite-equivalent): one new hand-shaded 100 x 120 weapon from scratch is 1 SE; a recolour plus 10 to 30 px of ornament is about 0.35; a palette swap is 0.1; an effect generated from the outline costs a one-time 0.5 per effect type. These are estimates from how long each draft took to build, not measurements.</p>')
    out.append('<table class="costtable"><thead><tr><th>Option</th><th>New weapon art (12 weapons x 4 tiers)</th><th>What you pay for</th></tr></thead><tbody>')
    for o in OPTIONS:
        out.append(f'<tr><td><b>{o["id"]}: {escape(o["name"])}</b></td><td>{o["cost_n"]} SE</td><td>{escape(o["cost"])}</td></tr>')
    out.append('<tr><td><b>All options</b></td><td>+30 SE</td><td>The 10 weapons without a unique still need one (about 3 SE each with its motion). Flameblade and Rootbloom Staff are drawn; the Soul Reaper waits for a scythe card.</td></tr>')
    out.append("</tbody></table>")
    out.append('<p style="margin-top:14px">One question applies to every option and the wording in section 12 leaves it open: how tier looks combine with the rarity ladder. A and E layer on top of rarity if tier owns the metal and rarity owns the accent colour, C is independent of it, and B and D compete with it for the same visual axis.</p></section>')

    # ---------- notes
    out.append('<section class="block" id="notes"><h2>Method and gaps</h2><ul class="notes">')
    out.append("<li>The four new ladders (A, B, C, E) were drawn with a small hard-pixel kit (<code>pix.py</code>, <code>weapons.py</code>, <code>options.py</code>, <code>fx.py</code>): polygons rasterised on the 100 x 120 grid with no anti-aliasing, five-tone ramps lit from the top-left, an ink outline, a light rim and plus sparkles, as the shipped item sprites do. They are seeded and deterministic; <code>build.py</code> regenerates everything.</li>")
    out.append("<li>Option D, the unique steps, and the frames are the game's own approved sprites, copied unchanged into <code>existing/</code> for comparison. They are not part of the checks below (the approved Rootbloom Staff uses 103 colours).</li>")
    out.append("<li><code>pixel_check.py</code> on the 64 new sprites: 0 errors and no orphan pixels. The only warnings are the outer aura pixels of option C, which sit outside the ink outline on purpose (an effect, not an outline gap).</li>")
    out.append("<li>Option C is shown as hard-pixel stills and 6-frame loops of what the live effect loop would draw; in the game the effects stay a live canvas behind and in front of the card sprite, so no new baked art would be needed for them.</li>")
    out.append("<li>Not done: the bow, maul and staff Unique steps (no unique is drawn for them yet), the other eight weapons (they are described in the tables, not drawn), a motion preview of E's sparks, and a check in the real card (nothing was merged or run in the game).</li>")
    out.append("</ul></section>")
    out.append("</div></body></html>")
    (HERE / "index.html").write_text("\n".join(out), encoding="utf-8")


if __name__ == "__main__":
    build()
