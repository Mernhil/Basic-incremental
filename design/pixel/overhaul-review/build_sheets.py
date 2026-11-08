#!/usr/bin/env python3
"""Build the graphics-overhaul review sheets (design only; nothing here ships).

Usage (from the repo root, Python 3 + Pillow, Node for the capture step):
  py design/pixel/overhaul-review/build_sheets.py              # capture, check, build
  py design/pixel/overhaul-review/build_sheets.py --no-capture # reuse _captures/
  py design/pixel/overhaul-review/build_sheets.py --only A,F   # rebuild some sheets

Steps:
  1. tools/capture.mjs screenshots the code-drawn and animated art through the real renderer
     modules (bosses, evolutions, frame and medal motion, element effects, hits, CSS cosmetics,
     line icons, runtime pixel numerals) into _captures/.
  2. The skill's pixel_check.py runs over src/renderer/src/art/pixel/sprites.
  3. Every sheet is laid out from the catalogue below: one row per asset (base ID), one cell per
     variant (ID.n), each at a whole-number nearest-neighbour scale on its in-game background,
     with an in-game / gallery-only / unused tag and the pixel_check result.
  4. index.md is written next to the sheets.

After a redraw, re-bake the sprites as usual, then re-run this script; IDs stay stable as long as
the catalogue order below does not change (append new rows at the end of a sheet).
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SPR = ROOT / "src/renderer/src/art/pixel/sprites"
CAP = HERE / "_captures"
DATA = ROOT / "src/data/content"
CHECK = ROOT / ".claude/skills/pixel-art/scripts/pixel_check.py"
MAX_W = 2400
BGAP = 28  # gap between row blocks that share a line

# ---------------------------------------------------------------------------------------------
# look of the sheets

PAGE = (27, 30, 38)
RULE = (52, 57, 70)
TEXT = (238, 230, 210)
MUTED = (160, 167, 182)
TAG = {"game": ((76, 175, 110), "IN GAME"), "gallery": ((217, 179, 90), "GALLERY ONLY"), "unused": ((224, 96, 109), "UNUSED")}
WARN = (255, 176, 46)
ERR = (255, 80, 80)


def font(path: str, size: int, variation: str | None = None) -> ImageFont.FreeTypeFont:
    for p in (path, "C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/arialbd.ttf"):
        try:
            f = ImageFont.truetype(p, size)
            if variation:
                try:
                    f.set_variation_by_name(variation)
                except Exception:
                    pass
            return f
        except OSError:
            continue
    return ImageFont.load_default()


F_TITLE = font("C:/Windows/Fonts/bahnschrift.ttf", 46, "Bold")
F_ID = font("C:/Windows/Fonts/bahnschrift.ttf", 28, "Bold")
F_ROW = font("C:/Windows/Fonts/bahnschrift.ttf", 24, "SemiBold")
F_LABEL = font("C:/Windows/Fonts/segoeui.ttf", 16)
F_SMALL = font("C:/Windows/Fonts/segoeuib.ttf", 13)
F_BODY = font("C:/Windows/Fonts/segoeui.ttf", 18)


def hexrgb(c: str) -> tuple[int, int, int]:
    c = c.strip()
    m = re.match(r"rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)", c)
    if m:
        return tuple(int(x) for x in m.groups())  # type: ignore[return-value]
    c = c.lstrip("#")
    return tuple(int(c[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


# ---------------------------------------------------------------------------------------------
# images


def spr(name: str) -> Image.Image:
    return Image.open(SPR / f"{name}.png").convert("RGBA")


def up(img: Image.Image, s: int) -> Image.Image:
    return img.resize((img.width * s, img.height * s), Image.NEAREST) if s != 1 else img


def capimg(key: str, f: str = "f0") -> Image.Image | None:
    p = CAP / key / f"{f}.png"
    return Image.open(p).convert("RGBA") if p.exists() else None


def checker(w: int, h: int, s: int = 6) -> Image.Image:
    im = Image.new("RGBA", (w, h), (205, 205, 210, 255))
    d = ImageDraw.Draw(im)
    for y in range(0, h, s):
        for x in range(0, w, s):
            if (x // s + y // s) % 2:
                d.rectangle([x, y, x + s - 1, y + s - 1], fill=(160, 160, 168, 255))
    return im


# ---------------------------------------------------------------------------------------------
# catalogue model


@dataclass
class Cell:
    label: str
    img: Image.Image | None
    status: str | None = None  # game / gallery / unused
    sprites: list[str] = field(default_factory=list)
    thumb: Image.Image | None = None  # native 1x copy shown on a checker strip
    bg: tuple[int, int, int] | None = None
    missing: str = ""


@dataclass
class Row:
    name: str
    cells: list[Cell]
    source: str
    used: str
    notes: str = ""
    bg: tuple[int, int, int] | None = None
    scale: str = ""
    id: str = ""


@dataclass
class Sheet:
    letter: str
    slug: str
    title: str
    blurb: str
    bg: tuple[int, int, int]
    bg_name: str
    rows: list[Row] = field(default_factory=list)


# ---------------------------------------------------------------------------------------------
# pixel_check


def run_check() -> dict[str, dict]:
    out = subprocess.run(
        [sys.executable, str(CHECK), str(SPR)], capture_output=True, text=True, encoding="utf-8"
    ).stdout
    (HERE / "_captures").mkdir(exist_ok=True)
    (HERE / "_captures" / "pixel_check.txt").write_text(out, encoding="utf-8")
    res: dict[str, dict] = {}
    cur = None
    for line in out.splitlines():
        m = re.match(r"\[(\w+)\]\s+(.+?\.png)\s+native (\d+)x(\d+) at (\d+)x, (\d+) colours", line)
        if m:
            name = Path(m.group(2).replace("\\", "/")).stem
            cur = res[name] = {"status": m.group(1), "colours": int(m.group(6)), "msgs": []}
            continue
        m = re.match(r"\s+(error|warn):\s+(.*)", line)
        if m and cur is not None:
            cur["msgs"].append((m.group(1), m.group(2)))
    return res


def check_summary(c: dict) -> str:
    parts = []
    for kind, msg in c["msgs"]:
        m = re.match(r"(\d+) (orphan pixels|edge pixels not ink or light rim)", msg)
        if m:
            parts.append(f"{m.group(1)} {'orphan px' if 'orphan' in m.group(2) else 'edge px not ink/rim'}")
        else:
            parts.append(msg.split(",")[0][:60])
    return ", ".join(parts)


# ---------------------------------------------------------------------------------------------
# data and usage


def load_json(name: str):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def listify(d):
    return d if isinstance(d, list) else next(iter(d.values()))


CARDS = listify(load_json("cards.json"))
RES = listify(load_json("resources.json"))
COSMETICS = listify(load_json("cosmetics.json"))
REFS: set[str] = set()
for c in COSMETICS:
    for lv in c["levels"]:
        REFS.update(lv.get("recipes", []))
        REFS.update((lv.get("effects") or {}).values())
CARD_ITEMS = {(c["item"]["kind"], c["rarity"]): c for c in CARDS}
EVOS_USED = {c.get("evolution") for c in CARDS if c.get("evolution")}
SHAPE_GEM = {r["gem"]["shape"]: r for r in RES if r.get("gem")}
RARITIES = ["common", "rare", "epic", "legendary", "mythic", "exotic", "void"]
STATE_NAMES = ["stone", "bronze", "silver", "gold", "prism", "locked"]


def ref(rid: str) -> str:
    return "game" if rid in REFS else "unused"


# ---------------------------------------------------------------------------------------------
# catalogue


def build_catalogue(tokens: dict, meta: dict) -> list[Sheet]:
    T = lambda k, d: hexrgb(tokens.get(k) or d)  # noqa: E731
    ART = T("art-common", "#0d121b")
    BODY = T("body-common", "#2a2f38")
    CHROME = T("--bi-chrome-bg", "#161b26")
    FRAME = T("--bi-frame-bg", "#2a2f38")
    TABLE = T("--bi-table-bg", "#cfd5dd")
    sheets: list[Sheet] = []

    def sprite_cell(name, label, s, status, thumb=False, bg=None) -> Cell:
        if not (SPR / f"{name}.png").exists():
            return Cell(label, None, status, [name], missing="missing sprite")
        im = spr(name)
        return Cell(label, up(im, s), status, [name], thumb=im if thumb else None, bg=bg)

    def cap_cells(key, labels=None, files=None, status="game", scale_note="") -> list[Cell]:
        files = files or ["f0", "f1", "f2", "f3", "rm"]
        labels = labels or ["frame 1", "frame 2", "frame 3", "frame 4", "reduced motion"]
        cells = []
        for f, lb in zip(files, labels):
            im = capimg(key, f)
            cells.append(Cell(lb, im, status, missing="" if im else "not captured"))
        return cells

    def times(key, files=("f0", "f1", "f2", "f3")) -> list[str]:
        info = CAPTURES.get(key)
        if not info:
            return [f for f in files]
        out = []
        for f in files:
            if f == "rm":
                out.append("reduced-motion still")
            else:
                i = int(f[1:])
                t = info["frames"][i] if i < len(info["frames"]) else 0
                out.append(f"t = {t / 1000:.2f} s")
        return out

    # ---------------- A, B: card items ----------------
    kinds_a = ["sword", "shield", "twin_blades", "greatsword", "hatchet", "staff"]
    kinds_b = ["maul", "bow", "pickaxe", "chisel", "geode_hammer", "gauntlet"]
    card_by_kind = {c["item"]["kind"]: c for c in CARDS}

    def item_rows(kinds) -> list[Row]:
        rows = []
        for k in kinds:
            c = card_by_kind.get(k)
            cells = [
                sprite_cell(
                    f"item-{k}-{r}", r, 2, "game" if (k, r) in CARD_ITEMS else "gallery"
                )
                for r in RARITIES
            ]
            own = c["rarity"] if c else "?"
            rows.append(
                Row(
                    f"{c['item']['name'] if c else k} ({k.replace('_', ' ')}), rarity ladder",
                    cells,
                    f"`item-{k}-<rarity>.png`; `itemArt()` in art/items.ts; drawn in art/vector/items.ts, baked by bake.ts",
                    f"Card art window of {c['name'] if c else '?'} ({own}); other rarities only in the dev gallery (#gallery)",
                    "Approved 2026-11-07 (BETA_PLAN: card items, #43, treatment E+). Rarity adds parts (DESIGN 13).",
                    ART,
                    "2x (100 x 120 native)",
                )
            )
        return rows

    sheets.append(
        Sheet("A", "card-items-1", "Card items I: swords, shield, staff, hatchet",
              "Each row is one signature item at all seven rarities (common to void). Only the card's own rarity is shown in the game; the rest appear only in the dev gallery.",
              ART, "card art window #0d121b", item_rows(kinds_a))
    )
    b = Sheet("B", "card-items-2-evolutions", "Card items II and unique evolutions",
              "Rows 01-06: the other six items at all rarities. Rows 07-10: the star 6 unique evolutions, still sprite then key frames of their live motion and the reduced-motion still.",
              ART, "card art window #0d121b", item_rows(kinds_b))
    evo_names = {"flameblade": "Flameblade", "soul_reaper": "Soul Reaper", "rootbloom_staff": "Rootbloom Staff"}
    for eid, nm in evo_names.items():
        st = "game" if eid in EVOS_USED else "unused"
        key = f"evo-{eid}"
        cells = [sprite_cell(f"evo-{eid}", "baked still", 2, st)]
        cells += cap_cells(key, times(key) + ["reduced-motion still"], status=st)
        b.rows.append(Row(
            f"{nm} (star 6 evolution) with motion", cells,
            f"`evo-{eid}.png`; live layer `evolutionArt()` in art/evolutions.ts",
            "Card art window of a Gold+ star 6 card (loadoutCards.ts)" if st == "game" else "Not reachable: no Void fighting card in the beta (DESIGN 16 E6)",
            "Approved 2026-11-07 (BETA_PLAN: unique evolutions, #43). Motion frames captured live (12 fps loop).",
            ART, "2x (still) / 2x capture (frames)"))
    b.rows.append(Row(
        "Rootbloom floating earth crystals", [sprite_cell(f"evo-rootbloom_staff-crystal{i}", f"crystal {i}", 3, "game", thumb=True) for i in range(4)],
        "`evo-rootbloom_staff-crystal0..3.png`; used by the Rootbloom live layer", "Orbit the Rootbloom Staff", "Part of the approved Rootbloom Staff.", ART, "3x (16 x 16 native)"))
    sheets.append(b)

    # ---------------- C: frames and card chrome ----------------
    c = Sheet("C", "card-frames-chrome", "Card frames and card chrome",
              "The tier frame ladder (still and live), whole cards per tier and per rarity body, star 6 evolution cards and the card's fallback emblems.",
              BODY, "card body (common) #2a2f38")
    c.rows.append(Row("Frame ladder (still sprites)", [sprite_cell(f"frame-{t}", t, 2, "game") for t in ["bronze", "silver", "gold", "prismatic"]],
                      "`frame-<tier>.png`; `cardFrame()` in art/frame.ts; drawn in art/vector/frame.ts", "Every card (ui/card.ts)",
                      "Approved 2026-11-07 (frame ladder, #43). In game the card is 176 x 248 css for a 132 x 186 grid, so frame pixels show at 1.33 css px (not a whole-number scale).", BODY, "2x (183 x 237 native)"))
    for t in ["gold", "prismatic"]:
        key = f"frame-{t}"
        c.rows.append(Row(f"{t.title()} frame motion ({'shine, twinkles' if t == 'gold' else 'rainbow band, shine, orbit sparks'})",
                          cap_cells(key, times(key) + ["reduced-motion still"]),
                          f"live layer `frame-{t}` in art/frame.ts over `frame-{t}.png`", "Every Gold / Prismatic card",
                          "Approved with the frame ladder. Captured live; the shine sweep takes about 12 s per pass, so most frames show it partly.", BODY, "2x capture"))
    c.rows.append(Row("Whole card per tier (star 6, Ember Squire, starter cosmetics)",
                      [Cell(t, capimg(f"card-tier-{t}"), "game") for t in ["bronze", "silver", "gold", "prismatic"]],
                      "ui/card.ts (`createCard`) + theme/base.css, rank.css (ui-owned chrome) + art frame and item", "Cards page, loadout, summon, wardrobe",
                      "Composite screenshot; the frame grid is shown at 2x (captured at device scale 1.5). Stars are text glyphs (CSS).", PAGE, "frame grid 2x"))
    c.rows.append(Row("Card body by rarity (Bronze star 3, sword at that rarity)",
                      [Cell(r, capimg(f"card-rarity-{r}"), "game") for r in RARITIES],
                      "rarity body colour tokens (rarities.json, theme/apply.ts), `neon` (mythic, exotic) and `chrome` (void) recipes in recipes.css", "Every card",
                      "CSS, not pixel art: gradients and colour washes.", PAGE, "frame grid 2x"))
    c.rows.append(Row("Star 6 evolution on a Gold card",
                      [Cell(n, capimg(f"card-evo-{e}"), "game") for e, n in [("flameblade", "Flameblade"), ("rootbloom_staff", "Rootbloom Staff")]],
                      "loadoutCards.ts + `evolutionArt()`", "Loadout cards at Gold star 6", "Composite screenshot.", PAGE, "frame grid 2x"))
    emb = ["blade", "gem", "shield", "pick", "axe", "golem", "rock", "tree"]
    c.rows.append(Row("Card emblems (vector fallback when a card has no item)",
                      [Cell(e, capimg(f"emblem-{e}"), "game" if e in ("blade", "gem", "axe", "pick") else "unused") for e in emb],
                      "`EMBLEMS` in ui/card.ts (ui-owned, vector)", "Only when a card has no item art; every beta card has an item, so in practice hidden. blade / gem / axe / pick are still passed by pages",
                      "Legacy vector placeholders (comment: 'until real card art exists').", ART, "2x capture"))
    sheets.append(c)

    # ---------------- D: coins, medals, currency, icons ----------------
    d = Sheet("D", "coins-medals-icons", "Gem coins, medals, Starlight, plaques and icons",
              "Resource coins by mastery tier, mastery medals (still and live), Starlight coin styles, the card shard, the navigation plaques and the remaining vector line icons. Small sprites also show a 1x copy on a checker strip.",
              CHROME, "header / rail chrome #161b26")
    for shape in ["round", "pentagon", "star", "square", "hexagon", "drop"]:
        g = SHAPE_GEM.get(shape)
        d.rows.append(Row(f"{g['name'] if g else shape} coin ({shape}): stone to prismatic, locked",
                          [sprite_cell(f"coin-{shape}-{m}", m, 3, "game", thumb=True) for m in STATE_NAMES],
                          f"`coin-{shape}-<metal|locked>.png`; `gemCoin()` in art/gems.ts", "Header counters, achievements, Ascension, drops (coin metal = gem mastery tier)",
                          "Approved 2026-11-07 (gem coins, #45).", CHROME, "3x (48 x 48 native)"))
    d.rows.append(Row("Mastery medals (still): stone to prismatic", [sprite_cell(f"medal-{i}", m, 3, "game", thumb=True) for i, m in enumerate(STATE_NAMES[:5])],
                      "`medal-0..4.png`; `masteryMedal()` in art/gems.ts", "Floor rail, arena next to the boss, Ascension",
                      "Approved 2026-11-07 (mastery medals, #45).", FRAME, "3x (48 x 48 native)"))
    for i, nm in [(3, "Gold medal motion (shine, twinkle)"), (4, "Prismatic medal motion (holo, shine, twinkle)")]:
        key = f"medal-{i}"
        d.rows.append(Row(nm, cap_cells(key, times(key) + ["reduced-motion still"]), f"live layer `medal-{i}` in art/gems.ts", "Wherever a Gold / Prismatic medal shows", "Captured live.", FRAME, "3x capture"))
    d.rows.append(Row("Starlight coin styles (UI skin, a = starter)", [sprite_cell(f"cos-starlight-{s}", f"style {s}", 3, ref(f"ui-starlight-{s}"), thumb=True) for s in "abcde"],
                      "`cos-starlight-<a..e>.png`; `starlightCoin()` in art/cosmetics.ts; drawn by scripts/art/cosmetics/*.py", "Header chip, Ascension gate, shops (equipped style)",
                      "Beta batch B1, every option kept as a cosmetic (BETA_PLAN 'Decided visuals').", CHROME, "3x (48 x 48 native)"))
    d.rows.append(Row("Card shard icon", [sprite_cell("cos-card-shard", "card shard", 3, "game", thumb=True)], "`cos-card-shard.png`; `cardShardIcon()`", "Achievements shard shop", "Beta batch B6.", CHROME, "3x (32 x 32 native)"))
    glyphs = ["home", "cards", "production", "dungeons", "summon", "skills", "wardrobe", "achievements", "shop", "settings"]
    d.rows.append(Row("Navigation plaques", [sprite_cell(f"plaque-{g}", g, 2, "game") for g in glyphs],
                      "`plaque-<page>.png`; `navPlaque()` in art/gems.ts", "Left rail (shell.ts)",
                      "Approved 2026-11-07 (navigation plaques, #45). In game drawn at 32 css px, i.e. half of the 64 px grid (downscaled, not a whole-number scale).", CHROME, "2x (64 x 64 native)"))
    icon_status = {"material": "game", "portal": "game", "wood": "game", "ore": "game"}
    icons = ["home", "cards", "production", "dungeons", "summon", "skills", "wardrobe", "achievements", "shop", "settings", "wood", "ore", "material", "portal", "starlight"]
    d.rows.append(Row("Line icons (vector, ui-owned)", [Cell(n, capimg(f"icon-{n}"), icon_status.get(n, "unused")) for n in icons],
                      "shell/icons.ts (`icon()`), stroked with currentColor (captured in the starter gold)", "material / portal / wood / ore: currency chips, reward track, achievement offers. Page icons: the rail now shows plaques; starlight: header uses the pixel coin",
                      "Vector line art, not pixel. Page icons are still listed in PAGES but not drawn (rail uses plaques).", CHROME, "3x capture (24 css px)"))
    d.rows.append(Row("Skill tree centre star (vector)", [Cell("centre star", capimg("centre-star"), "game")], "`centreStar()` in ui/skillArt.ts", "Skills page constellation centre",
                      "The only part of the skill tree still in vector (comment in skillArt.ts).", FRAME, "2x capture"))
    sheets.append(d)

    # ---------------- E: tiles and edges ----------------
    e = Sheet("E", "tiles-forged-edges", "Production tiles and forged edges",
              "Tree and mine tiles at the five growth stages (stone to prismatic plinth), and the forged-edge ladder of each damage line.",
              CHROME, "production field chrome #161b26")
    for shape, kind in [("round", "tree"), ("pentagon", "tree"), ("star", "tree"), ("square", "mine"), ("hexagon", "mine"), ("drop", "mine")]:
        g = SHAPE_GEM.get(shape)
        e.rows.append(Row(f"{'Tree' if kind == 'tree' else 'Crystal mine'} tile, {g['name'] if g else shape}: stages 0-4",
                          [sprite_cell(f"tile-{kind}-{shape}-{i}", f"stage {i}", 3, "game", thumb=True) for i in range(5)],
                          f"`tile-{kind}-{shape}-0..4.png`; `{kind}Tile()` in art/gems.ts; drawn in art/vector/tiles.ts", "Production fields, Home mini-stages",
                          "Approved 2026-11-07 (tiles, #45). Brave Frontier pass planned after the beta (BETA_PLAN).", CHROME, "3x (58 x 64 native)"))
    for shape, line in [("square", "Copper"), ("hexagon", "Iron"), ("drop", "Crystal Edge")]:
        e.rows.append(Row(f"Forged edge, {line} line: steps 0-4",
                          [sprite_cell(f"edge-{shape}-{i}", ["bare", "inlaid", "gem-set", "runes", "prismatic"][i], 2, "game") for i in range(5)],
                          f"`edge-{shape}-0..4.png`; `forgedEdge()` in art/gems.ts", "Arena drawer ladder strip, Ascension",
                          "Approved 2026-11-07 (forged edges, #45).", FRAME, "2x (71 x 61 native)"))
    sheets.append(e)

    # ---------------- F: bosses ----------------
    f = Sheet("F", "bosses", "Bosses and the Crystal Sentinel",
              "Each boss: the baked still sprite, three live key frames of its idle effects (aura and particles) and the reduced-motion still; then the Sentinel at each score level and its shards.",
              CHROME, "arena chrome #161b26")
    for art, nm in [("root_warden", "Root Warden (Mossy Cellar)"), ("cinder_lich", "Cinder Lich (Ember Crypt)"), ("glacier_colossus", "Glacier Colossus (Frostspire Vault)"), ("crystal_sentinel", "Crystal Sentinel (Glimmer Trial, score level 2)")]:
        key = f"boss-{art}"
        cells = [sprite_cell(f"boss-{art}", "baked still", 2, "game")]
        cells += cap_cells(key, times(key, ("f0", "f1", "f2")) + ["reduced-motion still"], files=["f0", "f1", "f2", "rm"])
        f.rows.append(Row(nm, cells, f"`boss-{art}.png`; `bossArt()` live layer in art/bosses.ts; drawn in art/vector/bosses.ts",
                          "Dungeons arena, floor portrait, Home fight stage", "Approved 2026-11-07 (bosses, #48). Post-beta: smoother tone shapes on large areas (Lich robe shows tone rings).", CHROME, "2x"))
    f.rows.append(Row("Crystal Sentinel by score level 0-4 (shards light at 25/50/75/100%)", [Cell(f"level {i}", capimg(f"sentinel-{i}"), "game") for i in range(5)],
                      "`bossArt('crystal_sentinel', level)`", "Glimmer Trial", "Captured at t = 1 s.", CHROME, "2x capture"))
    f.rows.append(Row("Sentinel shards", [sprite_cell("boss-shard-dim", "dim", 3, "game", thumb=True), sprite_cell("boss-shard-lit", "lit", 3, "game", thumb=True)],
                      "`boss-shard-dim/lit.png`", "Orbit the Sentinel", "", CHROME, "3x (18 x 28 native)"))
    sheets.append(f)

    # ---------------- G, H: element effects ----------------
    el_cards = [("fire", "Ember Squire, sword"), ("storm", "Storm Duelist, twin blades"), ("light", "Shield Warden, shield"), ("nature", "Grove Keeper, staff"),
                ("earth", "Cave Digger, pickaxe"), ("crystal", "Gem Cutter, chisel"), ("void", "Core Titan, gauntlet")]
    for letter, tier in [("G", "gold"), ("H", "prismatic")]:
        s = Sheet(letter, f"element-effects-{tier}", f"Element effects at {tier.title()} ({'strength 1' if tier == 'gold' else 'strength 2, stronger'})",
                  "The card art window with the item and its element effect (drawn from the item's own outline), four live key frames and the reduced-motion still.",
                  ART, "card art window #0d121b")
        for el, nm in el_cards:
            key = f"fx-{el}-{tier}"
            s.rows.append(Row(f"{el.title()}: {nm}", cap_cells(key, times(key) + ["reduced-motion still"]),
                              "art/fx.ts (`attachElementFx`), fxGeometry.ts; canvases behind and in front of the item", f"Every {el} card at {tier.title()} and above",
                              "Approved 2026-11-07 (effects, #48, P5 C). Uses Math.random (not seeded); the capture seeds it for stable frames.", ART, "2x capture"))
        sheets.append(s)

    # ---------------- I, J: hits, attack slashes, numerals ----------------
    att_meta = meta.get("attacks", {})

    def attack_rows(styles) -> list[Row]:
        rows = []
        for st in styles:
            m = att_meta.get(st, {})
            cells = []
            for lv in range(1, m.get("levels", 4) + 1):
                n = f"cos-atk-{st}-{lv}"
                if not (SPR / f"{n}.png").exists():
                    continue
                sh = spr(n)
                fs = m.get("size", 64)
                grid = Image.new("RGBA", (fs * 2 + 2, fs * 2 + 2), (0, 0, 0, 0))
                for i in range(4):
                    fr = sh.crop((i * fs, 0, (i + 1) * fs, fs))
                    grid.alpha_composite(fr, ((i % 2) * (fs + 2), (i // 2) * (fs + 2)))
                cells.append(Cell(f"L{lv} (4 frames)", up(grid, 2), ref(f"px-slash-{st}-{lv}"), [n]))
            nm = m.get("name") or f"{st.title()} slash"
            rows.append(Row(f"Attack slash: {nm} ({st}, batch {m.get('batch', '?')}), levels",
                            cells, f"`cos-atk-{st}-<level>.png` (4 frames of {m.get('size', 64)} px: snap, held hit, thin, break); played by `pixelSlash()` in theme/effects.ts",
                            "Arena and production hits when the attack cosmetic is equipped", "Each level cell shows the 4 frames as a 2 x 2 grid (read left to right, top to bottom); timing 50/130/90/110 ms.", CHROME, "2x"))
        return rows

    i_sheet = Sheet("I", "hits-attack-slashes-1", "Hit effects and attack slashes I",
                    "Starter hits drawn at run time (key frames), the starter floating numbers, then the baked slash sheets of the garden-set attack cosmetics.",
                    CHROME, "arena chrome #161b26")
    for eff, nm, note in [("slash-sparks", "Slash with sparks (starter fighting / logging)", "thin brush slash, re-rolled every hit"),
                          ("slash-chips", "Slash with chips", "same slash, square wood chips"),
                          ("heavy-hit", "Impact hit (mining, bows)", "star flash, ring, chips")]:
        key = f"hit-{eff}"
        i_sheet.rows.append(Row(nm, cap_cells(key, times(key), files=["f0", "f1", "f2", "f3"]),
                                "`slash()` / `impact()` in theme/effects.ts (canvas, 2 css px per pixel, blurred glow copy)", "Arena and production stages (starter attack cosmetic)",
                                f"Approved 2026-11-07 (hits, #48: thin slash). {note}.", CHROME, "2x capture"))
    i_sheet.rows.append(Row("Floating number, starter text style (normal, crit)", [Cell("normal", capimg("tick-text"), "game"), Cell("crit", capimg("tick-text-crit"), "game")],
                            "`showTick()` in theme/effects.ts + effects.css / stage/numbers.css (text, CSS)", "Every hit and tick without a pixel tick style",
                            "Text in CSS, not pixel art; frozen mid-rise.", CHROME, "2x capture"))
    garden = ["verdant", "vine", "fern", "moss", "blossom"]
    loose = ["forge", "woodcraft", "starmap", "candy", "rune"]
    i_sheet.rows += attack_rows(garden)
    sheets.append(i_sheet)

    j = Sheet("J", "attack-slashes-2-numerals", "Attack slashes II, tick and number styles",
              "The loose-item attack slashes, then the pixel numerals drawn at run time for every tick style and number style level ('+12.4K' and '1.25M').",
              CHROME, "arena chrome #161b26")
    j.rows += attack_rows([s for s in loose if s in att_meta])
    for kind, table, label, slot in [("tick", meta.get("ticks", {}), "Tick style", "tk"), ("num", meta.get("numbers", {}), "Number style", "num")]:
        for st, v in table.items():
            cells = []
            for lv in range(1, v.get("levels", 1) + 1):
                im = capimg(f"{kind}-{st}-{lv}")
                sc = 2 if kind == "tick" else 3  # ticks are drawn with a 2x font already
                cells.append(Cell(f"L{lv}", up(im, sc) if im else None, ref(f"{slot}-{st}-{lv}"), missing="" if im else "not captured"))
            j.rows.append(Row(f"{label}: {v.get('name') or st} ({st})", cells,
                              f"`{'pixelTick' if kind == 'tick' else 'pixelNumber'}()` in art/cosmetics.ts (5 x 7 font, style ramp, `cos-deco-*` motifs)",
                              "Floating ticks (`--bi-tick-px`)" if kind == "tick" else "Pixel numbers (`--bi-num-px`, pixelNumbers.ts)",
                              "Drawn at run time; captured from the canvas at native size.", CHROME, "2x (native canvas)" if kind == "tick" else "3x (native canvas)"))
    sheets.append(j)

    # ---------------- K-O: card cosmetic layers ----------------
    def layer_row(prefix, st, levels, nm, src_note, used, notes, bg) -> Row:
        rid = "bd" if prefix == "bd" else "fn"
        cells = [sprite_cell(f"cos-{prefix}-{st}-{lv}", f"L{lv}", 2, ref(f"{rid}-{st}-{lv}")) for lv in range(1, levels + 1)]
        return Row(nm, cells, src_note, used, notes, bg, "2x (183 x 237 native, card frame grid)")

    bmeta = meta.get("borders", {})
    fmeta = meta.get("finishes", {})
    cosname = {}
    for cm in COSMETICS:
        for lv in cm["levels"]:
            for r in lv.get("recipes", []):
                mm = re.match(r"(bd|fn)-([a-z]+)-\d+", r)
                if mm:
                    cosname[(mm.group(1), mm.group(2))] = cm["name"]
    exclusive = ["heartwood", "antler", "rings", "luna", "wreath"]
    core = ["corepulse", "veins", "hexcore", "strata", "starburst"]

    def blevels(st, table):
        return int(table.get(st, {}).get("levels", 5))

    k = Sheet("K", "borders-garden", "Card borders I: garden sets", "Pixel border layers of the five B2 garden sets at every level (a border layer sits on the card frame grid).", BODY, "card body #2a2f38")
    for st in garden:
        k.rows.append(layer_row("bd", st, blevels(st, bmeta), f"{cosname.get(('bd', st), st)} border ({st})", f"`cos-bd-{st}-<level>.png`; recipe `bd-{st}-<n>` in theme/recipes.css; drawn by scripts/art/cosmetics", "Cards at Gold star 1+ wearing it", "Beta batch B2 (built #68).", BODY))
    sheets.append(k)
    l = Sheet("L", "borders-moonwood", "Card borders II: Moonwood Dryad exclusives", "The five B3 exclusive borders of Moonwood Dryad at every level.", BODY, "card body #2a2f38")
    for st in exclusive:
        l.rows.append(layer_row("bd", st, blevels(st, bmeta), f"{cosname.get(('bd', st), st)} border ({st})", f"`cos-bd-{st}-<level>.png`; recipe `bd-{st}-<n>`", "Moonwood Dryad at Prismatic star 6", "Beta batch B3 (built #68).", BODY))
    sheets.append(l)
    m_ = Sheet("M", "finishes-garden", "Card finishes I: garden sets", "Pixel finish layers (full-card overlays) of the five garden sets at every level.", BODY, "card body #2a2f38")
    for st in garden:
        m_.rows.append(layer_row("fn", st, blevels(st, fmeta), f"{cosname.get(('fn', st), st)} finish ({st})", f"`cos-fn-{st}-<level>.png`; recipe `fn-{st}-<n>`", "Cards at Prismatic star 1+ wearing it", "Beta batch B2.", BODY))
    sheets.append(m_)
    n_ = Sheet("N", "finishes-core-titan", "Card finishes II: Core Titan exclusives", "The five B4 exclusive finishes of Core Titan at levels 1-6.", BODY, "card body #2a2f38")
    for st in core:
        n_.rows.append(layer_row("fn", st, blevels(st, fmeta), f"{cosname.get(('fn', st), st)} finish ({st})", f"`cos-fn-{st}-<level>.png`; recipe `fn-{st}-<n>`", "Core Titan at Prismatic star 6", "Beta batch B4.", BODY))
    sheets.append(n_)
    o = Sheet("O", "borders-loose-corners-pulses", "Loose borders, corner flourishes, finish pulses",
              "The B5 loose-item borders (2 levels each), the five B9 pixel corner flourishes and the three-frame L6 pulse of each Core Titan finish.", BODY, "card body #2a2f38")
    for st in loose:
        o.rows.append(layer_row("bd", st, blevels(st, bmeta), f"{cosname.get(('bd', st), st)} ({st})", f"`cos-bd-{st}-1..2.png`", "Cards at Gold star 1+ wearing it", "Beta batch B5.", BODY))
    o.rows.append(Row("Corner flourishes (max level)", [sprite_cell(f"cos-corner-{s}", s, 2, ref(f"corner-{s}")) for s in ["acanthus", "pauldron", "wings", "shards", "knot"]],
                      "`cos-corner-<shape>.png`; recipe `corner-<shape>`", "Max-level borders (see COSMETIC_ART_IDS.md)", "Beta batch B9.", BODY, "2x"))
    for st in core:
        n = f"cos-fnp-{st}"
        cells = []
        if (SPR / f"{n}.png").exists():
            sh = spr(n)
            fw = sh.width // 3
            cells = [Cell(f"pulse {i + 1}", up(sh.crop((i * fw, 0, (i + 1) * fw, sh.height)), 2), ref(f"fn-{st}-6"), [n]) for i in range(3)]
        o.rows.append(Row(f"{cosname.get(('fn', st), st)} L6 pulse ({st})", cells, f"`{n}.png` (3 frames of 183 x 237)", "Core Titan finish at level 6", "Beta batch B4.", BODY, "2x"))
    sheets.append(o)

    # ---------------- P: CSS-drawn card cosmetics ----------------
    p = Sheet("P", "css-card-cosmetics", "Card cosmetics drawn in CSS (no sprite)",
              "The starter and earlier border / finish cosmetics that are CSS recipes rather than pixel layers, on real cards at every level (borders on Gold star 1, finishes on Prismatic star 1, the exclusive on Prismatic star 6). Ambient motion is frozen.",
              PAGE, "screenshots include their own card")
    css = [("border", "gn_border", 1, "Gilded Nocturne border (starter): knight-plate"), ("border", "gt_border", 5, "Gilded Tradition border"),
           ("border", "gilded_plate", 3, "Gilded Plate border"), ("border", "gilded_filigree", 4, "Gilded Filigree border"),
           ("border", "ember_crown", 5, "Ember Crown border (Dawnblade Regent exclusive)"), ("finish", "gn_finish", 1, "Gilded Nocturne finish (starter, none)"),
           ("finish", "gt_finish", 5, "Gilded Tradition finish"), ("finish", "aurora_veil", 4, "Aurora Veil finish"),
           ("finish", "holo_hex", 3, "Hex holo finish"), ("finish", "holo_waves", 3, "Wave holo finish")]
    names = {cm["id"]: cm["name"] for cm in COSMETICS}
    for slot, cid, lv, nm in css:
        recs = sorted({r for cm in COSMETICS if cm["id"] == cid for l_ in cm["levels"] for r in l_.get("recipes", [])})
        p.rows.append(Row(f"{names.get(cid, nm)} ({cid})", [Cell(f"L{i}", capimg(f"css-{cid}-{i}"), "game") for i in range(1, lv + 1)],
                          f"theme/recipes.css recipes: {', '.join(recs) or 'none (tokens only)'}", f"Cards wearing {cid}",
                          "CSS gradients / shapes (pre-pixel). Particles of `ambient-*` use the `cos-pt-*` pixel sprites (sheet Q).", PAGE, "frame grid 2x"))
    sheets.append(p)

    # ---------------- Q: tables, cursors, particles, decorations ----------------
    q = Sheet("Q", "tables-cursors-particles", "Tables, cursors, particles and decorations",
              "Table tiles (repeated behind the game at 2x), cursors, ambient particle sprites and the small decorations the numerals and particles use.",
              CHROME, "chrome #161b26 (cursors on the table grey)")
    tm = meta.get("tables", {})
    for st in tm:
        q.rows.append(Row(f"Table tile: {cosname.get(('tb', st), st)} ({st})", [sprite_cell(f"cos-tb-{st}-{lv}", f"L{lv}", 2, ref(f"tb-{st}-{lv}")) for lv in range(1, int(tm[st].get("levels", 5)) + 1)],
                          f"`cos-tb-{st}-<level>.png`; recipe `tb-{st}-<n>`", "Page background (table) when equipped", "Beta batch B2. 96 x 48 tile, repeated.", CHROME, "2x (96 x 48 native)"))
    cm_ = meta.get("cursors", {})
    for st in cm_:
        q.rows.append(Row(f"Cursor: {st}", [sprite_cell(f"cos-cur-{st}-{lv}", f"L{lv}", 2, ref(f"cur-{st}-{lv}"), thumb=True, bg=TABLE) for lv in range(1, int(cm_[st].get("levels", 5)) + 1)],
                          f"`cos-cur-{st}-<level>.png`; recipe `cur-{st}-<n>`", "Mouse cursor when equipped", "Beta batch B2. Hotspot at the tip.", TABLE, "2x (44 x 48 native)"))
    q.rows.append(Row("Cursors drawn in CSS (vector data URIs)", [], "theme/recipes.css `cursor-gilded`, `cursor-crimson`, `cursor-prism` (SVG data URIs)",
                      "Starter, Gilded Tradition, Prism Pointer cursors", "Not captured (OS cursor images); vector with a gradient on Prism.", TABLE))
    q.rows.append(Row("Ambient particle sprites", [sprite_cell(f"cos-pt-{s}", s, 3, "game", thumb=True) for s in ["mote", "ember", "glint", "star", "bubble"]],
                      "`cos-pt-*.png`; used by the `ambient-*` recipes", "Max-level border / finish particles", "", BODY, "3x"))
    amb = sorted(pth.stem[len("cos-amb-"):] for pth in SPR.glob("cos-amb-*.png"))
    q.rows.append(Row("Per-style particles (border / finish ambient)", [sprite_cell(f"cos-amb-{s}", s, 3, "game", thumb=True) for s in amb],
                      "`cos-amb-<style>.png`", "Ambient particles of that style's border / finish; also tick petals", "", BODY, "3x"))
    deco = sorted(pth.stem[len("cos-deco-"):] for pth in SPR.glob("cos-deco-*.png"))
    q.rows.append(Row("Numeral decorations", [sprite_cell(f"cos-deco-{s}", s, 3, "game", thumb=True) for s in deco],
                      "`cos-deco-<style>.png`; pasted by `pixelTick()`", "Tick numerals at level 2+ (motifs, gems, dew)", "", CHROME, "3x"))
    sheets.append(q)

    # ---------------- R: stickers ----------------
    r = Sheet("R", "stickers-achievements", "Achievement stickers",
              "The five sticker styles (die-cut base per chapter, plus the locked base) and every achievement picture, lit and grey.",
              FRAME, "achievements page #2a2f38")
    for s in "abcde":
        r.rows.append(Row(f"Sticker style {s}", [sprite_cell(f"cos-sticker-{s}-{ch}", ch, 2, ref(f"ui-sticker-{s}")) for ch in ["gathering", "battle", "cards", "wardrobe", "journey", "locked"]],
                          f"`cos-sticker-{s}-<chapter|locked>.png`; `stickerArt()`", "Achievements sticker book (equipped style)", "Beta batch B6.", FRAME, "2x (74 x 74 native)"))
    ach = sorted({pth.stem[len("cos-ach-"):].removesuffix("-grey") for pth in SPR.glob("cos-ach-*.png")})
    r.rows.append(Row("Achievement pictures (lit / grey)",
                      [c_ for a in ach for c_ in (sprite_cell(f"cos-ach-{a}", a.replace("_", " "), 2, "game"), sprite_cell(f"cos-ach-{a}-grey", "grey", 2, "game"))],
                      "`cos-ach-<id>[-grey].png`; pasted on the sticker by `stickerArt()`", "Achievements page", "Beta batch B6. Pairs: lit then grey.", FRAME, "2x (52 x 52 native)"))
    sheets.append(r)

    # ---------------- S: skill nodes ----------------
    sk = Sheet("S", "skill-nodes-charts", "Skill nodes and star charts",
               "Account tree gems per style (six branches, each locked / open / owned), keystones, and the enhancement star-chart stars and skies.",
               FRAME, "skills page #2a2f38")
    branches = ["logging", "mining", "combat", "luck", "collection", "automation"]
    states = ["locked", "open", "owned"]
    for s in "abcde":
        for kind, nm, sz in [("node", "Nodes", 24), ("key", "Keystones", 32)]:
            sk.rows.append(Row(f"{nm}, style {s}", [sprite_cell(f"cos-{kind}-{s}-{b_}-{st}", f"{b_[:5]} {st}", 3, ref(f"ui-nodes-{s}"), thumb=True) for b_ in branches for st in states],
                               f"`cos-{kind}-{s}-<branch>-<state>.png`; `skillNode()`", "Skills page (equipped nodes style)", "Beta batch B7.", FRAME, f"3x ({sz} x {sz} native)"))
    for s in "abcde":
        sk.rows.append(Row(f"Chart stars, style {s}", [sprite_cell(f"cos-chart-{s}-{st}", st, 3, ref(f"ui-nodes-{s}"), thumb=True) for st in states] + [sprite_cell(f"cos-chartmajor-{s}-{st}", f"major {st}", 3, ref(f"ui-nodes-{s}"), thumb=True) for st in states],
                           f"`cos-chart-{s}-*`, `cos-chartmajor-{s}-*`; `starChart()`", "Card enhancement star chart", "Beta batch B7.", FRAME, "3x"))
    sk.rows.append(Row("Chart skies", [sprite_cell(f"cos-chartsky-{s}", f"style {s}", 2, ref(f"ui-nodes-{s}")) for s in "abcde"],
                       "`cos-chartsky-<style>.png`", "Card enhancement star chart background", "Beta batch B7.", FRAME, "2x (200 x 120 native)"))
    sheets.append(sk)

    # ---------------- T: wardrobe chrome ----------------
    w = Sheet("T", "wardrobe-chrome", "Wardrobe chrome",
              "The wardrobe page pieces per style (a = starter): sockets, plates, tiles, level rungs and links; style e has a version per rarity.",
              FRAME, "wardrobe page #2a2f38")
    parts = ["socket", "plate", "plate-on", "tile", "tile-on", "rung-off", "rung-next", "rung-done", "link", "link-done"]
    for s in "abcd":
        w.rows.append(Row(f"Style {s}", [sprite_cell(f"cos-wd-{s}-{pt}", pt, 3, ref(f"ui-wardrobe-{s}"), thumb=True) for pt in parts],
                          f"`cos-wd-{s}-<part>.png`; `wardrobeChrome()` / `chromeCss()`", "Wardrobe page (equipped style)", "Beta batch B10. Plates and tiles are 9-slice pieces.", FRAME, "3x"))
    w.rows.append(Row("Style e: shared pieces", [sprite_cell(f"cos-wd-e-{pt}", pt, 3, ref("ui-wardrobe-e"), thumb=True) for pt in ["socket", "link", "link-done"]],
                      "`cos-wd-e-<part>.png`", "Wardrobe page", "Beta batch B10.", FRAME, "3x"))
    for pt in ["plate", "plate-on", "tile", "tile-on", "rung-off", "rung-next", "rung-done"]:
        w.rows.append(Row(f"Style e: {pt} by rarity", [sprite_cell(f"cos-wd-e-{pt}-{rr}", rr, 3, ref("ui-wardrobe-e"), thumb=True) for rr in RARITIES],
                          f"`cos-wd-e-{pt}-<rarity>.png`", "Wardrobe page (rarity glass)", "Beta batch B10.", FRAME, "3x"))
    sheets.append(w)
    return sheets


CAPTURES: dict = {}

# ---------------------------------------------------------------------------------------------
# rendering


def text_w(f, s: str) -> int:
    return int(f.getlength(s))


def render_cell(cell: Cell, cid: str, bg, check: dict) -> Image.Image:
    img = cell.img
    aw = img.width if img else 160
    pad = 4 if aw > 200 else 10
    ah = img.height if img else 80
    thumb_h = cell.thumb.height + 12 if cell.thumb is not None else 0
    inner_w = max(aw + 2 * pad, text_w(F_ID, cid) + 4, text_w(F_LABEL, cell.label) + 4, 96, (cell.thumb.width + 16) if cell.thumb is not None else 0)
    panel_h = ah + 2 * pad + thumb_h
    tag_h = 18
    H = 34 + tag_h + panel_h + 26
    out = Image.new("RGBA", (inner_w, H), PAGE + (255,))
    d = ImageDraw.Draw(out)
    d.text((0, 0), cid, font=F_ID, fill=TEXT)
    # tags: usage, then pixel_check
    x = 0
    if cell.status:
        col, txt = TAG[cell.status]
        tw = text_w(F_SMALL, txt) + 10
        d.rounded_rectangle([x, 34, x + tw, 34 + tag_h - 2], 3, fill=col)
        d.text((x + 5, 34), txt, font=F_SMALL, fill=(20, 20, 24))
        x += tw + 4
    warn = [check[n] for n in cell.sprites if n in check and check[n]["status"] != "OK"]
    if warn:
        bad = any(w_["status"] not in ("OK", "WARN") for w_ in warn)
        txt = "CHECK ERR" if bad else "CHECK WARN"
        tw = text_w(F_SMALL, txt) + 10
        if x + tw <= inner_w:
            d.rounded_rectangle([x, 34, x + tw, 34 + tag_h - 2], 3, fill=ERR if bad else WARN)
            d.text((x + 5, 34), txt, font=F_SMALL, fill=(20, 20, 24))
    py = 34 + tag_h
    pbg = cell.bg or bg
    d.rectangle([0, py, inner_w - 1, py + panel_h - 1], fill=pbg + (255,))
    if img:
        layer = Image.new("RGBA", out.size, (0, 0, 0, 0))
        layer.paste(img, ((inner_w - aw) // 2, py + pad))
        out = Image.alpha_composite(out, layer)
        d = ImageDraw.Draw(out)
    else:
        d.text((pad, py + pad + 20), cell.missing or "not available", font=F_LABEL, fill=ERR)
    if cell.thumb is not None:
        ty = py + ah + 2 * pad
        tw_, th_ = cell.thumb.width + 12, cell.thumb.height + 12
        ch = checker(inner_w, th_)
        out.paste(ch, (0, ty))
        out.alpha_composite(cell.thumb, ((inner_w - cell.thumb.width) // 2, ty + 6))
        d = ImageDraw.Draw(out)
    d.text((0, py + panel_h + 3), cell.label, font=F_LABEL, fill=MUTED)
    return out


def wrap(text: str, f, width: int) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for w_ in words:
        t = (cur + " " + w_).strip()
        if text_w(f, t) > width and cur:
            lines.append(cur)
            cur = w_
        else:
            cur = t
    if cur:
        lines.append(cur)
    return lines


def render_row(row: Row, bg, check: dict) -> Image.Image:
    multi = len(row.cells) > 1
    cells = [render_cell(c, f"{row.id}.{i + 1}" if multi else row.id, row.bg or bg, check) for i, c in enumerate(row.cells)]
    gap = 14
    title = f"{row.id}  {row.name}"
    sub = f"scale {row.scale}" if row.scale else ""
    lines_w = MAX_W - 64
    # lay out cells in lines
    lines, cur, cw = [], [], 0
    for im in cells:
        if cur and cw + gap + im.width > lines_w:
            lines.append(cur)
            cur, cw = [], 0
        cw += (gap if cur else 0) + im.width
        cur.append(im)
    if cur:
        lines.append(cur)
    width = max([sum(i.width for i in ln) + gap * (len(ln) - 1) for ln in lines] + [text_w(F_ROW, title) + 20 + text_w(F_LABEL, sub), 300])
    width = min(width, lines_w)
    body_h = sum(max(i.height for i in ln) for ln in lines) + gap * max(0, len(lines) - 1)
    if not row.cells:
        body_h = 26
    H = 40 + body_h + 10
    out = Image.new("RGBA", (width, H), PAGE + (255,))
    d = ImageDraw.Draw(out)
    d.text((0, 0), title, font=F_ROW, fill=TEXT)
    d.text((min(width - text_w(F_LABEL, sub), text_w(F_ROW, title) + 20), 6), sub, font=F_LABEL, fill=MUTED)
    d.line([0, 33, width, 33], fill=RULE, width=2)
    y = 40
    if not row.cells:
        d.text((0, y), row.notes, font=F_LABEL, fill=MUTED)
    for ln in lines:
        x = 0
        for im in ln:
            out.paste(im, (x, y))
            x += im.width + gap
        y += max(i.height for i in ln) + gap
    return out


def render_sheet(sh: Sheet, check: dict) -> Image.Image:
    M = 32
    blocks = [render_row(r, sh.bg, check) for r in sh.rows]
    # flow row blocks left to right when they fit
    lines, cur, cw = [], [], 0
    for b in blocks:
        if cur and cw + BGAP + b.width > MAX_W - 2 * M:
            lines.append(cur)
            cur, cw = [], 0
        cw += (BGAP if cur else 0) + b.width
        cur.append(b)
    if cur:
        lines.append(cur)
    content_w = max(sum(b.width for b in ln) + BGAP * (len(ln) - 1) for ln in lines)
    W = max(content_w + 2 * M, 1400)
    head = [f"{sh.letter}  {sh.title}"]
    blurb = wrap(sh.blurb, F_BODY, W - 2 * M)
    legend = (f"IDs: {sh.letter}NN = one asset (row), {sh.letter}NN.n = one variant (cell). Cell background = in-game colour behind the asset ({sh.bg_name}) unless noted. "
              "Scale per row in its header; every scale is whole-number nearest neighbour. Small sprites add a 1x copy on a checker strip. "
              "Tags: IN GAME = shown in normal play; GALLERY ONLY = only in the dev gallery; UNUSED = not reachable now; CHECK WARN = pixel_check warning (see index.md).")
    leg = wrap(legend, F_LABEL, W - 2 * M)
    header_h = 70 + 26 * len(blurb) + 22 * len(leg) + 24
    body_h = sum(max(b.height for b in ln) for ln in lines) + 28 * (len(lines) - 1)
    out = Image.new("RGBA", (W, header_h + body_h + 2 * M), PAGE + (255,))
    d = ImageDraw.Draw(out)
    d.text((M, M - 6), head[0], font=F_TITLE, fill=TEXT)
    y = M + 60
    for ln in blurb:
        d.text((M, y), ln, font=F_BODY, fill=TEXT)
        y += 26
    y += 4
    for ln in leg:
        d.text((M, y), ln, font=F_LABEL, fill=MUTED)
        y += 22
    y = header_h + M - 10
    d.line([M, y - 12, W - M, y - 12], fill=(200, 170, 90), width=3)
    for ln in lines:
        x = M
        for b in ln:
            out.paste(b, (x, y))
            x += b.width + BGAP
        y += max(b.height for b in ln) + 28
    return out.convert("RGB")


# ---------------------------------------------------------------------------------------------
# index.md


def md_escape(s: str) -> str:
    return s.replace("|", "\\|").replace("\n", " ")


def write_index(sheets: list[Sheet], check: dict, files: dict[str, str], covered: set[str]) -> None:
    total_rows = sum(len(s.rows) for s in sheets)
    total_cells = sum(max(1, len(r.cells)) for s in sheets for r in s.rows)
    sprites_all = sorted(p.stem for p in SPR.glob("*.png"))
    missing = [n for n in sprites_all if n not in covered]
    L = []
    L.append("# Graphics overhaul review: index\n")
    L.append("Every graphic the game draws, on review sheets with short IDs, so each one can be judged (`A03 good, A04 redo, C12.2 bad`). "
             "Generated by `build_sheets.py` (do not edit by hand; re-run it after a redraw). Draft material only: nothing here is approved art.\n")
    L.append(f"- Sheets: {len(sheets)}; asset rows (base IDs): {total_rows}; cells (variant IDs): {total_cells}.")
    L.append(f"- Baked sprites in `src/renderer/src/art/pixel/sprites/`: {len(sprites_all)}, of which {len(sprites_all) - len(missing)} appear on a sheet" + (f" (not on a sheet: {', '.join(missing)})" if missing else "") + ".")
    L.append("- Tags on cells: **IN GAME** shown in normal play; **GALLERY ONLY** only in the dev gallery (`#gallery`); **UNUSED** not reachable with current data; **CHECK WARN** pixel_check warning (table at the end).")
    L.append("- Captured art (live layers, effects, CSS, vector) comes from `tools/capture.mjs`, which renders the real renderer modules in headless Chromium with a fake clock; times on the cells are seconds after mounting.")
    L.append("- `art/vector/*.ts` are the source drawings the sprites are baked from (`bake.ts`); they are not drawn in the game, so they are not separate rows.\n")
    L.append("| Sheet | File | Covers | IDs |\n| --- | --- | --- | --- |")
    for s in sheets:
        L.append(f"| {s.letter} | [{files[s.letter]}]({files[s.letter]}) | {md_escape(s.title)} | {s.letter}01-{s.letter}{len(s.rows):02d} ({sum(max(1, len(r.cells)) for r in s.rows)} cells) |")
    L.append("")
    for s in sheets:
        L.append(f"## {s.letter}: {s.title}\n")
        L.append(f"![{s.letter}]({files[s.letter]})\n")
        L.append(md_escape(s.blurb) + "\n")
        L.append("| ID | Asset | Cells | Source | Used in game | Notes |\n| --- | --- | --- | --- | --- | --- |")
        for r in s.rows:
            cells = ", ".join(f"{r.id}.{i + 1} {c.label}" for i, c in enumerate(r.cells)) if len(r.cells) > 1 else (r.cells[0].label if r.cells else "not captured")
            st = sorted({c.status for c in r.cells if c.status})
            used = r.used + (f" [{'/'.join(st)}]" if st else "")
            warn = [n for c in r.cells for n in c.sprites if n in check and check[n]["status"] != "OK"]
            notes = r.notes + (f" pixel_check warnings on {len(warn)} sprite(s)." if warn else "")
            L.append(f"| {r.id} | {md_escape(r.name)} | {md_escape(cells)} | {md_escape(r.source)} | {md_escape(used)} | {md_escape(notes)} |")
        L.append("")
    # pixel check
    errs = {n: c for n, c in check.items() if c["status"] not in ("OK", "WARN")}
    warns = {n: c for n, c in check.items() if c["status"] == "WARN"}
    L.append("## pixel_check results\n")
    L.append(f"`pixel_check.py` over all {len(check)} baked sprites (default options): **{len(errs)} with errors**, **{len(warns)} with warnings**, {len(check) - len(errs) - len(warns)} OK. "
             "Warnings are factual flags for the review, not fixes: 'orphan px' = a pixel matching none of its 8 neighbours (not a white glint); 'edge px not ink/rim' = outline pixels that are neither the ink colour nor a light rim (possible outline gaps; expected on stickers with a coloured ring). Raw output: `_captures/pixel_check.txt`.\n")
    where = {}
    for s in sheets:
        for r in s.rows:
            for i, c in enumerate(r.cells):
                for n in c.sprites:
                    where.setdefault(n, f"{r.id}.{i + 1}" if len(r.cells) > 1 else r.id)
    L.append("| Sprite | ID | Status | Colours | Findings |\n| --- | --- | --- | --- | --- |")
    for n, c in sorted({**errs, **warns}.items()):
        L.append(f"| `{n}` | {where.get(n, '-')} | {c['status']} | {c['colours']} | {md_escape(check_summary(c))} |")
    L.append("")
    (HERE / "index.md").write_text("\n".join(L) + "\n", encoding="utf-8")


# ---------------------------------------------------------------------------------------------


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-capture", action="store_true")
    ap.add_argument("--only", default="")
    a = ap.parse_args()
    if not a.no_capture:
        subprocess.run(["node", str(HERE / "tools" / "capture.mjs")], check=True, cwd=ROOT)
    man = json.loads((CAP / "captures.json").read_text(encoding="utf-8"))
    CAPTURES.update(man["captures"])
    check = run_check()
    sheets = build_catalogue(man.get("tokens") or {}, man.get("meta") or {})
    covered = set()
    files = {}
    for s in sheets:
        for i, r in enumerate(s.rows):
            r.id = f"{s.letter}{i + 1:02d}"
            for c in r.cells:
                covered.update(c.sprites)
        files[s.letter] = f"sheet-{s.letter}-{s.slug}.png"
    only = {x.strip().upper() for x in a.only.split(",") if x.strip()}
    for s in sheets:
        if only and s.letter not in only:
            continue
        im = render_sheet(s, check)
        im.save(HERE / files[s.letter], optimize=True)
        print(f"{files[s.letter]}: {im.width} x {im.height}, {len(s.rows)} rows")
    write_index(sheets, check, files, covered)
    print("index.md written")


if __name__ == "__main__":
    main()
