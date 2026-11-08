"""Contact sheets of the restyled rollout: for each ladder, the old in-game sprites above the new
ones (3x on the card window colours, with a 1x copy of the new one), each with bbox, opaque mass and
colour count underneath. Coins and medals are laid out per tier and shape.

Usage: py design/pixel/concept-sheet-1-new/contact_rollout.py <table.json>
Writes contact-restyled-<group>.png and restyled/numbers.md.
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
OUT = HERE / "restyled"
_fp = importlib.util.spec_from_file_location("footprint", HERE / "footprint.py")
F = importlib.util.module_from_spec(_fp)
_fp.loader.exec_module(F)
RAR = ["common", "rare", "epic", "legendary", "mythic", "exotic", "void"]
WIN = {"common": "#2a303c", "rare": "#16294d", "epic": "#2c1a4f", "legendary": "#4a2b0d", "mythic": "#1d0d19",
       "exotic": "#1f1108", "void": "#120d1c"}
BG = (30, 33, 46)
OLD_COIN = Path(__file__).resolve().parents[1] / "concept-sheet-1" / "old"
S = 3
f = ImageFont.truetype("segoeui.ttf", 12)


def tile(p: Path, win: str | None, s: int) -> Image.Image:
    im = Image.open(p).convert("RGBA")
    t = Image.new("RGBA", (im.width * s, im.height * s), win or (0, 0, 0, 0))
    t.alpha_composite(im.resize((im.width * s, im.height * s), Image.NEAREST))
    return t


def label(m: dict) -> str:
    return f"{m['bbox']} m{m['mass']} c{m['tones']}"


def sheet(rows: list[list[tuple[str, Path, str | None]]], path: Path, title: str, lines: list[str]) -> None:
    cw = max(Image.open(p).width for r in rows for _, p, _ in r) * S + 10
    ch = max(Image.open(p).height for r in rows for _, p, _ in r) * S + 34
    img = Image.new("RGB", (cw * max(len(r) for r in rows) + 8, ch * len(rows) + 28), BG)
    d = ImageDraw.Draw(img)
    d.text((6, 4), title, font=ImageFont.truetype("segoeuib.ttf", 15), fill=(226, 230, 240))
    for y, r in enumerate(rows):
        for x, (lab, p, win) in enumerate(r):
            m = F.metrics(p)
            img.paste(tile(p, win, S), (x * cw + 4, 28 + y * ch + 14))
            d.text((x * cw + 4, 28 + y * ch), lab, font=f, fill=(226, 230, 240))
            d.text((x * cw + 4, 28 + y * ch + 14 + Image.open(p).height * S + 2), label(m), font=f, fill=(150, 156, 176))
            lines.append(f"| {lab} | {m['bbox']} | {m['mass']} | {m['tones']} | {m['isolated%']} |")
    img.save(path)


def main() -> None:
    table = json.loads(Path(sys.argv[1]).read_text())
    spr = HERE.parents[2] / "src/renderer/src/art/pixel/sprites"
    lines = ["| Sprite | bbox | mass | colours | isolated % |", "|---|---|---|---|---|"]
    for kind in ("katana", "book", "staff", "maul", "bow"):
        rows = [
            [(f"old {r}", Path(table[f"item-{kind}-{r}"]["old"]), WIN[r]) for r in RAR],
            [(f"new {r}", OUT / "items" / f"item-{kind}-{r}.png", WIN[r]) for r in RAR],
        ]
        if kind == "book":  # there was no book before: the shield row was only a size reference, so it is not shown
            rows = rows[1:]
        sheet(rows, HERE / f"contact-restyled-{kind}.png",
              f"{kind} ladder, 3x" if kind == "book" else f"{kind} ladder: old (above) and restyled, 3x", lines)
    rows = [[(f"old {n[4:]}", Path(table[n]["old"]), WIN["legendary" if n != "evo-soul_reaper" and n != "evo-twin_daggers" else "void"]),
             (f"new {n[4:]}", OUT / "uniques" / f"{n}.png", WIN["legendary" if n in ("evo-flameblade", "evo-bronze_hammer") else "void"])]
            for n in ("evo-flameblade", "evo-soul_reaper", "evo-twin_daggers", "evo-bronze_hammer")]
    sheet(rows, HERE / "contact-restyled-uniques.png", "Uniques: old counterpart and restyled, 3x", lines)
    tiers = ["stone", "bronze", "silver", "gold", "prism", "locked"]
    rows = []
    for shape in ("round", "square", "star"):
        rows.append([(f"old {shape} {t}", OLD_COIN / f"coin-{shape}-{t}.png", None) for t in tiers])
        rows.append([(f"new {shape} {t}", OUT / "coins" / f"coin-{shape}-{t}.png", None) for t in tiers])
    sheet(rows, HERE / "contact-restyled-coins.png", "Coins (round, square, star shown; hexagon, pentagon, drop are in coins/), 3x", lines)
    rows = [[(f"old medal-{t}", OLD_COIN / f"medal-{t}.png", None) for t in range(5)],
            [(f"new medal-{t}", OUT / "medals" / f"medal-{t}.png", None) for t in range(5)]]
    sheet(rows, HERE / "contact-restyled-medals.png", "Mastery medals, 3x", lines)
    (OUT / "numbers.md").write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
