"""Before / after sheet for concept sheet 1: one section per group (coins, medals, maul, bow, uniques,
and the Starlight stickers that are drawn on the round coins), the old sprite above the new one, at
1x and at 3x (nearest neighbour), on the game's dark panel colour. Card items sit on their rarity's
window colour, as in a card.

Usage: py design/pixel/concept-sheet-1/before_after.py <old cosmetic dir> <out.png>
(old sprites come from design/pixel/concept-sheet-1/old/, the old Starlight stickers from git, e.g.
`git show main:src/renderer/src/art/pixel/sprites/cos-starlight-a.png`).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
import post  # noqa: E402

HERE = Path(__file__).resolve().parent
NEW = post.ROOT / "src/renderer/src/art/pixel/sprites"
OLD = HERE / "old"
BG = (30, 33, 46)
TEXT = (226, 230, 240)
DIM = (150, 156, 176)
WARN = (255, 196, 92)
BIG = 3
PAD = 14


def font(size: int, bold: bool = False):
    for name in ("segoeuib.ttf" if bold else "segoeui.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


F_H1, F_H2, F_L, F_S = font(26, True), font(17, True), font(14), font(12)


def load(p: Path) -> Image.Image:
    return Image.open(p).convert("RGBA")


def tile(im: Image.Image, scale: int, window=None) -> Image.Image:
    big = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
    out = Image.new("RGBA", big.size, window or BG)
    out.alpha_composite(big)
    return out


class Sheet:
    def __init__(self, width: int):
        self.w = width
        self.blocks: list[Image.Image] = []

    def text(self, s: str, f, colour=TEXT, h=None):
        im = Image.new("RGBA", (self.w, h or f.size + 12), BG)
        ImageDraw.Draw(im).text((PAD, 4), s, font=f, fill=colour)
        self.blocks.append(im)

    def row(self, cols: list[dict]):
        """cols: {label, note, old, new, window}; old/new may be None."""
        cw = max(c["new"].width for c in cols) * BIG + 2 * PAD
        one = max(c["new"].width for c in cols)
        h1 = max(c["new"].height for c in cols)
        lab = 44
        h = lab + 2 * (h1 * BIG + 8) + 2 * (h1 + 6) + 30
        im = Image.new("RGBA", (max(self.w, PAD * 2 + 70 + cw * len(cols)), h), BG)
        d = ImageDraw.Draw(im)
        d.text((PAD, lab + h1 * BIG // 2 - 8), "old", font=F_L, fill=DIM)
        d.text((PAD, lab + h1 * BIG + 8 + h1 * BIG // 2 - 8), "new", font=F_L, fill=TEXT)
        d.text((PAD, lab + 2 * (h1 * BIG + 8) + 4), "1x", font=F_S, fill=DIM)
        for i, c in enumerate(cols):
            x = PAD + 70 + i * cw
            d.text((x, 2), c["label"], font=F_L, fill=TEXT)
            if c.get("note"):
                d.text((x, 21), c["note"], font=F_S, fill=WARN if c.get("flag") else DIM)
            y = lab
            for which in ("old", "new"):
                if c.get(which) is not None:
                    im.alpha_composite(tile(c[which], BIG, c.get("window")), (x, y))
                else:
                    d.text((x + 6, y + 6), "(none before)", font=F_S, fill=DIM)
                y += h1 * BIG + 8
            for k, which in enumerate(("old", "new")):
                if c.get(which) is not None:
                    im.alpha_composite(tile(c[which], 1, c.get("window")), (x + k * (one + 8), y))
        self.blocks.append(im)

    def save(self, path: Path):
        w = max(b.width for b in self.blocks)
        out = Image.new("RGBA", (w, sum(b.height for b in self.blocks) + PAD), BG)
        y = 0
        for b in self.blocks:
            out.alpha_composite(b, (0, y))
            y += b.height
        out.convert("RGB").save(path)


def window(rarity: str):
    return (*post.hexrgb(post.RARITY_WINDOW[rarity]), 255)


def main() -> None:
    old_cos = Path(sys.argv[1])
    out = Path(sys.argv[2])
    s = Sheet(2300)
    s.text("Concept sheet 1 -> game sprites (PixelLab image_to_pixelart, faithful)", F_H1, h=46)
    s.text(
        "Old sprite above, new below, 3x and 1x, same pixel size as before. Orange notes: gap-filled "
        "(no concept column; PixelLab img2img from the step below) or extrapolated.",
        F_L,
        DIM,
    )

    # coins
    letter = {"stone": "F", "bronze": "B", "silver": "S", "gold": "G", "prism": "V", "locked": "void"}
    tiers = ["stone", "bronze", "silver", "gold", "prism", "locked"]
    s.text("Gem coins (48 x 48): concept coin per mastery tier, the resource's gem kept in the centre", F_H2, h=40)
    s.row(
        [
            {
                "label": f"round {t}",
                "note": f"<- concept '{letter[t]}' coin",
                "old": load(OLD / f"coin-round-{t}.png"),
                "new": load(NEW / f"coin-round-{t}.png"),
            }
            for t in tiers
        ]
    )
    s.text(
        "Concept-faithful round coins as converted (lettered, no gem). NOT used: the letter would "
        "replace the gem that tells the resources apart.",
        F_L,
        DIM,
    )
    s.row(
        [
            {
                "label": f"'{letter[t]}' coin",
                "note": "as converted",
                "old": None,
                "new": load(HERE / "work" / f"{post.COINS[t]}.png"),
            }
            for t in tiers
        ]
    )
    for shape in ("square", "hexagon", "pentagon", "star", "drop"):
        s.row(
            [
                {
                    "label": f"{shape} {t}",
                    "note": "extrapolated",
                    "flag": True,
                    "old": load(OLD / f"coin-{shape}-{t}.png"),
                    "new": load(NEW / f"coin-{shape}-{t}.png"),
                }
                for t in tiers
            ]
        )

    # medals
    s.text("Mastery medals (48 x 48): boss kills 0 / 10 / 100 / 1,000 / 10,000", F_H2, h=40)
    layout = json.loads((HERE / "layout.json").read_text())
    unused = post.ring(post.treat(post.cut(Image.open(HERE / "pixellab/small.png"), layout["small"], "star-5"), 10), post.WHITE)
    names = {0: "stone", 1: "bronze", 2: "silver", 3: "gold", 4: "prismatic"}
    cols = [
        {
            "label": f"medal-{t} {names[t]}",
            "note": f"<- concept {post.MEDALS[t]}",
            "old": load(OLD / f"medal-{t}.png"),
            "new": load(NEW / f"medal-{t}.png"),
        }
        for t in range(5)
    ]
    cols.append({"label": "star-5 (purple)", "note": "unused", "flag": True, "old": None,
                 "new": Image.fromarray(unused, "RGBA")})
    s.row(cols)

    # card items
    for kind, table, title in (
        ("maul", post.MAUL, "Maul (100 x 120): concept hammer ladder, steps 1-6, one rarity each"),
        ("bow", post.BOW, "Bow (100 x 120): concept bow ladder, first five bows"),
    ):
        s.text(title, F_H2, h=40)
        s.row(
            [
                {
                    "label": f"{kind} {r}",
                    "note": "gap-filled" if src.startswith("gap:") else f"<- concept {src}",
                    "flag": src.startswith("gap:"),
                    "old": load(OLD / f"item-{kind}-{r}.png"),
                    "new": load(NEW / f"item-{kind}-{r}.png"),
                    "window": window(r),
                }
                for r, src in table.items()
            ]
        )

    # uniques
    s.text("Unique weapons (100 x 120): same slot; the live flame / soul-fire motion still plays on top", F_H2, h=40)
    s.row(
        [
            {
                "label": evo,
                "note": "<- concept unique",
                "old": load(OLD / f"evo-{evo}.png"),
                "new": load(NEW / f"evo-{evo}.png"),
                "window": window(rarity),
            }
            for evo, rarity in (("flameblade", "legendary"), ("soul_reaper", "void"))
        ]
    )

    # knock-on
    s.text("Knock-on: Starlight stickers are drawn on the round coin's rim, so they follow the new coins", F_H2, h=40)
    s.row(
        [
            {
                "label": f"cos-starlight-{x}",
                "note": "follows the coin",
                "old": load(old_cos / f"cos-starlight-{x}.png"),
                "new": load(NEW / f"cos-starlight-{x}.png"),
            }
            for x in "abde"
        ]
    )
    s.save(out)


if __name__ == "__main__":
    main()
